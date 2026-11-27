//! Local debounced file-system watcher for the active repository tab.
//! Emits lightweight invalidation signals without executing Git filters or network calls.
use crate::git::{GitError, Result};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    path::{Component, Path, PathBuf},
    sync::{
        Arc, Mutex,
        mpsc::{self, RecvTimeoutError},
    },
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Worktree,
    Git,
    Both,
}

impl ChangeKind {
    pub fn merge(self, other: Self) -> Self {
        if self == other { self } else { Self::Both }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoChangedEvent {
    pub id: String,
    pub kind: ChangeKind,
}

fn is_ignored_git_subpath(rel: &Path) -> bool {
    let mut comps = rel.components();
    let Some(first) = comps.next() else {
        return false;
    };
    let first_str = first.as_os_str().to_string_lossy();
    if matches!(
        first_str.as_ref(),
        "objects"
            | "logs"
            | "ravengit-restore"
            | "ravengit-snapshots"
            | "ravengit-undo"
            | "hooks"
            | "info"
            | "rr-cache"
    ) {
        return true;
    }
    if let Some(name) = rel.file_name().and_then(|n| n.to_str())
        && (name.ends_with(".lock") || name.ends_with(".tmp") || name == ".DS_Store")
    {
        return true;
    }
    false
}

fn classify_git_relative(rel: &Path) -> Option<ChangeKind> {
    if rel.as_os_str().is_empty() || is_ignored_git_subpath(rel) {
        return None;
    }
    let first = rel
        .components()
        .next()
        .map(|c| c.as_os_str().to_string_lossy())?;
    let relevant = matches!(
        first.as_ref(),
        "HEAD"
            | "index"
            | "packed-refs"
            | "FETCH_HEAD"
            | "ORIG_HEAD"
            | "MERGE_HEAD"
            | "REBASE_HEAD"
            | "CHERRY_PICK_HEAD"
            | "REVERT_HEAD"
            | "refs"
            | "rebase-merge"
            | "rebase-apply"
            | "worktrees"
    );
    relevant.then_some(ChangeKind::Git)
}

/// Pure classifier deciding whether a filesystem event path should trigger a refresh.
pub fn classify_path(
    repo_root: &Path,
    git_dir: &Path,
    common_dir: &Path,
    path: &Path,
) -> Option<ChangeKind> {
    if let Some(name) = path.file_name().and_then(|n| n.to_str())
        && name == ".DS_Store"
    {
        return None;
    }

    if let Ok(rel) = path.strip_prefix(git_dir) {
        return classify_git_relative(rel);
    }
    if common_dir != git_dir
        && let Ok(rel) = path.strip_prefix(common_dir)
    {
        return classify_git_relative(rel);
    }

    let rel_worktree = path.strip_prefix(repo_root).ok()?;
    let components: Vec<String> = rel_worktree
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    if components.is_empty() {
        return None;
    }
    if let Some(git_pos) = components.iter().position(|part| part == ".git") {
        let mut git_rel = PathBuf::new();
        for part in &components[git_pos + 1..] {
            git_rel.push(part);
        }
        return classify_git_relative(&git_rel);
    }
    if components
        .iter()
        .any(|part| part == "node_modules" || part == "target")
    {
        return None;
    }
    Some(ChangeKind::Worktree)
}

pub struct ActiveWatcher {
    pub repo_id: String,
    _watcher: RecommendedWatcher,
    stop_tx: mpsc::Sender<()>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl Drop for ActiveWatcher {
    fn drop(&mut self) {
        let _ = self.stop_tx.send(());
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

impl ActiveWatcher {
    pub fn start<F>(
        repo_id: String,
        repo_root: PathBuf,
        git_dir: PathBuf,
        common_dir: PathBuf,
        writes: Arc<Mutex<()>>,
        debounce: Duration,
        emit: F,
    ) -> Result<Self>
    where
        F: Fn(RepoChangedEvent) + Send + 'static,
    {
        let (event_tx, event_rx) = mpsc::channel::<ChangeKind>();
        let (stop_tx, stop_rx) = mpsc::channel::<()>();

        let root_for_cb = repo_root.clone();
        let git_for_cb = git_dir.clone();
        let common_for_cb = common_dir.clone();
        let mut watcher =
            notify::recommended_watcher(move |res: std::result::Result<Event, notify::Error>| {
                let Ok(event) = res else {
                    return;
                };
                if matches!(event.kind, EventKind::Access(_)) {
                    return;
                }
                let mut merged: Option<ChangeKind> = None;
                for path in &event.paths {
                    if let Some(kind) =
                        classify_path(&root_for_cb, &git_for_cb, &common_for_cb, path)
                    {
                        merged = Some(match merged {
                            Some(current) => current.merge(kind),
                            None => kind,
                        });
                    }
                }
                if let Some(kind) = merged {
                    let _ = event_tx.send(kind);
                }
            })
            .map_err(|_| {
                GitError::new(
                    "WATCHER_INIT",
                    "No se pudo iniciar el observador de archivos del repositorio.",
                )
            })?;

        watcher
            .watch(&repo_root, RecursiveMode::Recursive)
            .map_err(|_| {
                GitError::new(
                    "WATCHER_PATH",
                    "No se pudo observar la carpeta del repositorio.",
                )
            })?;
        if !git_dir.starts_with(&repo_root) && git_dir.exists() {
            let _ = watcher.watch(&git_dir, RecursiveMode::Recursive);
        }
        if common_dir != git_dir && !common_dir.starts_with(&repo_root) && common_dir.exists() {
            let refs_dir = common_dir.join("refs");
            if refs_dir.exists() {
                let _ = watcher.watch(&refs_dir, RecursiveMode::Recursive);
            }
            let _ = watcher.watch(&common_dir, RecursiveMode::NonRecursive);
        }

        let watched_id = repo_id.clone();
        let max_burst = debounce.saturating_mul(4).max(Duration::from_millis(900));
        let handle = std::thread::Builder::new()
            .name(format!("ravengit-watcher-{repo_id}"))
            .spawn(move || {
                let mut pending: Option<ChangeKind> = None;
                let mut first_seen: Option<Instant> = None;
                loop {
                    if stop_rx.try_recv().is_ok() {
                        break;
                    }
                    let timeout = if pending.is_some() {
                        debounce
                    } else {
                        Duration::from_millis(200)
                    };
                    match event_rx.recv_timeout(timeout) {
                        Ok(kind) => {
                            pending = Some(match pending {
                                Some(current) => current.merge(kind),
                                None => {
                                    first_seen = Some(Instant::now());
                                    kind
                                }
                            });
                            if first_seen.is_some_and(|start| start.elapsed() >= max_burst)
                                && let Some(kind) = pending.take()
                            {
                                first_seen = None;
                                if writes.try_lock().is_ok() {
                                    emit(RepoChangedEvent {
                                        id: watched_id.clone(),
                                        kind,
                                    });
                                }
                            }
                        }
                        Err(RecvTimeoutError::Timeout) => {
                            if let Some(kind) = pending.take() {
                                first_seen = None;
                                if writes.try_lock().is_ok() {
                                    emit(RepoChangedEvent {
                                        id: watched_id.clone(),
                                        kind,
                                    });
                                }
                            }
                        }
                        Err(RecvTimeoutError::Disconnected) => break,
                    }
                }
            })
            .map_err(|_| {
                GitError::new(
                    "WATCHER_THREAD",
                    "No se pudo iniciar el hilo de monitoreo local.",
                )
            })?;

        Ok(Self {
            repo_id,
            _watcher: watcher,
            stop_tx,
            handle: Some(handle),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ravengit-watcher-{name}-{}-{}",
            std::process::id(),
            NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn classifies_relevant_paths_and_ignores_internal_noise() {
        let root = Path::new("/tmp/repo");
        let git_dir = Path::new("/tmp/repo/.git");

        assert_eq!(
            classify_path(root, git_dir, git_dir, Path::new("/tmp/repo/src/App.tsx")),
            Some(ChangeKind::Worktree)
        );
        assert_eq!(
            classify_path(root, git_dir, git_dir, Path::new("/tmp/repo/.git/HEAD")),
            Some(ChangeKind::Git)
        );
        assert_eq!(
            classify_path(
                root,
                git_dir,
                git_dir,
                Path::new("/tmp/repo/.git/refs/heads/main")
            ),
            Some(ChangeKind::Git)
        );
        assert_eq!(
            classify_path(
                root,
                git_dir,
                git_dir,
                Path::new("/tmp/repo/.git/MERGE_HEAD")
            ),
            Some(ChangeKind::Git)
        );

        // Ignored internal git / build noise
        assert_eq!(
            classify_path(
                root,
                git_dir,
                git_dir,
                Path::new("/tmp/repo/.git/objects/ab/1234")
            ),
            None
        );
        assert_eq!(
            classify_path(
                root,
                git_dir,
                git_dir,
                Path::new("/tmp/repo/.git/index.lock")
            ),
            None
        );
        assert_eq!(
            classify_path(
                root,
                git_dir,
                git_dir,
                Path::new("/tmp/repo/.git/ravengit-restore/backup.json")
            ),
            None
        );
        assert_eq!(
            classify_path(
                root,
                git_dir,
                git_dir,
                Path::new("/tmp/repo/.git/ravengit-snapshots/snap-1/metadata.json")
            ),
            None
        );
        assert_eq!(
            classify_path(
                root,
                git_dir,
                git_dir,
                Path::new("/tmp/repo/.git/ravengit-undo/history.json")
            ),
            None
        );
        assert_eq!(
            classify_path(
                root,
                git_dir,
                git_dir,
                Path::new("/tmp/repo/node_modules/pkg/index.js")
            ),
            None
        );
        assert_eq!(
            classify_path(
                root,
                git_dir,
                git_dir,
                Path::new("/tmp/repo/target/debug/app")
            ),
            None
        );
        assert_eq!(
            classify_path(root, git_dir, git_dir, Path::new("/tmp/repo/.DS_Store")),
            None
        );

        // Linked worktree external git_dir + shared common_dir
        let wt_root = Path::new("/tmp/wt-feat");
        let wt_git = Path::new("/tmp/repo/.git/worktrees/wt-feat");
        let common = Path::new("/tmp/repo/.git");
        assert_eq!(
            classify_path(
                wt_root,
                wt_git,
                common,
                Path::new("/tmp/repo/.git/worktrees/wt-feat/index")
            ),
            Some(ChangeKind::Git)
        );
        assert_eq!(
            classify_path(
                wt_root,
                wt_git,
                common,
                Path::new("/tmp/repo/.git/refs/heads/main")
            ),
            Some(ChangeKind::Git)
        );

        assert_eq!(
            ChangeKind::Worktree.merge(ChangeKind::Git),
            ChangeKind::Both
        );
        assert_eq!(
            ChangeKind::Worktree.merge(ChangeKind::Worktree),
            ChangeKind::Worktree
        );
    }

    #[test]
    fn coalesces_rapid_worktree_writes_and_shuts_down_on_drop() {
        let dir = temp_dir("debounce");
        let git_dir = dir.join(".git");
        fs::create_dir_all(&git_dir).unwrap();
        let canonical = fs::canonicalize(&dir).unwrap();
        let canonical_git = canonical.join(".git");

        let (tx, rx) = mpsc::channel();
        let writes = Arc::new(Mutex::new(()));
        let watcher = ActiveWatcher::start(
            "tab-1".into(),
            canonical.clone(),
            canonical_git.clone(),
            canonical_git,
            writes,
            Duration::from_millis(80),
            move |event| {
                let _ = tx.send(event);
            },
        )
        .unwrap();

        fs::write(canonical.join("uno.txt"), "a").unwrap();
        fs::write(canonical.join("dos.txt"), "b").unwrap();

        let received = rx.recv_timeout(Duration::from_secs(3)).unwrap();
        assert_eq!(received.id, "tab-1");
        assert!(matches!(
            received.kind,
            ChangeKind::Worktree | ChangeKind::Both
        ));

        drop(watcher);
        let _ = fs::remove_dir_all(&dir);
    }
}
