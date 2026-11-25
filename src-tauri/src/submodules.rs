use crate::{
    changes,
    git::{self, GitError, Repository, Result},
    process,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubmoduleEntry {
    pub name: String,
    pub path: String,
    pub url: Option<String>,
    pub branch: Option<String>,
    pub head: String,
    pub describe: Option<String>,
    pub status: String,
    pub initialized: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubmoduleList {
    pub submodules: Vec<SubmoduleEntry>,
    pub trusted: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Action {
    InitUpdate {
        path: Option<String>,
        recursive: bool,
    },
    SyncUrls {
        path: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub message: String,
    pub list: SubmoduleList,
}

#[derive(Debug, Default)]
struct ModuleMeta {
    name: String,
    path: String,
    url: Option<String>,
    branch: Option<String>,
}

fn error(code: &'static str, message: impl Into<String>) -> GitError {
    GitError::new(code, message)
}

fn git_dir(repo: &Repository) -> Result<PathBuf> {
    let raw = git::text(&repo.path, &["rev-parse", "--absolute-git-dir"])?;
    let path = PathBuf::from(raw.trim_end_matches(['\r', '\n']));
    path.canonicalize()
        .map_err(|_| error("GIT_DIR", "No se pudo localizar la carpeta Git."))
}

fn read_gitmodules_meta(repo_path: &Path) -> HashMap<String, ModuleMeta> {
    let gitmodules = repo_path.join(".gitmodules");
    if !gitmodules.is_file() {
        return HashMap::new();
    }
    let Ok(out) = git::text(repo_path, &["config", "--file", ".gitmodules", "--list"]) else {
        return HashMap::new();
    };
    let mut by_name: HashMap<String, ModuleMeta> = HashMap::new();
    for line in out.lines() {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let Some(rest) = key.strip_prefix("submodule.") else {
            continue;
        };
        let Some(dot_pos) = rest.rfind('.') else {
            continue;
        };
        let name = rest[..dot_pos].to_string();
        let field = &rest[dot_pos + 1..];
        let entry = by_name.entry(name.clone()).or_insert_with(|| ModuleMeta {
            name,
            ..Default::default()
        });
        match field {
            "path" => entry.path = value.to_string(),
            "url" => entry.url = Some(value.to_string()),
            "branch" => entry.branch = Some(value.to_string()),
            _ => {}
        }
    }
    by_name
        .into_values()
        .filter(|m| !m.path.is_empty())
        .map(|m| (m.path.clone(), m))
        .collect()
}

pub fn parse_submodule_status_line(line: &str) -> Option<(String, String, String, Option<String>)> {
    if line.len() < 42 {
        return None;
    }
    let prefix = line.chars().next()?;
    let status = match prefix {
        '-' => "uninitialized",
        '+' => "modified",
        'U' => "conflict",
        ' ' => "clean",
        _ => return None,
    }
    .to_string();
    let rest = line[1..].trim_start();
    let (head_raw, path_and_desc) = rest.split_once(' ')?;
    let head = head_raw.trim();
    if !matches!(head.len(), 40 | 64) || !head.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let trimmed = path_and_desc.trim_end();
    let (path, describe) = if trimmed.ends_with(')')
        && let Some(open_idx) = trimmed.rfind(" (")
    {
        (
            trimmed[..open_idx].to_string(),
            Some(trimmed[open_idx + 2..trimmed.len() - 1].to_string()),
        )
    } else {
        (trimmed.to_string(), None)
    };
    if path.is_empty() {
        return None;
    }
    Some((status, head.to_string(), path, describe))
}

pub fn read_status(repo: &Repository, trusted: bool) -> Result<SubmoduleList> {
    let meta_by_path = read_gitmodules_meta(&repo.path);
    let raw_status = git::text(&repo.path, &["submodule", "status"]).unwrap_or_default();
    let mut entries = Vec::new();

    for line in raw_status.lines() {
        let Some((status, head, path, describe)) = parse_submodule_status_line(line) else {
            continue;
        };
        let meta = meta_by_path.get(&path);
        let initialized = status != "uninitialized";
        entries.push(SubmoduleEntry {
            name: meta.map(|m| m.name.clone()).unwrap_or_else(|| path.clone()),
            path,
            url: meta.and_then(|m| m.url.clone()),
            branch: meta.and_then(|m| m.branch.clone()),
            head,
            describe,
            status,
            initialized,
        });
    }

    Ok(SubmoduleList {
        submodules: entries,
        trusted,
    })
}

fn ensure_safe_to_mutate(repo: &Repository, trusted: bool) -> Result<()> {
    if !trusted {
        return Err(error(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de actualizar submódulos.",
        ));
    }
    let dir = git_dir(repo)?;
    if dir.join("index.lock").exists() {
        return Err(error(
            "INDEX_LOCKED",
            "El índice Git está bloqueado por otro proceso.",
        ));
    }
    for marker in [
        "MERGE_HEAD",
        "REBASE_HEAD",
        "rebase-merge",
        "rebase-apply",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
    ] {
        if dir.join(marker).exists() {
            return Err(error(
                "OPERATION_IN_PROGRESS",
                "Hay una operación Git en curso. Complétala o abórtala antes de modificar submódulos.",
            ));
        }
    }
    if changes::read(repo, true)?.operation.is_some() {
        return Err(error(
            "OPERATION_IN_PROGRESS",
            "Hay una operación Git en curso. Complétala o abórtala antes de modificar submódulos.",
        ));
    }
    Ok(())
}

fn run_submodule_command(repo_path: &Path, args: &[&str], failure_msg: &str) -> Result<()> {
    let mut cmd = process::git(repo_path);
    cmd.args(args);
    let out = process::execute(cmd, None, Duration::from_secs(60)).map_err(|e| match e {
        process::Error::Start => error("GIT_UNAVAILABLE", "No se pudo ejecutar `git submodule`."),
        _ => error(
            "SUBMODULE_TIMEOUT",
            "La operación sobre submódulos excedió el tiempo máximo permitido.",
        ),
    })?;
    if !out.success {
        return Err(error("SUBMODULE_FAILED", failure_msg));
    }
    Ok(())
}

pub fn execute(repo: &Repository, action: Action, trusted: bool) -> Result<Outcome> {
    ensure_safe_to_mutate(repo, trusted)?;
    let existing = read_status(repo, trusted)?;

    let validate_target = |target: Option<&str>| -> Result<()> {
        if let Some(p) = target
            && !existing.submodules.iter().any(|item| item.path == p)
        {
            return Err(error(
                "SUBMODULE_NOT_FOUND",
                format!("No se encontró el submódulo «{p}» en este repositorio."),
            ));
        }
        Ok(())
    };

    let message = match action {
        Action::SyncUrls { path } => {
            validate_target(path.as_deref())?;
            let mut args = vec!["submodule", "sync"];
            if let Some(p) = path.as_deref() {
                args.push("--");
                args.push(p);
            }
            run_submodule_command(
                &repo.path,
                &args,
                "No se pudieron sincronizar las URLs de los submódulos.",
            )?;
            match path {
                Some(p) => format!("URL del submódulo «{p}» sincronizada desde `.gitmodules`."),
                None => "URLs de todos los submódulos sincronizadas desde `.gitmodules`.".into(),
            }
        }
        Action::InitUpdate { path, recursive } => {
            validate_target(path.as_deref())?;
            let mut args = vec!["submodule", "update", "--init"];
            if recursive {
                args.push("--recursive");
            }
            if let Some(p) = path.as_deref() {
                args.push("--");
                args.push(p);
            }
            run_submodule_command(
                &repo.path,
                &args,
                "No se pudo inicializar/actualizar el submódulo. Comprueba acceso y configuración.",
            )?;
            match path {
                Some(p) => format!("Submódulo «{p}» inicializado y actualizado."),
                None => "Todos los submódulos han sido inicializados y actualizados.".into(),
            }
        }
    };

    let list = read_status(repo, trusted)?;
    Ok(Outcome { message, list })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEST: AtomicU64 = AtomicU64::new(0);

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(suffix: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "ravengit-submod-{suffix}-{}-{}",
                std::process::id(),
                NEXT_TEST.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn git_in(dir: &Path, args: &[&str]) -> String {
        let out = Command::new("git")
            .current_dir(dir)
            .args(args)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "git {args:?} failed in {}: {}",
            dir.display(),
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8_lossy(&out.stdout).into_owned()
    }

    #[test]
    fn parses_status_lines_and_handles_local_submodule_sync_and_validation() {
        let hash = "a".repeat(40);
        assert_eq!(
            parse_submodule_status_line(&format!("-{hash} libs/core")),
            Some((
                "uninitialized".into(),
                hash.clone(),
                "libs/core".into(),
                None
            ))
        );
        assert_eq!(
            parse_submodule_status_line(&format!("+{hash} vendor/sdk tool (v1.2.0-3-gabc)")),
            Some((
                "modified".into(),
                hash.clone(),
                "vendor/sdk tool".into(),
                Some("v1.2.0-3-gabc".into())
            ))
        );
        assert_eq!(
            parse_submodule_status_line(&format!("U{hash} nested/mod")),
            Some(("conflict".into(), hash.clone(), "nested/mod".into(), None))
        );
        assert_eq!(
            parse_submodule_status_line(&format!(" {hash} clean/mod (heads/main)")),
            Some((
                "clean".into(),
                hash,
                "clean/mod".into(),
                Some("heads/main".into())
            ))
        );

        let sub = TempDir::new("child");
        git_in(&sub.0, &["init", "-b", "main"]);
        git_in(&sub.0, &["config", "user.name", "RavenGit"]);
        git_in(&sub.0, &["config", "user.email", "test@ravengit.local"]);
        fs::write(sub.0.join("lib.txt"), "hello\n").unwrap();
        git_in(&sub.0, &["add", "--all"]);
        git_in(&sub.0, &["commit", "-m", "sub commit"]);

        let parent = TempDir::new("parent");
        git_in(&parent.0, &["init", "-b", "main"]);
        git_in(&parent.0, &["config", "user.name", "RavenGit"]);
        git_in(&parent.0, &["config", "user.email", "test@ravengit.local"]);
        fs::write(parent.0.join("README.md"), "root\n").unwrap();
        git_in(&parent.0, &["add", "--all"]);
        git_in(&parent.0, &["commit", "-m", "root commit"]);

        let sub_url = sub.0.to_string_lossy().into_owned();
        git_in(
            &parent.0,
            &[
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                &sub_url,
                "deps/child",
            ],
        );
        git_in(&parent.0, &["commit", "-m", "add submodule"]);

        let repo = Repository {
            id: "sub-test".into(),
            path: parent.0.clone(),
        };

        let listed = read_status(&repo, false).unwrap();
        assert_eq!(listed.submodules.len(), 1);
        assert_eq!(listed.submodules[0].path, "deps/child");
        assert_eq!(listed.submodules[0].status, "clean");
        assert!(listed.submodules[0].initialized);

        assert_eq!(
            execute(
                &repo,
                Action::SyncUrls {
                    path: Some("deps/child".into())
                },
                false
            )
            .unwrap_err()
            .code,
            "TRUST_REQUIRED"
        );
        assert_eq!(
            execute(
                &repo,
                Action::InitUpdate {
                    path: Some("does/not/exist".into()),
                    recursive: false
                },
                true
            )
            .unwrap_err()
            .code,
            "SUBMODULE_NOT_FOUND"
        );

        let sync_res = execute(
            &repo,
            Action::SyncUrls {
                path: Some("deps/child".into()),
            },
            true,
        )
        .unwrap();
        assert_eq!(sync_res.list.submodules.len(), 1);
    }
}
