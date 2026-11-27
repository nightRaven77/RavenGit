use crate::{
    amend, conflict_edit,
    git::{self, GitError, Repository},
    pull, push, rebase, replay, settings, stash, tag_push, tags, trust, undo, watcher,
    worktree_restore,
};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, atomic::AtomicU64},
};
use tauri::Manager;

pub(crate) struct RepoSession {
    pub(crate) repo: Repository,
    pub(crate) writes: Arc<Mutex<()>>,
    pub(crate) trusted: Arc<Mutex<bool>>,
    pub(crate) push_plan: Arc<Mutex<Option<push::Plan>>>,
    pub(crate) pull_plan: Arc<Mutex<Option<pull::Plan>>>,
    pub(crate) rebase_plan: Arc<Mutex<Option<rebase::Preview>>>,
    pub(crate) replay_plan: Arc<Mutex<Option<replay::Plan>>>,
    pub(crate) amend_plan: Arc<Mutex<Option<amend::Plan>>>,
    pub(crate) tag_plan: Arc<Mutex<Option<tags::Plan>>>,
    pub(crate) tag_push_plan: Arc<Mutex<Option<tag_push::Plan>>>,
    pub(crate) stash_plan: Arc<Mutex<Option<stash::Plan>>>,
    pub(crate) conflict_plan: Arc<Mutex<Option<conflict_edit::Session>>>,
    pub(crate) worktree_restore_plan: Arc<Mutex<Option<worktree_restore::Plan>>>,
    pub(crate) snapshot_restore_plan: Arc<Mutex<Option<crate::snapshots::RestorePlan>>>,
    pub(crate) undo_plan: Arc<Mutex<Option<undo::Plan>>>,
}

impl RepoSession {
    pub(crate) fn new(repo: Repository, allowed: bool) -> Self {
        Self {
            repo,
            writes: Arc::new(Mutex::new(())),
            trusted: Arc::new(Mutex::new(allowed)),
            push_plan: Arc::new(Mutex::new(None)),
            pull_plan: Arc::new(Mutex::new(None)),
            rebase_plan: Arc::new(Mutex::new(None)),
            replay_plan: Arc::new(Mutex::new(None)),
            amend_plan: Arc::new(Mutex::new(None)),
            tag_plan: Arc::new(Mutex::new(None)),
            tag_push_plan: Arc::new(Mutex::new(None)),
            stash_plan: Arc::new(Mutex::new(None)),
            conflict_plan: Arc::new(Mutex::new(None)),
            worktree_restore_plan: Arc::new(Mutex::new(None)),
            snapshot_restore_plan: Arc::new(Mutex::new(None)),
            undo_plan: Arc::new(Mutex::new(None)),
        }
    }

    pub(crate) fn clear_plans(&self) -> git::Result<()> {
        let fail = || {
            GitError::new(
                "STATE",
                "No se pudieron descartar las revisiones pendientes.",
            )
        };
        *self.push_plan.lock().map_err(|_| fail())? = None;
        *self.pull_plan.lock().map_err(|_| fail())? = None;
        *self.rebase_plan.lock().map_err(|_| fail())? = None;
        *self.replay_plan.lock().map_err(|_| fail())? = None;
        *self.amend_plan.lock().map_err(|_| fail())? = None;
        *self.tag_plan.lock().map_err(|_| fail())? = None;
        *self.tag_push_plan.lock().map_err(|_| fail())? = None;
        *self.stash_plan.lock().map_err(|_| fail())? = None;
        *self.conflict_plan.lock().map_err(|_| fail())? = None;
        *self.worktree_restore_plan.lock().map_err(|_| fail())? = None;
        *self.snapshot_restore_plan.lock().map_err(|_| fail())? = None;
        *self.undo_plan.lock().map_err(|_| fail())? = None;
        Ok(())
    }

    pub(crate) fn is_trusted(&self) -> git::Result<bool> {
        self.trusted
            .lock()
            .map(|guard| *guard)
            .map_err(|_| GitError::new("STATE", "No se pudo comprobar la confianza."))
    }
}

#[derive(Default)]
pub(crate) struct AppState {
    pub(crate) sessions: Arc<Mutex<HashMap<String, Arc<RepoSession>>>>,
    pub(crate) active_watcher: Arc<Mutex<Option<watcher::ActiveWatcher>>>,
    pub(crate) global_writes: Arc<Mutex<()>>,
    pub(crate) activity_lock: Arc<Mutex<()>>,
    pub(crate) library_lock: Arc<Mutex<()>>,
    pub(crate) settings_lock: Arc<Mutex<()>>,
    pub(crate) next: AtomicU64,
    pub(crate) delete_plan: Arc<Mutex<Option<crate::repository_delete::Plan>>>,
}

pub(crate) fn stop_watcher_for(
    active_watcher: &Arc<Mutex<Option<watcher::ActiveWatcher>>>,
    id: &str,
) {
    if let Ok(mut slot) = active_watcher.lock()
        && slot.as_ref().is_some_and(|w| w.repo_id == id)
    {
        *slot = None;
    }
}

pub(crate) fn session(state: &AppState, id: &str) -> git::Result<Arc<RepoSession>> {
    state
        .sessions
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo leer el estado de la aplicación."))?
        .get(id)
        .cloned()
        .ok_or_else(|| {
            GitError::new(
                "REPOSITORY_CHANGED",
                "El repositorio ya no está abierto. Vuelve a abrirlo.",
            )
        })
}

pub(crate) fn selected(state: &AppState, id: &str) -> git::Result<Repository> {
    Ok(session(state, id)?.repo.clone())
}

pub(crate) fn close_session(state: &AppState, id: &str) -> git::Result<()> {
    let candidate = state
        .sessions
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudieron consultar las sesiones abiertas."))?
        .get(id)
        .cloned();
    let Some(target) = candidate else {
        return Ok(());
    };
    let _write = target.writes.try_lock().map_err(|_| {
        GitError::new(
            "BUSY",
            "Hay una operación Git en curso en este repositorio.",
        )
    })?;
    target.clear_plans()?;
    stop_watcher_for(&state.active_watcher, id);
    state
        .sessions
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo cerrar el repositorio."))?
        .remove(id);
    Ok(())
}

pub(crate) fn library_directory(app: &tauri::AppHandle) -> git::Result<PathBuf> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("workspace"))
        .map_err(|_| {
            GitError::new(
                "LIBRARY_PATH",
                "No se pudo localizar la configuración de RavenGit.",
            )
        })
}

pub(crate) fn activity_directory(app: &tauri::AppHandle) -> git::Result<PathBuf> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("activity"))
        .map_err(|_| {
            GitError::new(
                "ACTIVITY_PATH",
                "No se pudo localizar la configuración de actividad de RavenGit.",
            )
        })
}

pub(crate) fn protected_directories(app: &tauri::AppHandle) -> git::Result<Vec<PathBuf>> {
    let home = app
        .path()
        .home_dir()
        .map_err(|_| GitError::new("DELETE_GUARD", "No se pudo verificar la carpeta personal."))?;
    let documents = app
        .path()
        .document_dir()
        .map_err(|_| GitError::new("DELETE_GUARD", "No se pudo verificar Documentos."))?;
    let config = app
        .path()
        .app_config_dir()
        .map_err(|_| GitError::new("DELETE_GUARD", "No se pudo verificar la configuración."))?;
    let mut paths = vec![
        home,
        documents.clone(),
        documents.join("RavenGit"),
        documents.join("RavenGit/Repositorios"),
        config,
    ];
    paths.extend(app.path().desktop_dir().ok());
    paths.extend(app.path().download_dir().ok());
    paths.extend(std::env::current_dir().ok());
    paths.extend(
        std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(Path::to_path_buf)),
    );
    Ok(paths)
}

pub(crate) fn trusted(state: &AppState, id: &str) -> git::Result<bool> {
    session(state, id)?.is_trusted()
}

pub(crate) fn trust_directory(app: &tauri::AppHandle) -> git::Result<PathBuf> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("trusted-repositories-v1"))
        .map_err(|_| {
            GitError::new(
                "TRUST_PATH",
                "No se pudo localizar la configuración de RavenGit.",
            )
        })
}

pub(crate) fn set_repository_trust(
    app: &tauri::AppHandle,
    state: &AppState,
    id: &str,
    allowed: bool,
) -> git::Result<Repository> {
    let s = session(state, id)?;
    let _guard = s
        .writes
        .try_lock()
        .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
    s.clear_plans()?;
    trust::set(&trust_directory(app)?, &s.repo.path, allowed)?;
    *s.trusted
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo actualizar la confianza."))? = allowed;
    Ok(s.repo.clone())
}

pub(crate) fn read_snapshot_limits(directory: &Path, settings_lock: &Arc<Mutex<()>>) -> (u16, u16) {
    let loaded = settings_lock
        .lock()
        .ok()
        .and_then(|_guard| settings::read(directory).ok())
        .unwrap_or_default();
    (loaded.snapshots.max_snapshots, loaded.snapshots.max_disk_mb)
}
