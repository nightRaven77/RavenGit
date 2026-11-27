use crate::{
    git::{self, GitError},
    lfs, snapshots,
    state::{AppState, library_directory, read_snapshot_limits, selected, session},
    submodules, undo,
};
use tauri::State;

#[tauri::command]
pub(crate) async fn read_lfs_status(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<lfs::LfsStatus> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let allowed = s.is_trusted()?;
        lfs::read_status(&s.repo, allowed)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo consultar el estado de Git LFS."))?
}

#[tauri::command]
pub(crate) async fn pull_lfs_objects(
    id: String,
    path: Option<String>,
    state: State<'_, AppState>,
) -> git::Result<lfs::LfsActionOutcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        lfs::pull(&s.repo, path.as_deref(), allowed)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "La descarga de Git LFS se interrumpió."))?
}

#[tauri::command]
pub(crate) async fn refresh_lfs_locks(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<Vec<lfs::LfsLock>> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let allowed = s.is_trusted()?;
        lfs::refresh_locks(&s.repo, allowed)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudieron consultar los bloqueos LFS."))?
}

#[tauri::command]
pub(crate) async fn lock_lfs_file(
    id: String,
    path: String,
    state: State<'_, AppState>,
) -> git::Result<lfs::LfsActionOutcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        lfs::lock_file(&s.repo, &path, allowed)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo bloquear el archivo en Git LFS."))?
}

#[tauri::command]
pub(crate) async fn unlock_lfs_file(
    id: String,
    path: String,
    force: Option<bool>,
    state: State<'_, AppState>,
) -> git::Result<lfs::LfsActionOutcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        lfs::unlock_file(&s.repo, &path, force.unwrap_or(false), allowed)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo desbloquear el archivo en Git LFS."))?
}

#[tauri::command]
pub(crate) async fn read_submodules(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<submodules::SubmoduleList> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let allowed = s.is_trusted()?;
        submodules::read_status(&s.repo, allowed)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "No se pudieron leer los submódulos del repositorio.",
        )
    })?
}

#[tauri::command]
pub(crate) async fn update_submodule(
    id: String,
    action: submodules::Action,
    state: State<'_, AppState>,
) -> git::Result<submodules::Outcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        submodules::execute(&s.repo, action, allowed)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "La operación sobre submódulos se interrumpió."))?
}

#[tauri::command]
pub(crate) async fn read_snapshots(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<snapshots::SnapshotList> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let allowed = s.is_trusted()?;
        snapshots::list(&s.repo, allowed)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudieron leer los snapshots locales."))?
}

#[tauri::command]
pub(crate) async fn create_snapshot(
    id: String,
    label: Option<String>,
    trigger: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<snapshots::CaptureOutcome> {
    let s = session(&state, &id)?;
    let directory = library_directory(&app)?;
    let lock = state.settings_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        let (max_snapshots, max_disk_mb) = read_snapshot_limits(&directory, &lock);
        snapshots::capture(
            &s.repo,
            label.as_deref(),
            trigger.as_deref().unwrap_or("manual"),
            max_snapshots,
            max_disk_mb,
            allowed,
        )
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo guardar el snapshot local."))?
}

#[tauri::command]
pub(crate) async fn delete_snapshot(
    id: String,
    snapshot_id: String,
    state: State<'_, AppState>,
) -> git::Result<snapshots::SnapshotList> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        snapshots::delete(&s.repo, &snapshot_id, allowed)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo eliminar el snapshot."))?
}

#[tauri::command]
pub(crate) async fn preview_snapshot_restore(
    id: String,
    snapshot_id: String,
    state: State<'_, AppState>,
) -> git::Result<snapshots::RestorePlan> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        let mut plans = s.snapshot_restore_plan.lock().map_err(|_| {
            GitError::new("STATE", "No se pudo guardar la vista previa del snapshot.")
        })?;
        *plans = None;
        let plan = snapshots::preview_restore(&s.repo, &snapshot_id, allowed)?;
        *plans = Some(plan.clone());
        Ok(plan)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo revisar la restauración del snapshot."))?
}

#[tauri::command]
pub(crate) async fn confirm_snapshot_restore(
    id: String,
    token: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<snapshots::RestoreOutcome> {
    let s = session(&state, &id)?;
    let directory = library_directory(&app)?;
    let lock = state.settings_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        let plan = s
            .snapshot_restore_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la vista previa del snapshot."))?
            .take()
            .filter(|p| p.token == token)
            .ok_or_else(|| {
                GitError::new(
                    "SNAPSHOT_REVIEW",
                    "Revisa el snapshot antes de confirmar la restauración.",
                )
            })?;
        let (max_snapshots, max_disk_mb) = read_snapshot_limits(&directory, &lock);
        snapshots::confirm_restore(&s.repo, plan, max_snapshots, max_disk_mb, allowed)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo restaurar el snapshot local."))?
}

#[tauri::command]
pub(crate) async fn read_undo_state(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<undo::UndoState> {
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || undo::read_state(&repo))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo consultar el historial de deshacer."))?
}

#[tauri::command]
pub(crate) async fn preview_undo(
    id: String,
    direction: String,
    state: State<'_, AppState>,
) -> git::Result<undo::Plan> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        let mut plans = s.undo_plan.lock().map_err(|_| {
            GitError::new("STATE", "No se pudo guardar la vista previa de deshacer.")
        })?;
        *plans = None;
        let plan = undo::preview(&s.repo, &direction, allowed)?;
        *plans = Some(plan.clone());
        Ok(plan)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "No se pudo preparar la vista previa."))?
}

#[tauri::command]
pub(crate) async fn confirm_undo(
    id: String,
    token: String,
    state: State<'_, AppState>,
) -> git::Result<undo::Outcome> {
    let s = session(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s
            .writes
            .try_lock()
            .map_err(|_| GitError::new("BUSY", "Otra operación local sigue en curso."))?;
        let allowed = s.is_trusted()?;
        let plan = s
            .undo_plan
            .lock()
            .map_err(|_| GitError::new("STATE", "No se pudo leer la revisión pendiente."))?
            .take()
            .filter(|p| p.token == token)
            .ok_or_else(|| {
                GitError::new(
                    "UNDO_REVIEW",
                    "Vuelve a revisar la operación antes de confirmar.",
                )
            })?;
        undo::execute(&s.repo, plan, allowed)
    })
    .await
    .map_err(|_| GitError::new("WORKER", "La operación de deshacer/rehacer se interrumpió."))?
}
