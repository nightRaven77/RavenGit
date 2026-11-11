use crate::{
    git::{GitError, Repository, Result},
    push, remotes,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Serialize)]
pub struct Tag {
    pub name: String,
    pub hash: String,
}
#[derive(Serialize)]
pub struct Options {
    pub state: remotes::Remotes,
    pub tags: Vec<Tag>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub token: String,
    pub tag: String,
    pub hash: String,
    pub remote: String,
    pub url: String,
    pub target_hash: Option<String>,
    pub relation: &'static str,
    pub can_push: bool,
}
pub struct Plan {
    pub view: Preview,
    config_token: String,
}
#[derive(Serialize)]
pub struct Outcome {
    pub message: String,
    pub warning: Option<String>,
}
fn error(message: &str) -> GitError {
    GitError::new("TAG_PUSH", message)
}
fn run(repo: &Repository, args: &[&str], network: bool) -> Result<String> {
    let output = remotes::command(repo, args, network)?;
    if !output.success {
        return Err(if network {
            GitError::new(
                "TAG_REMOTE_READ",
                "Git no pudo consultar la etiqueta en la URL de publicación (ls-remote). No se inició el push. Comprueba que esa URL permita lectura con tu cuenta o clave SSH; si Fetch funciona, compara también el destino de descarga con el de publicación.",
            )
        } else {
            GitError::new(
                "TAG_LOCAL_READ",
                "Git no pudo leer las etiquetas locales (for-each-ref). Esta lectura no usa SSH ni contacta el remoto. Comprueba integridad del repositorio, objetos y permisos de lectura locales.",
            )
        });
    }
    String::from_utf8(output.bytes).map_err(|_| error("Git devolvió referencias no UTF-8."))
}
fn oid(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}
fn tags(repo: &Repository) -> Result<Vec<Tag>> {
    run(
        repo,
        &[
            "for-each-ref",
            "--format=%(refname:strip=2)%00%(objectname)%00%(objecttype)",
            "refs/tags/",
        ],
        false,
    )?
    .lines()
    .filter_map(|line| {
        let fields: Vec<_> = line.split('\0').collect();
        if fields.len() != 3 || !oid(fields[1]) {
            return Some(Err(error("No se pudo interpretar una etiqueta local.")));
        }
        if fields[2] != "commit" {
            return None;
        }
        Some(Ok(Tag {
            name: fields[0].into(),
            hash: fields[1].into(),
        }))
    })
    .collect()
}
fn source(repo: &Repository, name: &str) -> Result<String> {
    tags(repo)?.into_iter().find(|tag|tag.name==name).map(|tag|tag.hash).ok_or_else(||error("Selecciona una etiqueta ligera local existente. No se publican etiquetas anotadas en este incremento."))
}
pub fn options(repo: &Repository, trusted: bool) -> Result<Options> {
    if !trusted {
        return Ok(Options {
            state: remotes::Remotes {
                token: String::new(),
                remotes: vec![],
                trusted: false,
            },
            tags: vec![],
        });
    }
    Ok(Options {
        state: remotes::read(repo, true)?,
        tags: tags(repo)?,
    })
}
fn advertised(repo: &Repository, url: &str, name: &str) -> Result<Option<String>> {
    let reference = format!("refs/tags/{name}");
    let output = run(repo, &["ls-remote", "--refs", "--", url, &reference], true)?;
    let mut found = None;
    for line in output.lines() {
        let (hash, target) = line
            .split_once('\t')
            .ok_or_else(|| error("El remoto devolvió referencias no interpretables."))?;
        if target != reference || !oid(hash) || found.is_some() {
            return Err(error(
                "La respuesta remota no coincide con la etiqueta seleccionada.",
            ));
        }
        found = Some(hash.into());
    }
    Ok(found)
}
pub fn preview(
    repo: &Repository,
    token: &str,
    remote: &str,
    tag: &str,
    trusted: bool,
) -> Result<Plan> {
    let state = remotes::checked(repo, token, trusted)?;
    push::ready(repo)?;
    let hash = source(repo, tag)?;
    let info = state
        .remotes
        .iter()
        .find(|entry| entry.name == remote && entry.push_allowed)
        .ok_or_else(|| {
            error(
                "El remoto requiere una única URL de publicación segura y configuración estándar.",
            )
        })?;
    let url = info.push_urls[0].clone();
    if !remotes::safe_url(&url) {
        return Err(error("El destino de publicación está restringido."));
    }
    let target_hash = advertised(repo, &url, tag)?;
    remotes::checked(repo, token, trusted)?;
    if source(repo, tag)? != hash {
        return Err(error("La etiqueta local cambió. Vuelve a revisar."));
    }
    let relation = match target_hash.as_deref() {
        None => "new",
        Some(target) if target == hash => "equal",
        _ => "conflict",
    };
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let nonce = NEXT.fetch_add(1, Ordering::Relaxed);
    let view = Preview {
        token: format!(
            "{:x}",
            Sha256::digest(format!("{}:{token}:{tag}:{remote}:{nonce}", repo.id))
        ),
        tag: tag.into(),
        hash,
        remote: remote.into(),
        url,
        target_hash,
        relation,
        can_push: relation == "new",
    };
    Ok(Plan {
        view,
        config_token: token.into(),
    })
}
pub fn publish(repo: &Repository, plan: Plan, trusted: bool) -> Result<Outcome> {
    let view = &plan.view;
    if !view.can_push {
        return Err(error(
            "La etiqueta ya existe en el remoto. No se reemplaza ni se vuelve a publicar.",
        ));
    }
    remotes::checked(repo, &plan.config_token, trusted)?;
    push::ready(repo)?;
    if source(repo, &view.tag)? != view.hash
        || advertised(repo, &view.url, &view.tag)? != view.target_hash
    {
        return Err(error(
            "La etiqueta local o remota cambió. Vuelve a revisar antes de publicar.",
        ));
    }
    remotes::checked(repo, &plan.config_token, trusted)?;
    if source(repo, &view.tag)? != view.hash {
        return Err(error("La etiqueta local cambió. Vuelve a revisar."));
    }
    let refspec = format!("{}:refs/tags/{}", view.hash, view.tag);
    let output=remotes::command(repo,&["-c","push.followTags=false","push","--porcelain","--no-force","--no-mirror","--no-follow-tags","--no-prune","--recurse-submodules=no","--",&view.url,&refspec],true).map_err(|_|error("Publicación interrumpida; el resultado puede ser incierto. Comprueba el remoto antes de repetir. No hay reintento automático."))?;
    if !output.success {
        return Err(error(
            "Git o el servidor no confirmaron la publicación. Revisa el remoto, permisos, reglas y hooks antes de repetir; no se fuerza el reemplazo.",
        ));
    }
    let confirmed = advertised(repo, &view.url, &view.tag)
        .ok()
        .flatten()
        .as_deref()
        == Some(view.hash.as_str());
    Ok(Outcome {
        message: if confirmed {
            format!(
                "Etiqueta {} publicada y confirmada en {}. No se creó ninguna release.",
                view.tag, view.remote
            )
        } else {
            "Git informó que la publicación terminó.".into()
        },
        warning: if confirmed {
            None
        } else {
            Some("No se pudo confirmar el hash remoto después del push. Comprueba el destino antes de repetir; no vuelvas a publicar automáticamente.".into())
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};
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
                "ravengit-tag-push-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            let work = root.join("work");
            fs::create_dir_all(&work).unwrap();
            let server = root.join("server.git").to_string_lossy().into_owned();
            let other = root.join("other.git").to_string_lossy().into_owned();
            let fixture = Self {
                root,
                repo: Repository {
                    id: "tag-push-fixture".into(),
                    path: work,
                },
                server,
                other,
            };
            fixture.git(&["init", "-b", "main"]);
            for (name, value) in [
                ("user.name", "Fixture"),
                ("user.email", "fixture@example.invalid"),
                ("commit.gpgSign", "false"),
                ("push.gpgSign", "false"),
                ("core.autocrlf", "false"),
            ] {
                fixture.git(&["config", name, value]);
            }
            fixture.git(&[
                "config",
                "core.hooksPath",
                fixture.repo.path.join(".git/no-hooks").to_str().unwrap(),
            ]);
            fixture.git(&["init", "--bare", &fixture.server]);
            fixture.git(&["init", "--bare", &fixture.other]);
            fixture.git(&["remote", "add", "origin", &fixture.server]);
            fs::write(fixture.repo.path.join("file"), "base").unwrap();
            fixture.git(&["add", "--all"]);
            fixture.git(&["commit", "-m", "base"]);
            fixture.git(&["tag", "v1"]);
            fixture
        }
        fn git(&self, args: &[&str]) -> String {
            crate::git::text(&self.repo.path, args)
                .unwrap()
                .trim()
                .into()
        }
        fn plan(&self) -> Plan {
            let state = remotes::read(&self.repo, true).unwrap();
            preview(&self.repo, &state.token, "origin", "v1", true).unwrap()
        }
        fn remote_refs(&self, server: &str) -> String {
            self.git(&[
                "--git-dir",
                server,
                "for-each-ref",
                "--format=%(refname) %(objectname)",
            ])
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
    #[test]
    fn publishes_only_selected_lightweight_tag_even_with_follow_tags_enabled() {
        let fixture = Fixture::new();
        fixture.git(&["tag", "other-light"]);
        fixture.git(&["tag", "-a", "other-annotated", "-m", "not selected"]);
        fixture.git(&["config", "push.followTags", "true"]);
        let head = fixture.git(&["rev-parse", "HEAD"]);
        let index = fs::read(fixture.repo.path.join(".git/index")).unwrap();
        let plan = fixture.plan();
        assert_eq!(plan.view.relation, "new");
        assert!(plan.view.can_push);
        assert!(fixture.remote_refs(&fixture.server).is_empty());
        let outcome = publish(&fixture.repo, plan, true).unwrap();
        assert!(outcome.warning.is_none());
        assert_eq!(
            fixture.remote_refs(&fixture.server),
            format!("refs/tags/v1 {head}")
        );
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]), head);
        assert_eq!(
            fs::read(fixture.repo.path.join(".git/index")).unwrap(),
            index
        );
        assert!(fixture.remote_refs(&fixture.other).is_empty());
    }
    #[test]
    fn equal_and_conflicting_remote_tags_never_enable_publication() {
        let fixture = Fixture::new();
        fixture.git(&["push", "origin", "refs/tags/v1:refs/tags/v1"]);
        let same = fixture.plan();
        assert_eq!(same.view.relation, "equal");
        assert!(!same.view.can_push);
        assert!(publish(&fixture.repo, same, true).is_err());
        fixture.git(&["commit", "--allow-empty", "-m", "next"]);
        fixture.git(&["tag", "-f", "v1"]);
        let before = fixture.remote_refs(&fixture.server);
        let conflict = fixture.plan();
        assert_eq!(conflict.view.relation, "conflict");
        assert!(!conflict.view.can_push);
        assert!(publish(&fixture.repo, conflict, true).is_err());
        assert_eq!(fixture.remote_refs(&fixture.server), before);
    }
    #[test]
    fn changed_local_tag_or_remote_url_invalidates_review() {
        for change in ["tag", "url"] {
            let fixture = Fixture::new();
            let plan = fixture.plan();
            if change == "tag" {
                fixture.git(&["commit", "--allow-empty", "-m", "next"]);
                fixture.git(&["tag", "-f", "v1"]);
            } else {
                fixture.git(&["remote", "set-url", "origin", &fixture.other]);
            }
            assert!(publish(&fixture.repo, plan, true).is_err());
            assert!(fixture.remote_refs(&fixture.server).is_empty());
            assert!(fixture.remote_refs(&fixture.other).is_empty());
        }
    }
    #[test]
    fn a_tag_created_remotely_after_review_is_not_overwritten() {
        let fixture = Fixture::new();
        let plan = fixture.plan();
        fixture.git(&["commit", "--allow-empty", "-m", "different"]);
        let other = fixture.git(&["rev-parse", "HEAD"]);
        fixture.git(&["push", "origin", &format!("{other}:refs/tags/v1")]);
        assert!(publish(&fixture.repo, plan, true).is_err());
        assert_eq!(
            fixture.remote_refs(&fixture.server),
            format!("refs/tags/v1 {other}")
        );
    }
    #[test]
    fn checks_trust_and_rejects_annotated_sources_and_advanced_remotes() {
        let fixture = Fixture::new();
        assert!(options(&fixture.repo, false).unwrap().tags.is_empty());
        let state = remotes::read(&fixture.repo, true).unwrap();
        assert!(preview(&fixture.repo, &state.token, "origin", "v1", false).is_err());
        fixture.git(&["tag", "-a", "annotated", "-m", "not light"]);
        let state = remotes::read(&fixture.repo, true).unwrap();
        assert!(preview(&fixture.repo, &state.token, "origin", "annotated", true).is_err());
        fixture.git(&["config", "--add", "remote.origin.pushurl", &fixture.server]);
        fixture.git(&["config", "--add", "remote.origin.pushurl", &fixture.other]);
        let state = remotes::read(&fixture.repo, true).unwrap();
        assert!(preview(&fixture.repo, &state.token, "origin", "v1", true).is_err());
        assert!(fixture.remote_refs(&fixture.server).is_empty());
        assert!(fixture.remote_refs(&fixture.other).is_empty());
    }
    #[test]
    fn missing_repository_reports_access_failure_without_leaking_its_path() {
        let fixture = Fixture::new();
        let missing = fixture
            .root
            .join("private-missing.git")
            .to_string_lossy()
            .into_owned();
        fixture.git(&["remote", "set-url", "origin", &missing]);
        let state = remotes::read(&fixture.repo, true).unwrap();
        let failure = preview(&fixture.repo, &state.token, "origin", "v1", true)
            .err()
            .unwrap();
        assert_eq!(failure.code, "REMOTE_REPOSITORY");
        assert!(!failure.message.contains(&missing));
        assert!(!failure.message.contains("private-missing"));
    }
    #[test]
    fn local_read_failure_is_not_reported_as_an_ssh_or_remote_permission_problem() {
        let fixture = Fixture::new();
        let failure = run(
            &fixture.repo,
            &["for-each-ref", "--invalid-fixture-option"],
            false,
        )
        .err()
        .unwrap();
        assert_eq!(failure.code, "TAG_LOCAL_READ");
        assert!(failure.message.contains("no usa SSH"));
        assert!(!failure.message.contains("invalid-fixture-option"));
    }
    #[test]
    fn rejected_server_hook_does_not_leak_output_or_publish_other_refs() {
        let fixture = Fixture::new();
        let hooks = fixture.root.join("reject-hooks");
        fs::create_dir(&hooks).unwrap();
        let hook = hooks.join("pre-receive");
        fs::write(&hook, "#!/bin/sh\necho secret-fixture-token >&2\nexit 1\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
        }
        fixture.git(&[
            "--git-dir",
            &fixture.server,
            "config",
            "core.hooksPath",
            hooks.to_str().unwrap(),
        ]);
        let error = publish(&fixture.repo, fixture.plan(), true).err().unwrap();
        assert!(!error.message.contains("secret-fixture-token"));
        assert!(fixture.remote_refs(&fixture.server).is_empty());
    }
}
