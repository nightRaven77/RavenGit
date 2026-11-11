use crate::{
    git::{self, GitError, Repository, Result},
    initialize, remotes,
};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct Cloned {
    pub path: String,
    pub branch: Option<String>,
    pub warning: Option<String>,
}
fn error(code: &'static str, message: &str) -> GitError {
    GitError::new(code, message)
}
pub fn create(parent: &Path, name: &str, url: &str) -> Result<Cloned> {
    if url != url.trim() || !remotes::safe_url(url) {
        return Err(error(
            "CLONE_URL",
            "Usa HTTPS sin credenciales, SSH o una ruta local absoluta. No se admiten contraseñas/tokens en URL, consultas, fragmentos ni protocolos auxiliares.",
        ));
    }
    let normalized;
    let url = if Path::new(url).is_absolute() {
        let path = Path::new(url).canonicalize().map_err(|_| {
            error(
                "CLONE_SOURCE",
                "El origen local no existe o no es accesible.",
            )
        })?;
        normalized = url::Url::from_file_path(path)
            .map_err(|_| {
                error(
                    "CLONE_SOURCE",
                    "No se pudo convertir la ruta local a una URL file válida.",
                )
            })?
            .to_string();
        normalized.as_str()
    } else {
        url
    };
    let parent = initialize::parent_path(parent)?;
    let preview = Repository {
        id: "clone-preflight".into(),
        path: parent.clone(),
    };
    verify_source(&preview, url)?;
    let destination = initialize::reserve(&parent, name)?;
    let repo = Repository {
        id: "clone-new".into(),
        path: destination.clone(),
    };
    clone_into(repo, url)
}
fn verify_source(repo: &Repository, url: &str) -> Result<()> {
    let resolved = remotes::command(repo, &["ls-remote", "--get-url", "--", url], false)?;
    if !resolved.success || resolved.bytes != format!("{url}\n").as_bytes() {
        return Err(error(
            "CLONE_REWRITE",
            "Git reescribe la URL seleccionada o no puede verificarla. Revisa url.insteadOf y usa el destino real antes de clonar; no se contactó el remoto.",
        ));
    }
    Ok(())
}
fn clone_into(repo: Repository, url: &str) -> Result<Cloned> {
    let destination = &repo.path;
    let hooks = format!(
        "core.hooksPath={}",
        destination
            .join(".git/ravengit-disabled-hooks")
            .to_string_lossy()
    );
    let worktree = format!("core.worktree={}", destination.to_string_lossy());
    let output = remotes::command_configured(
        &repo,
        &[
            "-c",
            &hooks,
            "-c",
            &worktree,
            "-c",
            "core.bare=false",
            "-c",
            "core.protectNTFS=true",
            "-c",
            "core.protectHFS=true",
            "-c",
            "submodule.recurse=false",
            "clone",
            "--quiet",
            "--template=",
            "--no-recurse-submodules",
            "--no-local",
            "--origin=origin",
            "--",
            url,
            ".",
        ],
        true,
        |command| {
            command
                .env_remove("GIT_CONFIG_COUNT")
                .env_remove("GIT_CONFIG_PARAMETERS")
                .env_remove("GIT_CONFIG")
                .env_remove("GIT_OBJECT_DIRECTORY")
                .env_remove("GIT_ALTERNATE_OBJECT_DIRECTORIES")
                .env_remove("GIT_TEMPLATE_DIR")
                .env("GIT_LFS_SKIP_SMUDGE", "1");
        },
    )?;
    if !output.success {
        return Err(error(
            "CLONE_FAILED",
            "Git no confirmó el clonado. Puede haber datos descargados o un checkout incompleto. Revisa el destino antes de repetir; RavenGit no lo borra automáticamente.",
        ));
    }
    let origin = remotes::command(&repo, &["remote", "get-url", "--", "origin"], false)?;
    if !origin.success
        || origin.bytes != format!("{url}\n").as_bytes()
        || !destination.join(".git").is_dir()
    {
        return Err(error(
            "CLONE_UNCERTAIN",
            "Git terminó, pero no se pudo verificar el remoto del repositorio clonado. Revisa el destino antes de repetir.",
        ));
    }
    let (_, snapshot) = git::open(destination,"clone-verified".into()).map_err(|_| error("CLONE_UNCERTAIN", "El clonado terminó, pero no se pudo leer el repositorio. Conserva el destino y ábrelo manualmente; no repitas el clonado."))?;
    Ok(Cloned {
        path: destination.to_string_lossy().into_owned(),
        branch: snapshot.branch,
        warning: (snapshot.head.is_none() && !snapshot.refs.is_empty()).then(|| "Se descargaron referencias, pero el remoto no proporcionó un HEAD utilizable. Revisa y selecciona una rama antes de trabajar; no se eligió una automáticamente.".into()),
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
            let path = std::env::temp_dir().join(format!(
                "ravengit-clone-{}-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn source(&self) -> String {
            let result = initialize::create(&self.0, "source", "main").unwrap();
            let path = Path::new(&result.path);
            git::run(path, &["config", "user.name", "Fixture"]).unwrap();
            git::run(path, &["config", "user.email", "fixture@example.invalid"]).unwrap();
            fs::write(path.join("keep.txt"), "contenido\n").unwrap();
            git::run(path, &["add", "--", "keep.txt"]).unwrap();
            git::run(
                path,
                &[
                    "-c",
                    "core.hooksPath=",
                    "-c",
                    "commit.gpgsign=false",
                    "commit",
                    "-m",
                    "Base",
                ],
            )
            .unwrap();
            result.path
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn clones_local_history_files_origin_and_upstream_without_alternates_or_hooks() {
        let fixture = Fixture::new();
        let source = fixture.source();
        let before = git::text(Path::new(&source), &["rev-parse", "HEAD"]).unwrap();
        let copied = create(&fixture.0, "Copia ü", &source).unwrap();
        let path = Path::new(&copied.path);
        assert_eq!(copied.branch.as_deref(), Some("main"));
        assert_eq!(git::text(path, &["rev-parse", "HEAD"]).unwrap(), before);
        assert_eq!(
            git::text(path, &["rev-parse", "@{upstream}"]).unwrap(),
            before
        );
        assert!(
            git::text(path, &["status", "--porcelain"])
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            fs::read_to_string(path.join("keep.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "contenido\n"
        );
        assert!(!path.join(".git/objects/info/alternates").exists());
        assert!(!path.join(".git/hooks").exists());
        assert_eq!(
            git::text(Path::new(&source), &["rev-parse", "HEAD"]).unwrap(),
            before
        );
    }
    #[test]
    fn rejects_existing_nested_and_invalid_targets_without_modifying_them() {
        let fixture = Fixture::new();
        let source = fixture.source();
        let existing = fixture.0.join("exists");
        fs::create_dir(&existing).unwrap();
        fs::write(existing.join("keep.txt"), "keep").unwrap();
        assert_eq!(
            create(&fixture.0, "exists", &source).unwrap_err().code,
            "INIT_EXISTS"
        );
        assert_eq!(
            create(Path::new(&source), "nested", &source)
                .unwrap_err()
                .code,
            "INIT_NESTED"
        );
        assert_eq!(
            create(&fixture.0, "../escape", &source).unwrap_err().code,
            "INIT_NAME"
        );
        assert_eq!(
            fs::read_to_string(existing.join("keep.txt")).unwrap(),
            "keep"
        );
        assert!(!Path::new(&source).join("nested").exists());
    }
    #[test]
    fn refuses_unsafe_urls_without_persisting_secrets_or_creating_a_destination() {
        let fixture = Fixture::new();
        for url in [
            "https://user:secret@example.invalid/repo",
            "https://example.invalid/repo?token=secret",
            "http://example.invalid/repo",
            "ext::secret",
            "-upload-pack=secret",
            "../source",
            "ssh://user:secret@example.invalid/repo",
        ] {
            let failure = create(&fixture.0, "copy", url).unwrap_err();
            assert_eq!(failure.code, "CLONE_URL");
            assert!(!failure.message.contains("secret"));
        }
        assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 0);
    }
    #[test]
    fn empty_source_is_openable_and_failed_access_does_not_delete_other_files() {
        let fixture = Fixture::new();
        let empty = initialize::create(&fixture.0, "empty", "main").unwrap();
        let cloned = create(&fixture.0, "empty-copy", &empty.path).unwrap();
        let (_, snapshot) = git::open(Path::new(&cloned.path), "empty".into()).unwrap();
        assert!(snapshot.head.is_none());
        fs::write(fixture.0.join("keep.txt"), "keep").unwrap();
        let missing = fixture.0.join("missing").to_string_lossy().into_owned();
        assert!(create(&fixture.0, "failed", &missing).is_err());
        assert_eq!(
            fs::read_to_string(fixture.0.join("keep.txt")).unwrap(),
            "keep"
        );
    }
    #[test]
    fn url_rewrite_is_rejected_locally_without_contact_or_leaking_the_destination() {
        let fixture = Fixture::new();
        let source = fixture.source();
        let repo = Repository {
            id: "rewrite".into(),
            path: Path::new(&source).into(),
        };
        git::run(
            &repo.path,
            &[
                "config",
                "url.https://user:secret@invalid.example/.insteadOf",
                "https://selected.invalid/",
            ],
        )
        .unwrap();
        let failure = verify_source(&repo, "https://selected.invalid/repo.git").unwrap_err();
        assert_eq!(failure.code, "CLONE_REWRITE");
        assert!(!failure.message.contains("secret"));
        assert!(!fixture.0.join("copy").exists());
    }
    #[test]
    fn missing_remote_head_reports_downloaded_refs_without_claiming_a_checkout() {
        let fixture = Fixture::new();
        let source = fixture.source();
        git::run(
            Path::new(&source),
            &["symbolic-ref", "HEAD", "refs/heads/missing"],
        )
        .unwrap();
        let result = create(&fixture.0, "copy", &source).unwrap();
        assert!(result.warning.as_deref().unwrap().contains("HEAD"));
        assert!(!Path::new(&result.path).join("keep.txt").exists());
        assert!(
            git::text(
                Path::new(&result.path),
                &["rev-parse", "refs/remotes/origin/main"]
            )
            .is_ok()
        );
    }
}
