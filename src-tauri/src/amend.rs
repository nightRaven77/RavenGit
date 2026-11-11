use crate::{
    changes,
    git::{self, GitError, Repository, Result},
    merge,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub token: String,
    pub head: String,
    pub branch: String,
    pub author: String,
    pub committer: String,
    pub original_message: String,
    pub message: String,
    pub original_patch: String,
    pub staged_patch: String,
    pub published_refs: Vec<String>,
    #[serde(skip)]
    changes_token: String,
}
#[derive(Serialize)]
pub struct Outcome {
    pub result: changes::MutationResult,
    pub backup: String,
}
fn error(message: &str) -> GitError {
    GitError::new("AMEND", message)
}
pub fn preview(repo: &Repository, message: Option<&str>, trusted: bool) -> Result<Plan> {
    if !trusted {
        return Err(error("Autoriza el repositorio antes de revisar amend."));
    }
    merge::supported(repo)?;
    for name in [
        "ravengit-rebase.json",
        "ravengit-replay.json",
        "ravengit-stash.json",
    ] {
        if repo.path.join(".git").join(name).exists() {
            return Err(error(
                "Recupera la operación pendiente antes de revisar amend.",
            ));
        }
    }
    let state = changes::read(repo, true)?;
    if state.operation.is_some() || state.entries.iter().any(|entry| entry.conflict) {
        return Err(error("Hay una operación Git o conflictos pendientes."));
    }
    let head = state
        .head
        .ok_or_else(|| error("Crea el primer commit antes de usar amend."))?;
    let branch = state
        .branch
        .ok_or_else(|| error("Amend requiere una rama local; HEAD está separado."))?;
    let committer = state
        .author
        .ok_or_else(|| error("Configura user.name y user.email en Git antes de continuar."))?;
    let parents = git::text(
        &repo.path,
        &["rev-list", "--parents", "-n", "1", &head, "--"],
    )?;
    if parents.split_whitespace().count() > 2 {
        return Err(error(
            "Amend de un commit de merge no está habilitado en este incremento.",
        ));
    }
    let original_message = git::text(&repo.path, &["show", "-s", "--format=%B", &head, "--"])?;
    let message = message
        .unwrap_or(original_message.trim_end_matches('\n'))
        .to_owned();
    if message.trim().is_empty() || message.len() > 65536 || message.contains('\0') {
        return Err(error("Escribe un mensaje válido de hasta 64 KiB."));
    }
    let author = git::text(
        &repo.path,
        &["show", "-s", "--format=%an <%ae>", &head, "--"],
    )?;
    let original_patch = git::text(
        &repo.path,
        &[
            "show",
            "--format=",
            "--root",
            "--no-ext-diff",
            "--no-textconv",
            "--no-renames",
            &head,
            "--",
        ],
    )?;
    let staged_patch = git::text(
        &repo.path,
        &[
            "diff",
            "--cached",
            "--no-ext-diff",
            "--no-textconv",
            "--no-renames",
            &head,
            "--",
        ],
    )?;
    let refs = git::text(
        &repo.path,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(objectname)",
            "refs/heads/",
            "refs/remotes/",
            "refs/tags/",
        ],
    )?;
    let published = git::text(
        &repo.path,
        &[
            "for-each-ref",
            "--contains",
            &head,
            "--format=%(refname)",
            "refs/remotes/",
        ],
    )?;
    let published_refs = published.lines().map(str::to_owned).collect();
    let mut digest = Sha256::new();
    for field in [
        &state.token,
        &refs,
        &published,
        &message,
        &original_patch,
        &staged_patch,
    ] {
        digest.update((field.len() as u64).to_le_bytes());
        digest.update(field.as_bytes());
    }
    if changes::read(repo, true)?.token != state.token {
        return Err(error(
            "El repositorio cambió durante la revisión. Actualiza antes de continuar.",
        ));
    }
    Ok(Plan {
        token: format!("{:x}", digest.finalize()),
        head,
        branch,
        author: author.trim_end().into(),
        committer,
        original_message,
        message,
        original_patch,
        staged_patch,
        published_refs,
        changes_token: state.token,
    })
}
pub fn execute(repo: &Repository, plan: Plan, trusted: bool) -> Result<Outcome> {
    let fresh = preview(repo, Some(&plan.message), trusted)?;
    if fresh.token != plan.token {
        return Err(error(
            "La revisión quedó obsoleta. HEAD, archivos, index, identidad o referencias cambiaron; vuelve a revisar.",
        ));
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| error("No se pudo preparar el respaldo."))?
        .as_nanos();
    let backup = format!(
        "refs/ravengit/amend/{}-{}-{nonce}",
        plan.head,
        std::process::id()
    );
    git::run(
        &repo.path,
        &[
            "update-ref",
            "--create-reflog",
            "-m",
            "RavenGit: respaldo antes de amend",
            &backup,
            &plan.head,
            &"0".repeat(plan.head.len()),
        ],
    )?;
    let result = changes::amend(repo, &plan.changes_token, &plan.message, trusted).map_err(|error| GitError::new("AMEND_UNCERTAIN", format!("{} Respaldo conservado en {backup}. Comprueba HEAD e index antes de repetir; no se restaura automáticamente.", error.message)))?;
    Ok(Outcome { result, backup })
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
                "ravengit-amend-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            let fixture = Self(Repository {
                id: "amend-test".into(),
                path,
            });
            fixture.git(&["init", "-b", "main"]);
            for (name, value) in [
                ("user.name", "Original Author"),
                ("user.email", "original@example.invalid"),
                ("commit.gpgsign", "false"),
                ("core.autocrlf", "false"),
            ] {
                fixture.git(&["config", name, value]);
            }
            fixture.git(&[
                "config",
                "core.hooksPath",
                fixture.0.path.join(".git/no-hooks").to_str().unwrap(),
            ]);
            fixture
        }
        fn git(&self, args: &[&str]) -> String {
            git::text(&self.0.path, args).unwrap()
        }
        fn file(&self, name: &str, value: &str) {
            fs::write(self.0.path.join(name), value).unwrap();
        }
        fn base(&self) {
            self.file("archivo ü.txt", "base\n");
            self.git(&["add", "--all"]);
            self.git(&["commit", "-m", "Original\n\nDescripción original"]);
        }
        fn head(&self) -> String {
            self.git(&["rev-parse", "HEAD"]).trim().into()
        }
        fn index(&self) -> Vec<u8> {
            fs::read(self.0.path.join(".git/index")).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0.path);
        }
    }

    #[test]
    fn root_message_only_preserves_author_tree_and_unstaged_files_with_backup() {
        let fixture = Fixture::new();
        fixture.base();
        let original = fixture.head();
        let tree = fixture.git(&["rev-parse", "HEAD^{tree}"]);
        fixture.git(&["config", "user.name", "New Committer"]);
        fixture.git(&["config", "user.email", "committer@example.invalid"]);
        fixture.file("archivo ü.txt", "sin preparar\n");
        fixture.file("no-seguido.txt", "privado\n");
        let plan = preview(&fixture.0, Some("Corregido\n\nDescripción nueva"), true).unwrap();
        assert!(plan.staged_patch.is_empty());
        assert!(plan.author.starts_with("Original Author"));
        let outcome = execute(&fixture.0, plan, true).unwrap();
        assert_ne!(fixture.head(), original);
        assert_eq!(fixture.git(&["rev-parse", "HEAD^{tree}"]), tree);
        assert_eq!(
            fixture.git(&["rev-parse", &outcome.backup]).trim(),
            original
        );
        assert_eq!(
            fixture
                .git(&["show", "-s", "--format=%an|%ae|%cn", "HEAD"])
                .trim(),
            "Original Author|original@example.invalid|New Committer"
        );
        assert_eq!(fixture.git(&["rev-list", "--count", "HEAD"]).trim(), "1");
        assert_eq!(
            fixture
                .git(&["show", "-s", "--format=%B", "HEAD"])
                .trim_end(),
            "Corregido\n\nDescripción nueva"
        );
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("archivo ü.txt")).unwrap(),
            "sin preparar\n"
        );
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("no-seguido.txt")).unwrap(),
            "privado\n"
        );
        assert!(outcome.result.commit_hash.is_some());
    }
    #[test]
    fn staged_changes_replace_tip_without_adding_a_parent_or_staging_worktree() {
        let fixture = Fixture::new();
        fixture.base();
        let parent = fixture.head();
        fixture.file("archivo ü.txt", "segundo\n");
        fixture.git(&["add", "--all"]);
        fixture.git(&["commit", "-m", "Segundo"]);
        fixture.file("archivo ü.txt", "preparado\n");
        fixture.git(&["add", "--all"]);
        fixture.file("archivo ü.txt", "sin preparar\n");
        let plan = preview(&fixture.0, Some("Segundo corregido"), true).unwrap();
        assert!(plan.staged_patch.contains("+preparado"));
        execute(&fixture.0, plan, true).unwrap();
        assert_eq!(fixture.git(&["rev-parse", "HEAD^"]).trim(), parent);
        assert_eq!(fixture.git(&["rev-list", "--count", "HEAD"]).trim(), "2");
        assert_eq!(fixture.git(&["show", "HEAD:archivo ü.txt"]), "preparado\n");
        assert_eq!(fixture.git(&["show", ":archivo ü.txt"]), "preparado\n");
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("archivo ü.txt")).unwrap(),
            "sin preparar\n"
        );
    }
    #[test]
    fn external_worktree_index_head_branch_and_remote_ref_changes_invalidate_review() {
        for mutation in ["worktree", "index", "head", "branch", "remote", "identity"] {
            let fixture = Fixture::new();
            fixture.base();
            let plan = preview(&fixture.0, Some("Corregido"), true).unwrap();
            match mutation {
                "worktree" => fixture.file("archivo ü.txt", "externo"),
                "index" => {
                    fixture.file("nuevo", "preparado");
                    fixture.git(&["add", "--all"]);
                }
                "head" => {
                    fixture.git(&["commit", "--allow-empty", "-m", "Externo"]);
                }
                "branch" => {
                    fixture.git(&["switch", "-c", "otra"]);
                }
                "remote" => {
                    fixture.git(&["update-ref", "refs/remotes/origin/main", "HEAD"]);
                }
                "identity" => {
                    fixture.git(&["config", "user.email", "changed@example.invalid"]);
                }
                _ => unreachable!(),
            }
            let before = fixture.head();
            assert!(execute(&fixture.0, plan, true).is_err(), "{mutation}");
            assert_eq!(fixture.head(), before);
            assert!(
                fixture
                    .git(&[
                        "for-each-ref",
                        "--format=%(refname)",
                        "refs/ravengit/amend/"
                    ])
                    .is_empty()
            );
        }
    }
    #[test]
    fn detects_remote_containment_without_network_and_accepts_explicit_review() {
        let fixture = Fixture::new();
        fixture.base();
        fixture.git(&["update-ref", "refs/remotes/origin/main", "HEAD"]);
        let remote = fixture.head();
        let plan = preview(&fixture.0, Some("Corregido"), true).unwrap();
        assert_eq!(plan.published_refs, vec!["refs/remotes/origin/main"]);
        execute(&fixture.0, plan, true).unwrap();
        assert_eq!(
            fixture
                .git(&["rev-parse", "refs/remotes/origin/main"])
                .trim(),
            remote
        );
    }
    #[test]
    fn rejects_untrusted_unborn_detached_operations_and_invalid_messages() {
        let fixture = Fixture::new();
        assert!(preview(&fixture.0, None, false).is_err());
        assert!(preview(&fixture.0, None, true).is_err());
        fixture.base();
        for message in ["".into(), "  \n".into(), "nul\0".into(), "x".repeat(65537)] {
            assert!(preview(&fixture.0, Some(&message), true).is_err());
        }
        fixture.git(&["switch", "--detach"]);
        assert!(preview(&fixture.0, None, true).is_err());
        fixture.git(&["switch", "main"]);
        for marker in [
            "MERGE_HEAD",
            "CHERRY_PICK_HEAD",
            "ravengit-rebase.json",
            "ravengit-replay.json",
            "index.lock",
        ] {
            let path = fixture.0.path.join(".git").join(marker);
            fs::write(&path, fixture.head()).unwrap();
            assert!(preview(&fixture.0, None, true).is_err(), "{marker}");
            fs::remove_file(path).unwrap();
        }
    }
    #[test]
    fn signing_failure_keeps_original_head_index_and_backup_without_retry() {
        let fixture = Fixture::new();
        fixture.base();
        fixture.file("archivo ü.txt", "preparado\n");
        fixture.git(&["add", "--all"]);
        fixture.git(&["config", "commit.gpgsign", "true"]);
        fixture.git(&["config", "gpg.format", "invalid-fixture-format"]);
        let plan = preview(&fixture.0, Some("Corregido"), true).unwrap();
        let head = fixture.head();
        let index = fixture.index();
        let error = execute(&fixture.0, plan, true).err().unwrap();
        assert_eq!(error.code, "AMEND_UNCERTAIN");
        assert!(error.message.contains("refs/ravengit/amend/"));
        assert_eq!(fixture.head(), head);
        assert_eq!(fixture.index(), index);
        let refs = fixture.git(&[
            "for-each-ref",
            "--format=%(objectname)",
            "refs/ravengit/amend/",
        ]);
        assert_eq!(refs.trim(), head);
        assert!(!fixture.0.path.join(".git/index.lock").exists());
    }
    #[test]
    fn merge_tip_and_hidden_index_marks_are_rejected() {
        let fixture = Fixture::new();
        fixture.base();
        fixture.git(&["switch", "-c", "side"]);
        fixture.file("side", "side");
        fixture.git(&["add", "--all"]);
        fixture.git(&["commit", "-m", "Side"]);
        fixture.git(&["switch", "main"]);
        fixture.git(&["merge", "--no-ff", "side", "-m", "Merge"]);
        assert!(preview(&fixture.0, None, true).is_err());
        fixture.git(&["switch", "side"]);
        fixture.git(&["update-index", "--assume-unchanged", "archivo ü.txt"]);
        assert!(preview(&fixture.0, None, true).is_err());
    }
}
