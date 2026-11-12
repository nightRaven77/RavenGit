use crate::{
    changes::{self, MutationResult},
    git::{self, GitError, Repository, Result},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

const RESTORE_DIR_NAME: &str = "ravengit-restore";
const MAX_FILE_SIZE: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub token: String,
    pub path: String,
    pub diff: String,
    pub current_content: String,
    pub target_content: String,
    pub is_redo: bool,
    pub backup_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub result: MutationResult,
    pub backup: String,
    pub is_redo: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreStatus {
    pub can_restore: bool,
    pub can_redo: bool,
    pub last_backup: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupMetadata {
    id: String,
    path: String,
    original_sha256: String,
    target_sha256: String,
    is_redo: bool,
    timestamp: u64,
}

fn error(code: &'static str, message: impl Into<String>) -> GitError {
    GitError::new(code, message)
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn git_dir(repo: &Repository) -> Result<PathBuf> {
    let raw = git::text(&repo.path, &["rev-parse", "--absolute-git-dir"])?;
    let path = PathBuf::from(raw.trim_end_matches(['\r', '\n']));
    path.canonicalize()
        .map_err(|_| error("GIT_DIR", "No se pudo localizar la carpeta Git."))
}

fn restore_root(repo: &Repository) -> Result<PathBuf> {
    let dir = git_dir(repo)?.join(RESTORE_DIR_NAME);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|_| {
            error(
                "RESTORE_IO",
                "No se pudo crear la carpeta de respaldos de restauración.",
            )
        })?;
    }
    Ok(dir)
}

fn slugify(path: &str) -> String {
    path.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

fn latest_backup(repo: &Repository, path: &str) -> Option<(PathBuf, BackupMetadata)> {
    let root = restore_root(repo).ok()?;
    let entries = fs::read_dir(&root).ok()?;
    let mut matching = Vec::new();
    for entry in entries.flatten() {
        let sub = entry.path();
        if !sub.is_dir() {
            continue;
        }
        let meta_path = sub.join("metadata.json");
        let content_path = sub.join("backup_content");
        if !meta_path.is_file() || !content_path.is_file() {
            continue;
        }
        let parsed: Option<BackupMetadata> = fs::read_to_string(&meta_path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok());
        if let Some(meta) = parsed.filter(|m| m.path == path) {
            matching.push((sub, meta));
        }
    }
    matching.sort_by_key(|a| std::cmp::Reverse(a.1.timestamp));
    matching.into_iter().next()
}

pub fn check_status(repo: &Repository, path: &str, trusted: bool) -> Result<RestoreStatus> {
    if !trusted {
        return Ok(RestoreStatus {
            can_restore: false,
            can_redo: false,
            last_backup: None,
        });
    }
    let state = changes::read(repo, true)?;
    let entry = state.entries.iter().find(|e| e.path == path);
    let can_restore = entry.is_some_and(|e| !e.untracked && e.worktree_status != ' ');
    let latest = latest_backup(repo, path);
    let can_redo = latest.is_some();
    let last_backup = latest.map(|(_, m)| m.id);
    Ok(RestoreStatus {
        can_restore,
        can_redo,
        last_backup,
    })
}

pub fn preview(repo: &Repository, path: &str, is_redo: bool, trusted: bool) -> Result<Plan> {
    if !trusted {
        return Err(error(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de modificar el árbol de trabajo.",
        ));
    }
    let full = changes::validated_path(repo, path)?;
    let git_dir_path = git_dir(repo)?;
    if git_dir_path.join("index.lock").exists() {
        return Err(error(
            "INDEX_LOCKED",
            "El índice Git está bloqueado por otro proceso.",
        ));
    }
    let state = changes::read(repo, true)?;

    let current_bytes = if full.exists() {
        let meta = fs::symlink_metadata(&full)
            .map_err(|_| error("FILE_READ", "No se pudo obtener información del archivo."))?;
        if meta.file_type().is_symlink() || meta.is_dir() {
            return Err(error(
                "UNSUPPORTED_TYPE",
                "Sólo se admiten archivos regulares para restauración.",
            ));
        }
        if meta.len() > MAX_FILE_SIZE as u64 {
            return Err(error(
                "FILE_LIMIT",
                "El archivo supera el límite de 64 MiB.",
            ));
        }
        fs::read(&full).map_err(|_| error("FILE_READ", "No se pudo leer el archivo actual."))?
    } else {
        Vec::new()
    };

    let (target_bytes, backup_id, diff_text) = if !is_redo {
        let entry = state
            .entries
            .iter()
            .find(|e| e.path == path)
            .ok_or_else(|| {
                error(
                    "NOT_FOUND",
                    "El archivo no figura en los cambios de trabajo.",
                )
            })?;
        if entry.untracked {
            return Err(error(
                "UNTRACKED_FILE",
                "Los archivos sin seguimiento no admiten restauración del índice.",
            ));
        }
        if entry.worktree_status == ' ' {
            return Err(error(
                "NO_CHANGES",
                "El archivo no tiene modificaciones en el árbol de trabajo que restaurar.",
            ));
        }

        // Obtener contenido del índice
        let index_content = git::run(&repo.path, &["show", &format!(":{path}")])
            .or_else(|_| git::run(&repo.path, &["show", &format!("HEAD:{path}")]))
            .map_err(|_| {
                error(
                    "INDEX_READ",
                    "No se pudo leer la versión registrada del archivo.",
                )
            })?;

        if current_bytes == index_content {
            return Err(error(
                "ALREADY_RESTORED",
                "El archivo actual ya coincide exactamente con la versión del índice.",
            ));
        }

        let diff_bytes = git::run(&repo.path, &["diff", "--", path]).unwrap_or_default();
        let diff_str = String::from_utf8_lossy(&diff_bytes).to_string();

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| error("TIME", "Error de reloj de sistema."))?
            .as_nanos() as u64;
        let id = format!("ravengit-restore-{}-{}", slugify(path), timestamp);

        (index_content, id, diff_str)
    } else {
        // Redo: recuperar del último respaldo
        let (backup_dir, meta) = latest_backup(repo, path).ok_or_else(|| {
            error(
                "NO_BACKUP",
                "No hay ninguna copia de seguridad disponible para rehacer este archivo.",
            )
        })?;
        let backup_file = backup_dir.join("backup_content");
        let content = fs::read(&backup_file)
            .map_err(|_| error("BACKUP_READ", "No se pudo leer el contenido del respaldo."))?;

        if current_bytes == content {
            return Err(error(
                "ALREADY_APPLIED",
                "El archivo actual ya contiene los cambios del respaldo.",
            ));
        }

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| error("TIME", "Error de reloj de sistema."))?
            .as_nanos() as u64;
        let id = format!("ravengit-redo-{}-{}", slugify(path), timestamp);

        let diff_str = format!(
            "--- a/{path} (actual)\n+++ b/{path} (respaldo {})\n@@ contenido respaldado @@\n",
            meta.id
        );

        (content, id, diff_str)
    };

    let current_hash = hash_bytes(&current_bytes);
    let target_hash = hash_bytes(&target_bytes);

    let mut token_hasher = Sha256::new();
    token_hasher.update(state.token.as_bytes());
    token_hasher.update(path.as_bytes());
    token_hasher.update(current_hash.as_bytes());
    token_hasher.update(target_hash.as_bytes());
    token_hasher.update([if is_redo { 1u8 } else { 0u8 }]);
    let token = format!("{:x}", token_hasher.finalize());

    let current_content_str =
        String::from_utf8(current_bytes).unwrap_or_else(|_| "(Contenido binario)".into());
    let target_content_str =
        String::from_utf8(target_bytes).unwrap_or_else(|_| "(Contenido binario)".into());

    Ok(Plan {
        token,
        path: path.to_string(),
        diff: diff_text,
        current_content: current_content_str,
        target_content: target_content_str,
        is_redo,
        backup_id,
    })
}

pub fn execute(repo: &Repository, plan: Plan, trusted: bool) -> Result<Outcome> {
    if !trusted {
        return Err(error(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de modificar el árbol de trabajo.",
        ));
    }

    // Comprobación de obsolescencia
    let fresh = preview(repo, &plan.path, plan.is_redo, trusted)?;
    if fresh.token != plan.token {
        return Err(error(
            "STALE_RESTORE",
            "El archivo o repositorio cambió desde la vista previa. Actualiza antes de continuar.",
        ));
    }

    let full = changes::validated_path(repo, &plan.path)?;
    let root = restore_root(repo)?;
    let backup_dir = root.join(&plan.backup_id);
    fs::create_dir_all(&backup_dir).map_err(|_| {
        error(
            "RESTORE_IO",
            "No se pudo crear la carpeta de copia de seguridad.",
        )
    })?;

    let current_bytes = if full.exists() {
        fs::read(&full).map_err(|_| error("FILE_READ", "No se pudo leer el archivo original."))?
    } else {
        Vec::new()
    };
    let target_bytes = plan.target_content.as_bytes();

    // Guardar copia de seguridad
    let backup_content_path = backup_dir.join("backup_content");
    let mut bf = File::create(&backup_content_path)
        .map_err(|_| error("BACKUP_WRITE", "No se pudo guardar el archivo de respaldo."))?;
    bf.write_all(&current_bytes)
        .and_then(|_| bf.sync_all())
        .map_err(|_| {
            error(
                "BACKUP_WRITE",
                "No se pudo escribir el archivo de respaldo.",
            )
        })?;

    let meta = BackupMetadata {
        id: plan.backup_id.clone(),
        path: plan.path.clone(),
        original_sha256: hash_bytes(&current_bytes),
        target_sha256: hash_bytes(target_bytes),
        is_redo: plan.is_redo,
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| error("TIME", "Error de reloj de sistema."))?
            .as_secs(),
    };
    let meta_json = serde_json::to_string_pretty(&meta).map_err(|_| {
        error(
            "BACKUP_WRITE",
            "No se pudieron serializar los metadatos de respaldo.",
        )
    })?;
    fs::write(backup_dir.join("metadata.json"), meta_json).map_err(|_| {
        error(
            "BACKUP_WRITE",
            "No se pudieron escribir los metadatos de respaldo.",
        )
    })?;

    // Escribir archivo de destino en el árbol de trabajo
    if target_bytes.is_empty() && !plan.is_redo {
        // Si el archivo no existía en el índice (caso de eliminación o vacío)
        let mut tf = File::create(&full)
            .map_err(|_| error("RESTORE_WRITE", "No se pudo actualizar el archivo."))?;
        tf.write_all(target_bytes)
            .and_then(|_| tf.sync_all())
            .map_err(|_| error("RESTORE_WRITE", "No se pudo sincronizar el archivo."))?;
    } else {
        let parent = full
            .parent()
            .ok_or_else(|| error("PATH", "Ruta sin directorio padre."))?;
        let temp_path = parent.join(format!(".ravengit-tmp-{}", plan.backup_id));
        let mut tf = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&temp_path)
            .map_err(|_| {
                error(
                    "RESTORE_WRITE",
                    "No se pudo crear archivo temporal de restauración.",
                )
            })?;
        tf.write_all(target_bytes)
            .and_then(|_| tf.sync_all())
            .map_err(|_| {
                error(
                    "RESTORE_WRITE",
                    "No se pudo escribir archivo temporal de restauración.",
                )
            })?;
        drop(tf);

        fs::rename(&temp_path, &full)
            .or_else(|_| {
                // En Windows a veces rename sobre un archivo existente requiere remove previo
                let _ = fs::remove_file(&full);
                fs::rename(&temp_path, &full)
            })
            .map_err(|_| {
                error(
                    "RESTORE_WRITE",
                    "No se pudo reemplazar el archivo con la versión restaurada.",
                )
            })?;
    }

    let updated_changes = changes::read(repo, true).ok();
    let message = if plan.is_redo {
        "Cambios rehechos exitosamente desde el respaldo.".to_string()
    } else {
        "Archivo restaurado con éxito. Se guardó una copia de seguridad para rehacer.".to_string()
    };

    Ok(Outcome {
        result: MutationResult {
            commit_hash: None,
            changes: updated_changes,
            warning: None,
        },
        backup: plan.backup_id,
        is_redo: plan.is_redo,
        message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);

    struct Fixture(Repository);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "ravengit-restore-test-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            let repo = Repository {
                id: "test-restore".into(),
                path,
            };
            let f = Self(repo);
            f.git(&["init", "-b", "main"]);
            f.git(&["config", "user.name", "QA Restore"]);
            f.git(&["config", "user.email", "qa@example.invalid"]);
            f.git(&["config", "commit.gpgsign", "false"]);
            f.git(&["config", "core.autocrlf", "false"]);
            f
        }
        fn git(&self, args: &[&str]) -> String {
            git::text(&self.0.path, args).unwrap()
        }
        fn file(&self, name: &str, content: &str) {
            fs::write(self.0.path.join(name), content).unwrap();
        }
        fn read(&self, name: &str) -> String {
            fs::read_to_string(self.0.path.join(name)).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0.path);
        }
    }

    #[test]
    fn restore_and_redo_cycle_with_stale_rejection() {
        let f = Fixture::new();
        f.file("tracked.txt", "linea 1\nlinea 2\n");
        f.git(&["add", "tracked.txt"]);
        f.git(&["commit", "-m", "inicial"]);

        // Modificamos el archivo
        f.file("tracked.txt", "linea 1\nlinea 2 modificada\n");

        // 1. Preview de restauración
        let plan = preview(&f.0, "tracked.txt", false, true).unwrap();
        assert!(!plan.is_redo);
        assert!(plan.target_content.contains("linea 2\n"));

        // 2. Ejecutar restauración
        let outcome = execute(&f.0, plan.clone(), true).unwrap();
        assert_eq!(f.read("tracked.txt"), "linea 1\nlinea 2\n");
        assert!(!outcome.backup.is_empty());

        // Comprobar que en disco existe el respaldo
        let root = restore_root(&f.0).unwrap();
        let backup_file = root.join(&outcome.backup).join("backup_content");
        assert_eq!(
            fs::read_to_string(backup_file).unwrap(),
            "linea 1\nlinea 2 modificada\n"
        );

        // 3. Status ahora permite rehacer
        let st = check_status(&f.0, "tracked.txt", true).unwrap();
        assert!(st.can_redo);

        // 4. Preview de Rehacer
        let redo_plan = preview(&f.0, "tracked.txt", true, true).unwrap();
        assert!(redo_plan.is_redo);
        assert_eq!(redo_plan.target_content, "linea 1\nlinea 2 modificada\n");

        // 5. Rechazo por vista obsoleta: modificar externamente antes de confirmar
        f.file("tracked.txt", "linea 1 cambiada externamente\n");
        let stale_err = execute(&f.0, redo_plan.clone(), true).unwrap_err();
        assert_eq!(stale_err.code, "STALE_RESTORE");
        // El archivo no fue sobreescrito
        assert_eq!(f.read("tracked.txt"), "linea 1 cambiada externamente\n");

        // 6. Volver a estado limpio y ejecutar Rehacer con preview fresca
        f.file("tracked.txt", "linea 1\nlinea 2\n");
        let fresh_redo = preview(&f.0, "tracked.txt", true, true).unwrap();
        let redo_outcome = execute(&f.0, fresh_redo, true).unwrap();
        assert!(redo_outcome.is_redo);
        assert_eq!(f.read("tracked.txt"), "linea 1\nlinea 2 modificada\n");
    }
}
