use crate::{
    changes,
    git::{self, GitError, Repository, Result},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const SNAPSHOTS_DIR_NAME: &str = "ravengit-snapshots";
const MAX_SNAPSHOT_FILE_BYTES: usize = 16 * 1024 * 1024;
const MAX_ID_LEN: usize = 96;
const MAX_LABEL_LEN: usize = 120;
static SNAPSHOT_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotFile {
    pub path: String,
    pub status: String,
    pub existed: bool,
    pub sha256: Option<String>,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotSummary {
    pub id: String,
    pub created_at: u64,
    pub label: String,
    pub trigger: String,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub total_bytes: u64,
    pub file_count: usize,
    pub files: Vec<SnapshotFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct StoredSnapshotMetadata {
    id: String,
    created_at: u64,
    label: String,
    trigger: String,
    branch: Option<String>,
    head: Option<String>,
    total_bytes: u64,
    file_count: usize,
    files: Vec<SnapshotFile>,
    #[serde(default)]
    fingerprint: String,
}

impl From<&StoredSnapshotMetadata> for SnapshotSummary {
    fn from(meta: &StoredSnapshotMetadata) -> Self {
        Self {
            id: meta.id.clone(),
            created_at: meta.created_at,
            label: meta.label.clone(),
            trigger: meta.trigger.clone(),
            branch: meta.branch.clone(),
            head: meta.head.clone(),
            total_bytes: meta.total_bytes,
            file_count: meta.file_count,
            files: meta.files.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotList {
    pub snapshots: Vec<SnapshotSummary>,
    pub total_bytes: u64,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CaptureOutcome {
    pub created: bool,
    pub deduplicated: bool,
    pub snapshot: Option<SnapshotSummary>,
    pub list: SnapshotList,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestoreFilePreview {
    pub path: String,
    pub action: String,
    pub bytes_before: u64,
    pub bytes_after: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestorePlan {
    pub token: String,
    pub snapshot_id: String,
    pub label: String,
    pub created_at: u64,
    pub snapshot_branch: Option<String>,
    pub snapshot_head: Option<String>,
    pub current_branch: Option<String>,
    pub current_head: Option<String>,
    pub branch_mismatch: bool,
    pub head_mismatch: bool,
    pub files: Vec<RestoreFilePreview>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
    pub snapshot_id: String,
    pub backup_snapshot_id: Option<String>,
    pub restored_files: usize,
    pub message: String,
}

fn error(code: &'static str, message: impl Into<String>) -> GitError {
    GitError::new(code, message)
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn is_valid_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

fn validate_snapshot_id(snapshot_id: &str) -> Result<()> {
    if snapshot_id.is_empty()
        || snapshot_id.len() > MAX_ID_LEN
        || !snapshot_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(error(
            "INVALID_SNAPSHOT_ID",
            "Identificador de snapshot no válido.",
        ));
    }
    Ok(())
}

fn validate_trigger(trigger: &str) -> Result<()> {
    if !matches!(trigger, "manual" | "auto" | "pre-op" | "pre-restore") {
        return Err(error("INVALID_TRIGGER", "Origen de snapshot no válido."));
    }
    Ok(())
}

fn git_dir(repo: &Repository) -> Result<PathBuf> {
    let raw = git::text(&repo.path, &["rev-parse", "--absolute-git-dir"])?;
    let path = PathBuf::from(raw.trim_end_matches(['\r', '\n']));
    path.canonicalize()
        .map_err(|_| error("GIT_DIR", "No se pudo localizar la carpeta Git."))
}

fn snapshots_root(repo: &Repository, create: bool) -> Result<PathBuf> {
    let dir = git_dir(repo)?.join(SNAPSHOTS_DIR_NAME);
    if create && !dir.exists() {
        fs::create_dir_all(&dir).map_err(|_| {
            error(
                "SNAPSHOT_IO",
                "No se pudo crear la carpeta de snapshots locales.",
            )
        })?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
        }
    }
    Ok(dir)
}

fn format_entry_status(entry: &changes::Entry) -> String {
    if entry.untracked {
        return "??".into();
    }
    let idx = if entry.index_status == ' ' {
        '-'
    } else {
        entry.index_status
    };
    let wt = if entry.worktree_status == ' ' {
        '-'
    } else {
        entry.worktree_status
    };
    format!("{idx}{wt}")
}

fn sanitize_label(label: Option<&str>, trigger: &str, file_count: usize) -> String {
    let cleaned = label
        .map(|s| {
            s.chars()
                .filter(|c| !c.is_control())
                .collect::<String>()
                .trim()
                .to_string()
        })
        .unwrap_or_default();
    if !cleaned.is_empty() {
        return cleaned.chars().take(MAX_LABEL_LEN).collect();
    }
    match trigger {
        "auto" => format!("Snapshot automático ({file_count} archivo(s))"),
        "pre-op" => format!("Respaldo previo a operación ({file_count} archivo(s))"),
        "pre-restore" => format!("Respaldo antes de restaurar ({file_count} archivo(s))"),
        _ => format!("Snapshot manual ({file_count} archivo(s))"),
    }
}

fn read_stored_snapshots(root: &Path) -> Vec<StoredSnapshotMetadata> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut items = Vec::new();
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let Some(folder_name) = dir.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if validate_snapshot_id(folder_name).is_err() {
            continue;
        }
        let meta_path = dir.join("metadata.json");
        if !meta_path.is_file() {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&meta_path) else {
            continue;
        };
        let Ok(meta) = serde_json::from_str::<StoredSnapshotMetadata>(&raw) else {
            continue;
        };
        if meta.id != folder_name {
            continue;
        }
        items.push(meta);
    }
    items.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    items
}

fn dir_disk_usage(dir: &Path) -> u64 {
    let files_dir = dir.join("files");
    let Ok(entries) = fs::read_dir(&files_dir) else {
        return 0;
    };
    entries
        .flatten()
        .filter_map(|e| e.metadata().ok())
        .filter(|m| m.is_file())
        .map(|m| m.len())
        .sum()
}

fn build_list_from_root(root: &Path) -> SnapshotList {
    let stored = read_stored_snapshots(root);
    let total_bytes: u64 = stored
        .iter()
        .map(|meta| {
            let measured = dir_disk_usage(&root.join(&meta.id));
            if measured > 0 {
                measured
            } else {
                meta.total_bytes
            }
        })
        .sum();
    let snapshots: Vec<SnapshotSummary> = stored.iter().map(SnapshotSummary::from).collect();
    let count = snapshots.len();
    SnapshotList {
        snapshots,
        total_bytes,
        count,
    }
}

fn enforce_limits(root: &Path, keep_id: &str, max_snapshots: u16, max_disk_mb: u16) {
    let max_count = (max_snapshots.max(1)) as usize;
    let max_bytes = (max_disk_mb.max(1) as u64) * 1024 * 1024;
    let mut stored = read_stored_snapshots(root);
    // Stored is newest-first; remove from the end (oldest) while preserving `keep_id`.
    let mut sizes: Vec<(String, u64)> = stored
        .iter()
        .map(|meta| {
            let usage = dir_disk_usage(&root.join(&meta.id)).max(meta.total_bytes);
            (meta.id.clone(), usage)
        })
        .collect();
    let mut total_bytes: u64 = sizes.iter().map(|(_, s)| *s).sum();

    while sizes.len() > max_count || (total_bytes > max_bytes && sizes.len() > 1) {
        let Some(pos) = sizes.iter().rposition(|(id, _)| id != keep_id) else {
            break;
        };
        let (victim_id, victim_bytes) = sizes.remove(pos);
        stored.retain(|m| m.id != victim_id);
        let _ = fs::remove_dir_all(root.join(&victim_id));
        total_bytes = total_bytes.saturating_sub(victim_bytes);
    }
}

fn write_atomic_file(dest: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let parent = dest
        .parent()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "no parent"))?;
    let seq = SNAPSHOT_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp = parent.join(format!(".tmp-{}-{seq}", std::process::id()));
    let mut f = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
    let write_res = (|| -> std::io::Result<()> {
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600));
        }
        fs::rename(&tmp, dest)
    })();
    if write_res.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    write_res
}

fn active_git_operation_present(repo: &Repository, git_dir_path: &Path) -> Result<bool> {
    for marker in [
        "MERGE_HEAD",
        "REBASE_HEAD",
        "rebase-merge",
        "rebase-apply",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
    ] {
        if git_dir_path.join(marker).exists() {
            return Ok(true);
        }
    }
    let state = changes::read(repo, true)?;
    Ok(state.operation.is_some())
}

pub fn list(repo: &Repository, _trusted: bool) -> Result<SnapshotList> {
    let root = snapshots_root(repo, false)?;
    if !root.exists() {
        return Ok(SnapshotList {
            snapshots: Vec::new(),
            total_bytes: 0,
            count: 0,
        });
    }
    Ok(build_list_from_root(&root))
}

pub fn capture(
    repo: &Repository,
    label: Option<&str>,
    trigger: &str,
    max_snapshots: u16,
    max_disk_mb: u16,
    trusted: bool,
) -> Result<CaptureOutcome> {
    if !trusted {
        return Err(error(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de crear snapshots locales.",
        ));
    }
    validate_trigger(trigger)?;
    let git_dir_path = git_dir(repo)?;
    if git_dir_path.join("index.lock").exists() {
        return Err(error(
            "INDEX_LOCKED",
            "El índice Git está bloqueado por otro proceso.",
        ));
    }

    let state = changes::read(repo, true)?;
    let root = snapshots_root(repo, true)?;
    if state.entries.is_empty() {
        let current_list = build_list_from_root(&root);
        if trigger == "manual" {
            return Err(error(
                "NO_CHANGES",
                "No hay cambios locales en el árbol de trabajo para capturar.",
            ));
        }
        return Ok(CaptureOutcome {
            created: false,
            deduplicated: false,
            snapshot: None,
            list: current_list,
            message: "Árbol de trabajo limpio; no se necesitó snapshot.".into(),
        });
    }

    let mut captured_files = Vec::new();
    let mut blobs: BTreeMap<String, Vec<u8>> = BTreeMap::new();
    for entry in state.entries.iter().filter(|e| !e.submodule) {
        let Ok(full) = changes::validated_path(repo, &entry.path) else {
            continue;
        };
        let status = format_entry_status(entry);
        match fs::symlink_metadata(&full) {
            Ok(meta) => {
                if meta.file_type().is_symlink() || meta.is_dir() {
                    continue;
                }
                if meta.len() > MAX_SNAPSHOT_FILE_BYTES as u64 {
                    continue;
                }
                let Ok(bytes) = fs::read(&full) else {
                    continue;
                };
                if bytes.len() > MAX_SNAPSHOT_FILE_BYTES {
                    continue;
                }
                let sha = hash_bytes(&bytes);
                let size = bytes.len() as u64;
                blobs.entry(sha.clone()).or_insert(bytes);
                captured_files.push(SnapshotFile {
                    path: entry.path.clone(),
                    status,
                    existed: true,
                    sha256: Some(sha),
                    size,
                });
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                if entry.untracked {
                    continue;
                }
                captured_files.push(SnapshotFile {
                    path: entry.path.clone(),
                    status,
                    existed: false,
                    sha256: None,
                    size: 0,
                });
            }
            Err(_) => continue,
        }
    }

    if captured_files.is_empty() {
        let current_list = build_list_from_root(&root);
        if trigger == "manual" {
            return Err(error(
                "NO_CHANGES",
                "No hay archivos regulares elegibles para capturar en el snapshot.",
            ));
        }
        return Ok(CaptureOutcome {
            created: false,
            deduplicated: false,
            snapshot: None,
            list: current_list,
            message: "Sin archivos elegibles para capturar.".into(),
        });
    }

    captured_files.sort_by(|a, b| a.path.cmp(&b.path));
    let mut fp_hasher = Sha256::new();
    fp_hasher.update(state.branch.as_deref().unwrap_or("").as_bytes());
    fp_hasher.update(b"\0");
    fp_hasher.update(state.head.as_deref().unwrap_or("").as_bytes());
    fp_hasher.update(b"\0");
    for f in &captured_files {
        fp_hasher.update(f.path.as_bytes());
        fp_hasher.update(b"\0");
        fp_hasher.update(f.status.as_bytes());
        fp_hasher.update(b"\0");
        fp_hasher.update([u8::from(f.existed)]);
        fp_hasher.update(f.sha256.as_deref().unwrap_or("").as_bytes());
        fp_hasher.update(b"\n");
    }
    let fingerprint = format!("{:x}", fp_hasher.finalize());

    if trigger == "auto" {
        let existing = read_stored_snapshots(&root);
        if let Some(latest) = existing.first()
            && !latest.fingerprint.is_empty()
            && latest.fingerprint == fingerprint
        {
            let list = build_list_from_root(&root);
            return Ok(CaptureOutcome {
                created: false,
                deduplicated: true,
                snapshot: None,
                list,
                message: "El árbol de trabajo no cambió desde el último snapshot.".into(),
            });
        }
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| error("TIME", "Error de reloj de sistema."))?;
    let created_at = now.as_secs();
    let seq = SNAPSHOT_SEQ.fetch_add(1, Ordering::Relaxed);
    let snapshot_id = format!("snap-{created_at}-{}-{seq:08}", std::process::id());
    validate_snapshot_id(&snapshot_id)?;

    let snap_dir = root.join(&snapshot_id);
    let files_dir = snap_dir.join("files");
    fs::create_dir_all(&files_dir).map_err(|_| {
        error(
            "SNAPSHOT_IO",
            "No se pudo crear el directorio del snapshot local.",
        )
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&snap_dir, fs::Permissions::from_mode(0o700));
        let _ = fs::set_permissions(&files_dir, fs::Permissions::from_mode(0o700));
    }

    let mut total_bytes = 0u64;
    for (sha, bytes) in &blobs {
        total_bytes += bytes.len() as u64;
        let dest = files_dir.join(format!("{sha}.bin"));
        if write_atomic_file(&dest, bytes).is_err() {
            let _ = fs::remove_dir_all(&snap_dir);
            return Err(error(
                "SNAPSHOT_IO",
                "No se pudieron guardar los archivos del snapshot.",
            ));
        }
    }

    let file_count = captured_files.len();
    let final_label = sanitize_label(label, trigger, file_count);
    let meta = StoredSnapshotMetadata {
        id: snapshot_id.clone(),
        created_at,
        label: final_label,
        trigger: trigger.to_string(),
        branch: state.branch,
        head: state.head,
        total_bytes,
        file_count,
        files: captured_files,
        fingerprint,
    };
    let summary = SnapshotSummary::from(&meta);
    let meta_json = serde_json::to_vec_pretty(&meta).map_err(|_| {
        error(
            "SNAPSHOT_IO",
            "No se pudieron serializar los metadatos del snapshot.",
        )
    })?;
    if write_atomic_file(&snap_dir.join("metadata.json"), &meta_json).is_err() {
        let _ = fs::remove_dir_all(&snap_dir);
        return Err(error(
            "SNAPSHOT_IO",
            "No se pudieron guardar los metadatos del snapshot.",
        ));
    }

    enforce_limits(&root, &snapshot_id, max_snapshots, max_disk_mb);
    let list = build_list_from_root(&root);
    Ok(CaptureOutcome {
        created: true,
        deduplicated: false,
        snapshot: Some(summary),
        list,
        message: format!("Snapshot guardado con {file_count} archivo(s)."),
    })
}

pub fn delete(repo: &Repository, snapshot_id: &str, trusted: bool) -> Result<SnapshotList> {
    if !trusted {
        return Err(error(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de eliminar snapshots.",
        ));
    }
    validate_snapshot_id(snapshot_id)?;
    let root = snapshots_root(repo, false)?;
    if root.exists() {
        let target = root.join(snapshot_id);
        if target.is_dir() {
            fs::remove_dir_all(&target)
                .map_err(|_| error("SNAPSHOT_IO", "No se pudo eliminar el snapshot indicado."))?;
        }
    }
    Ok(build_list_from_root(&root))
}

fn load_and_verify_snapshot(
    root: &Path,
    snapshot_id: &str,
) -> Result<(PathBuf, StoredSnapshotMetadata)> {
    validate_snapshot_id(snapshot_id)?;
    let snap_dir = root.join(snapshot_id);
    let meta_path = snap_dir.join("metadata.json");
    if !meta_path.is_file() {
        return Err(error(
            "SNAPSHOT_NOT_FOUND",
            "No se encontró el snapshot seleccionado.",
        ));
    }
    let raw = fs::read_to_string(&meta_path)
        .map_err(|_| error("SNAPSHOT_READ", "No se pudo leer el snapshot seleccionado."))?;
    let meta: StoredSnapshotMetadata = serde_json::from_str(&raw).map_err(|_| {
        error(
            "SNAPSHOT_FORMAT",
            "Los metadatos del snapshot están dañados o incompletos.",
        )
    })?;
    if meta.id != snapshot_id {
        return Err(error(
            "SNAPSHOT_FORMAT",
            "Identificador inconsistente en el snapshot.",
        ));
    }
    let files_dir = snap_dir.join("files");
    for file in &meta.files {
        if file.existed {
            let Some(sha) = file.sha256.as_deref() else {
                return Err(error(
                    "SNAPSHOT_CORRUPT",
                    "Falta la suma de verificación en el snapshot.",
                ));
            };
            if !is_valid_sha256_hex(sha) {
                return Err(error(
                    "SNAPSHOT_CORRUPT",
                    "Suma SHA-256 inválida en el snapshot.",
                ));
            }
            let blob_path = files_dir.join(format!("{sha}.bin"));
            let bytes = fs::read(&blob_path).map_err(|_| {
                error(
                    "SNAPSHOT_CORRUPT",
                    format!("Falta el contenido respaldado para «{}».", file.path),
                )
            })?;
            if hash_bytes(&bytes) != sha {
                return Err(error(
                    "SNAPSHOT_CORRUPT",
                    format!("El respaldo de «{}» está dañado.", file.path),
                ));
            }
        }
    }
    Ok((snap_dir, meta))
}

pub fn preview_restore(repo: &Repository, snapshot_id: &str, trusted: bool) -> Result<RestorePlan> {
    if !trusted {
        return Err(error(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de restaurar un snapshot.",
        ));
    }
    let git_dir_path = git_dir(repo)?;
    if git_dir_path.join("index.lock").exists() {
        return Err(error(
            "INDEX_LOCKED",
            "El índice Git está bloqueado por otro proceso.",
        ));
    }
    if active_git_operation_present(repo, &git_dir_path)? {
        return Err(error(
            "OPERATION_IN_PROGRESS",
            "Hay una operación Git en curso (merge, rebase o cherry-pick). Termínala antes de restaurar un snapshot.",
        ));
    }
    let state = changes::read(repo, true)?;
    let root = snapshots_root(repo, false)?;
    let (snap_dir, meta) = load_and_verify_snapshot(&root, snapshot_id)?;
    let files_dir = snap_dir.join("files");

    let mut previews = Vec::with_capacity(meta.files.len());
    for file in &meta.files {
        let full = changes::validated_path(repo, &file.path)?;
        let current_bytes = match fs::symlink_metadata(&full) {
            Ok(m) => {
                if m.file_type().is_symlink() || m.is_dir() {
                    return Err(error(
                        "UNSUPPORTED_TYPE",
                        format!("«{}» no es un archivo regular.", file.path),
                    ));
                }
                Some(fs::read(&full).map_err(|_| {
                    error(
                        "FILE_READ",
                        format!("No se pudo leer el archivo actual «{}».", file.path),
                    )
                })?)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(_) => {
                return Err(error(
                    "FILE_READ",
                    format!("No se pudo inspeccionar «{}».", file.path),
                ));
            }
        };
        let bytes_before = current_bytes.as_ref().map_or(0, |b| b.len() as u64);

        let (action, bytes_after) = if file.existed {
            let sha = file.sha256.as_deref().unwrap_or_default();
            let snap_bytes = fs::read(files_dir.join(format!("{sha}.bin")))
                .map_err(|_| error("SNAPSHOT_CORRUPT", "No se pudo leer el archivo respaldado."))?;
            let after_len = snap_bytes.len() as u64;
            match current_bytes {
                None => ("recreate".to_string(), after_len),
                Some(ref cur) if *cur == snap_bytes => ("unchanged".to_string(), after_len),
                Some(_) => ("restore".to_string(), after_len),
            }
        } else if current_bytes.is_some() {
            ("delete".to_string(), 0)
        } else {
            ("unchanged".to_string(), 0)
        };

        previews.push(RestoreFilePreview {
            path: file.path.clone(),
            action,
            bytes_before,
            bytes_after,
        });
    }

    let branch_mismatch = meta.branch != state.branch;
    let head_mismatch = meta.head != state.head;
    let actionable = previews.iter().filter(|p| p.action != "unchanged").count();

    let mut hasher = Sha256::new();
    hasher.update(state.token.as_bytes());
    hasher.update(b"\0");
    hasher.update(snapshot_id.as_bytes());
    hasher.update(b"\0");
    hasher.update(state.head.as_deref().unwrap_or("").as_bytes());
    let serialized_previews = serde_json::to_vec(&previews).map_err(|_| {
        error(
            "SNAPSHOT_IO",
            "No se pudo calcular el plan de restauración.",
        )
    })?;
    hasher.update(&serialized_previews);
    let token = format!("{:x}", hasher.finalize());

    let summary = if actionable == 0 {
        "Todos los archivos del snapshot ya coinciden con el árbol de trabajo actual.".into()
    } else {
        format!(
            "Se aplicará el estado de {actionable} archivo(s) del snapshot (se guardará un respaldo automático previo)."
        )
    };

    Ok(RestorePlan {
        token,
        snapshot_id: meta.id,
        label: meta.label,
        created_at: meta.created_at,
        snapshot_branch: meta.branch,
        snapshot_head: meta.head,
        current_branch: state.branch,
        current_head: state.head,
        branch_mismatch,
        head_mismatch,
        files: previews,
        summary,
    })
}

pub fn confirm_restore(
    repo: &Repository,
    plan: RestorePlan,
    max_snapshots: u16,
    max_disk_mb: u16,
    trusted: bool,
) -> Result<RestoreOutcome> {
    if !trusted {
        return Err(error(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de restaurar un snapshot.",
        ));
    }
    let fresh = preview_restore(repo, &plan.snapshot_id, trusted)?;
    if fresh.token != plan.token {
        return Err(error(
            "STALE_SNAPSHOT_RESTORE",
            "El árbol de trabajo o el repositorio cambió desde la vista previa. Vuelve a revisarlo.",
        ));
    }

    let root = snapshots_root(repo, false)?;
    let (snap_dir, meta) = load_and_verify_snapshot(&root, &plan.snapshot_id)?;
    let files_dir = snap_dir.join("files");

    let actionable_paths: HashSet<String> = fresh
        .files
        .iter()
        .filter(|p| p.action != "unchanged")
        .map(|p| p.path.clone())
        .collect();

    if actionable_paths.is_empty() {
        return Ok(RestoreOutcome {
            snapshot_id: plan.snapshot_id,
            backup_snapshot_id: None,
            restored_files: 0,
            message: "Los archivos ya coincidían con el snapshot; no hubo cambios que aplicar."
                .into(),
        });
    }

    let backup_outcome = capture(
        repo,
        Some(&format!("Previo a restaurar «{}»", plan.label)),
        "pre-restore",
        max_snapshots,
        max_disk_mb,
        trusted,
    )?;
    let backup_snapshot_id = backup_outcome.snapshot.map(|s| s.id);

    let mut restored_files = 0usize;
    for file in &meta.files {
        if !actionable_paths.contains(&file.path) {
            continue;
        }
        let full = changes::validated_path(repo, &file.path)?;
        if file.existed {
            let sha = file
                .sha256
                .as_deref()
                .ok_or_else(|| error("SNAPSHOT_CORRUPT", "Falta suma SHA-256 en respaldo."))?;
            let bytes = fs::read(files_dir.join(format!("{sha}.bin")))
                .map_err(|_| error("SNAPSHOT_CORRUPT", "No se pudo leer el archivo respaldado."))?;
            if let Some(parent) = full.parent()
                && !parent.exists()
            {
                fs::create_dir_all(parent).map_err(|_| {
                    error(
                        "RESTORE_WRITE",
                        format!("No se pudo crear el directorio para «{}».", file.path),
                    )
                })?;
            }
            let parent = full
                .parent()
                .ok_or_else(|| error("INVALID_PATH", "Ruta sin carpeta padre."))?;
            let seq = SNAPSHOT_SEQ.fetch_add(1, Ordering::Relaxed);
            let tmp = parent.join(format!(".ravengit-snap-{}-{seq}", std::process::id()));
            let mut tf = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&tmp)
                .map_err(|_| {
                    error(
                        "RESTORE_WRITE",
                        format!("No se pudo restaurar «{}».", file.path),
                    )
                })?;
            let write_res = (|| -> std::io::Result<()> {
                tf.write_all(&bytes)?;
                tf.sync_all()?;
                drop(tf);
                fs::rename(&tmp, &full)
            })();
            if write_res.is_err() {
                let _ = fs::remove_file(&tmp);
                return Err(error(
                    "RESTORE_WRITE",
                    format!("No se pudo escribir el archivo «{}».", file.path),
                ));
            }
        } else if full.exists() {
            fs::remove_file(&full).map_err(|_| {
                error(
                    "RESTORE_WRITE",
                    format!("No se pudo eliminar «{}».", file.path),
                )
            })?;
        }
        restored_files += 1;
    }

    Ok(RestoreOutcome {
        snapshot_id: plan.snapshot_id,
        backup_snapshot_id,
        restored_files,
        message: format!("Se restauraron {restored_files} archivo(s) desde el snapshot local."),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    static NEXT_TEST: AtomicU64 = AtomicU64::new(0);

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "ravengit-snapshots-{}-{}",
                std::process::id(),
                NEXT_TEST.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            let f = Self(path);
            f.git(&["init", "-b", "main"]);
            f.git(&["config", "user.name", "RavenGit"]);
            f.git(&["config", "user.email", "test@ravengit.local"]);
            fs::write(f.0.join("app.txt"), "v1\n").unwrap();
            fs::write(f.0.join("keep.txt"), "base\n").unwrap();
            f.git(&["add", "--all"]);
            f.git(&["commit", "-m", "inicial"]);
            f
        }
        fn git(&self, args: &[&str]) -> String {
            let out = Command::new("git")
                .current_dir(&self.0)
                .args(args)
                .output()
                .unwrap();
            assert!(
                out.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            String::from_utf8_lossy(&out.stdout).into_owned()
        }
        fn repo(&self) -> Repository {
            Repository {
                id: "snap-test".into(),
                path: self.0.clone(),
            }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn manual_capture_deduplicates_auto_and_enforces_retention_limits() {
        let f = Fixture::new();
        let repo = f.repo();

        assert!(capture(&repo, None, "auto", 10, 100, false).is_err());
        let clean_auto = capture(&repo, None, "auto", 10, 100, true).unwrap();
        assert!(!clean_auto.created);
        assert_eq!(
            capture(&repo, None, "manual", 10, 100, true)
                .unwrap_err()
                .code,
            "NO_CHANGES"
        );

        fs::write(f.0.join("app.txt"), "borrador uno\n").unwrap();
        fs::write(f.0.join("extra.txt"), "nuevo sin tracking\n").unwrap();

        let first = capture(
            &repo,
            Some("Trabajo antes de refactor"),
            "auto",
            10,
            100,
            true,
        )
        .unwrap();
        assert!(first.created);
        assert!(!first.deduplicated);
        assert_eq!(first.list.count, 1);

        let dup = capture(&repo, None, "auto", 10, 100, true).unwrap();
        assert!(!dup.created);
        assert!(dup.deduplicated);
        assert_eq!(dup.list.count, 1);

        // Exceed max_snapshots = 2
        fs::write(f.0.join("app.txt"), "borrador dos\n").unwrap();
        let second = capture(&repo, Some("Dos"), "manual", 2, 100, true).unwrap();
        assert_eq!(second.list.count, 2);

        fs::write(f.0.join("app.txt"), "borrador tres\n").unwrap();
        let third = capture(&repo, Some("Tres"), "manual", 2, 100, true).unwrap();
        assert_eq!(third.list.count, 2);
        assert_eq!(third.list.snapshots[0].label, "Tres");

        // Enforce disk cap by writing a larger payload with max_disk_mb = 1
        let big = vec![b'x'; 700 * 1024];
        fs::write(f.0.join("extra.txt"), &big).unwrap();
        capture(&repo, Some("Grande 1"), "manual", 20, 1, true).unwrap();
        fs::write(f.0.join("app.txt"), "borrador cuatro\n").unwrap();
        let capped = capture(&repo, Some("Grande 2"), "manual", 20, 1, true).unwrap();
        assert_eq!(capped.list.count, 1);
        assert_eq!(capped.list.snapshots[0].label, "Grande 2");
    }

    #[test]
    fn preview_confirm_creates_pre_restore_backup_and_rejects_stale_or_traversal() {
        let f = Fixture::new();
        let repo = f.repo();

        fs::write(f.0.join("app.txt"), "version valiosa\n").unwrap();
        fs::remove_file(f.0.join("keep.txt")).unwrap();
        let captured = capture(&repo, Some("Punto bueno"), "manual", 20, 100, true).unwrap();
        let snap_id = captured.snapshot.unwrap().id;

        // Mutate tree after snapshot
        fs::write(f.0.join("app.txt"), "edicion rota\n").unwrap();
        fs::write(f.0.join("keep.txt"), "recreado indeseado\n").unwrap();

        let plan = preview_restore(&repo, &snap_id, true).unwrap();
        assert!(!plan.branch_mismatch);
        assert!(
            plan.files
                .iter()
                .any(|p| p.path == "app.txt" && p.action == "restore")
        );
        assert!(
            plan.files
                .iter()
                .any(|p| p.path == "keep.txt" && p.action == "delete")
        );

        // External edit makes the plan stale
        fs::write(f.0.join("app.txt"), "otra edicion externa\n").unwrap();
        let stale_err = confirm_restore(&repo, plan, 20, 100, true).unwrap_err();
        assert_eq!(stale_err.code, "STALE_SNAPSHOT_RESTORE");

        // Fresh preview + confirm restores exact contents AND saves a pre-restore backup
        let fresh_plan = preview_restore(&repo, &snap_id, true).unwrap();
        let outcome = confirm_restore(&repo, fresh_plan, 20, 100, true).unwrap();
        assert_eq!(outcome.restored_files, 2);
        assert!(outcome.backup_snapshot_id.is_some());
        assert_eq!(
            fs::read_to_string(f.0.join("app.txt")).unwrap(),
            "version valiosa\n"
        );
        assert!(!f.0.join("keep.txt").exists());

        // Pre-restore backup appears in list and can be deleted cleanly
        let list_after = list(&repo, true).unwrap();
        assert_eq!(list_after.count, 2);
        assert_eq!(
            delete(&repo, "../escape", true).unwrap_err().code,
            "INVALID_SNAPSHOT_ID"
        );
        let after_del = delete(&repo, &snap_id, true).unwrap();
        assert_eq!(after_del.count, 1);
    }
}
