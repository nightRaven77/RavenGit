use crate::{
    git::{GitError, Repository, Result},
    remotes,
};
use std::{path::Path, process::Command};

fn invalid() -> GitError {
    GitError::new(
        "SSH_CONFIG",
        "RavenGit admite un ejecutable OpenSSH (ssh/ssh.exe), no scripts, plink ni comandos con argumentos en core.sshCommand/GIT_SSH_COMMAND. Conserva la configuración y usa ~/.ssh/config para IdentityFile y opciones del host.",
    )
}

fn executable(value: &str) -> Result<String> {
    if value.chars().any(char::is_control) {
        return Err(invalid());
    }
    let value = value.trim();
    let value = if (value.starts_with('\'') && value.ends_with('\''))
        || (value.starts_with('"') && value.ends_with('"'))
    {
        value
            .get(1..value.len().saturating_sub(1))
            .ok_or_else(invalid)?
    } else {
        value
    };
    let normalized = value.replace('\\', "/");
    let name = normalized.rsplit('/').next().unwrap_or("");
    if value.chars().any(char::is_control)
        || !matches!(name.to_ascii_lowercase().as_str(), "ssh" | "ssh.exe")
        || (normalized != "ssh" && normalized != "ssh.exe" && !Path::new(value).is_absolute())
    {
        return Err(invalid());
    }
    Ok(normalized)
}

fn configured(repo: &Repository, key: &str) -> Result<Option<String>> {
    let output = remotes::command(repo, &["config", "--null", "--get", key], false)?;
    if !output.success {
        return Ok(None);
    }
    Ok(Some(
        String::from_utf8(output.bytes)
            .map_err(|_| invalid())?
            .trim_end_matches('\0')
            .into(),
    ))
}

fn default_client() -> String {
    #[cfg(windows)]
    if std::env::var_os("SSH_AUTH_SOCK").is_none()
        && let Some(root) = std::env::var_os("SystemRoot")
    {
        let path = std::path::PathBuf::from(root).join("System32/OpenSSH/ssh.exe");
        if path.is_file() {
            return path.to_string_lossy().into_owned();
        }
    }
    "ssh".into()
}

fn is_ssh(value: &str) -> bool {
    value.starts_with("ssh://")
        || (!value.contains("://") && !Path::new(value).is_absolute() && value.contains(':'))
}

pub fn configure(repo: &Repository, args: &[&str], command: &mut Command) -> Result<()> {
    let Some(target) = args
        .windows(2)
        .find(|pair| pair[0] == "--")
        .map(|pair| pair[1])
    else {
        return Err(GitError::new(
            "REMOTE_ARGUMENTS",
            "Falta el destino explícito de la conexión.",
        ));
    };
    let url = if target.contains("://") || Path::new(target).is_absolute() || target.contains(':') {
        target.to_string()
    } else {
        let output = remotes::command(repo, &["remote", "get-url", "--", target], false)?;
        if !output.success {
            return Err(GitError::new(
                "REMOTE_MISSING",
                "No se pudo resolver el remoto seleccionado.",
            ));
        }
        String::from_utf8(output.bytes)
            .map_err(|_| invalid())?
            .trim_end_matches('\n')
            .into()
    };
    if !is_ssh(&url) {
        return Ok(());
    }
    apply_client(command, &selected_client(repo)?)
}

fn selected_client(repo: &Repository) -> Result<String> {
    let variant = match std::env::var("GIT_SSH_VARIANT") {
        Ok(value) => Some(value),
        Err(_) => configured(repo, "ssh.variant")?,
    };
    if variant
        .as_deref()
        .is_some_and(|value| !matches!(value, "ssh" | "auto"))
    {
        return Err(invalid());
    }
    let selected = if let Ok(value) = std::env::var("GIT_SSH_COMMAND") {
        value
    } else if let Some(value) = configured(repo, "core.sshCommand")? {
        value
    } else {
        std::env::var("GIT_SSH").unwrap_or_else(|_| default_client())
    };
    executable(&selected)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    client: String,
    status: &'static str,
    identities: Option<usize>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthenticationStatus {
    agent: Option<AgentStatus>,
    credential_helper_entries: bool,
}

/// Local declarations only: no helper execution, credential lookup or network.
pub fn authentication_status(repo: &Repository) -> Result<AuthenticationStatus> {
    let keys = remotes::command(repo, &["config", "--null", "--name-only", "--list"], false)?;
    if !keys.success {
        return Err(GitError::new(
            "AUTH_DIAGNOSTIC",
            "No se pudo leer la configuración local de autenticación.",
        ));
    }
    // Even configuration key names may contain private host information.
    // Return only whether helper declarations exist, never their names/values.
    let credential_helper_entries = keys.bytes.split(|b| *b == 0).any(|key| {
        let key = String::from_utf8_lossy(key).to_ascii_lowercase();
        key == "credential.helper" || (key.starts_with("credential.") && key.ends_with(".helper"))
    });
    Ok(AuthenticationStatus {
        agent: agent_status(repo).ok(),
        credential_helper_entries,
    })
}
/// Local query only: never starts an agent, loads keys, connects to a host or returns comments.
pub fn agent_status(repo: &Repository) -> Result<AgentStatus> {
    let client = selected_client(repo)?;
    let add = if Path::new(&client).is_absolute() {
        Path::new(&client).with_file_name(if cfg!(windows) {
            "ssh-add.exe"
        } else {
            "ssh-add"
        })
    } else {
        "ssh-add".into()
    };
    let mut command = Command::new(add);
    command
        .arg("-l")
        .current_dir(&repo.path)
        .env("SSH_ASKPASS", "")
        .env("SSH_ASKPASS_REQUIRE", "never");
    let output = crate::process::execute(command, None, std::time::Duration::from_secs(5));
    Ok(summarize_agent(client, output))
}
fn summarize_agent(
    client: String,
    output: std::result::Result<crate::process::Output, crate::process::Error>,
) -> AgentStatus {
    let (status, identities) = match output {
        Ok(output) if output.success => (
            "available",
            Some(
                output
                    .bytes
                    .split(|b| *b == b'\n')
                    .filter(|line| !line.is_empty())
                    .count(),
            ),
        ),
        Ok(output)
            if output.diagnostic == Some(crate::process::Diagnostic::SshAgentEmpty)
                || String::from_utf8_lossy(&output.bytes).contains("agent has no identities") =>
        {
            ("empty", Some(0))
        }
        _ => ("unavailable", None),
    };
    AgentStatus {
        client,
        status,
        identities,
    }
}

fn apply_client(command: &mut Command, selected: &str) -> Result<()> {
    let client = executable(selected)?;
    if Path::new(&client).is_absolute() && !Path::new(&client).is_file() {
        return Err(GitError::new(
            "SSH_UNAVAILABLE",
            "El ejecutable SSH configurado no existe o no es accesible. Revisa core.sshCommand sin cambiar tus claves.",
        ));
    }
    let quoted = format!("'{}'", client.replace('\'', "'\\''"));
    command.env("GIT_SSH_VARIANT", "ssh").env(
        "GIT_SSH_COMMAND",
        format!("{quoted} -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15"),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[test]
    #[ignore = "requiere lectura HTTPS de los remotos desechables autorizados"]
    fn manual_disposable_https_read() {
        let path = std::path::PathBuf::from(
            std::env::var_os("RAVENGIT_SSH_ACCEPTANCE_REPO").expect("Falta fixture"),
        )
        .canonicalize()
        .unwrap();
        assert!(path.starts_with(std::env::temp_dir().canonicalize().unwrap()));
        let marker: serde_json::Value = serde_json::from_slice(
            &fs::read(path.join(".git/ravengit-disposable-acceptance.json"))
                .expect("Falta marcador"),
        )
        .unwrap();
        let provider =
            std::env::var("RAVENGIT_HTTPS_ACCEPTANCE_PROVIDER").expect("Falta proveedor");
        let target = match provider.as_str() {
            "github" => "https://github.com/nightRaven77/prueba-ravengit.git",
            "gitlab" => "https://gitlab.com/nightRaven77/prueba-ravengit.git",
            _ => panic!("Proveedor no autorizado para esta prueba"),
        };
        let branch = marker["branch"].as_str().unwrap();
        let expected = marker["hash"].as_str().unwrap();
        assert!(branch.starts_with("codex/ssh-acceptance-"));
        let repo = Repository {
            id: "https-disposable".into(),
            path,
        };
        let head = crate::git::text(&repo.path, &["rev-parse", "HEAD"]).unwrap();
        assert_eq!(head.trim(), expected);
        let index = fs::read(repo.path.join(".git/index")).unwrap();
        let config = fs::read(repo.path.join(".git/config")).unwrap();
        let reference = format!("refs/heads/{branch}");
        let result = remotes::command(
            &repo,
            &["ls-remote", "--refs", "--", target, &reference],
            true,
        );
        assert_eq!(
            crate::git::text(&repo.path, &["rev-parse", "HEAD"]).unwrap(),
            head
        );
        assert!(
            fs::read(repo.path.join(".git/index")).unwrap() == index,
            "El índice cambió"
        );
        assert!(
            fs::read(repo.path.join(".git/config")).unwrap() == config,
            "La configuración cambió"
        );
        match result {
            Ok(output) if output.success => {
                let advertised = String::from_utf8(output.bytes).unwrap();
                assert!(
                    advertised
                        .lines()
                        .any(|line| line == format!("{expected}\t{reference}")),
                    "La rama esperada no se confirmó"
                );
                eprintln!(
                    "Lectura HTTPS y hash esperados confirmados; HEAD, índice y configuración intactos. No acredita identidad ni escritura."
                );
            }
            Ok(_) => panic!("No se confirmó lectura HTTPS; salida sensible descartada"),
            Err(error) => panic!(
                "Lectura HTTPS no confirmada: {} · {}",
                error.code, error.message
            ),
        }
    }
    #[test]
    fn local_authentication_reports_declarations_without_exporting_values() {
        let path = std::env::temp_dir().join(format!(
            "ravengit-auth-diagnostic-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&path).unwrap();
        crate::git::run(&path, &["init", "--quiet"]).unwrap();
        let repo = Repository {
            id: "auth-diagnostic".into(),
            path: path.clone(),
        };
        for config in [
            "[credential]\nhelper =\n",
            "[credential \"https://private.invalid\"]\nhelper = !echo FAKE_TOKEN_DO_NOT_EXPORT\n",
        ] {
            fs::write(path.join(".git/config"), config).unwrap();
            let status = authentication_status(&repo).unwrap();
            assert!(status.credential_helper_entries);
            let exported = serde_json::to_string(&status).unwrap();
            assert!(!exported.contains("FAKE_TOKEN_DO_NOT_EXPORT"));
            assert!(!exported.contains("private.invalid"));
        }
        fs::remove_dir_all(path).unwrap();
    }
    #[test]
    #[ignore = "publica sólo en remotos desechables autorizados explícitamente"]
    fn manual_disposable_publish_acceptance() {
        assert!(
            std::env::var("RAVENGIT_SSH_ACCEPTANCE_ALLOW_PUBLISH").as_deref() == Ok("1"),
            "Falta autorización explícita de publicación"
        );
        let path = std::path::PathBuf::from(
            std::env::var_os("RAVENGIT_SSH_ACCEPTANCE_REPO").expect("Falta fixture"),
        );
        let path = path.canonicalize().unwrap();
        assert!(
            path.starts_with(std::env::temp_dir().canonicalize().unwrap()),
            "Sólo se admiten fixtures temporales"
        );
        let marker: serde_json::Value = serde_json::from_slice(
            &std::fs::read(path.join(".git/ravengit-disposable-acceptance.json"))
                .expect("Falta marcador de fixture"),
        )
        .unwrap();
        let branch = marker["branch"].as_str().unwrap();
        let expected_hash = marker["hash"].as_str().unwrap();
        assert!(branch.starts_with("codex/ssh-acceptance-"));
        let remote = std::env::var("RAVENGIT_SSH_ACCEPTANCE_REMOTE").unwrap();
        assert!(["gitea", "bitbucket", "gitlab", "github"].contains(&remote.as_str()));
        let repo = Repository {
            id: "ssh-disposable".into(),
            path,
        };
        let head = crate::git::text(&repo.path, &["rev-parse", "HEAD"]).unwrap();
        assert!(head.trim() == expected_hash, "La fixture cambió");
        let index = std::fs::read(repo.path.join(".git/index")).unwrap();
        let config =
            crate::git::run(&repo.path, &["config", "--local", "--null", "--list"]).unwrap();
        assert!(agent_status(&repo).unwrap().status == "available");
        let state = remotes::read(&repo, true).unwrap();
        let initial = remotes::command(&repo, &["ls-remote", "--refs", "--", &remote], true)
            .unwrap_or_else(|e| panic!("Lectura no confirmada: {} · {}", e.code, e.message));
        assert!(initial.success, "Lectura remota rechazada");
        assert!(
            initial.bytes.is_empty(),
            "El remoto ya tiene referencias: no se publica ni se reintenta"
        );
        let plan = crate::push::preview(&repo, &state.token, &remote, branch, branch, false, true)
            .unwrap_or_else(|e| panic!("Revisión rechazada: {} · {}", e.code, e.message));
        assert!(plan.view.can_push && plan.view.target_hash.is_none());
        let outcome = crate::push::publish(&repo, plan, true);
        assert!(
            crate::git::text(&repo.path, &["rev-parse", "HEAD"]).unwrap() == head,
            "HEAD local cambió"
        );
        assert!(
            std::fs::read(repo.path.join(".git/index")).unwrap() == index,
            "El índice local cambió"
        );
        assert!(
            crate::git::run(&repo.path, &["config", "--local", "--null", "--list"]).unwrap()
                == config,
            "La configuración local cambió"
        );
        let outcome = outcome
            .unwrap_or_else(|e| panic!("Publicación no confirmada: {} · {}", e.code, e.message));
        assert!(
            outcome.status == "confirmed",
            "Resultado incierto: consultar destino antes de repetir"
        );
        let reference = format!("refs/heads/{branch}");
        let verified = remotes::command(
            &repo,
            &["ls-remote", "--heads", "--", &remote, &reference],
            true,
        )
        .unwrap();
        assert!(verified.success);
        let text = String::from_utf8(verified.bytes).unwrap();
        assert!(
            text.trim() == format!("{expected_hash}\t{reference}"),
            "El hash remoto no coincide"
        );
        eprintln!(
            "Lectura, revisión y publicación confirmadas; hash remoto exacto; HEAD, índice y configuración locales conservados."
        );
    }
    /// Opt-in acceptance against a repository explicitly selected by the operator.
    /// Never runs in the normal suite and never prints URLs, refs or key comments.
    #[test]
    #[ignore = "requiere agente y remoto reales elegidos explícitamente"]
    fn manual_provider_read_with_agent() {
        let path = std::path::PathBuf::from(
            std::env::var_os("RAVENGIT_SSH_ACCEPTANCE_REPO")
                .expect("Selecciona el repositorio de aceptación"),
        );
        let remote = std::env::var("RAVENGIT_SSH_ACCEPTANCE_REMOTE")
            .expect("Selecciona el remoto de aceptación");
        let repo = Repository {
            id: "ssh-acceptance".into(),
            path: path.canonicalize().unwrap(),
        };
        let head = crate::git::text(&repo.path, &["rev-parse", "HEAD"]).unwrap();
        let config =
            crate::git::run(&repo.path, &["config", "--local", "--null", "--list"]).unwrap();
        let index_path =
            crate::git::text(&repo.path, &["rev-parse", "--git-path", "index"]).unwrap();
        let index_path = repo.path.join(index_path.trim());
        let index = std::fs::read(&index_path).unwrap();
        let agent = agent_status(&repo).unwrap();
        assert!(
            agent.status == "available",
            "El agente no está disponible para este cliente"
        );
        let state = remotes::read(&repo, true).unwrap();
        let result = if std::env::var("RAVENGIT_SSH_ACCEPTANCE_GITHUB_SSH").as_deref() == Ok("1") {
            let entry = state
                .remotes
                .iter()
                .find(|entry| entry.name == remote)
                .expect("Remoto no encontrado");
            let url = url::Url::parse(
                entry
                    .edit_url
                    .as_deref()
                    .expect("El remoto no tiene una URL editable segura"),
            )
            .expect("URL no válida");
            assert!(
                url.scheme() == "https"
                    && url.host_str() == Some("github.com")
                    && url.port().is_none()
                    && url.password().is_none()
                    && url.query().is_none()
                    && url.fragment().is_none(),
                "Esta prueba sólo deriva SSH de una URL HTTPS limpia de github.com"
            );
            let target = format!("git@github.com:{}", url.path().trim_start_matches('/'));
            remotes::command(&repo, &["ls-remote", "--heads", "--", &target], true).and_then(
                |output| {
                    if output.success {
                        Ok(())
                    } else {
                        Err(GitError::new(
                            "REMOTE_CONNECTION",
                            "GitHub no confirmó lectura por SSH.",
                        ))
                    }
                },
            )
        } else {
            remotes::contact(&repo, &state.token, &remote, false, true).map(|_| ())
        };
        assert!(
            crate::git::text(&repo.path, &["rev-parse", "HEAD"]).unwrap() == head,
            "HEAD cambió"
        );
        assert!(
            crate::git::run(&repo.path, &["config", "--local", "--null", "--list"]).unwrap()
                == config,
            "La configuración cambió"
        );
        assert!(
            std::fs::read(index_path).unwrap() == index,
            "El índice cambió"
        );
        match result {
            Ok(_) => eprintln!(
                "Agente accesible y lectura remota confirmada; HEAD, índice y configuración conservados."
            ),
            Err(error) => panic!("Acceso no confirmado: {} · {}", error.code, error.message),
        }
    }
    #[test]
    fn agent_summary_distinguishes_empty_and_discards_key_comments() {
        let available = summarize_agent(
            "ssh".into(),
            Ok(crate::process::Output {
                bytes: b"256 SHA256:example private-comment@example (ED25519)\n".to_vec(),
                success: true,
                diagnostic: None,
            }),
        );
        let json = serde_json::to_string(&available).unwrap();
        assert_eq!(available.identities, Some(1));
        assert!(!json.contains("private-comment"));
        assert!(!json.contains("SHA256"));
        let empty = summarize_agent(
            "ssh".into(),
            Ok(crate::process::Output {
                bytes: vec![],
                success: false,
                diagnostic: Some(crate::process::Diagnostic::SshAgentEmpty),
            }),
        );
        assert_eq!(empty.status, "empty");
        let unavailable = summarize_agent("ssh".into(), Err(crate::process::Error::Start));
        assert_eq!(unavailable.status, "unavailable");
        assert_eq!(unavailable.identities, None);
    }
    #[test]
    fn accepts_only_literal_openssh_executables() {
        assert_eq!(executable("ssh").unwrap(), "ssh");
        assert!(executable("ssh -i key").is_err());
        assert!(executable("ssh; echo secret").is_err());
        assert!(executable("plink.exe").is_err());
        assert!(executable("ssh\n").is_err());
        assert!(executable("ssh\ncommand").is_err());
        #[cfg(windows)]
        assert_eq!(
            executable("\"C:\\Program Files\\OpenSSH\\ssh.exe\"").unwrap(),
            "C:/Program Files/OpenSSH/ssh.exe"
        );
        #[cfg(unix)]
        assert_eq!(executable("'/usr/bin/ssh'").unwrap(), "/usr/bin/ssh");
    }
    #[test]
    fn distinguishes_ssh_from_https_and_local_transports() {
        assert!(is_ssh("git@gitlab.com:team/project.git"));
        assert!(is_ssh("ssh://git@alias/team/project.git"));
        assert!(!is_ssh("https://example.invalid/team.git"));
        assert!(!is_ssh("file:///tmp/project.git"));
        #[cfg(windows)]
        assert!(!is_ssh("C:/repos/server.git"));
    }
    #[test]
    fn configured_client_keeps_noninteractive_and_host_verification_flags() {
        let mut command = Command::new("git");
        apply_client(&mut command, "ssh").unwrap();
        let environment: Vec<_> = command.get_envs().collect();
        let value = environment
            .iter()
            .find(|(key, _)| *key == "GIT_SSH_COMMAND")
            .unwrap()
            .1
            .unwrap()
            .to_str()
            .unwrap();
        assert_eq!(
            value,
            "'ssh' -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15"
        );
        assert!(
            environment
                .iter()
                .any(|(key, value)| *key == "GIT_SSH_VARIANT"
                    && *value == Some(std::ffi::OsStr::new("ssh")))
        );
        #[cfg(windows)]
        {
            let client = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap())
                .join("System32/OpenSSH/ssh.exe");
            if client.is_file() {
                apply_client(&mut command, client.to_str().unwrap()).unwrap();
                let value = command
                    .get_envs()
                    .find(|(key, _)| *key == "GIT_SSH_COMMAND")
                    .unwrap()
                    .1
                    .unwrap()
                    .to_str()
                    .unwrap();
                assert!(value.starts_with(&format!(
                    "'{}' ",
                    client.to_string_lossy().replace('\\', "/")
                )));
                assert!(value.contains("StrictHostKeyChecking=yes"));
            }
        }
    }
    #[test]
    fn reads_literal_core_ssh_command_with_spaces_from_git_config() {
        struct Fixture(std::path::PathBuf);
        impl Drop for Fixture {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let fixture = Fixture(std::env::temp_dir().join(format!(
                "ravengit-ssh-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            )));
        let client = fixture.0.join("client with spaces").join(if cfg!(windows) {
            "ssh.exe"
        } else {
            "ssh"
        });
        std::fs::create_dir_all(client.parent().unwrap()).unwrap();
        std::fs::write(&client, b"fixture: never executed").unwrap();
        assert!(
            Command::new("git")
                .arg("init")
                .current_dir(&fixture.0)
                .output()
                .unwrap()
                .status
                .success()
        );
        assert!(
            Command::new("git")
                .args(["config", "--local", "core.sshCommand"])
                .arg(&client)
                .current_dir(&fixture.0)
                .output()
                .unwrap()
                .status
                .success()
        );
        let repo = Repository {
            id: "ssh-fixture".into(),
            path: fixture.0.clone(),
        };
        let selected = configured(&repo, "core.sshCommand").unwrap().unwrap();
        assert_eq!(selected, client.to_str().unwrap());
        let mut command = Command::new("git");
        apply_client(&mut command, &selected).unwrap();
        let invocation = command
            .get_envs()
            .find(|(key, _)| *key == "GIT_SSH_COMMAND")
            .unwrap()
            .1
            .unwrap()
            .to_str()
            .unwrap();
        assert!(invocation.starts_with(&format!("'{}' ", selected.replace('\\', "/"))));
        assert!(invocation.contains("BatchMode=yes -o StrictHostKeyChecking=yes"));
    }
}
