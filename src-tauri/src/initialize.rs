use crate::{
    git::{GitError, Result},
    process,
};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

#[derive(Debug, Serialize)]
pub struct Initialized {
    pub path: String,
    pub branch: String,
}
fn error(code: &'static str, message: &str) -> GitError {
    GitError::new(code, message)
}
fn folder_name(name: &str) -> bool {
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    !name.is_empty()
        && name.chars().count() <= 100
        && name.len() <= 255
        && name == name.trim()
        && !name.ends_with('.')
        && name != "."
        && name != ".."
        && !name.eq_ignore_ascii_case(".git")
        && !name
            .chars()
            .any(|value| value.is_control() || "<>:\"/\\|?*".contains(value))
        && !matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        && !(stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}
fn command(path: &Path) -> Command {
    let mut command = process::git(path);
    command
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .env_remove("GIT_CONFIG_COUNT")
        .env_remove("GIT_CONFIG_PARAMETERS")
        .env_remove("GIT_CONFIG")
        .env_remove("GIT_OBJECT_DIRECTORY")
        .env_remove("GIT_ALTERNATE_OBJECT_DIRECTORIES")
        .env_remove("GIT_TEMPLATE_DIR");
    command
}
fn run(path: &Path, args: &[&str]) -> Result<process::Output> {
    let mut command = command(path);
    command.args(args);
    process::execute(command, None, Duration::from_secs(15)).map_err(|reason| match reason {
        process::Error::Start => error("GIT_UNAVAILABLE", "No se pudo iniciar Git. Comprueba su instalación y PATH. No repitas la creación sin revisar antes la carpeta de destino."),
        _ => error("INIT_UNCERTAIN", "La inicialización excedió el tiempo permitido. Comprueba la carpeta de destino antes de repetir; no se borró ningún archivo."),
    })
}
pub(crate) fn parent_path(parent: &Path) -> Result<PathBuf> {
    if !parent.is_absolute() {
        return Err(error(
            "INIT_PARENT",
            "Selecciona una carpeta contenedora con ruta absoluta.",
        ));
    }
    let parent = parent.canonicalize().map_err(|_| {
        error(
            "INIT_PARENT",
            "La carpeta contenedora no existe o no es accesible.",
        )
    })?;
    if !parent.is_dir() {
        return Err(error("INIT_PARENT", "Selecciona una carpeta contenedora."));
    }
    for ancestor in parent.ancestors() {
        match fs::symlink_metadata(ancestor.join(".git")) {
            Ok(_) => {
                return Err(error(
                    "INIT_NESTED",
                    "Elige una ubicación fuera de otro repositorio Git.",
                ));
            }
            Err(reason) if reason.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {
                return Err(error(
                    "INIT_PARENT",
                    "No se pudo comprobar la ubicación contenedora.",
                ));
            }
        }
        if ancestor.join("HEAD").is_file()
            && ancestor.join("objects").is_dir()
            && ancestor.join("refs").is_dir()
        {
            return Err(error(
                "INIT_NESTED",
                "No se crea un repositorio dentro de un repositorio bare.",
            ));
        }
    }
    Ok(parent)
}
pub fn create(parent: &Path, name: &str, branch: &str) -> Result<Initialized> {
    if !folder_name(name) {
        return Err(error(
            "INIT_NAME",
            "Usa un nombre de carpeta de hasta 100 caracteres, sin rutas, nombres reservados ni puntos o espacios finales.",
        ));
    }
    if branch.is_empty()
        || branch == "HEAD"
        || branch.len() > 255
        || branch.starts_with('-')
        || branch.chars().any(char::is_control)
    {
        return Err(error("INIT_BRANCH", "La rama inicial no es válida."));
    }
    let parent = parent_path(parent)?;
    let reference = format!("refs/heads/{branch}");
    if !run(&parent, &["check-ref-format", &reference])?.success {
        return Err(error("INIT_BRANCH", "La rama inicial no es válida."));
    }
    let destination = reserve(&parent, name)?;
    let branch_option = format!("--initial-branch={branch}");
    let output = run(
        &destination,
        &[
            "-c",
            "core.bare=false",
            "init",
            "--quiet",
            "--template=",
            "--object-format=sha1",
            &branch_option,
            "--",
            ".",
        ],
    )?;
    if !output.success {
        return Err(error(
            "INIT_FAILED",
            "Git no pudo confirmar la inicialización. La carpeta nueva se conserva; revísala antes de repetir. No se eliminan archivos automáticamente.",
        ));
    }
    let actual = run(&destination, &["symbolic-ref", "HEAD"])?;
    if !actual.success
        || actual.bytes != format!("{reference}\n").as_bytes()
        || !destination.join(".git").is_dir()
    {
        return Err(error(
            "INIT_UNCERTAIN",
            "Git terminó, pero no se pudo verificar la rama inicial. Revisa el repositorio creado antes de repetir.",
        ));
    }
    Ok(Initialized {
        path: destination.to_string_lossy().into_owned(),
        branch: branch.into(),
    })
}
pub(crate) fn reserve(parent: &Path, name: &str) -> Result<PathBuf> {
    if !folder_name(name) {
        return Err(error(
            "INIT_NAME",
            "Usa un nombre de carpeta de hasta 100 caracteres, sin rutas, nombres reservados ni puntos o espacios finales.",
        ));
    }
    let parent = parent_path(parent)?;
    let destination = parent.join(name);
    fs::create_dir(&destination).map_err(|reason| {
        if reason.kind() == std::io::ErrorKind::AlreadyExists {
            error("INIT_EXISTS", "El destino ya existe. No se modifica ni se reinicializa; elige otro nombre o abre el repositorio existente.")
        } else {
            error("INIT_CREATE", "No se pudo crear la carpeta nueva. Revisa permisos y longitud de la ruta.")
        }
    })?;
    if parent_path(&parent)? != parent
        || fs::read_dir(&destination)
            .map_err(|_| {
                error(
                    "INIT_UNCERTAIN",
                    "No se pudo comprobar la carpeta recién creada. Revísala antes de repetir.",
                )
            })?
            .next()
            .is_some()
    {
        return Err(error(
            "INIT_CHANGED",
            "La carpeta cambió durante la creación. No se inicializó; comprueba el destino.",
        ));
    }
    Ok(destination)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "ravengit-init-{}-{}-{}",
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
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn creates_empty_worktree_with_explicit_branch_and_no_hooks_or_remotes() {
        let fixture = Fixture::new();
        let result = create(&fixture.0, "Proyecto ü", "equipo/inicio").unwrap();
        let path = Path::new(&result.path);
        let (_, snapshot) = crate::git::open(path, "new".into()).unwrap();
        assert_eq!(snapshot.branch.as_deref(), Some("equipo/inicio"));
        assert!(snapshot.head.is_none());
        assert!(snapshot.page.commits.is_empty());
        assert!(crate::git::text(path, &["remote"]).unwrap().is_empty());
        assert!(!path.join(".git/hooks").exists());
        assert_eq!(fs::read_dir(path).unwrap().count(), 1);
    }
    #[test]
    fn rejects_existing_empty_populated_and_git_destinations_without_changing_files() {
        let fixture = Fixture::new();
        fs::create_dir(fixture.0.join("empty")).unwrap();
        fs::create_dir(fixture.0.join("files")).unwrap();
        fs::write(fixture.0.join("files/keep.txt"), "keep").unwrap();
        create(&fixture.0, "repo", "main").unwrap();
        let config = fs::read(fixture.0.join("repo/.git/config")).unwrap();
        for name in ["empty", "files", "repo"] {
            assert_eq!(
                create(&fixture.0, name, "other").unwrap_err().code,
                "INIT_EXISTS"
            );
        }
        assert_eq!(
            fs::read_to_string(fixture.0.join("files/keep.txt")).unwrap(),
            "keep"
        );
        assert_eq!(fs::read_dir(fixture.0.join("empty")).unwrap().count(), 0);
        assert_eq!(
            fs::read(fixture.0.join("repo/.git/config")).unwrap(),
            config
        );
    }
    #[test]
    fn rejects_invalid_names_and_branches_without_creating_destinations() {
        let fixture = Fixture::new();
        for name in [
            "",
            ".",
            "..",
            ".git",
            "../escape",
            "sub/name",
            "sub\\name",
            "NUL.txt",
            "COM1",
            "end.",
            "end ",
            " colon:",
            "a\nb",
        ] {
            assert_eq!(
                create(&fixture.0, name, "main").unwrap_err().code,
                "INIT_NAME"
            );
        }
        for branch in [
            "",
            "-branch",
            "bad name",
            "refs/../escape",
            "bad..name",
            "bad\nname",
            "@{-1}",
        ] {
            assert_eq!(
                create(&fixture.0, "new", branch).unwrap_err().code,
                "INIT_BRANCH"
            );
        }
        assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 0);
    }
    #[test]
    fn rejects_nested_worktrees_gitfiles_and_bare_ancestors() {
        let fixture = Fixture::new();
        let result = create(&fixture.0, "repo", "main").unwrap();
        let nested = Path::new(&result.path).join("inside");
        fs::create_dir(&nested).unwrap();
        assert_eq!(
            create(&nested, "new", "main").unwrap_err().code,
            "INIT_NESTED"
        );
        let linked = fixture.0.join("linked");
        fs::create_dir(&linked).unwrap();
        fs::write(linked.join(".git"), "gitdir: missing").unwrap();
        assert_eq!(
            create(&linked, "new", "main").unwrap_err().code,
            "INIT_NESTED"
        );
        let bare = fixture.0.join("bare");
        fs::create_dir(&bare).unwrap();
        assert!(
            run(&bare, &["init", "--bare", "--template=", "."])
                .unwrap()
                .success
        );
        assert_eq!(
            create(&bare, "new", "main").unwrap_err().code,
            "INIT_NESTED"
        );
        assert!(!nested.join("new").exists());
        assert!(!linked.join("new").exists());
        assert!(!bare.join("new").exists());
    }
    #[test]
    fn rejects_missing_relative_and_file_parents_without_creating_anything() {
        let fixture = Fixture::new();
        let file = fixture.0.join("file");
        fs::write(&file, "keep").unwrap();
        for parent in [
            fixture.0.join("missing"),
            file.clone(),
            PathBuf::from("relative"),
        ] {
            assert_eq!(
                create(&parent, "new", "main").unwrap_err().code,
                "INIT_PARENT"
            );
        }
        assert_eq!(fs::read_to_string(file).unwrap(), "keep");
        assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 1);
    }
    #[test]
    fn initialization_command_does_not_inherit_external_git_storage_or_config() {
        let fixture = Fixture::new();
        let command = command(&fixture.0);
        let values: std::collections::HashMap<_, _> = command.get_envs().collect();
        for key in [
            "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES",
            "GIT_CONFIG_COUNT",
            "GIT_CONFIG_PARAMETERS",
            "GIT_CONFIG",
            "GIT_TEMPLATE_DIR",
        ] {
            assert_eq!(values.get(std::ffi::OsStr::new(key)), Some(&None));
        }
        assert_eq!(
            values.get(std::ffi::OsStr::new("GIT_CONFIG_NOSYSTEM")),
            Some(&Some(std::ffi::OsStr::new("1")))
        );
        assert_eq!(
            values.get(std::ffi::OsStr::new("GIT_CONFIG_GLOBAL")),
            Some(&Some(std::ffi::OsStr::new(if cfg!(windows) {
                "NUL"
            } else {
                "/dev/null"
            })))
        );
    }
}
