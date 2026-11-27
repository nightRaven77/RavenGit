//! Local Git worktree inspection and guarded lifecycle management.
//! Never executes Git hooks/filters implicitly during reads and uses explicit argv arrays on writes.
use crate::{
    git::{self, GitError, Repository, Result},
    process,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeItem {
    pub path: String,
    pub name: String,
    pub head: Option<String>,
    pub branch: Option<String>,
    pub detached: bool,
    pub bare: bool,
    pub main: bool,
    pub current: bool,
    pub locked: bool,
    pub lock_reason: Option<String>,
    pub prunable: bool,
    pub prunable_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreesState {
    pub trusted: bool,
    pub current_path: String,
    pub worktrees: Vec<WorktreeItem>,
    pub branches: Vec<String>,
    pub restriction: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeOutcome {
    pub message: String,
    pub created_path: Option<String>,
    pub state: WorktreesState,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum AddRequest {
    NewBranch {
        path: String,
        branch: String,
        base_ref: Option<String>,
    },
    ExistingBranch {
        path: String,
        branch: String,
    },
    Detached {
        path: String,
        start_point: Option<String>,
    },
}

fn error(code: &'static str, message: impl Into<String>) -> GitError {
    GitError::new(code, message)
}

fn strip_verbatim(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        let text = path.to_string_lossy();
        if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        if let Some(stripped) = text.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
    }
    path
}

fn canonical_or_raw(path: &Path) -> PathBuf {
    strip_verbatim(fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf()))
}

fn paths_match(a: &Path, b: &Path) -> bool {
    a == b || canonical_or_raw(a) == canonical_or_raw(b)
}

fn git_path(repo: &Repository, name: &str) -> Result<PathBuf> {
    Ok(PathBuf::from(
        git::text(
            &repo.path,
            &["rev-parse", "--path-format=absolute", "--git-path", name],
        )?
        .trim_end_matches(['\r', '\n']),
    ))
}

fn rev_parse_dir(repo: &Repository, flag: &str) -> Result<PathBuf> {
    Ok(canonical_or_raw(Path::new(
        git::text(&repo.path, &["rev-parse", "--path-format=absolute", flag])?.trim(),
    )))
}

fn check_locks(repo: &Repository) -> Result<Option<String>> {
    if git_path(repo, "index.lock")?.exists() || git_path(repo, "HEAD.lock")?.exists() {
        Ok(Some(
            "Git está ocupado (index.lock / HEAD.lock). Espera a que termine la operación actual."
                .into(),
        ))
    } else {
        Ok(None)
    }
}

#[derive(Default)]
struct EntryBuilder {
    path: String,
    head: Option<String>,
    branch: Option<String>,
    detached: bool,
    bare: bool,
    locked: bool,
    lock_reason: Option<String>,
    prunable: bool,
    prunable_reason: Option<String>,
}

impl EntryBuilder {
    fn finish(self, is_main: bool, current_root: &Path) -> WorktreeItem {
        let wt_path = Path::new(&self.path);
        let name = wt_path
            .file_name()
            .and_then(|s| s.to_str())
            .filter(|s| !s.is_empty())
            .unwrap_or(&self.path)
            .to_string();
        let current = paths_match(wt_path, current_root);
        let head = self
            .head
            .filter(|h| !h.is_empty() && !h.chars().all(|c| c == '0'));
        WorktreeItem {
            path: self.path,
            name,
            head: if self.bare { None } else { head },
            branch: self.branch,
            detached: self.detached,
            bare: self.bare,
            main: is_main,
            current,
            locked: self.locked,
            lock_reason: self.lock_reason,
            prunable: self.prunable,
            prunable_reason: self.prunable_reason,
        }
    }
}

/// Pure parser for `git worktree list --porcelain -z` output.
pub fn parse_porcelain(raw: &str, current_root: &Path) -> Vec<WorktreeItem> {
    let mut items = Vec::new();
    let mut current: Option<EntryBuilder> = None;

    for token in raw.split('\0') {
        if token.is_empty() {
            if let Some(entry) = current.take() {
                items.push(entry.finish(items.is_empty(), current_root));
            }
            continue;
        }
        if let Some(path) = token.strip_prefix("worktree ") {
            if let Some(entry) = current.take() {
                items.push(entry.finish(items.is_empty(), current_root));
            }
            current = Some(EntryBuilder {
                path: path.to_string(),
                ..EntryBuilder::default()
            });
            continue;
        }
        let Some(entry) = current.as_mut() else {
            continue;
        };
        if let Some(head) = token.strip_prefix("HEAD ") {
            entry.head = Some(head.trim().to_string());
        } else if let Some(branch_ref) = token.strip_prefix("branch ") {
            let short = branch_ref
                .trim()
                .strip_prefix("refs/heads/")
                .unwrap_or(branch_ref.trim())
                .to_string();
            entry.branch = Some(short);
        } else if token == "detached" {
            entry.detached = true;
        } else if token == "bare" {
            entry.bare = true;
        } else if token == "locked" {
            entry.locked = true;
            entry.lock_reason = None;
        } else if let Some(reason) = token.strip_prefix("locked ") {
            entry.locked = true;
            let trimmed = reason.trim();
            entry.lock_reason = (!trimmed.is_empty()).then(|| trimmed.to_string());
        } else if token == "prunable" {
            entry.prunable = true;
            entry.prunable_reason = None;
        } else if let Some(reason) = token.strip_prefix("prunable ") {
            entry.prunable = true;
            let trimmed = reason.trim();
            entry.prunable_reason = (!trimmed.is_empty()).then(|| trimmed.to_string());
        }
    }

    if let Some(entry) = current.take() {
        items.push(entry.finish(items.is_empty(), current_root));
    }

    items
}

pub fn list(repo: &Repository, trusted: bool) -> Result<WorktreesState> {
    let raw = git::text(&repo.path, &["worktree", "list", "--porcelain", "-z"])?;
    let refs_raw = git::text(
        &repo.path,
        &["for-each-ref", "--format=%(refname:strip=2)", "refs/heads/"],
    )?;
    let branches = refs_raw
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    let worktrees = parse_porcelain(&raw, &repo.path);
    let restriction = check_locks(repo)?;
    Ok(WorktreesState {
        trusted,
        current_path: canonical_or_raw(&repo.path).to_string_lossy().into_owned(),
        worktrees,
        branches,
        restriction,
    })
}

pub fn verify_member_path(repo: &Repository, target: &str) -> Result<PathBuf> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err(error("WORKTREE_INVALID", "Indica un worktree válido."));
    }
    let state = list(repo, true)?;
    let target_path = Path::new(trimmed);
    let item = state
        .worktrees
        .iter()
        .find(|wt| paths_match(Path::new(&wt.path), target_path))
        .ok_or_else(|| {
            error(
                "WORKTREE_NOT_FOUND",
                "El worktree indicado no pertenece a este repositorio.",
            )
        })?;
    if item.prunable || !Path::new(&item.path).is_dir() {
        return Err(error(
            "WORKTREE_MISSING",
            "La carpeta de este worktree ya no existe en disco.",
        ));
    }
    Ok(canonical_or_raw(Path::new(&item.path)))
}

fn require_writable(repo: &Repository, trusted: bool) -> Result<WorktreesState> {
    if !trusted {
        return Err(error(
            "TRUST_REQUIRED",
            "Autoriza el repositorio antes de gestionar worktrees.",
        ));
    }
    let state = list(repo, true)?;
    if let Some(reason) = &state.restriction {
        return Err(error("WORKTREE_BLOCKED", reason.clone()));
    }
    Ok(state)
}

fn validate_branch_name(repo: &Repository, raw: &str) -> Result<String> {
    let name = raw.trim();
    if name.is_empty()
        || name.len() > 256
        || name.starts_with('-')
        || name.starts_with('/')
        || name.starts_with("refs/")
        || name == "HEAD"
        || name.chars().any(char::is_control)
    {
        return Err(error(
            "WORKTREE_BRANCH",
            "Indica un nombre de rama válido, sin prefijo refs/heads/.",
        ));
    }
    let mut cmd = process::git(&repo.path);
    cmd.args(["check-ref-format", &format!("refs/heads/{name}")]);
    let out = process::execute(cmd, None, Duration::from_secs(15)).map_err(|_| {
        error(
            "WORKTREE_BRANCH",
            "No se pudo validar el nombre de la rama.",
        )
    })?;
    if !out.success {
        return Err(error(
            "WORKTREE_BRANCH",
            "El nombre de rama no es válido según las reglas de Git.",
        ));
    }
    Ok(name.to_string())
}

fn validate_commit_ref(repo: &Repository, raw: &str) -> Result<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') || trimmed.chars().any(char::is_control) {
        return Err(error(
            "WORKTREE_REF",
            "Indica una referencia o commit base válido.",
        ));
    }
    let spec = format!("{trimmed}^{{commit}}");
    git::run(
        repo_path(repo),
        &["rev-parse", "--verify", "--end-of-options", &spec],
    )
    .map_err(|_| {
        error(
            "WORKTREE_REF",
            "La referencia base indicada no existe en el repositorio.",
        )
    })?;
    Ok(trimmed.to_string())
}

fn repo_path(repo: &Repository) -> &Path {
    &repo.path
}

fn validate_new_worktree_path(repo: &Repository, raw_path: &str) -> Result<PathBuf> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') || trimmed.chars().any(char::is_control) {
        return Err(error(
            "WORKTREE_PATH",
            "Indica una carpeta de destino válida para el nuevo worktree.",
        ));
    }
    let target = Path::new(trimmed);
    if !target.is_absolute() {
        return Err(error(
            "WORKTREE_PATH",
            "La carpeta del worktree debe ser una ruta absoluta.",
        ));
    }
    let Some(file_name) = target.file_name().filter(|s| !s.is_empty()) else {
        return Err(error(
            "WORKTREE_PATH",
            "La ruta debe terminar en el nombre de la carpeta nueva.",
        ));
    };
    let Some(parent) = target.parent() else {
        return Err(error(
            "WORKTREE_PATH",
            "La carpeta padre del worktree no es válida.",
        ));
    };
    if !parent.is_dir() {
        return Err(error(
            "WORKTREE_PATH",
            "La carpeta padre indicada no existe.",
        ));
    }
    let parent_canon = canonical_or_raw(parent);
    let candidate = parent_canon.join(file_name);
    if candidate.exists() || candidate.symlink_metadata().is_ok() {
        return Err(error(
            "WORKTREE_PATH_EXISTS",
            "La carpeta de destino ya existe. Elige una ruta nueva para evitar sobrescribir archivos.",
        ));
    }
    let git_dir = rev_parse_dir(repo, "--git-dir")?;
    let common_dir = rev_parse_dir(repo, "--git-common-dir")?;
    if candidate.starts_with(&git_dir) || candidate.starts_with(&common_dir) {
        return Err(error(
            "WORKTREE_PATH",
            "No puedes crear un worktree dentro del directorio interno de Git.",
        ));
    }
    Ok(candidate)
}

fn run_worktree_git(
    repo: &Repository,
    args: &[&str],
    fail_code: &'static str,
    fail_message: &str,
) -> Result<()> {
    let mut command = process::git(&repo.path);
    command
        .args(["-c", "submodule.recurse=false"])
        .args(args)
        .env("GIT_NO_REPLACE_OBJECTS", "1")
        .env("GCM_INTERACTIVE", "never")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "");
    let output = process::execute(command, None, Duration::from_secs(20)).map_err(|_| {
        error(
            fail_code,
            format!("{fail_message} Revisa los permisos o el estado del repositorio."),
        )
    })?;
    if !output.success {
        return Err(error(fail_code, fail_message));
    }
    Ok(())
}

fn find_item<'a>(state: &'a WorktreesState, target: &str) -> Result<&'a WorktreeItem> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err(error("WORKTREE_INVALID", "Indica un worktree válido."));
    }
    let target_path = Path::new(trimmed);
    state
        .worktrees
        .iter()
        .find(|wt| wt.path == trimmed || paths_match(Path::new(&wt.path), target_path))
        .ok_or_else(|| {
            error(
                "WORKTREE_NOT_FOUND",
                "No se encontró el worktree seleccionado. Actualiza la lista.",
            )
        })
}

pub fn add(repo: &Repository, trusted: bool, req: AddRequest) -> Result<WorktreeOutcome> {
    let state = require_writable(repo, trusted)?;
    match req {
        AddRequest::NewBranch {
            path,
            branch,
            base_ref,
        } => {
            let dest = validate_new_worktree_path(repo, &path)?;
            let branch_name = validate_branch_name(repo, &branch)?;
            if state.branches.iter().any(|existing| {
                existing == &branch_name || existing.eq_ignore_ascii_case(&branch_name)
            }) {
                return Err(error(
                    "BRANCH_EXISTS",
                    "Ya existe una rama con ese nombre o con distinta combinación de mayúsculas.",
                ));
            }
            let base = match base_ref.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
                Some(raw_ref) => Some(validate_commit_ref(repo, raw_ref)?),
                None => None,
            };
            let dest_str = dest.to_string_lossy().into_owned();
            let mut args = vec!["worktree", "add", "-b", &branch_name, "--", &dest_str];
            if let Some(ref b) = base {
                args.push(b);
            }
            run_worktree_git(
                repo,
                &args,
                "WORKTREE_ADD_FAILED",
                "Git no pudo crear el worktree con la nueva rama.",
            )?;
            let created = canonical_or_raw(&dest).to_string_lossy().into_owned();
            let next_state = list(repo, true)?;
            Ok(WorktreeOutcome {
                message: format!("Worktree creado en rama {branch_name}."),
                created_path: Some(created),
                state: next_state,
            })
        }
        AddRequest::ExistingBranch { path, branch } => {
            let dest = validate_new_worktree_path(repo, &path)?;
            let branch_name = validate_branch_name(repo, &branch)?;
            if !state
                .branches
                .iter()
                .any(|existing| existing == &branch_name)
            {
                return Err(error(
                    "BRANCH_MISSING",
                    "La rama indicada no existe localmente.",
                ));
            }
            if state
                .worktrees
                .iter()
                .any(|wt| wt.branch.as_deref() == Some(branch_name.as_str()))
            {
                return Err(error(
                    "WORKTREE_BRANCH_BUSY",
                    format!("La rama {branch_name} ya está abierta en otro worktree."),
                ));
            }
            let dest_str = dest.to_string_lossy().into_owned();
            run_worktree_git(
                repo,
                &["worktree", "add", "--", &dest_str, &branch_name],
                "WORKTREE_ADD_FAILED",
                "Git no pudo crear el worktree sobre esa rama.",
            )?;
            let created = canonical_or_raw(&dest).to_string_lossy().into_owned();
            let next_state = list(repo, true)?;
            Ok(WorktreeOutcome {
                message: format!("Worktree creado para la rama {branch_name}."),
                created_path: Some(created),
                state: next_state,
            })
        }
        AddRequest::Detached { path, start_point } => {
            let dest = validate_new_worktree_path(repo, &path)?;
            let base = match start_point
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                Some(raw_ref) => Some(validate_commit_ref(repo, raw_ref)?),
                None => None,
            };
            let dest_str = dest.to_string_lossy().into_owned();
            let mut args = vec!["worktree", "add", "--detach", "--", &dest_str];
            if let Some(ref b) = base {
                args.push(b);
            }
            run_worktree_git(
                repo,
                &args,
                "WORKTREE_ADD_FAILED",
                "Git no pudo crear el worktree en HEAD separado.",
            )?;
            let created = canonical_or_raw(&dest).to_string_lossy().into_owned();
            let next_state = list(repo, true)?;
            Ok(WorktreeOutcome {
                message: "Worktree creado en HEAD separado.".into(),
                created_path: Some(created),
                state: next_state,
            })
        }
    }
}

pub fn lock(
    repo: &Repository,
    trusted: bool,
    target: &str,
    reason: Option<&str>,
) -> Result<WorktreeOutcome> {
    let state = require_writable(repo, trusted)?;
    let item = find_item(&state, target)?;
    if item.main {
        return Err(error(
            "WORKTREE_LOCK_MAIN",
            "No puedes bloquear el worktree principal.",
        ));
    }
    if item.locked {
        return Err(error(
            "WORKTREE_ALREADY_LOCKED",
            "Este worktree ya está bloqueado.",
        ));
    }
    let clean_reason = reason
        .map(str::trim)
        .filter(|r| !r.is_empty())
        .map(|r| {
            if r.chars().any(char::is_control) {
                Err(error(
                    "WORKTREE_REASON",
                    "El motivo de bloqueo contiene caracteres no válidos.",
                ))
            } else {
                Ok(r.to_string())
            }
        })
        .transpose()?;
    let mut args = vec!["worktree", "lock"];
    if let Some(ref r) = clean_reason {
        args.push("--reason");
        args.push(r);
    }
    args.push("--");
    args.push(&item.path);
    run_worktree_git(
        repo,
        &args,
        "WORKTREE_LOCK_FAILED",
        "Git no pudo bloquear este worktree.",
    )?;
    let name = item.name.clone();
    let next_state = list(repo, true)?;
    Ok(WorktreeOutcome {
        message: format!("Worktree {name} bloqueado."),
        created_path: None,
        state: next_state,
    })
}

pub fn unlock(repo: &Repository, trusted: bool, target: &str) -> Result<WorktreeOutcome> {
    let state = require_writable(repo, trusted)?;
    let item = find_item(&state, target)?;
    if item.main {
        return Err(error(
            "WORKTREE_UNLOCK_MAIN",
            "El worktree principal no admite desbloqueo.",
        ));
    }
    if !item.locked {
        return Err(error(
            "WORKTREE_NOT_LOCKED",
            "Este worktree no está bloqueado.",
        ));
    }
    run_worktree_git(
        repo,
        &["worktree", "unlock", "--", &item.path],
        "WORKTREE_UNLOCK_FAILED",
        "Git no pudo desbloquear este worktree.",
    )?;
    let name = item.name.clone();
    let next_state = list(repo, true)?;
    Ok(WorktreeOutcome {
        message: format!("Worktree {name} desbloqueado."),
        created_path: None,
        state: next_state,
    })
}

pub fn remove(
    repo: &Repository,
    trusted: bool,
    target: &str,
    force: bool,
) -> Result<WorktreeOutcome> {
    let state = require_writable(repo, trusted)?;
    let item = find_item(&state, target)?;
    if item.main {
        return Err(error(
            "WORKTREE_REMOVE_MAIN",
            "No puedes eliminar el worktree principal del repositorio.",
        ));
    }
    if item.current {
        return Err(error(
            "WORKTREE_REMOVE_CURRENT",
            "No puedes eliminar el worktree abierto en la pestaña actual. Abre otra carpeta o el principal antes de eliminarlo.",
        ));
    }
    if item.locked {
        return Err(error(
            "WORKTREE_LOCKED",
            "Este worktree está bloqueado. Desbloquéalo antes de eliminarlo.",
        ));
    }
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push("--");
    args.push(&item.path);
    let fail_message = if force {
        "Git no pudo eliminar el worktree."
    } else {
        "El worktree tiene archivos modificados o sin seguimiento. Guarda tus cambios o marca el forzado explícito para eliminarlo."
    };
    run_worktree_git(repo, &args, "WORKTREE_REMOVE_FAILED", fail_message)?;
    let name = item.name.clone();
    let next_state = list(repo, true)?;
    Ok(WorktreeOutcome {
        message: format!("Worktree {name} eliminado."),
        created_path: None,
        state: next_state,
    })
}

pub fn prune(repo: &Repository, trusted: bool) -> Result<WorktreeOutcome> {
    let _state = require_writable(repo, trusted)?;
    run_worktree_git(
        repo,
        &["worktree", "prune"],
        "WORKTREE_PRUNE_FAILED",
        "Git no pudo limpiar las entradas de worktrees obsoletos.",
    )?;
    let next_state = list(repo, true)?;
    Ok(WorktreeOutcome {
        message: "Entradas de worktrees obsoletos limpiadas.".into(),
        created_path: None,
        state: next_state,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT: AtomicU64 = AtomicU64::new(0);

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "ravengit-worktrees-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&root).unwrap();
            Self(root)
        }
        fn git(&self, dir: &Path, args: &[&str]) -> String {
            let mut cmd = process::git(dir);
            cmd.args(args);
            let out = process::execute(cmd, None, Duration::from_secs(15)).unwrap();
            assert!(
                out.success,
                "git {:?} failed: {}",
                args,
                String::from_utf8_lossy(&out.bytes)
            );
            String::from_utf8_lossy(&out.bytes).trim().to_string()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn parses_porcelain_worktrees_including_locked_detached_and_prunable() {
        let raw = concat!(
            "worktree /repos/main\0",
            "HEAD 1111111111111111111111111111111111111111\0",
            "branch refs/heads/main\0",
            "\0",
            "worktree /repos/wt-feat\0",
            "HEAD 2222222222222222222222222222222222222222\0",
            "branch refs/heads/feat/ui\0",
            "locked disco externo desconectado\0",
            "\0",
            "worktree /repos/wt-gone\0",
            "HEAD 3333333333333333333333333333333333333333\0",
            "detached\0",
            "prunable gitdir file points to non-existent location\0",
            "\0",
        );

        let items = parse_porcelain(raw, Path::new("/repos/wt-feat"));
        assert_eq!(items.len(), 3);

        assert_eq!(items[0].name, "main");
        assert!(items[0].main);
        assert!(!items[0].current);
        assert_eq!(items[0].branch.as_deref(), Some("main"));
        assert!(!items[0].locked);

        assert_eq!(items[1].name, "wt-feat");
        assert!(!items[1].main);
        assert!(items[1].current);
        assert_eq!(items[1].branch.as_deref(), Some("feat/ui"));
        assert!(items[1].locked);
        assert_eq!(
            items[1].lock_reason.as_deref(),
            Some("disco externo desconectado")
        );

        assert_eq!(items[2].name, "wt-gone");
        assert!(items[2].detached);
        assert!(items[2].prunable);
        assert_eq!(
            items[2].prunable_reason.as_deref(),
            Some("gitdir file points to non-existent location")
        );
    }

    #[test]
    fn creates_locks_unlocks_removes_and_prunes_worktrees_safely() {
        let f = Fixture::new();
        let main_dir = f.0.join("repo-main");
        fs::create_dir_all(&main_dir).unwrap();
        f.git(&main_dir, &["init", "-b", "main"]);
        f.git(&main_dir, &["config", "user.name", "Test"]);
        f.git(&main_dir, &["config", "user.email", "test@example.com"]);
        f.git(&main_dir, &["config", "core.autocrlf", "false"]);
        fs::write(main_dir.join("README.md"), "hola\n").unwrap();
        f.git(&main_dir, &["add", "--all"]);
        f.git(&main_dir, &["commit", "-m", "init"]);

        let repo = Repository {
            id: "1".into(),
            path: canonical_or_raw(&main_dir),
        };
        let wt1_path = f.0.join("wt-uno");

        // Untrusted writes must fail with TRUST_REQUIRED
        let untrusted_err = add(
            &repo,
            false,
            AddRequest::NewBranch {
                path: wt1_path.to_string_lossy().into(),
                branch: "feat/uno".into(),
                base_ref: None,
            },
        )
        .unwrap_err();
        assert_eq!(untrusted_err.code, "TRUST_REQUIRED");

        // Create worktree on new branch
        let added = add(
            &repo,
            true,
            AddRequest::NewBranch {
                path: wt1_path.to_string_lossy().into(),
                branch: "feat/uno".into(),
                base_ref: None,
            },
        )
        .unwrap();
        let wt1_real = added.created_path.clone().unwrap();
        assert!(Path::new(&wt1_real).is_dir());
        assert_eq!(added.state.worktrees.len(), 2);

        // ExistingBranch rejects branch already checked out in another worktree
        let wt_dup = f.0.join("wt-dup");
        let busy_err = add(
            &repo,
            true,
            AddRequest::ExistingBranch {
                path: wt_dup.to_string_lossy().into(),
                branch: "feat/uno".into(),
            },
        )
        .unwrap_err();
        assert_eq!(busy_err.code, "WORKTREE_BRANCH_BUSY");

        // Lock with reason, verify remove refuses main/current/locked
        let locked = lock(&repo, true, &wt1_real, Some("En USB")).unwrap();
        let wt1_item = locked
            .state
            .worktrees
            .iter()
            .find(|wt| paths_match(Path::new(&wt.path), Path::new(&wt1_real)))
            .unwrap();
        assert!(wt1_item.locked);
        assert_eq!(wt1_item.lock_reason.as_deref(), Some("En USB"));

        assert_eq!(
            remove(&repo, true, &repo.path.to_string_lossy(), false)
                .unwrap_err()
                .code,
            "WORKTREE_REMOVE_MAIN"
        );
        assert_eq!(
            remove(&repo, true, &wt1_real, false).unwrap_err().code,
            "WORKTREE_LOCKED"
        );

        let wt1_repo = Repository {
            id: "2".into(),
            path: PathBuf::from(&wt1_real),
        };
        assert_eq!(
            remove(&wt1_repo, true, &wt1_real, false).unwrap_err().code,
            "WORKTREE_REMOVE_CURRENT"
        );

        // Unlock and cleanly remove wt1
        unlock(&repo, true, &wt1_real).unwrap();
        let removed = remove(&repo, true, &wt1_real, false).unwrap();
        assert!(!Path::new(&wt1_real).exists());
        assert_eq!(removed.state.worktrees.len(), 1);

        // Detached worktree whose directory is manually deleted becomes prunable and is cleaned by prune()
        let wt2_path = f.0.join("wt-dos");
        let wt2 = add(
            &repo,
            true,
            AddRequest::Detached {
                path: wt2_path.to_string_lossy().into(),
                start_point: None,
            },
        )
        .unwrap();
        let wt2_real = wt2.created_path.unwrap();
        fs::remove_dir_all(&wt2_real).unwrap();
        let before_prune = list(&repo, true).unwrap();
        assert!(before_prune.worktrees.iter().any(|wt| wt.prunable));

        let pruned = prune(&repo, true).unwrap();
        assert_eq!(pruned.state.worktrees.len(), 1);
        assert!(!pruned.state.worktrees.iter().any(|wt| wt.prunable));
    }
}
