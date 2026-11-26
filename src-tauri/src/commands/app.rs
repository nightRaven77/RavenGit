use crate::{
    activity, clone, env_check, external,
    git::{self, GitError},
    initialize, library, repository_delete, repository_paths, settings,
    state::{
        AppState, RepoSession, activity_directory, library_directory, protected_directories,
        selected, stop_watcher_for, trust_directory,
    },
    trust,
};
use std::{
    path::Path,
    sync::{Arc, atomic::Ordering},
};
use tauri::{Manager, State};

#[tauri::command]
pub(crate) async fn read_activity(
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
pub(crate) async fn record_activity(
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
pub(crate) async fn clear_activity(
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
pub(crate) async fn export_diagnostics(
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
pub(crate) async fn get_default_repository_directory(app: tauri::AppHandle) -> git::Result<String> {
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

#[tauri::command]
pub(crate) async fn preview_repository_delete(
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
pub(crate) struct DeletedRepository {
    library: library::Library,
    warning: Option<String>,
}

#[tauri::command]
pub(crate) async fn trash_repository(
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
pub(crate) async fn read_repository_library(
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
pub(crate) async fn remember_repository(
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
pub(crate) async fn edit_repository_library(
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
pub(crate) async fn save_history_preferences(
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
pub(crate) async fn relocate_repository(
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
pub(crate) async fn clone_repository(
    parent: String,
    name: String,
    url: String,
    state: State<'_, AppState>,
) -> git::Result<clone::Cloned> {
    let writes = state.global_writes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        clone::create(Path::new(&parent), &name, &url)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "El clonado se interrumpió. Revisa el destino antes de repetir; RavenGit no borra datos automáticamente.",
        )
    })?
}

#[tauri::command]
pub(crate) async fn initialize_repository(
    parent: String,
    name: String,
    branch: String,
    state: State<'_, AppState>,
) -> git::Result<initialize::Initialized> {
    let writes = state.global_writes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Hay una operación Git en curso."))?;
        initialize::create(Path::new(&parent), &name, &branch)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "La creación se interrumpió. Revisa el destino antes de repetir; no se borraron archivos.",
        )
    })?
}

#[tauri::command]
pub(crate) async fn check_git_environment() -> git::Result<env_check::EnvironmentStatus> {
    tauri::async_runtime::spawn_blocking(env_check::check)
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo comprobar el entorno Git local."))
}

#[tauri::command]
pub(crate) async fn read_app_settings(
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
pub(crate) async fn save_app_settings(
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
pub(crate) async fn read_external_apps(
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
pub(crate) async fn open_in_external(
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
