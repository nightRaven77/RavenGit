use crate::{
    git::{GitError, Result},
    initialize,
};
use std::{
    fs,
    path::{Path, PathBuf},
};

fn ordinary_directory(path: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(path).map_err(|_| {
        GitError::new(
            "DEFAULT_DIRECTORY",
            "No se pudo comprobar la carpeta predeterminada.",
        )
    })?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(GitError::new(
                "DEFAULT_DIRECTORY",
                "La carpeta predeterminada no puede ser un enlace o junction.",
            ));
        }
    }
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(GitError::new(
            "DEFAULT_DIRECTORY",
            "La carpeta predeterminada debe ser un directorio normal, no un enlace.",
        ));
    }
    Ok(())
}
pub fn default_directory(documents: &Path) -> Result<PathBuf> {
    let mut parent = initialize::parent_path(documents)?;
    for name in ["RavenGit", "Repositorios"] {
        initialize::parent_path(&parent)?;
        let child = parent.join(name);
        match fs::create_dir(&child) {
            Ok(()) => {}
            Err(reason) if reason.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => {
                return Err(GitError::new(
                    "DEFAULT_DIRECTORY",
                    "No se pudo crear Documentos/RavenGit/Repositorios. Puedes elegir otra ubicación.",
                ));
            }
        }
        ordinary_directory(&child)?;
        parent = child.canonicalize().map_err(|_| {
            GitError::new(
                "DEFAULT_DIRECTORY",
                "No se pudo resolver la carpeta predeterminada.",
            )
        })?;
    }
    initialize::parent_path(&parent)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn default_directory_is_idempotent_and_never_overwrites_files() {
        let root = std::env::temp_dir().join(format!(
            "ravengit-default-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        let path = default_directory(&root).unwrap();
        fs::write(path.join("keep.txt"), "keep").unwrap();
        assert_eq!(default_directory(&root).unwrap(), path);
        assert_eq!(fs::read_to_string(path.join("keep.txt")).unwrap(), "keep");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn default_directory_rejects_a_file_instead_of_a_folder() {
        let root = std::env::temp_dir().join(format!(
            "ravengit-default-blocked-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("RavenGit"), "keep").unwrap();
        assert!(default_directory(&root).is_err());
        assert_eq!(fs::read_to_string(root.join("RavenGit")).unwrap(), "keep");
        fs::remove_dir_all(root).unwrap();
    }
}
