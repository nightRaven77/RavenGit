use crate::{
    changes, external, file_inspect,
    git::{self, CommitDiff, CommitFiles, GitError, HistoryPage, Snapshot},
    image_diff, search, settings,
    state::{
        AppState, RepoSession, close_session, library_directory, selected, session,
        trust_directory, trusted,
    },
    trust, watcher, worktrees,
};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, atomic::Ordering},
    time::Duration,
};
use tauri::{Emitter, State};

#[tauri::command]
pub(crate) async fn open_repository(
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
pub(crate) async fn close_repository(id: String, state: State<'_, AppState>) -> git::Result<()> {
    close_session(&state, &id)
}

#[tauri::command]
pub(crate) async fn read_worktrees(
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
pub(crate) async fn add_worktree(
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
pub(crate) async fn lock_worktree(
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
pub(crate) async fn unlock_worktree(
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
pub(crate) async fn remove_worktree(
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
pub(crate) async fn prune_worktrees(
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
pub(crate) async fn open_worktree_external(
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
pub(crate) async fn read_worktree_summary(
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
pub(crate) async fn watch_repository(
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
pub(crate) async fn search_history(
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
pub(crate) async fn read_search_match_diff(
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
pub(crate) async fn refresh_repository(
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
pub(crate) async fn read_history(
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
pub(crate) async fn read_commit_files(
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
pub(crate) async fn read_commit_diff(
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
pub(crate) async fn read_file_history(
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
pub(crate) async fn read_file_blame(
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
pub(crate) async fn read_range_files(
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
pub(crate) async fn read_range_diff(
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

#[tauri::command]
pub(crate) async fn read_image_diff(
    id: String,
    source: image_diff::Source,
    state: State<'_, AppState>,
) -> git::Result<image_diff::ImageDiff> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || image_diff::read(&repo, source, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo leer el diff visual de imagen."))?
}
