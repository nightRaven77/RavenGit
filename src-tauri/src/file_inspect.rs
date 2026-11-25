//! Local file history (`--follow`) and line-by-line Git blame inspection.
//! Read-only commands with explicit argv arrays, path validation and output caps.
use crate::{
    git::{self, Commit, GitError, Repository, Result},
    process,
};
use serde::Serialize;
use std::{collections::HashMap, time::Duration};

const MAX_OUTPUT: usize = 2 * 1024 * 1024;
const MAX_BLAME_FILE_BYTES: u64 = 1_048_576;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileHistoryEntry {
    pub commit: Commit,
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileHistoryPage {
    pub path: String,
    pub entries: Vec<FileHistoryEntry>,
    pub next_offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub line_number: usize,
    pub hash: String,
    pub author: String,
    pub date: String,
    pub summary: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileBlame {
    pub path: String,
    pub commit: String,
    pub lines: Vec<BlameLine>,
}

fn run_inspect(
    repo: &Repository,
    args: &[&str],
    fail_code: &'static str,
    fail_msg: &str,
) -> Result<Vec<u8>> {
    let mut command = process::git(&repo.path);
    command.args(args).env("GIT_OPTIONAL_LOCKS", "0");
    let output =
        process::execute(command, None, Duration::from_secs(20)).map_err(|err| match err {
            process::Error::Start => GitError::new(
                "GIT_UNAVAILABLE",
                "No se pudo iniciar Git para inspeccionar el archivo.",
            ),
            _ => GitError::new(
                "TIMEOUT",
                "La inspección del archivo excedió el tiempo permitido.",
            ),
        })?;
    if output.bytes.len() > MAX_OUTPUT {
        return Err(GitError::new(
            "OUTPUT_LIMIT",
            "La salida supera 2 MiB y no se muestra truncada.",
        ));
    }
    if output.success {
        Ok(output.bytes)
    } else {
        Err(GitError::new(fail_code, fail_msg))
    }
}

fn resolve_revision(repo: &Repository, revision: Option<&str>) -> Result<Option<String>> {
    let trimmed = revision.map(str::trim).filter(|s| !s.is_empty());
    match trimmed {
        None | Some("HEAD") => {
            if let Ok(head) = git::text(&repo.path, &["rev-parse", "--verify", "HEAD"]) {
                Ok(Some(head.trim().to_string()))
            } else {
                Ok(None)
            }
        }
        Some(rev) => {
            if !git::oid(rev) {
                return Err(GitError::new(
                    "INVALID_COMMIT",
                    "Selecciona un hash de commit completo.",
                ));
            }
            let spec = format!("{rev}^{{commit}}");
            let resolved = git::text(
                &repo.path,
                &["rev-parse", "--verify", "--end-of-options", &spec],
            )
            .map_err(|_| {
                GitError::new(
                    "INVALID_COMMIT",
                    "El commit indicado no existe en el repositorio.",
                )
            })?;
            Ok(Some(resolved.trim().to_string()))
        }
    }
}

pub fn file_history(
    repo: &Repository,
    path: &str,
    revision: Option<&str>,
    offset: usize,
    limit: usize,
) -> Result<FileHistoryPage> {
    let clean_path = path.trim();
    git::validate_rel_path(clean_path)?;
    let Some(resolved_rev) = resolve_revision(repo, revision)? else {
        return Ok(FileHistoryPage {
            path: clean_path.to_string(),
            entries: vec![],
            next_offset: None,
        });
    };

    let page_limit = limit.clamp(1, 200);
    let page_offset = offset.min(100_000);
    // Walk from the tip without `--skip` so Git's `--follow` rename tracking visits every rename commit.
    let fetch_limit = page_offset.saturating_add(page_limit).saturating_add(1);
    let limit_arg = format!("--max-count={fetch_limit}");

    let raw = run_inspect(
        repo,
        &[
            "log",
            "--follow",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "--no-show-signature",
            "--no-decorate",
            "-M",
            "-z",
            "--name-status",
            "--format=%x1e%H%x00%P%x00%an%x00%aI%x00%s",
            &limit_arg,
            &resolved_rev,
            "--",
            clean_path,
        ],
        "FILE_HISTORY_FAILED",
        "Git no pudo leer el historial de este archivo.",
    )?;

    let text = String::from_utf8(raw).map_err(|_| {
        GitError::new(
            "ENCODING",
            "El historial del archivo contiene secuencias no UTF-8.",
        )
    })?;

    let mut entries = Vec::new();
    for record in text.split('\x1e') {
        if record.trim().is_empty() {
            continue;
        }
        let tokens: Vec<&str> = record.split('\0').collect();
        if tokens.len() < 5 {
            continue;
        }
        let hash = tokens[0].trim();
        if !git::oid(hash) {
            return Err(GitError::new(
                "PARSE",
                "Identificador Git inválido en el historial del archivo.",
            ));
        }
        let parents: Vec<String> = tokens[1]
            .split_whitespace()
            .filter(|p| git::oid(p))
            .map(String::from)
            .collect();
        let author = tokens[2].to_string();
        let date = tokens[3].to_string();
        let subject = tokens[4].trim_end_matches(['\r', '\n']).to_string();

        let rest: Vec<&str> = tokens[5..]
            .iter()
            .copied()
            .filter(|t| !t.trim().is_empty())
            .collect();
        let (status, old_path, entry_path) = if let Some(raw_status) = rest.first() {
            let trimmed_status = raw_status.trim();
            let kind = trimmed_status.chars().next().unwrap_or('M');
            let status_code = kind.to_string();
            if (kind == 'R' || kind == 'C') && rest.len() >= 3 {
                (status_code, Some(rest[1].to_string()), rest[2].to_string())
            } else if rest.len() >= 2 {
                (status_code, None, rest[1].to_string())
            } else {
                (status_code, None, clean_path.to_string())
            }
        } else {
            ("M".to_string(), None, clean_path.to_string())
        };

        entries.push(FileHistoryEntry {
            commit: Commit {
                hash: hash.to_string(),
                parents,
                author,
                date,
                subject,
            },
            path: entry_path,
            old_path,
            status,
        });
    }

    let has_more = entries.len() > page_offset.saturating_add(page_limit);
    let paged = entries
        .into_iter()
        .skip(page_offset)
        .take(page_limit)
        .collect();
    let next_offset = if has_more {
        Some(page_offset + page_limit)
    } else {
        None
    };

    Ok(FileHistoryPage {
        path: clean_path.to_string(),
        entries: paged,
        next_offset,
    })
}

fn format_unix_date(secs: i64) -> String {
    let days = secs.div_euclid(86_400) + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let doe = days - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    format!("{year:04}-{m:02}-{d:02}")
}

/// Pure parser for `git blame --porcelain` output.
pub fn parse_blame_porcelain(raw: &str) -> Result<Vec<BlameLine>> {
    #[derive(Default, Clone)]
    struct CommitMeta {
        author: String,
        date: String,
        summary: String,
    }

    let mut cache: HashMap<String, CommitMeta> = HashMap::new();
    let mut lines = Vec::new();
    let mut current_hash: Option<String> = None;
    let mut current_line_no: usize = 0;

    for raw_line in raw.lines() {
        if let Some(content) = raw_line.strip_prefix('\t') {
            let hash = current_hash.take().unwrap_or_default();
            let meta = cache.get(&hash).cloned().unwrap_or_default();
            lines.push(BlameLine {
                line_number: current_line_no,
                hash,
                author: meta.author,
                date: meta.date,
                summary: meta.summary,
                content: content.trim_end_matches('\r').to_string(),
            });
            continue;
        }

        if current_hash.is_none() {
            let mut parts = raw_line.split_whitespace();
            if let (Some(oid_part), Some(_orig), Some(final_no)) =
                (parts.next(), parts.next(), parts.next())
                && git::oid(oid_part)
                && let Ok(num) = final_no.parse::<usize>()
            {
                current_hash = Some(oid_part.to_string());
                current_line_no = num;
                cache.entry(oid_part.to_string()).or_default();
            }
            continue;
        }

        if let Some(ref hash) = current_hash {
            let entry = cache.entry(hash.clone()).or_default();
            if let Some(author) = raw_line.strip_prefix("author ") {
                entry.author = author.to_string();
            } else if let Some(ts) = raw_line.strip_prefix("author-time ") {
                if let Ok(secs) = ts.trim().parse::<i64>() {
                    entry.date = format_unix_date(secs);
                }
            } else if let Some(summary) = raw_line.strip_prefix("summary ") {
                entry.summary = summary.to_string();
            }
        }
    }

    Ok(lines)
}

pub fn file_blame(repo: &Repository, path: &str, revision: Option<&str>) -> Result<FileBlame> {
    let clean_path = path.trim();
    git::validate_rel_path(clean_path)?;
    let Some(resolved_rev) = resolve_revision(repo, revision)? else {
        return Err(GitError::new(
            "FILE_NOT_FOUND",
            "Este repositorio todavía no tiene commits para consultar Blame.",
        ));
    };

    let spec = format!("{resolved_rev}:{clean_path}");
    let size_text = git::text(&repo.path, &["cat-file", "-s", &spec])
        .map_err(|_| GitError::new("FILE_NOT_FOUND", "El archivo no existe en este commit."))?;
    let size_bytes = size_text.trim().parse::<u64>().unwrap_or(0);
    if size_bytes > MAX_BLAME_FILE_BYTES {
        return Err(GitError::new(
            "BLAME_TOO_LARGE",
            "El archivo supera 1 MiB y no se analiza línea por línea.",
        ));
    }

    let raw = run_inspect(
        repo,
        &["blame", "--porcelain", &resolved_rev, "--", clean_path],
        "BLAME_FAILED",
        "Git no pudo generar el análisis Blame para este archivo.",
    )?;
    let text = String::from_utf8(raw).map_err(|_| {
        GitError::new(
            "ENCODING",
            "El archivo no es UTF-8 válido para mostrar Blame.",
        )
    })?;
    let lines = parse_blame_porcelain(&text)?;

    Ok(FileBlame {
        path: clean_path.to_string(),
        commit: resolved_rev,
        lines,
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
                "ravengit-inspect-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&root).unwrap();
            Self(root)
        }
        fn git(&self, args: &[&str]) -> String {
            let mut cmd = process::git(&self.0);
            cmd.args(args);
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
    fn follows_file_history_across_renames_and_paginates() {
        let f = Fixture::new();
        f.git(&["init", "-b", "main"]);
        f.git(&["config", "user.name", "Alice"]);
        f.git(&["config", "user.email", "alice@example.com"]);

        fs::write(f.0.join("antes.txt"), "linea 1\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "create antes"]);
        let h1 = f.git(&["rev-parse", "HEAD"]);

        fs::write(f.0.join("antes.txt"), "linea 1\nlinea 2\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "edit antes"]);
        let h2 = f.git(&["rev-parse", "HEAD"]);

        f.git(&["mv", "antes.txt", "despues.txt"]);
        f.git(&["commit", "-m", "rename to despues"]);
        let h3 = f.git(&["rev-parse", "HEAD"]);

        fs::write(f.0.join("despues.txt"), "linea 1\nlinea 2\nlinea 3\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "edit despues"]);
        let h4 = f.git(&["rev-parse", "HEAD"]);

        let repo = Repository {
            id: "fi-1".into(),
            path: f.0.clone(),
        };

        let page1 = file_history(&repo, "despues.txt", None, 0, 2).unwrap();
        assert_eq!(page1.entries.len(), 2);
        assert_eq!(page1.next_offset, Some(2));
        assert_eq!(page1.entries[0].commit.hash, h4);
        assert_eq!(page1.entries[0].path, "despues.txt");
        assert_eq!(page1.entries[1].commit.hash, h3);
        assert_eq!(page1.entries[1].status, "R");
        assert_eq!(page1.entries[1].old_path.as_deref(), Some("antes.txt"));
        assert_eq!(page1.entries[1].path, "despues.txt");

        let page2 = file_history(&repo, "despues.txt", None, 2, 2).unwrap();
        assert_eq!(page2.entries.len(), 2);
        assert_eq!(page2.next_offset, None);
        assert_eq!(page2.entries[0].commit.hash, h2);
        assert_eq!(page2.entries[0].path, "antes.txt");
        assert_eq!(page2.entries[1].commit.hash, h1);
    }

    #[test]
    fn parses_git_blame_porcelain_across_multiple_commits() {
        let f = Fixture::new();
        f.git(&["init", "-b", "main"]);
        f.git(&["config", "user.name", "Alice"]);
        f.git(&["config", "user.email", "alice@example.com"]);

        fs::write(f.0.join("code.rs"), "fn alpha() {}\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "add alpha"]);
        let h1 = f.git(&["rev-parse", "HEAD"]);

        fs::write(f.0.join("code.rs"), "fn alpha() {}\nfn beta() {}\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&[
            "commit",
            "--author",
            "Bob <bob@example.com>",
            "-m",
            "add beta",
        ]);
        let h2 = f.git(&["rev-parse", "HEAD"]);

        let repo = Repository {
            id: "fi-2".into(),
            path: f.0.clone(),
        };

        let blame = file_blame(&repo, "code.rs", None).unwrap();
        assert_eq!(blame.commit, h2);
        assert_eq!(blame.lines.len(), 2);
        assert_eq!(blame.lines[0].line_number, 1);
        assert_eq!(blame.lines[0].hash, h1);
        assert_eq!(blame.lines[0].author, "Alice");
        assert_eq!(blame.lines[0].summary, "add alpha");
        assert_eq!(blame.lines[0].content, "fn alpha() {}");

        assert_eq!(blame.lines[1].line_number, 2);
        assert_eq!(blame.lines[1].hash, h2);
        assert_eq!(blame.lines[1].author, "Bob");
        assert_eq!(blame.lines[1].summary, "add beta");
        assert_eq!(blame.lines[1].content, "fn beta() {}");
    }
}
