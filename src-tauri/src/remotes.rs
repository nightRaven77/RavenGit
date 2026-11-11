use crate::git::{GitError, Repository, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use url::Url;
const LIMIT: usize = 2 * 1024 * 1024;
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    pub name: String,
    pub fetch_urls: Vec<String>,
    pub push_urls: Vec<String>,
    pub edit_url: Option<String>,
    pub edit_push_url: Option<String>,
    pub provider: String,
    pub editable: bool,
    pub fetch_allowed: bool,
    pub push_allowed: bool,
    pub restriction: Option<String>,
    pub tracking_count: usize,
    pub upstream_branches: Vec<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Remotes {
    pub token: String,
    pub remotes: Vec<Remote>,
    pub trusted: bool,
}
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Edit {
    Add {
        name: String,
        url: String,
        #[serde(rename = "pushUrl")]
        push_url: Option<String>,
    },
    Update {
        name: String,
        url: String,
        #[serde(rename = "pushUrl")]
        push_url: Option<String>,
    },
    Remove {
        name: String,
    },
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResult {
    pub state: Option<Remotes>,
    pub message: String,
    pub completed_at: Option<u64>,
    pub warning: Option<String>,
}
pub(crate) struct Output {
    pub(crate) bytes: Vec<u8>,
    pub(crate) success: bool,
}
fn fail(code: &'static str, message: &str) -> GitError {
    GitError::new(code, message)
}
pub(crate) fn command(repo: &Repository, args: &[&str], network: bool) -> Result<Output> {
    command_configured(repo, args, network, |_| {})
}
pub(crate) fn command_configured(
    repo: &Repository,
    args: &[&str],
    network: bool,
    configure: impl FnOnce(&mut std::process::Command),
) -> Result<Output> {
    let mut cmd = crate::process::git(&repo.path);
    if network {
        cmd.args([
            "-c",
            "protocol.allow=never",
            "-c",
            "protocol.https.allow=always",
            "-c",
            "protocol.ssh.allow=always",
            "-c",
            "protocol.file.allow=always",
            "-c",
            "http.sslVerify=true",
            "-c",
            "http.followRedirects=false",
            "-c",
            "credential.interactive=false",
        ]);
    }
    cmd.args(args)
        .env("GIT_NO_REPLACE_OBJECTS", "1")
        .env("GCM_INTERACTIVE", "never")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "");
    if network {
        cmd.env("GIT_ALLOW_PROTOCOL", "https:ssh:file");
        crate::ssh::configure(repo, args, &mut cmd)?;
    }
    configure(&mut cmd);
    let output = crate::process::execute(cmd, None, Duration::from_secs(if network {60} else {15}))
        .map_err(|e| match e {
            crate::process::Error::Start => fail("GIT_UNAVAILABLE", "No se pudo iniciar Git de forma controlada. Comprueba su instalación y las restricciones de procesos del sistema."),
            _ => fail("REMOTE_TIMEOUT", "Git o sus auxiliares excedieron el tiempo permitido. Actualiza antes de repetir; no hay reintentos automáticos."),
        })?;
    if network
        && !output.success
        && let Some(diagnostic) = output.diagnostic
    {
        use crate::process::Diagnostic;
        let (code, message) = match diagnostic {
            Diagnostic::SshAgentEmpty => (
                "SSH_AGENT_EMPTY",
                "El agente SSH no tiene identidades cargadas. Carga la clave desde tu sistema antes de repetir.",
            ),
            Diagnostic::SshAuthentication => (
                "SSH_AUTH",
                "SSH no pudo autenticar con clave. Comprueba el cliente configurado, el agente y la clave registrada en el servidor. No necesitas iniciar sesión web para un remoto SSH.",
            ),
            Diagnostic::HostKey => (
                "SSH_HOST_KEY",
                "SSH no confirmó la identidad del servidor. Verifica su huella oficial y la entrada de known_hosts desde tu terminal; RavenGit no acepta ni reemplaza claves de host automáticamente.",
            ),
            Diagnostic::Dns => (
                "REMOTE_DNS",
                "No se pudo resolver el servidor. Revisa el host, la red y los alias de ~/.ssh/config.",
            ),
            Diagnostic::Connection => (
                "REMOTE_CONNECT",
                "No se pudo establecer la conexión o se interrumpió. Revisa red, puerto, firewall o VPN antes de repetir.",
            ),
            Diagnostic::HttpsAuthentication => (
                "HTTPS_AUTH",
                "El servidor HTTPS requiere credenciales disponibles en Git Credential Manager o tu helper. RavenGit no abre un inicio de sesión ni guarda contraseñas en la URL.",
            ),
            Diagnostic::Tls => (
                "REMOTE_TLS",
                "No se pudo verificar el certificado TLS del servidor. Revisa sus certificados desde Git; no se desactiva su validación.",
            ),
            Diagnostic::RepositoryAccess => (
                "REMOTE_REPOSITORY",
                "El destino no permitió leer el repositorio o no lo encontró. Comprueba host, ruta y permisos de la cuenta o clave SSH. La URL de publicación puede ser distinta de la de descarga; este error no permite distinguir un repositorio inexistente de uno privado sin acceso.",
            ),
        };
        return Err(fail(code, message));
    }
    if output.bytes.len() > LIMIT {
        return Err(fail(
            "REMOTE_OUTPUT_LIMIT",
            "La salida supera 2 MiB. No se presenta un resultado truncado.",
        ));
    }
    Ok(Output {
        bytes: output.bytes,
        success: output.success,
    })
}

fn read_cmd(repo: &Repository, args: &[&str]) -> Result<Vec<u8>> {
    let result = command(repo, args, false)?;
    if result.success {
        Ok(result.bytes)
    } else {
        Err(fail(
            "REMOTE_READ",
            "No se pudo leer la configuración Git. Comprueba sus permisos y sintaxis.",
        ))
    }
}
fn text(repo: &Repository, args: &[&str]) -> Result<String> {
    String::from_utf8(read_cmd(repo, args)?).map_err(|_| {
        fail(
            "ENCODING",
            "La configuración o las referencias no son UTF-8.",
        )
    })
}
fn config(raw: &[u8]) -> Result<BTreeMap<String, Vec<String>>> {
    let value =
        std::str::from_utf8(raw).map_err(|_| fail("ENCODING", "La configuración no es UTF-8."))?;
    let mut map = BTreeMap::<String, Vec<String>>::new();
    for record in value.split('\0').filter(|s| !s.is_empty()) {
        let (key, value) = record.split_once('\n').unwrap_or((record, ""));
        map.entry(key.to_string())
            .or_default()
            .push(value.to_string());
    }
    Ok(map)
}
fn name_valid(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name.as_bytes()[0].is_ascii_alphanumeric()
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        && !name.contains("..")
        && !name.ends_with('.')
}
pub(crate) fn safe_url(value: &str) -> bool {
    if value.is_empty()
        || value.len() > 4096
        || value.chars().any(|c| c.is_control())
        || value.starts_with('-')
    {
        return false;
    }
    if value.contains("://") {
        let Ok(url) = Url::parse(value) else {
            return false;
        };
        if !url.query().unwrap_or("").is_empty() || !url.fragment().unwrap_or("").is_empty() {
            return false;
        }
        return match url.scheme() {
            "https" => {
                url.host_str().is_some() && url.username().is_empty() && url.password().is_none()
            }
            "ssh" => url.host_str().is_some() && url.password().is_none(),
            "file" => url.to_file_path().is_ok(),
            _ => false,
        };
    }
    if Path::new(value).is_absolute() {
        return true;
    }
    if let Some((host, path)) = value.split_once(':') {
        return !host.is_empty()
            && !path.is_empty()
            && !path.starts_with(':')
            && !host.contains('/')
            && !host.contains('\\')
            && !host.contains(char::is_whitespace)
            && !host.starts_with('-')
            && host.matches('@').count() <= 1;
    }
    false
}
fn display_url(value: &str) -> String {
    if safe_url(value) {
        return value.to_string();
    }
    if let Ok(mut parsed) = Url::parse(value) {
        let _ = parsed.set_username("");
        let _ = parsed.set_password(None);
        parsed.set_query(None);
        parsed.set_fragment(None);
        if matches!(parsed.scheme(), "https" | "ssh" | "http") {
            return format!("{} [datos de acceso ocultos o formato restringido]", parsed);
        }
    }
    "[URL oculta: formato no compatible]".into()
}
fn provider(url: &str) -> String {
    let host = Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(String::from))
        .or_else(|| {
            url.split_once(':')
                .map(|(h, _)| h.rsplit('@').next().unwrap_or(h).to_string())
        });
    match host.as_deref() {
        Some("github.com") => "GitHub",
        Some("gitlab.com") => "GitLab",
        Some("bitbucket.org") => "Bitbucket Cloud",
        _ => "Servidor Git",
    }
    .into()
}
fn values(config: &BTreeMap<String, Vec<String>>, name: &str, kind: &str) -> Vec<String> {
    config
        .get(&format!("remote.{name}.{kind}"))
        .cloned()
        .unwrap_or_default()
}
fn tracking(repo: &Repository, name: &str) -> Result<(usize, Vec<String>)> {
    let all = text(
        repo,
        &["for-each-ref", "--format=%(refname)", "refs/remotes/"],
    )?;
    let prefix = format!("refs/remotes/{name}/");
    let count = all.lines().filter(|r| r.starts_with(&prefix)).count();
    let branches = text(
        repo,
        &[
            "for-each-ref",
            "--format=%(refname:short)%00%(upstream)",
            "refs/heads/",
        ],
    )?;
    let upstream = branches
        .lines()
        .filter_map(|r| r.split_once('\0'))
        .filter(|(_, upstream)| upstream.starts_with(&prefix))
        .map(|(name, _)| name.to_string())
        .collect();
    Ok((count, upstream))
}
pub fn read(repo: &Repository, trusted: bool) -> Result<Remotes> {
    let raw = read_cmd(repo, &["config", "--includes", "--list", "--null"])?;
    let all = config(&raw)?;
    let local_raw = read_cmd(
        repo,
        &["config", "--local", "--no-includes", "--list", "--null"],
    )?;
    let local = config(&local_raw)?;
    let names = text(repo, &["remote"])?;
    let refs = text(repo, &["for-each-ref", "--format=%(refname) %(objectname)"])?;
    let mut fingerprint = Sha256::new();
    fingerprint.update(&raw);
    fingerprint.update(&local_raw);
    fingerprint.update(refs.as_bytes());
    let mut result = vec![];
    for name in names.lines() {
        let raw_urls = values(&all, name, "url");
        let raw_push = values(&all, name, "pushurl");
        let urls = text(repo, &["remote", "get-url", "--all", name])?;
        let push = text(repo, &["remote", "get-url", "--push", "--all", name])?;
        fingerprint.update((name.len() as u64).to_le_bytes());
        fingerprint.update(name.as_bytes());
        fingerprint.update(urls.as_bytes());
        fingerprint.update(push.as_bytes());
        let url_values: Vec<String> = urls.lines().map(String::from).collect();
        let push_values: Vec<String> = push.lines().map(String::from).collect();
        let prefix = format!("remote.{name}.");
        let owned = all
            .iter()
            .filter(|(k, _)| k.starts_with(&prefix))
            .all(|(key, value)| local.get(key) == Some(value));
        let normal = values(&all, name, "fetch")
            == vec![format!("+refs/heads/*:refs/remotes/{name}/*")]
            && all
                .keys()
                .filter(|k| k.starts_with(&prefix))
                .all(|k| matches!(k.rsplit('.').next(), Some("url" | "pushurl" | "fetch")));
        let safe = raw_urls.len() == 1
            && raw_push.len() <= 1
            && raw_urls
                .iter()
                .chain(raw_push.iter())
                .chain(url_values.iter())
                .chain(push_values.iter())
                .all(|u| safe_url(u));
        let editable = name_valid(name) && owned && normal && safe;
        let fetch_allowed = name_valid(name) && normal && url_values.len() == 1 && safe;
        let restriction = if !editable {
            Some("Configuración avanzada, heredada o URL restringida: se conserva sin sobrescribirla. Revisa este remoto desde Git.".into())
        } else {
            None
        };
        let (tracking_count, upstream_branches) = tracking(repo, name)?;
        result.push(Remote {
            name: name.into(),
            provider: raw_urls
                .first()
                .map(|u| provider(u))
                .unwrap_or_else(|| "Servidor Git".into()),
            fetch_urls: url_values.iter().map(|u| display_url(u)).collect(),
            push_urls: push_values.iter().map(|u| display_url(u)).collect(),
            edit_url: if editable {
                raw_urls.first().cloned()
            } else {
                None
            },
            edit_push_url: if editable {
                raw_push.first().cloned()
            } else {
                None
            },
            editable,
            fetch_allowed,
            push_allowed: editable
                && push_values.len() == 1
                && url_values.len() == 1
                && !all.keys().any(|key| {
                    key.starts_with("url.")
                        && (key.ends_with(".insteadof") || key.ends_with(".pushinsteadof"))
                }),
            restriction,
            tracking_count,
            upstream_branches,
        });
    }
    // Reject a read assembled across external config/ref changes.
    if raw != read_cmd(repo, &["config", "--includes", "--list", "--null"])?
        || local_raw
            != read_cmd(
                repo,
                &["config", "--local", "--no-includes", "--list", "--null"],
            )?
        || refs != text(repo, &["for-each-ref", "--format=%(refname) %(objectname)"])?
    {
        return Err(fail(
            "STALE_REMOTES",
            "La configuración o las referencias cambiaron durante la lectura. Actualiza.",
        ));
    }
    Ok(Remotes {
        token: format!("{:x}", fingerprint.finalize()),
        remotes: result,
        trusted,
    })
}
pub(crate) fn checked(repo: &Repository, token: &str, trusted: bool) -> Result<Remotes> {
    if !trusted {
        return Err(fail(
            "TRUST_REQUIRED",
            "Habilita las operaciones de este repositorio antes de modificar remotos o contactar destinos.",
        ));
    }
    let state = read(repo, trusted)?;
    if state.token != token {
        return Err(fail(
            "STALE_REMOTES",
            "Los remotos o las referencias cambiaron. Actualiza y revisa el destino antes de continuar.",
        ));
    }
    Ok(state)
}
fn local_change(repo: &Repository, args: &[&str]) -> Result<()> {
    if command(repo, args, false)?.success {
        Ok(())
    } else {
        Err(fail(
            "REMOTE_EDIT_FAILED",
            "Git no pudo completar el cambio. La configuración puede haber cambiado parcialmente; actualiza antes de repetir. No se contactó el servidor.",
        ))
    }
}
fn result(repo: &Repository, trusted: bool, message: String, time: Option<u64>) -> OperationResult {
    match read(repo,trusted){Ok(state)=>OperationResult{state:Some(state),message,completed_at:time,warning:None},Err(_)=>OperationResult{state:None,message,completed_at:time,warning:Some("La operación terminó, pero la vista no pudo actualizarse. Actualiza antes de continuar.".into())}}
}
pub fn edit(repo: &Repository, token: &str, edit: Edit, trusted: bool) -> Result<OperationResult> {
    let state = checked(repo, token, trusted)?;
    let name = match &edit {
        Edit::Add { name, .. } | Edit::Update { name, .. } | Edit::Remove { name } => name,
    };
    if !name_valid(name) {
        return Err(fail(
            "REMOTE_NAME",
            "Usa un nombre de hasta 64 caracteres: letras, números, guion, punto o guion bajo, comenzando por letra o número.",
        ));
    }
    let existing = state.remotes.iter().find(|r| r.name == *name);
    match &edit {
        Edit::Add { .. } if existing.is_some() => {
            return Err(fail("REMOTE_EXISTS", "Ya existe un remoto con ese nombre."));
        }
        Edit::Update { .. } | Edit::Remove { .. } if !existing.is_some_and(|r| r.editable) => {
            return Err(fail(
                "REMOTE_READ_ONLY",
                "El remoto no existe o usa una configuración que esta fase conserva en modo de lectura.",
            ));
        }
        _ => {}
    }
    match edit {
        Edit::Add {
            name,
            url,
            push_url,
        } => {
            validate_input(&url, push_url.as_deref())?;
            local_change(repo, &["remote", "add", "--", &name, &url])?;
            if let Some(push) = push_url.filter(|s| !s.is_empty()) {
                local_change(repo, &["remote", "set-url", "--push", &name, &push])?;
            }
        }
        Edit::Update {
            name,
            url,
            push_url,
        } => {
            validate_input(&url, push_url.as_deref())?;
            local_change(repo, &["remote", "set-url", &name, &url])?;
            if let Some(push) = push_url.filter(|s| !s.is_empty()) {
                local_change(repo, &["remote", "set-url", "--push", &name, &push])?;
            } else if existing.is_some_and(|r| r.edit_push_url.is_some()) {
                local_change(
                    repo,
                    &[
                        "config",
                        "--local",
                        "--unset-all",
                        &format!("remote.{name}.pushurl"),
                    ],
                )?;
            }
        }
        Edit::Remove { name } => local_change(repo, &["remote", "remove", &name])?,
    }
    Ok(result(
        repo,
        trusted,
        "Configuración del remoto actualizada localmente. No se contactó el servidor.".into(),
        None,
    ))
}
fn validate_input(url: &str, push: Option<&str>) -> Result<()> {
    if !safe_url(url) || push.is_some_and(|p| !p.is_empty() && !safe_url(p)) {
        Err(fail(
            "REMOTE_URL",
            "Usa HTTPS sin credenciales ni parámetros, SSH o una ruta local absoluta. Los tokens y contraseñas se configuran mediante Git, no dentro de la URL.",
        ))
    } else {
        Ok(())
    }
}
pub fn contact(
    repo: &Repository,
    token: &str,
    name: &str,
    fetch: bool,
    trusted: bool,
) -> Result<OperationResult> {
    let state = checked(repo, token, trusted)?;
    let remote = state
        .remotes
        .iter()
        .find(|r| r.name == name)
        .ok_or_else(|| fail("REMOTE_MISSING", "Ese remoto ya no existe."))?;
    if !remote.fetch_allowed {
        return Err(fail(
            "REMOTE_RESTRICTED",
            "Este remoto requiere revisar su URL o su configuración avanzada desde Git antes de contactar.",
        ));
    }
    let refspec = format!("+refs/heads/*:refs/remotes/{name}/*");
    let args = if fetch {
        vec![
            "fetch",
            "--atomic",
            "--no-tags",
            "--no-recurse-submodules",
            "--no-prune",
            "--no-write-fetch-head",
            "--no-auto-maintenance",
            "--no-write-commit-graph",
            "--",
            name,
            &refspec,
        ]
    } else {
        vec!["ls-remote", "--heads", "--", name]
    };
    let output = command(repo, &args, true)?;
    if !output.success {
        return Err(fail(
            "REMOTE_CONNECTION",
            "No se pudo completar el acceso de lectura. Revisa red, permisos, credenciales/helper o claves SSH conocidas desde Git. No se cambian TLS ni la confianza del host; actualiza antes de repetir.",
        ));
    }
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|t| t.as_secs());
    Ok(result(repo,trusted,if fetch{"Fetch completado: referencias de ramas actualizadas sin merge, sin cambiar tu rama ni publicar commits."}else{"Acceso de lectura comprobado. Esto no verifica permisos de publicación ni actualiza el grafo."}.into(),time))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };
    static NEXT: AtomicU64 = AtomicU64::new(0);
    struct Fixture {
        root: PathBuf,
        repo: Repository,
    }
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "ravengit-remotes-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(root.join("work")).unwrap();
            let repo = Repository {
                id: "fixture".into(),
                path: root.join("work").canonicalize().unwrap(),
            };
            let f = Self { root, repo };
            f.git(&["init", "-b", "main"]);
            f.git(&["config", "user.name", "RavenGit Fixture"]);
            f.git(&["config", "user.email", "fixture@example.invalid"]);
            f.git(&["config", "commit.gpgsign", "false"]);
            f.git(&["config", "core.autocrlf", "false"]);
            f.git(&[
                "config",
                "core.hooksPath",
                f.root.join("no-hooks").to_str().unwrap(),
            ]);
            f
        }
        fn git(&self, args: &[&str]) -> String {
            crate::git::text(&self.repo.path, args).unwrap()
        }
        fn state(&self) -> Remotes {
            read(&self.repo, true).unwrap()
        }
        fn add(&self, name: &str, url: &str, push: Option<&str>) {
            let s = self.state();
            edit(
                &self.repo,
                &s.token,
                Edit::Add {
                    name: name.into(),
                    url: url.into(),
                    push_url: push.map(String::from),
                },
                true,
            )
            .unwrap();
        }
        fn bare(&self) -> PathBuf {
            let path = self.root.join("peer.git");
            self.git(&["init", "--bare", path.to_str().unwrap()]);
            self.git(&["commit", "--allow-empty", "-m", "base"]);
            self.git(&["push", path.to_str().unwrap(), "HEAD:refs/heads/main"]);
            path
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
    #[test]
    fn no_implicit_origin_or_network_on_read() {
        let f = Fixture::new();
        let s = f.state();
        assert!(s.remotes.is_empty());
        assert!(!f.repo.path.join(".git/FETCH_HEAD").exists());
    }
    #[test]
    fn independent_remotes_and_separate_push_url() {
        let f = Fixture::new();
        f.add(
            "origin",
            "ssh://git@gitea.internal:2222/me/raven.git",
            Some("https://gitea.internal/me/raven.git"),
        );
        f.add("upstream", "https://github.com/example/raven.git", None);
        let s = f.state();
        assert_eq!(s.remotes.len(), 2);
        let origin = s.remotes.iter().find(|r| r.name == "origin").unwrap();
        assert_eq!(origin.provider, "Servidor Git");
        assert!(origin.editable);
        assert_eq!(
            origin.push_urls,
            vec!["https://gitea.internal/me/raven.git"]
        );
        assert_eq!(
            s.remotes
                .iter()
                .find(|r| r.name == "upstream")
                .unwrap()
                .provider,
            "GitHub"
        );
        assert!(!f.repo.path.join(".git/FETCH_HEAD").exists());
    }
    #[test]
    fn update_and_clear_explicit_push_url() {
        let f = Fixture::new();
        f.add(
            "origin",
            "https://github.com/example/raven.git",
            Some("git@github.com:example/raven.git"),
        );
        let s = f.state();
        edit(
            &f.repo,
            &s.token,
            Edit::Update {
                name: "origin".into(),
                url: "ssh://git@gitea.internal/raven.git".into(),
                push_url: None,
            },
            true,
        )
        .unwrap();
        let s = f.state();
        assert_eq!(s.remotes[0].fetch_urls, s.remotes[0].push_urls);
        assert!(s.remotes[0].edit_push_url.is_none());
    }
    #[test]
    fn unsafe_urls_names_and_embedded_secrets_never_persist() {
        let f = Fixture::new();
        for value in [
            "ext::sh -c bad",
            "https://token@example.org/r.git",
            "https://me:secret@example.org/r.git",
            "https://example.org/r.git?token=secret",
            "http://example.org/r.git",
            "../relative",
        ] {
            let s = f.state();
            let e = edit(
                &f.repo,
                &s.token,
                Edit::Add {
                    name: "origin".into(),
                    url: value.into(),
                    push_url: None,
                },
                true,
            )
            .unwrap_err();
            assert_eq!(e.code, "REMOTE_URL");
            assert!(!e.message.contains("secret"));
            assert!(f.state().remotes.is_empty());
        }
        let s = f.state();
        assert_eq!(
            edit(
                &f.repo,
                &s.token,
                Edit::Add {
                    name: "--bad".into(),
                    url: "https://example.org/a.git".into(),
                    push_url: None
                },
                true
            )
            .unwrap_err()
            .code,
            "REMOTE_NAME"
        );
    }
    #[test]
    fn masked_existing_credential_url_cannot_contact_or_edit() {
        let f = Fixture::new();
        f.git(&[
            "remote",
            "add",
            "origin",
            "https://me:secret@example.org/r.git",
        ]);
        let s = f.state();
        let json = serde_json::to_string(&s).unwrap();
        assert!(!json.contains("secret"));
        assert!(!s.remotes[0].fetch_allowed);
        assert_eq!(
            contact(&f.repo, &s.token, "origin", false, true)
                .unwrap_err()
                .code,
            "REMOTE_RESTRICTED"
        );
    }
    #[test]
    fn multiple_urls_are_preserved_read_only() {
        let f = Fixture::new();
        f.add("origin", "https://example.org/a.git", None);
        f.git(&[
            "config",
            "--add",
            "remote.origin.url",
            "https://example.org/b.git",
        ]);
        let before = f.git(&["config", "--local", "--list", "--null"]);
        let s = f.state();
        assert_eq!(s.remotes[0].fetch_urls.len(), 2);
        assert!(!s.remotes[0].editable);
        assert_eq!(
            edit(
                &f.repo,
                &s.token,
                Edit::Remove {
                    name: "origin".into()
                },
                true
            )
            .unwrap_err()
            .code,
            "REMOTE_READ_ONLY"
        );
        assert_eq!(before, f.git(&["config", "--local", "--list", "--null"]));
    }
    #[test]
    fn inherited_remote_is_not_modified_locally() {
        let f = Fixture::new();
        let extra = f.root.join("extra-config");
        fs::write(&extra,"[remote \"shared\"]\nurl = https://example.org/shared.git\nfetch = +refs/heads/*:refs/remotes/shared/*\n").unwrap();
        f.git(&["config", "include.path", extra.to_str().unwrap()]);
        let s = f.state();
        assert!(!s.remotes[0].editable);
        assert_eq!(
            edit(
                &f.repo,
                &s.token,
                Edit::Remove {
                    name: "shared".into()
                },
                true
            )
            .unwrap_err()
            .code,
            "REMOTE_READ_ONLY"
        );
        assert!(fs::read_to_string(extra).unwrap().contains("shared.git"));
    }
    #[test]
    fn config_and_ref_changes_invalidate_requests() {
        let f = Fixture::new();
        f.add("origin", "https://example.invalid/a.git", None);
        let s = f.state();
        f.git(&[
            "config",
            "remote.origin.url",
            "https://example.invalid/b.git",
        ]);
        assert_eq!(
            contact(&f.repo, &s.token, "origin", false, true)
                .unwrap_err()
                .code,
            "STALE_REMOTES"
        );
        let s = f.state();
        f.git(&["commit", "--allow-empty", "-m", "external"]);
        assert_eq!(
            edit(
                &f.repo,
                &s.token,
                Edit::Remove {
                    name: "origin".into()
                },
                true
            )
            .unwrap_err()
            .code,
            "STALE_REMOTES"
        );
    }
    #[test]
    fn trust_is_required_for_config_and_connection() {
        let f = Fixture::new();
        let s = f.state();
        assert_eq!(
            edit(
                &f.repo,
                &s.token,
                Edit::Add {
                    name: "origin".into(),
                    url: "https://example.invalid/a.git".into(),
                    push_url: None
                },
                false
            )
            .unwrap_err()
            .code,
            "TRUST_REQUIRED"
        );
        assert_eq!(
            contact(&f.repo, &s.token, "origin", false, false)
                .unwrap_err()
                .code,
            "TRUST_REQUIRED"
        );
        assert!(f.state().remotes.is_empty());
    }
    #[test]
    fn check_then_fetch_only_selected_remote_preserves_head_index_and_files() {
        let f = Fixture::new();
        let bare = f.bare();
        f.add("origin", bare.to_str().unwrap(), None);
        f.add(
            "upstream",
            "https://example.invalid/never-contact.git",
            None,
        );
        fs::write(f.repo.path.join("local.txt"), "sin preparar").unwrap();
        let before_head = f.git(&["rev-parse", "HEAD"]);
        let before_index = fs::read(f.repo.path.join(".git/index")).ok();
        let before_refs = f.git(&["for-each-ref", "--format=%(refname) %(objectname)"]);
        let s = f.state();
        let check = contact(&f.repo, &s.token, "origin", false, true).unwrap();
        assert!(check.completed_at.is_some());
        assert_eq!(
            before_refs,
            f.git(&["for-each-ref", "--format=%(refname) %(objectname)"])
        );
        let s = f.state();
        let result = contact(&f.repo, &s.token, "origin", true, true).unwrap();
        assert!(result.completed_at.is_some());
        assert!(
            result
                .state
                .unwrap()
                .remotes
                .iter()
                .any(|r| r.name == "origin" && r.tracking_count == 1)
        );
        assert_eq!(before_head, f.git(&["rev-parse", "HEAD"]));
        assert_eq!(before_index, fs::read(f.repo.path.join(".git/index")).ok());
        assert_eq!(
            fs::read_to_string(f.repo.path.join("local.txt")).unwrap(),
            "sin preparar"
        );
        assert!(!f.repo.path.join(".git/FETCH_HEAD").exists());
        assert!(f.git(&["for-each-ref", "refs/remotes/upstream"]).is_empty());
    }
    #[test]
    fn removing_remote_preserves_local_branch_and_files() {
        let f = Fixture::new();
        let bare = f.bare();
        f.add("origin", bare.to_str().unwrap(), None);
        let s = f.state();
        contact(&f.repo, &s.token, "origin", true, true).unwrap();
        f.git(&["branch", "--set-upstream-to=origin/main", "main"]);
        let s = f.state();
        assert_eq!(s.remotes[0].upstream_branches, vec!["main"]);
        let head = f.git(&["rev-parse", "HEAD"]);
        edit(
            &f.repo,
            &s.token,
            Edit::Remove {
                name: "origin".into(),
            },
            true,
        )
        .unwrap();
        assert!(f.state().remotes.is_empty());
        assert_eq!(head, f.git(&["rev-parse", "main"]));
        assert!(f.git(&["for-each-ref", "refs/remotes/origin"]).is_empty());
        assert!(bare.exists());
    }
    #[test]
    fn failed_local_access_and_existing_config_lock_are_reported() {
        let f = Fixture::new();
        f.add("origin", f.root.join("missing.git").to_str().unwrap(), None);
        let s = f.state();
        let missing = contact(&f.repo, &s.token, "origin", true, true).unwrap_err();
        assert_eq!(missing.code, "REMOTE_REPOSITORY");
        assert!(!missing.message.contains(f.root.to_str().unwrap()));
        assert!(!missing.message.contains("missing.git"));
        let lock = f.repo.path.join(".git/config.lock");
        fs::write(&lock, "owner").unwrap();
        let s = f.state();
        assert_eq!(
            edit(
                &f.repo,
                &s.token,
                Edit::Add {
                    name: "other".into(),
                    url: "https://example.invalid/a.git".into(),
                    push_url: None
                },
                true
            )
            .unwrap_err()
            .code,
            "REMOTE_EDIT_FAILED"
        );
        assert_eq!(fs::read_to_string(lock).unwrap(), "owner");
        assert_eq!(f.state().remotes.len(), 1);
    }
    #[test]
    fn ssh_alias_and_known_provider_urls_are_accepted_without_contact() {
        for value in [
            "git@gitea-office:team/repo.git",
            "gitea-office:team/repo.git",
            "ssh://git@gitea.office:2222/team/repo.git",
            "https://gitlab.com/team/repo.git",
            "https://bitbucket.org/team/repo.git",
        ] {
            assert!(safe_url(value), "{value}");
        }
    }
}
