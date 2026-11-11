use crate::{
    git::{GitError, Result},
    library::Library,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, Instant, UNIX_EPOCH},
};

#[derive(Clone, Serialize)]
pub struct Review {
    pub token: String,
    pub path: String,
    pub name: String,
}
pub struct Plan {
    pub review: Review,
    fingerprint: String,
}
fn failure() -> GitError {
    GitError::new(
        "DELETE_GUARD",
        "No se puede eliminar esta carpeta de forma segura. Comprueba ruta, permisos, enlaces, worktrees, repositorios anidados y carpetas protegidas.",
    )
}
fn plain(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return false;
        }
    }
    !metadata.file_type().is_symlink()
}
fn fingerprint(path: &Path) -> Result<String> {
    let started = Instant::now();
    let mut pending = vec![path.to_path_buf()];
    let mut count = 0;
    let mut hash = Sha256::new();
    while let Some(current) = pending.pop() {
        count += 1;
        if count > 100_000 || started.elapsed() > Duration::from_secs(15) {
            return Err(GitError::new(
                "DELETE_LIMIT",
                "La revisión de la carpeta supera el límite seguro. Quita sólo la entrada o gestiona la carpeta desde el sistema.",
            ));
        }
        let metadata = fs::symlink_metadata(&current).map_err(|_| failure())?;
        if !plain(&metadata) {
            return Err(failure());
        }
        hash.update(
            serde_json::to_vec(&current.strip_prefix(path).map_err(|_| failure())?)
                .map_err(|_| failure())?,
        );
        hash.update(metadata.len().to_le_bytes());
        for time in [metadata.modified().ok(), metadata.created().ok()] {
            hash.update(
                time.and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map(|duration| duration.as_nanos())
                    .unwrap_or_default()
                    .to_le_bytes(),
            );
        }
        if metadata.is_dir() {
            let mut entries = fs::read_dir(&current)
                .map_err(|_| failure())?
                .take(100_001)
                .map(|entry| entry.map(|entry| entry.path()))
                .collect::<std::io::Result<Vec<_>>>()
                .map_err(|_| failure())?;
            entries.sort();
            for entry in entries {
                if entry.file_name().is_some_and(|name| name == ".git")
                    && entry != path.join(".git")
                {
                    return Err(failure());
                }
                pending.push(entry);
            }
        } else if !metadata.is_file() {
            return Err(failure());
        }
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn validate(path: &str, library: &Library, protected: &[PathBuf]) -> Result<PathBuf> {
    if !library.repositories.iter().any(|entry| entry.path == path) {
        return Err(failure());
    }
    let original = Path::new(path);
    if !original.is_absolute()
        || original
            .components()
            .any(|component| component.as_os_str() == ".git")
    {
        return Err(failure());
    }
    for ancestor in original.ancestors() {
        let metadata = fs::symlink_metadata(ancestor).map_err(|_| failure())?;
        if !plain(&metadata) {
            return Err(failure());
        }
    }
    let canonical = original.canonicalize().map_err(|_| failure())?;
    if canonical.parent().is_none() || !canonical.is_dir() {
        return Err(failure());
    }
    for protected in protected {
        if let Ok(protected) = protected.canonicalize()
            && protected.starts_with(&canonical)
        {
            return Err(failure());
        }
    }
    for entry in &library.repositories {
        if entry.path == path {
            continue;
        }
        let other = Path::new(&entry.path)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(&entry.path));
        if other.starts_with(&canonical) || canonical.starts_with(other) {
            return Err(failure());
        }
    }
    let git = canonical.join(".git");
    if !git.is_dir()
        || !git.join("HEAD").is_file()
        || !plain(&fs::symlink_metadata(&git).map_err(|_| failure())?)
    {
        return Err(failure());
    }
    for name in ["worktrees", "modules"] {
        let directory = git.join(name);
        if directory.exists()
            && fs::read_dir(directory)
                .map_err(|_| failure())?
                .next()
                .is_some()
        {
            return Err(failure());
        }
    }
    Ok(canonical)
}
pub fn preview(
    path: &str,
    library: &Library,
    protected: &[PathBuf],
    token: String,
) -> Result<Plan> {
    let canonical = validate(path, library, protected)?;
    let name = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(failure)?
        .to_owned();
    Ok(Plan {
        review: Review {
            token,
            path: path.into(),
            name,
        },
        fingerprint: fingerprint(&canonical)?,
    })
}
pub fn execute(
    plan: Plan,
    confirmation: &str,
    library: &Library,
    protected: &[PathBuf],
    recycle: impl FnOnce(&Path) -> Result<()>,
) -> Result<()> {
    if confirmation != plan.review.name {
        return Err(GitError::new(
            "DELETE_CONFIRM",
            "Escribe exactamente el nombre de la carpeta revisada.",
        ));
    }
    let canonical = validate(&plan.review.path, library, protected)?;
    if fingerprint(&canonical)? != plan.fingerprint {
        return Err(GitError::new(
            "DELETE_STALE",
            "La carpeta cambió desde la revisión. No se eliminó; vuelve a revisar.",
        ));
    }
    recycle(&canonical)?;
    if !matches!(fs::symlink_metadata(&canonical), Err(error) if error.kind() == std::io::ErrorKind::NotFound)
    {
        return Err(GitError::new(
            "DELETE_UNCERTAIN",
            "La Papelera no confirmó que la carpeta saliera de su ubicación. Comprueba el sistema antes de repetir.",
        ));
    }
    Ok(())
}
#[cfg(target_os = "macos")]
pub fn recycle(path: &Path) -> Result<()> {
    trash::delete(path).map_err(|_| {
        GitError::new(
            "DELETE_TRASH",
        "No se pudo confirmar el traslado a la Papelera. Comprueba la carpeta y la Papelera antes de repetir. No se intenta borrado permanente.",
        )
    })
}
#[cfg(not(any(windows, target_os = "macos")))]
pub fn recycle(_: &Path) -> Result<()> {
    Err(GitError::new(
        "DELETE_PLATFORM",
        "El traslado a Papelera no está habilitado en esta plataforma. Puedes quitar sólo la entrada de la lista.",
    ))
}
#[cfg(windows)]
pub fn recycle(path: &Path) -> Result<()> {
    let path = path.to_path_buf();
    std::thread::spawn(move || -> Result<()> {
        use windows::{
            Win32::{System::Com::*, UI::Shell::*},
            core::PCWSTR,
        };
        let fail = || {
            GitError::new(
                "DELETE_TRASH",
                "No se pudo confirmar el traslado a la Papelera. Comprueba carpeta y Papelera antes de repetir. No se intenta borrado permanente.",
            )
        };
        struct Apartment;
        impl Drop for Apartment {
            fn drop(&mut self) {
                unsafe {
                    CoUninitialize();
                }
            }
        }
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .map_err(|_| fail())?;
            let _apartment = Apartment;
            let text = path.to_str().ok_or_else(fail)?;
            let shell_path = if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
                format!(r"\\{rest}")
            } else {
                text.strip_prefix(r"\\?\").unwrap_or(text).to_owned()
            };
            let wide: Vec<u16> = shell_path
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            let operation: IFileOperation =
                CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER).map_err(|_| fail())?;
            operation
                .SetOperationFlags(
                    FOF_NO_UI
                        | FOF_ALLOWUNDO
                        | FOF_NORECURSEREPARSE
                        | FOFX_RECYCLEONDELETE
                        | FOFX_EARLYFAILURE
                        | FOFX_NOCOPYHOOKS,
                )
                .map_err(|_| fail())?;
            let item: IShellItem =
                SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None).map_err(|_| fail())?;
            operation.DeleteItem(&item, None).map_err(|_| fail())?;
            operation.PerformOperations().map_err(|_| fail())?;
            if operation
                .GetAnyOperationsAborted()
                .map_err(|_| fail())?
                .as_bool()
            {
                return Err(fail());
            }
        }
        Ok(())
    })
    .join()
    .map_err(|_| {
        GitError::new(
            "DELETE_UNCERTAIN",
            "La operación de Papelera se interrumpió. Revisa el sistema antes de repetir.",
        )
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    struct Fixture {
        root: PathBuf,
        path: String,
        library: Library,
    }
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "ravengit-delete-{}-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
                std::time::SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir(&root).unwrap();
            let repo = crate::initialize::create(&root, "Proyecto ü", "main").unwrap();
            let library =
                crate::library::remember(&root.join("settings"), Path::new(&repo.path)).unwrap();
            Self {
                root,
                path: repo.path,
                library,
            }
        }
        fn plan(&self) -> Plan {
            preview(&self.path, &self.library, &[], "once".into()).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
    #[test]
    fn reviewed_folder_can_be_moved_only_to_a_recoverable_test_destination() {
        let fixture = Fixture::new();
        fs::write(Path::new(&fixture.path).join("sin-commit.txt"), "keep").unwrap();
        let plan = fixture.plan();
        let name = plan.review.name.clone();
        let expected = Path::new(&fixture.path).canonicalize().unwrap();
        let recovered = fixture.root.join("recoverable");
        execute(plan, &name, &fixture.library, &[], |path| {
            assert_eq!(path, expected);
            assert!(path.starts_with(fixture.root.canonicalize().unwrap()));
            fs::rename(path, &recovered).map_err(|_| failure())
        })
        .unwrap();
        assert!(!Path::new(&fixture.path).exists());
        assert_eq!(
            fs::read_to_string(recovered.join("sin-commit.txt")).unwrap(),
            "keep"
        );
        assert!(recovered.join(".git/HEAD").exists());
    }
    #[test]
    fn wrong_confirmation_and_changed_files_never_call_recycle() {
        let fixture = Fixture::new();
        assert_eq!(
            execute(
                fixture.plan(),
                "incorrecto",
                &fixture.library,
                &[],
                |_| panic!("must not move")
            )
            .unwrap_err()
            .code,
            "DELETE_CONFIRM"
        );
        let plan = fixture.plan();
        let name = plan.review.name.clone();
        fs::write(Path::new(&fixture.path).join("new.txt"), "changed").unwrap();
        assert_eq!(
            execute(plan, &name, &fixture.library, &[], |_| panic!(
                "must not move"
            ))
            .unwrap_err()
            .code,
            "DELETE_STALE"
        );
        assert!(Path::new(&fixture.path).exists());
    }
    #[test]
    fn protects_unknown_roots_nested_repositories_and_other_library_entries() {
        let fixture = Fixture::new();
        assert!(
            preview(
                &fixture.path,
                &fixture.library,
                &[PathBuf::from(&fixture.path)],
                "token".into()
            )
            .is_err()
        );
        assert!(
            preview(
                &fixture.root.to_string_lossy(),
                &fixture.library,
                &[],
                "token".into()
            )
            .is_err()
        );
        let nested = Path::new(&fixture.path).join("nested");
        fs::create_dir(&nested).unwrap();
        fs::create_dir(nested.join(".git")).unwrap();
        assert!(preview(&fixture.path, &fixture.library, &[], "token".into()).is_err());
        fs::remove_dir(nested.join(".git")).unwrap();
        let mut library = fixture.library.clone();
        let mut child = library.repositories[0].clone();
        child.path = nested.to_string_lossy().into();
        library.repositories.push(child);
        assert!(preview(&fixture.path, &library, &[], "token".into()).is_err());
    }
    #[test]
    fn recycle_failure_preserves_files_and_worktree_metadata_is_not_adopted() {
        let fixture = Fixture::new();
        let plan = fixture.plan();
        let name = plan.review.name.clone();
        assert!(execute(plan, &name, &fixture.library, &[], |_| Err(failure())).is_err());
        assert!(Path::new(&fixture.path).join(".git/HEAD").exists());
        let linked = fixture.root.join("linked");
        fs::create_dir(&linked).unwrap();
        fs::write(linked.join(".git"), "gitdir: elsewhere").unwrap();
        let mut library = fixture.library.clone();
        library.repositories[0].path = linked.to_string_lossy().into();
        assert!(preview(&library.repositories[0].path, &library, &[], "token".into()).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn junctions_inside_a_repository_never_reach_recycle() {
        let fixture = Fixture::new();
        let outside = fixture.root.join("outside");
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("keep.txt"), "keep").unwrap();
        let link = Path::new(&fixture.path).join("junction");
        assert!(
            std::process::Command::new("cmd")
                .args(["/c", "mklink", "/J"])
                .arg(&link)
                .arg(&outside)
                .output()
                .unwrap()
                .status
                .success()
        );
        assert!(preview(&fixture.path, &fixture.library, &[], "token".into()).is_err());
        fs::remove_dir(link).unwrap();
        assert_eq!(
            fs::read_to_string(outside.join("keep.txt")).unwrap(),
            "keep"
        );
    }
    #[cfg(unix)]
    #[test]
    fn symbolic_links_inside_a_repository_never_reach_recycle() {
        let fixture = Fixture::new();
        std::os::unix::fs::symlink(&fixture.root, Path::new(&fixture.path).join("link")).unwrap();
        assert!(preview(&fixture.path, &fixture.library, &[], "token".into()).is_err());
    }
}
