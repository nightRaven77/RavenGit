use crate::{
    changes,
    git::{self, GitError, Repository, Result},
    process,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

const MAX_POINTER_BYTES: u64 = 1024;
const MAX_CACHE_ENTRIES: usize = 10_000;
const MAX_CACHE_DEPTH: usize = 16;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LfsFile {
    pub path: String,
    pub oid: String,
    pub downloaded: bool,
    pub size_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LfsLock {
    pub id: String,
    pub path: String,
    pub owner: String,
    pub locked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LfsStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub configured: bool,
    pub tracked_patterns: Vec<String>,
    pub files: Vec<LfsFile>,
    pub locks: Vec<LfsLock>,
    pub cache_bytes: u64,
    pub trusted: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LfsActionOutcome {
    pub message: String,
    pub status: LfsStatus,
}

fn error(code: &'static str, message: impl Into<String>) -> GitError {
    GitError::new(code, message)
}

fn probe_lfs_version(repo_path: &Path) -> Option<String> {
    let mut cmd = process::git(repo_path);
    cmd.args(["lfs", "version"]);
    let out = process::execute(cmd, None, Duration::from_secs(5)).ok()?;
    if !out.success {
        return None;
    }
    let text = String::from_utf8_lossy(&out.bytes);
    text.lines()
        .next()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

pub fn parse_gitattributes_lfs_patterns(repo_path: &Path) -> Vec<String> {
    let attrs_path = repo_path.join(".gitattributes");
    let Ok(raw) = fs::read_to_string(&attrs_path) else {
        return Vec::new();
    };
    let mut patterns = Vec::new();
    let mut seen = HashSet::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let mut parts = trimmed.split_whitespace();
        let Some(pattern) = parts.next() else {
            continue;
        };
        if parts.any(|token| token == "filter=lfs") && seen.insert(pattern.to_string()) {
            patterns.push(pattern.to_string());
        }
    }
    patterns
}

pub fn measure_lfs_cache_bytes(repo: &Repository) -> u64 {
    let Ok(raw_dir) = git::text(&repo.path, &["rev-parse", "--absolute-git-dir"]) else {
        return 0;
    };
    let lfs_objects = PathBuf::from(raw_dir.trim_end_matches(['\r', '\n']))
        .join("lfs")
        .join("objects");
    if !lfs_objects.is_dir() {
        return 0;
    }

    let mut total = 0u64;
    let mut visited = 0usize;
    let mut stack = vec![(lfs_objects, 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        if depth > MAX_CACHE_DEPTH || visited >= MAX_CACHE_ENTRIES {
            break;
        }
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            visited += 1;
            if visited > MAX_CACHE_ENTRIES {
                break;
            }
            let p = entry.path();
            let Ok(meta) = fs::symlink_metadata(&p) else {
                continue;
            };
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                stack.push((p, depth + 1));
            } else if meta.is_file() {
                total = total.saturating_add(meta.len());
            }
        }
    }
    total
}

fn looks_like_size_label(s: &str) -> bool {
    let lower = s.trim().to_ascii_lowercase();
    lower.ends_with(" b")
        || lower.ends_with(" kb")
        || lower.ends_with(" kib")
        || lower.ends_with(" mb")
        || lower.ends_with(" mib")
        || lower.ends_with(" gb")
        || lower.ends_with(" gib")
        || lower.ends_with(" tb")
        || lower.ends_with(" tib")
}

pub fn parse_ls_files_output(raw: &str) -> Vec<LfsFile> {
    let mut files = Vec::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Some((oid_raw, rest_after_oid)) = trimmed.split_once(char::is_whitespace) else {
            continue;
        };
        let oid = oid_raw.trim();
        if oid.is_empty() {
            continue;
        }
        let after_oid = rest_after_oid.trim_start();
        let Some(marker) = after_oid.chars().next() else {
            continue;
        };
        if marker != '*' && marker != '-' {
            continue;
        }
        let downloaded = marker == '*';
        let path_and_size = after_oid[1..].trim();
        if path_and_size.is_empty() {
            continue;
        }
        let (path, size_label) = if path_and_size.ends_with(')')
            && let Some(open_idx) = path_and_size.rfind(" (")
        {
            let candidate_size = &path_and_size[open_idx + 2..path_and_size.len() - 1];
            if looks_like_size_label(candidate_size) {
                (
                    path_and_size[..open_idx].trim().to_string(),
                    Some(candidate_size.trim().to_string()),
                )
            } else {
                (path_and_size.to_string(), None)
            }
        } else {
            (path_and_size.to_string(), None)
        };
        if !path.is_empty() {
            files.push(LfsFile {
                path,
                oid: oid.to_string(),
                downloaded,
                size_label,
            });
        }
    }
    files
}

fn push_lock_value(item: &Value, out: &mut Vec<LfsLock>) {
    let Some(obj) = item.as_object() else {
        return;
    };
    let Some(path) = obj.get("path").and_then(Value::as_str) else {
        return;
    };
    let id = obj
        .get("id")
        .and_then(|v| {
            v.as_str()
                .map(ToString::to_string)
                .or_else(|| v.as_i64().map(|n| n.to_string()))
        })
        .unwrap_or_default();
    let owner = obj
        .get("owner")
        .and_then(|v| v.get("name").and_then(Value::as_str).or_else(|| v.as_str()))
        .unwrap_or("Desconocido")
        .to_string();
    let locked_at = obj
        .get("locked_at")
        .or_else(|| obj.get("lockedAt"))
        .and_then(Value::as_str)
        .map(ToString::to_string);
    out.push(LfsLock {
        id,
        path: path.to_string(),
        owner,
        locked_at,
    });
}

pub fn parse_locks_json(raw: &str) -> Vec<LfsLock> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let Ok(val) = serde_json::from_str::<Value>(trimmed) else {
        return Vec::new();
    };
    let mut locks = Vec::new();
    if let Some(arr) = val.as_array() {
        for item in arr {
            push_lock_value(item, &mut locks);
        }
    } else if let Some(obj) = val.as_object() {
        for key in ["locks", "ours", "theirs"] {
            if let Some(arr) = obj.get(key).and_then(Value::as_array) {
                for item in arr {
                    push_lock_value(item, &mut locks);
                }
            }
        }
    }
    locks
}

fn format_pointer_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KiB", bytes as f64 / 1024.0)
    } else {
        format!("{:.2} MiB", bytes as f64 / (1024.0 * 1024.0))
    }
}

fn scan_local_lfs_pointers(repo: &Repository) -> Vec<LfsFile> {
    let Ok(raw_paths) = git::run(&repo.path, &["ls-files", "-z"]) else {
        return Vec::new();
    };
    let mut found = Vec::new();
    for slice in raw_paths.split(|b| *b == 0) {
        if slice.is_empty() {
            continue;
        }
        let Ok(rel) = std::str::from_utf8(slice) else {
            continue;
        };
        let Ok(full) = changes::validated_path(repo, rel) else {
            continue;
        };
        let Ok(meta) = fs::symlink_metadata(&full) else {
            continue;
        };
        if meta.file_type().is_symlink() || !meta.is_file() || meta.len() > MAX_POINTER_BYTES {
            continue;
        }
        let Ok(text) = fs::read_to_string(&full) else {
            continue;
        };
        if !text.starts_with("version https://git-lfs.github.com/spec/v1") {
            continue;
        }
        let mut oid = String::new();
        let mut size_label = None;
        for line in text.lines() {
            if let Some(rest) = line.strip_prefix("oid ") {
                oid = rest
                    .trim()
                    .strip_prefix("sha256:")
                    .unwrap_or(rest.trim())
                    .to_string();
            } else if let Some(rest) = line.strip_prefix("size ")
                && let Ok(bytes) = rest.trim().parse::<u64>()
            {
                size_label = Some(format_pointer_size(bytes));
            }
        }
        if !oid.is_empty() {
            found.push(LfsFile {
                path: rel.to_string(),
                oid,
                downloaded: false,
                size_label,
            });
        }
    }
    found
}

fn run_lfs_local(repo_path: &Path, args: &[&str]) -> Option<String> {
    let mut cmd = process::git(repo_path);
    cmd.arg("lfs").args(args);
    let out = process::execute(cmd, None, Duration::from_secs(10)).ok()?;
    if !out.success {
        return None;
    }
    Some(String::from_utf8_lossy(&out.bytes).into_owned())
}

fn run_lfs_explicit(repo_path: &Path, args: &[&str], failure_msg: &str) -> Result<String> {
    let mut cmd = process::git(repo_path);
    cmd.arg("lfs").args(args);
    let out = process::execute(cmd, None, Duration::from_secs(60)).map_err(|e| match e {
        process::Error::Start => error("LFS_UNAVAILABLE", "No se pudo ejecutar `git lfs`."),
        _ => error(
            "LFS_TIMEOUT",
            "La operación de Git LFS superó el tiempo máximo permitido.",
        ),
    })?;
    if !out.success {
        return Err(error("LFS_FAILED", failure_msg));
    }
    Ok(String::from_utf8_lossy(&out.bytes).into_owned())
}

pub fn read_status(repo: &Repository, trusted: bool) -> Result<LfsStatus> {
    let version = probe_lfs_version(&repo.path);
    let installed = version.is_some();
    let tracked_patterns = parse_gitattributes_lfs_patterns(&repo.path);
    let cache_bytes = measure_lfs_cache_bytes(repo);

    let mut files = if installed {
        run_lfs_local(&repo.path, &["ls-files", "--long", "--size"])
            .map(|out| parse_ls_files_output(&out))
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    if files.is_empty() {
        files = scan_local_lfs_pointers(repo);
    }

    let locks = if installed {
        run_lfs_local(&repo.path, &["locks", "--cached", "--json"])
            .map(|out| parse_locks_json(&out))
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let configured = !tracked_patterns.is_empty() || !files.is_empty() || cache_bytes > 0;
    Ok(LfsStatus {
        installed,
        version,
        configured,
        tracked_patterns,
        files,
        locks,
        cache_bytes,
        trusted,
    })
}

fn ensure_lfs_ready(repo: &Repository, trusted: bool) -> Result<()> {
    if !trusted {
        return Err(error(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de ejecutar acciones de Git LFS.",
        ));
    }
    if probe_lfs_version(&repo.path).is_none() {
        return Err(error(
            "LFS_UNAVAILABLE",
            "Git LFS no está instalado o no se encuentra en PATH.",
        ));
    }
    Ok(())
}

pub fn pull(repo: &Repository, path: Option<&str>, trusted: bool) -> Result<LfsActionOutcome> {
    ensure_lfs_ready(repo, trusted)?;
    if let Some(rel) = path {
        let _ = changes::validated_path(repo, rel)?;
        let include_arg = format!("--include={rel}");
        run_lfs_explicit(
            &repo.path,
            &["pull", &include_arg],
            &format!(
                "No se pudo descargar el objeto LFS para «{rel}». Comprueba tu conexión y credenciales."
            ),
        )?;
    } else {
        run_lfs_explicit(
            &repo.path,
            &["pull"],
            "No se pudieron descargar los objetos LFS pendientes. Comprueba tu conexión y credenciales.",
        )?;
    }
    let status = read_status(repo, trusted)?;
    Ok(LfsActionOutcome {
        message: match path {
            Some(rel) => format!("Objeto LFS actualizado para «{rel}»."),
            None => "Objetos LFS descargados correctamente.".into(),
        },
        status,
    })
}

pub fn refresh_locks(repo: &Repository, trusted: bool) -> Result<Vec<LfsLock>> {
    ensure_lfs_ready(repo, trusted)?;
    let out = run_lfs_explicit(
        &repo.path,
        &["locks", "--json"],
        "No se pudieron consultar los bloqueos LFS en el remoto.",
    )?;
    Ok(parse_locks_json(&out))
}

pub fn lock_file(repo: &Repository, path: &str, trusted: bool) -> Result<LfsActionOutcome> {
    ensure_lfs_ready(repo, trusted)?;
    let _ = changes::validated_path(repo, path)?;
    run_lfs_explicit(
        &repo.path,
        &["lock", "--", path],
        &format!("No se pudo bloquear «{path}» en Git LFS."),
    )?;
    let status = read_status(repo, trusted)?;
    Ok(LfsActionOutcome {
        message: format!("Archivo «{path}» bloqueado en Git LFS."),
        status,
    })
}

pub fn unlock_file(
    repo: &Repository,
    path: &str,
    force: bool,
    trusted: bool,
) -> Result<LfsActionOutcome> {
    ensure_lfs_ready(repo, trusted)?;
    let _ = changes::validated_path(repo, path)?;
    if force {
        run_lfs_explicit(
            &repo.path,
            &["unlock", "--force", "--", path],
            &format!("No se pudo desbloquear forzadamente «{path}» en Git LFS."),
        )?;
    } else {
        run_lfs_explicit(
            &repo.path,
            &["unlock", "--", path],
            &format!("No se pudo desbloquear «{path}» en Git LFS."),
        )?;
    }
    let status = read_status(repo, trusted)?;
    Ok(LfsActionOutcome {
        message: format!("Archivo «{path}» desbloqueado en Git LFS."),
        status,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEST: AtomicU64 = AtomicU64::new(0);

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "ravengit-lfs-{}-{}",
                std::process::id(),
                NEXT_TEST.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            let f = Self(path);
            f.git(&["init", "-b", "main"]);
            f.git(&["config", "user.name", "RavenGit"]);
            f.git(&["config", "user.email", "test@ravengit.local"]);
            f
        }
        fn git(&self, args: &[&str]) -> String {
            let out = Command::new("git")
                .current_dir(&self.0)
                .args(args)
                .output()
                .unwrap();
            assert!(
                out.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            String::from_utf8_lossy(&out.stdout).into_owned()
        }
        fn repo(&self) -> Repository {
            Repository {
                id: "lfs-test".into(),
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
    fn parses_gitattributes_ls_files_and_locks_json() {
        let f = Fixture::new();
        fs::write(
            f.0.join(".gitattributes"),
            "# comment\n*.psd filter=lfs diff=lfs merge=lfs -text\n*.png filter=lfs -text\n*.md text\n",
        )
        .unwrap();
        let patterns = parse_gitattributes_lfs_patterns(&f.0);
        assert_eq!(patterns, vec!["*.psd", "*.png"]);

        let ls_out = "\
a1b2c3d4e5 * assets/banner hero.png (1.2 MB)\n\
9988776655 - design/mockup.psd (450 KiB)\n\
0011223344 * video/clip (demo).mp4\n";
        let files = parse_ls_files_output(ls_out);
        assert_eq!(files.len(), 3);
        assert!(files[0].downloaded);
        assert_eq!(files[0].path, "assets/banner hero.png");
        assert_eq!(files[0].size_label.as_deref(), Some("1.2 MB"));
        assert!(!files[1].downloaded);
        assert_eq!(files[1].size_label.as_deref(), Some("450 KiB"));
        assert_eq!(files[2].path, "video/clip (demo).mp4");
        assert_eq!(files[2].size_label, None);

        let locks_json = r#"{"ours":[{"id":"42","path":"design/mockup.psd","owner":{"name":"Erick"},"locked_at":"2026-11-25T10:00:00Z"}],"theirs":[]}"#;
        let locks = parse_locks_json(locks_json);
        assert_eq!(locks.len(), 1);
        assert_eq!(locks[0].id, "42");
        assert_eq!(locks[0].path, "design/mockup.psd");
        assert_eq!(locks[0].owner, "Erick");
    }

    #[test]
    fn detects_local_lfs_pointers_cache_and_enforces_trust_gate() {
        let f = Fixture::new();
        let repo = f.repo();
        f.git(&["config", "filter.lfs.process", ""]);
        f.git(&["config", "filter.lfs.clean", ""]);
        f.git(&["config", "filter.lfs.smudge", ""]);
        f.git(&["config", "filter.lfs.required", "false"]);
        fs::write(f.0.join(".gitattributes"), "*.bin filter=lfs -text\n").unwrap();
        fs::write(
            f.0.join("model.bin"),
            "version https://git-lfs.github.com/spec/v1\noid sha256:0123456789abcdef\nsize 2048\n",
        )
        .unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "lfs pointer"]);

        let cache_dir = f.0.join(".git/lfs/objects/01/23");
        fs::create_dir_all(&cache_dir).unwrap();
        fs::write(cache_dir.join("012345"), vec![1u8; 512]).unwrap();

        let status = read_status(&repo, false).unwrap();
        assert!(status.configured);
        assert_eq!(status.tracked_patterns, vec!["*.bin"]);
        assert_eq!(status.cache_bytes, 512);
        assert!(!status.files.is_empty());
        assert_eq!(status.files[0].path, "model.bin");

        assert_eq!(pull(&repo, None, false).unwrap_err().code, "TRUST_REQUIRED");
        assert_eq!(
            refresh_locks(&repo, false).unwrap_err().code,
            "TRUST_REQUIRED"
        );
        assert_eq!(
            lock_file(&repo, "model.bin", false).unwrap_err().code,
            "TRUST_REQUIRED"
        );
        assert_eq!(
            unlock_file(&repo, "model.bin", false, false)
                .unwrap_err()
                .code,
            "TRUST_REQUIRED"
        );
    }
}
