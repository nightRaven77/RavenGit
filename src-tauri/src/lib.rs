mod accounts;
mod activity;
mod amend;
mod branches;
mod changes;
mod clone;
mod conflict_edit;
mod conflict_restore;
mod conflict_stage;
mod conflicts;
mod external;
mod file_inspect;
mod git;
mod initialize;
mod library;
mod merge;
mod process;
mod pull;
mod push;
mod rebase;
mod rebase_plan;
mod remotes;
mod replay;
mod repository_delete;
mod repository_paths;
mod search;
mod settings;
mod ssh;
mod stash;
mod tag_push;
mod tags;
mod trust;
mod watcher;
mod worktree_restore;
mod worktrees;
use git::{CommitDiff, CommitFiles, GitError, HistoryPage, Repository, Snapshot};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tauri::{Emitter, Manager, State};
struct RepoSession {
    repo: Repository,
    writes: Arc<Mutex<()>>,
    trusted: Arc<Mutex<bool>>,
    push_plan: Arc<Mutex<Option<push::Plan>>>,
    pull_plan: Arc<Mutex<Option<pull::Plan>>>,
    rebase_plan: Arc<Mutex<Option<rebase::Preview>>>,
    replay_plan: Arc<Mutex<Option<replay::Plan>>>,
    amend_plan: Arc<Mutex<Option<amend::Plan>>>,
    tag_plan: Arc<Mutex<Option<tags::Plan>>>,
    tag_push_plan: Arc<Mutex<Option<tag_push::Plan>>>,
    stash_plan: Arc<Mutex<Option<stash::Plan>>>,
    conflict_plan: Arc<Mutex<Option<conflict_edit::Session>>>,
    worktree_restore_plan: Arc<Mutex<Option<worktree_restore::Plan>>>,
}
impl RepoSession {
    fn new(repo: Repository, allowed: bool) -> Self {
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
        }
    }
    fn clear_plans(&self) -> git::Result<()> {
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
        Ok(())
    }
    fn is_trusted(&self) -> git::Result<bool> {
        self.trusted
            .lock()
            .map(|guard| *guard)
            .map_err(|_| GitError::new("STATE", "No se pudo comprobar la confianza."))
    }
}
#[derive(Default)]
struct AppState {
    sessions: Arc<Mutex<HashMap<String, Arc<RepoSession>>>>,
    active_watcher: Arc<Mutex<Option<watcher::ActiveWatcher>>>,
    global_writes: Arc<Mutex<()>>,
    activity_lock: Arc<Mutex<()>>,
    library_lock: Arc<Mutex<()>>,
    settings_lock: Arc<Mutex<()>>,
    next: AtomicU64,
    delete_plan: Arc<Mutex<Option<repository_delete::Plan>>>,
}
fn stop_watcher_for(active_watcher: &Arc<Mutex<Option<watcher::ActiveWatcher>>>, id: &str) {
    if let Ok(mut slot) = active_watcher.lock()
        && slot.as_ref().is_some_and(|w| w.repo_id == id)
    {
        *slot = None;
    }
}
fn session(state: &AppState, id: &str) -> git::Result<Arc<RepoSession>> {
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
fn selected(state: &AppState, id: &str) -> git::Result<Repository> {
    Ok(session(state, id)?.repo.clone())
}
fn close_session(state: &AppState, id: &str) -> git::Result<()> {
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
fn library_directory(app: &tauri::AppHandle) -> git::Result<std::path::PathBuf> {
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
fn activity_directory(app: &tauri::AppHandle) -> git::Result<std::path::PathBuf> {
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

#[tauri::command]
async fn read_activity(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<activity::ActivityLog> {
    let directory = activity_directory(&app)?;
    let lock = state.activity_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la actividad."))?;
        activity::read(&directory)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo leer la actividad."))?
}

#[tauri::command]
async fn record_activity(
    id: Option<String>,
    input: activity::Input,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<activity::Event> {
    let repository = id
        .as_deref()
        .and_then(|repository_id| selected(&state, repository_id).ok())
        .and_then(|repo| {
            repo.path
                .file_name()
                .and_then(|name| name.to_str())
                .map(str::to_owned)
        });
    let directory = activity_directory(&app)?;
    let lock = state.activity_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo guardar la actividad."))?;
        activity::record(&directory, input, repository)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo guardar la actividad."))?
}

#[tauri::command]
async fn clear_activity(
    token: String,
    confirmed: bool,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<activity::ActivityLog> {
    let directory = activity_directory(&app)?;
    let lock = state.activity_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo borrar la actividad."))?;
        activity::clear(&directory, &token, confirmed)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo borrar la actividad."))?
}

#[tauri::command]
async fn export_diagnostics(
    destination: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<activity::ExportOutcome> {
    let directory = activity_directory(&app)?;
    let lock = state.activity_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo exportar el diagnóstico."))?;
        activity::export(&directory, Path::new(&destination))
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo exportar el diagnóstico."))?
}
#[tauri::command]
async fn get_default_repository_directory(app: tauri::AppHandle) -> git::Result<String> {
    let documents = app.path().document_dir().map_err(|_| {
        GitError::new(
            "DEFAULT_DIRECTORY",
            "No se pudo localizar Documentos. Elige otra ubicación.",
        )
    })?;
    tauri::async_runtime::spawn_blocking(move || {
        repository_paths::default_directory(&documents)
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo preparar la carpeta predeterminada."))?
}
fn protected_directories(app: &tauri::AppHandle) -> git::Result<Vec<std::path::PathBuf>> {
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
#[tauri::command]
async fn preview_repository_delete(
    path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<repository_delete::Review> {
    let plans = state.delete_plan.clone();
    let writes = state.global_writes.clone();
    let libraries = state.library_lock.clone();
    let token = format!("delete-{}", state.next.fetch_add(1, Ordering::Relaxed));
    tauri::async_runtime::spawn_blocking(move || {
        let _write = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let _library = libraries
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo revisar la biblioteca."))?;
        *plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar la revisión."))? = None;
        let plan = repository_delete::preview(
            &path,
            &library::read(&library_directory(&app)?)?,
            &protected_directories(&app)?,
            token,
        )?;
        let review = plan.review.clone();
        *plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo guardar la revisión."))? = Some(plan);
        Ok(review)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo revisar la eliminación."))?
}
#[derive(serde::Serialize)]
struct DeletedRepository {
    library: library::Library,
    warning: Option<String>,
}
#[tauri::command]
async fn trash_repository(
    path: String,
    token: String,
    confirmation: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<DeletedRepository> {
    let plans = state.delete_plan.clone();
    let writes = state.global_writes.clone();
    let libraries = state.library_lock.clone();
    let sessions = state.sessions.clone();
    let active_watcher = state.active_watcher.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _write = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let _library = libraries
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo actualizar la biblioteca."))?;
        let plan = plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión."))?
            .take()
            .ok_or_else(|| {
                GitError::new(
                    "DELETE_REVIEW",
                    "Vuelve a revisar la carpeta antes de eliminarla.",
                )
            })?;
        if plan.review.path != path || plan.review.token != token {
            return Err(GitError::new(
                "DELETE_REVIEW",
                "La revisión no coincide con la carpeta seleccionada.",
            ));
        }
        let directory = library_directory(&app)?;
        let mut value = library::read(&directory)?;
        let target_canonical = std::fs::canonicalize(&path).ok();
        let matching_sessions: Vec<Arc<RepoSession>> = sessions
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudieron consultar las sesiones."))?
            .values()
            .filter(|item| {
                item.repo.path == Path::new(&path)
                    || target_canonical
                        .as_ref()
                        .is_some_and(|canon| &item.repo.path == canon)
            })
            .cloned()
            .collect();
        let mut session_guards = Vec::with_capacity(matching_sessions.len());
        for open_session in &matching_sessions {
            session_guards.push(open_session.writes.try_lock().map_err(|_| {
                GitError::new(
                    "BUSY",
                    "Hay una operación Git en curso en este repositorio.",
                )
            })?);
        }
        repository_delete::execute(
            plan,
            &confirmation,
            &value,
            &protected_directories(&app)?,
            |canonical| {
                trust::set(&trust_directory(&app)?, canonical, false)?;
                for open_session in &matching_sessions {
                    *open_session.trusted.lock().map_err(|_| {
                        GitError::new("STATE", "No se pudo actualizar la autorización.")
                    })? = false;
                    open_session.clear_plans()?;
                }
                repository_delete::recycle(canonical)
            },
        )?;
        drop(session_guards);
        {
            let mut map = sessions
                .lock()
                .map_err(|_| GitError::new("STATE", "No se pudo cerrar la sesión eliminada."))?;
            for open_session in &matching_sessions {
                stop_watcher_for(&active_watcher, &open_session.repo.id);
                map.remove(&open_session.repo.id);
            }
        }
        value.repositories.retain(|entry| entry.path != path);
        let (library, warning) = match library::edit(&directory, library::Edit::Forget { path }) {
            Ok(saved) => (saved, None),
            Err(_) => (
                value,
                Some("La carpeta salió de su ubicación, pero no se guardó la biblioteca. No repitas el traslado: quita la entrada ausente de la lista al volver a abrirla.".into()),
            ),
        };
        Ok(DeletedRepository { library, warning })
    })
    .await
    .map_err(|_| {
        GitError::new(
            "DELETE_UNCERTAIN",
            "La operación se interrumpió. Revisa la carpeta y la Papelera antes de repetir.",
        )
    })?
}
#[tauri::command]
async fn read_repository_library(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<library::Library> {
    let lock = state.library_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la biblioteca."))?;
        library::read(&library_directory(&app)?)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo leer la biblioteca."))?
}
#[tauri::command]
async fn remember_repository(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<library::Library> {
    let repo = selected(&state, &id)?;
    let lock = state.library_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo guardar la biblioteca."))?;
        library::remember(&library_directory(&app)?, &repo.path)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo guardar la biblioteca."))?
}
#[tauri::command]
async fn edit_repository_library(
    edit: library::Edit,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<library::Library> {
    let lock = state.library_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo guardar la biblioteca."))?;
        library::edit(&library_directory(&app)?, edit)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo guardar la biblioteca."))?
}
#[tauri::command]
async fn save_history_preferences(
    id: String,
    preferences: library::Preferences,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<()> {
    let repo = selected(&state, &id)?;
    let lock = state.library_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudieron guardar las preferencias."))?;
        library::preferences(&library_directory(&app)?, &repo.path, preferences)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudieron guardar las preferencias."))?
}
#[tauri::command]
async fn relocate_repository(
    old_path: String,
    path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<library::Library> {
    let lock = state.library_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (repo, _) = git::open(Path::new(&path), "library-validation".into())?;
        let _guard = lock
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo actualizar la biblioteca."))?;
        library::relocate(&library_directory(&app)?, &old_path, &repo.path)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo relocalizar el repositorio."))?
}
#[tauri::command]
async fn clone_repository(
    parent: String,
    name: String,
    url: String,
    state: State<'_, AppState>,
) -> git::Result<clone::Cloned> {
    let writes = state.global_writes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes.try_lock().map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        clone::create(Path::new(&parent), &name, &url)
    }).await.map_err(|_| GitError::new("WORKER", "El clonado se interrumpió. Revisa el destino antes de repetir; RavenGit no borra datos automáticamente."))?
}
#[tauri::command]
async fn initialize_repository(
    parent: String,
    name: String,
    branch: String,
    state: State<'_, AppState>,
) -> git::Result<initialize::Initialized> {
    let writes = state.global_writes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes.try_lock().map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        initialize::create(Path::new(&parent), &name, &branch)
    }).await.map_err(|_| GitError::new("WORKER", "La creación se interrumpió. Revisa el destino antes de repetir; no se borraron archivos."))?
}
#[tauri::command]
async fn open_repository(
    path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<Snapshot> {
    let id = state.next.fetch_add(1, Ordering::Relaxed).to_string();
    let sessions = state.sessions.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (repo, mut snapshot) = git::open(Path::new(&path), id)?;
        let allowed = trust::contains(&trust_directory(&app)?, &repo.path)?;
        snapshot.trusted = allowed;
        let existing = {
            let guard = sessions
                .lock()
                .map_err(|_| GitError::new("STATE", "No se pudo revisar las sesiones abiertas."))?;
            guard
                .values()
                .find(|item| item.repo.path == repo.path)
                .cloned()
        };
        if let Some(current) = existing {
            *current
                .trusted
                .lock()
                .map_err(|_| GitError::new("STATE", "No se pudo actualizar la confianza."))? =
                allowed;
            snapshot.id = current.repo.id.clone();
            return Ok(snapshot);
        }
        let repo_id = repo.id.clone();
        sessions
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo registrar la sesión del repositorio."))?
            .insert(repo_id, Arc::new(RepoSession::new(repo, allowed)));
        Ok(snapshot)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo completar la apertura."))?
}
#[tauri::command]
async fn close_repository(id: String, state: State<'_, AppState>) -> git::Result<()> {
    close_session(&state, &id)
}
#[tauri::command]
async fn read_worktrees(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<worktrees::WorktreesState> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let allowed = s.is_trusted()?;
        worktrees::list(&s.repo, allowed)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudieron consultar los worktrees."))?
}
#[tauri::command]
async fn add_worktree(
    id: String,
    request: worktrees::AddRequest,
    state: State<'_, AppState>,
) -> git::Result<worktrees::WorktreeOutcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        worktrees::add(&s.repo, allowed, request)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo crear el worktree."))?
}
#[tauri::command]
async fn lock_worktree(
    id: String,
    path: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> git::Result<worktrees::WorktreeOutcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        worktrees::lock(&s.repo, allowed, &path, reason.as_deref())
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo bloquear el worktree."))?
}
#[tauri::command]
async fn unlock_worktree(
    id: String,
    path: String,
    state: State<'_, AppState>,
) -> git::Result<worktrees::WorktreeOutcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        worktrees::unlock(&s.repo, allowed, &path)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo desbloquear el worktree."))?
}
#[tauri::command]
async fn remove_worktree(
    id: String,
    path: String,
    force: bool,
    state: State<'_, AppState>,
) -> git::Result<worktrees::WorktreeOutcome> {
    let s = session(&state, &id)?;
    let target_canon = std::fs::canonicalize(Path::new(path.trim()))
        .unwrap_or_else(|_| PathBuf::from(path.trim()));
    {
        let sessions = state.sessions.lock().map_err(|_| {
            GitError::new("STATE", "No se pudieron consultar las pestañas abiertas.")
        })?;
        for (other_id, other) in sessions.iter() {
            if other_id == &id {
                continue;
            }
            let other_canon =
                std::fs::canonicalize(&other.repo.path).unwrap_or_else(|_| other.repo.path.clone());
            if other_canon == target_canon || other.repo.path == Path::new(path.trim()) {
                return Err(GitError::new(
                    "WORKTREE_OPEN_IN_TAB",
                    "Ese worktree está abierto en otra pestaña. Ciérrala antes de eliminarlo.",
                ));
            }
        }
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        worktrees::remove(&s.repo, allowed, &path, force)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo eliminar el worktree."))?
}
#[tauri::command]
async fn prune_worktrees(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<worktrees::WorktreeOutcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        worktrees::prune(&s.repo, allowed)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudieron limpiar los worktrees obsoletos."))?
}
#[tauri::command]
async fn open_worktree_external(
    id: String,
    path: String,
    kind: external::ExternalKind,
    app_id: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<external::OpenExternalOutcome> {
    let repo = selected(&state, &id)?;
    let directory = library_directory(&app)?;
    let lock = state.settings_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let verified = worktrees::verify_member_path(&repo, &path)?;
        let current = {
            let _guard = lock
                .lock()
                .map_err(|_| GitError::new("STATE", "No se pudo leer la configuración."))?;
            settings::read(&directory)?
        };
        external::open_path(&verified, kind, app_id.as_deref(), &current.external)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo abrir la aplicación externa."))?
}
#[tauri::command]
async fn read_worktree_summary(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<changes::WorktreeSummary> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let allowed = s.is_trusted()?;
        changes::summary(&s.repo, allowed)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "No se pudo consultar el resumen de cambios locales.",
        )
    })?
}
#[tauri::command]
async fn watch_repository(
    id: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<()> {
    let Some(target_id) = id else {
        *state
            .active_watcher
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo detener el observador."))? = None;
        return Ok(());
    };
    {
        let current = state
            .active_watcher
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo consultar el observador."))?;
        if current
            .as_ref()
            .is_some_and(|watcher| watcher.repo_id == target_id)
        {
            return Ok(());
        }
    }
    let s = session(&state, &target_id)?;
    let sessions = state.sessions.clone();
    let active_watcher = state.active_watcher.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let git_dir = PathBuf::from(
            git::text(
                &s.repo.path,
                &["rev-parse", "--path-format=absolute", "--git-dir"],
            )?
            .trim(),
        );
        let common_dir = PathBuf::from(
            git::text(
                &s.repo.path,
                &["rev-parse", "--path-format=absolute", "--git-common-dir"],
            )?
            .trim(),
        );
        let watcher = watcher::ActiveWatcher::start(
            s.repo.id.clone(),
            s.repo.path.clone(),
            git_dir,
            common_dir,
            s.writes.clone(),
            Duration::from_millis(320),
            move |event| {
                let _ = app.emit("ravengit://repo-changed", event);
            },
        )?;
        let still_open = sessions
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo registrar el observador."))?
            .contains_key(&s.repo.id);
        if still_open {
            *active_watcher
                .lock()
                .map_err(|_| GitError::new("STATE", "No se pudo activar el observador."))? =
                Some(watcher);
        }
        Ok(())
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo iniciar el observador local."))?
}
#[tauri::command]
async fn search_history(
    id: String,
    query: search::SearchQuery,
    state: State<'_, AppState>,
) -> git::Result<search::SearchResult> {
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || search::history(&repo, query))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo completar la búsqueda."))?
}
#[tauri::command]
async fn read_search_match_diff(
    id: String,
    hash: String,
    path: Option<String>,
    code_query: Option<String>,
    code_mode: Option<search::CodeSearchMode>,
    state: State<'_, AppState>,
) -> git::Result<search::SearchMatchDiff> {
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        search::match_diff(
            &repo,
            &hash,
            path.as_deref(),
            code_query.as_deref(),
            code_mode,
        )
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo leer el fragmento coincidente."))?
}
#[tauri::command]
async fn refresh_repository(
    id: String,
    scope: Option<String>,
    state: State<'_, AppState>,
) -> git::Result<Snapshot> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut snapshot = git::snapshot_scoped(&repo, scope.as_deref())?;
        snapshot.trusted = allowed;
        Ok(snapshot)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo actualizar."))?
}
#[tauri::command]
async fn read_history(
    id: String,
    offset: usize,
    generation: String,
    scope: Option<String>,
    state: State<'_, AppState>,
) -> git::Result<HistoryPage> {
    if offset > 1_000_000 {
        return Err(GitError::new(
            "PAGE_LIMIT",
            "El prototipo admite hasta un millón de commits.",
        ));
    }
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        git::history_scoped(&repo, offset, &generation, scope.as_deref())
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo leer el historial."))?
}
#[tauri::command]
async fn read_commit_files(
    id: String,
    hash: String,
    parent_index: usize,
    state: State<'_, AppState>,
) -> git::Result<CommitFiles> {
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || git::commit_files(&repo, &hash, parent_index))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo leer la lista de archivos del commit."))?
}
#[allow(clippy::too_many_arguments)]
#[tauri::command]
async fn read_commit_diff(
    id: String,
    hash: String,
    parent_index: usize,
    path: Option<String>,
    old_path: Option<String>,
    ignore_whitespace: Option<bool>,
    context_lines: Option<usize>,
    state: State<'_, AppState>,
) -> git::Result<CommitDiff> {
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        git::diff_with_options(
            &repo,
            &hash,
            parent_index,
            path.as_deref(),
            old_path.as_deref(),
            ignore_whitespace.unwrap_or(false),
            context_lines.unwrap_or(3),
        )
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo leer el diff."))?
}
#[tauri::command]
async fn read_file_history(
    id: String,
    path: String,
    revision: Option<String>,
    offset: Option<usize>,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> git::Result<file_inspect::FileHistoryPage> {
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        file_inspect::file_history(
            &repo,
            &path,
            revision.as_deref(),
            offset.unwrap_or(0),
            limit.unwrap_or(50),
        )
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo leer el historial del archivo."))?
}
#[tauri::command]
async fn read_file_blame(
    id: String,
    path: String,
    revision: Option<String>,
    state: State<'_, AppState>,
) -> git::Result<file_inspect::FileBlame> {
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        file_inspect::file_blame(&repo, &path, revision.as_deref())
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo consultar Git Blame."))?
}
#[tauri::command]
async fn read_range_files(
    id: String,
    base: String,
    target: String,
    state: State<'_, AppState>,
) -> git::Result<git::RangeFiles> {
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || git::range_files(&repo, &base, &target))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudieron listar los archivos del rango."))?
}
#[allow(clippy::too_many_arguments)]
#[tauri::command]
async fn read_range_diff(
    id: String,
    base: String,
    target: String,
    path: Option<String>,
    old_path: Option<String>,
    ignore_whitespace: Option<bool>,
    context_lines: Option<usize>,
    state: State<'_, AppState>,
) -> git::Result<git::RangeDiff> {
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        git::range_diff(
            &repo,
            &base,
            &target,
            path.as_deref(),
            old_path.as_deref(),
            ignore_whitespace.unwrap_or(false),
            context_lines.unwrap_or(3),
        )
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo leer el diff del rango."))?
}
fn trusted(state: &AppState, id: &str) -> git::Result<bool> {
    session(state, id)?.is_trusted()
}
fn trust_directory(app: &tauri::AppHandle) -> git::Result<std::path::PathBuf> {
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
fn set_repository_trust(
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
#[tauri::command]
async fn revoke_repository_authorization(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<changes::Changes> {
    let repo = set_repository_trust(&app, &state, &id, false)?;
    changes::read(&repo, false)
}
#[tauri::command]
async fn read_changes(id: String, state: State<'_, AppState>) -> git::Result<changes::Changes> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || changes::read(&repo, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudieron leer los cambios."))?
}
#[tauri::command]
async fn authorize_repository(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<changes::Changes> {
    let repo = set_repository_trust(&app, &state, &id, true)?;
    tauri::async_runtime::spawn_blocking(move || changes::read(&repo, true))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudieron leer los cambios."))?
}
#[tauri::command]
async fn read_file_diff(
    id: String,
    token: String,
    path: String,
    area: changes::Area,
    ignore_whitespace: Option<bool>,
    context_lines: Option<usize>,
    state: State<'_, AppState>,
) -> git::Result<changes::FileDiff> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        changes::file_diff_with_options(
            &repo,
            &token,
            &path,
            area,
            allowed,
            ignore_whitespace.unwrap_or(false),
            context_lines.unwrap_or(3),
        )
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo leer el archivo."))?
}
#[tauri::command]
async fn read_conflict(
    id: String,
    token: String,
    path: String,
    state: State<'_, AppState>,
) -> git::Result<conflicts::Conflict> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || conflicts::read(&repo, &token, &path, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo consultar el conflicto."))?
}
async fn with_conflict<T: Send + 'static>(
    state: &AppState,
    id: String,
    work: impl FnOnce(&Repository, bool, &mut Option<conflict_edit::Session>) -> git::Result<T>
    + Send
    + 'static,
) -> git::Result<T> {
    let s = session(state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _write = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        let mut plans = s
            .conflict_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo revisar el borrador."))?;
        work(&s.repo, allowed, &mut plans)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "CONFLICT_UNCERTAIN",
            "La operación se interrumpió. Comprueba el archivo y su respaldo en la carpeta Git antes de repetir.",
        )
    })?
}
#[tauri::command]
async fn read_conflict_backups(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<conflict_restore::Listing> {
    with_conflict(&state, id, |repo, allowed, plans| {
        *plans = None;
        conflict_restore::options(repo, allowed)
    })
    .await
}
#[tauri::command]
async fn preview_conflict_restore(
    id: String,
    backup: String,
    state: State<'_, AppState>,
) -> git::Result<conflict_restore::Review> {
    with_conflict(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = conflict_restore::preview(repo, &backup, allowed)?;
        let view = plan.view.clone();
        *plans = Some(conflict_edit::Session::Recovering(plan));
        Ok(view)
    })
    .await
}
#[tauri::command]
async fn restore_conflict_backup(
    id: String,
    token: String,
    state: State<'_, AppState>,
) -> git::Result<conflict_restore::Outcome> {
    with_conflict(&state, id, move |repo, allowed, plans| {
        let Some(conflict_edit::Session::Recovering(plan)) = plans.take() else {
            return Err(GitError::new(
                "CONFLICT_RESTORE_REVIEW",
                "Vuelve a revisar el respaldo antes de restaurar.",
            ));
        };
        if plan.view.token != token {
            return Err(GitError::new(
                "CONFLICT_RESTORE_REVIEW",
                "La revisión ya no está vigente.",
            ));
        }
        conflict_restore::restore(repo, plan, allowed)
    })
    .await
}
#[tauri::command]
async fn preview_conflict_edit(
    id: String,
    token: String,
    path: String,
    state: State<'_, AppState>,
) -> git::Result<conflict_edit::Preview> {
    with_conflict(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = conflict_edit::preview(repo, &token, &path, allowed)?;
        let view = plan.view.clone();
        *plans = Some(conflict_edit::Session::Editing(plan));
        Ok(view)
    })
    .await
}
#[tauri::command]
async fn save_conflict_result(
    id: String,
    token: String,
    result: String,
    state: State<'_, AppState>,
) -> git::Result<conflict_edit::Outcome> {
    with_conflict(&state, id, move |repo, allowed, plans| {
        let Some(conflict_edit::Session::Editing(plan)) = plans.take() else {
            return Err(GitError::new(
                "CONFLICT_STALE",
                "La revisión se consumió o cambió. Conserva el borrador y vuelve a revisar.",
            ));
        };
        if plan.view.token != token {
            return Err(GitError::new("CONFLICT_STALE", "La revisión cambió."));
        }
        let mut outcome = conflict_edit::save(repo, plan, &result, allowed)?;
        if let Some(receipt) = outcome.receipt.take() {
            *plans = Some(conflict_edit::Session::Saved(receipt));
        }
        Ok(outcome)
    })
    .await
}
#[tauri::command]
async fn preview_conflict_stage(
    id: String,
    token: String,
    state: State<'_, AppState>,
) -> git::Result<conflict_stage::Preview> {
    with_conflict(&state, id, move |repo, allowed, plans| {
        let Some(conflict_edit::Session::Saved(receipt)) = plans.take() else {
            return Err(GitError::new(
                "CONFLICT_STAGE_STALE",
                "El guardado revisado ya no está disponible. Actualiza Cambios.",
            ));
        };
        if receipt.token != token {
            return Err(GitError::new(
                "CONFLICT_STAGE_STALE",
                "El guardado revisado cambió.",
            ));
        }
        let view = conflict_stage::preview(repo, &receipt, allowed)?;
        *plans = Some(conflict_edit::Session::Reviewed(receipt, view.clone()));
        Ok(view)
    })
    .await
}
#[tauri::command]
async fn prepare_conflict_result(
    id: String,
    token: String,
    state: State<'_, AppState>,
) -> git::Result<conflict_stage::Outcome> {
    with_conflict(&state, id, move |repo, allowed, plans| {
        let Some(conflict_edit::Session::Reviewed(receipt, view)) = plans.take() else {
            return Err(GitError::new(
                "CONFLICT_STAGE_STALE",
                "La revisión se consumió. Actualiza y comprueba el índice antes de repetir.",
            ));
        };
        if view.token != token {
            return Err(GitError::new("CONFLICT_STAGE_STALE", "La revisión cambió."));
        }
        conflict_stage::prepare(repo, receipt, view, allowed)
    })
    .await
}
#[allow(clippy::too_many_arguments)]
#[tauri::command]
async fn change_file(
    id: String,
    token: String,
    path: String,
    area: changes::Area,
    hunk_index: Option<usize>,
    preview_token: Option<String>,
    line_indices: Option<Vec<usize>>,
    context_lines: Option<usize>,
    state: State<'_, AppState>,
) -> git::Result<changes::MutationResult> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        changes::stage_with_options(
            &s.repo,
            &token,
            &path,
            area,
            hunk_index,
            preview_token.as_deref(),
            line_indices.as_deref(),
            context_lines.unwrap_or(3),
            allowed,
        )
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "La operación se interrumpió. Actualiza antes de repetir.",
        )
    })?
}
#[allow(clippy::too_many_arguments)]
#[tauri::command]
async fn discard_file_lines(
    id: String,
    token: String,
    path: String,
    hunk_index: usize,
    preview_token: String,
    line_indices: Vec<usize>,
    context_lines: Option<usize>,
    state: State<'_, AppState>,
) -> git::Result<changes::MutationResult> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        changes::discard_lines(
            &s.repo,
            &token,
            &path,
            hunk_index,
            &preview_token,
            &line_indices,
            context_lines.unwrap_or(3),
            allowed,
        )
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "La operación se interrumpió. Actualiza antes de repetir.",
        )
    })?
}
#[tauri::command]
async fn change_files(
    id: String,
    token: String,
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> git::Result<changes::MutationResult> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        changes::stage_files(&s.repo, &token, &paths, allowed)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "La operación se interrumpió. Actualiza antes de repetir.",
        )
    })?
}
#[tauri::command]
async fn create_commit(
    id: String,
    token: String,
    message: String,
    state: State<'_, AppState>,
) -> git::Result<changes::MutationResult> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        changes::commit(&s.repo, &token, &message, allowed)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "La operación se interrumpió. Comprueba HEAD antes de repetir.",
        )
    })?
}
async fn with_amend<T: Send + 'static>(
    state: &AppState,
    id: String,
    work: impl FnOnce(&Repository, bool, &mut Option<amend::Plan>) -> git::Result<T> + Send + 'static,
) -> git::Result<T> {
    let s = session(state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _write = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        let mut plans = s
            .amend_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión de amend."))?;
        *s.push_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Push."))? = None;
        *s.pull_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Pull."))? = None;
        *s.rebase_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Rebase."))? = None;
        *s.replay_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Replay."))? = None;
        work(&s.repo, allowed, &mut plans)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "AMEND_UNCERTAIN",
            "La operación se interrumpió. Comprueba HEAD, index y refs/ravengit/amend antes de repetir.",
        )
    })?
}
async fn with_stash<T: Send + 'static>(
    state: &AppState,
    id: String,
    work: impl FnOnce(&Repository, bool, &mut Option<stash::Plan>) -> git::Result<T> + Send + 'static,
) -> git::Result<T> {
    let s = session(state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _write = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        let mut plans = s
            .stash_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión de stash."))?;
        work(&s.repo, allowed, &mut plans)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "STASH_UNCERTAIN",
            "La operación se interrumpió. Abre Stash y revisa su recuperación antes de repetir.",
        )
    })?
}
async fn with_worktree_restore<T: Send + 'static>(
    state: &AppState,
    id: String,
    work: impl FnOnce(&Repository, bool, &mut Option<worktree_restore::Plan>) -> git::Result<T>
    + Send
    + 'static,
) -> git::Result<T> {
    let s = session(state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _write = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        let mut plans = s
            .worktree_restore_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión de restauración."))?;
        *s.push_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Push."))? = None;
        *s.pull_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Pull."))? = None;
        *s.rebase_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Rebase."))? = None;
        *s.replay_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Replay."))? = None;
        work(&s.repo, allowed, &mut plans)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "RESTORE_UNCERTAIN",
            "La operación se interrumpió. Comprueba el árbol de trabajo antes de repetir.",
        )
    })?
}

#[tauri::command]
async fn read_stash(id: String, state: State<'_, AppState>) -> git::Result<stash::Options> {
    with_stash(&state, id, |repo, allowed, _| stash::read(repo, allowed)).await
}
#[tauri::command]
async fn preview_stash(
    id: String,
    action: stash::Action,
    state: State<'_, AppState>,
) -> git::Result<stash::Plan> {
    with_stash(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = stash::preview(repo, action, allowed)?;
        *plans = Some(plan.clone());
        Ok(plan)
    })
    .await
}
#[tauri::command]
async fn confirm_stash(
    id: String,
    token: String,
    state: State<'_, AppState>,
) -> git::Result<String> {
    with_stash(&state, id, move |repo, allowed, plans| {
        let plan = plans
            .take()
            .filter(|plan| plan.token == token)
            .ok_or_else(|| {
                GitError::new("STASH_REVIEW", "Vuelve a revisar Stash antes de confirmar.")
            })?;
        stash::execute(repo, plan, allowed)
    })
    .await
}
#[tauri::command]
async fn finish_stash(
    id: String,
    token: String,
    state: State<'_, AppState>,
) -> git::Result<String> {
    with_stash(&state, id, move |repo, allowed, plans| {
        *plans = None;
        stash::finish(repo, &token, allowed)
    })
    .await
}
async fn with_tag<T: Send + 'static>(
    state: &AppState,
    id: String,
    work: impl FnOnce(&Repository, bool, &mut Option<tags::Plan>) -> git::Result<T> + Send + 'static,
) -> git::Result<T> {
    let s = session(state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _write = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        let mut plans = s
            .tag_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión de etiqueta."))?;
        work(&s.repo, allowed, &mut plans)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "TAG_UNCERTAIN",
            "La operación se interrumpió. Comprueba las etiquetas antes de repetir.",
        )
    })?
}
#[tauri::command]
async fn preview_tag(
    id: String,
    name: String,
    commit: String,
    state: State<'_, AppState>,
) -> git::Result<tags::Plan> {
    with_tag(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = tags::preview(repo, &name, &commit, allowed)?;
        *plans = Some(plan.clone());
        Ok(plan)
    })
    .await
}
#[tauri::command]
async fn create_tag(id: String, token: String, state: State<'_, AppState>) -> git::Result<String> {
    with_tag(&state, id, move |repo, allowed, plans| {
        let plan = plans
            .take()
            .filter(|plan| plan.token == token)
            .ok_or_else(|| {
                GitError::new(
                    "TAG_REVIEW",
                    "Vuelve a revisar la etiqueta antes de confirmar.",
                )
            })?;
        tags::create(repo, plan, allowed)
    })
    .await
}
async fn with_tag_push<T: Send + 'static>(
    state: &AppState,
    id: String,
    work: impl FnOnce(&Repository, bool, &mut Option<tag_push::Plan>) -> git::Result<T> + Send + 'static,
) -> git::Result<T> {
    let s = session(state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _write = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        let mut plans = s
            .tag_push_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión."))?;
        work(&s.repo, allowed, &mut plans)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "TAG_PUSH_UNCERTAIN",
            "La operación se interrumpió. Comprueba el destino antes de repetir.",
        )
    })?
}
#[tauri::command]
async fn read_tag_push_options(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<tag_push::Options> {
    with_tag_push(&state, id, |repo, allowed, plans| {
        *plans = None;
        tag_push::options(repo, allowed)
    })
    .await
}
#[tauri::command]
async fn preview_tag_push(
    id: String,
    token: String,
    remote: String,
    tag: String,
    state: State<'_, AppState>,
) -> git::Result<tag_push::Preview> {
    with_tag_push(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = tag_push::preview(repo, &token, &remote, &tag, allowed)?;
        let view = plan.view.clone();
        *plans = Some(plan);
        Ok(view)
    })
    .await
}
#[tauri::command]
async fn publish_tag(
    id: String,
    token: String,
    state: State<'_, AppState>,
) -> git::Result<tag_push::Outcome> {
    with_tag_push(&state, id, move |repo, allowed, plans| {
        let plan = plans
            .take()
            .filter(|plan| plan.view.token == token)
            .ok_or_else(|| {
                GitError::new(
                    "TAG_PUSH_REVIEW",
                    "Vuelve a revisar la etiqueta antes de publicarla.",
                )
            })?;
        tag_push::publish(repo, plan, allowed)
    })
    .await
}
#[tauri::command]
async fn preview_amend(
    id: String,
    message: Option<String>,
    state: State<'_, AppState>,
) -> git::Result<amend::Plan> {
    with_amend(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = amend::preview(repo, message.as_deref(), allowed)?;
        *plans = Some(plan.clone());
        Ok(plan)
    })
    .await
}
#[tauri::command]
async fn confirm_amend(
    id: String,
    token: String,
    state: State<'_, AppState>,
) -> git::Result<amend::Outcome> {
    with_amend(&state, id, move |repo, allowed, plans| {
        let plan = plans
            .take()
            .filter(|plan| plan.token == token)
            .ok_or_else(|| {
                GitError::new("AMEND_REVIEW", "Vuelve a revisar amend antes de confirmar.")
            })?;
        amend::execute(repo, plan, allowed)
    })
    .await
}
#[tauri::command]
async fn check_worktree_restore(
    id: String,
    path: String,
    state: State<'_, AppState>,
) -> git::Result<worktree_restore::RestoreStatus> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let allowed = s.is_trusted()?;
        worktree_restore::check_status(&s.repo, &path, allowed)
    })
    .await
    .map_err(|_| GitError::new("STATE", "No se pudo consultar el estado de restauración."))?
}

#[tauri::command]
async fn preview_worktree_restore(
    id: String,
    path: String,
    is_redo: bool,
    state: State<'_, AppState>,
) -> git::Result<worktree_restore::Plan> {
    with_worktree_restore(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = worktree_restore::preview(repo, &path, is_redo, allowed)?;
        *plans = Some(plan.clone());
        Ok(plan)
    })
    .await
}

#[tauri::command]
async fn confirm_worktree_restore(
    id: String,
    token: String,
    state: State<'_, AppState>,
) -> git::Result<worktree_restore::Outcome> {
    with_worktree_restore(&state, id, move |repo, allowed, plans| {
        let plan = plans
            .take()
            .filter(|plan| plan.token == token)
            .ok_or_else(|| {
                GitError::new(
                    "RESTORE_REVIEW",
                    "Vuelve a revisar la restauración antes de confirmar.",
                )
            })?;
        worktree_restore::execute(repo, plan, allowed)
    })
    .await
}

#[tauri::command]
async fn read_remotes(id: String, state: State<'_, AppState>) -> git::Result<remotes::Remotes> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || remotes::read(&repo, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudieron leer los remotos."))?
}
#[tauri::command]
async fn read_ssh_accounts(app: tauri::AppHandle) -> git::Result<accounts::Accounts> {
    let directory = library_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || accounts::read(&directory))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudieron leer los perfiles SSH."))?
}
#[tauri::command]
async fn save_ssh_accounts(
    token: String,
    profiles: Vec<accounts::Profile>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<accounts::Accounts> {
    let directory = library_directory(&app)?;
    let lock = state.library_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo bloquear la configuración."))?;
        accounts::save(&directory, &token, profiles)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudieron guardar los perfiles SSH."))?
}
#[tauri::command]
async fn read_ssh_agent(id: String, state: State<'_, AppState>) -> git::Result<ssh::AgentStatus> {
    let s = session(&state, &id)?;
    if !s.is_trusted()? {
        return Err(GitError::new(
            "UNTRUSTED",
            "Autoriza el repositorio antes de consultar su cliente SSH.",
        ));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación sigue en curso."))?;
        ssh::agent_status(&s.repo)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo consultar el agente SSH."))?
}
#[tauri::command]
async fn read_authentication_status(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<ssh::AuthenticationStatus> {
    let s = session(&state, &id)?;
    if !s.is_trusted()? {
        return Err(GitError::new(
            "UNTRUSTED",
            "Autoriza el repositorio antes de consultar autenticación.",
        ));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación sigue en curso."))?;
        ssh::authentication_status(&s.repo)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo consultar autenticación."))?
}
#[tauri::command]
async fn authorize_remote_operations(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<remotes::Remotes> {
    let repo = set_repository_trust(&app, &state, &id, true)?;
    tauri::async_runtime::spawn_blocking(move || remotes::read(&repo, true))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudieron leer los remotos."))?
}
#[tauri::command]
async fn edit_remote(
    id: String,
    token: String,
    edit: remotes::Edit,
    state: State<'_, AppState>,
) -> git::Result<remotes::OperationResult> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación Git sigue en curso."))?;
        let allowed = s.is_trusted()?;
        remotes::edit(&s.repo, &token, edit, allowed)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "La operación se interrumpió. Actualiza los remotos antes de repetir.",
        )
    })?
}
#[tauri::command]
async fn contact_remote(
    id: String,
    token: String,
    name: String,
    fetch: bool,
    state: State<'_, AppState>,
) -> git::Result<remotes::OperationResult> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación Git sigue en curso."))?;
        let allowed = s.is_trusted()?;
        remotes::contact(&s.repo, &token, &name, fetch, allowed)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "La operación se interrumpió. Actualiza antes de repetir; no hay reintentos automáticos.",
        )
    })?
}
#[tauri::command]
async fn read_push_options(id: String, state: State<'_, AppState>) -> git::Result<push::Options> {
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || push::options(&repo))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudieron leer las ramas locales."))?
}
#[tauri::command]
async fn preview_push(
    id: String,
    token: String,
    remote: String,
    source_branch: String,
    target_branch: String,
    set_upstream: bool,
    state: State<'_, AppState>,
) -> git::Result<push::Preview> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación Git sigue en curso."))?;
        let allowed = s.is_trusted()?;
        let mut slot = s
            .push_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo guardar la revisión de push."))?;
        *slot = None;
        let plan = push::preview(
            &s.repo,
            &token,
            &remote,
            &source_branch,
            &target_branch,
            set_upstream,
            allowed,
        )?;
        let view = plan.view.clone();
        *slot = Some(plan);
        Ok(view)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "No se pudo revisar el push. Vuelve a revisar antes de publicar.",
        )
    })?
}
#[tauri::command]
async fn publish_push(
    id: String,
    preview_token: String,
    state: State<'_, AppState>,
) -> git::Result<push::Outcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación Git sigue en curso."))?;
        let allowed = s.is_trusted()?;
        let plan = s
            .push_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión."))?
            .take()
            .ok_or_else(|| {
                GitError::new(
                    "PUSH_REVIEW",
                    "No hay revisión activa. Revisa el destino antes de publicar.",
                )
            })?;
        if plan.view.token != preview_token {
            return Err(GitError::new(
                "PUSH_REVIEW",
                "La revisión ya no está activa. Vuelve a revisar antes de publicar.",
            ));
        }
        push::publish(&s.repo, plan, allowed)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "La publicación se interrumpió. Comprueba el destino antes de repetir; no hay reintentos automáticos.",
        )
    })?
}
#[tauri::command]
async fn read_branches(id: String, state: State<'_, AppState>) -> git::Result<branches::State> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || branches::read(&repo, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudieron leer las ramas."))?
}
#[tauri::command]
async fn edit_branch(
    id: String,
    token: String,
    edit: branches::Edit,
    state: State<'_, AppState>,
) -> git::Result<branches::Outcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        *s.push_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar la revisión de publicación."))? =
            None;
        branches::edit(&s.repo, &token, edit, allowed)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "La operación de rama se interrumpió. Actualiza y comprueba el estado antes de repetir.",
        )
    })?
}
#[tauri::command]
async fn preview_merge(
    id: String,
    token: String,
    source: String,
    state: State<'_, AppState>,
) -> git::Result<merge::Preview> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || merge::preview(&repo, &token, &source, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo revisar la integración."))?
}
#[tauri::command]
async fn preview_rebase(
    id: String,
    token: String,
    base: String,
    state: State<'_, AppState>,
) -> git::Result<rebase::Preview> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        let mut plans = s
            .rebase_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo guardar la revisión."))?;
        *plans = None;
        let view = rebase::preview(&s.repo, &token, &base, allowed)?;
        *plans = Some(view.clone());
        Ok(view)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo revisar el rebase."))?
}
#[tauri::command]
async fn review_interactive_rebase(
    id: String,
    token: String,
    steps: Vec<rebase_plan::Step>,
    state: State<'_, AppState>,
) -> git::Result<rebase::Preview> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        let mut plans = s
            .rebase_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión."))?;
        let old = plans
            .take()
            .filter(|plan| plan.token == token)
            .ok_or_else(|| {
                GitError::new("REBASE_REVIEW", "Actualiza y revisa de nuevo el rango.")
            })?;
        let mut fresh = rebase::preview(&s.repo, &old.token, &old.base, allowed)?;
        if let Err(error) = rebase_plan::validate(&fresh, &steps) {
            *plans = Some(fresh);
            return Err(error);
        }
        fresh.interactive = Some(rebase_plan::Plan {
            token: conflict_edit::nonce(),
            steps,
        });
        *plans = Some(fresh.clone());
        Ok(fresh)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo revisar el plan interactivo."))?
}
#[tauri::command]
async fn read_rebase(id: String, state: State<'_, AppState>) -> git::Result<Option<rebase::State>> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || rebase::read(&repo, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo leer el rebase."))?
}
#[tauri::command]
async fn read_replay(id: String, state: State<'_, AppState>) -> git::Result<replay::Options> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || replay::options(&repo, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo leer la operación de commit."))?
}
async fn with_replay<T: Send + 'static, F>(state: &AppState, id: String, work: F) -> git::Result<T>
where
    F: FnOnce(&Repository, bool, &mut Option<replay::Plan>) -> git::Result<T> + Send + 'static,
{
    let s = session(state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        let mut plans = s
            .replay_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión."))?;
        *s.push_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Push."))? = None;
        *s.pull_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Pull."))? = None;
        *s.rebase_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Rebase."))? = None;
        work(&s.repo, allowed, &mut plans)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "La operación se interrumpió. Actualiza y comprueba Git antes de repetir.",
        )
    })?
}
#[tauri::command]
async fn preview_replay(
    id: String,
    kind: replay::Kind,
    commit: String,
    state: State<'_, AppState>,
) -> git::Result<replay::Plan> {
    with_replay(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = replay::preview(repo, kind, &commit, allowed)?;
        *plans = Some(plan.clone());
        Ok(plan)
    })
    .await
}
#[tauri::command]
async fn edit_replay(
    id: String,
    token: String,
    action: Option<replay::Action>,
    state: State<'_, AppState>,
) -> git::Result<merge::Outcome> {
    with_replay(&state, id, move |repo, allowed, plans| {
        let plan = plans.take();
        match action {
            Some(action) => replay::edit(repo, &token, action, allowed),
            None => {
                let plan = plan.filter(|p| p.token == token).ok_or_else(|| {
                    GitError::new("REPLAY_REVIEW", "Revisa el commit antes de confirmar.")
                })?;
                replay::start(repo, plan, allowed)
            }
        }
    })
    .await
}
#[tauri::command]
async fn edit_rebase(
    id: String,
    token: String,
    edit: Option<rebase::Edit>,
    state: State<'_, AppState>,
) -> git::Result<merge::Outcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        let plan = s
            .rebase_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión."))?
            .take();
        *s.push_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Push."))? = None;
        *s.pull_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Pull."))? = None;
        match edit {
            Some(edit) => rebase::edit(&s.repo, &token, edit, allowed),
            None => {
                let plan = plan
                    .filter(|plan| {
                        plan.interactive
                            .as_ref()
                            .map_or(plan.token.as_str(), |p| p.token.as_str())
                            == token
                    })
                    .ok_or_else(|| {
                        GitError::new("REBASE_REVIEW", "Revisa de nuevo antes de ejecutar rebase.")
                    })?;
                rebase::start(&s.repo, plan, allowed)
            }
        }
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "Rebase interrumpido. Comprueba el estado antes de repetir.",
        )
    })?
}
#[tauri::command]
async fn read_merge(id: String, state: State<'_, AppState>) -> git::Result<Option<merge::State>> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || merge::read(&repo, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo leer el merge."))?
}
#[tauri::command]
async fn edit_merge(
    id: String,
    token: String,
    edit: merge::Edit,
    state: State<'_, AppState>,
) -> git::Result<merge::Outcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        *s.push_plan.lock().map_err(|_| {
            GitError::new("STATE", "No se pudo descartar la revisión de publicación.")
        })? = None;
        merge::edit(&s.repo, &token, edit, allowed)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "El merge se interrumpió. Actualiza y comprueba el estado antes de repetir.",
        )
    })?
}
#[tauri::command]
async fn read_pull_options(id: String, state: State<'_, AppState>) -> git::Result<pull::Options> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || pull::options(&repo, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo leer la configuración de Pull."))?
}
#[tauri::command]
async fn preview_pull(
    id: String,
    token: String,
    state: State<'_, AppState>,
) -> git::Result<pull::Preview> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        let mut slot = s
            .pull_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo invalidar la revisión de Pull."))?;
        *slot = None;
        *s.push_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo invalidar la revisión de push."))? =
            None;
        let plan = pull::preview(&s.repo, &token, allowed)?;
        let view = plan.view.clone();
        *slot = Some(plan);
        Ok(view)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "Fetch se interrumpió. Actualiza Pull; no se integran cambios automáticamente.",
        )
    })?
}
#[tauri::command]
async fn integrate_pull(
    id: String,
    preview_token: String,
    state: State<'_, AppState>,
) -> git::Result<merge::Outcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let allowed = s.is_trusted()?;
        let plan = s
            .pull_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión de Pull."))?
            .take()
            .ok_or_else(|| {
                GitError::new(
                    "PULL_REVIEW",
                    "No hay revisión activa. Confirma Fetch y vuelve a revisar Pull.",
                )
            })?;
        if plan.view.token != preview_token {
            return Err(GitError::new(
                "PULL_REVIEW",
                "La revisión ya no está activa. Vuelve a revisar Pull.",
            ));
        }
        *s.push_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo invalidar la revisión de push."))? =
            None;
        pull::integrate(&s.repo, plan, allowed)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "La integración se interrumpió. Revisa el merge en Ramas antes de repetir.",
        )
    })?
}
#[tauri::command]
async fn read_app_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<settings::AppSettings> {
    let directory = library_directory(&app)?;
    let lock = state.settings_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la configuración."))?;
        settings::read(&directory)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo leer la configuración."))?
}
#[tauri::command]
async fn save_app_settings(
    settings: settings::AppSettings,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<settings::AppSettings> {
    let directory = library_directory(&app)?;
    let lock = state.settings_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo guardar la configuración."))?;
        settings::save(&directory, &settings)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo guardar la configuración."))?
}
#[tauri::command]
async fn read_external_apps(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<external::ExternalAppsState> {
    let directory = library_directory(&app)?;
    let lock = state.settings_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let current = {
            let _guard = lock
                .lock()
                .map_err(|_| GitError::new("STATE", "No se pudo leer la configuración."))?;
            settings::read(&directory)?
        };
        Ok(external::detect_apps(&current.external))
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "No se pudieron detectar las aplicaciones externas.",
        )
    })?
}
#[tauri::command]
async fn open_in_external(
    id: String,
    kind: external::ExternalKind,
    app_id: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<external::OpenExternalOutcome> {
    let repo = selected(&state, &id)?;
    let directory = library_directory(&app)?;
    let lock = state.settings_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let current = {
            let _guard = lock
                .lock()
                .map_err(|_| GitError::new("STATE", "No se pudo leer la configuración."))?;
            settings::read(&directory)?
        };
        external::open_in(&repo, kind, app_id.as_deref(), &current.external)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo abrir la aplicación externa."))?
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_app_settings,
            save_app_settings,
            read_external_apps,
            open_in_external,
            read_activity,
            record_activity,
            clear_activity,
            export_diagnostics,
            open_repository,
            close_repository,
            read_worktrees,
            add_worktree,
            lock_worktree,
            unlock_worktree,
            remove_worktree,
            prune_worktrees,
            open_worktree_external,
            read_worktree_summary,
            watch_repository,
            get_default_repository_directory,
            preview_repository_delete,
            trash_repository,
            initialize_repository,
            clone_repository,
            read_repository_library,
            remember_repository,
            edit_repository_library,
            save_history_preferences,
            relocate_repository,
            refresh_repository,
            read_history,
            search_history,
            read_search_match_diff,
            read_commit_files,
            read_commit_diff,
            read_file_history,
            read_file_blame,
            read_range_files,
            read_range_diff,
            read_changes,
            read_branches,
            edit_branch,
            preview_merge,
            preview_rebase,
            review_interactive_rebase,
            read_rebase,
            read_stash,
            preview_stash,
            confirm_stash,
            finish_stash,
            read_replay,
            preview_replay,
            edit_replay,
            edit_rebase,
            read_merge,
            edit_merge,
            read_pull_options,
            preview_pull,
            integrate_pull,
            authorize_repository,
            revoke_repository_authorization,
            read_file_diff,
            read_conflict,
            read_conflict_backups,
            preview_conflict_restore,
            restore_conflict_backup,
            preview_conflict_edit,
            save_conflict_result,
            preview_conflict_stage,
            prepare_conflict_result,
            change_file,
            change_files,
            discard_file_lines,
            check_worktree_restore,
            preview_worktree_restore,
            confirm_worktree_restore,
            create_commit,
            preview_amend,
            confirm_amend,
            preview_tag,
            create_tag,
            read_tag_push_options,
            preview_tag_push,
            publish_tag,
            read_remotes,
            read_ssh_accounts,
            save_ssh_accounts,
            read_ssh_agent,
            read_authentication_status,
            authorize_remote_operations,
            edit_remote,
            contact_remote,
            read_push_options,
            preview_push,
            publish_push
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar RavenGit");
}

/// Restricted internal Git editor entry point; invoked before opening the GUI.
pub fn run_rebase_editor() -> Option<i32> {
    let args = std::env::args().collect::<Vec<_>>();
    if args.get(1).map(String::as_str) != Some("--ravengit-rebase-editor") {
        return None;
    }
    if args.len() != 6 {
        return Some(1);
    }
    Some(
        if rebase_plan::editor(&args[2], Path::new(&args[3]), &args[4], Path::new(&args[5])).is_ok()
        {
            0
        } else {
            1
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn multi_repo_sessions_isolate_locks_trust_and_close() {
        let state = AppState::default();
        let s1 = Arc::new(RepoSession::new(
            Repository {
                id: "1".into(),
                path: PathBuf::from("/tmp/repo-a"),
            },
            true,
        ));
        let s2 = Arc::new(RepoSession::new(
            Repository {
                id: "2".into(),
                path: PathBuf::from("/tmp/repo-b"),
            },
            false,
        ));
        {
            let mut guard = state.sessions.lock().unwrap();
            guard.insert("1".into(), s1);
            guard.insert("2".into(), s2);
        }

        assert!(trusted(&state, "1").unwrap());
        assert!(!trusted(&state, "2").unwrap());
        assert_eq!(
            selected(&state, "2").unwrap().path,
            PathBuf::from("/tmp/repo-b")
        );

        let a = session(&state, "1").unwrap();
        let b = session(&state, "2").unwrap();
        let _lock_a = a.writes.try_lock().unwrap();
        // Holding session A write lock must not block session B write lock
        assert!(b.writes.try_lock().is_ok());

        // Closing session A fails with BUSY while its write lock is held
        let busy_err = close_session(&state, "1").unwrap_err();
        assert_eq!(busy_err.code, "BUSY");
        drop(_lock_a);

        // Once unlocked, closing removes only session A and leaves session B intact
        close_session(&state, "1").unwrap();
        assert_eq!(
            selected(&state, "1").unwrap_err().code,
            "REPOSITORY_CHANGED"
        );
        assert_eq!(
            selected(&state, "2").unwrap().path,
            PathBuf::from("/tmp/repo-b")
        );
    }
}
