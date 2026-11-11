use crate::{
    branches,
    git::{self, GitError, Repository, Result},
    merge, remotes,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

static NEXT: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    #[serde(skip)]
    branch_token: String,
    #[serde(skip)]
    config_token: Vec<u8>,
    pub token: String,
    pub trusted: bool,
    pub branch: Option<String>,
    pub remote: Option<String>,
    pub remote_branch: Option<String>,
    pub url: Option<String>,
    pub restriction: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub token: String,
    pub remote: String,
    pub remote_branch: String,
    pub url: String,
    pub fetched_at: u64,
    pub merge: merge::Preview,
}

pub struct Plan {
    pub view: Preview,
    options_token: String,
    tracking_ref: String,
}

fn error(code: &'static str, message: &str) -> GitError {
    GitError::new(code, message)
}

fn values(repo: &Repository, key: &str) -> Result<Vec<String>> {
    let output = remotes::command(repo, &["config", "--null", "--get-all", key], false)?;
    if !output.success {
        if output.bytes.is_empty() {
            return Ok(vec![]);
        }
        return Err(error(
            "PULL_CONFIG",
            "No se pudo leer la configuración de seguimiento.",
        ));
    }
    let text = String::from_utf8(output.bytes)
        .map_err(|_| error("PULL_CONFIG", "La configuración no es UTF-8."))?;
    Ok(text.split_terminator('\0').map(String::from).collect())
}

fn current_branch(repo: &Repository) -> Result<Option<String>> {
    let output = remotes::command(repo, &["symbolic-ref", "--quiet", "HEAD"], false)?;
    if !output.success {
        return Ok(None);
    }
    Ok(String::from_utf8(output.bytes)
        .ok()
        .and_then(|value| value.trim().strip_prefix("refs/heads/").map(String::from)))
}

pub fn options(repo: &Repository, trusted: bool) -> Result<Options> {
    if !trusted {
        return Ok(Options {
            branch_token: String::new(),
            config_token: vec![],
            token: String::new(),
            trusted: false,
            branch: None,
            remote: None,
            remote_branch: None,
            url: None,
            restriction: None,
        });
    }
    let branches = branches::read(repo, true)?;
    let remotes = remotes::read(repo, true)?;
    let branch = current_branch(repo)?;
    let config = remotes::command(repo, &["config", "--includes", "--null", "--list"], false)?;
    if !config.success {
        return Err(error(
            "PULL_CONFIG",
            "No se pudo comprobar la configuración de Git.",
        ));
    }
    let configured_remote = if let Some(branch) = &branch {
        values(repo, &format!("branch.{branch}.remote"))?
    } else {
        vec![]
    };
    let configured_merge = if let Some(branch) = &branch {
        values(repo, &format!("branch.{branch}.merge"))?
    } else {
        vec![]
    };
    let mut digest = Sha256::new();
    for value in [&branches.token, &remotes.token] {
        digest.update(value.as_bytes());
    }
    let remote = (configured_remote.len() == 1).then(|| configured_remote[0].clone());
    let remote_branch = if configured_merge.len() == 1 {
        configured_merge[0]
            .strip_prefix("refs/heads/")
            .filter(|name| !name.is_empty())
            .map(String::from)
    } else {
        None
    };
    let selected = remote
        .as_ref()
        .and_then(|name| remotes.remotes.iter().find(|remote| remote.name == *name));
    let restriction = branches.restriction.or_else(|| {
        if branch.is_none() { Some("Cambia a una rama local antes de usar Pull.".into()) }
        else if remote.as_deref() == Some(".") || remote_branch.is_none() || selected.is_none() { Some("Configura un único upstream remoto para la rama desde Git. Pull no elige origin ni otro destino por ti.".into()) }
        else if selected.is_some_and(|remote| !remote.editable || !remote.fetch_allowed) { Some("El remoto tiene configuración avanzada, heredada o restringida. Revísalo desde Git.".into()) }
        else { None }
    });
    Ok(Options {
        branch_token: branches.token,
        config_token: config.bytes,
        token: format!("{:x}", digest.finalize()),
        trusted: true,
        branch,
        remote,
        remote_branch,
        url: selected.and_then(|remote| remote.fetch_urls.first().cloned()),
        restriction,
    })
}

fn tracking_ref(options: &Options) -> Result<String> {
    let remote = options
        .remote
        .as_deref()
        .ok_or_else(|| error("PULL_UPSTREAM", "No hay upstream remoto."))?;
    let branch = options
        .remote_branch
        .as_deref()
        .ok_or_else(|| error("PULL_UPSTREAM", "No hay rama remota vinculada."))?;
    Ok(format!("refs/remotes/{remote}/{branch}"))
}

fn checked(repo: &Repository, token: &str, trusted: bool) -> Result<Options> {
    if !trusted {
        return Err(error(
            "UNTRUSTED",
            "Autoriza el repositorio antes de usar Pull.",
        ));
    }
    let state = options(repo, true)?;
    if state.token != token {
        return Err(error(
            "STALE",
            "El repositorio o su upstream cambió. Actualiza Pull y vuelve a revisar.",
        ));
    }
    if let Some(reason) = &state.restriction {
        return Err(GitError::new("PULL_RESTRICTED", reason.clone()));
    }
    Ok(state)
}

pub fn preview(repo: &Repository, token: &str, trusted: bool) -> Result<Plan> {
    let state = checked(repo, token, trusted)?;
    merge::supported(repo)?;
    let remote = state
        .remote
        .as_deref()
        .ok_or_else(|| error("PULL_UPSTREAM", "Falta remoto."))?;
    let remote_branch = state
        .remote_branch
        .as_deref()
        .ok_or_else(|| error("PULL_UPSTREAM", "Falta rama remota."))?;
    let reference = tracking_ref(&state)?;
    if remotes::command(repo, &["symbolic-ref", "--quiet", &reference], false)?.success {
        return Err(error(
            "PULL_REFERENCE",
            "La referencia de seguimiento es simbólica. Revísala desde Git antes de Fetch; no se permite redirigir la actualización a una rama local.",
        ));
    }
    let source = format!("refs/heads/{remote_branch}");
    if !remotes::command(repo, &["check-ref-format", &source], false)?.success {
        return Err(error(
            "PULL_UPSTREAM",
            "La rama remota configurada no es válida.",
        ));
    }
    let refspec = format!("+{source}:{reference}");
    let output = remotes::command(
        repo,
        &[
            "fetch",
            "--no-all",
            "--atomic",
            "--no-tags",
            "--no-recurse-submodules",
            "--no-prune",
            "--no-prune-tags",
            "--no-write-fetch-head",
            "--no-auto-maintenance",
            "--no-write-commit-graph",
            "--refmap=",
            "--",
            remote,
            &refspec,
        ],
        true,
    )?;
    if !output.success {
        return Err(error(
            "PULL_FETCH",
            "Fetch no se confirmó. La rama puede no existir o fallar el acceso. No se integra la referencia antigua; actualiza antes de repetir.",
        ));
    }
    let after = options(repo, true)?;
    if after.branch_token != state.branch_token
        || after.config_token != state.config_token
        || after.branch != state.branch
        || after.remote != state.remote
        || after.remote_branch != state.remote_branch
        || after.url != state.url
        || after.restriction.is_some()
    {
        return Err(error(
            "STALE",
            "Fetch pudo actualizar referencias, pero cambió el repositorio o su configuración. Revisa de nuevo; no se ha iniciado el merge.",
        ));
    }
    let hash = git::text(
        &repo.path,
        &["rev-parse", "--verify", &format!("{reference}^{{commit}}")],
    )?
    .trim()
    .to_string();
    let local = branches::read(repo, true)?;
    let merge = merge::preview_target(repo, &local.token, &reference, &hash, true)?;
    let latest = options(repo, true)?;
    if latest.token != after.token {
        return Err(error(
            "STALE",
            "El estado cambió mientras se revisaba Pull. Actualiza; Fetch pudo completarse, pero no se integró nada.",
        ));
    }
    let fetched_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| error("PULL_TIME", "No se pudo fechar la revisión."))?
        .as_secs();
    let mut digest = Sha256::new();
    digest.update(after.token.as_bytes());
    digest.update(hash.as_bytes());
    digest.update(NEXT.fetch_add(1, Ordering::Relaxed).to_le_bytes());
    digest.update(fetched_at.to_le_bytes());
    Ok(Plan {
        view: Preview {
            token: format!("{:x}", digest.finalize()),
            remote: remote.into(),
            remote_branch: remote_branch.into(),
            url: state.url.unwrap_or_default(),
            fetched_at,
            merge,
        },
        options_token: after.token,
        tracking_ref: reference,
    })
}

pub fn integrate(repo: &Repository, plan: Plan, trusted: bool) -> Result<merge::Outcome> {
    checked(repo, &plan.options_token, trusted)?;
    let hash = git::text(
        &repo.path,
        &[
            "rev-parse",
            "--verify",
            &format!("{}^{{commit}}", plan.tracking_ref),
        ],
    )?;
    if hash.trim() != plan.view.merge.source_hash {
        return Err(error(
            "STALE",
            "La referencia remota cambió. Vuelve a revisar Pull.",
        ));
    }
    merge::edit(
        repo,
        &plan.view.merge.token,
        merge::Edit::Reviewed {
            source: plan.tracking_ref,
            source_hash: plan.view.merge.source_hash,
            destination_hash: plan.view.merge.destination_hash,
        },
        trusted,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::{Path, PathBuf},
        process::Command,
    };

    struct Fixture {
        root: PathBuf,
        repo: Repository,
        server: PathBuf,
        base: String,
        incoming: String,
    }
    fn git(path: &Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .args(["--no-pager", "-c", "core.fsmonitor=false"])
            .args(args)
            .current_dir(path)
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).unwrap().trim().into()
    }
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "ravengit-pull-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            let work = root.join("work");
            let server = root.join("server.git");
            fs::create_dir_all(&work).unwrap();
            git(&work, &["init", "-b", "main"]);
            for (key, value) in [
                ("user.name", "Fixture"),
                ("user.email", "fixture@example.invalid"),
                ("commit.gpgsign", "false"),
                ("core.autocrlf", "false"),
                ("core.hooksPath", ".git/no-hooks"),
            ] {
                git(&work, &["config", key, value]);
            }
            fs::write(work.join("archivo ü.txt"), "base\n").unwrap();
            git(&work, &["add", "--all"]);
            git(&work, &["commit", "-m", "base"]);
            let base = git(&work, &["rev-parse", "HEAD"]);
            git(&work, &["init", "--bare", server.to_str().unwrap()]);
            git(&server, &["config", "core.hooksPath", "no-hooks"]);
            git(
                &work,
                &["remote", "add", "equipo", server.to_str().unwrap()],
            );
            git(&work, &["push", "equipo", "HEAD:refs/heads/main"]);
            git(&work, &["config", "branch.main.remote", "equipo"]);
            git(&work, &["config", "branch.main.merge", "refs/heads/main"]);
            git(&work, &["switch", "-c", "peer"]);
            fs::write(work.join("archivo ü.txt"), "incoming\n").unwrap();
            git(&work, &["add", "--all"]);
            git(&work, &["commit", "-m", "incoming"]);
            let incoming = git(&work, &["rev-parse", "HEAD"]);
            git(
                &work,
                &[
                    "push",
                    "equipo",
                    "HEAD:refs/heads/main",
                    "HEAD:refs/heads/other",
                ],
            );
            git(&work, &["switch", "main"]);
            git(&work, &["update-ref", "refs/remotes/equipo/main", &base]);
            git(&work, &["update-ref", "refs/remotes/equipo/other", &base]);
            Self {
                repo: Repository {
                    id: "pull-fixture".into(),
                    path: work,
                },
                root,
                server,
                base,
                incoming,
            }
        }
        fn plan(&self) -> Plan {
            preview(&self.repo, &options(&self.repo, true).unwrap().token, true).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn pull_untrusted_is_read_free_and_internal_merge_variant_is_not_ipc() {
        let repo = Repository {
            id: "untrusted".into(),
            path: PathBuf::from("missing-pull-fixture"),
        };
        assert!(!options(&repo, false).unwrap().trusted);
        assert_eq!(preview(&repo, "", false).err().unwrap().code, "UNTRUSTED");
        assert!(serde_json::from_str::<merge::Edit>(r#"{"kind":"reviewed","source":"refs/remotes/equipo/main","sourceHash":"abc","destinationHash":"def"}"#).is_err());
    }

    #[test]
    fn pull_fetch_reviews_only_upstream_then_integrates_frozen_hash() {
        let fixture = Fixture::new();
        git(
            &fixture.server,
            &["update-ref", "refs/tags/server-tag", &fixture.incoming],
        );
        git(&fixture.repo.path, &["config", "fetch.all", "true"]);
        git(&fixture.repo.path, &["config", "fetch.pruneTags", "true"]);
        let index = fs::read(fixture.repo.path.join(".git/index")).unwrap();
        fs::write(fixture.repo.path.join(".git/FETCH_HEAD"), "preserved\n").unwrap();
        let plan = fixture.plan();
        assert_eq!(plan.view.remote, "equipo");
        assert_eq!(plan.view.merge.relation, "fastForward");
        assert_eq!(plan.view.merge.incoming, 1);
        assert_eq!(plan.view.merge.source_hash, fixture.incoming);
        assert_eq!(
            git(&fixture.repo.path, &["rev-parse", "HEAD"]),
            fixture.base
        );
        assert_eq!(
            fs::read(fixture.repo.path.join(".git/index")).unwrap(),
            index
        );
        assert_eq!(
            fs::read_to_string(fixture.repo.path.join("archivo ü.txt")).unwrap(),
            "base\n"
        );
        assert_eq!(
            git(
                &fixture.repo.path,
                &["rev-parse", "refs/remotes/equipo/other"]
            ),
            fixture.base
        );
        assert!(
            git(
                &fixture.repo.path,
                &["for-each-ref", "refs/tags/server-tag"]
            )
            .is_empty()
        );
        assert_eq!(
            fs::read_to_string(fixture.repo.path.join(".git/FETCH_HEAD")).unwrap(),
            "preserved\n"
        );
        git(
            &fixture.server,
            &["update-ref", "refs/heads/main", &fixture.base],
        );
        integrate(&fixture.repo, plan, true).unwrap();
        assert_eq!(
            git(&fixture.repo.path, &["rev-parse", "HEAD"]),
            fixture.incoming
        );
        assert_eq!(
            fs::read_to_string(fixture.repo.path.join("archivo ü.txt")).unwrap(),
            "incoming\n"
        );
        assert!(merge::read(&fixture.repo, true).unwrap().is_none());
    }

    #[test]
    fn pull_missing_upstream_deleted_remote_and_stale_edits_never_integrate_old_refs() {
        let fixture = Fixture::new();
        git(
            &fixture.repo.path,
            &["config", "--unset", "branch.main.merge"],
        );
        assert!(options(&fixture.repo, true).unwrap().restriction.is_some());
        git(
            &fixture.repo.path,
            &["config", "branch.main.merge", "refs/heads/main"],
        );
        git(
            &fixture.repo.path,
            &[
                "symbolic-ref",
                "refs/remotes/equipo/main",
                "refs/heads/main",
            ],
        );
        let state = options(&fixture.repo, true).unwrap();
        assert_eq!(
            preview(&fixture.repo, &state.token, true)
                .err()
                .unwrap()
                .code,
            "PULL_REFERENCE"
        );
        git(
            &fixture.repo.path,
            &["update-ref", "--no-deref", "-d", "refs/remotes/equipo/main"],
        );
        git(
            &fixture.repo.path,
            &["update-ref", "refs/remotes/equipo/main", &fixture.base],
        );
        let plan = fixture.plan();
        fs::write(
            fixture.repo.path.join("archivo ü.txt"),
            "precious local data\n",
        )
        .unwrap();
        assert_eq!(
            integrate(&fixture.repo, plan, true).unwrap_err().code,
            "STALE"
        );
        assert_eq!(
            fs::read_to_string(fixture.repo.path.join("archivo ü.txt")).unwrap(),
            "precious local data\n"
        );
        fs::write(fixture.repo.path.join("archivo ü.txt"), "base\n").unwrap();
        let plan = fixture.plan();
        git(
            &fixture.repo.path,
            &["config", "branch.main.merge", "refs/heads/other"],
        );
        assert_eq!(
            integrate(&fixture.repo, plan, true).unwrap_err().code,
            "STALE"
        );
        git(
            &fixture.repo.path,
            &["config", "branch.main.merge", "refs/heads/main"],
        );
        git(&fixture.server, &["update-ref", "-d", "refs/heads/main"]);
        let state = options(&fixture.repo, true).unwrap();
        assert_eq!(
            preview(&fixture.repo, &state.token, true)
                .err()
                .unwrap()
                .code,
            "PULL_FETCH"
        );
        assert_eq!(
            git(&fixture.repo.path, &["rev-parse", "HEAD"]),
            fixture.base
        );
        assert!(!fixture.repo.path.join(".git/MERGE_HEAD").exists());
    }

    #[test]
    fn pull_divergence_uses_recoverable_merge_instead_of_implicit_rebase() {
        let fixture = Fixture::new();
        fs::write(fixture.repo.path.join("archivo ü.txt"), "local\n").unwrap();
        git(&fixture.repo.path, &["add", "--all"]);
        git(&fixture.repo.path, &["commit", "-m", "local"]);
        git(&fixture.repo.path, &["config", "pull.rebase", "true"]);
        git(
            &fixture.repo.path,
            &["config", "branch.main.mergeOptions", "-Xours"],
        );
        let plan = fixture.plan();
        assert_eq!(plan.view.merge.relation, "diverged");
        integrate(&fixture.repo, plan, true).unwrap();
        let pending = merge::read(&fixture.repo, true).unwrap().unwrap();
        assert_eq!(pending.conflicts, ["archivo ü.txt"]);
        merge::edit(&fixture.repo, &pending.token, merge::Edit::Abort, true).unwrap();
        assert_eq!(
            fs::read_to_string(fixture.repo.path.join("archivo ü.txt")).unwrap(),
            "local\n"
        );
        assert!(!fixture.repo.path.join(".git/rebase-merge").exists());
        let state = branches::read(&fixture.repo, true).unwrap();
        assert_eq!(
            merge::preview(&fixture.repo, &state.token, "peer", true)
                .unwrap()
                .relation,
            "diverged"
        );
    }
}
