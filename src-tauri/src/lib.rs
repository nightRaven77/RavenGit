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
mod ssh;
mod stash;
mod tag_push;
mod tags;
mod trust;
mod worktree_restore;
use git::{CommitDiff, GitError, HistoryPage, Repository, Snapshot};
use std::{
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
};
use tauri::{Manager, State};
#[derive(Default)]
struct AppState {
    repository: Arc<Mutex<Option<Repository>>>,
    activity_lock: Arc<Mutex<()>>,
    library_lock: Arc<Mutex<()>>,
    next: AtomicU64,
    writes: Arc<Mutex<()>>,
    trusted: Arc<Mutex<Option<String>>>,
    push_plan: Arc<Mutex<Option<(String, push::Plan)>>>,
    pull_plan: Arc<Mutex<Option<(String, pull::Plan)>>>,
    rebase_plan: Arc<Mutex<Option<(String, rebase::Preview)>>>,
    replay_plan: Arc<Mutex<Option<(String, replay::Plan)>>>,
    delete_plan: Arc<Mutex<Option<repository_delete::Plan>>>,
    amend_plan: Arc<Mutex<Option<(String, amend::Plan)>>>,
    tag_plan: Arc<Mutex<Option<(String, tags::Plan)>>>,
    tag_push_plan: Arc<Mutex<Option<(String, tag_push::Plan)>>>,
    stash_plan: Arc<Mutex<Option<(String, stash::Plan)>>>,
    conflict_plan: Arc<Mutex<Option<(String, conflict_edit::Session)>>>,
    worktree_restore_plan: Arc<Mutex<Option<(String, worktree_restore::Plan)>>>,
}
fn selected(state: &AppState, id: &str) -> git::Result<Repository> {
    state
        .repository
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo leer el estado de la aplicación."))?
        .as_ref()
        .filter(|r| r.id == id)
        .cloned()
        .ok_or_else(|| {
            GitError::new(
                "REPOSITORY_CHANGED",
                "El repositorio activo cambió. Vuelve a abrirlo.",
            )
        })
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
    let writes = state.writes.clone();
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
    let writes = state.writes.clone();
    let libraries = state.library_lock.clone();
    let repository = state.repository.clone();
    let trusted = state.trusted.clone();
    let pushes = state.push_plan.clone();
    let pulls = state.pull_plan.clone();
    let rebases = state.rebase_plan.clone();
    let replays = state.replay_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _write=writes.try_lock().map_err(|_|GitError::new("BUSY","Hay una operación Git en curso."))?;
        let _library=libraries.lock().map_err(|_|GitError::new("STATE","No se pudo actualizar la biblioteca."))?;
        let plan=plans.lock().map_err(|_|GitError::new("STATE","No se pudo leer la revisión."))?.take().ok_or_else(||GitError::new("DELETE_REVIEW","Vuelve a revisar la carpeta antes de eliminarla."))?;
        if plan.review.path != path || plan.review.token != token {return Err(GitError::new("DELETE_REVIEW","La revisión no coincide con la carpeta seleccionada."));}
        let directory=library_directory(&app)?;
        let mut value=library::read(&directory)?;
        let mut active=repository.lock().map_err(|_|GitError::new("STATE","No se pudo bloquear el repositorio activo."))?;
        let deleting_active=active.as_ref().is_some_and(|repo|repo.path == Path::new(&path));
        let mut authorization=trusted.lock().map_err(|_|GitError::new("STATE","No se pudo actualizar la autorización."))?;
        let mut push=pushes.lock().map_err(|_|GitError::new("STATE","No se pudo invalidar Push."))?;
        let mut pull=pulls.lock().map_err(|_|GitError::new("STATE","No se pudo invalidar Pull."))?;
        let mut rebase=rebases.lock().map_err(|_|GitError::new("STATE","No se pudo invalidar Rebase."))?;
        let mut replay=replays.lock().map_err(|_|GitError::new("STATE","No se pudo invalidar Replay."))?;
        repository_delete::execute(plan,&confirmation,&value,&protected_directories(&app)?,|canonical| {
            trust::set(&trust_directory(&app)?,canonical,false)?;
            if deleting_active {*authorization=None; *push=None; *pull=None; *rebase=None; *replay=None;}
            repository_delete::recycle(canonical)
        })?;
        if deleting_active {*active=None;}
        value.repositories.retain(|entry|entry.path != path);
        let (library,warning)=match library::edit(&directory,library::Edit::Forget {path}) {
            Ok(saved)=>(saved,None),
            Err(_)=>(value,Some("La carpeta salió de su ubicación, pero no se guardó la biblioteca. No repitas el traslado: quita la entrada ausente de la lista al volver a abrirla.".into())),
        };
        Ok(DeletedRepository {library,warning})
    }).await.map_err(|_|GitError::new("DELETE_UNCERTAIN","La operación se interrumpió. Revisa la carpeta y la Papelera antes de repetir."))?
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
    let writes = state.writes.clone();
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
    let writes = state.writes.clone();
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
    let writes = state.writes.clone();
    let repository = state.repository.clone();
    let trust = state.trusted.clone();
    let plans = state.push_plan.clone();
    let pull_plans = state.pull_plan.clone();
    let rebase_plans = state.rebase_plan.clone();
    let replay_plans = state.replay_plan.clone();
    let amend_plans = state.amend_plan.clone();
    let stash_plans = state.stash_plan.clone();
    let tag_plans = state.tag_plan.clone();
    let tag_push_plans = state.tag_push_plan.clone();
    let conflict_plans = state.conflict_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let (repo, snapshot) = git::open(Path::new(&path), id)?;
        *conflict_plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar el borrador."))? = None;
        *tag_push_plans.lock().map_err(|_| {
            GitError::new("STATE", "No se pudo descartar la publicación de etiqueta.")
        })? = None;
        *stash_plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Stash."))? = None;
        *tag_plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar la etiqueta."))? = None;
        *amend_plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar amend."))? = None;
        *replay_plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar la revisión de commit."))? =
            None;
        *rebase_plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar rebase."))? = None;
        *pull_plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar la revisión de Pull."))? =
            None;
        let allowed = trust::contains(&trust_directory(&app)?, &repo.path)?;
        let authorization = allowed.then(|| repo.id.clone());
        *repository
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo guardar el repositorio activo."))? =
            Some(repo);
        *trust
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo actualizar la confianza."))? =
            authorization;
        *plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar la revisión anterior."))? =
            None;
        Ok(snapshot)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo completar la apertura."))?
}
#[tauri::command]
async fn refresh_repository(
    id: String,
    scope: Option<String>,
    state: State<'_, AppState>,
) -> git::Result<Snapshot> {
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || git::snapshot_scoped(&repo, scope.as_deref()))
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
async fn read_commit_diff(
    id: String,
    hash: String,
    parent_index: usize,
    state: State<'_, AppState>,
) -> git::Result<CommitDiff> {
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || git::diff(&repo, &hash, parent_index))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo leer el diff."))?
}
fn trusted(state: &AppState, id: &str) -> git::Result<bool> {
    Ok(state
        .trusted
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo comprobar la confianza."))?
        .as_deref()
        == Some(id))
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
    let _guard = state
        .writes
        .try_lock()
        .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
    let repo = selected(state, id)?;
    *state
        .conflict_plan
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo descartar el borrador."))? = None;
    *state
        .stash_plan
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo descartar Stash."))? = None;
    *state.tag_push_plan.lock().map_err(|_| {
        GitError::new("STATE", "No se pudo descartar la publicación de etiqueta.")
    })? = None;
    *state
        .tag_plan
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo descartar la etiqueta."))? = None;
    *state
        .amend_plan
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo descartar amend."))? = None;
    *state
        .replay_plan
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo descartar la revisión de commit."))? = None;
    *state
        .rebase_plan
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo descartar rebase."))? = None;
    *state
        .pull_plan
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo descartar la revisión de Pull."))? = None;
    trust::set(&trust_directory(app)?, &repo.path, allowed)?;
    *state
        .trusted
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo actualizar la confianza."))? =
        allowed.then(|| id.to_string());
    *state
        .push_plan
        .lock()
        .map_err(|_| GitError::new("STATE", "No se pudo descartar la revisión anterior."))? = None;
    Ok(repo)
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
    state: State<'_, AppState>,
) -> git::Result<changes::FileDiff> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        changes::file_diff(&repo, &token, &path, area, allowed)
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
    work: impl FnOnce(
        &Repository,
        bool,
        &mut Option<(String, conflict_edit::Session)>,
    ) -> git::Result<T>
    + Send
    + 'static,
) -> git::Result<T> {
    let repository = state.repository.clone();
    let authorization = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.conflict_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _write = writes.try_lock().map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let repo = repository.lock().map_err(|_| GitError::new("STATE", "No se pudo revisar el repositorio."))?.as_ref().filter(|repo| repo.id == id).cloned().ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió."))?;
        let allowed = authorization.lock().map_err(|_| GitError::new("STATE", "No se pudo revisar la autorización."))?.as_deref() == Some(&id);
        let mut plans = plans.lock().map_err(|_| GitError::new("STATE", "No se pudo revisar el borrador."))?;
        if plans.as_ref().is_some_and(|(owner, _)| owner != &id) { *plans = None; }
        work(&repo, allowed, &mut plans)
    }).await.map_err(|_| GitError::new("CONFLICT_UNCERTAIN", "La operación se interrumpió. Comprueba el archivo y su respaldo en la carpeta Git antes de repetir."))?
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
    let owner = id.clone();
    with_conflict(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = conflict_restore::preview(repo, &backup, allowed)?;
        let view = plan.view.clone();
        *plans = Some((owner, conflict_edit::Session::Recovering(plan)));
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
        let Some((_, conflict_edit::Session::Recovering(plan))) = plans.take() else {
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
    with_conflict(&state, id.clone(), move |repo, allowed, plans| {
        *plans = None;
        let plan = conflict_edit::preview(repo, &token, &path, allowed)?;
        let view = plan.view.clone();
        *plans = Some((id, conflict_edit::Session::Editing(plan)));
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
    with_conflict(&state, id.clone(), move |repo, allowed, plans| {
        let Some((_, conflict_edit::Session::Editing(plan))) = plans.take() else {
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
            *plans = Some((id, conflict_edit::Session::Saved(receipt)));
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
    with_conflict(&state, id.clone(), move |repo, allowed, plans| {
        let Some((_, conflict_edit::Session::Saved(receipt))) = plans.take() else {
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
        *plans = Some((id, conflict_edit::Session::Reviewed(receipt, view.clone())));
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
        let Some((_, conflict_edit::Session::Reviewed(receipt, view))) = plans.take() else {
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
#[tauri::command]
async fn change_file(
    id: String,
    token: String,
    path: String,
    area: changes::Area,
    hunk_index: Option<usize>,
    preview_token: Option<String>,
    state: State<'_, AppState>,
) -> git::Result<changes::MutationResult> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    let writes = state.writes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        changes::stage(
            &repo,
            &token,
            &path,
            area,
            hunk_index,
            preview_token.as_deref(),
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
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    let writes = state.writes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        changes::stage_files(&repo, &token, &paths, allowed)
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
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    let writes = state.writes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        changes::commit(&repo, &token, &message, allowed)
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
    work: impl FnOnce(&Repository, bool, &mut Option<(String, amend::Plan)>) -> git::Result<T>
    + Send
    + 'static,
) -> git::Result<T> {
    let repository = state.repository.clone();
    let authorization = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.amend_plan.clone();
    let pushes = state.push_plan.clone();
    let pulls = state.pull_plan.clone();
    let rebases = state.rebase_plan.clone();
    let replays = state.replay_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _write = writes.try_lock().map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let repo = repository.lock().map_err(|_| GitError::new("STATE", "No se pudo leer el repositorio."))?.as_ref().filter(|repo| repo.id == id).cloned().ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió."))?;
        let allowed = authorization.lock().map_err(|_| GitError::new("STATE", "No se pudo leer la autorización."))?.as_deref() == Some(&id);
        let mut plans = plans.lock().map_err(|_| GitError::new("STATE", "No se pudo leer la revisión de amend."))?;
        if plans.as_ref().is_some_and(|(owner, _)| owner != &id) {*plans = None;}
        *pushes.lock().map_err(|_| GitError::new("STATE", "No se pudo descartar Push."))? = None;
        *pulls.lock().map_err(|_| GitError::new("STATE", "No se pudo descartar Pull."))? = None;
        *rebases.lock().map_err(|_| GitError::new("STATE", "No se pudo descartar Rebase."))? = None;
        *replays.lock().map_err(|_| GitError::new("STATE", "No se pudo descartar Replay."))? = None;
        work(&repo, allowed, &mut plans)
    }).await.map_err(|_| GitError::new("AMEND_UNCERTAIN", "La operación se interrumpió. Comprueba HEAD, index y refs/ravengit/amend antes de repetir."))?
}
async fn with_stash<T: Send + 'static>(
    state: &AppState,
    id: String,
    work: impl FnOnce(&Repository, bool, &mut Option<(String, stash::Plan)>) -> git::Result<T>
    + Send
    + 'static,
) -> git::Result<T> {
    let repository = state.repository.clone();
    let authorization = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.stash_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _write = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let repo = repository
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer el repositorio."))?
            .as_ref()
            .filter(|repo| repo.id == id)
            .cloned()
            .ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió."))?;
        let allowed = authorization
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la autorización."))?
            .as_deref()
            == Some(&id);
        let mut plans = plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión de stash."))?;
        if plans.as_ref().is_some_and(|(owner, _)| owner != &id) {
            *plans = None;
        }
        work(&repo, allowed, &mut plans)
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
    work: impl FnOnce(
        &Repository,
        bool,
        &mut Option<(String, worktree_restore::Plan)>,
    ) -> git::Result<T>
    + Send
    + 'static,
) -> git::Result<T> {
    let repository = state.repository.clone();
    let authorization = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.worktree_restore_plan.clone();
    let pushes = state.push_plan.clone();
    let pulls = state.pull_plan.clone();
    let rebases = state.rebase_plan.clone();
    let replays = state.replay_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _write = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let repo = repository
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer el repositorio."))?
            .as_ref()
            .filter(|repo| repo.id == id)
            .cloned()
            .ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió."))?;
        let allowed = authorization
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la autorización."))?
            .as_deref()
            == Some(&id);
        let mut plans = plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión de restauración."))?;
        if plans.as_ref().is_some_and(|(owner, _)| owner != &id) {
            *plans = None;
        }
        *pushes
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Push."))? = None;
        *pulls
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Pull."))? = None;
        *rebases
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Rebase."))? = None;
        *replays
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Replay."))? = None;
        work(&repo, allowed, &mut plans)
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
    let owner = id.clone();
    with_stash(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = stash::preview(repo, action, allowed)?;
        *plans = Some((owner, plan.clone()));
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
        let (_, plan) = plans
            .take()
            .filter(|(_, plan)| plan.token == token)
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
    work: impl FnOnce(&Repository, bool, &mut Option<(String, tags::Plan)>) -> git::Result<T>
    + Send
    + 'static,
) -> git::Result<T> {
    let repository = state.repository.clone();
    let authorization = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.tag_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _write = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let repo = repository
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer el repositorio."))?
            .as_ref()
            .filter(|repo| repo.id == id)
            .cloned()
            .ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió."))?;
        let allowed = authorization
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la autorización."))?
            .as_deref()
            == Some(&id);
        let mut plans = plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión de etiqueta."))?;
        if plans.as_ref().is_some_and(|(owner, _)| owner != &id) {
            *plans = None;
        }
        work(&repo, allowed, &mut plans)
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
    let owner = id.clone();
    with_tag(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = tags::preview(repo, &name, &commit, allowed)?;
        *plans = Some((owner, plan.clone()));
        Ok(plan)
    })
    .await
}
#[tauri::command]
async fn create_tag(id: String, token: String, state: State<'_, AppState>) -> git::Result<String> {
    with_tag(&state, id, move |repo, allowed, plans| {
        let (_, plan) = plans
            .take()
            .filter(|(_, plan)| plan.token == token)
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
    work: impl FnOnce(&Repository, bool, &mut Option<(String, tag_push::Plan)>) -> git::Result<T>
    + Send
    + 'static,
) -> git::Result<T> {
    let repository = state.repository.clone();
    let authorization = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.tag_push_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _write = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let repo = repository
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer el repositorio."))?
            .as_ref()
            .filter(|repo| repo.id == id)
            .cloned()
            .ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió."))?;
        let allowed = authorization
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer confianza."))?
            .as_deref()
            == Some(&id);
        let mut plans = plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión."))?;
        if plans.as_ref().is_some_and(|(owner, _)| owner != &id) {
            *plans = None;
        }
        work(&repo, allowed, &mut plans)
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
    let owner = id.clone();
    with_tag_push(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = tag_push::preview(repo, &token, &remote, &tag, allowed)?;
        let view = plan.view.clone();
        *plans = Some((owner, plan));
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
        let (_, plan) = plans
            .take()
            .filter(|(_, plan)| plan.view.token == token)
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
    let owner = id.clone();
    with_amend(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = amend::preview(repo, message.as_deref(), allowed)?;
        *plans = Some((owner, plan.clone()));
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
        let (_, plan) = plans
            .take()
            .filter(|(_, plan)| plan.token == token)
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
    let repository = state.repository.clone();
    let authorization = state.trusted.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let repo = repository
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer el repositorio."))?
            .as_ref()
            .filter(|repo| repo.id == id)
            .cloned()
            .ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió."))?;
        let allowed = authorization
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la autorización."))?
            .as_deref()
            == Some(&id);
        worktree_restore::check_status(&repo, &path, allowed)
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
    let owner = id.clone();
    with_worktree_restore(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = worktree_restore::preview(repo, &path, is_redo, allowed)?;
        *plans = Some((owner, plan.clone()));
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
        let (_, plan) = plans
            .take()
            .filter(|(_, plan)| plan.token == token)
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
    let repo = selected(&state, &id)?;
    if !trusted(&state, &id)? {
        return Err(GitError::new(
            "UNTRUSTED",
            "Autoriza el repositorio antes de consultar su cliente SSH.",
        ));
    }
    let writes = state.writes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación sigue en curso."))?;
        ssh::agent_status(&repo)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo consultar el agente SSH."))?
}
#[tauri::command]
async fn read_authentication_status(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<ssh::AuthenticationStatus> {
    let repo = selected(&state, &id)?;
    if !trusted(&state, &id)? {
        return Err(GitError::new(
            "UNTRUSTED",
            "Autoriza el repositorio antes de consultar autenticación.",
        ));
    }
    let writes = state.writes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación sigue en curso."))?;
        ssh::authentication_status(&repo)
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
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    let writes = state.writes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación Git sigue en curso."))?;
        remotes::edit(&repo, &token, edit, allowed)
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
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    let writes = state.writes.clone();
    tauri::async_runtime::spawn_blocking(move||{let _guard=writes.try_lock().map_err(|_|GitError::new("BUSY","Otra operación Git sigue en curso."))?;remotes::contact(&repo,&token,&name,fetch,allowed)}).await.map_err(|_|GitError::new("WORKER","La operación se interrumpió. Actualiza antes de repetir; no hay reintentos automáticos."))?
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
    let repo = selected(&state, &id)?;
    let repository = state.repository.clone();
    let trust = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.push_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación Git sigue en curso."))?;
        if !repository
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo comprobar el repositorio activo."))?
            .as_ref()
            .is_some_and(|r| r.id == id)
        {
            return Err(GitError::new(
                "REPOSITORY_CHANGED",
                "El repositorio activo cambió. Vuelve a revisarlo.",
            ));
        }
        let allowed = trust
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo comprobar la confianza."))?
            .as_deref()
            == Some(&id);
        let mut slot = plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo guardar la revisión de push."))?;
        *slot = None;
        let plan = push::preview(
            &repo,
            &token,
            &remote,
            &source_branch,
            &target_branch,
            set_upstream,
            allowed,
        )?;
        let view = plan.view.clone();
        *slot = Some((id, plan));
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
    let repo = selected(&state, &id)?;
    let repository = state.repository.clone();
    let trust = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.push_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes.try_lock().map_err(|_| GitError::new("BUSY", "Otra operación Git sigue en curso."))?;
        if !repository.lock().map_err(|_| GitError::new("STATE", "No se pudo comprobar el repositorio activo."))?.as_ref().is_some_and(|r| r.id == id) {
            return Err(GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió. Vuelve a revisarlo."));
        }
        let allowed = trust.lock().map_err(|_| GitError::new("STATE", "No se pudo comprobar la confianza."))?.as_deref() == Some(&id);
        let (owner, plan) = plans.lock().map_err(|_| GitError::new("STATE", "No se pudo leer la revisión."))?.take()
            .ok_or_else(|| GitError::new("PUSH_REVIEW", "No hay revisión activa. Revisa el destino antes de publicar."))?;
        if owner != id || plan.view.token != preview_token {
            return Err(GitError::new("PUSH_REVIEW", "La revisión ya no está activa. Vuelve a revisar antes de publicar."));
        }
        push::publish(&repo, plan, allowed)
    }).await.map_err(|_| GitError::new("WORKER", "La publicación se interrumpió. Comprueba el destino antes de repetir; no hay reintentos automáticos."))?
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
    let repository = state.repository.clone();
    let trust = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.push_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes.try_lock().map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let repo = repository.lock().map_err(|_| GitError::new("STATE", "No se pudo comprobar el repositorio activo."))?
            .as_ref().filter(|repo| repo.id == id).cloned()
            .ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió. Vuelve a abrirlo."))?;
        let allowed = trust.lock().map_err(|_| GitError::new("STATE", "No se pudo comprobar la confianza."))?.as_deref() == Some(&id);
        *plans.lock().map_err(|_| GitError::new("STATE", "No se pudo descartar la revisión de publicación."))? = None;
        branches::edit(&repo, &token, edit, allowed)
    }).await.map_err(|_| GitError::new("WORKER", "La operación de rama se interrumpió. Actualiza y comprueba el estado antes de repetir."))?
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
    let plans = state.rebase_plan.clone();
    let repository = state.repository.clone();
    let trust = state.trusted.clone();
    let writes = state.writes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let repo = repository
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer el repositorio."))?
            .as_ref()
            .filter(|repo| repo.id == id)
            .cloned()
            .ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió."))?;
        let allowed = trust
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo comprobar confianza."))?
            .as_deref()
            == Some(&id);
        let mut plans = plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo guardar la revisión."))?;
        *plans = None;
        let view = rebase::preview(&repo, &token, &base, allowed)?;
        *plans = Some((id, view.clone()));
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
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    let plans = state.rebase_plan.clone();
    let writes = state.writes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let mut plans = plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión."))?;
        let (owner, old) = plans
            .take()
            .filter(|(owner, plan)| owner == &id && plan.token == token)
            .ok_or_else(|| {
                GitError::new("REBASE_REVIEW", "Actualiza y revisa de nuevo el rango.")
            })?;
        let mut fresh = rebase::preview(&repo, &old.token, &old.base, allowed)?;
        if let Err(error) = rebase_plan::validate(&fresh, &steps) {
            *plans = Some((owner, fresh));
            return Err(error);
        }
        fresh.interactive = Some(rebase_plan::Plan {
            token: conflict_edit::nonce(),
            steps,
        });
        *plans = Some((owner, fresh.clone()));
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
    F: FnOnce(&Repository, bool, &mut Option<(String, replay::Plan)>) -> git::Result<T>
        + Send
        + 'static,
{
    let repository = state.repository.clone();
    let trust = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.replay_plan.clone();
    let pushes = state.push_plan.clone();
    let pulls = state.pull_plan.clone();
    let rebases = state.rebase_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let repo = repository
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer el repositorio."))?
            .as_ref()
            .filter(|r| r.id == id)
            .cloned()
            .ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió."))?;
        let allowed = trust
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer confianza."))?
            .as_deref()
            == Some(&id);
        let mut plans = plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión."))?;
        if plans.as_ref().is_some_and(|(owner, _)| owner != &id) {
            *plans = None;
        }
        *pushes
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Push."))? = None;
        *pulls
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Pull."))? = None;
        *rebases
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Rebase."))? = None;
        work(&repo, allowed, &mut plans)
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
    let owner = id.clone();
    with_replay(&state, id, move |repo, allowed, plans| {
        *plans = None;
        let plan = replay::preview(repo, kind, &commit, allowed)?;
        *plans = Some((owner, plan.clone()));
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
                let (_, plan) = plan.filter(|(_, p)| p.token == token).ok_or_else(|| {
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
    let repository = state.repository.clone();
    let trust = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.rebase_plan.clone();
    let pushes = state.push_plan.clone();
    let pulls = state.pull_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let repo = repository
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer el repositorio."))?
            .as_ref()
            .filter(|repo| repo.id == id)
            .cloned()
            .ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió."))?;
        let allowed = trust
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo comprobar confianza."))?
            .as_deref()
            == Some(&id);
        let plan = plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión."))?
            .take();
        *pushes
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Push."))? = None;
        *pulls
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo descartar Pull."))? = None;
        match edit {
            Some(edit) => rebase::edit(&repo, &token, edit, allowed),
            None => {
                let (owner, plan) = plan
                    .filter(|(owner, plan)| {
                        owner == &id
                            && plan
                                .interactive
                                .as_ref()
                                .map_or(plan.token.as_str(), |p| p.token.as_str())
                                == token
                    })
                    .ok_or_else(|| {
                        GitError::new("REBASE_REVIEW", "Revisa de nuevo antes de ejecutar rebase.")
                    })?;
                let _ = owner;
                rebase::start(&repo, plan, allowed)
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
    let repository = state.repository.clone();
    let trust = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.push_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let repo = repository
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo comprobar el repositorio activo."))?
            .as_ref()
            .filter(|repo| repo.id == id)
            .cloned()
            .ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió."))?;
        let allowed = trust
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo comprobar la confianza."))?
            .as_deref()
            == Some(&id);
        *plans.lock().map_err(|_| {
            GitError::new("STATE", "No se pudo descartar la revisión de publicación.")
        })? = None;
        merge::edit(&repo, &token, edit, allowed)
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
    let repository = state.repository.clone();
    let trust = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.pull_plan.clone();
    let pushes = state.push_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let repo = repository
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo comprobar el repositorio."))?
            .as_ref()
            .filter(|repo| repo.id == id)
            .cloned()
            .ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió."))?;
        let allowed = trust
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo comprobar la confianza."))?
            .as_deref()
            == Some(&id);
        let mut slot = plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo invalidar la revisión de Pull."))?;
        *slot = None;
        *pushes
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo invalidar la revisión de push."))? =
            None;
        let plan = pull::preview(&repo, &token, allowed)?;
        let view = plan.view.clone();
        *slot = Some((id, plan));
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
    let repository = state.repository.clone();
    let trust = state.trusted.clone();
    let writes = state.writes.clone();
    let plans = state.pull_plan.clone();
    let pushes = state.push_plan.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        let repo = repository
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo comprobar el repositorio."))?
            .as_ref()
            .filter(|repo| repo.id == id)
            .cloned()
            .ok_or_else(|| GitError::new("REPOSITORY_CHANGED", "El repositorio activo cambió."))?;
        let allowed = trust
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo comprobar la confianza."))?
            .as_deref()
            == Some(&id);
        let (owner, plan) = plans
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión de Pull."))?
            .take()
            .ok_or_else(|| {
                GitError::new(
                    "PULL_REVIEW",
                    "No hay revisión activa. Confirma Fetch y vuelve a revisar Pull.",
                )
            })?;
        if owner != id || plan.view.token != preview_token {
            return Err(GitError::new(
                "PULL_REVIEW",
                "La revisión ya no está activa. Vuelve a revisar Pull.",
            ));
        }
        *pushes
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo invalidar la revisión de push."))? =
            None;
        pull::integrate(&repo, plan, allowed)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "La integración se interrumpió. Revisa el merge en Ramas antes de repetir.",
        )
    })?
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_activity,
            record_activity,
            clear_activity,
            export_diagnostics,
            open_repository,
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
            read_commit_diff,
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
