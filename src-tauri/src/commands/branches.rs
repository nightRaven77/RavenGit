use crate::{
    branches, changes, conflict_edit,
    git::{self, GitError, Repository},
    merge, rebase, rebase_plan, replay,
    state::{AppState, selected, session, trusted},
    undo,
};
use tauri::State;

#[tauri::command]
pub(crate) async fn read_branches(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<branches::State> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || branches::read(&repo, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudieron leer las ramas."))?
}

#[tauri::command]
pub(crate) async fn edit_branch(
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
        let (undo_kind, undo_label) = match &edit {
            branches::Edit::Create { name } => ("branch-switch", format!("Crear rama {name}")),
            branches::Edit::Switch { name } => ("branch-switch", format!("Cambio a rama {name}")),
            branches::Edit::Rename { source, name } => {
                ("branch-rename", format!("Renombrar rama {source} → {name}"))
            }
        };
        let before = undo::capture_ref_state(&s.repo);
        let outcome = branches::edit(&s.repo, &token, edit, allowed)?;
        let after = undo::capture_ref_state(&s.repo);
        let _ = undo::record(&s.repo, undo_kind, &undo_label, before, after);
        Ok(outcome)
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
pub(crate) async fn preview_merge(
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
pub(crate) async fn preview_rebase(
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
pub(crate) async fn review_interactive_rebase(
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
pub(crate) async fn read_rebase(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<Option<rebase::State>> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || rebase::read(&repo, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo leer el rebase."))?
}

#[tauri::command]
pub(crate) async fn read_replay(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<replay::Options> {
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
pub(crate) async fn preview_replay(
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
pub(crate) async fn edit_replay(
    id: String,
    token: String,
    action: Option<replay::Action>,
    state: State<'_, AppState>,
) -> git::Result<merge::Outcome> {
    with_replay(&state, id, move |repo, allowed, plans| {
        let plan = plans.take();
        let before = undo::capture_ref_state(repo);
        let (kind_str, label, outcome) = match action {
            Some(action) => {
                let op_kind = changes::read(repo, true)
                    .ok()
                    .and_then(|c| c.operation)
                    .map(|op| {
                        if op.to_lowercase().contains("revert") {
                            ("revert", "Revertir commit")
                        } else {
                            ("cherry-pick", "Cherry-pick")
                        }
                    })
                    .unwrap_or(("cherry-pick", "Cherry-pick"));
                let outcome = replay::edit(repo, &token, action, allowed)?;
                (op_kind.0, op_kind.1.to_string(), outcome)
            }
            None => {
                let plan = plan.filter(|p| p.token == token).ok_or_else(|| {
                    GitError::new("REPLAY_REVIEW", "Revisa el commit antes de confirmar.")
                })?;
                let (kind_str, label) = match plan.kind {
                    replay::Kind::CherryPick => {
                        ("cherry-pick", format!("Cherry-pick: {}", plan.subject))
                    }
                    replay::Kind::Revert => ("revert", format!("Revert: {}", plan.subject)),
                };
                let outcome = replay::start(repo, plan, allowed)?;
                (kind_str, label, outcome)
            }
        };
        let after = undo::capture_ref_state(repo);
        if before.head != after.head
            && changes::read(repo, true)
                .ok()
                .is_some_and(|c| c.operation.is_none())
        {
            let _ = undo::record(repo, kind_str, &label, before, after);
        }
        Ok(outcome)
    })
    .await
}

#[tauri::command]
pub(crate) async fn edit_rebase(
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
        let before = undo::capture_ref_state(&s.repo);
        let outcome = match edit {
            Some(edit) => rebase::edit(&s.repo, &token, edit, allowed)?,
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
                rebase::start(&s.repo, plan, allowed)?
            }
        };
        let after = undo::capture_ref_state(&s.repo);
        if before.head != after.head
            && changes::read(&s.repo, true)
                .ok()
                .is_some_and(|c| c.operation.is_none())
        {
            let _ = undo::record(&s.repo, "rebase", "Rebase", before, after);
        }
        Ok(outcome)
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
pub(crate) async fn read_merge(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<Option<merge::State>> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || merge::read(&repo, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo leer el merge."))?
}

#[tauri::command]
pub(crate) async fn edit_merge(
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
        let before = undo::capture_ref_state(&s.repo);
        let outcome = merge::edit(&s.repo, &token, edit, allowed)?;
        let after = undo::capture_ref_state(&s.repo);
        if before.head != after.head
            && changes::read(&s.repo, true)
                .ok()
                .is_some_and(|c| c.operation.is_none())
        {
            let _ = undo::record(&s.repo, "merge", "Merge de rama", before, after);
        }
        Ok(outcome)
    })
    .await
    .map_err(|_| {
        GitError::new(
            "WORKER",
            "El merge se interrumpió. Actualiza y comprueba el estado antes de repetir.",
        )
    })?
}
