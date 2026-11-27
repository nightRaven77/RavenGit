use crate::{
    amend, changes, conflict_edit, conflict_restore, conflict_stage, conflicts,
    git::{self, GitError, Repository},
    stash,
    state::{AppState, selected, session, set_repository_trust, trusted},
    tag_push, tags, undo, worktree_restore,
};
use tauri::State;

#[tauri::command]
pub(crate) async fn revoke_repository_authorization(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> git::Result<changes::Changes> {
    let repo = set_repository_trust(&app, &state, &id, false)?;
    changes::read(&repo, false)
}

#[tauri::command]
pub(crate) async fn read_changes(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<changes::Changes> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || changes::read(&repo, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudieron leer los cambios."))?
}

#[tauri::command]
pub(crate) async fn authorize_repository(
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
pub(crate) async fn read_file_diff(
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
pub(crate) async fn read_conflict(
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
pub(crate) async fn read_conflict_backups(
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
pub(crate) async fn preview_conflict_restore(
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
pub(crate) async fn restore_conflict_backup(
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
pub(crate) async fn preview_conflict_edit(
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
pub(crate) async fn save_conflict_result(
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
pub(crate) async fn preview_conflict_stage(
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
pub(crate) async fn prepare_conflict_result(
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
pub(crate) async fn change_file(
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
pub(crate) async fn discard_file_lines(
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
pub(crate) async fn change_files(
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
pub(crate) async fn create_commit(
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
        let before = undo::capture_ref_state(&s.repo);
        let result = changes::commit(&s.repo, &token, &message, allowed)?;
        let after = undo::capture_ref_state(&s.repo);
        let subject = message.lines().next().unwrap_or("").trim();
        let label = if subject.is_empty() {
            "Commit".to_string()
        } else {
            format!("Commit: {subject}")
        };
        let _ = undo::record(&s.repo, "commit", &label, before, after);
        Ok(result)
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
pub(crate) async fn read_stash(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<stash::Options> {
    with_stash(&state, id, |repo, allowed, _| stash::read(repo, allowed)).await
}

#[tauri::command]
pub(crate) async fn preview_stash(
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
pub(crate) async fn confirm_stash(
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
pub(crate) async fn finish_stash(
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
pub(crate) async fn preview_tag(
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
pub(crate) async fn create_tag(
    id: String,
    token: String,
    state: State<'_, AppState>,
) -> git::Result<String> {
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
pub(crate) async fn read_tag_push_options(
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
pub(crate) async fn preview_tag_push(
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
pub(crate) async fn publish_tag(
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
pub(crate) async fn preview_amend(
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
pub(crate) async fn confirm_amend(
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
        let before = undo::capture_ref_state(repo);
        let outcome = amend::execute(repo, plan, allowed)?;
        let after = undo::capture_ref_state(repo);
        let _ = undo::record(repo, "amend", "Amend al último commit", before, after);
        Ok(outcome)
    })
    .await
}

#[tauri::command]
pub(crate) async fn check_worktree_restore(
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
pub(crate) async fn preview_worktree_restore(
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
pub(crate) async fn confirm_worktree_restore(
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
