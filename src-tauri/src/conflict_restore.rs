use crate::{
    changes, conflict_edit,
    git::{self, GitError, Repository, Result},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions, Permissions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

const PREFIX: &str = "ravengit-conflict-";
const LIMIT: usize = 512 * 1024;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Metadata {
    kind: Option<String>,
    path: String,
    original_sha256: String,
    result_sha256: String,
    operation: String,
}
#[derive(Serialize)]
pub struct Entry {
    pub kind: &'static str,
    pub id: String,
    pub path: Option<String>,
    pub restriction: Option<String>,
}
#[derive(Serialize)]
pub struct Listing {
    pub trusted: bool,
    pub entries: Vec<Entry>,
}
pub fn options(repo: &Repository, trusted: bool) -> Result<Listing> {
    Ok(Listing {
        trusted,
        entries: if trusted { list(repo, true)? } else { vec![] },
    })
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub token: String,
    pub id: String,
    pub path: String,
    pub original: String,
    pub current: String,
    pub current_changed: bool,
    pub head: String,
}
pub struct Plan {
    pub view: Review,
    state: String,
    fingerprint: String,
    permissions: Permissions,
    directory: PathBuf,
}
#[derive(Serialize)]
pub struct Outcome {
    pub message: String,
    pub backup: String,
}
fn error(message: &str) -> GitError {
    GitError::new("CONFLICT_RESTORE", message)
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn read_file(path: &Path, limit: usize) -> Result<Vec<u8>> {
    let m =
        fs::symlink_metadata(path).map_err(|_| error("No se pudo leer el respaldo completo."))?;
    if !m.is_file() || m.file_type().is_symlink() || m.len() > limit as u64 {
        return Err(error(
            "Respaldo no compatible: archivo regular sin enlaces y tamaño limitado requerido.",
        ));
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| error("No se pudo abrir el respaldo."))?
        .take((limit + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| error("No se pudo leer el respaldo."))?;
    if bytes.len() > limit {
        return Err(error("El respaldo supera el límite."));
    }
    Ok(bytes)
}
fn directory(repo: &Repository) -> Result<PathBuf> {
    let path = PathBuf::from(
        git::text(&repo.path, &["rev-parse", "--absolute-git-dir"])?.trim_end_matches('\n'),
    );
    path.canonicalize()
        .map_err(|_| error("No se pudo verificar la carpeta Git."))
}
fn backup(dir: &Path, id: &str) -> Result<(Metadata, Vec<u8>, String)> {
    if !id.starts_with(PREFIX)
        || id.len() > 160
        || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err(error("Identificador de respaldo no válido."));
    }
    let path = dir.join(id);
    let m = fs::symlink_metadata(&path).map_err(|_| error("El respaldo ya no está disponible."))?;
    if !m.is_dir() || m.file_type().is_symlink() {
        return Err(error("No se siguen enlaces a respaldos."));
    }
    let raw = read_file(&path.join("metadata.json"), 16 * 1024)?;
    let meta: Metadata =
        serde_json::from_slice(&raw).map_err(|_| error("Metadatos de respaldo no válidos."))?;
    let original = read_file(&path.join("original"), LIMIT)?;
    if hash(&original) != meta.original_sha256
        || meta.result_sha256.len() != 64
        || !meta.result_sha256.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(error("El respaldo no coincide con su hash registrado."));
    }
    let fingerprint = hash(&[raw.as_slice(), original.as_slice()].concat());
    Ok((meta, original, fingerprint))
}
pub fn list(repo: &Repository, trusted: bool) -> Result<Vec<Entry>> {
    if !trusted {
        return Err(error(
            "Autoriza el repositorio desde Cambios antes de consultar sus respaldos.",
        ));
    }
    let dir = directory(repo)?;
    let entries = fs::read_dir(&dir).map_err(|_| error("No se pudieron listar los respaldos."))?;
    let mut output = vec![];
    for entry in entries {
        let entry =
            entry.map_err(|_| error("No se pudo consultar una entrada de la carpeta Git."))?;
        let Some(id) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if !id.starts_with(PREFIX) {
            continue;
        }
        if output.len() >= 200 {
            return Err(error(
                "Hay más de 200 respaldos. Revísalos desde Git; no se elimina ninguno.",
            ));
        }
        match backup(&dir, &id) {
            Ok((meta, _, _)) => output.push(Entry {
                kind: if meta.kind.as_deref() == Some("recovery") {
                    "recovery"
                } else {
                    "saved"
                },
                id,
                path: Some(meta.path),
                restriction: None,
            }),
            Err(e) => output.push(Entry {
                kind: "invalid",
                id,
                path: None,
                restriction: Some(e.message),
            }),
        }
    }
    output.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(output)
}
pub fn preview(repo: &Repository, id: &str, trusted: bool) -> Result<Plan> {
    if !trusted {
        return Err(error(
            "Autoriza el repositorio antes de restaurar un respaldo.",
        ));
    }
    let dir = directory(repo)?;
    if fs::symlink_metadata(dir.join("index.lock")).is_ok() {
        return Err(error("Git está ocupado. No se elimina su lock."));
    }
    let state = changes::read(repo, true)?;
    if state.operation.as_deref() != Some("MERGE_HEAD") {
        return Err(error(
            "Este incremento sólo restaura archivos durante un merge pendiente.",
        ));
    }
    let (meta, original, fingerprint) = backup(&dir, id)?;
    if conflict_edit::operation(&dir)? != meta.operation {
        return Err(error(
            "La operación cambió desde el respaldo. Conserva los archivos y revísalo externamente.",
        ));
    }
    let full = changes::validated_path(repo, &meta.path)?;
    let (current, permissions) = conflict_edit::bytes(&full)?;
    if original == current {
        return Err(error(
            "El archivo ya coincide con este respaldo; no hay nada que restaurar.",
        ));
    }
    let original_text =
        String::from_utf8(original).map_err(|_| error("El respaldo no es texto UTF-8."))?;
    let current_text = String::from_utf8(current.clone())
        .map_err(|_| error("El archivo actual no es texto UTF-8."))?;
    if original_text.contains('\0') || current_text.contains('\0') {
        return Err(error(
            "Los archivos binarios requieren recuperación externa.",
        ));
    }
    let head = state
        .head
        .clone()
        .ok_or_else(|| error("No se pudo verificar HEAD."))?;
    if changes::read(repo, true)?.token != state.token {
        return Err(error("El estado cambió durante la revisión. Actualiza."));
    }
    Ok(Plan {
        view: Review {
            token: conflict_edit::nonce(),
            id: id.into(),
            path: meta.path,
            original: original_text,
            current: current_text,
            current_changed: hash(&current) != meta.result_sha256,
            head,
        },
        state: state.token,
        fingerprint,
        permissions,
        directory: dir,
    })
}
fn check(repo: &Repository, plan: &Plan, trusted: bool) -> Result<()> {
    let fresh = preview(repo, &plan.view.id, trusted)?;
    if fresh.state != plan.state
        || fresh.fingerprint != plan.fingerprint
        || fresh.permissions != plan.permissions
        || fresh.directory != plan.directory
        || fresh.view.path != plan.view.path
        || fresh.view.current != plan.view.current
        || fresh.view.original != plan.view.original
    {
        return Err(error(
            "El archivo, índice, respaldo u operación cambió. Vuelve a revisar; no se restauró automáticamente.",
        ));
    }
    Ok(())
}
fn create(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|_| {
            error(
                "No se pudo crear la copia de seguridad. Comprueba los archivos antes de repetir.",
            )
        })?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| error("No se pudo completar la copia de seguridad."))
}
pub fn restore(repo: &Repository, plan: Plan, trusted: bool) -> Result<Outcome> {
    check(repo, &plan, trusted)?;
    let safety = plan
        .directory
        .join(format!("{PREFIX}{}", conflict_edit::nonce()));
    fs::create_dir(&safety)
        .map_err(|_| error("No se pudo crear un respaldo exclusivo del archivo actual."))?;
    create(&safety.join("original"), plan.view.current.as_bytes())?;
    let meta=serde_json::to_vec_pretty(&serde_json::json!({"path":plan.view.path,"originalSha256":hash(plan.view.current.as_bytes()),"resultSha256":hash(plan.view.original.as_bytes()),"operation":conflict_edit::operation(&plan.directory)?,"stateToken":plan.state,"kind":"recovery"})).map_err(|_| error("No se pudo registrar la copia de seguridad."))?;
    create(&safety.join("metadata.json"), &meta)?;
    let temp = safety.join("result.tmp");
    create(&temp, plan.view.original.as_bytes())?;
    fs::set_permissions(&temp, plan.permissions.clone())
        .map_err(|_| error("No se pudieron conservar los permisos del archivo."))?;
    if let Err(error) = check(repo, &plan, trusted) {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    let full = changes::validated_path(repo, &plan.view.path)?;
    fs::rename(&temp,&full).map_err(|_| error("No se confirmó el reemplazo. Se conservan ambas copias; comprueba el archivo antes de repetir."))?;
    Ok(Outcome {message:"Archivo restaurado. El índice y el merge no cambiaron; revisa Cambios antes de cualquier otra acción.".into(),backup:safety.to_string_lossy().into_owned()})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conflicts::tests::Fixture;
    const FILE: &str = "archivo ü.txt";
    fn fixture() -> (Fixture, String, Vec<u8>) {
        let f = Fixture::new(Some(b"base\n"), Some(b"local\n"), b"incoming\n");
        let original = fs::read(f.0.path.join(FILE)).unwrap();
        let token = changes::read(&f.0, true).unwrap().token;
        let plan = conflict_edit::preview(&f.0, &token, FILE, true).unwrap();
        let saved = conflict_edit::save(&f.0, plan, "resuelto\n", true).unwrap();
        let id = Path::new(&saved.backup)
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .into();
        (f, id, original)
    }
    #[test]
    fn restores_exact_original_after_preparation_preserving_index_and_allowing_redo() {
        let (f, id, original) = fixture();
        f.git(&["add", "--", FILE]);
        let index = git::run(&f.0.path, &["ls-files", "--stage", "-z"]).unwrap();
        let head = git::text(&f.0.path, &["rev-parse", "HEAD"]).unwrap();
        let merge = fs::read(f.0.path.join(".git/MERGE_HEAD")).unwrap();
        let reopened = Repository {
            id: "reopened".into(),
            path: f.0.path.clone(),
        };
        assert_eq!(list(&reopened, true).unwrap().len(), 1);
        let plan = preview(&reopened, &id, true).unwrap();
        assert!(!plan.view.current_changed);
        assert_eq!(fs::read(f.0.path.join(FILE)).unwrap(), b"resuelto\n");
        let outcome = restore(&reopened, plan, true).unwrap();
        assert_eq!(fs::read(f.0.path.join(FILE)).unwrap(), original);
        assert_eq!(
            git::run(&f.0.path, &["ls-files", "--stage", "-z"]).unwrap(),
            index
        );
        assert_eq!(git::text(&f.0.path, &["rev-parse", "HEAD"]).unwrap(), head);
        assert_eq!(fs::read(f.0.path.join(".git/MERGE_HEAD")).unwrap(), merge);
        assert_eq!(
            fs::read(Path::new(&outcome.backup).join("original")).unwrap(),
            b"resuelto\n"
        );
        let redo = Path::new(&outcome.backup)
            .file_name()
            .unwrap()
            .to_str()
            .unwrap();
        restore(&reopened, preview(&reopened, redo, true).unwrap(), true).unwrap();
        assert_eq!(fs::read(f.0.path.join(FILE)).unwrap(), b"resuelto\n");
    }
    #[test]
    fn preserves_later_worktree_edits_in_the_safety_backup() {
        let (f, id, _) = fixture();
        fs::write(f.0.path.join(FILE), "nuevo trabajo\n").unwrap();
        let plan = preview(&f.0, &id, true).unwrap();
        assert!(plan.view.current_changed);
        let result = restore(&f.0, plan, true).unwrap();
        assert_eq!(
            fs::read(Path::new(&result.backup).join("original")).unwrap(),
            b"nuevo trabajo\n"
        );
    }
    #[test]
    fn stale_file_index_operation_and_backup_never_replace_the_file() {
        for kind in [
            "file",
            "index",
            "head",
            "operation",
            "backup",
            "path",
            "metadata",
        ] {
            let (f, id, _) = fixture();
            let plan = preview(&f.0, &id, true).unwrap();
            let backup = f.0.path.join(".git").join(&id);
            match kind {
                "file" => fs::write(f.0.path.join(FILE), "new\n").unwrap(),
                "index" => f.git(&["add", "--", FILE]),
                "head" => f.git(&["update-ref", "refs/heads/main", "HEAD^"]),
                "operation" => fs::write(f.0.path.join(".git/MERGE_MSG"), "other").unwrap(),
                "backup" => fs::write(backup.join("original"), "broken").unwrap(),
                "path" => {
                    let p = backup.join("metadata.json");
                    let mut meta: serde_json::Value =
                        serde_json::from_slice(&fs::read(&p).unwrap()).unwrap();
                    meta["path"] = serde_json::json!("../outside");
                    fs::write(p, serde_json::to_vec(&meta).unwrap()).unwrap();
                }
                _ => fs::write(backup.join("metadata.json"), "{}").unwrap(),
            }
            let before = fs::read(f.0.path.join(FILE)).unwrap();
            assert!(restore(&f.0, plan, true).is_err(), "{kind}");
            assert_eq!(fs::read(f.0.path.join(FILE)).unwrap(), before);
        }
    }
    #[test]
    fn rejects_untrusted_invalid_ids_locks_and_finished_merges() {
        let (f, id, _) = fixture();
        assert!(list(&f.0, false).is_err());
        assert!(preview(&f.0, &id, false).is_err());
        for bad in [
            "../outside",
            "ravengit-conflict-../outside",
            "/tmp/other",
            "--all",
        ] {
            assert!(preview(&f.0, bad, true).is_err());
        }
        let plan = preview(&f.0, &id, true).unwrap();
        assert!(restore(&f.0, plan, false).is_err());
        fs::write(f.0.path.join(".git/index.lock"), "existing").unwrap();
        assert!(preview(&f.0, &id, true).is_err());
        assert_eq!(
            fs::read(f.0.path.join(".git/index.lock")).unwrap(),
            b"existing"
        );
        fs::remove_file(f.0.path.join(".git/index.lock")).unwrap();
        f.git(&["add", "--", FILE]);
        fs::remove_file(f.0.path.join(".git/MERGE_HEAD")).unwrap();
        assert!(preview(&f.0, &id, true).is_err());
    }
    #[test]
    fn invalid_records_remain_visible_but_cannot_be_restored() {
        let (f, id, _) = fixture();
        fs::write(
            f.0.path.join(".git").join(&id).join("metadata.json"),
            "broken",
        )
        .unwrap();
        let entries = list(&f.0, true).unwrap();
        assert!(entries[0].restriction.is_some());
        assert!(preview(&f.0, &id, true).is_err());
    }
    #[test]
    fn preserves_crlf_original_bytes() {
        let f = Fixture::new(Some(b"base\n"), Some(b"local\n"), b"incoming\n");
        let original = fs::read_to_string(f.0.path.join(FILE))
            .unwrap()
            .replace('\n', "\r\n");
        fs::write(f.0.path.join(FILE), original.as_bytes()).unwrap();
        let plan =
            conflict_edit::preview(&f.0, &changes::read(&f.0, true).unwrap().token, FILE, true)
                .unwrap();
        let saved = conflict_edit::save(&f.0, plan, "resolved\n", true).unwrap();
        let id = Path::new(&saved.backup)
            .file_name()
            .unwrap()
            .to_str()
            .unwrap();
        restore(&f.0, preview(&f.0, id, true).unwrap(), true).unwrap();
        assert_eq!(fs::read(f.0.path.join(FILE)).unwrap(), original.as_bytes());
    }
    #[cfg(unix)]
    #[test]
    fn refuses_symlink_backup_and_worktree() {
        use std::os::unix::fs::symlink;
        let (f, id, _) = fixture();
        let dir = f.0.path.join(".git");
        symlink(dir.join(&id), dir.join("ravengit-conflict-link")).unwrap();
        assert!(preview(&f.0, "ravengit-conflict-link", true).is_err());
        fs::remove_file(f.0.path.join(FILE)).unwrap();
        symlink(f.0.path.join("keep"), f.0.path.join(FILE)).unwrap();
        assert!(preview(&f.0, &id, true).is_err());
    }
}
