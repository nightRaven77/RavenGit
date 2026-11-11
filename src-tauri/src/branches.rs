use crate::{
    changes,
    git::{self, GitError, Repository, Result},
    process,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::Duration;

#[derive(Debug, Serialize)]
pub struct Branch {
    pub name: String,
    pub hash: String,
}
#[derive(Debug, Serialize)]
pub struct State {
    #[serde(rename = "rebaseRecord")]
    pub rebase_record: bool,
    pub operation: Option<String>,
    pub token: String,
    pub trusted: bool,
    pub current: Option<String>,
    pub head: Option<String>,
    pub branches: Vec<Branch>,
    pub restriction: Option<String>,
}
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Edit {
    Create { name: String },
    Switch { name: String },
    Rename { source: String, name: String },
}
#[derive(Debug, Serialize)]
pub struct Outcome {
    pub message: String,
    pub warning: Option<String>,
}
fn error(code: &'static str, message: &str) -> GitError {
    GitError::new(code, message)
}
fn git_path(repo: &Repository, name: &str) -> Result<std::path::PathBuf> {
    Ok(std::path::PathBuf::from(
        git::text(
            &repo.path,
            &["rev-parse", "--path-format=absolute", "--git-path", name],
        )?
        .trim_end_matches('\n'),
    ))
}
pub fn read(repo: &Repository, trusted: bool) -> Result<State> {
    if !trusted {
        return Ok(State {
            rebase_record: false,
            operation: None,
            token: String::new(),
            trusted: false,
            current: None,
            head: None,
            branches: vec![],
            restriction: None,
        });
    }
    let changes = changes::read(repo, true)?;
    let refs = git::text(
        &repo.path,
        &[
            "for-each-ref",
            "--format=%(refname:strip=2)%00%(objectname)",
            "refs/heads/",
        ],
    )?;
    let branches = refs
        .lines()
        .map(|line| {
            let (name, hash) = line.split_once('\0').ok_or_else(|| {
                error("BRANCH_FORMAT", "No se pudo interpretar la lista de ramas.")
            })?;
            Ok(Branch {
                name: name.into(),
                hash: hash.into(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let worktrees = git::text(&repo.path, &["worktree", "list", "--porcelain", "-z"])?;
    let index = git::run(&repo.path, &["ls-files", "--stage", "-z"])?;
    let flags = git::run(&repo.path, &["ls-files", "-v", "-z"])?;
    let sparse =
        git::text(&repo.path, &["config", "--bool", "core.sparseCheckout"]).unwrap_or_default();
    let split = git::text(&repo.path, &["rev-parse", "--shared-index-path"])?;
    let restriction = if git_path(repo, "ravengit-stash.json")?.exists() {
        Some("Revisa la recuperación desde Stash antes de gestionar ramas.")
    } else if git_path(repo, "ravengit-replay.json")?.exists() {
        Some("Recupera la operación de commit o revisa su registro desde Operaciones de commit antes de gestionar ramas.")
    } else if changes.operation.is_some() || changes.entries.iter().any(|entry| entry.conflict) {
        Some("Termina la operación Git o resuelve los conflictos antes de gestionar ramas.")
    } else if !changes.entries.is_empty() {
        Some("Guarda tus cambios en un commit antes de gestionar ramas. Incluye los archivos sin seguimiento.")
    } else if changes.head.is_none() {
        Some("Crea el primer commit antes de gestionar ramas.")
    } else if worktrees.split('\0').filter(|field| field.starts_with("worktree ")).count() != 1 || repo.path.join(".git").is_file() {
        Some("La gestión de ramas con worktrees enlazados o directorios Git externos todavía no está disponible.")
    } else if index.split(|byte| *byte == 0).any(|entry| entry.starts_with(b"160000 ")) {
        Some("La gestión de ramas con submódulos todavía no está disponible.")
    } else if sparse.trim() == "true" || !split.trim().is_empty() {
        Some("La gestión de ramas con sparse checkout o split index todavía no está disponible.")
    } else if flags.split(|byte| *byte == 0).any(|entry| entry.first().is_some_and(|flag| flag.is_ascii_lowercase() || *flag == b'S')) {
        Some("Revisa las marcas assume-unchanged o skip-worktree desde Git antes de gestionar ramas; pueden ocultar cambios locales.")
    } else if git_path(repo, "index.lock")?.exists() || git_path(repo, "HEAD.lock")?.exists() {
        Some("Git está ocupado. No se elimina ningún lock existente.")
    } else {
        None
    }.map(String::from);
    let mut digest = Sha256::new();
    for field in [
        &changes.token,
        &refs,
        &worktrees,
        &sparse,
        &split,
        restriction.as_deref().unwrap_or(""),
    ] {
        digest.update((field.len() as u64).to_le_bytes());
        digest.update(field.as_bytes());
    }
    Ok(State {
        rebase_record: git_path(repo, "ravengit-rebase.json")?.exists(),
        operation: changes.operation,
        token: format!("{:x}", digest.finalize()),
        trusted: true,
        current: changes.branch,
        head: changes.head,
        branches,
        restriction,
    })
}
fn valid_name(repo: &Repository, name: &str) -> Result<()> {
    if name.is_empty()
        || name.len() > 256
        || name.starts_with('-')
        || name.starts_with("refs/")
        || name == "HEAD"
        || name.chars().any(char::is_control)
    {
        return Err(error(
            "BRANCH_NAME",
            "Indica un nombre de rama válido, sin prefijo refs/heads/.",
        ));
    }
    let mut command = process::git(&repo.path);
    command.args(["check-ref-format", &format!("refs/heads/{name}")]);
    let output = process::execute(command, None, Duration::from_secs(15))
        .map_err(|_| error("BRANCH_NAME", "No se pudo validar el nombre de rama."))?;
    if !output.success {
        return Err(error(
            "BRANCH_NAME",
            "Indica un nombre de rama válido, sin espacios ni caracteres especiales de Git.",
        ));
    }
    Ok(())
}
pub fn edit(repo: &Repository, token: &str, edit: Edit, trusted: bool) -> Result<Outcome> {
    if !trusted {
        return Err(error(
            "TRUST_REQUIRED",
            "Autoriza este repositorio antes de gestionar ramas.",
        ));
    }
    let state = read(repo, true)?;
    if state.token != token {
        return Err(error(
            "STALE_BRANCHES",
            "El repositorio cambió. Actualiza las ramas antes de continuar.",
        ));
    }
    if let Some(reason) = state.restriction {
        return Err(error("BRANCH_BLOCKED", &reason));
    }
    let head = state.head.as_deref().ok_or_else(|| {
        error(
            "BRANCH_EMPTY",
            "Crea el primer commit antes de gestionar ramas.",
        )
    })?;
    let (name, source) = match &edit {
        Edit::Create { name } | Edit::Switch { name } => (name, None),
        Edit::Rename { source, name } => (name, Some(source)),
    };
    valid_name(repo, name)?;
    if let Some(source) = source {
        valid_name(repo, source)?;
    }
    let existing = state.branches.iter().find(|branch| branch.name == *name);
    if !matches!(edit, Edit::Switch { .. })
        && state
            .branches
            .iter()
            .any(|branch| branch.name.eq_ignore_ascii_case(name))
    {
        return Err(error(
            "BRANCH_EXISTS",
            "Ya existe una rama con ese nombre o con distinta combinación de mayúsculas.",
        ));
    }
    let mut command = process::git(&repo.path);
    command
        .args([
            "-c",
            "submodule.recurse=false",
            "-c",
            "branch.autoSetupMerge=false",
        ])
        .env("GIT_NO_REPLACE_OBJECTS", "1")
        .env("GCM_INTERACTIVE", "never")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "");
    let (expected_hash, expected_current, message) = match &edit {
        Edit::Create { name } => {
            if existing.is_some() {
                return Err(error("BRANCH_EXISTS", "Ya existe una rama con ese nombre."));
            }
            command.args(["branch", "--no-track", "--", name, head]);
            (
                head.to_string(),
                state.current.clone(),
                format!(
                    "Rama {name} creada desde {}. La rama activa no cambió.",
                    &head[..8]
                ),
            )
        }
        Edit::Switch { name } => {
            let target = existing
                .ok_or_else(|| error("BRANCH_MISSING", "Selecciona una rama local existente."))?;
            if state.current.as_deref() == Some(name) {
                return Err(error("BRANCH_CURRENT", "Ya estás en esa rama."));
            }
            if state.current.is_none()
                && git::text(
                    &repo.path,
                    &[
                        "for-each-ref",
                        "--contains=HEAD",
                        "--format=%(refname)",
                        "refs/heads/",
                    ],
                )?
                .trim()
                .is_empty()
            {
                return Err(error(
                    "BRANCH_DETACHED",
                    "Crea primero una rama para conservar los commits de HEAD separado.",
                ));
            }
            let tree = git::run(&repo.path, &["ls-tree", "-r", "-z", &target.hash])?;
            if tree
                .split(|byte| *byte == 0)
                .any(|entry| entry.starts_with(b"160000 "))
            {
                return Err(error(
                    "BRANCH_SUBMODULE",
                    "La rama de destino contiene submódulos; todavía no se admite cambiar a ella.",
                ));
            }
            command.args([
                "switch",
                "--no-guess",
                "--no-overwrite-ignore",
                "--no-recurse-submodules",
                "--",
                name,
            ]);
            (
                target.hash.clone(),
                Some(name.clone()),
                format!("Rama activa: {name}."),
            )
        }
        Edit::Rename { source, name } => {
            if existing.is_some() {
                return Err(error("BRANCH_EXISTS", "Ya existe una rama con ese nombre."));
            }
            let branch = state
                .branches
                .iter()
                .find(|branch| branch.name == *source)
                .ok_or_else(|| {
                    error(
                        "BRANCH_MISSING",
                        "La rama que quieres renombrar ya no existe.",
                    )
                })?;
            command.args(["branch", "-m", "--", source, name]);
            (
                branch.hash.clone(),
                if state.current.as_deref() == Some(source) {
                    Some(name.clone())
                } else {
                    state.current.clone()
                },
                format!("Rama {source} renombrada a {name}."),
            )
        }
    };
    if read(repo, true)?.token != token {
        return Err(error(
            "STALE_BRANCHES",
            "El repositorio cambió durante la comprobación. Actualiza antes de continuar.",
        ));
    }
    let output = process::execute(command, None, Duration::from_secs(60)).map_err(|_| error("BRANCH_UNCERTAIN", "Git se interrumpió o excedió el tiempo permitido. Comprueba la rama activa y los archivos antes de repetir."))?;
    let reference = git::text(
        &repo.path,
        &["rev-parse", "--verify", &format!("refs/heads/{name}")],
    )
    .unwrap_or_default();
    let current = git::text(&repo.path, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .ok()
        .map(|value| value.trim().to_string());
    let actual_head = git::text(&repo.path, &["rev-parse", "--verify", "HEAD"]).unwrap_or_default();
    let expected_head = if matches!(edit, Edit::Switch { .. }) {
        &expected_hash
    } else {
        head
    };
    let old_removed = source.is_none_or(|source| {
        git::text(
            &repo.path,
            &["rev-parse", "--verify", &format!("refs/heads/{source}")],
        )
        .is_err()
    });
    if reference.trim() != expected_hash
        || current != expected_current
        || actual_head.trim() != expected_head
        || !old_removed
    {
        return Err(error(
            "BRANCH_FAILED",
            "No se pudo confirmar la operación de rama. Git pudo rechazarla por locks, archivos ocupados o cambios concurrentes. Actualiza y comprueba el estado antes de repetir; no se fuerza ni se descarta contenido.",
        ));
    }
    Ok(Outcome { message, warning: (!output.success).then(|| "El cambio de rama quedó confirmado, pero Git o un hook informó un error. Revisa sus efectos antes de continuar.".into()) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        sync::atomic::{AtomicU64, Ordering},
    };
    static NEXT: AtomicU64 = AtomicU64::new(0);
    struct Fixture(Repository);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "ravengit-branches-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            let fixture = Self(Repository {
                id: "fixture".into(),
                path,
            });
            for args in [
                vec!["init", "-b", "main"],
                vec!["config", "user.name", "Fixture"],
                vec!["config", "user.email", "fixture@example.invalid"],
                vec!["config", "commit.gpgsign", "false"],
                vec!["config", "core.autocrlf", "false"],
                vec!["config", "core.hooksPath", ".git/no-hooks"],
            ] {
                fixture.git(&args);
            }
            fs::write(fixture.0.path.join("archivo ü.txt"), "base\n").unwrap();
            fixture.git(&["add", "--all"]);
            fixture.git(&["commit", "-m", "base"]);
            fixture
        }
        fn git(&self, args: &[&str]) -> String {
            git::text(&self.0.path, args).unwrap()
        }
        fn edit(&self, edit: Edit) -> Result<Outcome> {
            edit_branch(self, edit)
        }
    }
    fn edit_branch(fixture: &Fixture, operation: Edit) -> Result<Outcome> {
        edit(&fixture.0, &read(&fixture.0, true)?.token, operation, true)
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0.path);
        }
    }
    #[test]
    fn merge_fast_forward_validates_review_and_preserves_ignored_files() {
        let fixture = Fixture::new();
        fixture.git(&["switch", "-c", "feature"]);
        fs::write(fixture.0.path.join("incoming.txt"), "incoming\n").unwrap();
        fixture.git(&["add", "--all"]);
        fixture.git(&["commit", "-m", "incoming"]);
        fixture.git(&["switch", "main"]);
        let state = read(&fixture.0, true).unwrap();
        let review = crate::merge::preview(&fixture.0, &state.token, "feature", true).unwrap();
        let start = || crate::merge::Edit::Start {
            source: "feature".into(),
            source_hash: review.source_hash.clone(),
            destination_hash: review.destination_hash.clone(),
        };
        assert_eq!(
            crate::merge::edit(&fixture.0, &state.token, start(), false)
                .unwrap_err()
                .code,
            "UNTRUSTED"
        );
        fs::write(fixture.0.path.join(".git/info/exclude"), "incoming.txt\n").unwrap();
        fs::write(
            fixture.0.path.join("incoming.txt"),
            "ignored precious data\n",
        )
        .unwrap();
        assert!(crate::merge::edit(&fixture.0, &state.token, start(), true).is_err());
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("incoming.txt")).unwrap(),
            "ignored precious data\n"
        );
        fs::remove_file(fixture.0.path.join("incoming.txt")).unwrap();
        let current = read(&fixture.0, true).unwrap();
        crate::merge::edit(&fixture.0, &current.token, start(), true).unwrap();
        assert_eq!(
            fixture.git(&["rev-parse", "HEAD"]).trim(),
            review.source_hash
        );
        assert!(crate::merge::read(&fixture.0, true).unwrap().is_none());
        assert_eq!(fixture.git(&["branch", "--show-current"]).trim(), "main");
    }

    fn divergent_fixture(conflict: bool) -> Fixture {
        let fixture = Fixture::new();
        fixture.git(&["switch", "-c", "feature"]);
        fs::write(fixture.0.path.join("archivo ü.txt"), "incoming\n").unwrap();
        fixture.git(&["add", "--all"]);
        fixture.git(&["commit", "-m", "incoming"]);
        fixture.git(&["switch", "main"]);
        fs::write(
            fixture.0.path.join(if conflict {
                "archivo ü.txt"
            } else {
                "local.txt"
            }),
            "local\n",
        )
        .unwrap();
        fixture.git(&["add", "--all"]);
        fixture.git(&["commit", "-m", "local"]);
        fixture
    }

    #[test]
    fn rebase_review_direction_integrity_and_stale_state() {
        let fixture = divergent_fixture(false);
        let state = read(&fixture.0, true).unwrap();
        let head = fixture.git(&["rev-parse", "HEAD"]);
        let index = fs::read(fixture.0.path.join(".git/index")).unwrap();
        let contents = fs::read(fixture.0.path.join("local.txt")).unwrap();
        let review = crate::rebase::preview(&fixture.0, &state.token, "feature", true).unwrap();
        assert_eq!(review.branch, "main");
        assert_eq!(review.base, "feature");
        assert_eq!(review.relation, "diverged");
        assert_eq!(review.candidates, 1);
        assert_eq!(review.commits[0].subject, "local");
        assert!(!review.contains_merges);
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]), head);
        assert_eq!(fs::read(fixture.0.path.join(".git/index")).unwrap(), index);
        assert_eq!(
            fs::read(fixture.0.path.join("local.txt")).unwrap(),
            contents
        );
        assert!(!fixture.0.path.join(".git/rebase-merge").exists());
        assert!(crate::rebase::preview(&fixture.0, &state.token, "missing", true).is_err());
        assert!(crate::rebase::preview(&fixture.0, &state.token, "main", true).is_err());
        fs::write(fixture.0.path.join("local.txt"), "changed\n").unwrap();
        assert_eq!(
            crate::rebase::preview(&fixture.0, &state.token, "feature", true)
                .unwrap_err()
                .code,
            "STALE"
        );
    }

    #[test]
    fn rebase_review_identifies_fast_forward_already_contained_and_merges() {
        let fixture = divergent_fixture(false);
        let state = read(&fixture.0, true).unwrap();
        fixture.git(&["merge", "--no-edit", "feature"]);
        let state_after = read(&fixture.0, true).unwrap();
        assert!(crate::rebase::preview(&fixture.0, &state.token, "feature", true).is_err());
        let review =
            crate::rebase::preview(&fixture.0, &state_after.token, "feature", true).unwrap();
        assert_eq!(review.relation, "upToDate");
        assert!(review.contains_merges);
        fixture.git(&["switch", "feature"]);
        let state = read(&fixture.0, true).unwrap();
        let review = crate::rebase::preview(&fixture.0, &state.token, "main", true).unwrap();
        assert_eq!(review.relation, "fastForward");
        assert_eq!(review.candidates, 0);
        fixture.git(&["config", "extensions.partialClone", "origin"]);
        assert!(crate::rebase::preview(&fixture.0, &state.token, "main", true).is_err());
    }

    fn start_merge(fixture: &Fixture) -> crate::merge::Outcome {
        let state = read(&fixture.0, true).unwrap();
        let review = crate::merge::preview(&fixture.0, &state.token, "feature", true).unwrap();
        crate::merge::edit(
            &fixture.0,
            &state.token,
            crate::merge::Edit::Start {
                source: review.source,
                source_hash: review.source_hash,
                destination_hash: review.destination_hash,
            },
            true,
        )
        .unwrap()
    }

    #[test]
    fn interactive_rebase_reorders_rewords_squashes_fixups_and_drops_with_backup() {
        use crate::{
            rebase,
            rebase_plan::{Action, Plan, Step},
        };
        let f = Fixture::new();
        f.git(&["branch", "feature"]);
        for name in ["A", "B", "C", "D", "E", "F"] {
            fs::write(f.0.path.join(name), name).unwrap();
            f.git(&["add", "--", name]);
            f.git(&["commit", "-m", name]);
        }
        let mut preview = rebase_plan(&f);
        let original = preview.head_hash.clone();
        let c = preview.commits.clone();
        let steps = vec![
            Step {
                hash: c[1].hash.clone(),
                action: Action::Pick,
                message: String::new(),
            },
            Step {
                hash: c[0].hash.clone(),
                action: Action::Reword,
                message: "Reescrito".into(),
            },
            Step {
                hash: c[2].hash.clone(),
                action: Action::Squash,
                message: "Agrupado ü\n\nCuerpo revisado".into(),
            },
            Step {
                hash: c[3].hash.clone(),
                action: Action::Fixup,
                message: String::new(),
            },
            Step {
                hash: c[4].hash.clone(),
                action: Action::Drop,
                message: String::new(),
            },
            Step {
                hash: c[5].hash.clone(),
                action: Action::Pick,
                message: String::new(),
            },
        ];
        crate::rebase_plan::validate(&preview, &steps).unwrap();
        preview.interactive = Some(Plan {
            token: "reviewed".into(),
            steps,
        });
        rebase::start(&f.0, preview, true).unwrap();
        assert_eq!(f.git(&["rev-list", "--count", "feature..HEAD"]).trim(), "3");
        assert_eq!(
            f.git(&["log", "--reverse", "--format=%s", "feature..HEAD"])
                .trim(),
            "B\nAgrupado ü\nF"
        );
        assert!(!f.0.path.join("E").exists());
        for name in ["A", "B", "C", "D", "F"] {
            assert_eq!(fs::read_to_string(f.0.path.join(name)).unwrap(), name);
        }
        assert!(
            f.git(&[
                "for-each-ref",
                "--format=%(objectname)",
                "refs/ravengit/rebase/"
            ])
            .lines()
            .any(|h| h == original)
        );
        assert!(rebase::read(&f.0, true).unwrap().is_none());
    }

    #[test]
    fn interactive_rebase_rejects_invalid_actions_messages_and_ranges_before_writing() {
        use crate::rebase_plan::{self, Action, Step};
        let f = divergent_fixture(false);
        let mut p = rebase_plan(&f);
        let original = f.git(&["rev-parse", "HEAD"]);
        for (action, message) in [
            (Action::Squash, "combined"),
            (Action::Fixup, ""),
            (Action::Drop, ""),
            (Action::Reword, " "),
            (Action::Reword, "bad\0message"),
            (Action::Pick, "not allowed"),
        ] {
            assert!(
                rebase_plan::validate(
                    &p,
                    &[Step {
                        hash: p.commits[0].hash.clone(),
                        action,
                        message: message.into()
                    }]
                )
                .is_err()
            );
        }
        let step = Step {
            hash: p.commits[0].hash.clone(),
            action: Action::Pick,
            message: String::new(),
        };
        assert!(rebase_plan::validate(&p, &[step.clone(), step.clone()]).is_err());
        p.contains_merges = true;
        assert!(rebase_plan::validate(&p, std::slice::from_ref(&step)).is_err());
        p.contains_merges = false;
        p.truncated = true;
        assert!(rebase_plan::validate(&p, &[step]).is_err());
        assert_eq!(f.git(&["rev-parse", "HEAD"]), original);
        assert!(!f.0.path.join(".git/ravengit-rebase.json").exists());
    }

    fn interactive_plan(f: &Fixture) -> crate::rebase::Preview {
        let mut preview = rebase_plan(f);
        let steps = preview
            .commits
            .iter()
            .map(|c| crate::rebase_plan::Step {
                hash: c.hash.clone(),
                action: crate::rebase_plan::Action::Reword,
                message: "Mensaje literal $(touch SHOULD_NOT_EXIST) `whoami` ü\n\n# Cuerpo literal"
                    .into(),
            })
            .collect();
        preview.interactive = Some(crate::rebase_plan::Plan {
            token: "reviewed".into(),
            steps,
        });
        preview
    }
    #[test]
    fn interactive_rebase_conflict_reopens_then_continues_or_aborts() {
        use crate::rebase::{self, Edit};
        for abort in [false, true] {
            let f = divergent_fixture(true);
            let original = f.git(&["rev-parse", "HEAD"]);
            rebase::start(&f.0, interactive_plan(&f), true).unwrap();
            let reopened = Repository {
                id: "reopened".into(),
                path: f.0.path.clone(),
            };
            let state = rebase::read(&reopened, true).unwrap().unwrap();
            assert_eq!(state.conflicts, vec!["archivo ü.txt"]);
            assert!(rebase::edit(&reopened, "stale", Edit::Continue, true).is_err());
            if abort {
                rebase::edit(&reopened, &state.token, Edit::Abort, true).unwrap();
                assert_eq!(f.git(&["rev-parse", "HEAD"]), original);
            } else {
                fs::write(f.0.path.join("archivo ü.txt"), "resuelto\n").unwrap();
                let state = rebase::read(&reopened, true).unwrap().unwrap();
                rebase::edit(
                    &reopened,
                    &state.token,
                    Edit::Resolve {
                        path: "archivo ü.txt".into(),
                    },
                    true,
                )
                .unwrap();
                let state = rebase::read(&reopened, true).unwrap().unwrap();
                rebase::edit(&reopened, &state.token, Edit::Continue, true).unwrap();
                assert!(
                    f.git(&["log", "-1", "--format=%B"])
                        .contains("Mensaje literal $(touch SHOULD_NOT_EXIST) `whoami` ü")
                );
                assert!(
                    f.git(&["log", "-1", "--format=%B"])
                        .contains("# Cuerpo literal")
                );
                assert_eq!(
                    fs::read_to_string(f.0.path.join("archivo ü.txt")).unwrap(),
                    "resuelto\n"
                );
            }
            assert!(!f.0.path.join("SHOULD_NOT_EXIST").exists());
            assert!(rebase::read(&reopened, true).unwrap().is_none());
        }
    }
    #[test]
    fn interactive_rebase_pick_conflict_preserves_original_message_without_template_comments() {
        use crate::rebase::{self, Edit};
        let f = divergent_fixture(true);
        f.git(&[
            "commit",
            "--amend",
            "--cleanup=verbatim",
            "-m",
            "Original\n\n# Comentario literal",
        ]);
        let message = f.git(&["log", "-1", "--format=%B"]);
        let mut plan = interactive_plan(&f);
        for step in &mut plan.interactive.as_mut().unwrap().steps {
            step.action = crate::rebase_plan::Action::Pick;
            step.message.clear();
        }
        rebase::start(&f.0, plan, true).unwrap();
        fs::write(f.0.path.join("archivo ü.txt"), "resuelto\n").unwrap();
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        rebase::edit(
            &f.0,
            &state.token,
            Edit::Resolve {
                path: "archivo ü.txt".into(),
            },
            true,
        )
        .unwrap();
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        rebase::edit(&f.0, &state.token, Edit::Continue, true).unwrap();
        assert_eq!(f.git(&["log", "-1", "--format=%B"]), message);
    }

    #[test]
    fn interactive_rebase_squash_conflict_uses_reviewed_group_message() {
        use crate::{
            rebase::{self, Edit},
            rebase_plan::{Action, Plan, Step},
        };
        let f = Fixture::new();
        f.git(&["switch", "-c", "feature"]);
        fs::write(f.0.path.join("archivo ü.txt"), "incoming\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "incoming"]);
        let base = f.git(&["rev-parse", "HEAD"]);
        f.git(&["switch", "main"]);
        fs::write(f.0.path.join("ancla.txt"), "ancla\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "ancla"]);
        fs::write(f.0.path.join("archivo ü.txt"), "local\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "cambio conflictivo"]);
        fs::write(f.0.path.join("posterior.txt"), "posterior\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&[
            "commit",
            "--cleanup=verbatim",
            "-m",
            "Posterior\n\n# cuerpo posterior",
        ]);
        let original = f.git(&["rev-parse", "HEAD"]);
        let mut preview = rebase_plan(&f);
        let commits = preview.commits.clone();
        preview.interactive = Some(Plan {
            token: "reviewed".into(),
            steps: vec![
                Step {
                    hash: commits[0].hash.clone(),
                    action: Action::Pick,
                    message: String::new(),
                },
                Step {
                    hash: commits[1].hash.clone(),
                    action: Action::Squash,
                    message: "Grupo revisado\n\n# cuerpo agrupado".into(),
                },
                Step {
                    hash: commits[2].hash.clone(),
                    action: Action::Pick,
                    message: String::new(),
                },
            ],
        });
        rebase::start(&f.0, preview, true).unwrap();
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        assert_eq!(state.conflicts, vec!["archivo ü.txt"]);
        assert_eq!(f.git(&["rev-parse", "main"]), original);
        assert_eq!(f.git(&["rev-parse", "feature"]), base);
        fs::write(f.0.path.join("archivo ü.txt"), "resuelto\n").unwrap();
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        rebase::edit(
            &f.0,
            &state.token,
            Edit::Resolve {
                path: "archivo ü.txt".into(),
            },
            true,
        )
        .unwrap();
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        rebase::edit(&f.0, &state.token, Edit::Continue, true).unwrap();
        let group = f.git(&["rev-parse", "HEAD~1"]);
        let group_commit = f.git(&["cat-file", "commit", group.trim()]);
        let posterior_commit = f.git(&["cat-file", "commit", "HEAD"]);
        assert_eq!(f.git(&["rev-list", "--count", "feature..HEAD"]).trim(), "2");
        assert_eq!(f.git(&["rev-parse", "HEAD~2"]), base);
        assert_eq!(
            group_commit.split_once("\n\n").unwrap().1,
            "Grupo revisado\n\n# cuerpo agrupado\n"
        );
        assert_eq!(
            posterior_commit.split_once("\n\n").unwrap().1,
            "Posterior\n\n# cuerpo posterior\n"
        );
        assert_eq!(
            fs::read_to_string(f.0.path.join("archivo ü.txt")).unwrap(),
            "resuelto\n"
        );
        assert_eq!(
            fs::read_to_string(f.0.path.join("ancla.txt")).unwrap(),
            "ancla\n"
        );
        assert_eq!(
            fs::read_to_string(f.0.path.join("posterior.txt")).unwrap(),
            "posterior\n"
        );
        assert!(
            f.git(&[
                "for-each-ref",
                "--format=%(objectname)",
                "refs/ravengit/rebase/",
            ])
            .lines()
            .any(|hash| hash == original.trim())
        );
        assert!(f.git(&["status", "--porcelain=v1"]).is_empty());
        assert!(rebase::read(&f.0, true).unwrap().is_none());
    }

    #[test]
    fn interactive_rebase_fixup_recovers_from_two_consecutive_conflicts() {
        use crate::{
            rebase::{self, Edit},
            rebase_plan::{Action, Plan, Step},
        };
        let f = Fixture::new();
        fs::write(f.0.path.join("segundo.txt"), "base\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "--amend", "--no-edit"]);
        f.git(&["switch", "-c", "feature"]);
        fs::write(f.0.path.join("archivo ü.txt"), "incoming uno\n").unwrap();
        fs::write(f.0.path.join("segundo.txt"), "incoming dos\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "base divergente"]);
        let base = f.git(&["rev-parse", "HEAD"]);
        f.git(&["switch", "main"]);
        fs::write(f.0.path.join("ancla.txt"), "ancla\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&[
            "commit",
            "--cleanup=verbatim",
            "-m",
            "Ancla\n\n# cuerpo ancla",
        ]);
        fs::write(f.0.path.join("archivo ü.txt"), "local uno\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "fixup conflictivo"]);
        fs::write(f.0.path.join("segundo.txt"), "local dos\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&[
            "commit",
            "--cleanup=verbatim",
            "-m",
            "Segundo\n\n# cuerpo segundo",
        ]);
        fs::write(f.0.path.join("posterior.txt"), "posterior\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&[
            "commit",
            "--cleanup=verbatim",
            "-m",
            "Posterior\n\n# cuerpo posterior",
        ]);
        let original = f.git(&["rev-parse", "HEAD"]);
        let mut preview = rebase_plan(&f);
        let commits = preview.commits.clone();
        preview.interactive = Some(Plan {
            token: "reviewed".into(),
            steps: vec![
                Step {
                    hash: commits[0].hash.clone(),
                    action: Action::Pick,
                    message: String::new(),
                },
                Step {
                    hash: commits[1].hash.clone(),
                    action: Action::Fixup,
                    message: String::new(),
                },
                Step {
                    hash: commits[2].hash.clone(),
                    action: Action::Pick,
                    message: String::new(),
                },
                Step {
                    hash: commits[3].hash.clone(),
                    action: Action::Pick,
                    message: String::new(),
                },
            ],
        });
        rebase::start(&f.0, preview, true).unwrap();
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        assert_eq!(state.conflicts, vec!["archivo ü.txt"]);
        fs::write(f.0.path.join("archivo ü.txt"), "resuelto uno\n").unwrap();
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        rebase::edit(
            &f.0,
            &state.token,
            Edit::Resolve {
                path: "archivo ü.txt".into(),
            },
            true,
        )
        .unwrap();
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        let outcome = rebase::edit(&f.0, &state.token, Edit::Continue, true).unwrap();
        assert!(outcome.message.contains("detenido"));
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        assert_eq!(state.conflicts, vec!["segundo.txt"]);
        assert_eq!(f.git(&["rev-parse", "main"]), original);
        fs::write(f.0.path.join("segundo.txt"), "resuelto dos\n").unwrap();
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        rebase::edit(
            &f.0,
            &state.token,
            Edit::Resolve {
                path: "segundo.txt".into(),
            },
            true,
        )
        .unwrap();
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        rebase::edit(&f.0, &state.token, Edit::Continue, true).unwrap();
        let group = f.git(&["rev-parse", "HEAD~2"]);
        let group_commit = f.git(&["cat-file", "commit", group.trim()]);
        let second_commit = f.git(&["cat-file", "commit", "HEAD~1"]);
        let posterior_commit = f.git(&["cat-file", "commit", "HEAD"]);
        assert_eq!(f.git(&["rev-list", "--count", "feature..HEAD"]).trim(), "3");
        assert_eq!(f.git(&["rev-parse", "HEAD~3"]), base);
        assert_eq!(
            group_commit.split_once("\n\n").unwrap().1,
            "Ancla\n\n# cuerpo ancla\n"
        );
        assert_eq!(
            second_commit.split_once("\n\n").unwrap().1,
            "Segundo\n\n# cuerpo segundo\n"
        );
        assert_eq!(
            posterior_commit.split_once("\n\n").unwrap().1,
            "Posterior\n\n# cuerpo posterior\n"
        );
        assert_eq!(
            fs::read_to_string(f.0.path.join("archivo ü.txt")).unwrap(),
            "resuelto uno\n"
        );
        assert_eq!(
            fs::read_to_string(f.0.path.join("segundo.txt")).unwrap(),
            "resuelto dos\n"
        );
        assert!(
            f.git(&[
                "for-each-ref",
                "--format=%(objectname)",
                "refs/ravengit/rebase/",
            ])
            .lines()
            .any(|hash| hash == original.trim())
        );
        assert!(f.git(&["status", "--porcelain=v1"]).is_empty());
        assert!(rebase::read(&f.0, true).unwrap().is_none());
    }

    #[test]
    fn interactive_rebase_drop_stays_omitted_after_later_conflict() {
        use crate::{
            rebase::{self, Edit},
            rebase_plan::{Action, Plan, Step},
        };
        let f = divergent_fixture(true);
        f.git(&["reset", "--hard", "HEAD^"]);
        fs::write(f.0.path.join("conservar.txt"), "conservar\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "conservar"]);
        fs::write(f.0.path.join("descartar.txt"), "descartar\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "descartar"]);
        fs::write(f.0.path.join("archivo ü.txt"), "local\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "conflicto posterior"]);
        fs::write(f.0.path.join("posterior.txt"), "posterior\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "posterior"]);
        let original = f.git(&["rev-parse", "HEAD"]);
        let base = f.git(&["rev-parse", "feature"]);
        let mut preview = rebase_plan(&f);
        let commits = preview.commits.clone();
        preview.interactive = Some(Plan {
            token: "reviewed".into(),
            steps: vec![
                Step {
                    hash: commits[0].hash.clone(),
                    action: Action::Pick,
                    message: String::new(),
                },
                Step {
                    hash: commits[1].hash.clone(),
                    action: Action::Drop,
                    message: String::new(),
                },
                Step {
                    hash: commits[2].hash.clone(),
                    action: Action::Pick,
                    message: String::new(),
                },
                Step {
                    hash: commits[3].hash.clone(),
                    action: Action::Pick,
                    message: String::new(),
                },
            ],
        });
        rebase::start(&f.0, preview, true).unwrap();
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        assert_eq!(state.conflicts, vec!["archivo ü.txt"]);
        assert!(!f.0.path.join("descartar.txt").exists());
        fs::write(f.0.path.join("archivo ü.txt"), "resuelto\n").unwrap();
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        rebase::edit(
            &f.0,
            &state.token,
            Edit::Resolve {
                path: "archivo ü.txt".into(),
            },
            true,
        )
        .unwrap();
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        rebase::edit(&f.0, &state.token, Edit::Continue, true).unwrap();
        assert_eq!(f.git(&["rev-list", "--count", "feature..HEAD"]).trim(), "3");
        assert_eq!(f.git(&["rev-parse", "HEAD~3"]), base);
        assert!(!f.0.path.join("descartar.txt").exists());
        assert_eq!(
            fs::read_to_string(f.0.path.join("conservar.txt")).unwrap(),
            "conservar\n"
        );
        assert_eq!(
            fs::read_to_string(f.0.path.join("archivo ü.txt")).unwrap(),
            "resuelto\n"
        );
        assert_eq!(
            fs::read_to_string(f.0.path.join("posterior.txt")).unwrap(),
            "posterior\n"
        );
        assert!(
            f.git(&[
                "for-each-ref",
                "--format=%(objectname)",
                "refs/ravengit/rebase/",
            ])
            .lines()
            .any(|hash| hash == original.trim())
        );
        assert!(f.git(&["status", "--porcelain=v1"]).is_empty());
        assert!(rebase::read(&f.0, true).unwrap().is_none());
    }

    #[test]
    fn interactive_rebase_newly_empty_commit_remains_abortable() {
        use crate::{
            rebase::{self, Edit},
            rebase_plan::{Action, Plan, Step},
        };
        let f = Fixture::new();
        f.git(&["switch", "-c", "feature"]);
        fs::write(f.0.path.join("archivo ü.txt"), "mismo\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "cambio base"]);
        f.git(&["switch", "main"]);
        fs::write(f.0.path.join("archivo ü.txt"), "mismo\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "cambio local equivalente"]);
        let original = f.git(&["rev-parse", "HEAD"]);
        let original_tree = f.git(&["rev-parse", "HEAD^{tree}"]);
        let mut preview = rebase_plan(&f);
        preview.interactive = Some(Plan {
            token: "reviewed".into(),
            steps: vec![Step {
                hash: preview.commits[0].hash.clone(),
                action: Action::Pick,
                message: String::new(),
            }],
        });
        let outcome = rebase::start(&f.0, preview, true).unwrap();
        assert!(outcome.message.contains("detenido"));
        let state = rebase::read(&f.0, true).unwrap().unwrap();
        assert!(state.conflicts.is_empty());
        assert!(state.can_continue);
        assert_eq!(f.git(&["rev-parse", "main"]), original);
        rebase::edit(&f.0, &state.token, Edit::Abort, true).unwrap();
        assert_eq!(f.git(&["symbolic-ref", "--short", "HEAD"]).trim(), "main");
        assert_eq!(f.git(&["rev-parse", "HEAD"]), original);
        assert_eq!(f.git(&["rev-parse", "HEAD^{tree}"]), original_tree);
        assert!(f.git(&["status", "--porcelain=v1"]).is_empty());
        assert!(rebase::read(&f.0, true).unwrap().is_none());
    }

    #[test]
    fn interactive_rebase_rejects_stale_dirty_untrusted_and_injected_sequences() {
        use crate::rebase::{self, Edit};
        let f = divergent_fixture(true);
        assert!(rebase::start(&f.0, interactive_plan(&f), false).is_err());
        let plan = interactive_plan(&f);
        f.git(&["branch", "extra"]);
        assert!(rebase::start(&f.0, plan, true).is_err());
        let plan = interactive_plan(&f);
        fs::write(f.0.path.join("new.txt"), "untracked").unwrap();
        assert!(rebase::start(&f.0, plan, true).is_err());
        fs::remove_file(f.0.path.join("new.txt")).unwrap();
        rebase::start(&f.0, interactive_plan(&f), true).unwrap();
        fs::write(
            f.0.path.join(".git/rebase-merge/git-rebase-todo"),
            "exec touch SHOULD_NOT_EXIST\n",
        )
        .unwrap();
        assert!(rebase::read(&f.0, true).is_err());
        assert!(rebase::edit(&f.0, "invalid", Edit::Continue, true).is_err());
        assert!(!f.0.path.join("SHOULD_NOT_EXIST").exists());
    }

    fn rebase_plan(fixture: &Fixture) -> crate::rebase::Preview {
        let state = read(&fixture.0, true).unwrap();
        crate::rebase::preview(&fixture.0, &state.token, "feature", true).unwrap()
    }

    // A separate process owns the real Git job. Killing it exercises Windows
    // handle closure, rather than the timeout/Drop path in process::execute.
    #[cfg(windows)]
    #[test]
    #[ignore = "worker invoked only by forced-interruption tests"]
    fn forced_rebase_worker() {
        let Some(path) = std::env::var_os("RAVENGIT_FORCED_FIXTURE") else {
            return;
        };
        let repo = Repository {
            id: "forced-worker".into(),
            path: path.into(),
        };
        let mode = std::env::var("RAVENGIT_FORCED_MODE").unwrap();
        if matches!(mode.as_str(), "hook" | "conflict" | "checkout-write") {
            let state = read(&repo, true).unwrap();
            let mut plan = crate::rebase::preview(&repo, &state.token, "feature", true).unwrap();
            if mode == "conflict" {
                plan.interactive = Some(crate::rebase_plan::Plan {
                    token: "reviewed".into(),
                    steps: plan
                        .commits
                        .iter()
                        .map(|commit| crate::rebase_plan::Step {
                            hash: commit.hash.clone(),
                            action: crate::rebase_plan::Action::Reword,
                            message: "Mensaje tras interrupción ü".into(),
                        })
                        .collect(),
                });
            }
            crate::rebase::start(&repo, plan, true).unwrap();
            assert_eq!(
                mode, "conflict",
                "The hook must block until the worker is killed"
            );
            assert!(crate::rebase::read(&repo, true).unwrap().unwrap().active);
            fs::write(repo.path.join(".git/forced-ready"), b"ready").unwrap();
            loop {
                std::thread::sleep(Duration::from_millis(100));
            }
        }
        let state = crate::rebase::read(&repo, true).unwrap().unwrap();
        match mode.as_str() {
            "clear" => {
                assert!(!state.active);
                crate::rebase::edit(&repo, &state.token, crate::rebase::Edit::ClearRecord, true)
                    .unwrap();
            }
            "abort" => {
                assert!(state.active);
                crate::rebase::edit(&repo, &state.token, crate::rebase::Edit::Abort, true).unwrap();
            }
            "continue" => {
                assert!(state.active);
                assert_eq!(state.conflicts, vec!["archivo ü.txt"]);
                fs::write(
                    repo.path.join("archivo ü.txt"),
                    "resolved after forced stop\n",
                )
                .unwrap();
                let state = crate::rebase::read(&repo, true).unwrap().unwrap();
                crate::rebase::edit(
                    &repo,
                    &state.token,
                    crate::rebase::Edit::Resolve {
                        path: "archivo ü.txt".into(),
                    },
                    true,
                )
                .unwrap();
                let fresh = crate::rebase::read(&repo, true).unwrap().unwrap();
                assert!(fresh.can_continue);
                crate::rebase::edit(&repo, &fresh.token, crate::rebase::Edit::Continue, true)
                    .unwrap();
            }
            _ => panic!("Unknown fixture mode"),
        }
        assert!(crate::rebase::read(&repo, true).unwrap().is_none());
    }

    #[cfg(windows)]
    fn forced_worker(fixture: &Fixture, mode: &str) -> std::process::Child {
        use std::os::windows::process::CommandExt;
        std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "branches::tests::forced_rebase_worker",
                "--ignored",
                "--nocapture",
            ])
            .env("RAVENGIT_FORCED_FIXTURE", &fixture.0.path)
            .env("RAVENGIT_FORCED_MODE", mode)
            .creation_flags(0x08000000) // CREATE_NO_WINDOW, only this test child.
            .spawn()
            .unwrap()
    }

    #[cfg(windows)]
    fn force_stop_at_marker(fixture: &Fixture, mode: &str) {
        let mut child = forced_worker(fixture, mode);
        let deadline = std::time::Instant::now() + Duration::from_secs(90);
        while !fixture.0.path.join(".git/forced-ready").exists() {
            if let Some(status) = child.try_wait().unwrap() {
                panic!("Worker exited before interruption: {status}");
            }
            if std::time::Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                panic!("Worker did not reach the interruption marker");
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        child.kill().unwrap();
        assert!(!child.wait().unwrap().success());
    }

    #[cfg(windows)]
    #[test]
    fn forced_interruption_during_hook_preserves_record_and_contains_descendants() {
        let fixture = divergent_fixture(false);
        let original = fixture.git(&["rev-parse", "HEAD"]);
        let tree = fixture.git(&["rev-parse", "HEAD^{tree}"]);
        let hooks = fixture.0.path.join(".git/forced-hooks");
        fs::create_dir(&hooks).unwrap();
        fs::write(hooks.join("pre-rebase"), "#!/bin/sh\necho ready > .git/forced-ready\nwhile [ ! -f .git/forced-release ]; do sleep 0.1; done\necho escaped > .git/forced-escaped\nexit 1\n").unwrap();
        fixture.git(&["config", "core.hooksPath", ".git/forced-hooks"]);
        force_stop_at_marker(&fixture, "hook");
        let record = fs::read(fixture.0.path.join(".git/ravengit-rebase.json")).unwrap();
        serde_json::from_slice::<crate::rebase::Saved>(&record).unwrap();
        fs::write(fixture.0.path.join(".git/forced-release"), b"release").unwrap();
        std::thread::sleep(Duration::from_secs(1));
        assert!(
            !fixture.0.path.join(".git/forced-escaped").exists(),
            "A hook escaped the killed worker's Git job"
        );
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]), original);
        assert!(forced_worker(&fixture, "clear").wait().unwrap().success());
        assert_eq!(fixture.git(&["rev-parse", "HEAD^{tree}"]), tree);
        assert!(fixture.git(&["status", "--porcelain"]).is_empty());
        assert!(
            fixture
                .git(&[
                    "for-each-ref",
                    "--format=%(objectname)",
                    "refs/ravengit/rebase/"
                ])
                .contains(original.trim())
        );
    }

    #[cfg(windows)]
    #[test]
    fn forced_interruption_at_interactive_conflict_reopens_continues_or_aborts() {
        for mode in ["continue", "abort"] {
            let fixture = divergent_fixture(true);
            let original = fixture.git(&["rev-parse", "HEAD"]);
            let tree = fixture.git(&["rev-parse", "HEAD^{tree}"]);
            force_stop_at_marker(&fixture, "conflict");
            assert!(fixture.0.path.join(".git/ravengit-rebase.json").exists());
            assert!(forced_worker(&fixture, mode).wait().unwrap().success());
            assert!(!fixture.0.path.join(".git/ravengit-rebase.json").exists());
            assert!(fixture.git(&["status", "--porcelain"]).is_empty());
            assert_eq!(fixture.git(&["branch", "--show-current"]).trim(), "main");
            assert!(
                fixture
                    .git(&[
                        "for-each-ref",
                        "--format=%(objectname)",
                        "refs/ravengit/rebase/"
                    ])
                    .contains(original.trim())
            );
            if mode == "abort" {
                assert_eq!(fixture.git(&["rev-parse", "HEAD"]), original);
                assert_eq!(fixture.git(&["rev-parse", "HEAD^{tree}"]), tree);
            } else {
                assert_ne!(fixture.git(&["rev-parse", "HEAD"]), original);
                assert_eq!(
                    fixture.git(&["log", "-1", "--format=%s"]).trim(),
                    "Mensaje tras interrupción ü"
                );
                assert_eq!(
                    fs::read_to_string(fixture.0.path.join("archivo ü.txt")).unwrap(),
                    "resolved after forced stop\n"
                );
            }
        }
    }

    #[cfg(windows)]
    #[test]
    fn forced_interruption_during_checkout_preserves_lock_and_refuses_unsafe_recovery() {
        let fixture = divergent_fixture(false);
        fixture.git(&["switch", "feature"]);
        fs::write(
            fixture.0.path.join("000-incoming.txt"),
            "written before filter\n",
        )
        .unwrap();
        fixture.git(&["add", "--all"]);
        fixture.git(&["commit", "-m", "checkout interruption marker"]);
        fixture.git(&["switch", "main"]);
        let original = fixture.git(&["rev-parse", "HEAD"]);
        let original_index = fixture.git(&["ls-files", "--stage", "-z"]);
        // A repository-local smudge filter pauses a real checkout after an
        // earlier path was written and while Git holds its index transaction.
        // No production instrumentation or global Git configuration is used.
        fs::write(
            fixture.0.path.join(".git/info/attributes"),
            "archivo* filter=forced\n",
        )
        .unwrap();
        fs::write(fixture.0.path.join(".git/forced-smudge"), "#!/bin/sh\ncat > .git/forced-input\necho ready > .git/forced-ready\nwhile [ ! -f .git/forced-release ]; do sleep 0.1; done\necho escaped > .git/forced-escaped\ncat .git/forced-input\n").unwrap();
        fixture.git(&["config", "filter.forced.smudge", "sh .git/forced-smudge"]);
        fixture.git(&["config", "filter.forced.clean", "cat"]);
        fixture.git(&["config", "filter.forced.required", "true"]);
        force_stop_at_marker(&fixture, "checkout-write");
        let lock_path = fixture.0.path.join(".git/index.lock");
        assert!(
            lock_path.exists(),
            "The interruption must occur inside an index transaction"
        );
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("000-incoming.txt")).unwrap(),
            "written before filter\n"
        );
        assert_eq!(fixture.git(&["ls-files", "--stage", "-z"]), original_index);
        let record_path = fixture.0.path.join(".git/ravengit-rebase.json");
        let record = fs::read(&record_path).unwrap();
        let saved: serde_json::Value = serde_json::from_slice(&record).unwrap();
        let backup = saved["backup"].as_str().unwrap();
        assert_eq!(fixture.git(&["rev-parse", backup]), original);
        let index = fs::read(fixture.0.path.join(".git/index")).unwrap();
        let lock = fs::read(&lock_path).unwrap();
        let head = fs::read(fixture.0.path.join(".git/HEAD")).unwrap();
        fs::write(fixture.0.path.join(".git/forced-release"), b"release").unwrap();
        std::thread::sleep(Duration::from_secs(1));
        assert!(!fixture.0.path.join(".git/forced-escaped").exists());
        assert!(crate::rebase::read(&fixture.0, true).is_err());
        for action in [
            crate::rebase::Edit::Continue,
            crate::rebase::Edit::Abort,
            crate::rebase::Edit::ClearRecord,
        ] {
            assert!(crate::rebase::edit(&fixture.0, "unreviewed", action, true).is_err());
        }
        assert_eq!(fs::read(&record_path).unwrap(), record);
        assert_eq!(fs::read(fixture.0.path.join(".git/index")).unwrap(), index);
        assert_eq!(fs::read(&lock_path).unwrap(), lock);
        assert_eq!(fs::read(fixture.0.path.join(".git/HEAD")).unwrap(), head);
        assert_eq!(fixture.git(&["rev-parse", "refs/heads/main"]), original);
        assert_eq!(fixture.git(&["rev-parse", backup]), original);
    }

    fn replay_plan(fixture: &Fixture, kind: crate::replay::Kind) -> crate::replay::Plan {
        let source = fixture.git(&["rev-parse", "feature"]);
        crate::replay::preview(&fixture.0, kind, source.trim(), true).unwrap()
    }

    #[test]
    fn replay_cherry_pick_then_revert_preserves_prior_history_and_trees() {
        use crate::replay::{self, Kind};
        let fixture = divergent_fixture(false);
        let original = fixture.git(&["rev-parse", "HEAD"]);
        let original_tree = fixture.git(&["rev-parse", "HEAD^{tree}"]);
        let source = fixture.git(&["rev-parse", "feature"]);
        let plan = replay_plan(&fixture, Kind::CherryPick);
        assert!(plan.patch.contains("+incoming"));
        replay::start(&fixture.0, plan, true).unwrap();
        assert_eq!(fixture.git(&["rev-parse", "HEAD^"]), original);
        assert_eq!(fixture.git(&["rev-parse", "feature"]), source);
        assert!(
            replay::options(&fixture.0, true)
                .unwrap()
                .recovery
                .is_none()
        );
        let picked = fixture.git(&["rev-parse", "HEAD"]);
        let inverse = replay::preview(&fixture.0, Kind::Revert, picked.trim(), true).unwrap();
        assert!(inverse.patch.contains("-incoming"));
        replay::start(&fixture.0, inverse, true).unwrap();
        assert_eq!(fixture.git(&["rev-parse", "HEAD^"]), picked);
        assert_eq!(fixture.git(&["rev-parse", "HEAD^{tree}"]), original_tree);
        assert!(fixture.git(&["status", "--porcelain"]).is_empty());
        assert!(
            fixture
                .git(&[
                    "for-each-ref",
                    "--format=%(objectname)",
                    "refs/ravengit/replay/"
                ])
                .contains(original.trim())
        );
    }

    #[test]
    fn replay_conflicts_recover_resolve_continue_and_abort_for_both_kinds() {
        use crate::replay::{self, Action, Kind};
        for kind in [Kind::CherryPick, Kind::Revert] {
            for abort in [true, false] {
                let fixture = divergent_fixture(true);
                let original = fixture.git(&["rev-parse", "HEAD"]);
                replay::start(&fixture.0, replay_plan(&fixture, kind), true).unwrap();
                let state = replay::options(&fixture.0, true).unwrap().recovery.unwrap();
                assert_eq!(state.status, "active");
                assert_eq!(state.conflicts, vec!["archivo ü.txt"]);
                assert!(!state.can_continue);
                assert!(replay::edit(&fixture.0, "obsolete", Action::Abort, true).is_err());
                assert!(replay::edit(&fixture.0, &state.token, Action::ClearRecord, true).is_err());
                assert!(replay::edit(&fixture.0, &state.token, Action::Abort, false).is_err());
                if abort {
                    replay::edit(&fixture.0, &state.token, Action::Abort, true).unwrap();
                    assert_eq!(fixture.git(&["rev-parse", "HEAD"]), original);
                } else {
                    assert!(
                        replay::edit(
                            &fixture.0,
                            &state.token,
                            Action::Resolve {
                                path: "archivo ü.txt".into()
                            },
                            true
                        )
                        .is_err()
                    );
                    fs::write(fixture.0.path.join("archivo ü.txt"), "resolved\n").unwrap();
                    let state = replay::options(&fixture.0, true).unwrap().recovery.unwrap();
                    replay::edit(
                        &fixture.0,
                        &state.token,
                        Action::Resolve {
                            path: "archivo ü.txt".into(),
                        },
                        true,
                    )
                    .unwrap();
                    let state = replay::options(&fixture.0, true).unwrap().recovery.unwrap();
                    assert!(state.can_continue);
                    replay::edit(&fixture.0, &state.token, Action::Continue, true).unwrap();
                    assert_eq!(fixture.git(&["rev-parse", "HEAD^"]), original);
                    assert_eq!(
                        fs::read_to_string(fixture.0.path.join("archivo ü.txt")).unwrap(),
                        "resolved\n"
                    );
                }
                assert!(
                    replay::options(&fixture.0, true)
                        .unwrap()
                        .recovery
                        .is_none()
                );
                assert!(fixture.git(&["status", "--porcelain"]).is_empty());
            }
        }
    }

    #[test]
    fn replay_rejects_untrusted_stale_dirty_ignored_and_merge_commits() {
        use crate::replay::{self, Kind};
        let fixture = divergent_fixture(false);
        let plan = replay_plan(&fixture, Kind::CherryPick);
        assert!(replay::start(&fixture.0, plan.clone(), false).is_err());
        assert!(replay::preview(&fixture.0, Kind::CherryPick, "--all", true).is_err());
        fixture.git(&["branch", "another"]);
        assert!(replay::start(&fixture.0, plan, true).is_err());
        fs::write(fixture.0.path.join("untracked.txt"), "keep\n").unwrap();
        assert!(
            replay::preview(
                &fixture.0,
                Kind::CherryPick,
                fixture.git(&["rev-parse", "feature"]).trim(),
                true
            )
            .is_err()
        );
        fs::remove_file(fixture.0.path.join("untracked.txt")).unwrap();
        fixture.git(&["config", "core.excludesFile", ".git/info/exclude"]);
        fs::write(fixture.0.path.join(".git/info/exclude"), "ignored\n").unwrap();
        fs::write(fixture.0.path.join("ignored"), "keep\n").unwrap();
        assert!(replay::start(&fixture.0, replay_plan(&fixture, Kind::CherryPick), true).is_err());
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("ignored")).unwrap(),
            "keep\n"
        );
        fs::remove_file(fixture.0.path.join("ignored")).unwrap();
        fixture.git(&["merge", "--no-edit", "feature"]);
        assert!(
            replay::preview(
                &fixture.0,
                Kind::Revert,
                fixture.git(&["rev-parse", "HEAD"]).trim(),
                true
            )
            .is_err()
        );
    }

    #[test]
    fn replay_empty_result_remains_abortable_without_silent_skip() {
        use crate::replay::{self, Action, Kind};
        let fixture = divergent_fixture(false);
        let original = fixture.git(&["rev-parse", "HEAD"]);
        let plan = replay::preview(&fixture.0, Kind::CherryPick, original.trim(), true).unwrap();
        replay::start(&fixture.0, plan, true).unwrap();
        let state = replay::options(&fixture.0, true).unwrap().recovery.unwrap();
        assert_eq!(state.status, "active");
        replay::edit(&fixture.0, &state.token, Action::Abort, true).unwrap();
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]), original);
    }

    #[test]
    fn rebase_executes_linear_history_and_preserves_backup() {
        let fixture = divergent_fixture(false);
        fixture.git(&["config", "rebase.instructionFormat", "%s%nexec false"]);
        fixture.git(&["config", "rebase.abbreviateCommands", "true"]);
        let plan = rebase_plan(&fixture);
        let original = plan.head_hash.clone();
        let base = plan.base_hash.clone();
        crate::rebase::start(&fixture.0, plan, true).unwrap();
        assert!(crate::rebase::read(&fixture.0, true).unwrap().is_none());
        assert_ne!(fixture.git(&["rev-parse", "HEAD"]).trim(), original);
        assert_eq!(fixture.git(&["rev-parse", "HEAD^"]).trim(), base);
        assert_eq!(fixture.git(&["branch", "--show-current"]).trim(), "main");
        assert!(
            fixture
                .git(&[
                    "for-each-ref",
                    "--format=%(objectname)",
                    "refs/ravengit/rebase/"
                ])
                .contains(&original)
        );
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("local.txt")).unwrap(),
            "local\n"
        );
    }

    #[test]
    fn rebase_conflict_recovers_resolves_continues_and_aborts() {
        for abort in [false, true] {
            let fixture = divergent_fixture(true);
            let plan = rebase_plan(&fixture);
            let original = plan.head_hash.clone();
            crate::rebase::start(&fixture.0, plan, true).unwrap();
            let state = crate::rebase::read(&fixture.0, true).unwrap().unwrap();
            assert_eq!(state.conflicts, vec!["archivo ü.txt"]);
            assert!(!state.can_continue);
            assert!(
                crate::rebase::edit(
                    &fixture.0,
                    &state.token,
                    crate::rebase::Edit::ClearRecord,
                    true
                )
                .is_err()
            );
            assert!(
                crate::rebase::edit(&fixture.0, "old", crate::rebase::Edit::Abort, true).is_err()
            );
            assert!(
                crate::rebase::edit(&fixture.0, &state.token, crate::rebase::Edit::Abort, false)
                    .is_err()
            );
            if abort {
                crate::rebase::edit(&fixture.0, &state.token, crate::rebase::Edit::Abort, true)
                    .unwrap();
                assert_eq!(fixture.git(&["rev-parse", "HEAD"]).trim(), original);
            } else {
                assert!(
                    crate::rebase::edit(
                        &fixture.0,
                        &state.token,
                        crate::rebase::Edit::Resolve {
                            path: "archivo ü.txt".into()
                        },
                        true
                    )
                    .is_err()
                );
                fs::write(fixture.0.path.join("archivo ü.txt"), "resolved\n").unwrap();
                let state = crate::rebase::read(&fixture.0, true).unwrap().unwrap();
                crate::rebase::edit(
                    &fixture.0,
                    &state.token,
                    crate::rebase::Edit::Resolve {
                        path: "archivo ü.txt".into(),
                    },
                    true,
                )
                .unwrap();
                let state = crate::rebase::read(&fixture.0, true).unwrap().unwrap();
                assert!(state.can_continue);
                crate::rebase::edit(
                    &fixture.0,
                    &state.token,
                    crate::rebase::Edit::Continue,
                    true,
                )
                .unwrap();
                assert_eq!(
                    fs::read_to_string(fixture.0.path.join("archivo ü.txt")).unwrap(),
                    "resolved\n"
                );
            }
            assert!(crate::rebase::read(&fixture.0, true).unwrap().is_none());
        }
    }

    #[test]
    fn rebase_rejects_changed_plan_ignored_files_and_injected_sequence() {
        let fixture = divergent_fixture(true);
        let plan = rebase_plan(&fixture);
        assert!(crate::rebase::start(&fixture.0, plan.clone(), false).is_err());
        fs::write(fixture.0.path.join(".git/info/exclude"), "precious\n").unwrap();
        fs::write(fixture.0.path.join("precious"), "keep\n").unwrap();
        assert!(crate::rebase::start(&fixture.0, plan, true).is_err());
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("precious")).unwrap(),
            "keep\n"
        );
        fs::remove_file(fixture.0.path.join("precious")).unwrap();
        let plan = rebase_plan(&fixture);
        fixture.git(&["branch", "extra"]);
        assert!(crate::rebase::start(&fixture.0, plan, true).is_err());
        crate::rebase::start(&fixture.0, rebase_plan(&fixture), true).unwrap();
        fs::write(
            fixture.0.path.join(".git/rebase-merge/git-rebase-todo"),
            "exec echo unsafe\n",
        )
        .unwrap();
        assert!(crate::rebase::read(&fixture.0, true).is_err());
    }

    #[test]
    fn rebase_stops_on_equivalent_patch_without_silently_dropping_it() {
        let fixture = Fixture::new();
        fixture.git(&["switch", "-c", "feature"]);
        fs::write(fixture.0.path.join("same.txt"), "same\n").unwrap();
        fixture.git(&["add", "--all"]);
        fixture.git(&["commit", "-m", "base patch"]);
        fixture.git(&["switch", "main"]);
        fs::write(fixture.0.path.join("same.txt"), "same\n").unwrap();
        fixture.git(&["add", "--all"]);
        fixture.git(&["commit", "-m", "local equivalent patch"]);
        let plan = rebase_plan(&fixture);
        let original = plan.head_hash.clone();
        crate::rebase::start(&fixture.0, plan, true).unwrap();
        let state = crate::rebase::read(&fixture.0, true).unwrap().unwrap();
        assert_eq!(state.original, original);
        crate::rebase::edit(&fixture.0, &state.token, crate::rebase::Edit::Abort, true).unwrap();
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]).trim(), original);
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn rejected_rebase_hook_preserves_head_and_backup_for_manual_inspection() {
        #[cfg(unix)]
        use std::os::unix::fs::PermissionsExt;
        let fixture = divergent_fixture(false);
        let plan = rebase_plan(&fixture);
        let original = plan.head_hash.clone();
        let hooks = fixture.0.path.join(".git/test-hooks");
        fs::create_dir_all(&hooks).unwrap();
        let hook = hooks.join("pre-rebase");
        fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
        #[cfg(unix)]
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
        fixture.git(&["config", "core.hooksPath", ".git/test-hooks"]);
        let fresh_plan = rebase_plan(&fixture);
        assert!(crate::rebase::start(&fixture.0, fresh_plan, true).is_err());
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]).trim(), original);
        assert!(fixture.0.path.join(".git/ravengit-rebase.json").exists());
        assert!(
            fixture
                .git(&[
                    "for-each-ref",
                    "--format=%(objectname)",
                    "refs/ravengit/rebase/"
                ])
                .contains(&original)
        );
        let orphan = crate::rebase::read(&fixture.0, true).unwrap().unwrap();
        assert!(!orphan.active);
        assert!(read(&fixture.0, true).unwrap().rebase_record);
        fs::write(fixture.0.path.join("local.txt"), "changed\n").unwrap();
        assert!(
            crate::rebase::edit(
                &fixture.0,
                &orphan.token,
                crate::rebase::Edit::ClearRecord,
                true
            )
            .is_err()
        );
        assert!(fixture.0.path.join(".git/ravengit-rebase.json").exists());
        fs::write(fixture.0.path.join("local.txt"), "local\n").unwrap();
        let orphan = crate::rebase::read(&fixture.0, true).unwrap().unwrap();
        crate::rebase::edit(
            &fixture.0,
            &orphan.token,
            crate::rebase::Edit::ClearRecord,
            true,
        )
        .unwrap();
        assert!(crate::rebase::read(&fixture.0, true).unwrap().is_none());
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]).trim(), original);
        assert_eq!(
            fixture
                .git(&["rev-parse", orphan.backup.as_deref().unwrap()])
                .trim(),
            original
        );
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn timed_out_rebase_hook_keeps_explicitly_recoverable_record_and_backup() {
        #[cfg(unix)]
        use std::os::unix::fs::PermissionsExt;
        let fixture = divergent_fixture(false);
        let plan = rebase_plan(&fixture);
        let original = plan.head_hash.clone();
        let hooks = fixture.0.path.join(".git/test-hooks");
        fs::create_dir_all(&hooks).unwrap();
        let started = fixture.0.path.join(".git/hook-started");
        let hook = hooks.join("pre-rebase");
        fs::write(
            &hook,
            "#!/bin/sh\nprintf started > .git/hook-started\nsleep 10\n",
        )
        .unwrap();
        #[cfg(unix)]
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
        fixture.git(&["config", "core.hooksPath", ".git/test-hooks"]);

        assert!(
            crate::rebase::start_with_timeout_for_test(
                &fixture.0,
                rebase_plan(&fixture),
                true,
                std::time::Duration::from_secs(2),
            )
            .is_err()
        );
        assert!(started.exists());
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]).trim(), original);
        let state = crate::rebase::read(&fixture.0, true).unwrap().unwrap();
        if state.active {
            crate::rebase::edit(&fixture.0, &state.token, crate::rebase::Edit::Abort, true)
                .unwrap();
        } else {
            crate::rebase::edit(
                &fixture.0,
                &state.token,
                crate::rebase::Edit::ClearRecord,
                true,
            )
            .unwrap();
        }
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]).trim(), original);
        assert!(!fixture.0.path.join(".git/ravengit-rebase.json").exists());
        assert!(
            fixture
                .git(&["for-each-ref", "refs/ravengit/rebase/"])
                .contains(&original)
        );
    }

    #[cfg(windows)]
    #[test]
    fn rebase_busy_record_reports_completed_abort_without_retry() {
        use std::os::windows::fs::OpenOptionsExt;
        let fixture = divergent_fixture(true);
        let plan = rebase_plan(&fixture);
        let original = plan.head_hash.clone();
        let original_tree = fixture.git(&["rev-parse", "HEAD^{tree}"]);
        crate::rebase::start(&fixture.0, plan, true).unwrap();
        let state = crate::rebase::read(&fixture.0, true).unwrap().unwrap();
        let backup = state.backup.clone().unwrap();
        let record = fixture.0.path.join(".git/ravengit-rebase.json");
        let record_bytes = fs::read(&record).unwrap();
        // Permit review reads but deny deletion until this fixture handle
        // closes. Read-only attributes alone do not reliably deny deletion.
        let held = fs::OpenOptions::new()
            .read(true)
            .share_mode(0x00000001 | 0x00000002) // FILE_SHARE_READ | FILE_SHARE_WRITE, no DELETE.
            .open(&record)
            .unwrap();
        let result =
            crate::rebase::edit(&fixture.0, &state.token, crate::rebase::Edit::Abort, true);
        drop(held);
        let failure = match result {
            Err(failure) => failure,
            Ok(_) => panic!("Windows must reject removing the busy record"),
        };
        assert!(failure.message.contains("Operación completada"));
        assert!(failure.message.contains("no repitas"));
        assert_eq!(fs::read(&record).unwrap(), record_bytes);
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]).trim(), original);
        assert_eq!(fixture.git(&["rev-parse", "HEAD^{tree}"]), original_tree);
        assert_eq!(fixture.git(&["rev-parse", &backup]).trim(), original);
        assert!(fixture.git(&["status", "--porcelain"]).is_empty());
        assert!(!fixture.0.path.join(".git/rebase-merge").exists());
        let recovered = crate::rebase::read(&fixture.0, true).unwrap().unwrap();
        assert!(!recovered.active);
        crate::rebase::edit(
            &fixture.0,
            &recovered.token,
            crate::rebase::Edit::ClearRecord,
            true,
        )
        .unwrap();
        assert!(!record.exists());
        assert_eq!(fixture.git(&["rev-parse", &backup]).trim(), original);
    }

    #[test]
    fn rejected_rebase_start_without_backup_can_clear_record_when_branch_is_intact() {
        let fixture = Fixture::new();
        let original = fixture.git(&["rev-parse", "HEAD"]).trim().to_owned();
        let record = fixture.0.path.join(".git/ravengit-rebase.json");
        let saved = serde_json::json!({
            "branch": "main",
            "original": original,
            "base": original,
            "backup": "refs/ravengit/rebase/unconfirmed",
        });
        fs::write(&record, serde_json::to_vec(&saved).unwrap()).unwrap();

        let state = crate::rebase::read(&fixture.0, true).unwrap().unwrap();
        assert!(!state.active);
        assert_eq!(state.backup, None);
        assert!(
            crate::rebase::edit(
                &fixture.0,
                &state.token,
                crate::rebase::Edit::ClearRecord,
                true,
            )
            .unwrap()
            .warning
            .is_none()
        );
        assert!(!record.exists());
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]).trim(), original);
        assert!(!read(&fixture.0, true).unwrap().rebase_record);
    }

    #[test]
    fn merge_conflicts_survive_reopen_and_resolve_before_continue() {
        let fixture = divergent_fixture(true);
        fixture.git(&["config", "branch.main.mergeOptions", "-Xours"]);
        let original = fixture.git(&["rev-parse", "HEAD"]);
        let incoming = fixture.git(&["rev-parse", "feature"]);
        start_merge(&fixture);
        let reopened = Repository {
            id: "reopened".into(),
            path: fixture.0.path.clone(),
        };
        let state = crate::merge::read(&reopened, true).unwrap().unwrap();
        assert_eq!(state.conflicts, ["archivo ü.txt"]);
        assert!(!state.can_continue);
        let resolve = || crate::merge::Edit::Resolve {
            path: "archivo ü.txt".into(),
        };
        assert_eq!(
            crate::merge::edit(&reopened, &state.token, resolve(), true)
                .unwrap_err()
                .code,
            "MERGE_MARKERS"
        );
        assert!(
            crate::merge::edit(
                &reopened,
                &state.token,
                crate::merge::Edit::Continue {
                    message: "merge".into()
                },
                true
            )
            .is_err()
        );
        assert!(
            crate::merge::edit(
                &reopened,
                &state.token,
                crate::merge::Edit::Resolve {
                    path: "../outside".into()
                },
                true
            )
            .is_err()
        );
        fs::write(fixture.0.path.join("archivo ü.txt"), "resolved\r\n").unwrap();
        assert_eq!(
            crate::merge::edit(&reopened, &state.token, resolve(), true)
                .unwrap_err()
                .code,
            "STALE"
        );
        let state = crate::merge::read(&reopened, true).unwrap().unwrap();
        crate::merge::edit(&reopened, &state.token, resolve(), true).unwrap();
        let state = crate::merge::read(&reopened, true).unwrap().unwrap();
        assert!(state.conflicts.is_empty());
        assert!(state.can_continue);
        crate::merge::edit(
            &reopened,
            &state.token,
            crate::merge::Edit::Continue {
                message: "merge resolved".into(),
            },
            true,
        )
        .unwrap();
        assert!(crate::merge::read(&reopened, true).unwrap().is_none());
        let parents = fixture.git(&["rev-list", "--parents", "-n", "1", "HEAD"]);
        assert_eq!(
            parents.split_whitespace().skip(1).collect::<Vec<_>>(),
            [original.trim(), incoming.trim()]
        );
    }

    #[test]
    fn merge_without_conflicts_pauses_for_review_and_aborts_without_reset_force() {
        let fixture = divergent_fixture(false);
        let original = fixture.git(&["rev-parse", "HEAD"]);
        start_merge(&fixture);
        let state = crate::merge::read(&fixture.0, true).unwrap().unwrap();
        assert!(state.can_continue);
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]), original);
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("archivo ü.txt")).unwrap(),
            "incoming\n"
        );
        crate::merge::edit(&fixture.0, &state.token, crate::merge::Edit::Abort, true).unwrap();
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]), original);
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("archivo ü.txt")).unwrap(),
            "base\n"
        );
        assert!(fixture.git(&["status", "--porcelain"]).is_empty());
    }

    #[test]
    fn merge_recovery_rejects_tampered_orig_head_and_locks() {
        let fixture = divergent_fixture(true);
        start_merge(&fixture);
        let state = crate::merge::read(&fixture.0, true).unwrap().unwrap();
        fs::write(fixture.0.path.join(".git/index.lock"), "existing").unwrap();
        assert!(
            crate::merge::edit(&fixture.0, &state.token, crate::merge::Edit::Abort, true).is_err()
        );
        assert_eq!(
            fs::read_to_string(fixture.0.path.join(".git/index.lock")).unwrap(),
            "existing"
        );
        fs::remove_file(fixture.0.path.join(".git/index.lock")).unwrap();
        fixture.git(&["config", "remote.origin.promisor", "yes"]);
        assert!(
            crate::merge::read(&fixture.0, true)
                .unwrap()
                .unwrap()
                .restriction
                .is_some()
        );
        fixture.git(&["config", "--unset", "remote.origin.promisor"]);
        fs::write(
            fixture.0.path.join(".git/ORIG_HEAD"),
            fixture.git(&["rev-parse", "feature"]),
        )
        .unwrap();
        let state = crate::merge::read(&fixture.0, true).unwrap().unwrap();
        assert!(state.restriction.is_some());
        assert!(
            crate::merge::edit(&fixture.0, &state.token, crate::merge::Edit::Abort, true).is_err()
        );
        assert!(fixture.0.path.join(".git/MERGE_HEAD").exists());
    }

    #[test]
    fn merge_deleted_resolution_and_failed_hook_remain_recoverable() {
        let fixture = divergent_fixture(true);
        start_merge(&fixture);
        fs::remove_file(fixture.0.path.join("archivo ü.txt")).unwrap();
        let state = crate::merge::read(&fixture.0, true).unwrap().unwrap();
        crate::merge::edit(
            &fixture.0,
            &state.token,
            crate::merge::Edit::Resolve {
                path: "archivo ü.txt".into(),
            },
            true,
        )
        .unwrap();
        fixture.git(&["config", "core.hooksPath", ".git/hooks"]);
        let hook = fixture.0.path.join(".git/hooks/pre-commit");
        fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let state = crate::merge::read(&fixture.0, true).unwrap().unwrap();
        assert!(state.can_continue);
        assert!(
            crate::merge::edit(
                &fixture.0,
                &state.token,
                crate::merge::Edit::Continue {
                    message: "merge deletion".into()
                },
                true
            )
            .is_err()
        );
        assert!(fixture.0.path.join(".git/MERGE_HEAD").exists());
        fs::remove_file(hook).unwrap();
        let state = crate::merge::read(&fixture.0, true).unwrap().unwrap();
        crate::merge::edit(&fixture.0, &state.token, crate::merge::Edit::Abort, true).unwrap();
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("archivo ü.txt")).unwrap(),
            "local\n"
        );
    }

    #[test]
    #[cfg(windows)]
    fn merge_blocks_junction_escape_in_incoming_tree() {
        let fixture = Fixture::new();
        let outside = Fixture::new();
        fixture.git(&["switch", "-c", "feature"]);
        fs::create_dir(fixture.0.path.join("nested")).unwrap();
        fs::write(fixture.0.path.join("nested/new.txt"), "incoming\n").unwrap();
        fixture.git(&["add", "--all"]);
        fixture.git(&["commit", "-m", "nested incoming"]);
        fixture.git(&["switch", "main"]);
        fs::write(fixture.0.path.join(".git/info/exclude"), "nested\n").unwrap();
        let junction = fixture.0.path.join("nested");
        assert!(
            std::process::Command::new("cmd")
                .args(["/c", "mklink", "/J"])
                .arg(&junction)
                .arg(&outside.0.path)
                .output()
                .unwrap()
                .status
                .success()
        );
        let state = read(&fixture.0, true).unwrap();
        let review = crate::merge::preview(&fixture.0, &state.token, "feature", true).unwrap();
        let result = crate::merge::edit(
            &fixture.0,
            &state.token,
            crate::merge::Edit::Start {
                source: review.source,
                source_hash: review.source_hash,
                destination_hash: review.destination_hash,
            },
            true,
        );
        assert_eq!(result.unwrap_err().code, "PATH_ESCAPE");
        assert!(!outside.0.path.join("new.txt").exists());
        assert_eq!(
            fs::read_to_string(outside.0.path.join("archivo ü.txt")).unwrap(),
            "base\n"
        );
        fs::remove_dir(junction).unwrap();
    }

    #[test]
    fn merge_review_is_read_only_and_rejects_stale_state() {
        let fixture = Fixture::new();
        fixture.git(&["branch", "feature"]);
        let initial = read(&fixture.0, true).unwrap();
        let review = crate::merge::preview(&fixture.0, &initial.token, "feature", true).unwrap();
        assert_eq!(review.relation, "upToDate");
        assert_eq!(review.incoming, 0);
        fixture.git(&["switch", "feature"]);
        fs::write(fixture.0.path.join("incoming.txt"), "incoming\n").unwrap();
        fixture.git(&["add", "--all"]);
        fixture.git(&["commit", "-m", "incoming"]);
        fixture.git(&["switch", "main"]);
        assert_eq!(
            crate::merge::preview(&fixture.0, &initial.token, "feature", true)
                .unwrap_err()
                .code,
            "STALE"
        );
        let state = read(&fixture.0, true).unwrap();
        let index = fs::read(fixture.0.path.join(".git/index")).unwrap();
        let review = crate::merge::preview(&fixture.0, &state.token, "feature", true).unwrap();
        assert_eq!(review.relation, "fastForward");
        assert_eq!(review.commits[0].subject, "incoming");
        assert_eq!(review.destination_hash, state.head.unwrap());
        assert_eq!(fs::read(fixture.0.path.join(".git/index")).unwrap(), index);
        assert!(!fixture.0.path.join("incoming.txt").exists());
        assert!(!fixture.0.path.join(".git/MERGE_HEAD").exists());
        fs::write(fixture.0.path.join("local.txt"), "local\n").unwrap();
        fixture.git(&["add", "--all"]);
        fixture.git(&["commit", "-m", "local"]);
        let state = read(&fixture.0, true).unwrap();
        let review = crate::merge::preview(&fixture.0, &state.token, "feature", true).unwrap();
        assert_eq!(review.relation, "diverged");
        assert_eq!((review.incoming, review.local), (1, 1));
        assert!(crate::merge::preview(&fixture.0, &state.token, "main", true).is_err());
        assert!(crate::merge::preview(&fixture.0, &state.token, "--all", true).is_err());
    }
    #[test]
    fn creates_switches_and_renames_without_resetting_refs() {
        let fixture = Fixture::new();
        let head = fixture.git(&["rev-parse", "HEAD"]);
        fixture
            .edit(Edit::Create {
                name: "feature/uno".into(),
            })
            .unwrap();
        assert_eq!(fixture.git(&["branch", "--show-current"]).trim(), "main");
        fixture
            .edit(Edit::Switch {
                name: "feature/uno".into(),
            })
            .unwrap();
        fixture
            .edit(Edit::Rename {
                source: "feature/uno".into(),
                name: "feature/dos".into(),
            })
            .unwrap();
        assert_eq!(
            fixture.git(&["branch", "--show-current"]).trim(),
            "feature/dos"
        );
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]), head);
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("archivo ü.txt")).unwrap(),
            "base\n"
        );
        assert!(
            fixture
                .edit(Edit::Create {
                    name: "main".into()
                })
                .is_err()
        );
        assert!(
            fixture
                .edit(Edit::Create {
                    name: "--force".into()
                })
                .is_err()
        );
    }
    #[test]
    fn denies_untrusted_dirty_and_stale_requests() {
        let fixture = Fixture::new();
        let token = read(&fixture.0, true).unwrap().token;
        assert!(!read(&fixture.0, false).unwrap().trusted);
        assert_eq!(
            edit(
                &fixture.0,
                &token,
                Edit::Create {
                    name: "blocked".into()
                },
                false
            )
            .unwrap_err()
            .code,
            "TRUST_REQUIRED"
        );
        fixture.git(&["branch", "external"]);
        assert_eq!(
            edit(
                &fixture.0,
                &token,
                Edit::Create {
                    name: "blocked".into()
                },
                true
            )
            .unwrap_err()
            .code,
            "STALE_BRANCHES"
        );
        fs::write(fixture.0.path.join("untracked.txt"), "keep").unwrap();
        assert_eq!(
            fixture
                .edit(Edit::Switch {
                    name: "external".into()
                })
                .unwrap_err()
                .code,
            "BRANCH_BLOCKED"
        );
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("untracked.txt")).unwrap(),
            "keep"
        );
        assert_eq!(fixture.git(&["branch", "--show-current"]).trim(), "main");
    }
    #[test]
    fn preserves_ignored_files_when_target_would_overwrite_them() {
        let fixture = Fixture::new();
        fixture.git(&["switch", "-c", "target"]);
        fs::write(fixture.0.path.join("ignored.txt"), "tracked target").unwrap();
        fixture.git(&["add", "ignored.txt"]);
        fixture.git(&["commit", "-m", "target"]);
        fixture.git(&["switch", "main"]);
        fs::write(fixture.0.path.join(".git/info/exclude"), "ignored.txt\n").unwrap();
        fs::write(fixture.0.path.join("ignored.txt"), "private local").unwrap();
        assert!(
            fixture
                .edit(Edit::Switch {
                    name: "target".into()
                })
                .is_err()
        );
        assert_eq!(fixture.git(&["branch", "--show-current"]).trim(), "main");
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("ignored.txt")).unwrap(),
            "private local"
        );
    }
    #[test]
    fn blocks_active_operations_locks_and_linked_worktrees() {
        let fixture = Fixture::new();
        fs::write(
            fixture.0.path.join(".git/MERGE_HEAD"),
            fixture.git(&["rev-parse", "HEAD"]),
        )
        .unwrap();
        assert!(read(&fixture.0, true).unwrap().restriction.is_some());
        fs::remove_file(fixture.0.path.join(".git/MERGE_HEAD")).unwrap();
        fs::write(fixture.0.path.join(".git/index.lock"), "owned elsewhere").unwrap();
        assert!(
            fixture
                .edit(Edit::Create {
                    name: "blocked".into()
                })
                .is_err()
        );
        assert_eq!(
            fs::read_to_string(fixture.0.path.join(".git/index.lock")).unwrap(),
            "owned elsewhere"
        );
        fs::remove_file(fixture.0.path.join(".git/index.lock")).unwrap();
        let linked = fixture.0.path.join("linked");
        fs::write(fixture.0.path.join(".git/info/exclude"), "linked/\n").unwrap();
        fixture.git(&["worktree", "add", "-b", "linked", linked.to_str().unwrap()]);
        assert!(
            read(&fixture.0, true)
                .unwrap()
                .restriction
                .unwrap()
                .contains("worktrees")
        );
    }
    #[test]
    fn switches_file_contents_and_rejects_staged_changes() {
        let fixture = Fixture::new();
        fixture.git(&["switch", "-c", "target"]);
        fs::write(fixture.0.path.join("archivo ü.txt"), "target\n").unwrap();
        fixture.git(&["add", "--all"]);
        fixture.git(&["commit", "-m", "target"]);
        let target = fixture.git(&["rev-parse", "HEAD"]);
        fixture.git(&["switch", "main"]);
        fixture
            .edit(Edit::Switch {
                name: "target".into(),
            })
            .unwrap();
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]), target);
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("archivo ü.txt")).unwrap(),
            "target\n"
        );
        fs::write(fixture.0.path.join("archivo ü.txt"), "staged\n").unwrap();
        fixture.git(&["add", "--all"]);
        let index = fs::read(fixture.0.path.join(".git/index")).unwrap();
        assert!(
            fixture
                .edit(Edit::Switch {
                    name: "main".into()
                })
                .is_err()
        );
        assert_eq!(fs::read(fixture.0.path.join(".git/index")).unwrap(), index);
        assert_eq!(fixture.git(&["show", ":archivo ü.txt"]), "staged\n");
    }
    #[test]
    fn preserves_detached_commits_before_switching() {
        let fixture = Fixture::new();
        fixture.git(&["switch", "--detach"]);
        fs::write(fixture.0.path.join("archivo ü.txt"), "detached\n").unwrap();
        fixture.git(&["add", "--all"]);
        fixture.git(&["commit", "-m", "detached"]);
        let head = fixture.git(&["rev-parse", "HEAD"]);
        assert_eq!(
            fixture
                .edit(Edit::Switch {
                    name: "main".into()
                })
                .unwrap_err()
                .code,
            "BRANCH_DETACHED"
        );
        fixture
            .edit(Edit::Create {
                name: "saved".into(),
            })
            .unwrap();
        fixture
            .edit(Edit::Switch {
                name: "saved".into(),
            })
            .unwrap();
        assert_eq!(fixture.git(&["rev-parse", "HEAD"]), head);
    }
    #[test]
    fn confirms_switch_even_when_post_checkout_hook_fails() {
        let fixture = Fixture::new();
        fixture.git(&["branch", "target"]);
        fixture.git(&["config", "core.hooksPath", ".git/hooks"]);
        let hook = fixture.0.path.join(".git/hooks/post-checkout");
        fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let outcome = fixture
            .edit(Edit::Switch {
                name: "target".into(),
            })
            .unwrap();
        assert!(outcome.warning.is_some());
        assert_eq!(fixture.git(&["branch", "--show-current"]).trim(), "target");
    }
    #[test]
    fn blocks_hidden_modifications_from_index_flags() {
        let fixture = Fixture::new();
        fixture.git(&["branch", "target"]);
        fixture.git(&["update-index", "--assume-unchanged", "archivo ü.txt"]);
        fs::write(
            fixture.0.path.join("archivo ü.txt"),
            "hidden local change\n",
        )
        .unwrap();
        assert!(
            read(&fixture.0, true)
                .unwrap()
                .restriction
                .unwrap()
                .contains("assume-unchanged")
        );
        assert!(
            fixture
                .edit(Edit::Switch {
                    name: "target".into()
                })
                .is_err()
        );
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("archivo ü.txt")).unwrap(),
            "hidden local change\n"
        );
    }
}
