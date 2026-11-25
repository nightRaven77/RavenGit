//! Local deep history and code (-S / -G) search over Git repositories.
//! Read-only commands with explicit argv arrays, bounded timeout and 2 MiB output cap.
use crate::{
    git::{self, Commit, GitError, Repository, Result},
    process,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const MAX_OUTPUT: usize = 2 * 1024 * 1024;
const DEFAULT_LIMIT: usize = 50;
const MAX_LIMIT: usize = 200;
const MAX_QUERY_LEN: usize = 500;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CodeSearchMode {
    Literal,
    Regex,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub scope: Option<String>,
    pub message: Option<String>,
    pub author: Option<String>,
    pub hash: Option<String>,
    pub since: Option<String>,
    pub until: Option<String>,
    pub path: Option<String>,
    #[serde(default)]
    pub regex: bool,
    pub code_query: Option<String>,
    pub code_mode: Option<CodeSearchMode>,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub commits: Vec<Commit>,
    pub next_offset: Option<usize>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatchDiff {
    pub hash: String,
    pub text: String,
}

fn clean_filter(value: Option<&str>, label: &str) -> Result<Option<String>> {
    let Some(raw) = value else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > MAX_QUERY_LEN || trimmed.chars().any(char::is_control) {
        return Err(GitError::new(
            "INVALID_SEARCH",
            format!(
                "El filtro «{label}» supera el límite permitido o contiene caracteres inválidos."
            ),
        ));
    }
    Ok(Some(trimmed.to_string()))
}

fn is_calendar_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(i, b)| i == 4 || i == 7 || b.is_ascii_digit())
}

fn run_search_git(repo: &Repository, args: &[&str], regex_used: bool) -> Result<Vec<u8>> {
    let mut command = process::git(&repo.path);
    command.args(args).env("GIT_OPTIONAL_LOCKS", "0");
    let output =
        process::execute(command, None, Duration::from_secs(20)).map_err(|err| match err {
            process::Error::Start => GitError::new(
                "GIT_UNAVAILABLE",
                "No se pudo iniciar Git para buscar en el historial.",
            ),
            _ => GitError::new(
                "TIMEOUT",
                "La búsqueda excedió el tiempo permitido. Acota con fechas, autor o ruta.",
            ),
        })?;
    if output.bytes.len() > MAX_OUTPUT {
        return Err(GitError::new(
            "OUTPUT_LIMIT",
            "El resultado supera 2 MiB. Acota tu búsqueda con una ruta o filtro adicional.",
        ));
    }
    if output.success {
        Ok(output.bytes)
    } else if regex_used {
        Err(GitError::new(
            "INVALID_REGEX",
            "Git no pudo evaluar la búsqueda. Comprueba la sintaxis de la expresión regular.",
        ))
    } else {
        Err(GitError::new(
            "SEARCH_FAILED",
            "Git no pudo completar la búsqueda sobre el historial local.",
        ))
    }
}

fn resolve_scope(
    repo: &Repository,
    raw_scope: Option<&str>,
    has_head: bool,
) -> Result<Option<String>> {
    let scope = raw_scope.unwrap_or("all");
    if scope != "all"
        && scope != "HEAD"
        && !(scope.len() <= 4096
            && (scope.starts_with("refs/heads/") || scope.starts_with("refs/remotes/")))
    {
        return Err(GitError::new(
            "INVALID_SCOPE",
            "Selecciona una rama local o remota válida.",
        ));
    }
    if scope == "all" || (scope == "HEAD" && !has_head) {
        return Ok(None);
    }
    if scope != "HEAD" {
        git::text(&repo.path, &["check-ref-format", scope])?;
        git::text(&repo.path, &["show-ref", "--verify", scope]).map_err(|_| {
            GitError::new(
                "INVALID_SCOPE",
                "La referencia seleccionada ya no existe. Actualiza el historial.",
            )
        })?;
    }
    let resolved = git::text(
        &repo.path,
        &[
            "rev-parse",
            "--verify",
            "--end-of-options",
            &format!("{scope}^{{commit}}"),
        ],
    )?
    .trim()
    .to_string();
    Ok(Some(resolved))
}

pub fn history(repo: &Repository, query: SearchQuery) -> Result<SearchResult> {
    let message = clean_filter(query.message.as_deref(), "mensaje")?;
    let author = clean_filter(query.author.as_deref(), "autor")?;
    let hash = clean_filter(query.hash.as_deref(), "hash")?;
    let since = clean_filter(query.since.as_deref(), "desde")?;
    let until = clean_filter(query.until.as_deref(), "hasta")?.map(|u| {
        if is_calendar_date(&u) {
            format!("{u} 23:59:59")
        } else {
            u
        }
    });
    let code_query = clean_filter(query.code_query.as_deref(), "código")?;
    let path = match query
        .path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(rel) => {
            git::validate_rel_path(rel)?;
            Some(rel.to_string())
        }
        None => None,
    };

    if message.is_none()
        && author.is_none()
        && hash.is_none()
        && since.is_none()
        && until.is_none()
        && path.is_none()
        && code_query.is_none()
    {
        return Err(GitError::new(
            "EMPTY_SEARCH",
            "Indica al menos un criterio de búsqueda.",
        ));
    }

    if let Some(ref h) = hash
        && (!(4..=64).contains(&h.len()) || !h.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return Err(GitError::new(
            "INVALID_HASH",
            "Indica entre 4 y 64 dígitos hexadecimales válidos para buscar por hash.",
        ));
    }

    let has_head = git::text(&repo.path, &["rev-parse", "--verify", "HEAD"]).is_ok();
    let has_refs = !git::text(
        &repo.path,
        &["for-each-ref", "--count=1", "--format=%(refname)"],
    )?
    .is_empty();

    let scope = query.scope.as_deref().unwrap_or("all");
    let scope_rev = resolve_scope(repo, query.scope.as_deref(), has_head)?;

    if (!has_head && !has_refs) || (scope == "HEAD" && !has_head) {
        return Ok(SearchResult {
            commits: vec![],
            next_offset: None,
            truncated: false,
        });
    }

    let resolved_hash = if let Some(ref prefix) = hash {
        let Ok(oid_text) = git::text(
            &repo.path,
            &[
                "rev-parse",
                "--verify",
                "--end-of-options",
                &format!("{prefix}^{{commit}}"),
            ],
        ) else {
            return Ok(SearchResult {
                commits: vec![],
                next_offset: None,
                truncated: false,
            });
        };
        let oid = oid_text.trim().to_string();
        if let Some(ref ancestor_target) = scope_rev
            && git::run(
                &repo.path,
                &["merge-base", "--is-ancestor", &oid, ancestor_target],
            )
            .is_err()
        {
            return Ok(SearchResult {
                commits: vec![],
                next_offset: None,
                truncated: false,
            });
        }
        Some(oid)
    } else {
        None
    };

    let limit = query.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let offset = query.offset.unwrap_or(0).min(100_000);

    let mut owned_args: Vec<String> = vec![
        "log".into(),
        "--no-ext-diff".into(),
        "--no-textconv".into(),
        "--no-color".into(),
        "--no-show-signature".into(),
        "--no-decorate".into(),
        "-z".into(),
        "--format=%H%x00%P%x00%an%x00%aI%x00%s".into(),
    ];

    let regex_used =
        query.regex || (code_query.is_some() && query.code_mode == Some(CodeSearchMode::Regex));

    if message.is_some() || author.is_some() {
        owned_args.push("--regexp-ignore-case".into());
        if query.regex {
            owned_args.push("--extended-regexp".into());
        } else {
            owned_args.push("--fixed-strings".into());
        }
    }

    if let Some(ref m) = message {
        owned_args.push(format!("--grep={m}"));
    }
    if let Some(ref a) = author {
        owned_args.push(format!("--author={a}"));
    }
    if let Some(ref s) = since {
        owned_args.push(format!("--since={s}"));
    }
    if let Some(ref u) = until {
        owned_args.push(format!("--until={u}"));
    }
    if let Some(ref code) = code_query {
        match query.code_mode.unwrap_or(CodeSearchMode::Literal) {
            CodeSearchMode::Literal => owned_args.push(format!("-S{code}")),
            CodeSearchMode::Regex => owned_args.push(format!("-G{code}")),
        }
    }

    if let Some(ref oid) = resolved_hash {
        owned_args.push("-n".into());
        owned_args.push("1".into());
        owned_args.push(oid.clone());
    } else {
        owned_args.push("--date-order".into());
        owned_args.push(format!("--skip={offset}"));
        owned_args.push(format!("--max-count={}", limit + 1));
        if scope == "all" {
            owned_args.push("--all".into());
            if has_head {
                owned_args.push("HEAD".into());
            }
        } else if let Some(ref rev) = scope_rev {
            owned_args.push(rev.clone());
        }
    }

    owned_args.push("--".into());
    if let Some(ref rel) = path {
        owned_args.push(rel.clone());
    }

    let arg_refs = owned_args.iter().map(String::as_str).collect::<Vec<_>>();
    let raw = run_search_git(repo, &arg_refs, regex_used)?;
    let mut commits = git::parse_log(&raw)?;

    let next_offset = if resolved_hash.is_none() && commits.len() > limit {
        commits.truncate(limit);
        Some(offset + limit)
    } else {
        None
    };
    let truncated = next_offset.is_some();

    Ok(SearchResult {
        commits,
        next_offset,
        truncated,
    })
}

pub fn match_diff(
    repo: &Repository,
    hash: &str,
    path: Option<&str>,
    code_query: Option<&str>,
    code_mode: Option<CodeSearchMode>,
) -> Result<SearchMatchDiff> {
    if !git::oid(hash) {
        return Err(GitError::new(
            "INVALID_COMMIT",
            "Selecciona un hash de commit completo.",
        ));
    }
    let clean_path = match path.map(str::trim).filter(|s| !s.is_empty()) {
        Some(rel) => {
            git::validate_rel_path(rel)?;
            Some(rel.to_string())
        }
        None => None,
    };
    let clean_code = clean_filter(code_query, "código")?;

    let mut owned_args: Vec<String> = vec![
        "diff-tree".into(),
        "-p".into(),
        "--root".into(),
        "--no-commit-id".into(),
        "--no-ext-diff".into(),
        "--no-textconv".into(),
        "--no-color".into(),
        "-U3".into(),
    ];
    let regex_used = clean_code.is_some() && code_mode == Some(CodeSearchMode::Regex);
    if let Some(ref code) = clean_code {
        match code_mode.unwrap_or(CodeSearchMode::Literal) {
            CodeSearchMode::Literal => owned_args.push(format!("-S{code}")),
            CodeSearchMode::Regex => owned_args.push(format!("-G{code}")),
        }
    }
    owned_args.push(hash.to_string());
    owned_args.push("--".into());
    if let Some(ref rel) = clean_path {
        owned_args.push(rel.clone());
    }

    let arg_refs = owned_args.iter().map(String::as_str).collect::<Vec<_>>();
    let bytes = run_search_git(repo, &arg_refs, regex_used)?;
    let text = String::from_utf8(bytes).map_err(|_| {
        GitError::new(
            "ENCODING",
            "El fragmento coincidente no es UTF-8 y no puede mostrarse sin pérdida.",
        )
    })?;

    Ok(SearchMatchDiff {
        hash: hash.to_string(),
        text,
    })
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

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "ravengit-search-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&root).unwrap();
            Self(root)
        }
        fn git(&self, args: &[&str], date: Option<&str>) -> String {
            let mut cmd = process::git(&self.0);
            cmd.args(args);
            if let Some(d) = date {
                cmd.env("GIT_AUTHOR_DATE", d).env("GIT_COMMITTER_DATE", d);
            }
            let out = process::execute(cmd, None, Duration::from_secs(15)).unwrap();
            assert!(
                out.success,
                "git {:?} failed: {}",
                args,
                String::from_utf8_lossy(&out.bytes)
            );
            String::from_utf8_lossy(&out.bytes).trim().to_string()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn searches_by_message_author_date_path_hash_and_regex() {
        let f = Fixture::new();
        f.git(&["init", "-b", "main"], None);
        f.git(&["config", "user.name", "Alice"], None);
        f.git(&["config", "user.email", "alice@example.com"], None);

        fs::write(f.0.join("core.rs"), "pub fn init() {}\n").unwrap();
        f.git(&["add", "--all"], None);
        f.git(
            &["commit", "-m", "feat: primer inicio"],
            Some("2026-01-10T10:00:00Z"),
        );
        let h1 = f.git(&["rev-parse", "HEAD"], None);

        fs::write(f.0.join("ui.tsx"), "export const UI = 1;\n").unwrap();
        f.git(&["add", "--all"], None);
        f.git(
            &[
                "commit",
                "--author",
                "Bob Dev <bob@example.com>",
                "-m",
                "fix(ui): corregir foco 42",
            ],
            Some("2026-03-15T12:00:00Z"),
        );
        let h2 = f.git(&["rev-parse", "HEAD"], None);

        let repo = Repository {
            id: "s1".into(),
            path: f.0.clone(),
        };

        assert_eq!(
            history(&repo, SearchQuery::default()).unwrap_err().code,
            "EMPTY_SEARCH"
        );

        let by_msg = history(
            &repo,
            SearchQuery {
                message: Some("foco".into()),
                ..SearchQuery::default()
            },
        )
        .unwrap();
        assert_eq!(by_msg.commits.len(), 1);
        assert_eq!(by_msg.commits[0].hash, h2);

        let by_author_date = history(
            &repo,
            SearchQuery {
                author: Some("Alice".into()),
                since: Some("2026-01-01".into()),
                until: Some("2026-02-01".into()),
                ..SearchQuery::default()
            },
        )
        .unwrap();
        assert_eq!(by_author_date.commits.len(), 1);
        assert_eq!(by_author_date.commits[0].hash, h1);

        let by_path = history(
            &repo,
            SearchQuery {
                path: Some("core.rs".into()),
                ..SearchQuery::default()
            },
        )
        .unwrap();
        assert_eq!(by_path.commits.len(), 1);
        assert_eq!(by_path.commits[0].hash, h1);

        let by_hash = history(
            &repo,
            SearchQuery {
                hash: Some(h1[..8].to_string()),
                ..SearchQuery::default()
            },
        )
        .unwrap();
        assert_eq!(by_hash.commits.len(), 1);
        assert_eq!(by_hash.commits[0].hash, h1);

        let by_regex = history(
            &repo,
            SearchQuery {
                message: Some(r"fix\(ui\):.*[0-9]{2}".into()),
                regex: true,
                ..SearchQuery::default()
            },
        )
        .unwrap();
        assert_eq!(by_regex.commits.len(), 1);
        assert_eq!(by_regex.commits[0].hash, h2);
    }

    #[test]
    fn searches_code_changes_with_pickaxe_and_regex_and_returns_matching_diff() {
        let f = Fixture::new();
        f.git(&["init", "-b", "main"], None);
        f.git(&["config", "user.name", "Alice"], None);
        f.git(&["config", "user.email", "alice@example.com"], None);

        fs::write(
            f.0.join("math.rs"),
            "pub fn sum(a: i32, b: i32) -> i32 { a + b }\n",
        )
        .unwrap();
        f.git(&["add", "--all"], None);
        f.git(&["commit", "-m", "add sum"], None);
        let h1 = f.git(&["rev-parse", "HEAD"], None);

        fs::write(
            f.0.join("math.rs"),
            "pub fn sum(a: i32, b: i32) -> i32 { a + b }\npub fn raven_token_42() -> &'static str { \"ok\" }\n",
        )
        .unwrap();
        f.git(&["add", "--all"], None);
        f.git(&["commit", "-m", "add token helper"], None);
        let h2 = f.git(&["rev-parse", "HEAD"], None);

        let repo = Repository {
            id: "s2".into(),
            path: f.0.clone(),
        };

        let pickaxe = history(
            &repo,
            SearchQuery {
                code_query: Some("raven_token_42".into()),
                code_mode: Some(CodeSearchMode::Literal),
                ..SearchQuery::default()
            },
        )
        .unwrap();
        assert_eq!(pickaxe.commits.len(), 1);
        assert_eq!(pickaxe.commits[0].hash, h2);

        let regex_code = history(
            &repo,
            SearchQuery {
                code_query: Some(r"raven_token_[0-9]+".into()),
                code_mode: Some(CodeSearchMode::Regex),
                ..SearchQuery::default()
            },
        )
        .unwrap();
        assert_eq!(regex_code.commits.len(), 1);
        assert_eq!(regex_code.commits[0].hash, h2);

        let preview = match_diff(
            &repo,
            &h2,
            None,
            Some("raven_token_42"),
            Some(CodeSearchMode::Literal),
        )
        .unwrap();
        assert_eq!(preview.hash, h2);
        assert!(preview.text.contains("+pub fn raven_token_42()"));
        assert_ne!(preview.hash, h1);
    }
}
