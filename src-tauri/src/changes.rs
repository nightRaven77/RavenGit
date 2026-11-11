use crate::git::{self, GitError, Repository, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

const LIMIT: usize = 2 * 1024 * 1024;
static NEXT: AtomicU64 = AtomicU64::new(0);
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub index_status: char,
    pub worktree_status: char,
    pub untracked: bool,
    pub conflict: bool,
    pub submodule: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Changes {
    pub token: String,
    pub entries: Vec<Entry>,
    pub head: Option<String>,
    pub branch: Option<String>,
    pub author: Option<String>,
    pub operation: Option<String>,
    pub trusted: bool,
}
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Area {
    Staged,
    Unstaged,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    pub index: usize,
    pub header: String,
    pub text: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub preview_token: String,
    pub token: String,
    pub path: String,
    pub area: Area,
    pub text: String,
    pub hunks: Vec<Hunk>,
    pub partial_allowed: bool,
    pub partial_reason: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult {
    pub commit_hash: Option<String>,
    pub changes: Option<Changes>,
    pub warning: Option<String>,
}
fn failure(code: &'static str, message: &str) -> GitError {
    GitError::new(code, message)
}
fn field(hash: &mut Sha256, bytes: &[u8]) {
    hash.update((bytes.len() as u64).to_le_bytes());
    hash.update(bytes);
}
fn metadata(repo: &Repository, name: &str) -> Result<PathBuf> {
    let path = git::text(
        &repo.path,
        &["rev-parse", "--path-format=absolute", "--git-path", name],
    )?;
    Ok(PathBuf::from(path.strip_suffix('\n').unwrap_or(&path)))
}
pub(crate) fn validated_path(repo: &Repository, path: &str) -> Result<PathBuf> {
    let relative = Path::new(path);
    if path.is_empty()
        || relative
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
        || relative
            .components()
            .any(|c| c.as_os_str().to_string_lossy().eq_ignore_ascii_case(".git"))
    {
        return Err(failure(
            "INVALID_PATH",
            "La ruta no es un archivo relativo permitido.",
        ));
    }
    let full = repo.path.join(relative);
    let parent = full
        .parent()
        .ok_or_else(|| failure("INVALID_PATH", "Ruta sin carpeta padre."))?;
    // Missing parent directories are valid for deleted files. Existing ancestors must stay inside the repository.
    let mut ancestor = parent;
    while !ancestor.exists() {
        ancestor = ancestor
            .parent()
            .ok_or_else(|| failure("INVALID_PATH", "Ruta inválida."))?;
    }
    if !ancestor
        .canonicalize()
        .map_err(|_| failure("INVALID_PATH", "No se pudo verificar la ruta."))?
        .starts_with(repo.path.canonicalize().map_err(|_| {
            failure(
                "INVALID_PATH",
                "No se pudo verificar la raíz del repositorio.",
            )
        })?)
    {
        return Err(failure(
            "PATH_ESCAPE",
            "La ruta atraviesa un enlace fuera del repositorio.",
        ));
    }
    Ok(full)
}
fn parse_status(raw: &[u8], submodules: &[String]) -> Result<Vec<Entry>> {
    raw.split(|b| *b == 0)
        .filter(|r| !r.is_empty())
        .map(|r| {
            if r.len() < 4 || r[2] != b' ' {
                return Err(failure(
                    "STATUS_FORMAT",
                    "Formato de estado Git inesperado.",
                ));
            }
            let path = String::from_utf8(r[3..].to_vec())
                .map_err(|_| failure("ENCODING", "Hay nombres de archivo que no son UTF-8."))?;
            let x = r[0] as char;
            let y = r[1] as char;
            Ok(Entry {
                submodule: submodules.contains(&path),
                path,
                index_status: x,
                worktree_status: y,
                untracked: x == '?' && y == '?',
                conflict: x == 'U' || y == 'U' || (x == 'A' && y == 'A') || (x == 'D' && y == 'D'),
            })
        })
        .collect()
}
fn author(repo: &Repository) -> Option<String> {
    let name = git::text(&repo.path, &["config", "--get", "user.name"]).ok()?;
    let email = git::text(&repo.path, &["config", "--get", "user.email"]).ok()?;
    let name = name.trim();
    let email = email.trim();
    if name.is_empty() || email.is_empty() {
        None
    } else {
        Some(format!("{name} <{email}>"))
    }
}
pub fn read(repo: &Repository, trusted: bool) -> Result<Changes> {
    if !trusted {
        return Ok(Changes {
            token: String::new(),
            entries: vec![],
            head: None,
            branch: None,
            author: None,
            operation: None,
            trusted: false,
        });
    }

    let before = git::text(&repo.path, &["rev-parse", "--verify", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string());
    let branch = git::text(&repo.path, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string());
    let index_entries = git::run(&repo.path, &["ls-files", "--stage", "-z"])?;
    let submodules: Vec<String> = index_entries
        .split(|b| *b == 0)
        .filter(|r| r.starts_with(b"160000 "))
        .filter_map(|r| {
            r.iter()
                .position(|b| *b == b'\t')
                .and_then(|i| String::from_utf8(r[i + 1..].to_vec()).ok())
        })
        .collect();
    let raw = git::run(
        &repo.path,
        &[
            "-c",
            "status.renames=false",
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
            "--ignore-submodules=none",
        ],
    )?;
    let entries = parse_status(&raw, &submodules)?;
    let index_path = metadata(repo, "index")?;
    let index = match fs::read(&index_path) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => vec![],
        Err(_) => return Err(failure("INDEX_READ", "No se pudo leer el index.")),
    };
    let mut hash = Sha256::new();
    field(&mut hash, before.as_deref().unwrap_or("").as_bytes());
    field(&mut hash, branch.as_deref().unwrap_or("").as_bytes());
    field(&mut hash, &index);
    field(&mut hash, &raw);
    for entry in &entries {
        field(&mut hash, entry.path.as_bytes());
        let full = validated_path(repo, &entry.path)?;
        match fs::symlink_metadata(&full) {
            Ok(m) if m.file_type().is_symlink() => {
                field(&mut hash, b"symlink");
                field(
                    &mut hash,
                    fs::read_link(&full)
                        .map_err(|_| failure("FILE_READ", "No se pudo leer un enlace."))?
                        .as_os_str()
                        .as_encoded_bytes(),
                );
            }
            Ok(m) if m.is_file() => {
                if m.len() > 64 * 1024 * 1024 {
                    return Err(failure(
                        "FILE_LIMIT",
                        "Este incremento admite archivos modificados de hasta 64 MiB.",
                    ));
                }
                let mut file = File::open(&full)
                    .map_err(|_| failure("FILE_READ", "No se pudo leer un archivo modificado."))?;
                field(&mut hash, b"file");
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    hash.update(m.permissions().mode().to_le_bytes());
                }
                hash.update([u8::from(m.permissions().readonly())]);
                hash.update(m.len().to_le_bytes());
                let mut buffer = [0u8; 65536];
                let mut total = 0u64;
                loop {
                    let n = file.read(&mut buffer).map_err(|_| {
                        failure("FILE_READ", "El archivo cambió o no puede leerse.")
                    })?;
                    if n == 0 {
                        break;
                    }
                    total += n as u64;
                    if total > 64 * 1024 * 1024 {
                        return Err(failure(
                            "FILE_LIMIT",
                            "El archivo creció durante la lectura.",
                        ));
                    }
                    hash.update(&buffer[..n]);
                }
            }
            Ok(_) => field(&mut hash, b"directory"),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => field(&mut hash, b"missing"),
            Err(_) => return Err(failure("FILE_READ", "No se pudo comprobar un archivo.")),
        }
    }
    let operation_names = [
        "rebase-merge",
        "rebase-apply",
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "sequencer",
        "BISECT_LOG",
    ];
    let mut operation = None;
    for name in operation_names {
        if metadata(repo, name)?.exists() {
            operation = Some(name.to_string());
            break;
        }
    }
    let author = author(repo);
    field(&mut hash, author.as_deref().unwrap_or("").as_bytes());
    field(&mut hash, operation.as_deref().unwrap_or("").as_bytes());
    let after = git::text(&repo.path, &["rev-parse", "--verify", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string());
    let index_after = fs::read(&index_path).unwrap_or_default();
    if before != after || index != index_after {
        return Err(failure(
            "STALE_CHANGES",
            "HEAD o el index cambiaron durante la lectura. Actualiza los cambios.",
        ));
    }
    Ok(Changes {
        token: format!("{:x}", hash.finalize()),
        entries,
        head: before,
        branch,
        author,
        operation,
        trusted,
    })
}
fn checked(repo: &Repository, token: &str, trusted: bool, write: bool) -> Result<Changes> {
    if !trusted {
        return Err(failure(
            "TRUST_REQUIRED",
            "Autoriza la inspección de este repositorio antes de consultar archivos o ejecutar operaciones Git.",
        ));
    }
    let state = read(repo, trusted)?;
    if state.token != token {
        return Err(failure(
            "STALE_CHANGES",
            "El repositorio cambió desde la vista previa. Actualiza antes de continuar.",
        ));
    }
    if write {
        if !trusted {
            return Err(failure(
                "TRUST_REQUIRED",
                "Habilita las operaciones locales para este repositorio.",
            ));
        }
        if state.operation.is_some()
            || state.entries.iter().any(|e| e.conflict)
            || metadata(repo, "ravengit-replay.json")?.exists()
            || metadata(repo, "ravengit-stash.json")?.exists()
        {
            return Err(failure(
                "OPERATION_ACTIVE",
                "Hay una operación Git o conflictos en curso. Este incremento no permite modificar ese estado.",
            ));
        }
    }
    Ok(state)
}
fn entry<'a>(state: &'a Changes, path: &str, area: Area) -> Result<&'a Entry> {
    state
        .entries
        .iter()
        .find(|e| {
            e.path == path
                && match area {
                    Area::Staged => e.index_status != ' ' && !e.untracked,
                    Area::Unstaged => e.worktree_status != ' ' || e.untracked,
                }
        })
        .ok_or_else(|| {
            failure(
                "FILE_CHANGED",
                "El archivo ya no está en esta sección. Actualiza la vista.",
            )
        })
}
fn hunks(text: &str) -> (String, Vec<Hunk>) {
    let mut header = String::new();
    let mut result: Vec<Hunk> = vec![];
    for line in text.split_inclusive('\n') {
        if line.starts_with("@@ ") {
            result.push(Hunk {
                index: result.len(),
                header: line.trim_end_matches('\n').to_string(),
                text: line.to_string(),
            });
        } else if let Some(current) = result.last_mut() {
            current.text.push_str(line);
        } else {
            header.push_str(line);
        }
    }
    (header, result)
}
pub fn file_diff(
    repo: &Repository,
    token: &str,
    path: &str,
    area: Area,
    trusted: bool,
) -> Result<FileDiff> {
    let state = checked(repo, token, trusted, false)?;
    let current = entry(&state, path, area)?;
    let full = validated_path(repo, path)?;
    let content = if current.untracked {
        let meta = fs::symlink_metadata(&full)
            .map_err(|_| failure("FILE_CHANGED", "El archivo ya no está disponible."))?;
        if meta.file_type().is_symlink() {
            format!(
                "Enlace simbólico → {}",
                fs::read_link(&full)
                    .map_err(|_| failure("FILE_READ", "No se pudo leer el enlace."))?
                    .display()
            )
        } else if !meta.is_file() {
            "Directorio o repositorio anidado; staging no disponible en este incremento."
                .to_string()
        } else {
            if meta.len() > LIMIT as u64 {
                return Err(failure(
                    "OUTPUT_LIMIT",
                    "La vista previa supera 2 MiB. Puedes preparar el archivo completo si conoces su contenido.",
                ));
            }
            let bytes =
                fs::read(&full).map_err(|_| failure("FILE_READ", "No se pudo leer el archivo."))?;
            if bytes.contains(&0) {
                "Archivo binario nuevo. Sólo se puede preparar el archivo completo.".to_string()
            } else {
                String::from_utf8(bytes).unwrap_or_else(|_| {
                    "Contenido no UTF-8. Sólo se puede preparar el archivo completo.".into()
                })
            }
        }
    } else {
        let mut args = vec![
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "--no-renames",
            "--no-relative",
            "--src-prefix=a/",
            "--dst-prefix=b/",
            "--unified=3",
        ];
        if matches!(area, Area::Staged) {
            args.push("--cached");
        }
        args.extend(["--", path]);
        git::text(&repo.path, &args)?
    };
    let (_, mut blocks) = hunks(&content);
    let reason = if current.untracked {
        Some("Los archivos nuevos se preparan completos en esta fase.")
    } else if current.conflict || current.submodule {
        Some("Conflictos y submódulos requieren otro flujo.")
    } else if content.contains("new file mode ")
        || content.contains("deleted file mode ")
        || content.contains("old mode ")
        || content.contains("new mode ")
        || content.contains("Binary files ")
        || content.contains("GIT binary patch")
    {
        Some("Cambios binarios, de tipo o de permisos se preparan completos.")
    } else if blocks.is_empty() {
        Some("No hay bloques de texto aplicables.")
    } else if !fs::symlink_metadata(&full).is_ok_and(|m| m.is_file() && !m.file_type().is_symlink())
    {
        Some("Este tipo de archivo no admite preparación parcial.")
    } else {
        None
    };
    if reason.is_some() {
        blocks.clear();
    }
    checked(repo, token, trusted, false)?;
    Ok(FileDiff {
        preview_token: format!("{:x}", Sha256::digest(content.as_bytes())),
        token: state.token,
        path: path.into(),
        area,
        text: content,
        hunks: blocks,
        partial_allowed: reason.is_none(),
        partial_reason: reason.map(String::from),
    })
}

pub(crate) struct IndexTransaction {
    index: PathBuf,
    lock: PathBuf,
    pub(crate) temporary: PathBuf,
    lock_file: Option<File>,
}
impl IndexTransaction {
    pub(crate) fn start(repo: &Repository) -> Result<Self> {
        if !git::text(&repo.path, &["rev-parse", "--shared-index-path"])?
            .trim()
            .is_empty()
        {
            return Err(failure(
                "SPLIT_INDEX",
                "El staging con split index aún no está soportado. No se cambia su configuración.",
            ));
        }
        let index = metadata(repo, "index")?;
        let mut name = index.as_os_str().to_os_string();
        name.push(".lock");
        let lock = PathBuf::from(name);
        let lock_file=OpenOptions::new().write(true).create_new(true).open(&lock).map_err(|_|failure("INDEX_LOCKED","El index está ocupado o no es escribible. No se elimina ningún lock existente."))?;
        let directory = index.with_file_name(format!(
            "ravengit-index-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        if fs::create_dir(&directory).is_err() {
            drop(lock_file);
            let _ = fs::remove_file(&lock);
            return Err(failure(
                "INDEX_COPY",
                "No se pudo crear una carpeta temporal exclusiva.",
            ));
        }
        let temporary = directory.join("index");
        let transaction = Self {
            index,
            lock,
            temporary,
            lock_file: Some(lock_file),
        };
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
                .map_err(|_| failure("INDEX_COPY", "No se pudo proteger la carpeta temporal."))?;
        }
        if transaction.index.exists() {
            fs::copy(&transaction.index, &transaction.temporary)
                .map_err(|_| failure("INDEX_COPY", "No se pudo preparar un index temporal."))?;
        }
        Ok(transaction)
    }
    pub(crate) fn install(mut self) -> Result<()> {
        let bytes = fs::read(&self.temporary).map_err(|_| {
            failure(
                "INDEX_INSTALL",
                "No se pudo leer el index temporal. Actualiza antes de repetir.",
            )
        })?;
        let file = self.lock_file.as_mut().unwrap();
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| {
                failure(
                    "INDEX_INSTALL",
                    "No se pudo guardar el index. Actualiza antes de repetir.",
                )
            })?;
        if let Ok(meta) = fs::metadata(&self.index) {
            fs::set_permissions(&self.lock, meta.permissions()).map_err(|_| {
                failure(
                    "INDEX_INSTALL",
                    "No se pudieron conservar los permisos del index.",
                )
            })?;
        }
        drop(self.lock_file.take());
        fs::rename(&self.lock, &self.index).map_err(|_| {
            failure(
                "INDEX_INSTALL",
                "No se pudo instalar el index. Actualiza antes de repetir.",
            )
        })?;
        Ok(())
    }
}
impl Drop for IndexTransaction {
    fn drop(&mut self) {
        drop(self.lock_file.take());
        let _ = fs::remove_file(&self.lock);
        let _ = fs::remove_file(&self.temporary);
        let mut lock = self.temporary.as_os_str().to_os_string();
        lock.push(".lock");
        let _ = fs::remove_file(PathBuf::from(lock));
        if let Some(directory) = self.temporary.parent() {
            let _ = fs::remove_dir(directory);
        }
    }
}
pub(crate) fn write_git(
    repo: &Repository,
    index: &Path,
    args: &[&str],
    input: Option<Vec<u8>>,
) -> Result<()> {
    write_git_timeout(repo, index, args, input, Duration::from_secs(60))
}
fn write_git_timeout(
    repo: &Repository,
    index: &Path,
    args: &[&str],
    input: Option<Vec<u8>>,
    timeout: Duration,
) -> Result<()> {
    let mut command = crate::process::git(&repo.path);
    command
        .args(args)
        .env("GIT_INDEX_FILE", index)
        .env_remove("GIT_AUTHOR_NAME")
        .env_remove("GIT_AUTHOR_EMAIL")
        .env_remove("GIT_COMMITTER_NAME")
        .env_remove("GIT_COMMITTER_EMAIL")
        .env("GIT_EDITOR", "");
    let output = crate::process::execute(command, input, timeout).map_err(|e| match e {
        crate::process::Error::Start => failure("GIT_UNAVAILABLE", "No se pudo iniciar Git de forma controlada. Comprueba su instalación y las restricciones de procesos del sistema."),
        crate::process::Error::Input => failure("WRITE_UNCERTAIN", "Git no pudo completar la entrada de datos. Comprueba HEAD e index antes de repetir; la operación puede haber producido cambios."),
        crate::process::Error::Timeout => failure("WRITE_UNCERTAIN", "Git o sus auxiliares no terminaron dentro del tiempo permitido. Comprueba HEAD e index antes de repetir; un hook puede haber producido cambios."),
    })?;
    if output.success {
        Ok(())
    } else {
        Err(failure(
            "WRITE_FAILED",
            "Git rechazó la operación. Revisa permisos, hooks e identidad/firma desde una terminal. El mensaje se conserva; un hook puede haber modificado archivos.",
        ))
    }
}
fn outcome(repo: &Repository, trusted: bool, hash: Option<String>) -> MutationResult {
    match read(repo,trusted){Ok(changes)=>MutationResult{commit_hash:hash,changes:Some(changes),warning:None},Err(_)=>MutationResult{commit_hash:hash,changes:None,warning:Some("La operación terminó, pero no se pudo actualizar la vista. Actualiza antes de continuar.".into())}}
}
pub fn stage(
    repo: &Repository,
    token: &str,
    path: &str,
    area: Area,
    hunk_index: Option<usize>,
    preview_token: Option<&str>,
    trusted: bool,
) -> Result<MutationResult> {
    if !trusted {
        return Err(failure(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de modificar el index o crear commits.",
        ));
    }
    let transaction = IndexTransaction::start(repo)?;
    let state = checked(repo, token, trusted, true)?;
    let current = entry(&state, path, area)?;
    let full = validated_path(repo, path)?;
    if current.submodule || fs::symlink_metadata(&full).is_ok_and(|m| m.is_dir()) {
        return Err(failure(
            "UNSUPPORTED_TYPE",
            "Submódulos y repositorios anidados no se preparan en esta fase.",
        ));
    }
    if let Some(hunk_index) = hunk_index {
        let view = file_diff(repo, token, path, area, trusted)?;
        if preview_token != Some(view.preview_token.as_str()) {
            return Err(failure(
                "STALE_PREVIEW",
                "El diff cambió desde la vista previa. Actualiza antes de preparar este bloque.",
            ));
        }
        if !view.partial_allowed {
            return Err(failure(
                "PARTIAL_UNAVAILABLE",
                "Este archivo sólo admite preparación completa.",
            ));
        }
        let hunk = view
            .hunks
            .get(hunk_index)
            .ok_or_else(|| failure("STALE_HUNK", "El bloque ya no existe. Actualiza el diff."))?;
        let (header, _) = hunks(&view.text);
        let patch = format!("{header}{}", hunk.text).into_bytes();
        let mut args = vec!["apply", "--cached", "--recount", "--whitespace=nowarn"];
        if matches!(area, Area::Staged) {
            args.push("--reverse");
        }
        let mut check = args.clone();
        check.push("--check");
        check.push("-");
        write_git(repo, &transaction.temporary, &check, Some(patch.clone()))?;
        args.push("-");
        write_git(repo, &transaction.temporary, &args, Some(patch))?;
    } else {
        match area {
            Area::Unstaged => write_git(repo, &transaction.temporary, &["add", "--", path], None)?,
            Area::Staged if state.head.is_some() => write_git(
                repo,
                &transaction.temporary,
                &["restore", "--source=HEAD", "--staged", "--", path],
                None,
            )?,
            Area::Staged => write_git(
                repo,
                &transaction.temporary,
                &["update-index", "--force-remove", "--", path],
                None,
            )?,
        }
    }
    checked(repo, token, trusted, true)?;
    transaction.install()?;
    Ok(outcome(repo, trusted, None))
}
pub fn stage_files(
    repo: &Repository,
    token: &str,
    paths: &[String],
    trusted: bool,
) -> Result<MutationResult> {
    if !trusted {
        return Err(failure(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de modificar el index o crear commits.",
        ));
    }
    if paths.is_empty() {
        return Err(failure(
            "INVALID_SELECTION",
            "Selecciona al menos un archivo sin preparar.",
        ));
    }
    let transaction = IndexTransaction::start(repo)?;
    let state = checked(repo, token, trusted, true)?;
    if paths.len() > state.entries.len() {
        return Err(failure(
            "INVALID_SELECTION",
            "La selección no coincide con los cambios revisados. Actualiza.",
        ));
    }
    let mut unique = HashSet::with_capacity(paths.len());
    for path in paths {
        if !unique.insert(path.as_str()) {
            return Err(failure(
                "INVALID_SELECTION",
                "La selección contiene archivos repetidos. Actualiza.",
            ));
        }
        let current = entry(&state, path, Area::Unstaged)?;
        let full = validated_path(repo, path)?;
        if current.submodule || fs::symlink_metadata(&full).is_ok_and(|m| m.is_dir()) {
            return Err(failure(
                "UNSUPPORTED_TYPE",
                "Submódulos y repositorios anidados no se preparan en esta fase.",
            ));
        }
    }
    for path in paths {
        write_git(repo, &transaction.temporary, &["add", "--", path], None)?;
    }
    checked(repo, token, trusted, true)?;
    transaction.install()?;
    Ok(outcome(repo, trusted, None))
}
pub fn commit(
    repo: &Repository,
    token: &str,
    message: &str,
    trusted: bool,
) -> Result<MutationResult> {
    commit_impl(repo, token, message, trusted, false)
}
pub(crate) fn amend(
    repo: &Repository,
    token: &str,
    message: &str,
    trusted: bool,
) -> Result<MutationResult> {
    commit_impl(repo, token, message, trusted, true)
}
fn commit_impl(
    repo: &Repository,
    token: &str,
    message: &str,
    trusted: bool,
    amend: bool,
) -> Result<MutationResult> {
    if message.trim().is_empty() || message.len() > 65536 || message.contains('\0') {
        return Err(failure(
            "INVALID_MESSAGE",
            "Escribe un mensaje de commit válido de hasta 64 KiB.",
        ));
    }
    if !trusted {
        return Err(failure(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de modificar el index o crear commits.",
        ));
    }
    let transaction = IndexTransaction::start(repo)?;
    let state = checked(repo, token, trusted, true)?;
    if state.branch.is_none() {
        return Err(failure(
            "DETACHED_HEAD",
            "Los commits con HEAD separado quedan para una fase posterior.",
        ));
    }
    if state.author.is_none() {
        return Err(failure(
            "AUTHOR_REQUIRED",
            "Configura user.name y user.email en Git antes de crear un commit.",
        ));
    }
    if amend && state.head.is_none() {
        return Err(failure("AMEND_HEAD", "No hay un commit que reemplazar."));
    }
    if !amend
        && !state
            .entries
            .iter()
            .any(|e| !e.untracked && e.index_status != ' ')
    {
        return Err(failure("NOTHING_STAGED", "No hay cambios preparados."));
    }
    if state
        .entries
        .iter()
        .any(|e| e.submodule && e.index_status != ' ')
    {
        return Err(failure(
            "UNSUPPORTED_TYPE",
            "Los commits de submódulos requieren otro flujo.",
        ));
    }
    let args = if amend {
        vec!["commit", "--amend", "--file=-", "--cleanup=verbatim"]
    } else {
        vec!["commit", "--file=-", "--cleanup=verbatim"]
    };
    write_git(
        repo,
        &transaction.temporary,
        &args,
        Some(message.as_bytes().to_vec()),
    )?;
    let hash = git::text(&repo.path, &["rev-parse", "--verify", "HEAD"])
        .map_err(|_| {
            failure(
                "COMMIT_UNCERTAIN",
                "Git terminó, pero no se pudo comprobar HEAD. Actualiza antes de repetir.",
            )
        })?
        .trim()
        .to_string();
    if !amend && state.head.as_deref() == Some(hash.as_str()) {
        return Err(failure(
            "COMMIT_UNCERTAIN",
            "HEAD no cambió como se esperaba. Actualiza antes de repetir.",
        ));
    }
    if transaction.install().is_err() {
        return Ok(MutationResult{commit_hash:Some(hash),changes:None,warning:Some("El commit se creó, pero el index no pudo actualizarse. No repitas el commit: revisa el estado desde una terminal.".into())});
    }
    Ok(outcome(repo, trusted, Some(hash)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;
    struct Fixture(Repository);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "ravengit-changes-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            let f = Self(Repository {
                id: "test".into(),
                path,
            });
            f.git(&["init", "-b", "main"]);
            f.git(&["config", "user.name", "RavenGit Fixture"]);
            f.git(&["config", "user.email", "fixture@example.invalid"]);
            f.git(&["config", "commit.gpgsign", "false"]);
            f.git(&["config", "core.autocrlf", "false"]);
            f.git(&[
                "config",
                "core.hooksPath",
                f.0.path.join(".git/no-hooks").to_str().unwrap(),
            ]);
            f
        }
        fn git(&self, args: &[&str]) -> String {
            git::text(&self.0.path, args).unwrap()
        }
        fn file(&self, name: &str, text: &str) {
            fs::write(self.0.path.join(name), text).unwrap();
        }
        fn base(&self) {
            self.file(
                "archivo ü.txt",
                &format!("inicio\n{}final\n", "contexto\n".repeat(20)),
            );
            self.git(&["add", "--all"]);
            self.git(&["commit", "-m", "base"]);
        }
        fn modified(&self) {
            self.file(
                "archivo ü.txt",
                &format!("INICIO\n{}FINAL\n", "contexto\n".repeat(20)),
            );
        }
        fn state(&self) -> Changes {
            read(&self.0, true).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0.path);
        }
    }
    #[test]
    fn stage_one_hunk_commit_only_that_hunk() {
        let f = Fixture::new();
        f.base();
        f.modified();
        let state = f.state();
        let preview = file_diff(&f.0, &state.token, "archivo ü.txt", Area::Unstaged, true).unwrap();
        assert_eq!(preview.hunks.len(), 2);
        let result = stage(
            &f.0,
            &state.token,
            "archivo ü.txt",
            Area::Unstaged,
            Some(0),
            Some(&preview.preview_token),
            true,
        )
        .unwrap();
        let state = result.changes.unwrap();
        let index = f.git(&["show", ":0:archivo ü.txt"]);
        assert!(index.starts_with("INICIO\n"));
        assert!(index.ends_with("final\n"));
        let result = commit(&f.0, &state.token, "preparar sólo primer bloque", true).unwrap();
        assert!(result.commit_hash.is_some());
        let tree = f.git(&["show", "HEAD:archivo ü.txt"]);
        assert_eq!(tree, index);
        assert!(
            fs::read_to_string(f.0.path.join("archivo ü.txt"))
                .unwrap()
                .ends_with("FINAL\n")
        );
        assert!(
            result
                .changes
                .unwrap()
                .entries
                .iter()
                .any(|e| e.index_status == ' ' && e.worktree_status == 'M')
        );
    }
    #[test]
    fn unstage_hunk_and_file_preserve_working_tree() {
        let f = Fixture::new();
        f.base();
        f.modified();
        let original = fs::read(f.0.path.join("archivo ü.txt")).unwrap();
        let state = f.state();
        let state = stage(
            &f.0,
            &state.token,
            "archivo ü.txt",
            Area::Unstaged,
            None,
            None,
            true,
        )
        .unwrap()
        .changes
        .unwrap();
        let view = file_diff(&f.0, &state.token, "archivo ü.txt", Area::Staged, true).unwrap();
        assert_eq!(view.hunks.len(), 2);
        let state = stage(
            &f.0,
            &state.token,
            "archivo ü.txt",
            Area::Staged,
            Some(1),
            Some(&view.preview_token),
            true,
        )
        .unwrap()
        .changes
        .unwrap();
        assert!(f.git(&["show", ":0:archivo ü.txt"]).ends_with("final\n"));
        stage(
            &f.0,
            &state.token,
            "archivo ü.txt",
            Area::Staged,
            None,
            None,
            true,
        )
        .unwrap();
        assert_eq!(f.git(&["diff", "--cached"]), "");
        assert_eq!(fs::read(f.0.path.join("archivo ü.txt")).unwrap(), original);
    }
    #[test]
    fn initial_commit_and_unstage_new_literal_path() {
        let f = Fixture::new();
        #[cfg(unix)]
        let path = ":(glob)* ü\n.txt";
        #[cfg(not(unix))]
        let path = "[literal] ü.txt";
        f.file(path, "nuevo\n");
        f.file("otro.txt", "no preparar\n");
        let state = f.state();
        let state = stage(&f.0, &state.token, path, Area::Unstaged, None, None, true)
            .unwrap()
            .changes
            .unwrap();
        assert!(
            state
                .entries
                .iter()
                .any(|e| e.path == path && e.index_status == 'A')
        );
        let state = stage(&f.0, &state.token, path, Area::Staged, None, None, true)
            .unwrap()
            .changes
            .unwrap();
        assert!(state.entries.iter().any(|e| e.path == path && e.untracked));
        let state = stage(&f.0, &state.token, path, Area::Unstaged, None, None, true)
            .unwrap()
            .changes
            .unwrap();
        let result = commit(&f.0, &state.token, "primer commit", true).unwrap();
        assert!(result.commit_hash.is_some());
        assert_eq!(
            f.git(&["ls-tree", "-r", "--name-only", "-z", "HEAD"]),
            format!("{path}\0")
        );
    }
    #[test]
    fn stage_multiple_files_installs_one_reviewed_index() {
        let f = Fixture::new();
        f.base();
        f.file("eliminar.txt", "eliminar\n");
        f.file("sin seleccionar.txt", "anterior\n");
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "archivos base"]);
        f.modified();
        fs::remove_file(f.0.path.join("eliminar.txt")).unwrap();
        f.file("nuevo ü.txt", "nuevo\n");
        f.file("sin seleccionar.txt", "posterior\n");
        let state = f.state();
        let selected = vec![
            "archivo ü.txt".to_string(),
            "eliminar.txt".to_string(),
            "nuevo ü.txt".to_string(),
        ];
        let result = stage_files(&f.0, &state.token, &selected, true).unwrap();
        let staged = f
            .git(&["diff", "--cached", "--name-only", "-z"])
            .split('\0')
            .filter(|path| !path.is_empty())
            .map(str::to_string)
            .collect::<HashSet<_>>();
        assert_eq!(staged, selected.into_iter().collect());
        let state = result.changes.unwrap();
        assert!(state.entries.iter().any(|entry| {
            entry.path == "sin seleccionar.txt"
                && entry.index_status == ' '
                && entry.worktree_status == 'M'
        }));
        assert_eq!(
            fs::read_to_string(f.0.path.join("sin seleccionar.txt")).unwrap(),
            "posterior\n"
        );
        assert!(!f.0.path.join(".git/index.lock").exists());
    }
    #[test]
    fn stage_multiple_files_rejects_invalid_or_stale_selection_atomically() {
        let f = Fixture::new();
        f.base();
        f.modified();
        f.file("otro.txt", "nuevo\n");
        let state = f.state();
        let index = fs::read(f.0.path.join(".git/index")).unwrap();
        assert_eq!(
            stage_files(&f.0, &state.token, &[], true).unwrap_err().code,
            "INVALID_SELECTION"
        );
        assert_eq!(
            stage_files(
                &f.0,
                &state.token,
                &["archivo ü.txt".into(), "archivo ü.txt".into()],
                true,
            )
            .unwrap_err()
            .code,
            "INVALID_SELECTION"
        );
        assert_eq!(
            stage_files(
                &f.0,
                &state.token,
                &["archivo ü.txt".into(), "desconocido.txt".into()],
                true,
            )
            .unwrap_err()
            .code,
            "FILE_CHANGED"
        );
        assert_eq!(fs::read(f.0.path.join(".git/index")).unwrap(), index);
        f.file("otro.txt", "cambió\n");
        assert_eq!(
            stage_files(&f.0, &state.token, &["archivo ü.txt".into()], true)
                .unwrap_err()
                .code,
            "STALE_CHANGES"
        );
        assert_eq!(fs::read(f.0.path.join(".git/index")).unwrap(), index);
        assert!(!f.0.path.join(".git/index.lock").exists());
    }
    #[test]
    fn stale_working_tree_index_and_head_are_rejected() {
        let f = Fixture::new();
        f.base();
        f.modified();
        let state = f.state();
        f.file("archivo ü.txt", "edición externa\n");
        assert_eq!(
            stage(
                &f.0,
                &state.token,
                "archivo ü.txt",
                Area::Unstaged,
                None,
                None,
                true
            )
            .unwrap_err()
            .code,
            "STALE_CHANGES"
        );
        assert_eq!(f.git(&["diff", "--cached"]), "");
        let state = f.state();
        f.git(&["add", "--all"]);
        assert_eq!(
            commit(&f.0, &state.token, "obsoleto", true)
                .unwrap_err()
                .code,
            "STALE_CHANGES"
        );
        let state = f.state();
        f.git(&["commit", "-m", "externo"]);
        assert_eq!(
            commit(&f.0, &state.token, "obsoleto", true)
                .unwrap_err()
                .code,
            "STALE_CHANGES"
        );
    }
    #[test]
    fn existing_lock_is_preserved_and_trust_is_required() {
        let f = Fixture::new();
        f.base();
        f.modified();
        let state = f.state();
        let lock = f.0.path.join(".git/index.lock");
        fs::write(&lock, "otro proceso").unwrap();
        assert_eq!(
            stage(
                &f.0,
                &state.token,
                "archivo ü.txt",
                Area::Unstaged,
                None,
                None,
                true
            )
            .unwrap_err()
            .code,
            "INDEX_LOCKED"
        );
        assert_eq!(fs::read_to_string(&lock).unwrap(), "otro proceso");
        fs::remove_file(lock).unwrap();
        assert_eq!(
            stage(
                &f.0,
                &state.token,
                "archivo ü.txt",
                Area::Unstaged,
                None,
                None,
                false
            )
            .unwrap_err()
            .code,
            "TRUST_REQUIRED"
        );
        assert_eq!(f.git(&["diff", "--cached"]), "");
    }
    #[test]
    fn commit_rejects_empty_message_and_pending_operation() {
        let f = Fixture::new();
        f.base();
        f.modified();
        let state = f.state();
        let state = stage(
            &f.0,
            &state.token,
            "archivo ü.txt",
            Area::Unstaged,
            None,
            None,
            true,
        )
        .unwrap()
        .changes
        .unwrap();
        assert_eq!(
            commit(&f.0, &state.token, "  ", true).unwrap_err().code,
            "INVALID_MESSAGE"
        );
        fs::write(f.0.path.join(".git/MERGE_HEAD"), state.head.unwrap()).unwrap();
        let state = f.state();
        assert_eq!(
            commit(&f.0, &state.token, "merge", true).unwrap_err().code,
            "OPERATION_ACTIVE"
        );
    }
    #[test]
    fn changed_diff_configuration_invalidates_hunk_preview() {
        let f = Fixture::new();
        f.base();
        f.modified();
        let state = f.state();
        let view = file_diff(&f.0, &state.token, "archivo ü.txt", Area::Unstaged, true).unwrap();
        assert_eq!(view.hunks.len(), 2);
        f.git(&["config", "diff.interHunkContext", "100"]);
        assert_eq!(
            stage(
                &f.0,
                &state.token,
                "archivo ü.txt",
                Area::Unstaged,
                Some(0),
                Some(&view.preview_token),
                true
            )
            .unwrap_err()
            .code,
            "STALE_PREVIEW"
        );
        assert_eq!(f.git(&["diff", "--cached"]), "");
    }
    #[test]
    fn split_index_is_rejected_without_changing_its_configuration() {
        let f = Fixture::new();
        f.base();
        f.git(&["update-index", "--split-index"]);
        f.modified();
        let state = f.state();
        let before = f.git(&["rev-parse", "--shared-index-path"]);
        assert!(!before.trim().is_empty());
        assert_eq!(
            stage(
                &f.0,
                &state.token,
                "archivo ü.txt",
                Area::Unstaged,
                None,
                None,
                true
            )
            .unwrap_err()
            .code,
            "SPLIT_INDEX"
        );
        assert_eq!(before, f.git(&["rev-parse", "--shared-index-path"]));
    }
    #[test]
    fn hook_failure_preserves_index_and_head() {
        #[cfg(unix)]
        use std::os::unix::fs::PermissionsExt;
        let f = Fixture::new();
        f.base();
        f.modified();
        let state = f.state();
        let state = stage(
            &f.0,
            &state.token,
            "archivo ü.txt",
            Area::Unstaged,
            None,
            None,
            true,
        )
        .unwrap()
        .changes
        .unwrap();
        let hook_dir = f.0.path.join(".git/hooks-test");
        fs::create_dir(&hook_dir).unwrap();
        let hook = hook_dir.join("pre-commit");
        fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
        #[cfg(unix)]
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
        f.git(&["config", "core.hooksPath", hook_dir.to_str().unwrap()]);
        let before_index = fs::read(f.0.path.join(".git/index")).unwrap();
        let before_head = f.git(&["rev-parse", "HEAD"]);
        assert_eq!(
            commit(&f.0, &state.token, "mensaje que conservar", true)
                .unwrap_err()
                .code,
            "WRITE_FAILED"
        );
        assert_eq!(before_head, f.git(&["rev-parse", "HEAD"]));
        assert_eq!(before_index, fs::read(f.0.path.join(".git/index")).unwrap());
        assert!(!f.0.path.join(".git/index.lock").exists());
    }
    #[test]
    fn hook_timeout_does_not_hold_the_worker_on_inherited_pipes() {
        #[cfg(unix)]
        use std::os::unix::fs::PermissionsExt;
        let f = Fixture::new();
        f.base();
        f.modified();
        let state = f.state();
        stage(
            &f.0,
            &state.token,
            "archivo ü.txt",
            Area::Unstaged,
            None,
            None,
            true,
        )
        .unwrap();
        let hooks = f.0.path.join(".git/hooks-timeout");
        fs::create_dir(&hooks).unwrap();
        let hook = hooks.join("pre-commit");
        fs::write(&hook, "#!/bin/sh\nsleep 10\n").unwrap();
        #[cfg(unix)]
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
        f.git(&["config", "core.hooksPath", hooks.to_str().unwrap()]);
        let before = f.git(&["rev-parse", "HEAD"]);
        let transaction = IndexTransaction::start(&f.0).unwrap();
        let start = Instant::now();
        assert_eq!(
            write_git_timeout(
                &f.0,
                &transaction.temporary,
                &["commit", "--file=-"],
                Some(b"timeout".to_vec()),
                Duration::from_millis(250)
            )
            .unwrap_err()
            .code,
            "WRITE_UNCERTAIN"
        );
        assert!(start.elapsed() < Duration::from_secs(3));
        drop(transaction);
        assert_eq!(before, f.git(&["rev-parse", "HEAD"]));
        assert!(!f.0.path.join(".git/index.lock").exists());
    }
    #[cfg(unix)]
    #[test]
    fn symlink_parent_escape_is_rejected() {
        let f = Fixture::new();
        std::os::unix::fs::symlink(std::env::temp_dir(), f.0.path.join("escape")).unwrap();
        assert!(validated_path(&f.0, "../archivo").is_err());
        assert!(validated_path(&f.0, ".git/config").is_err());
        assert!(validated_path(&f.0, "escape/archivo").is_err());
    }
    #[test]
    fn inspecting_untrusted_changes_never_runs_clean_filters_or_touches_index() {
        let f = Fixture::new();
        f.file("file.txt", "before\n");
        f.file(".gitattributes", "file.txt filter=review\n");
        f.git(&["add", "."]);
        f.git(&["commit", "-m", "base"]);
        f.git(&[
            "config",
            "filter.review.clean",
            "touch .git/filter-marker; cat",
        ]);
        f.file("file.txt", "after!\n");
        let index = fs::read(f.0.path.join(".git/index")).unwrap();
        let locked = read(&f.0, false).unwrap();
        assert!(!locked.trusted);
        assert!(locked.entries.is_empty());
        assert!(!f.0.path.join(".git/filter-marker").exists());
        assert_eq!(
            file_diff(&f.0, "", "file.txt", Area::Unstaged, false)
                .unwrap_err()
                .code,
            "TRUST_REQUIRED"
        );
        assert_eq!(
            stage(&f.0, "", "file.txt", Area::Unstaged, None, None, false)
                .unwrap_err()
                .code,
            "TRUST_REQUIRED"
        );
        assert!(!f.0.path.join(".git/index.lock").exists());
        assert_eq!(fs::read(f.0.path.join(".git/index")).unwrap(), index);
        let authorized = read(&f.0, true).unwrap();
        assert!(authorized.trusted);
        assert!(f.0.path.join(".git/filter-marker").exists());
    }
    #[test]
    fn staging_crlf_hunks_preserves_worktree_and_commits_normalized_blobs() {
        for autocrlf in ["true", "false"] {
            let fixture = Fixture::new();
            fixture.git(&["config", "core.autocrlf", autocrlf]);
            fixture.file(".gitattributes", "*.txt text eol=crlf\n");
            fixture.base();
            let content = format!("INICIO\r\n{}FINAL\r\n", "contexto\r\n".repeat(20));
            fixture.file("archivo ü.txt", &content);
            let state = fixture.state();
            let preview = file_diff(
                &fixture.0,
                &state.token,
                "archivo ü.txt",
                Area::Unstaged,
                true,
            )
            .unwrap();
            assert!(preview.partial_allowed);
            assert_eq!(preview.hunks.len(), 2);
            let state = stage(
                &fixture.0,
                &state.token,
                "archivo ü.txt",
                Area::Unstaged,
                Some(0),
                Some(&preview.preview_token),
                true,
            )
            .unwrap()
            .changes
            .unwrap();
            let blob = fixture.git(&["show", ":archivo ü.txt"]);
            assert!(blob.starts_with("INICIO\n"));
            assert!(blob.ends_with("final\n"));
            assert!(!blob.contains('\r'));
            let state = stage(
                &fixture.0,
                &state.token,
                "archivo ü.txt",
                Area::Staged,
                None,
                None,
                true,
            )
            .unwrap()
            .changes
            .unwrap();
            let state = stage(
                &fixture.0,
                &state.token,
                "archivo ü.txt",
                Area::Unstaged,
                None,
                None,
                true,
            )
            .unwrap()
            .changes
            .unwrap();
            let normalized = content.replace("\r\n", "\n");
            assert_eq!(fixture.git(&["show", ":archivo ü.txt"]), normalized);
            assert!(
                commit(&fixture.0, &state.token, "CRLF fixture", true)
                    .unwrap()
                    .commit_hash
                    .is_some()
            );
            assert_eq!(fixture.git(&["show", "HEAD:archivo ü.txt"]), normalized);
            assert_eq!(
                fs::read_to_string(fixture.0.path.join("archivo ü.txt")).unwrap(),
                content
            );
        }
    }
    #[cfg(windows)]
    #[test]
    fn windows_paths_and_junction_escapes_are_rejected() {
        let fixture = Fixture::new();
        for path in [
            "../outside.txt",
            "C:\\outside.txt",
            "C:relative.txt",
            ".git/config",
        ] {
            assert!(validated_path(&fixture.0, path).is_err());
        }
        let outside = fixture.0.path.with_extension("outside");
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("keep.txt"), "keep").unwrap();
        let link = fixture.0.path.join("escape");
        let output = std::process::Command::new("cmd.exe")
            .args(["/d", "/c", "mklink", "/J"])
            .arg(&link)
            .arg(&outside)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(
            validated_path(&fixture.0, "escape/keep.txt")
                .unwrap_err()
                .code,
            "PATH_ESCAPE"
        );
        assert_eq!(
            fs::read_to_string(outside.join("keep.txt")).unwrap(),
            "keep"
        );
        fs::remove_dir(&link).unwrap();
        fs::remove_dir_all(&outside).unwrap();
    }
}
