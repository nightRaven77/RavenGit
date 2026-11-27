use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    time::Duration,
};

const MAX_OUTPUT: usize = 2 * 1024 * 1024;
const PAGE_SIZE: usize = 200;
#[derive(Debug, Serialize)]
pub struct GitError {
    pub code: &'static str,
    pub message: String,
}
impl GitError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}
pub type Result<T> = std::result::Result<T, GitError>;

// Local reads only. Callers must authorize operations that can run configured filters.
pub(crate) fn run(path: &Path, args: &[&str]) -> Result<Vec<u8>> {
    let mut command = crate::process::git(path);
    command.args(args).env("GIT_OPTIONAL_LOCKS", "0");
    let output =
        crate::process::execute(command, None, Duration::from_secs(15)).map_err(|e| match e {
            crate::process::Error::Start => GitError::new(
                "GIT_UNAVAILABLE",
                "No se pudo iniciar Git de forma controlada. Comprueba su instalación, PATH y las restricciones de procesos del sistema.",
            ),
            _ => GitError::new(
                "TIMEOUT",
                "La lectura de Git o sus procesos auxiliares excedió el tiempo permitido.",
            ),
        })?;
    if output.bytes.len() > MAX_OUTPUT {
        return Err(GitError::new(
            "OUTPUT_LIMIT",
            "La salida supera 2 MiB. No se muestra un resultado truncado.",
        ));
    }
    if output.success {
        Ok(output.bytes)
    } else {
        Err(GitError::new(
            "GIT_READ_FAILED",
            "Git no pudo completar la lectura local. Revisa permisos e integridad del repositorio. Si faltan objetos de un clon parcial, recupéralos explícitamente desde Git; esta lectura no los descarga.",
        ))
    }
}
pub(crate) fn text(path: &Path, args: &[&str]) -> Result<String> {
    String::from_utf8(run(path, args)?).map_err(|_| {
        GitError::new(
            "ENCODING",
            "Esta salida no es UTF-8. El prototipo no la convertirá con pérdida.",
        )
    })
}
pub(crate) fn oid(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|v| v.is_ascii_hexdigit())
}
#[derive(Clone, Debug)]
pub struct Repository {
    pub id: String,
    pub path: PathBuf,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub date: String,
    pub subject: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRef {
    pub name: String,
    pub hash: String,
    pub kind: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub path: String,
    pub name: String,
    pub trusted: bool,
    pub head: Option<String>,
    pub branch: Option<String>,
    pub shallow: bool,
    pub refs: Vec<GitRef>,
    pub page: HistoryPage,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub commits: Vec<Commit>,
    pub next_offset: Option<usize>,
    pub generation: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDiff {
    pub hash: String,
    pub text: String,
    pub parent: Option<String>,
    pub parent_count: usize,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
    pub binary: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitFiles {
    pub hash: String,
    pub parent: Option<String>,
    pub parent_count: usize,
    pub files: Vec<CommitFile>,
}

pub fn open(path: &Path, id: String) -> Result<(Repository, Snapshot)> {
    let path = path
        .canonicalize()
        .map_err(|_| GitError::new("PATH_INVALID", "La carpeta no existe o no es accesible."))?;
    if !path.is_dir() {
        return Err(GitError::new("PATH_INVALID", "Selecciona una carpeta."));
    }
    let git_root = text(&path,&["rev-parse","--show-toplevel"])
        .map_err(|error| if error.code == "GIT_READ_FAILED" { GitError::new("NOT_WORKTREE", "Selecciona un repositorio Git con árbol de trabajo. Los repositorios bare no se admiten aún.") } else { error })?;
    let path = PathBuf::from(git_root.strip_suffix('\n').unwrap_or(&git_root));
    let repo = Repository { id, path };
    let snapshot = snapshot(&repo)?;
    Ok((repo, snapshot))
}
fn generation(path: &Path) -> Result<String> {
    if let Some(fast) = crate::gix_engine::generation(path) {
        return Ok(fast);
    }
    // Includes all refs (including unreachable-by-HEAD branches), tags, detached HEAD and current branch name.
    let refs = text(path, &["for-each-ref", "--format=%(objectname) %(refname)"])?;
    let head = text(path, &["rev-parse", "--verify", "HEAD"]).unwrap_or_default();
    let branch = text(path, &["symbolic-ref", "--quiet", "--short", "HEAD"]).unwrap_or_default();
    let mut hash = 14695981039346656037u64;
    for byte in refs.bytes().chain(head.bytes()).chain(branch.bytes()) {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(1099511628211);
    }
    Ok(format!("{hash:016x}"))
}
pub fn snapshot(repo: &Repository) -> Result<Snapshot> {
    snapshot_scoped(repo, None)
}
pub fn snapshot_scoped(repo: &Repository, scope: Option<&str>) -> Result<Snapshot> {
    if let Some(fast) = crate::gix_engine::snapshot_scoped(repo, scope) {
        return fast;
    }
    let before = generation(&repo.path)?;
    let head = text(&repo.path, &["rev-parse", "--verify", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string());
    let branch = text(&repo.path, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string());
    let shallow = text(&repo.path, &["rev-parse", "--is-shallow-repository"])?.trim() == "true";
    let raw = text(
        &repo.path,
        &[
            "for-each-ref",
            "--format=%(objectname)%00%(*objectname)%00%(refname)",
        ],
    )?;
    let refs = raw
        .lines()
        .filter_map(|line| {
            let f: Vec<_> = line.split('\0').collect();
            if f.len() != 3 {
                return None;
            }
            let kind = if f[2].starts_with("refs/heads/") {
                "branch"
            } else if f[2].starts_with("refs/remotes/") {
                "remote"
            } else if f[2].starts_with("refs/tags/") {
                "tag"
            } else {
                "other"
            };
            Some(GitRef {
                name: f[2].to_string(),
                hash: if f[1].is_empty() { f[0] } else { f[1] }.to_string(),
                kind: kind.to_string(),
            })
        })
        .collect();
    let page = if scope.is_none() {
        history(repo, 0, &before)?
    } else {
        history_scoped(repo, 0, &before, scope)?
    };
    Ok(Snapshot {
        id: repo.id.clone(),
        path: repo.path.to_string_lossy().into_owned(),
        name: repo
            .path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        trusted: false,
        head,
        branch,
        shallow,
        refs,
        page,
    })
}
pub(crate) fn parse_log(raw: &[u8]) -> Result<Vec<Commit>> {
    if raw.is_empty() {
        return Ok(vec![]);
    }
    let content = String::from_utf8(raw.to_vec())
        .map_err(|_| GitError::new("ENCODING", "El historial no pudo leerse como UTF-8."))?;
    let fields: Vec<&str> = content
        .strip_suffix('\0')
        .unwrap_or(&content)
        .split('\0')
        .collect();
    if !fields.len().is_multiple_of(5) {
        return Err(GitError::new("PARSE", "Formato de historial inesperado."));
    }
    fields
        .as_chunks::<5>()
        .0
        .iter()
        .map(|f| {
            if !oid(f[0]) || !f[1].split_whitespace().all(oid) {
                return Err(GitError::new(
                    "PARSE",
                    "Identificador Git inválido en historial.",
                ));
            }
            Ok(Commit {
                hash: f[0].into(),
                parents: f[1].split_whitespace().map(String::from).collect(),
                author: f[2].into(),
                date: f[3].into(),
                subject: f[4].into(),
            })
        })
        .collect()
}
pub fn history(repo: &Repository, offset: usize, expected: &str) -> Result<HistoryPage> {
    history_scoped(repo, offset, expected, None)
}
pub fn history_scoped(
    repo: &Repository,
    offset: usize,
    expected: &str,
    scope: Option<&str>,
) -> Result<HistoryPage> {
    if let Some(fast) = crate::gix_engine::history_scoped(repo, offset, expected, scope) {
        return fast;
    }
    let scope = scope.unwrap_or("all");
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
    let before = generation(&repo.path)?;
    let scoped_generation = if scope == "all" {
        before.clone()
    } else {
        format!("{before}|{scope}")
    };
    if expected != scoped_generation && !(offset == 0 && expected == before) {
        return Err(GitError::new(
            "STALE_HISTORY",
            "El historial cambió fuera de RavenGit. Actualiza antes de cargar más.",
        ));
    }
    // An unborn repository has no HEAD or refs, so `log` would fail.
    let has_head = text(&repo.path, &["rev-parse", "--verify", "HEAD"]).is_ok();
    let has_refs = !text(
        &repo.path,
        &["for-each-ref", "--count=1", "--format=%(refname)"],
    )?
    .is_empty();
    let revision = if scope == "all" || (scope == "HEAD" && !has_head) {
        None
    } else {
        if scope != "HEAD" {
            // Verify the exact ref, rather than accepting revision expressions or prefix matches.
            text(&repo.path, &["check-ref-format", scope])?;
            text(&repo.path, &["show-ref", "--verify", scope]).map_err(|_| {
                GitError::new(
                    "INVALID_SCOPE",
                    "La rama seleccionada ya no existe. Selecciona otra referencia.",
                )
            })?;
        }
        Some(
            text(
                &repo.path,
                &[
                    "rev-parse",
                    "--verify",
                    "--end-of-options",
                    &format!("{scope}^{{commit}}"),
                ],
            )?
            .trim()
            .to_string(),
        )
    };
    let mut commits = if (!has_head && !has_refs) || (scope == "HEAD" && !has_head) {
        vec![]
    } else {
        let skip = format!("--skip={offset}");
        let limit = format!("--max-count={}", PAGE_SIZE + 1);
        let mut args = vec![
            "log",
            "--topo-order",
            "--no-show-signature",
            "--no-decorate",
            "-z",
            "--format=%H%x00%P%x00%an%x00%aI%x00%s",
            &skip,
            &limit,
        ];
        if scope == "all" {
            args.push("--all");
            if has_head {
                args.push("HEAD");
            }
        } else if let Some(ref revision) = revision {
            args.push(revision);
        }
        args.push("--");
        parse_log(&run(&repo.path, &args)?)?
    };
    if generation(&repo.path)? != before {
        return Err(GitError::new(
            "STALE_HISTORY",
            "Las referencias cambiaron durante la lectura. Actualiza el historial.",
        ));
    }
    let next_offset = if commits.len() > PAGE_SIZE {
        commits.truncate(PAGE_SIZE);
        Some(offset + PAGE_SIZE)
    } else {
        None
    };
    Ok(HistoryPage {
        commits,
        next_offset,
        generation: scoped_generation,
    })
}
pub(crate) fn validate_rel_path(path: &str) -> Result<()> {
    if path.is_empty()
        || path.len() > 4096
        || path.contains('\0')
        || path.starts_with('/')
        || path.starts_with('\\')
    {
        return Err(GitError::new("INVALID_PATH", "Ruta de archivo inválida."));
    }
    if Path::new(path).components().any(|component| {
        matches!(
            component,
            std::path::Component::ParentDir
                | std::path::Component::Prefix(_)
                | std::path::Component::RootDir
        )
    }) {
        return Err(GitError::new("INVALID_PATH", "Ruta de archivo inválida."));
    }
    Ok(())
}
pub(crate) fn resolve_parent(
    repo: &Repository,
    hash: &str,
    parent_index: usize,
) -> Result<(Option<String>, usize)> {
    if !oid(hash) {
        return Err(GitError::new(
            "INVALID_COMMIT",
            "Selecciona un hash de commit completo.",
        ));
    }
    let parent_text = text(
        &repo.path,
        &["rev-list", "--parents", "-n", "1", hash, "--"],
    )?;
    let parents: Vec<&str> = parent_text.split_whitespace().skip(1).collect();
    let parent = if parents.is_empty() {
        if parent_index != 0 {
            return Err(GitError::new(
                "INVALID_PARENT",
                "El commit raíz no tiene padres.",
            ));
        }
        None
    } else {
        Some(
            (*parents.get(parent_index).ok_or_else(|| {
                GitError::new("INVALID_PARENT", "El padre seleccionado no existe.")
            })?)
            .to_string(),
        )
    };
    Ok((parent, parents.len()))
}
fn split_nul_records(raw: &[u8]) -> Result<Vec<String>> {
    if raw.is_empty() {
        return Ok(Vec::new());
    }
    let trimmed = raw.strip_suffix(b"\0").unwrap_or(raw);
    trimmed
        .split(|byte| *byte == 0)
        .map(|slice| {
            String::from_utf8(slice.to_vec()).map_err(|_| {
                GitError::new(
                    "ENCODING",
                    "Hay rutas modificadas que no son UTF-8 válidas.",
                )
            })
        })
        .collect()
}
fn parse_commit_files(name_status: &[u8], numstat: &[u8]) -> Result<Vec<CommitFile>> {
    use std::collections::HashMap;
    let mut stats: HashMap<String, (Option<u64>, Option<u64>, bool)> = HashMap::new();
    let stat_tokens = split_nul_records(numstat)?;
    let mut i = 0;
    while i < stat_tokens.len() {
        let token = &stat_tokens[i];
        let Some(first_tab) = token.find('\t') else {
            i += 1;
            continue;
        };
        let rest_after_first = &token[first_tab + 1..];
        let Some(second_tab_rel) = rest_after_first.find('\t') else {
            i += 1;
            continue;
        };
        let add_str = &token[..first_tab];
        let del_str = &rest_after_first[..second_tab_rel];
        let path_part = &rest_after_first[second_tab_rel + 1..];
        let binary = add_str == "-" || del_str == "-";
        let additions = if binary {
            None
        } else {
            add_str.parse::<u64>().ok()
        };
        let deletions = if binary {
            None
        } else {
            del_str.parse::<u64>().ok()
        };
        if path_part.is_empty() {
            // `-z` rename/copy entry: `<add>\t<del>\t\0<old_path>\0<new_path>\0`
            if i + 2 < stat_tokens.len() {
                let new_path = stat_tokens[i + 2].clone();
                stats.insert(new_path, (additions, deletions, binary));
                i += 3;
            } else {
                break;
            }
        } else {
            stats.insert(path_part.to_string(), (additions, deletions, binary));
            i += 1;
        }
    }

    let status_tokens = split_nul_records(name_status)?;
    let mut files = Vec::new();
    let mut j = 0;
    while j < status_tokens.len() {
        let raw_status = &status_tokens[j];
        let kind = raw_status.chars().next().unwrap_or('M');
        let status = kind.to_string();
        if kind == 'R' || kind == 'C' {
            if j + 2 >= status_tokens.len() {
                break;
            }
            let old_path = status_tokens[j + 1].clone();
            let path = status_tokens[j + 2].clone();
            let (additions, deletions, binary) =
                stats.get(&path).copied().unwrap_or((None, None, false));
            files.push(CommitFile {
                path,
                old_path: Some(old_path),
                status,
                additions,
                deletions,
                binary,
            });
            j += 3;
        } else {
            if j + 1 >= status_tokens.len() {
                break;
            }
            let path = status_tokens[j + 1].clone();
            let (additions, deletions, binary) =
                stats.get(&path).copied().unwrap_or((None, None, false));
            files.push(CommitFile {
                path,
                old_path: None,
                status,
                additions,
                deletions,
                binary,
            });
            j += 2;
        }
    }
    Ok(files)
}
pub fn commit_files(repo: &Repository, hash: &str, parent_index: usize) -> Result<CommitFiles> {
    let (parent, parent_count) = resolve_parent(repo, hash, parent_index)?;
    let (name_status, numstat) = if let Some(ref p) = parent {
        (
            run(
                &repo.path,
                &[
                    "diff",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--no-color",
                    "-M",
                    "-z",
                    "--name-status",
                    p,
                    hash,
                    "--",
                ],
            )?,
            run(
                &repo.path,
                &[
                    "diff",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--no-color",
                    "-M",
                    "-z",
                    "--numstat",
                    p,
                    hash,
                    "--",
                ],
            )?,
        )
    } else {
        (
            run(
                &repo.path,
                &[
                    "diff-tree",
                    "--root",
                    "--no-commit-id",
                    "-r",
                    "--no-ext-diff",
                    "--no-textconv",
                    "-M",
                    "-z",
                    "--name-status",
                    hash,
                    "--",
                ],
            )?,
            run(
                &repo.path,
                &[
                    "diff-tree",
                    "--root",
                    "--no-commit-id",
                    "-r",
                    "--no-ext-diff",
                    "--no-textconv",
                    "-M",
                    "-z",
                    "--numstat",
                    hash,
                    "--",
                ],
            )?,
        )
    };
    let files = parse_commit_files(&name_status, &numstat)?;
    Ok(CommitFiles {
        hash: hash.to_string(),
        parent,
        parent_count,
        files,
    })
}
#[cfg(test)]
pub fn diff(repo: &Repository, hash: &str, parent_index: usize) -> Result<CommitDiff> {
    diff_with_options(repo, hash, parent_index, None, None, false, 3)
}
pub fn diff_with_options(
    repo: &Repository,
    hash: &str,
    parent_index: usize,
    path: Option<&str>,
    old_path: Option<&str>,
    ignore_whitespace: bool,
    context_lines: usize,
) -> Result<CommitDiff> {
    if let Some(target) = path {
        validate_rel_path(target)?;
    }
    if let Some(source) = old_path {
        validate_rel_path(source)?;
    }
    if old_path.is_some() && path.is_none() {
        return Err(GitError::new("INVALID_PATH", "Ruta de archivo inválida."));
    }
    let (parent, parent_count) = resolve_parent(repo, hash, parent_index)?;
    let unified = format!("--unified={}", context_lines.min(50));
    let mut args: Vec<&str> = Vec::new();
    if path.is_some() {
        args.push("--literal-pathspecs");
    }
    if let Some(ref p) = parent {
        args.extend([
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            if old_path.is_some() {
                "-M"
            } else {
                "--no-renames"
            },
            &unified,
        ]);
        if ignore_whitespace {
            args.push("-w");
        }
        args.push(p);
        args.push(hash);
    } else {
        args.extend([
            "show",
            "--format=",
            "--root",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            if old_path.is_some() {
                "-M"
            } else {
                "--no-renames"
            },
            &unified,
        ]);
        if ignore_whitespace {
            args.push("-w");
        }
        args.push(hash);
    }
    args.push("--");
    if let Some(target) = path {
        if let Some(source) = old_path {
            args.push(source);
        }
        args.push(target);
    }
    let output = text(&repo.path, &args)?;
    Ok(CommitDiff {
        hash: hash.to_string(),
        text: output,
        parent,
        parent_count,
    })
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RangeFiles {
    pub base: String,
    pub target: String,
    pub files: Vec<CommitFile>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RangeDiff {
    pub base: String,
    pub target: String,
    pub text: String,
}

pub fn range_files(repo: &Repository, base: &str, target: &str) -> Result<RangeFiles> {
    if !oid(base) || !oid(target) {
        return Err(GitError::new(
            "INVALID_COMMIT",
            "Selecciona dos hashes de commit completos para comparar.",
        ));
    }
    let name_status = run(
        &repo.path,
        &[
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "-M",
            "-z",
            "--name-status",
            base,
            target,
            "--",
        ],
    )?;
    let numstat = run(
        &repo.path,
        &[
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "-M",
            "-z",
            "--numstat",
            base,
            target,
            "--",
        ],
    )?;
    let files = parse_commit_files(&name_status, &numstat)?;
    Ok(RangeFiles {
        base: base.to_string(),
        target: target.to_string(),
        files,
    })
}

pub fn range_diff(
    repo: &Repository,
    base: &str,
    target: &str,
    path: Option<&str>,
    old_path: Option<&str>,
    ignore_whitespace: bool,
    context_lines: usize,
) -> Result<RangeDiff> {
    if !oid(base) || !oid(target) {
        return Err(GitError::new(
            "INVALID_COMMIT",
            "Selecciona dos hashes de commit completos para comparar.",
        ));
    }
    if let Some(file_path) = path {
        validate_rel_path(file_path)?;
    }
    if let Some(source) = old_path {
        validate_rel_path(source)?;
    }
    if old_path.is_some() && path.is_none() {
        return Err(GitError::new("INVALID_PATH", "Ruta de archivo inválida."));
    }
    let unified = format!("--unified={}", context_lines.min(50));
    let mut args: Vec<&str> = Vec::new();
    if path.is_some() {
        args.push("--literal-pathspecs");
    }
    args.extend([
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        if old_path.is_some() {
            "-M"
        } else {
            "--no-renames"
        },
        &unified,
    ]);
    if ignore_whitespace {
        args.push("-w");
    }
    args.extend([base, target, "--"]);
    if let Some(file_path) = path {
        if let Some(source) = old_path {
            args.push(source);
        }
        args.push(file_path);
    }
    let output = text(&repo.path, &args)?;
    Ok(RangeDiff {
        base: base.to_string(),
        target: target.to_string(),
        text: output,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        sync::atomic::{AtomicUsize, Ordering},
    };
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let p = std::env::temp_dir().join(format!(
                "ravengit-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&p).unwrap();
            let f = Self(p);
            f.git(&["init", "-b", "main"]);
            f.git(&["config", "user.name", "RavenGit Fixture"]);
            f.git(&["config", "user.email", "fixture@example.invalid"]);
            f.git(&["config", "commit.gpgsign", "false"]);
            f.git(&["config", "core.autocrlf", "false"]);
            f.git(&[
                "config",
                "core.hooksPath",
                f.0.join(".git/no-hooks").to_str().unwrap(),
            ]);
            f
        }
        fn git(&self, args: &[&str]) -> String {
            text(&self.0, args).unwrap()
        }
        fn commit(&self, file: &str, value: &str, msg: &str) {
            fs::write(self.0.join(file), value).unwrap();
            self.git(&["add", "--all"]);
            self.git(&["commit", "-m", msg]);
        }
        fn repo(&self) -> Repository {
            Repository {
                id: "fixture".into(),
                path: self.0.clone(),
            }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn empty_repository_and_invalid_path() {
        let f = Fixture::new();
        let (_, s) = open(&f.0, "x".into()).unwrap();
        assert!(s.page.commits.is_empty());
        assert_eq!(s.branch.as_deref(), Some("main"));
        assert!(open(&f.0.join("missing"), "x".into()).is_err());
    }
    #[test]
    fn dag_merge_tag_and_detached_head() {
        let f = Fixture::new();
        f.commit("base", "base", "raíz");
        f.git(&["switch", "-c", "feature"]);
        f.commit("feature", "f", "rama");
        f.git(&["switch", "main"]);
        f.commit("main", "m", "principal");
        f.git(&["merge", "--no-ff", "feature", "-m", "integración"]);
        f.git(&["tag", "-a", "v-fixture", "-m", "tag"]);
        f.git(&["switch", "--detach", "HEAD"]);
        let s = snapshot(&f.repo()).unwrap();
        assert!(s.branch.is_none());
        assert_eq!(s.page.commits.len(), 4);
        assert_eq!(s.page.commits[0].parents.len(), 2);
        assert!(
            s.refs
                .iter()
                .any(|r| r.kind == "tag" && Some(&r.hash) == s.head.as_ref())
        );
        let d = diff(&f.repo(), s.head.as_ref().unwrap(), 1).unwrap();
        assert_eq!(d.parent_count, 2);
        assert_eq!(d.parent.as_ref(), s.page.commits[0].parents.get(1));
    }
    #[test]
    fn diff_root_unicode_and_no_mutation() {
        let f = Fixture::new();
        f.commit("archivo ü.txt", "contenido\n", "primer commit");
        let before = f.git(&["status", "--porcelain"]);
        let head = f.git(&["rev-parse", "HEAD"]).trim().to_string();
        let d = diff(&f.repo(), &head, 0).unwrap();
        assert!(d.text.contains("+contenido"));
        assert!(d.parent.is_none());
        assert_eq!(before, f.git(&["status", "--porcelain"]));
        assert!(diff(&f.repo(), "--help", 0).is_err());
    }
    #[test]
    fn pagination_and_stale_generation() {
        let f = Fixture::new();
        for i in 0..205 {
            f.git(&["commit", "--allow-empty", "-m", &format!("commit {i}")]);
        }
        let s = snapshot(&f.repo()).unwrap();
        assert_eq!(s.page.commits.len(), 200);
        let second = history(&f.repo(), 200, &s.page.generation).unwrap();
        assert_eq!(second.commits.len(), 5);
        assert!(second.next_offset.is_none());
        assert!(
            !s.page
                .commits
                .iter()
                .any(|a| second.commits.iter().any(|b| a.hash == b.hash))
        );
        let scoped = snapshot_scoped(&f.repo(), Some("refs/heads/main")).unwrap();
        let scoped_second = history_scoped(
            &f.repo(),
            200,
            &scoped.page.generation,
            Some("refs/heads/main"),
        )
        .unwrap();
        assert_eq!(scoped_second.commits.len(), 5);
        assert_eq!(
            history_scoped(&f.repo(), 200, &s.page.generation, Some("refs/heads/main"))
                .unwrap_err()
                .code,
            "STALE_HISTORY"
        );
        assert_eq!(
            history_scoped(&f.repo(), 200, &scoped.page.generation, Some("HEAD"))
                .unwrap_err()
                .code,
            "STALE_HISTORY"
        );
        f.git(&["commit", "--allow-empty", "-m", "externo"]);
        assert_eq!(
            history(&f.repo(), 200, &s.page.generation)
                .unwrap_err()
                .code,
            "STALE_HISTORY"
        );
    }
    #[test]
    fn branch_scope_reads_ancestry_without_switching_or_mutating() {
        let f = Fixture::new();
        f.commit("base", "base", "base");
        f.git(&["switch", "-c", "side"]);
        f.commit("side", "side", "only side");
        let side = f.git(&["rev-parse", "HEAD"]).trim().to_string();
        f.git(&["update-ref", "refs/remotes/origin/side", &side]);
        f.git(&["switch", "main"]);
        f.commit("main", "main", "only main");
        let head = f.git(&["rev-parse", "HEAD"]);
        for scope in ["refs/heads/side", "refs/remotes/origin/side"] {
            let snapshot = snapshot_scoped(&f.repo(), Some(scope)).unwrap();
            assert_eq!(snapshot.page.commits.len(), 2);
            assert_eq!(snapshot.page.commits[0].hash, side);
            assert_eq!(
                snapshot.page.commits[0].parents[0],
                snapshot.page.commits[1].hash
            );
            assert!(
                !snapshot
                    .page
                    .commits
                    .iter()
                    .any(|c| c.subject == "only main")
            );
            assert_eq!(snapshot.branch.as_deref(), Some("main"));
        }
        let current = snapshot_scoped(&f.repo(), Some("HEAD")).unwrap();
        assert_eq!(current.page.commits[0].subject, "only main");
        assert_eq!(snapshot(&f.repo()).unwrap().page.commits.len(), 3);
        for invalid in [
            "--all",
            "main",
            "refs/heads/main~1",
            "refs/tags/main",
            "refs/heads/missing",
        ] {
            assert!(snapshot_scoped(&f.repo(), Some(invalid)).is_err());
        }
        assert_eq!(head, f.git(&["rev-parse", "HEAD"]));
        assert!(f.git(&["status", "--porcelain"]).trim().is_empty());
        assert!(!f.0.join(".git/FETCH_HEAD").exists());
    }
    #[test]
    fn large_diff_is_rejected_without_silent_truncation() {
        let f = Fixture::new();
        let content = "linea de contenido\n".repeat(140_000);
        f.commit("grande.txt", &content, "archivo grande");
        let head = f.git(&["rev-parse", "HEAD"]).trim().to_string();
        assert_eq!(diff(&f.repo(), &head, 0).unwrap_err().code, "OUTPUT_LIMIT");
    }
    #[test]
    fn detached_commit_without_any_ref_is_included() {
        let f = Fixture::new();
        f.commit("base", "base", "base");
        f.git(&["switch", "--detach", "HEAD"]);
        f.commit("detached", "contenido", "commit sin rama");
        f.git(&["branch", "-D", "main"]);
        let s = snapshot(&f.repo()).unwrap();
        assert!(s.refs.is_empty());
        assert!(s.branch.is_none());
        assert_eq!(s.page.commits.len(), 2);
        assert_eq!(s.page.commits[0].hash, s.head.unwrap());
    }
    #[test]
    fn parser_preserves_control_and_special_characters() {
        let h = "a".repeat(40);
        let raw = format!("{h}\0\0Autora ü\02026-01-01T00:00:00Z\0mensaje |,\u{1e} especial\0");
        let parsed = parse_log(raw.as_bytes()).unwrap();
        assert_eq!(parsed[0].subject, "mensaje |,\u{1e} especial");
    }
    #[test]
    fn diff_with_missing_promisor_blob_never_fetches_implicitly() {
        let f = Fixture::new();
        f.commit("file.txt", "base\n", "base");
        let server = f.0.join("server.git");
        f.git(&["init", "--bare", server.to_str().unwrap()]);
        f.git(&["push", server.to_str().unwrap(), "main:main"]);
        f.git(&["remote", "add", "origin", server.to_str().unwrap()]);
        f.git(&["config", "remote.origin.promisor", "true"]);
        f.git(&["config", "remote.origin.partialclonefilter", "blob:none"]);
        let blob = f.git(&["rev-parse", "HEAD:file.txt"]).trim().to_string();
        let object = f.0.join(".git/objects").join(&blob[..2]).join(&blob[2..]);
        fs::remove_file(&object).unwrap();
        let head = f.git(&["rev-parse", "HEAD"]);
        assert!(diff(&f.repo(), head.trim(), 0).is_err());
        assert!(!object.exists());
        assert!(!f.0.join(".git/FETCH_HEAD").exists());
        let packs = f.0.join(".git/objects/pack");
        assert_eq!(fs::read_dir(packs).unwrap().count(), 0);
    }
    #[test]
    fn commit_files_reports_add_modify_delete_rename_binary_unicode_and_merge() {
        let f = Fixture::new();
        f.commit("archivo ü.txt", "uno\ndos\ntres\n", "raíz");
        let root_hash = f.git(&["rev-parse", "HEAD"]).trim().to_string();
        let root_files = commit_files(&f.repo(), &root_hash, 0).unwrap();
        assert_eq!(root_files.parent_count, 0);
        assert_eq!(root_files.files.len(), 1);
        assert_eq!(root_files.files[0].status, "A");
        assert_eq!(root_files.files[0].path, "archivo ü.txt");
        assert_eq!(root_files.files[0].additions, Some(3));
        assert_eq!(root_files.files[0].deletions, Some(0));

        // Modificación + archivo binario + renombrar y eliminar en commits posteriores
        fs::write(
            f.0.join("archivo ü.txt"),
            "uno\ndos editado\ntres\ncuatro\n",
        )
        .unwrap();
        fs::write(f.0.join("mover.txt"), "a\nb\nc\nd\ne\nf\n").unwrap();
        fs::write(f.0.join("borrar.txt"), "adios\n").unwrap();
        fs::write(f.0.join("imagen.bin"), b"\x00\x01\x02PNG\x00").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "prepara cambios"]);

        fs::rename(f.0.join("mover.txt"), f.0.join("movido.txt")).unwrap();
        fs::remove_file(f.0.join("borrar.txt")).unwrap();
        fs::write(f.0.join("archivo ü.txt"), "uno\ndos editado\ncuatro\n").unwrap();
        fs::write(f.0.join("imagen.bin"), b"\x00\x01\x02JPG\x00\x03").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "modifica renombra elimina"]);
        let change_hash = f.git(&["rev-parse", "HEAD"]).trim().to_string();
        let listed = commit_files(&f.repo(), &change_hash, 0).unwrap();

        let unicode = listed
            .files
            .iter()
            .find(|item| item.path == "archivo ü.txt")
            .unwrap();
        assert_eq!(unicode.status, "M");
        assert_eq!(unicode.deletions, Some(1));

        let deleted = listed
            .files
            .iter()
            .find(|item| item.path == "borrar.txt")
            .unwrap();
        assert_eq!(deleted.status, "D");
        assert_eq!(deleted.deletions, Some(1));

        let renamed = listed
            .files
            .iter()
            .find(|item| item.path == "movido.txt")
            .unwrap();
        assert_eq!(renamed.status, "R");
        assert_eq!(renamed.old_path.as_deref(), Some("mover.txt"));

        let bin = listed
            .files
            .iter()
            .find(|item| item.path == "imagen.bin")
            .unwrap();
        assert!(bin.binary);
        assert_eq!(bin.additions, None);
        assert_eq!(bin.deletions, None);

        // Merge commit con 2 padres
        f.git(&["switch", "-c", "lado"]);
        f.commit("rama_lado.txt", "desde lado\n", "commit en lado");
        f.git(&["switch", "main"]);
        f.commit("rama_main.txt", "desde main\n", "commit en main");
        f.git(&["merge", "--no-ff", "lado", "-m", "merge lado"]);
        let merge_hash = f.git(&["rev-parse", "HEAD"]).trim().to_string();
        let vs_parent0 = commit_files(&f.repo(), &merge_hash, 0).unwrap();
        let vs_parent1 = commit_files(&f.repo(), &merge_hash, 1).unwrap();
        assert_eq!(vs_parent0.parent_count, 2);
        assert!(
            vs_parent0
                .files
                .iter()
                .any(|item| item.path == "rama_lado.txt")
        );
        assert!(
            vs_parent1
                .files
                .iter()
                .any(|item| item.path == "rama_main.txt")
        );
    }
    #[test]
    fn diff_with_options_supports_single_file_whitespace_context_and_rejects_bad_paths() {
        let f = Fixture::new();
        f.commit(
            "peque.txt",
            "linea 1\nlinea 2\nlinea 3\nlinea 4\nlinea 5\n",
            "base",
        );
        let huge = "contenido muy largo en bloque grande\n".repeat(80_000);
        fs::write(f.0.join("grande.txt"), &huge).unwrap();
        fs::write(
            f.0.join("peque.txt"),
            "linea 1\nlinea 2   \nlinea 3\nlinea 4\nlinea 5 editada\n",
        )
        .unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "commit con archivo gigante y pequeño"]);
        let head = f.git(&["rev-parse", "HEAD"]).trim().to_string();

        // El diff completo excede 2 MiB, pero por archivo individual funciona.
        assert_eq!(diff(&f.repo(), &head, 0).unwrap_err().code, "OUTPUT_LIMIT");
        let single =
            diff_with_options(&f.repo(), &head, 0, Some("peque.txt"), None, false, 3).unwrap();
        assert!(single.text.contains("-linea 2"));
        assert!(single.text.contains("+linea 2   "));
        assert!(single.text.contains("+linea 5 editada"));

        // Con `-w` se ignora el cambio de espacios en linea 2.
        let ignore_ws =
            diff_with_options(&f.repo(), &head, 0, Some("peque.txt"), None, true, 1).unwrap();
        assert!(!ignore_ws.text.contains("linea 2   "));
        assert!(ignore_ws.text.contains("+linea 5 editada"));

        // Rechazo de rutas inseguras.
        for bad in ["../secreto", "/etc/passwd", "dir/\0a", ""] {
            assert_eq!(
                diff_with_options(&f.repo(), &head, 0, Some(bad), None, false, 3)
                    .unwrap_err()
                    .code,
                "INVALID_PATH"
            );
        }
    }

    #[test]
    fn reads_range_files_and_diff_across_multiple_commits() {
        let f = Fixture::new();
        f.commit("a.txt", "uno\ndos\n", "c1");
        let h1 = f.git(&["rev-parse", "HEAD"]).trim().to_string();
        f.commit("b.txt", "hola\n", "c2");
        f.commit("a.txt", "uno\ndos modificado\n", "c3");
        let h3 = f.git(&["rev-parse", "HEAD"]).trim().to_string();

        assert_eq!(
            range_files(&f.repo(), "abc", &h3).unwrap_err().code,
            "INVALID_COMMIT"
        );

        let files = range_files(&f.repo(), &h1, &h3).unwrap();
        assert_eq!(files.files.len(), 2);
        assert!(
            files
                .files
                .iter()
                .any(|item| item.path == "a.txt" && item.status == "M")
        );
        assert!(
            files
                .files
                .iter()
                .any(|item| item.path == "b.txt" && item.status == "A")
        );

        let diff_all = range_diff(&f.repo(), &h1, &h3, None, None, false, 3).unwrap();
        assert!(diff_all.text.contains("+dos modificado"));
        assert!(diff_all.text.contains("+hola"));

        let diff_only_a = range_diff(&f.repo(), &h1, &h3, Some("a.txt"), None, false, 3).unwrap();
        assert!(diff_only_a.text.contains("+dos modificado"));
        assert!(!diff_only_a.text.contains("+hola"));
    }
}
