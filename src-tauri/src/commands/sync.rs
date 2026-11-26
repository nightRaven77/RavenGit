use crate::{
    accounts,
    git::{self, GitError},
    pull, push, remotes, ssh,
    state::{AppState, library_directory, selected, session, set_repository_trust, trusted},
};
use tauri::State;

#[tauri::command]
pub(crate) async fn read_remotes(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<remotes::Remotes> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || remotes::read(&repo, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudieron leer los remotos."))?
}

#[tauri::command]
pub(crate) async fn read_ssh_accounts(app: tauri::AppHandle) -> git::Result<accounts::Accounts> {
    let directory = library_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || accounts::read(&directory))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudieron leer los perfiles SSH."))?
}

#[tauri::command]
pub(crate) async fn save_ssh_accounts(
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
pub(crate) async fn read_ssh_agent(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<ssh::AgentStatus> {
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
pub(crate) async fn read_authentication_status(
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
pub(crate) async fn authorize_remote_operations(
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
pub(crate) async fn edit_remote(
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
pub(crate) async fn contact_remote(
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
pub(crate) async fn read_push_options(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<push::Options> {
    let repo = selected(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || push::options(&repo))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudieron leer las ramas locales."))?
}

#[tauri::command]
pub(crate) async fn preview_push(
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
pub(crate) async fn publish_push(
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
pub(crate) async fn read_pull_options(
    id: String,
    state: State<'_, AppState>,
) -> git::Result<pull::Options> {
    let repo = selected(&state, &id)?;
    let allowed = trusted(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || pull::options(&repo, allowed))
        .await
        .map_err(|_| GitError::new("WORKER", "No se pudo leer la configuración de Pull."))?
}

#[tauri::command]
pub(crate) async fn preview_pull(
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
pub(crate) async fn integrate_pull(
    id: String,
    preview_token: String,
    state: State<'_, AppState>,
) -> git::Result<crate::merge::Outcome> {
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
