use crate::{
    changes,
    git::{self, GitError, Repository, Result},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const UNDO_DIR_NAME: &str = "ravengit-undo";
const HISTORY_FILE_NAME: &str = "history.json";
const MAX_HISTORY_ENTRIES: usize = 50;
const RECENT_PREVIEW_COUNT: usize = 10;
static UNDO_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RefState {
    pub branch: Option<String>,
    pub head: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UndoEntry {
    pub id: String,
    pub timestamp: u64,
    pub kind: String,
    pub label: String,
    pub before: RefState,
    pub after: RefState,
    pub moves_refs: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
struct UndoHistoryFile {
    undo_stack: Vec<UndoEntry>,
    redo_stack: Vec<UndoEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UndoState {
    pub can_undo: bool,
    pub can_redo: bool,
    pub undo_count: usize,
    pub redo_count: usize,
    pub next_undo: Option<UndoEntry>,
    pub next_redo: Option<UndoEntry>,
    pub recent_undo: Vec<UndoEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub token: String,
    pub direction: String,
    pub entry: UndoEntry,
    pub current_branch: Option<String>,
    pub current_head: Option<String>,
    pub target_branch: Option<String>,
    pub target_head: Option<String>,
    pub requires_confirmation: bool,
    pub summary: String,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub direction: String,
    pub message: String,
    pub state: UndoState,
}

fn error(code: &'static str, message: impl Into<String>) -> GitError {
    GitError::new(code, message)
}

fn git_dir(repo: &Repository) -> Result<PathBuf> {
    let raw = git::text(&repo.path, &["rev-parse", "--absolute-git-dir"])?;
    let path = PathBuf::from(raw.trim_end_matches(['\r', '\n']));
    path.canonicalize()
        .map_err(|_| error("GIT_DIR", "No se pudo localizar la carpeta Git."))
}

fn undo_history_path(repo: &Repository, create_dir: bool) -> Result<PathBuf> {
    let dir = git_dir(repo)?.join(UNDO_DIR_NAME);
    if create_dir && !dir.exists() {
        fs::create_dir_all(&dir).map_err(|_| {
            error(
                "UNDO_IO",
                "No se pudo crear el directorio del historial de deshacer.",
            )
        })?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
        }
    }
    Ok(dir.join(HISTORY_FILE_NAME))
}

fn read_history_file(path: &Path) -> UndoHistoryFile {
    if !path.is_file() {
        return UndoHistoryFile::default();
    }
    let Ok(raw) = fs::read_to_string(path) else {
        return UndoHistoryFile::default();
    };
    serde_json::from_str::<UndoHistoryFile>(&raw).unwrap_or_default()
}

fn write_history_file(path: &Path, history: &UndoHistoryFile) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(history)
        .map_err(|_| error("UNDO_IO", "No se pudo serializar el historial de deshacer."))?;
    let parent = path
        .parent()
        .ok_or_else(|| error("UNDO_IO", "Ruta sin carpeta padre."))?;
    let seq = UNDO_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp = parent.join(format!(".tmp-undo-{}-{seq}", std::process::id()));
    let mut f = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&tmp)
        .map_err(|_| error("UNDO_IO", "No se pudo guardar el historial de deshacer."))?;
    let res = (|| -> std::io::Result<()> {
        f.write_all(&bytes)?;
        f.sync_all()?;
        drop(f);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600));
        }
        fs::rename(&tmp, path)
    })();
    if res.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    res.map_err(|_| error("UNDO_IO", "No se pudo guardar el historial de deshacer."))
}

fn to_undo_state(history: &UndoHistoryFile) -> UndoState {
    let recent_undo = history
        .undo_stack
        .iter()
        .rev()
        .take(RECENT_PREVIEW_COUNT)
        .cloned()
        .collect();
    UndoState {
        can_undo: !history.undo_stack.is_empty(),
        can_redo: !history.redo_stack.is_empty(),
        undo_count: history.undo_stack.len(),
        redo_count: history.redo_stack.len(),
        next_undo: history.undo_stack.last().cloned(),
        next_redo: history.redo_stack.last().cloned(),
        recent_undo,
    }
}

pub fn capture_ref_state(repo: &Repository) -> RefState {
    let branch = git::text(&repo.path, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .ok()
        .map(|s| s.trim_end_matches(['\r', '\n']).to_string())
        .filter(|s| !s.is_empty());
    let head = git::text(
        &repo.path,
        &["rev-parse", "--verify", "-q", "HEAD^{commit}"],
    )
    .ok()
    .map(|s| s.trim_end_matches(['\r', '\n']).to_string())
    .filter(|s| !s.is_empty());
    RefState { branch, head }
}

pub fn record(
    repo: &Repository,
    kind: &str,
    label: &str,
    before: RefState,
    after: RefState,
) -> Result<()> {
    if before == after {
        return Ok(());
    }
    let path = undo_history_path(repo, true)?;
    let mut history = read_history_file(&path);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| error("TIME", "Error de reloj de sistema."))?
        .as_secs();
    let seq = UNDO_SEQ.fetch_add(1, Ordering::Relaxed);
    let id = format!("undo-{now}-{}-{seq}", std::process::id());
    let cleaned_label = label
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .chars()
        .take(140)
        .collect::<String>();

    history.undo_stack.push(UndoEntry {
        id,
        timestamp: now,
        kind: kind.to_string(),
        label: if cleaned_label.is_empty() {
            kind.to_string()
        } else {
            cleaned_label
        },
        before,
        after,
        moves_refs: true,
    });
    history.redo_stack.clear();
    if history.undo_stack.len() > MAX_HISTORY_ENTRIES {
        let excess = history.undo_stack.len() - MAX_HISTORY_ENTRIES;
        history.undo_stack.drain(0..excess);
    }
    write_history_file(&path, &history)
}

pub fn read_state(repo: &Repository) -> Result<UndoState> {
    let path = undo_history_path(repo, false)?;
    let history = read_history_file(&path);
    Ok(to_undo_state(&history))
}

fn ensure_no_locks_or_active_op(repo: &Repository, git_dir_path: &Path) -> Result<()> {
    if git_dir_path.join("index.lock").exists() || git_dir_path.join("HEAD.lock").exists() {
        return Err(error(
            "LOCKED",
            "Hay un bloqueo activo de Git (`index.lock` o `HEAD.lock`).",
        ));
    }
    for marker in [
        "MERGE_HEAD",
        "REBASE_HEAD",
        "rebase-merge",
        "rebase-apply",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
    ] {
        if git_dir_path.join(marker).exists() {
            return Err(error(
                "OPERATION_IN_PROGRESS",
                "Hay una operación Git en curso. Complétala o abórtala antes de usar deshacer/rehacer.",
            ));
        }
    }
    let state = changes::read(repo, true)?;
    if state.operation.is_some() {
        return Err(error(
            "OPERATION_IN_PROGRESS",
            "Hay una operación Git en curso. Complétala o abórtala antes de usar deshacer/rehacer.",
        ));
    }
    Ok(())
}

fn short_hash(hash: Option<&str>) -> String {
    hash.map(|h| h.chars().take(7).collect::<String>())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "sin commit".into())
}

fn format_ref_label(state: &RefState) -> String {
    match (&state.branch, &state.head) {
        (Some(b), Some(h)) => format!("{b} ({})", short_hash(Some(h))),
        (Some(b), None) => format!("{b} (sin commits)"),
        (None, Some(h)) => format!("HEAD separado ({})", short_hash(Some(h))),
        (None, None) => "Sin HEAD".into(),
    }
}

pub fn preview(repo: &Repository, direction: &str, trusted: bool) -> Result<Plan> {
    if !matches!(direction, "undo" | "redo") {
        return Err(error(
            "INVALID_DIRECTION",
            "Dirección no válida para deshacer/rehacer.",
        ));
    }
    if !trusted {
        return Err(error(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de deshacer o rehacer operaciones Git.",
        ));
    }
    let git_dir_path = git_dir(repo)?;
    ensure_no_locks_or_active_op(repo, &git_dir_path)?;

    let history_path = undo_history_path(repo, false)?;
    let history = read_history_file(&history_path);
    let entry = if direction == "undo" {
        history.undo_stack.last().cloned().ok_or_else(|| {
            error(
                "NO_UNDO",
                "No hay operaciones recientes registradas para deshacer.",
            )
        })?
    } else {
        history.redo_stack.last().cloned().ok_or_else(|| {
            error(
                "NO_REDO",
                "No hay operaciones deshechas disponibles para rehacer.",
            )
        })?
    };

    let current = capture_ref_state(repo);
    let (expected, target) = if direction == "undo" {
        (entry.after.clone(), entry.before.clone())
    } else {
        (entry.before.clone(), entry.after.clone())
    };
    if current != expected {
        return Err(error(
            "UNDO_OUT_OF_SYNC",
            "HEAD o la rama actual cambiaron fuera de la secuencia esperada; por seguridad no se puede deshacer/rehacer automáticamente.",
        ));
    }

    if entry.kind == "branch-rename" {
        let Some(cur_branch) = current.branch.as_deref() else {
            return Err(error(
                "MISSING_BRANCH",
                "No se detectó una rama activa para renombrar.",
            ));
        };
        let Some(tgt_branch) = target.branch.as_deref() else {
            return Err(error(
                "MISSING_BRANCH",
                "El historial de renombrado no tiene rama de destino válida.",
            ));
        };
        if cur_branch != tgt_branch
            && git::run(
                &repo.path,
                &[
                    "show-ref",
                    "--verify",
                    "--quiet",
                    &format!("refs/heads/{tgt_branch}"),
                ],
            )
            .is_ok()
        {
            return Err(error(
                "BRANCH_EXISTS",
                format!("Ya existe una rama llamada «{tgt_branch}»."),
            ));
        }
    } else {
        let Some(target_head) = target.head.as_deref() else {
            return Err(error(
                "CANNOT_UNDO_ROOT",
                "El commit inicial del repositorio no tiene un commit anterior al cual volver automáticamente.",
            ));
        };
        git::run(
            &repo.path,
            &["cat-file", "-e", &format!("{target_head}^{{commit}}")],
        )
        .map_err(|_| {
            error(
                "MISSING_COMMIT",
                "El commit de destino ya no existe en este repositorio.",
            )
        })?;
        if entry.kind == "branch-switch"
            && let Some(tgt_branch) = target.branch.as_deref()
            && git::run(
                &repo.path,
                &[
                    "show-ref",
                    "--verify",
                    "--quiet",
                    &format!("refs/heads/{tgt_branch}"),
                ],
            )
            .is_err()
        {
            return Err(error(
                "MISSING_BRANCH",
                format!("La rama «{tgt_branch}» ya no existe localmente."),
            ));
        }
    }

    let changes_state = changes::read(repo, true)?;
    if entry.kind != "branch-rename" {
        let has_dirty_tracked = changes_state.entries.iter().any(|e| {
            !e.untracked && (e.index_status != ' ' || e.worktree_status != ' ' || e.conflict)
        });
        if has_dirty_tracked {
            return Err(error(
                "DIRTY_WORKTREE",
                "Hay cambios preparados o modificados sin commitear. Guarda un Snapshot local o un Stash antes de deshacer/rehacer.",
            ));
        }
    }

    let warning = if !matches!(entry.kind.as_str(), "branch-switch" | "branch-rename")
        && let Some(cur_head) = current.head.as_deref()
    {
        let contained = git::text(&repo.path, &["branch", "-r", "--contains", cur_head])
            .ok()
            .map(|out| !out.trim().is_empty())
            .unwrap_or(false);
        if contained {
            Some("El commit actual figura en una rama remota registrada localmente. Mover esta referencia puede diferir del remoto.".into())
        } else {
            None
        }
    } else {
        None
    };

    let verb = if direction == "undo" {
        "Deshacer"
    } else {
        "Rehacer"
    };
    let summary = if entry.kind == "commit" && direction == "undo" {
        format!(
            "{verb} «{}»: moverá HEAD de {} a {} conservando los cambios del commit en tu árbol de trabajo (--mixed).",
            entry.label,
            format_ref_label(&current),
            format_ref_label(&target)
        )
    } else {
        format!(
            "{verb} «{}»: cambiará de {} a {}.",
            entry.label,
            format_ref_label(&current),
            format_ref_label(&target)
        )
    };

    let mut hasher = Sha256::new();
    hasher.update(entry.id.as_bytes());
    hasher.update(b"\0");
    hasher.update(direction.as_bytes());
    hasher.update(b"\0");
    hasher.update(current.branch.as_deref().unwrap_or("").as_bytes());
    hasher.update(b"\0");
    hasher.update(current.head.as_deref().unwrap_or("").as_bytes());
    hasher.update(b"\0");
    hasher.update(target.branch.as_deref().unwrap_or("").as_bytes());
    hasher.update(b"\0");
    hasher.update(target.head.as_deref().unwrap_or("").as_bytes());
    hasher.update(b"\0");
    hasher.update(changes_state.token.as_bytes());
    let token = format!("{:x}", hasher.finalize());

    Ok(Plan {
        token,
        direction: direction.to_string(),
        requires_confirmation: entry.moves_refs,
        entry,
        current_branch: current.branch,
        current_head: current.head,
        target_branch: target.branch.clone(),
        target_head: target.head.clone(),
        summary,
        warning,
    })
}

pub fn execute(repo: &Repository, plan: Plan, trusted: bool) -> Result<Outcome> {
    if !trusted {
        return Err(error(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de deshacer o rehacer operaciones Git.",
        ));
    }
    let fresh = preview(repo, &plan.direction, trusted)?;
    if fresh.token != plan.token {
        return Err(error(
            "STALE_UNDO",
            "El estado del repositorio cambió desde la vista previa. Vuelve a revisar antes de confirmar.",
        ));
    }

    let kind = fresh.entry.kind.as_str();
    if kind == "branch-rename" {
        let cur_b = fresh
            .current_branch
            .as_deref()
            .ok_or_else(|| error("MISSING_BRANCH", "Rama actual no disponible."))?;
        let tgt_b = fresh
            .target_branch
            .as_deref()
            .ok_or_else(|| error("MISSING_BRANCH", "Rama destino no disponible."))?;
        git::run(
            &repo.path,
            &[
                "-c",
                "submodule.recurse=false",
                "branch",
                "-m",
                "--",
                cur_b,
                tgt_b,
            ],
        )?;
    } else if kind == "branch-switch" {
        match fresh.target_branch.as_deref() {
            Some(tgt_b) => {
                git::run(
                    &repo.path,
                    &["-c", "submodule.recurse=false", "switch", "--", tgt_b],
                )?;
            }
            None => {
                let tgt_head = fresh
                    .target_head
                    .as_deref()
                    .ok_or_else(|| error("MISSING_COMMIT", "Commit destino no disponible."))?;
                git::run(
                    &repo.path,
                    &[
                        "-c",
                        "submodule.recurse=false",
                        "switch",
                        "--detach",
                        tgt_head,
                    ],
                )?;
            }
        }
    } else if kind == "commit" && fresh.direction == "undo" {
        let tgt_head = fresh
            .target_head
            .as_deref()
            .ok_or_else(|| error("CANNOT_UNDO_ROOT", "Sin commit anterior."))?;
        git::run(
            &repo.path,
            &[
                "-c",
                "submodule.recurse=false",
                "reset",
                "--mixed",
                tgt_head,
            ],
        )?;
    } else {
        let tgt_head = fresh
            .target_head
            .as_deref()
            .ok_or_else(|| error("MISSING_COMMIT", "Commit destino no disponible."))?;
        if fresh.target_branch != fresh.current_branch {
            match fresh.target_branch.as_deref() {
                Some(tgt_b) => {
                    git::run(
                        &repo.path,
                        &["-c", "submodule.recurse=false", "switch", "--", tgt_b],
                    )?;
                }
                None => {
                    git::run(
                        &repo.path,
                        &[
                            "-c",
                            "submodule.recurse=false",
                            "switch",
                            "--detach",
                            tgt_head,
                        ],
                    )?;
                }
            }
        }
        let after_switch = capture_ref_state(repo);
        if after_switch.head.as_deref() != Some(tgt_head) {
            git::run(
                &repo.path,
                &[
                    "-c",
                    "submodule.recurse=false",
                    "reset",
                    "--merge",
                    tgt_head,
                ],
            )?;
        }
    }

    let history_path = undo_history_path(repo, true)?;
    let mut history = read_history_file(&history_path);
    if fresh.direction == "undo" {
        if let Some(popped) = history.undo_stack.pop() {
            history.redo_stack.push(popped);
        }
    } else if let Some(popped) = history.redo_stack.pop() {
        history.undo_stack.push(popped);
    }
    write_history_file(&history_path, &history)?;
    let next_state = to_undo_state(&history);

    let verb = if fresh.direction == "undo" {
        "Operación deshecha"
    } else {
        "Operación rehecha"
    };
    Ok(Outcome {
        direction: fresh.direction,
        message: format!("{verb}: {}.", fresh.entry.label),
        state: next_state,
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
                "ravengit-undo-{}-{}",
                std::process::id(),
                NEXT_TEST.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            let f = Self(path);
            f.git(&["init", "-b", "main"]);
            f.git(&["config", "user.name", "RavenGit"]);
            f.git(&["config", "user.email", "test@ravengit.local"]);
            f.git(&["config", "core.autocrlf", "false"]);
            fs::write(f.0.join("app.txt"), "base\n").unwrap();
            f.git(&["add", "--all"]);
            f.git(&["commit", "-m", "raiz"]);
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
                id: "undo-test".into(),
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
    fn undo_commit_keeps_changes_with_mixed_reset_and_rejects_dirty_worktree_otherwise() {
        let f = Fixture::new();
        let repo = f.repo();
        let before_commit = capture_ref_state(&repo);

        fs::write(f.0.join("app.txt"), "base\ncambio en commit\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "segundo commit"]);
        let after_commit = capture_ref_state(&repo);

        record(
            &repo,
            "commit",
            "Commit: segundo commit",
            before_commit.clone(),
            after_commit.clone(),
        )
        .unwrap();

        assert_eq!(
            preview(&repo, "undo", false).unwrap_err().code,
            "TRUST_REQUIRED"
        );

        // Dirty worktree blocks even commit undo until cleaned/snapshotted
        fs::write(f.0.join("app.txt"), "edicion adicional sucia\n").unwrap();
        assert_eq!(
            preview(&repo, "undo", true).unwrap_err().code,
            "DIRTY_WORKTREE"
        );

        // Clean worktree + untracked file is allowed
        f.git(&["checkout", "--", "app.txt"]);
        fs::write(f.0.join("notas.txt"), "untracked permitido\n").unwrap();

        let plan = preview(&repo, "undo", true).unwrap();
        assert!(plan.requires_confirmation);
        let outcome = execute(&repo, plan, true).unwrap();
        assert!(!outcome.state.can_undo);
        assert!(outcome.state.can_redo);
        assert_eq!(capture_ref_state(&repo), before_commit);
        // Mixed reset keeps committed edit in worktree AND preserves untracked file
        assert_eq!(
            fs::read_to_string(f.0.join("app.txt")).unwrap(),
            "base\ncambio en commit\n"
        );
        assert_eq!(
            fs::read_to_string(f.0.join("notas.txt")).unwrap(),
            "untracked permitido\n"
        );
    }

    #[test]
    fn branch_switch_rename_and_amend_undo_redo_cycle_with_stale_and_remote_checks() {
        let f = Fixture::new();
        let repo = f.repo();

        let s0 = capture_ref_state(&repo);
        f.git(&["switch", "-c", "feature"]);
        let s1 = capture_ref_state(&repo);
        record(
            &repo,
            "branch-switch",
            "Cambio a rama feature",
            s0.clone(),
            s1.clone(),
        )
        .unwrap();

        // Rename feature -> feature-v2 even with dirty tracked file allowed
        fs::write(f.0.join("app.txt"), "sucio temporal\n").unwrap();
        f.git(&["branch", "-m", "feature", "feature-v2"]);
        let s2 = capture_ref_state(&repo);
        record(
            &repo,
            "branch-rename",
            "Renombrar rama feature → feature-v2",
            s1.clone(),
            s2.clone(),
        )
        .unwrap();

        let rename_plan = preview(&repo, "undo", true).unwrap();
        let rename_undo = execute(&repo, rename_plan, true).unwrap();
        assert!(rename_undo.state.can_redo);
        assert_eq!(capture_ref_state(&repo).branch.as_deref(), Some("feature"));

        let rename_redo_plan = preview(&repo, "redo", true).unwrap();
        execute(&repo, rename_redo_plan, true).unwrap();
        assert_eq!(
            capture_ref_state(&repo).branch.as_deref(),
            Some("feature-v2")
        );

        // Clean up and commit + amend to test amend undo/redo + stale + out-of-sync + remote warning
        f.git(&["checkout", "--", "app.txt"]);
        fs::write(f.0.join("app.txt"), "v2\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "c1"]);
        let before_amend = capture_ref_state(&repo);
        f.git(&["commit", "--amend", "-m", "c1 corregido"]);
        let after_amend = capture_ref_state(&repo);
        record(
            &repo,
            "amend",
            "Amend: c1 corregido",
            before_amend.clone(),
            after_amend.clone(),
        )
        .unwrap();

        // Create local remote tracking ref containing after_amend HEAD to test remote warning
        let head_hex = after_amend.head.clone().unwrap();
        f.git(&["update-ref", "refs/remotes/origin/feature-v2", &head_hex]);

        let amend_plan = preview(&repo, "undo", true).unwrap();
        assert!(amend_plan.warning.is_some());

        // Creating an extra commit outside undo history invalidates sequence -> STALE_UNDO / UNDO_OUT_OF_SYNC
        fs::write(f.0.join("app.txt"), "v3\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "extra"]);
        assert_eq!(
            preview(&repo, "undo", true).unwrap_err().code,
            "UNDO_OUT_OF_SYNC"
        );
        assert_eq!(
            execute(&repo, amend_plan, true).unwrap_err().code,
            "UNDO_OUT_OF_SYNC"
        );
    }
}
