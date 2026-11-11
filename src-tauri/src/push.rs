use crate::git::{GitError, Repository, Result};
use crate::remotes;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    pub branches: Vec<String>,
    pub current: Option<String>,
}
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub hash: String,
    pub subject: String,
}
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub token: String,
    pub remote: String,
    pub url: String,
    pub source_branch: String,
    pub source_hash: String,
    pub target_branch: String,
    pub target_hash: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub relation: String,
    pub commits: Vec<Commit>,
    pub can_push: bool,
    pub set_upstream: bool,
}
#[derive(Debug)]
pub struct Plan {
    pub view: Preview,
    config_token: String,
    config_stamp: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub status: &'static str,
    pub message: String,
    pub warning: Option<String>,
    pub state: Option<remotes::Remotes>,
}
fn error(code: &'static str, message: &str) -> GitError {
    GitError::new(code, message)
}
fn run(repo: &Repository, args: &[&str], network: bool) -> Result<String> {
    let out = remotes::command(repo, args, network)?;
    if !out.success {
        return Err(error(
            if network { "PUSH_ACCESS" } else { "PUSH_READ" },
            if network {
                "No se pudo leer el destino de publicación. Revisa acceso de lectura, credenciales y SSH. No se ha ejecutado push."
            } else {
                "No se pudo preparar la publicación desde el estado Git actual."
            },
        ));
    }
    String::from_utf8(out.bytes)
        .map_err(|_| error("ENCODING", "Git devolvió datos que no son UTF-8."))
}
fn valid_branch(repo: &Repository, branch: &str) -> Result<()> {
    if branch.is_empty()
        || branch.len() > 256
        || branch.starts_with('-')
        || branch.chars().any(char::is_control)
    {
        return Err(error(
            "PUSH_BRANCH",
            "Indica un nombre de rama válido, sin prefijo refs/heads/.",
        ));
    }
    if branch == "HEAD"
        || branch.starts_with("refs/")
        || !remotes::command(
            repo,
            &["check-ref-format", &format!("refs/heads/{branch}")],
            false,
        )?
        .success
    {
        return Err(error(
            "PUSH_BRANCH",
            "Indica un nombre de rama válido, sin prefijo refs/heads/.",
        ));
    }
    Ok(())
}
fn oid(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn source(repo: &Repository, branch: &str) -> Result<String> {
    valid_branch(repo, branch)?;
    let hash = run(
        repo,
        &[
            "rev-parse",
            "--verify",
            &format!("refs/heads/{branch}^{{commit}}"),
        ],
        false,
    )?
    .trim()
    .to_string();
    if !oid(&hash) {
        return Err(error(
            "PUSH_SOURCE",
            "La rama local no contiene un commit válido.",
        ));
    }
    Ok(hash)
}
pub(crate) fn ready(repo: &Repository) -> Result<()> {
    if run(repo, &["rev-parse", "--is-shallow-repository"], false)?.trim() == "true" {
        return Err(error(
            "PUSH_SHALLOW",
            "La revisión requiere un historial completo. Los repositorios shallow quedan fuera de esta fase.",
        ));
    }
    if remotes::command(repo, &["config", "--get", "extensions.partialClone"], false)?.success
        || remotes::command(
            repo,
            &["config", "--get-regexp", "^remote\\..*\\.promisor$"],
            false,
        )?
        .success
    {
        return Err(error(
            "PUSH_PARTIAL",
            "La revisión requiere objetos locales completos. Los clones parciales quedan fuera de esta fase.",
        ));
    }
    for name in [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
        "sequencer",
        "info/grafts",
    ] {
        let path = run(
            repo,
            &["rev-parse", "--path-format=absolute", "--git-path", name],
            false,
        )?;
        if std::path::Path::new(path.trim()).exists() {
            return Err(error(
                "PUSH_OPERATION",
                "Completa o aborta la operación Git pendiente antes de publicar.",
            ));
        }
    }
    if !run(repo, &["ls-files", "--unmerged", "-z"], false)?.is_empty() {
        return Err(error(
            "PUSH_CONFLICTS",
            "Resuelve los conflictos pendientes antes de publicar.",
        ));
    }
    Ok(())
}
pub fn options(repo: &Repository) -> Result<Options> {
    let branches = run(
        repo,
        &["for-each-ref", "--format=%(refname:strip=2)", "refs/heads/"],
        false,
    )?
    .lines()
    .map(String::from)
    .collect();
    let current = remotes::command(repo, &["symbolic-ref", "--quiet", "--short", "HEAD"], false)?;
    Ok(Options {
        branches,
        current: if current.success {
            Some(String::from_utf8_lossy(&current.bytes).trim().into())
        } else {
            None
        },
    })
}
fn advertised(repo: &Repository, url: &str, branch: &str) -> Result<Option<String>> {
    let target = format!("refs/heads/{branch}");
    let output = run(repo, &["ls-remote", "--refs", "--", url, &target], true)?;
    let mut found = None;
    for line in output.lines() {
        let Some((hash, name)) = line.split_once('\t') else {
            return Err(error(
                "PUSH_ADVERTISEMENT",
                "El servidor devolvió referencias no interpretables.",
            ));
        };
        if name == target && oid(hash) {
            if found.is_some() {
                return Err(error(
                    "PUSH_ADVERTISEMENT",
                    "El destino devolvió referencias duplicadas.",
                ));
            }
            found = Some(hash.to_string());
        } else {
            return Err(error(
                "PUSH_ADVERTISEMENT",
                "La respuesta no coincide con la rama de destino.",
            ));
        }
    }
    Ok(found)
}
fn config_stamp(repo: &Repository) -> Result<String> {
    let mut digest = Sha256::new();
    for args in [
        vec!["config", "--includes", "--list", "--null"],
        vec!["config", "--local", "--no-includes", "--list", "--null"],
    ] {
        digest.update(run(repo, &args, false)?.as_bytes());
    }
    Ok(format!("{:x}", digest.finalize()))
}
fn set_tracking(repo: &Repository, view: &Preview) -> Result<()> {
    let tracking = format!("refs/remotes/{}/{}", view.remote, view.target_branch);
    let old = remotes::command(repo, &["rev-parse", "--verify", &tracking], false)?;
    let expected = if old.success {
        String::from_utf8_lossy(&old.bytes).trim().to_string()
    } else {
        "0".repeat(view.source_hash.len())
    };
    if !remotes::command(
        repo,
        &[
            "update-ref",
            "--no-deref",
            &tracking,
            &view.source_hash,
            &expected,
        ],
        false,
    )?
    .success
    {
        return Err(stale());
    }
    run(
        repo,
        &[
            "branch",
            "--set-upstream-to",
            &tracking,
            &view.source_branch,
        ],
        false,
    )?;
    Ok(())
}
fn stale() -> GitError {
    error(
        "STALE_PUSH",
        "La rama, configuración o destino cambió. Vuelve a revisar antes de publicar.",
    )
}
pub fn preview(
    repo: &Repository,
    token: &str,
    remote: &str,
    source_branch: &str,
    target_branch: &str,
    set_upstream: bool,
    trusted: bool,
) -> Result<Plan> {
    let state = remotes::checked(repo, token, trusted)?;
    ready(repo)?;
    valid_branch(repo, target_branch)?;
    let source_hash = source(repo, source_branch)?;
    let remote_info = state.remotes.iter().find(|r| r.name == remote && r.push_allowed)
        .ok_or_else(|| error("PUSH_RESTRICTED", "El remoto requiere una configuración estándar y una única URL de publicación segura."))?;
    let url = remote_info.push_urls[0].clone();
    if !remotes::safe_url(&url) {
        return Err(error("PUSH_URL", "La URL de publicación está restringida."));
    }
    if set_upstream && remote_info.fetch_urls != remote_info.push_urls {
        return Err(error(
            "PUSH_UPSTREAM",
            "El seguimiento requiere que descarga y publicación compartan destino. Publica sin cambiar upstream.",
        ));
    }
    let target_hash = advertised(repo, &url, target_branch)?;
    if let Some(hash) = &target_hash {
        if !remotes::command(
            repo,
            &["cat-file", "-e", &format!("{hash}^{{commit}}")],
            false,
        )?
        .success
        {
            run(
                repo,
                &[
                    "fetch",
                    "--refmap=",
                    "--no-tags",
                    "--no-prune",
                    "--no-recurse-submodules",
                    "--no-write-fetch-head",
                    "--no-auto-maintenance",
                    "--no-write-commit-graph",
                    "--",
                    &url,
                    &format!("refs/heads/{target_branch}"),
                ],
                true,
            )?;
        }
        // Read the live destination twice: fetch may have raced a server update.
        if advertised(repo, &url, target_branch)? != target_hash {
            return Err(stale());
        }
        if !remotes::command(
            repo,
            &["cat-file", "-e", &format!("{hash}^{{commit}}")],
            false,
        )?
        .success
        {
            return Err(error(
                "PUSH_HISTORY",
                "No se pudo obtener el historial de la rama de destino.",
            ));
        }
    }
    let (ahead, behind) = if let Some(hash) = &target_hash {
        let counts = run(
            repo,
            &[
                "rev-list",
                "--left-right",
                "--count",
                &format!("{source_hash}...{hash}"),
            ],
            false,
        )?;
        let values: Vec<_> = counts.split_whitespace().collect();
        if values.len() != 2 {
            return Err(error("PUSH_HISTORY", "No se pudo comparar el historial."));
        }
        (
            values[0].parse::<usize>().map_err(|_| stale())?,
            values[1].parse::<usize>().map_err(|_| stale())?,
        )
    } else {
        (
            run(repo, &["rev-list", "--count", &source_hash], false)?
                .trim()
                .parse::<usize>()
                .map_err(|_| stale())?,
            0,
        )
    };
    let range = target_hash
        .as_ref()
        .map(|h| format!("{h}..{source_hash}"))
        .unwrap_or_else(|| source_hash.clone());
    let log = run(
        repo,
        &[
            "log",
            "--topo-order",
            "-200",
            "--format=%H%x00%s",
            &range,
            "--",
        ],
        false,
    )?;
    let commits = log
        .lines()
        .map(|line| {
            let (hash, subject) = line.split_once('\0').ok_or_else(stale)?;
            Ok(Commit {
                hash: hash.into(),
                subject: subject.into(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    remotes::checked(repo, token, trusted)?;
    if source(repo, source_branch)? != source_hash {
        return Err(stale());
    }
    let relation = match (target_hash.is_none(), ahead, behind) {
        (true, _, _) => "new",
        (_, 0, 0) => "equal",
        (_, _, 0) => "ahead",
        (_, 0, _) => "behind",
        _ => "diverged",
    };
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let nonce = NEXT.fetch_add(1, Ordering::Relaxed);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let preview_token = format!(
        "{:x}",
        Sha256::digest(format!("{}:{token}:{nonce}:{stamp}", repo.id))
    );
    Ok(Plan {
        config_token: token.into(),
        config_stamp: config_stamp(repo)?,
        view: Preview {
            token: preview_token,
            remote: remote.into(),
            url,
            source_branch: source_branch.into(),
            source_hash,
            target_branch: target_branch.into(),
            target_hash,
            ahead,
            behind,
            relation: relation.into(),
            commits,
            can_push: behind == 0 && (ahead > 0 || set_upstream),
            set_upstream,
        },
    })
}
pub fn publish(repo: &Repository, plan: Plan, trusted: bool) -> Result<Outcome> {
    let view = &plan.view;
    remotes::checked(repo, &plan.config_token, trusted)?;
    ready(repo)?;
    if !view.can_push || source(repo, &view.source_branch)? != view.source_hash {
        return Err(stale());
    }
    if advertised(repo, &view.url, &view.target_branch)? != view.target_hash {
        return Err(stale());
    }
    remotes::checked(repo, &plan.config_token, trusted)?;
    ready(repo)?;
    if source(repo, &view.source_branch)? != view.source_hash {
        return Err(stale());
    }
    // A normal, fully qualified single refspec with a frozen source object. Never force or delete.
    let refspec = format!("{}:refs/heads/{}", view.source_hash, view.target_branch);
    let output = remotes::command(repo, &["-c", "push.followTags=false", "push", "--porcelain", "--no-force", "--no-mirror", "--no-follow-tags", "--recurse-submodules=no", "--", &view.url, &refspec], true)
        .map_err(|_| error("PUSH_UNCERTAIN", "La publicación se interrumpió. Su resultado puede ser incierto; consulta el destino antes de volver a revisar. No hay reintentos automáticos."))?;
    if !output.success {
        return Err(error(
            "PUSH_REJECTED",
            "Git o el servidor rechazaron la publicación, o la conexión terminó sin confirmación. Puede deberse a divergencia, permisos, reglas o hooks. Comprueba el destino y vuelve a revisar; no se reintenta automáticamente.",
        ));
    }
    if advertised(repo, &view.url, &view.target_branch)
        .ok()
        .flatten()
        .as_deref()
        != Some(&view.source_hash)
    {
        return Ok(Outcome { status: "uncertain", message:"Git informó que el push terminó.".into(), warning:Some("No se pudo confirmar que el destino conserve el commit publicado. Consulta su estado antes de repetir; upstream no se modificó.".into()), state:remotes::read(repo, trusted).ok() });
    }
    let mut warning = None;
    if view.set_upstream {
        // Recheck config/source after hooks and server activity before touching local tracking.
        if config_stamp(repo).ok().as_deref() != Some(&plan.config_stamp)
            || source(repo, &view.source_branch).ok().as_deref() != Some(&view.source_hash)
        {
            warning = Some("Push confirmado; cambió el estado local y no se estableció upstream. Revísalo desde Git.".into());
        } else if set_tracking(repo, view).is_err() {
            warning = Some("Push confirmado; el seguimiento local puede haber quedado incompleto. Revisa refs y configuración desde Git; no repitas el push para corregirlo.".into());
        }
    }
    let state = remotes::read(repo, trusted).ok();
    if state.is_none() && warning.is_none() {
        warning = Some(
            "Push confirmado; no se pudo actualizar la vista local. Actualiza antes de continuar."
                .into(),
        );
    }
    Ok(Outcome {
        status: if view.relation == "equal" {
            "unchanged"
        } else {
            "confirmed"
        },
        message: format!(
            "Push confirmado: {} → {}/{}.",
            view.source_branch, view.remote, view.target_branch
        ),
        warning,
        state,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf, process::Command};
    struct Fixture {
        root: PathBuf,
        repo: Repository,
        server: String,
        other: String,
    }
    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let root = std::env::temp_dir().join(format!(
                "ravengit-push-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(root.join("work")).unwrap();
            let work = root.join("work");
            let call = |args: &[&str]| {
                let out = Command::new("git")
                    .args(args)
                    .current_dir(&work)
                    .output()
                    .unwrap();
                assert!(
                    out.status.success(),
                    "{}",
                    String::from_utf8_lossy(&out.stderr)
                );
            };
            call(&["init", "-b", "main"]);
            call(&["config", "user.name", "RavenGit Fixture"]);
            call(&["config", "user.email", "fixture@example.invalid"]);
            call(&["config", "commit.gpgSign", "false"]);
            call(&["config", "core.autocrlf", "false"]);
            call(&[
                "config",
                "core.hooksPath",
                work.join(".git/hooks").to_str().unwrap(),
            ]);
            call(&["config", "push.gpgSign", "false"]);
            call(&["init", "--bare", root.join("server.git").to_str().unwrap()]);
            call(&["init", "--bare", root.join("other.git").to_str().unwrap()]);
            let server = root.join("server.git").to_string_lossy().into_owned();
            let other = root.join("other.git").to_string_lossy().into_owned();
            call(&["remote", "add", "origin", &server]);
            fs::write(work.join("file.txt"), "base\n").unwrap();
            call(&["add", "."]);
            call(&["commit", "-m", "base"]);
            let repo = crate::git::open(&work, "push-fixture".into()).unwrap().0;
            Self {
                root,
                repo,
                server,
                other,
            }
        }
        fn git(&self, args: &[&str]) -> String {
            let out = Command::new("git")
                .args(args)
                .current_dir(&self.repo.path)
                .output()
                .unwrap();
            assert!(
                out.status.success(),
                "{:?}: {}",
                args,
                String::from_utf8_lossy(&out.stderr)
            );
            String::from_utf8(out.stdout).unwrap().trim().into()
        }
        fn commit(&self, content: &str) {
            fs::write(self.repo.path.join("file.txt"), content).unwrap();
            self.git(&["add", "."]);
            self.git(&["commit", "-m", content]);
        }
        fn plan(&self, branch: &str, upstream: bool) -> Plan {
            preview(
                &self.repo,
                &remotes::read(&self.repo, true).unwrap().token,
                "origin",
                "main",
                branch,
                upstream,
                true,
            )
            .unwrap()
        }
        fn seed(&self) {
            self.git(&["push", &self.server, "main:main"]);
        }
        fn server_advance(&self) {
            self.git(&["checkout", "-b", "server-change"]);
            self.commit("server advance");
            self.git(&["push", &self.server, "server-change:main"]);
            self.git(&["checkout", "main"]);
        }
        fn head(&self, url: &str, branch: &str) -> Option<String> {
            advertised(&self.repo, url, branch).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
    #[test]
    fn preview_new_branch_does_not_publish_and_push_sets_explicit_upstream() {
        let f = Fixture::new();
        let index = fs::read(f.repo.path.join(".git/index")).unwrap();
        let head = f.git(&["rev-parse", "HEAD"]);
        let plan = f.plan("review/new", true);
        assert_eq!(plan.view.relation, "new");
        assert_eq!(plan.view.ahead, 1);
        assert_eq!(plan.view.commits[0].subject, "base");
        assert!(f.head(&f.server, "review/new").is_none());
        let result = publish(&f.repo, plan, true).unwrap();
        assert_eq!(result.status, "confirmed");
        assert!(result.warning.is_none(), "{:?}", result.warning);
        assert_eq!(f.head(&f.server, "review/new").unwrap(), head);
        assert_eq!(f.git(&["config", "branch.main.remote"]), "origin");
        assert_eq!(
            f.git(&["config", "branch.main.merge"]),
            "refs/heads/review/new"
        );
        assert_eq!(f.git(&["rev-parse", "HEAD"]), head);
        assert_eq!(fs::read(f.repo.path.join(".git/index")).unwrap(), index);
        assert_eq!(
            fs::read_to_string(f.repo.path.join("file.txt")).unwrap(),
            "base\n"
        );
        assert!(!f.repo.path.join(".git/FETCH_HEAD").exists());
    }
    #[test]
    fn normal_fast_forward_publishes_only_frozen_branch_and_no_tags() {
        let f = Fixture::new();
        f.seed();
        f.commit("local advance");
        f.git(&["tag", "-a", "v-test", "-m", "tag"]);
        f.git(&["branch", "unrelated"]);
        f.git(&["config", "push.followTags", "true"]);
        f.git(&["config", "push.default", "matching"]);
        let p = f.plan("main", false);
        assert_eq!((p.view.ahead, p.view.behind), (1, 0));
        assert_eq!(p.view.relation, "ahead");
        publish(&f.repo, p, true).unwrap();
        assert_eq!(
            f.head(&f.server, "main").unwrap(),
            f.git(&["rev-parse", "HEAD"])
        );
        assert!(f.head(&f.server, "unrelated").is_none());
        assert_eq!(f.git(&["ls-remote", "--tags", &f.server]), "");
    }
    #[test]
    fn behind_divergence_and_equal_are_reported_and_not_published() {
        let f = Fixture::new();
        f.seed();
        let equal = f.plan("main", false);
        assert_eq!(equal.view.relation, "equal");
        assert!(!equal.view.can_push);
        f.server_advance();
        let behind = f.plan("main", false);
        assert_eq!(behind.view.relation, "behind");
        assert!(!behind.view.can_push);
        assert!(publish(&f.repo, behind, true).is_err());
        f.commit("different local advance");
        let diverged = f.plan("main", false);
        assert_eq!(diverged.view.relation, "diverged");
        assert_eq!((diverged.view.ahead, diverged.view.behind), (1, 1));
        assert!(publish(&f.repo, diverged, true).is_err());
        assert_ne!(
            f.head(&f.server, "main").unwrap(),
            f.git(&["rev-parse", "HEAD"])
        );
    }
    #[test]
    fn actual_push_destination_is_compared_when_fetch_url_differs() {
        let f = Fixture::new();
        f.seed();
        f.git(&["remote", "set-url", "--push", "origin", &f.other]);
        let p = f.plan("main", false);
        assert_eq!(p.view.url, f.other);
        assert_eq!(p.view.relation, "new");
        publish(&f.repo, p, true).unwrap();
        assert!(f.head(&f.other, "main").is_some());
        let state = remotes::read(&f.repo, true).unwrap();
        assert_eq!(
            preview(&f.repo, &state.token, "origin", "main", "main", true, true)
                .unwrap_err()
                .code,
            "PUSH_UPSTREAM"
        );
    }
    #[test]
    fn changed_local_source_or_configuration_invalidates_review() {
        let f = Fixture::new();
        let p = f.plan("main", false);
        f.commit("changed after review");
        assert_eq!(publish(&f.repo, p, true).unwrap_err().code, "STALE_REMOTES");
        assert!(f.head(&f.server, "main").is_none());
        let p = f.plan("main", false);
        f.git(&["remote", "set-url", "--push", "origin", &f.other]);
        assert_eq!(publish(&f.repo, p, true).unwrap_err().code, "STALE_REMOTES");
        assert!(f.head(&f.other, "main").is_none());
    }
    #[test]
    fn changed_server_tip_or_new_branch_appearing_invalidates_review() {
        let f = Fixture::new();
        f.seed();
        f.commit("local advance");
        f.git(&["push", &f.server, "main:staging"]);
        let p = f.plan("main", false);
        f.git(&[
            "--git-dir",
            &f.server,
            "update-ref",
            "refs/heads/main",
            &f.git(&["rev-parse", "main"]),
        ]);
        assert_eq!(publish(&f.repo, p, true).unwrap_err().code, "STALE_PUSH");
        let p = f.plan("brand-new", false);
        f.git(&[
            "--git-dir",
            &f.server,
            "update-ref",
            "refs/heads/brand-new",
            &f.git(&["rev-parse", "main"]),
        ]);
        assert_eq!(publish(&f.repo, p, true).unwrap_err().code, "STALE_PUSH");
    }
    #[test]
    fn trust_branch_validation_and_pending_operation_are_enforced() {
        let f = Fixture::new();
        let state = remotes::read(&f.repo, true).unwrap();
        assert_eq!(
            preview(
                &f.repo,
                &state.token,
                "origin",
                "main",
                "main",
                false,
                false
            )
            .unwrap_err()
            .code,
            "TRUST_REQUIRED"
        );
        for target in [
            "HEAD",
            "-delete",
            ":main",
            "refs/heads/main",
            "bad..name",
            "main\nother",
            "",
        ] {
            assert_eq!(
                preview(&f.repo, &state.token, "origin", "main", target, false, true)
                    .unwrap_err()
                    .code,
                "PUSH_BRANCH"
            );
        }
        fs::write(f.repo.path.join(".git/MERGE_HEAD"), "a".repeat(40)).unwrap();
        assert_eq!(
            preview(&f.repo, &state.token, "origin", "main", "main", false, true)
                .unwrap_err()
                .code,
            "PUSH_OPERATION"
        );
        assert!(f.head(&f.server, "main").is_none());
    }
    #[test]
    fn rewritten_or_multiple_destinations_are_not_publishable() {
        let f = Fixture::new();
        f.git(&[
            "config",
            "url.https://example.invalid/.pushInsteadOf",
            "alias:",
        ]);
        assert!(!remotes::read(&f.repo, true).unwrap().remotes[0].push_allowed);
        assert_eq!(
            preview(
                &f.repo,
                &remotes::read(&f.repo, true).unwrap().token,
                "origin",
                "main",
                "main",
                false,
                true
            )
            .unwrap_err()
            .code,
            "PUSH_RESTRICTED"
        );
        f.git(&[
            "config",
            "--unset-all",
            "url.https://example.invalid/.pushInsteadOf",
        ]);
        f.git(&["remote", "set-url", "--add", "--push", "origin", &f.server]);
        f.git(&["remote", "set-url", "--add", "--push", "origin", &f.other]);
        assert!(!remotes::read(&f.repo, true).unwrap().remotes[0].push_allowed);
    }
    fn hook(path: &std::path::Path, script: &str) {
        #[cfg(unix)]
        use std::os::unix::fs::PermissionsExt;
        fs::write(path, script).unwrap();
        #[cfg(unix)]
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    }
    #[test]
    fn local_and_server_hook_rejections_preserve_commits_and_index() {
        let f = Fixture::new();
        let p = f.plan("main", false);
        let before = fs::read(f.repo.path.join(".git/index")).unwrap();
        hook(
            &f.repo.path.join(".git/hooks/pre-push"),
            "#!/bin/sh\nexit 1\n",
        );
        assert_eq!(publish(&f.repo, p, true).unwrap_err().code, "PUSH_REJECTED");
        assert!(f.head(&f.server, "main").is_none());
        fs::remove_file(f.repo.path.join(".git/hooks/pre-push")).unwrap();
        hook(
            &PathBuf::from(&f.server).join("hooks/pre-receive"),
            "#!/bin/sh\nexit 1\n",
        );
        let p = f.plan("main", false);
        assert_eq!(publish(&f.repo, p, true).unwrap_err().code, "PUSH_REJECTED");
        assert_eq!(fs::read(f.repo.path.join(".git/index")).unwrap(), before);
        assert_eq!(f.git(&["log", "-1", "--format=%s"]), "base");
    }
    #[test]
    fn upstream_failure_after_success_does_not_report_push_failure() {
        let f = Fixture::new();
        let p = f.plan("main", true);
        fs::write(f.repo.path.join(".git/config.lock"), "existing lock").unwrap();
        let result = publish(&f.repo, p, true).unwrap();
        assert_eq!(result.status, "confirmed");
        assert!(result.message.contains("Push confirmado"));
        assert!(result.warning.unwrap().contains("seguimiento local"));
        assert!(f.head(&f.server, "main").is_some());
        assert_eq!(
            fs::read_to_string(f.repo.path.join(".git/config.lock")).unwrap(),
            "existing lock"
        );
    }
    #[test]
    fn equal_destination_with_tracking_reports_no_new_commits() {
        let f = Fixture::new();
        f.seed();
        let result = publish(&f.repo, f.plan("main", true), true).unwrap();
        assert_eq!(result.status, "unchanged");
        assert_eq!(f.git(&["config", "branch.main.remote"]), "origin");
    }
    #[test]
    fn successful_command_without_matching_remote_tip_is_uncertain() {
        let f = Fixture::new();
        f.seed();
        let old = f.git(&["rev-parse", "HEAD"]);
        f.commit("advance");
        hook(
            &PathBuf::from(&f.server).join("hooks/post-receive"),
            &format!("#!/bin/sh\ngit update-ref refs/heads/main {old}\n"),
        );
        let result = publish(&f.repo, f.plan("main", true), true).unwrap();
        assert_eq!(result.status, "uncertain");
        assert!(result.warning.is_some());
        assert_eq!(f.head(&f.server, "main").as_deref(), Some(old.as_str()));
    }
    #[test]
    fn comparison_downloads_missing_history_without_changing_refs_or_fetch_head() {
        let f = Fixture::new();
        f.seed();
        let clone = f.root.join("external").to_string_lossy().into_owned();
        f.git(&["clone", "--branch", "main", &f.server, &clone]);
        f.git(&["-C", &clone, "config", "user.name", "Other fixture"]);
        f.git(&[
            "-C",
            &clone,
            "config",
            "user.email",
            "other@example.invalid",
        ]);
        f.git(&[
            "-C",
            &clone,
            "-c",
            "commit.gpgSign=false",
            "commit",
            "--allow-empty",
            "-m",
            "external advance",
        ]);
        f.git(&["-C", &clone, "push", "origin", "main"]);
        let refs = f.git(&["show-ref"]);
        let head = f.git(&["rev-parse", "HEAD"]);
        let p = f.plan("main", false);
        assert_eq!(p.view.relation, "behind");
        assert_eq!(p.view.behind, 1);
        assert_eq!(f.git(&["show-ref"]), refs);
        assert_eq!(f.git(&["rev-parse", "HEAD"]), head);
        assert!(!f.repo.path.join(".git/FETCH_HEAD").exists());
    }
    #[test]
    fn partial_and_shallow_repositories_require_a_complete_history() {
        let f = Fixture::new();
        f.git(&["config", "remote.origin.promisor", "true"]);
        assert_eq!(ready(&f.repo).unwrap_err().code, "PUSH_PARTIAL");
        f.git(&["config", "--unset", "remote.origin.promisor"]);
        fs::write(
            f.repo.path.join(".git/shallow"),
            format!("{}\n", f.git(&["rev-parse", "HEAD"])),
        )
        .unwrap();
        assert_eq!(ready(&f.repo).unwrap_err().code, "PUSH_SHALLOW");
    }
    #[test]
    fn publishing_requires_trust_again_and_never_deletes_a_branch() {
        let f = Fixture::new();
        let plan = f.plan("main", false);
        assert_eq!(
            publish(&f.repo, plan, false).unwrap_err().code,
            "TRUST_REQUIRED"
        );
        assert!(f.head(&f.server, "main").is_none());
        assert_eq!(source(&f.repo, "").unwrap_err().code, "PUSH_BRANCH");
    }
}
