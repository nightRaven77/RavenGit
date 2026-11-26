//! Explicit opt-in integration with GitHub (gh) and GitLab (glab) without background network traffic.
use crate::git::{self, GitError, Repository, Result};
use serde::{Deserialize, Serialize};
use std::{
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use url::Url;

const MAX_CLI_STDOUT: usize = 1024 * 1024;
const MAX_CLI_STDERR: usize = 16 * 1024;
const CLI_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ForgeProvider {
    Github,
    Gitlab,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ForgeInfo {
    pub trusted: bool,
    pub provider: Option<ForgeProvider>,
    pub remote_name: Option<String>,
    pub host: Option<String>,
    pub repo_slug: Option<String>,
    pub web_url: Option<String>,
    pub cli_name: Option<String>,
    pub cli_available: bool,
    pub current_branch: Option<String>,
    pub create_pr_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestItem {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub head_branch: String,
    pub base_branch: String,
    pub author: String,
    pub url: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestsOutcome {
    pub provider: ForgeProvider,
    pub repo_slug: String,
    pub items: Vec<PullRequestItem>,
    pub fetched_at: u64,
}

fn provider_for_host(host: &str) -> Option<ForgeProvider> {
    let lower = host.to_ascii_lowercase();
    if lower == "github.com" || lower.ends_with(".github.com") || lower.contains("github") {
        Some(ForgeProvider::Github)
    } else if lower == "gitlab.com" || lower.contains("gitlab") {
        Some(ForgeProvider::Gitlab)
    } else {
        None
    }
}

fn clean_slug(raw_path: &str) -> Option<String> {
    let trimmed = raw_path
        .trim()
        .trim_start_matches('/')
        .trim_end_matches('/');
    let without_git = trimmed.strip_suffix(".git").unwrap_or(trimmed);
    let segments: Vec<&str> = without_git.split('/').collect();
    if segments.len() < 2
        || segments.iter().any(|seg| {
            seg.is_empty()
                || *seg == "."
                || *seg == ".."
                || seg.chars().any(char::is_control)
                || seg.contains('\\')
        })
    {
        return None;
    }
    Some(segments.join("/"))
}

fn valid_host(host: &str) -> bool {
    !host.is_empty()
        && !host.chars().any(|ch| ch.is_whitespace() || ch.is_control())
        && host
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-'))
}

/// Parses GitHub or GitLab remote URLs (https://, ssh://, or SCP-like user@host:path).
pub fn parse_remote_url(raw: &str) -> Option<(ForgeProvider, String, String)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_control) {
        return None;
    }

    if let Ok(parsed) = Url::parse(trimmed) {
        if !matches!(parsed.scheme(), "https" | "ssh") {
            return None;
        }
        let host = parsed.host_str()?.to_ascii_lowercase();
        if !valid_host(&host) {
            return None;
        }
        let provider = provider_for_host(&host)?;
        let slug = clean_slug(parsed.path())?;
        return Some((provider, host, slug));
    }

    // SCP-like syntax: [user@]host:owner/repo[.git]
    if !trimmed.contains("://")
        && let Some((left, right)) = trimmed.split_once(':')
    {
        let host = left
            .rsplit_once('@')
            .map_or(left, |(_, h)| h)
            .to_ascii_lowercase();
        if !valid_host(&host) {
            return None;
        }
        let provider = provider_for_host(&host)?;
        let slug = clean_slug(right)?;
        return Some((provider, host, slug));
    }

    None
}

fn percent_encode(input: &str, keep_slash: bool) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        let unreserved = byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~');
        if unreserved || (keep_slash && *byte == b'/') {
            out.push(*byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn build_create_pr_url(provider: ForgeProvider, host: &str, slug: &str, branch: &str) -> String {
    match provider {
        ForgeProvider::Github => {
            let encoded = percent_encode(branch, true);
            format!("https://{host}/{slug}/compare/{encoded}?expand=1")
        }
        ForgeProvider::Gitlab => {
            let encoded = percent_encode(branch, false);
            format!(
                "https://{host}/{slug}/-/merge_requests/new?merge_request%5Bsource_branch%5D={encoded}"
            )
        }
    }
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn find_cli(name: &str) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|raw| std::env::split_paths(&raw).collect())
        .unwrap_or_default();

    #[cfg(unix)]
    {
        for extra in ["/opt/homebrew/bin", "/usr/local/bin"] {
            let candidate = PathBuf::from(extra);
            if !dirs.contains(&candidate) {
                dirs.push(candidate);
            }
        }
        if let Some(home) = std::env::var_os("HOME") {
            let local_bin = PathBuf::from(home).join(".local/bin");
            if !dirs.contains(&local_bin) {
                dirs.push(local_bin);
            }
        }
    }

    #[cfg(windows)]
    let names = [
        format!("{name}.exe"),
        format!("{name}.cmd"),
        name.to_string(),
    ];
    #[cfg(not(windows))]
    let names = [name.to_string()];

    for bin in &names {
        for dir in &dirs {
            let candidate = dir.join(bin);
            if is_executable_file(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

fn detect_remote(repo: &Repository) -> Option<(String, ForgeProvider, String, String)> {
    let raw = git::text(&repo.path, &["remote", "-v"]).ok()?;
    let mut origin_match = None;
    let mut first_match = None;

    for line in raw.lines() {
        let mut parts = line.split_whitespace();
        let Some(name) = parts.next() else { continue };
        let Some(url) = parts.next() else { continue };
        let kind = parts.next().unwrap_or("");
        if !kind.is_empty() && kind != "(fetch)" && kind != "(push)" {
            continue;
        }
        if let Some((provider, host, slug)) = parse_remote_url(url) {
            let candidate = (name.to_string(), provider, host, slug);
            if name == "origin" {
                origin_match = Some(candidate);
                break;
            }
            if first_match.is_none() {
                first_match = Some(candidate);
            }
        }
    }

    origin_match.or(first_match)
}

/// Reads repository remotes and local CLI availability without contacting any remote host.
pub fn inspect(repo: &Repository, trusted: bool) -> Result<ForgeInfo> {
    let current_branch = git::text(&repo.path, &["symbolic-ref", "--short", "-q", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let Some((remote_name, provider, host, slug)) = detect_remote(repo) else {
        return Ok(ForgeInfo {
            trusted,
            provider: None,
            remote_name: None,
            host: None,
            repo_slug: None,
            web_url: None,
            cli_name: None,
            cli_available: false,
            current_branch,
            create_pr_url: None,
        });
    };

    let cli_name = match provider {
        ForgeProvider::Github => "gh",
        ForgeProvider::Gitlab => "glab",
    };
    let cli_available = find_cli(cli_name).is_some();
    let web_url = format!("https://{host}/{slug}");
    let create_pr_url = current_branch
        .as_deref()
        .map(|branch| build_create_pr_url(provider, &host, &slug, branch));

    Ok(ForgeInfo {
        trusted,
        provider: Some(provider),
        remote_name: Some(remote_name),
        host: Some(host),
        repo_slug: Some(slug),
        web_url: Some(web_url),
        cli_name: Some(cli_name.into()),
        cli_available,
        current_branch,
        create_pr_url,
    })
}

fn drain_bounded(mut reader: impl Read, limit: usize) -> Vec<u8> {
    let mut out = Vec::new();
    let mut buf = [0u8; 4096];
    while let Ok(n) = reader.read(&mut buf) {
        if n == 0 {
            break;
        }
        let room = limit.saturating_sub(out.len());
        if room > 0 {
            out.extend_from_slice(&buf[..n.min(room)]);
        }
    }
    out
}

fn run_bounded_cli(mut cmd: Command) -> Result<(Vec<u8>, Vec<u8>, bool)> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|_| {
        GitError::new(
            "FORGE_CLI_MISSING",
            "No se pudo iniciar la herramienta CLI del proveedor (gh/glab).",
        )
    })?;
    let out_pipe = child.stdout.take().unwrap();
    let err_pipe = child.stderr.take().unwrap();
    let stdout_handle = thread::spawn(move || drain_bounded(out_pipe, MAX_CLI_STDOUT));
    let stderr_handle = thread::spawn(move || drain_bounded(err_pipe, MAX_CLI_STDERR));
    let started = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = stdout_handle.join().unwrap_or_default();
                let stderr = stderr_handle.join().unwrap_or_default();
                return Ok((stdout, stderr, status.success()));
            }
            Ok(None) => {
                if started.elapsed() >= CLI_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(GitError::new(
                        "FORGE_TIMEOUT",
                        "La consulta de PRs/MRs tardó demasiado y se detuvo sin reintentar.",
                    ));
                }
                thread::sleep(Duration::from_millis(25));
            }
            Err(_) => {
                let _ = child.kill();
                return Err(GitError::new(
                    "FORGE_CLI_ERROR",
                    "Se perdió la comunicación con gh/glab.",
                ));
            }
        }
    }
}

/// Validates that an external URL uses https:// without credentials and matches the detected host.
pub fn validate_forge_url(raw_url: &str, expected_host: &str) -> Result<String> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_control) {
        return Err(GitError::new(
            "FORGE_URL_BLOCKED",
            "La URL solicitada no es válida.",
        ));
    }
    let parsed = Url::parse(trimmed).map_err(|_| {
        GitError::new(
            "FORGE_URL_BLOCKED",
            "No se pudo interpretar la URL solicitada.",
        )
    })?;
    if parsed.scheme() != "https" || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(GitError::new(
            "FORGE_URL_BLOCKED",
            "Sólo se permiten URLs https:// sin credenciales embebidas.",
        ));
    }
    let Some(host) = parsed.host_str() else {
        return Err(GitError::new(
            "FORGE_URL_BLOCKED",
            "La URL no incluye un destino válido.",
        ));
    };
    if !host.eq_ignore_ascii_case(expected_host) {
        return Err(GitError::new(
            "FORGE_URL_BLOCKED",
            "La URL no pertenece al proveedor remoto de este repositorio.",
        ));
    }
    Ok(parsed.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhAuthor {
    login: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPrRow {
    number: u64,
    title: String,
    #[serde(default)]
    is_draft: bool,
    head_ref_name: String,
    base_ref_name: String,
    url: String,
    author: Option<GhAuthor>,
    #[serde(default)]
    updated_at: String,
}

pub fn parse_gh_prs_json(bytes: &[u8], expected_host: &str) -> Result<Vec<PullRequestItem>> {
    let rows: Vec<GhPrRow> = serde_json::from_slice(bytes).map_err(|_| {
        GitError::new(
            "FORGE_PARSE",
            "La respuesta JSON de GitHub CLI (gh) no tuvo el formato esperado.",
        )
    })?;
    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let safe_url = validate_forge_url(&row.url, expected_host)?;
        let author = row
            .author
            .and_then(|a| a.login.or(a.name))
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "autor".into());
        items.push(PullRequestItem {
            number: row.number,
            title: row.title,
            state: if row.is_draft {
                "draft".into()
            } else {
                "open".into()
            },
            head_branch: row.head_ref_name,
            base_branch: row.base_ref_name,
            author,
            url: safe_url,
            updated_at: row.updated_at,
        });
    }
    Ok(items)
}

#[derive(Deserialize)]
struct GlabAuthor {
    username: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct GlabMrRow {
    iid: u64,
    title: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    work_in_progress: bool,
    source_branch: String,
    target_branch: String,
    web_url: String,
    author: Option<GlabAuthor>,
    #[serde(default)]
    updated_at: String,
}

pub fn parse_glab_mrs_json(bytes: &[u8], expected_host: &str) -> Result<Vec<PullRequestItem>> {
    let rows: Vec<GlabMrRow> = serde_json::from_slice(bytes).map_err(|_| {
        GitError::new(
            "FORGE_PARSE",
            "La respuesta JSON de GitLab CLI (glab) no tuvo el formato esperado.",
        )
    })?;
    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let safe_url = validate_forge_url(&row.web_url, expected_host)?;
        let author = row
            .author
            .and_then(|a| a.username.or(a.name))
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "autor".into());
        items.push(PullRequestItem {
            number: row.iid,
            title: row.title,
            state: if row.draft || row.work_in_progress {
                "draft".into()
            } else {
                "open".into()
            },
            head_branch: row.source_branch,
            base_branch: row.target_branch,
            author,
            url: safe_url,
            updated_at: row.updated_at,
        });
    }
    Ok(items)
}

fn map_cli_error(provider: ForgeProvider, stderr: &[u8]) -> GitError {
    let text = String::from_utf8_lossy(stderr).to_ascii_lowercase();
    if text.contains("not logged into")
        || text.contains("auth login")
        || text.contains("no token")
        || text.contains("401")
        || text.contains("unauthorized")
    {
        return match provider {
            ForgeProvider::Github => GitError::new(
                "FORGE_AUTH",
                "GitHub CLI (gh) no está autenticado. Ejecuta «gh auth login» en tu terminal e inténtalo de nuevo.",
            ),
            ForgeProvider::Gitlab => GitError::new(
                "FORGE_AUTH",
                "GitLab CLI (glab) no está autenticado. Ejecuta «glab auth login» en tu terminal e inténtalo de nuevo.",
            ),
        };
    }
    GitError::new(
        "FORGE_REQUEST",
        "No se pudieron consultar los PRs/MRs desde el proveedor remoto.",
    )
}

/// Explicitly queries open PRs/MRs via the local gh/glab CLI when requested by the user.
pub fn fetch_pull_requests(repo: &Repository, trusted: bool) -> Result<PullRequestsOutcome> {
    if !trusted {
        return Err(GitError::new(
            "UNTRUSTED",
            "Autoriza el repositorio antes de consultar PRs o MRs.",
        ));
    }
    let info = inspect(repo, true)?;
    let (Some(provider), Some(slug), Some(host)) = (info.provider, info.repo_slug, info.host)
    else {
        return Err(GitError::new(
            "FORGE_UNSUPPORTED",
            "No se detectó un remoto compatible con GitHub o GitLab en este repositorio.",
        ));
    };
    let cli = match provider {
        ForgeProvider::Github => "gh",
        ForgeProvider::Gitlab => "glab",
    };
    let Some(cli_path) = find_cli(cli) else {
        return Err(GitError::new(
            "FORGE_CLI_MISSING",
            format!(
                "No se detectó «{cli}» en el sistema. Instálalo e inicia sesión para consultar PRs/MRs."
            ),
        ));
    };

    let mut cmd = Command::new(cli_path);
    cmd.current_dir(&repo.path)
        .env("NO_COLOR", "1")
        .env("GIT_TERMINAL_PROMPT", "0");

    match provider {
        ForgeProvider::Github => {
            cmd.env("GH_PROMPT_DISABLED", "1").args([
                "pr",
                "list",
                "--repo",
                &slug,
                "--state",
                "open",
                "--limit",
                "30",
                "--json",
                "number,title,state,isDraft,headRefName,baseRefName,url,author,updatedAt",
            ]);
        }
        ForgeProvider::Gitlab => {
            cmd.args(["mr", "list", "--per-page", "30", "--output", "json"]);
        }
    }

    let (stdout, stderr, ok) = run_bounded_cli(cmd)?;
    if !ok {
        return Err(map_cli_error(provider, &stderr));
    }

    let items = match provider {
        ForgeProvider::Github => parse_gh_prs_json(&stdout, &host)?,
        ForgeProvider::Gitlab => parse_glab_mrs_json(&stdout, &host)?,
    };
    let fetched_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(PullRequestsOutcome {
        provider,
        repo_slug: slug,
        items,
        fetched_at,
    })
}

/// Validates and opens an https:// forge URL using explicit OS launcher argv (no shell).
pub fn open_url(repo: &Repository, raw_url: &str, trusted: bool) -> Result<String> {
    if !trusted {
        return Err(GitError::new(
            "UNTRUSTED",
            "Autoriza el repositorio antes de abrir enlaces del proveedor remoto.",
        ));
    }
    let info = inspect(repo, true)?;
    let Some(host) = info.host else {
        return Err(GitError::new(
            "FORGE_UNSUPPORTED",
            "No se detectó un proveedor compatible para este repositorio.",
        ));
    };
    let validated = validate_forge_url(raw_url, &host)?;

    #[cfg(target_os = "macos")]
    let spawn_result = Command::new("open").arg(&validated).spawn();
    #[cfg(target_os = "windows")]
    let spawn_result = Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", &validated])
        .spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let spawn_result = Command::new("xdg-open").arg(&validated).spawn();

    spawn_result.map_err(|_| {
        GitError::new(
            "FORGE_OPEN_FAILED",
            "No se pudo abrir el enlace en el navegador del sistema.",
        )
    })?;

    Ok(validated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn parses_github_and_gitlab_remotes_and_rejects_invalid_urls() {
        assert_eq!(
            parse_remote_url("https://github.com/nightRaven77/RavenGit.git"),
            Some((
                ForgeProvider::Github,
                "github.com".into(),
                "nightRaven77/RavenGit".into()
            ))
        );
        assert_eq!(
            parse_remote_url("git@github.com:nightRaven77/RavenGit"),
            Some((
                ForgeProvider::Github,
                "github.com".into(),
                "nightRaven77/RavenGit".into()
            ))
        );
        assert_eq!(
            parse_remote_url("ssh://git@gitlab.example.com:2222/team/sub/app.git"),
            Some((
                ForgeProvider::Gitlab,
                "gitlab.example.com".into(),
                "team/sub/app".into()
            ))
        );
        assert_eq!(
            parse_remote_url("https://user:secret@gitlab.com/org/proj.git"),
            Some((
                ForgeProvider::Gitlab,
                "gitlab.com".into(),
                "org/proj".into()
            ))
        );
        assert_eq!(parse_remote_url("http://github.com/owner/repo.git"), None);
        assert_eq!(parse_remote_url("file:///tmp/repo"), None);
        assert_eq!(
            parse_remote_url("https://bitbucket.org/team/repo.git"),
            None
        );
        assert_eq!(parse_remote_url("https://github.com/onlyowner"), None);
        assert_eq!(parse_remote_url("https://github.com/owner/../repo"), None);
    }

    #[test]
    fn parses_gh_and_glab_json_and_blocks_cross_host_or_non_https_links() {
        let gh_json = br#"[
            {
                "number": 42,
                "title": "feat: pulso visual",
                "state": "OPEN",
                "isDraft": false,
                "headRefName": "feat/ui",
                "baseRefName": "main",
                "url": "https://github.com/org/repo/pull/42",
                "author": { "login": "erick" },
                "updatedAt": "2026-11-25T10:00:00Z"
            },
            {
                "number": 43,
                "title": "wip: draft",
                "state": "OPEN",
                "isDraft": true,
                "headRefName": "wip/test",
                "baseRefName": "main",
                "url": "https://github.com/org/repo/pull/43",
                "author": { "name": "Raven" },
                "updatedAt": "2026-11-25T11:00:00Z"
            }
        ]"#;
        let gh_items = parse_gh_prs_json(gh_json, "github.com").unwrap();
        assert_eq!(gh_items.len(), 2);
        assert_eq!(gh_items[0].number, 42);
        assert_eq!(gh_items[0].state, "open");
        assert_eq!(gh_items[1].state, "draft");
        assert_eq!(gh_items[1].author, "Raven");

        let glab_json = br#"[
            {
                "iid": 7,
                "title": "Refactor CI",
                "draft": true,
                "work_in_progress": false,
                "source_branch": "ci/update",
                "target_branch": "main",
                "web_url": "https://gitlab.example.com/group/app/-/merge_requests/7",
                "author": { "username": "dev1" },
                "updated_at": "2026-11-25T08:00:00Z"
            }
        ]"#;
        let glab_items = parse_glab_mrs_json(glab_json, "gitlab.example.com").unwrap();
        assert_eq!(glab_items.len(), 1);
        assert_eq!(glab_items[0].number, 7);
        assert_eq!(glab_items[0].state, "draft");

        let bad_host = br#"[{"number":1,"title":"x","isDraft":false,"headRefName":"a","baseRefName":"b","url":"https://evil.example/pull/1"}]"#;
        assert_eq!(
            parse_gh_prs_json(bad_host, "github.com").unwrap_err().code,
            "FORGE_URL_BLOCKED"
        );
    }

    #[test]
    fn validates_forge_urls_and_refuses_untrusted_fetch() {
        assert!(
            validate_forge_url(
                "https://github.com/nightRaven77/RavenGit/pull/1",
                "github.com"
            )
            .is_ok()
        );
        for blocked in [
            "http://github.com/nightRaven77/RavenGit/pull/1",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://evil.com/nightRaven77/RavenGit/pull/1",
            "https://user@github.com/nightRaven77/RavenGit/pull/1",
        ] {
            assert_eq!(
                validate_forge_url(blocked, "github.com").unwrap_err().code,
                "FORGE_URL_BLOCKED"
            );
        }

        let repo = Repository {
            id: "1".into(),
            path: PathBuf::from("/tmp/nonexistent-repo"),
        };
        assert_eq!(
            fetch_pull_requests(&repo, false).unwrap_err().code,
            "UNTRUSTED"
        );
    }
}
