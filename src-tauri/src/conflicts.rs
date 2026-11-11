use crate::{
    changes,
    git::{self, GitError, Repository, Result},
};
use serde::Serialize;

const TEXT_LIMIT: usize = 512 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub(crate) stage: u8,
    hash: String,
    pub(crate) text: Option<String>,
    pub(crate) restriction: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Conflict {
    path: String,
    pub(crate) versions: Vec<Version>,
}

fn stale() -> GitError {
    GitError::new(
        "CONFLICT_STALE",
        "El conflicto cambió. Actualiza Cambios y vuelve a abrir la consulta.",
    )
}

pub fn read(repo: &Repository, token: &str, path: &str, trusted: bool) -> Result<Conflict> {
    if !trusted {
        return Err(GitError::new(
            "UNTRUSTED",
            "Autoriza el repositorio antes de consultar conflictos.",
        ));
    }
    changes::validated_path(repo, path)?;
    let state = changes::read(repo, true)?;
    if state.token != token {
        return Err(stale());
    }
    if !state
        .entries
        .iter()
        .any(|entry| entry.path == path && entry.conflict)
    {
        return Err(GitError::new(
            "NO_CONFLICT",
            "El archivo ya no tiene etapas en conflicto.",
        ));
    }
    let index = git::run(&repo.path, &["ls-files", "--unmerged", "-z", "--", path])?;
    let mut versions = Vec::new();
    for record in index
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
    {
        let invalid = || {
            GitError::new(
                "CONFLICT_FORMAT",
                "No se pudieron verificar las etapas del conflicto.",
            )
        };
        let separator = record
            .iter()
            .position(|byte| *byte == b'\t')
            .ok_or_else(invalid)?;
        if &record[separator + 1..] != path.as_bytes() {
            return Err(invalid());
        }
        let header = std::str::from_utf8(&record[..separator]).map_err(|_| invalid())?;
        let fields: Vec<_> = header.split(' ').collect();
        if fields.len() != 3
            || !matches!(fields[1].len(), 40 | 64)
            || !fields[1].bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(invalid());
        }
        let stage = fields[2].parse::<u8>().map_err(|_| invalid())?;
        if !(1..=3).contains(&stage)
            || versions
                .iter()
                .any(|version: &Version| version.stage == stage)
        {
            return Err(invalid());
        }
        let mut version = Version {
            stage,
            hash: fields[1].into(),
            text: None,
            restriction: None,
        };
        if !matches!(fields[0], "100644" | "100755") {
            version.restriction = Some(
                "Enlace, submódulo o tipo no compatible: consulta textual deshabilitada.".into(),
            );
        } else {
            let size = git::text(
                &repo.path,
                &["--no-replace-objects", "cat-file", "-s", fields[1]],
            )?;
            let size = size.trim().parse::<usize>().map_err(|_| invalid())?;
            if size > TEXT_LIMIT {
                version.restriction =
                    Some("La versión supera 512 KiB; no se muestra contenido truncado.".into());
            } else {
                let bytes = git::run(
                    &repo.path,
                    &["--no-replace-objects", "cat-file", "blob", fields[1]],
                )?;
                if bytes.len() != size {
                    return Err(invalid());
                }
                if bytes.contains(&0) {
                    version.restriction =
                        Some("Contenido binario; no se muestra como texto.".into());
                } else {
                    match String::from_utf8(bytes) {
                        Ok(text) => version.text = Some(text),
                        Err(_) => {
                            version.restriction =
                                Some("Contenido no UTF-8; no se convierte con pérdida.".into())
                        }
                    }
                }
            }
        }
        versions.push(version);
    }
    if versions.is_empty() || changes::read(repo, true)?.token != token {
        return Err(stale());
    }
    versions.sort_by_key(|version| version.stage);
    Ok(Conflict {
        path: path.into(),
        versions,
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::{
        fs,
        sync::atomic::{AtomicU64, Ordering},
    };
    static NEXT: AtomicU64 = AtomicU64::new(0);
    pub(crate) struct Fixture(pub(crate) Repository);
    impl Fixture {
        pub(crate) fn new(base: Option<&[u8]>, local: Option<&[u8]>, incoming: &[u8]) -> Self {
            let path = std::env::temp_dir().join(format!(
                "ravengit-conflicts-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            let fixture = Self(Repository {
                id: "fixture".into(),
                path,
            });
            fixture.git(&["init", "-b", "main"]);
            fixture.git(&["config", "user.name", "Fixture"]);
            fixture.git(&["config", "user.email", "fixture@example.invalid"]);
            fixture.git(&["config", "commit.gpgsign", "false"]);
            fixture.git(&["config", "core.autocrlf", "false"]);
            fixture.git(&["config", "core.hooksPath", ".git/no-hooks"]);
            fixture.git(&["config", "rerere.enabled", "false"]);
            fixture.git(&["config", "merge.gpgSign", "false"]);
            fs::write(fixture.0.path.join("keep"), "keep").unwrap();
            if let Some(bytes) = base {
                fs::write(fixture.0.path.join("archivo ü.txt"), bytes).unwrap();
            }
            fixture.commit("base");
            fixture.git(&["checkout", "-b", "incoming"]);
            fs::write(fixture.0.path.join("archivo ü.txt"), incoming).unwrap();
            fixture.commit("incoming");
            fixture.git(&["checkout", "main"]);
            if let Some(bytes) = local {
                fs::write(fixture.0.path.join("archivo ü.txt"), bytes).unwrap();
            } else {
                fs::remove_file(fixture.0.path.join("archivo ü.txt")).unwrap();
            }
            fixture.commit("local");
            assert!(git::run(&fixture.0.path, &["merge", "--no-edit", "incoming"]).is_err());
            fixture
        }
        pub(crate) fn git(&self, args: &[&str]) {
            git::run(&self.0.path, args).unwrap();
        }
        fn commit(&self, message: &str) {
            self.git(&["add", "--all"]);
            self.git(&["commit", "-m", message]);
        }
        fn read(&self) -> Conflict {
            read(
                &self.0,
                &changes::read(&self.0, true).unwrap().token,
                "archivo ü.txt",
                true,
            )
            .unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0.path);
        }
    }
    #[test]
    fn reads_three_stages_without_modifying_index_or_worktree() {
        let fixture = Fixture::new(Some(b"base\n"), Some(b"local\n"), b"incoming\n");
        let before = changes::read(&fixture.0, true).unwrap().token;
        let conflict = fixture.read();
        assert_eq!(
            conflict
                .versions
                .iter()
                .map(|version| version.text.as_deref())
                .collect::<Vec<_>>(),
            vec![Some("base\n"), Some("local\n"), Some("incoming\n")]
        );
        assert_eq!(before, changes::read(&fixture.0, true).unwrap().token);
    }
    #[test]
    fn preserves_absent_base_and_deleted_side() {
        let added = Fixture::new(None, Some(b"local\n"), b"incoming\n");
        assert_eq!(
            added
                .read()
                .versions
                .iter()
                .map(|version| version.stage)
                .collect::<Vec<_>>(),
            vec![2, 3]
        );
        let deleted = Fixture::new(Some(b"base\n"), None, b"incoming\n");
        assert_eq!(
            deleted
                .read()
                .versions
                .iter()
                .map(|version| version.stage)
                .collect::<Vec<_>>(),
            vec![1, 3]
        );
    }
    #[test]
    fn blocks_untrusted_stale_and_invalid_paths() {
        let fixture = Fixture::new(Some(b"base\n"), Some(b"local\n"), b"incoming\n");
        assert_eq!(
            read(&fixture.0, "", "archivo ü.txt", false)
                .unwrap_err()
                .code,
            "UNTRUSTED"
        );
        assert_eq!(
            read(&fixture.0, "old", "archivo ü.txt", true)
                .unwrap_err()
                .code,
            "CONFLICT_STALE"
        );
        assert_eq!(
            read(&fixture.0, "", "../outside", true).unwrap_err().code,
            "INVALID_PATH"
        );
        let token = changes::read(&fixture.0, true).unwrap().token;
        assert_eq!(
            read(&fixture.0, &token, "keep", true).unwrap_err().code,
            "NO_CONFLICT"
        );
    }
    #[test]
    fn binary_and_non_utf8_are_not_lossily_rendered() {
        for bytes in [b"incoming\0".as_slice(), b"incoming\xff".as_slice()] {
            let fixture = Fixture::new(Some(b"base\n"), Some(b"local\n"), bytes);
            let conflict = fixture.read();
            let incoming = conflict
                .versions
                .iter()
                .find(|version| version.stage == 3)
                .unwrap();
            assert!(incoming.text.is_none());
            assert!(incoming.restriction.is_some());
        }
    }
    #[test]
    fn symlink_stage_is_metadata_only() {
        let fixture = Fixture::new(Some(b"base\n"), Some(b"local\n"), b"incoming\n");
        let local = fixture.read().versions[1].hash.clone();
        let mut command = crate::process::git(&fixture.0.path);
        command.args(["update-index", "--index-info"]);
        let input = format!("120000 {local} 2\tarchivo ü.txt\n");
        let result = crate::process::execute(
            command,
            Some(input.into_bytes()),
            std::time::Duration::from_secs(15),
        )
        .unwrap();
        assert!(result.success);
        let conflict = fixture.read();
        assert!(conflict.versions[1].text.is_none());
        assert!(
            conflict.versions[1]
                .restriction
                .as_ref()
                .unwrap()
                .contains("Enlace")
        );
    }
    #[test]
    fn oversized_version_is_not_truncated() {
        let fixture = Fixture::new(
            Some(b"base\n"),
            Some(b"local\n"),
            &vec![b'x'; TEXT_LIMIT + 1],
        );
        let conflict = fixture.read();
        assert!(conflict.versions[2].text.is_none());
        assert!(
            conflict.versions[2]
                .restriction
                .as_ref()
                .unwrap()
                .contains("512 KiB")
        );
    }
}
