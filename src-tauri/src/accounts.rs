//! SSH account labels and host aliases only. No credentials or Git/SSH configuration.
use crate::git::{GitError, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
const LIMIT: u64 = 64 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    pub label: String,
    pub provider: String,
    pub host: String,
}
#[derive(Serialize, Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct Document {
    profiles: Vec<Profile>,
}
#[derive(Serialize)]
pub struct Accounts {
    pub token: String,
    pub profiles: Vec<Profile>,
}
fn error() -> GitError {
    GitError::new(
        "SSH_ACCOUNTS",
        "No se pudieron leer o guardar los perfiles SSH. Se conserva el archivo anterior; no se cambia Git ni SSH.",
    )
}
fn validate(profiles: &[Profile]) -> Result<()> {
    if profiles.len() > 50
        || profiles.iter().enumerate().any(|(i, p)| {
            p.label.trim().is_empty()
                || p.label.len() > 100
                || p.label.chars().any(char::is_control)
                || !matches!(
                    p.provider.as_str(),
                    "GitHub" | "GitLab" | "Gitea" | "Bitbucket" | "Otro"
                )
                || p.host.is_empty()
                || p.host.len() > 253
                || p.host.starts_with('-')
                || !p
                    .host
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b".-_".contains(&b))
                || profiles[..i]
                    .iter()
                    .any(|other| other.host.eq_ignore_ascii_case(&p.host))
        })
    {
        return Err(GitError::new(
            "SSH_PROFILE",
            "Revisa nombre, proveedor y host/alias SSH único. No incluyas URLs, claves ni comandos.",
        ));
    }
    Ok(())
}
pub fn read(directory: &Path) -> Result<Accounts> {
    let path = directory.join("ssh-accounts-v1.json");
    let bytes = match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Ok(meta) if meta.is_file() && meta.len() > 0 && meta.len() <= LIMIT => {
            let mut bytes = Vec::new();
            fs::File::open(path)
                .map_err(|_| error())?
                .take(LIMIT + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| error())?;
            if bytes.len() as u64 > LIMIT {
                return Err(error());
            }
            bytes
        }
        _ => return Err(error()),
    };
    let value: Document = if bytes.is_empty() {
        Document::default()
    } else {
        serde_json::from_slice(&bytes).map_err(|_| error())?
    };
    validate(&value.profiles)?;
    Ok(Accounts {
        token: format!("{:x}", Sha256::digest(&bytes)),
        profiles: value.profiles,
    })
}
pub fn save(directory: &Path, token: &str, profiles: Vec<Profile>) -> Result<Accounts> {
    validate(&profiles)?;
    if read(directory)?.token != token {
        return Err(GitError::new(
            "STALE_ACCOUNTS",
            "Los perfiles cambiaron. Actualiza antes de guardar.",
        ));
    }
    let bytes = serde_json::to_vec_pretty(&Document { profiles }).map_err(|_| error())?;
    fs::create_dir_all(directory).map_err(|_| error())?;
    let temp = directory.join(format!(
        "ssh-accounts-{}-{}.tmp",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|_| error())?;
    let result = (|| -> std::io::Result<()> {
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, directory.join("ssh-accounts-v1.json"))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|_| error())?;
    read(directory)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persists_labels_rejects_stale_and_invalid_alias_without_overwriting() {
        let dir = std::env::temp_dir().join(format!(
            "ravengit-accounts-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let initial = read(&dir).unwrap();
        let p = Profile {
            label: "Trabajo".into(),
            provider: "GitLab".into(),
            host: "gitlab-trabajo".into(),
        };
        let saved = save(&dir, &initial.token, vec![p.clone()]).unwrap();
        assert_eq!(read(&dir).unwrap().profiles[0].host, p.host);
        assert!(save(&dir, &initial.token, vec![]).is_err());
        for host in [
            "ssh -i clave",
            "https://github.com",
            "-proxy",
            "a\ncommand",
            "git@github.com",
        ] {
            assert!(
                save(
                    &dir,
                    &saved.token,
                    vec![Profile {
                        host: host.into(),
                        ..p.clone()
                    }]
                )
                .is_err()
            );
        }
        assert!(save(&dir, &saved.token, vec![p.clone(), p]).is_err());
        assert_eq!(read(&dir).unwrap().token, saved.token);
        let empty = save(&dir, &saved.token, vec![]).unwrap();
        assert!(empty.profiles.is_empty());
        let bitbucket = save(
            &dir,
            &empty.token,
            vec![Profile {
                label: "Bitbucket trabajo".into(),
                provider: "Bitbucket".into(),
                host: "bitbucket-trabajo".into(),
            }],
        )
        .unwrap();
        assert_eq!(read(&dir).unwrap().profiles[0].provider, "Bitbucket");
        let empty = save(&dir, &bitbucket.token, vec![]).unwrap();
        fs::write(dir.join("ssh-accounts-v1.json"), b"{invalid").unwrap();
        assert!(read(&dir).is_err());
        assert!(save(&dir, &empty.token, vec![]).is_err());
        assert_eq!(
            fs::read(dir.join("ssh-accounts-v1.json")).unwrap(),
            b"{invalid"
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
