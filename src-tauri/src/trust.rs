use crate::git::{GitError, Result};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

fn identity(repository: &Path) -> Result<PathBuf> {
    repository.canonicalize().map_err(|_| {
        GitError::new(
            "TRUST_PATH",
            "No se pudo verificar la ubicación del repositorio.",
        )
    })
}

fn record(directory: &Path, repository: &Path) -> Result<PathBuf> {
    let bytes = serde_json::to_vec(repository).map_err(|_| {
        GitError::new(
            "TRUST_PATH",
            "No se pudo representar la ubicación del repositorio.",
        )
    })?;
    Ok(directory.join(format!("{:x}.json", Sha256::digest(bytes))))
}

pub fn contains(directory: &Path, repository: &Path) -> Result<bool> {
    let repository = identity(repository)?;
    match fs::read(record(directory, &repository)?) {
        Ok(bytes) => {
            Ok(serde_json::from_slice::<PathBuf>(&bytes).ok().as_ref() == Some(&repository))
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(_) => Err(GitError::new(
            "TRUST_READ",
            "No se pudo leer la autorización guardada.",
        )),
    }
}

pub fn set(directory: &Path, repository: &Path, allowed: bool) -> Result<()> {
    let repository = identity(repository)?;
    let file = record(directory, &repository)?;
    let result = if allowed {
        fs::create_dir_all(directory).and_then(|_| {
            let bytes = serde_json::to_vec(&repository)?;
            fs::write(file, bytes)
        })
    } else {
        match fs::remove_file(file) {
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            result => result,
        }
    };
    result.map_err(|_| {
        GitError::new(
            "TRUST_SAVE",
            "No se pudo guardar la autorización del repositorio. Vuelve a intentarlo.",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remembers_only_the_selected_location_and_can_revoke() {
        let directory = std::env::temp_dir().join(format!(
            "ravengit-trust-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let repository = directory.join("repo ü");
        let other = directory.join("other");
        let settings = directory.join("settings");
        fs::create_dir_all(&repository).unwrap();
        fs::create_dir_all(&other).unwrap();
        assert!(!contains(&settings, &repository).unwrap());
        set(&settings, &repository, true).unwrap();
        assert!(contains(&settings, &repository.join(".")).unwrap());
        assert!(!contains(&settings, &other).unwrap());
        let file = record(&settings, &identity(&repository).unwrap()).unwrap();
        fs::write(&file, b"incomplete").unwrap();
        assert!(!contains(&settings, &repository).unwrap());
        set(&settings, &repository, true).unwrap();
        set(&settings, &repository, false).unwrap();
        assert!(!contains(&settings, &repository).unwrap());
        let blocked = directory.join("blocked");
        fs::write(&blocked, b"blocked").unwrap();
        assert!(set(&blocked, &repository, true).is_err());
        fs::remove_dir_all(&directory).unwrap();
    }
}
