use crate::{
    git::{self, GitError, Repository, Result},
    process,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::time::Duration;

#[derive(Clone, Serialize)]
pub struct Plan {
    pub token: String,
    pub name: String,
    pub commit: String,
    pub subject: String,
}
fn error(message: &str) -> GitError {
    GitError::new("TAG", message)
}
fn text(repo: &Repository, args: &[&str]) -> Result<String> {
    let mut command = vec!["--no-replace-objects"];
    command.extend_from_slice(args);
    git::text(&repo.path, &command)
}
pub fn preview(repo: &Repository, name: &str, commit: &str, trusted: bool) -> Result<Plan> {
    if !trusted {
        return Err(error(
            "Autoriza el repositorio desde Cambios antes de crear etiquetas.",
        ));
    }
    if name.is_empty()
        || name.len() > 255
        || name.trim() != name
        || name.starts_with('-')
        || name.contains('\0')
    {
        return Err(error(
            "Indica un nombre de etiqueta válido de hasta 255 bytes, sin espacios exteriores ni opciones.",
        ));
    }
    let reference = format!("refs/tags/{name}");
    text(repo, &["check-ref-format", &reference])
        .map_err(|_| error("El nombre no es válido para una etiqueta Git."))?;
    if !matches!(commit.len(), 40 | 64) || !commit.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(error(
            "Selecciona un hash completo de commit; no se admiten opciones, rangos ni expresiones.",
        ));
    }
    if !repo.path.join(".git").is_dir() {
        return Err(error(
            "Este incremento requiere un repositorio con .git de directorio, sin worktrees enlazados.",
        ));
    }
    match std::fs::symlink_metadata(repo.path.join(".git/refs/tags").join(name)) {
        Ok(_) => {
            return Err(error(
                "Ya existe una referencia o carpeta con ese nombre. No se reemplaza, aunque esté dañada.",
            ));
        }
        Err(failure) if failure.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => {
            return Err(error(
                "No se pudo verificar si el nombre de etiqueta ya existe.",
            ));
        }
    }
    for marker in [
        "index.lock",
        "HEAD.lock",
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
        "sequencer",
        "BISECT_LOG",
        "ravengit-rebase.json",
        "ravengit-replay.json",
        "ravengit-stash.json",
    ] {
        if repo.path.join(".git").join(marker).exists() {
            return Err(error(
                "Termina la operación Git o revisa sus locks antes de crear una etiqueta.",
            ));
        }
    }
    let commit = commit.to_ascii_lowercase();
    if text(repo, &["cat-file", "-t", &commit])?.trim() != "commit" {
        return Err(error("El objeto seleccionado no es un commit."));
    }
    let head = text(repo, &["rev-parse", "--verify", "HEAD"])?;
    let branch = text(repo, &["symbolic-ref", "--quiet", "HEAD"]).unwrap_or_default();
    let refs = text(
        repo,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(objectname)",
            "refs/tags/",
        ],
    )?;
    if refs.lines().any(|line| {
        line.split_once('\0')
            .is_some_and(|(existing, _)| existing == reference)
    }) {
        return Err(error(
            "Ya existe esa etiqueta. No se reemplazan ni mueven etiquetas existentes.",
        ));
    }
    let subject = text(repo, &["show", "-s", "--format=%s", &commit, "--"])?;
    let mut digest = Sha256::new();
    for field in [&head, &branch, &refs, name, &commit, &subject] {
        digest.update((field.len() as u64).to_le_bytes());
        digest.update(field.as_bytes());
    }
    Ok(Plan {
        token: format!("{:x}", digest.finalize()),
        name: name.into(),
        commit,
        subject: subject.trim_end().into(),
    })
}
pub fn create(repo: &Repository, plan: Plan, trusted: bool) -> Result<String> {
    if preview(repo, &plan.name, &plan.commit, trusted)?.token != plan.token {
        return Err(error(
            "HEAD, rama o etiquetas cambiaron. Vuelve a revisar antes de confirmar.",
        ));
    }
    let reference = format!("refs/tags/{}", plan.name);
    let mut command = process::git(&repo.path);
    command.args([
        "--no-replace-objects",
        "update-ref",
        "--no-deref",
        "--create-reflog",
        "-m",
        "RavenGit: etiqueta ligera",
        &reference,
        &plan.commit,
        &"0".repeat(plan.commit.len()),
    ]);
    let result = process::execute(command,None,Duration::from_secs(60)).map_err(|_|error("Resultado incierto. Comprueba las etiquetas antes de repetir; no hay reintento automático."))?;
    if !result.success {
        return Err(error(
            "Git no confirmó la creación. Comprueba la etiqueta, permisos, locks y hooks antes de repetir; no se fuerza su reemplazo.",
        ));
    }
    if text(repo, &["show-ref", "--verify", "--hash", &reference]).map_err(|_|error("La etiqueta puede haberse creado, pero no pudo verificarse. Comprueba las referencias antes de repetir."))?.trim() != plan.commit {
        return Err(error(
            "No se pudo confirmar el destino creado. Comprueba las etiquetas antes de repetir.",
        ));
    }
    Ok(format!(
        "Etiqueta local {} creada en {}. No se publicó en ningún remoto.",
        plan.name,
        &plan.commit[..8]
    ))
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
                "ravengit-tags-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            let fixture = Self(Repository {
                id: "tags-fixture".into(),
                path,
            });
            fixture.git(&["init", "-b", "main"]);
            for (name, value) in [
                ("user.name", "Fixture"),
                ("user.email", "fixture@example.invalid"),
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
            fs::write(fixture.0.path.join("file"), "base").unwrap();
            fixture.git(&["add", "--all"]);
            fixture.git(&["commit", "-m", "Base"]);
            fixture
        }
        fn git(&self, args: &[&str]) -> String {
            text(&self.0, args).unwrap()
        }
        fn head(&self) -> String {
            self.git(&["rev-parse", "HEAD"]).trim().into()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0.path);
        }
    }
    #[test]
    fn creates_lightweight_tag_on_selected_commit_preserving_dirty_index_and_head() {
        let fixture = Fixture::new();
        let selected = fixture.head();
        fixture.git(&["commit", "--allow-empty", "-m", "Next"]);
        let head = fixture.head();
        fs::write(fixture.0.path.join("file"), "staged").unwrap();
        fixture.git(&["add", "--all"]);
        fs::write(fixture.0.path.join("file"), "unstaged").unwrap();
        fixture.git(&["config", "tag.gpgSign", "true"]);
        let index = fs::read(fixture.0.path.join(".git/index")).unwrap();
        let plan = preview(&fixture.0, "release/v1.0", &selected, true).unwrap();
        create(&fixture.0, plan, true).unwrap();
        assert_eq!(
            fixture.git(&["rev-parse", "refs/tags/release/v1.0"]).trim(),
            selected
        );
        assert_eq!(
            fixture
                .git(&["cat-file", "-t", "refs/tags/release/v1.0"])
                .trim(),
            "commit"
        );
        assert_eq!(fixture.head(), head);
        assert_eq!(fs::read(fixture.0.path.join(".git/index")).unwrap(), index);
        assert_eq!(
            fs::read_to_string(fixture.0.path.join("file")).unwrap(),
            "unstaged"
        );
    }
    #[test]
    fn rejects_invalid_names_untrusted_inputs_and_noncommit_objects() {
        let fixture = Fixture::new();
        let head = fixture.head();
        assert!(preview(&fixture.0, "valid", &head, false).is_err());
        for name in [
            "",
            "-f",
            "a..b",
            "a b",
            "bad@{name",
            " leading",
            "end ",
            "a.lock",
            "../escape",
        ] {
            assert!(preview(&fixture.0, name, &head, true).is_err(), "{name}");
        }
        for target in ["HEAD", "--all", "bad", "HEAD~1"] {
            assert!(preview(&fixture.0, "valid", target, true).is_err());
        }
        let tree = fixture.git(&["rev-parse", "HEAD^{tree}"]);
        assert!(preview(&fixture.0, "valid", tree.trim(), true).is_err());
    }
    #[test]
    fn refuses_existing_lightweight_annotated_and_concurrently_created_tags() {
        let fixture = Fixture::new();
        let head = fixture.head();
        let plan = preview(&fixture.0, "v1", &head, true).unwrap();
        fixture.git(&["tag", "v1"]);
        assert!(create(&fixture.0, plan, true).is_err());
        assert!(preview(&fixture.0, "v1", &head, true).is_err());
        fixture.git(&["tag", "-a", "annotated", "-m", "Existing"]);
        assert!(preview(&fixture.0, "annotated", &head, true).is_err());
        assert_eq!(fixture.git(&["rev-parse", "refs/tags/v1"]).trim(), head);
    }
    #[test]
    fn external_head_or_other_tag_changes_invalidate_the_plan() {
        for mutation in ["head", "tag"] {
            let fixture = Fixture::new();
            let head = fixture.head();
            let plan = preview(&fixture.0, "v1", &head, true).unwrap();
            if mutation == "head" {
                fixture.git(&["commit", "--allow-empty", "-m", "External"]);
            } else {
                fixture.git(&["tag", "other"]);
            }
            assert!(create(&fixture.0, plan, true).is_err());
            assert!(
                fixture
                    .git(&["for-each-ref", "--format=%(refname)", "refs/tags/v1"])
                    .is_empty()
            );
        }
    }
    #[test]
    fn allows_detached_head_but_rejects_pending_operations() {
        let fixture = Fixture::new();
        fixture.git(&["switch", "--detach"]);
        let head = fixture.head();
        create(
            &fixture.0,
            preview(&fixture.0, "detached", &head, true).unwrap(),
            true,
        )
        .unwrap();
        let marker = fixture.0.path.join(".git/MERGE_HEAD");
        fs::write(marker, &head).unwrap();
        assert!(preview(&fixture.0, "blocked", &head, true).is_err());
    }
    #[test]
    fn never_adopts_a_dangling_or_malformed_existing_reference() {
        let fixture = Fixture::new();
        let directory = fixture.0.path.join(".git/refs/tags");
        for content in ["ref: refs/tags/missing\n", "not-an-object\n"] {
            let path = directory.join("broken");
            std::fs::write(&path, content).unwrap();
            assert!(preview(&fixture.0, "broken", &fixture.head(), true).is_err());
            assert_eq!(std::fs::read_to_string(&path).unwrap(), content);
            std::fs::remove_file(path).unwrap();
        }
    }
}
