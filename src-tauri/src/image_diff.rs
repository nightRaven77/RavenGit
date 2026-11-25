use crate::{
    changes,
    git::{self, GitError, Repository, Result},
};
use serde::{Deserialize, Serialize};
use std::fs;

const MAX_IMAGE_BYTES: usize = 2 * 1024 * 1024;
const BASE64_ALPHABET: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImageSide {
    pub label: String,
    pub data_url: Option<String>,
    pub mime: String,
    pub bytes: u64,
    pub is_lfs_pointer: bool,
    pub too_large: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImageDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub mime: String,
    pub before: Option<ImageSide>,
    pub after: Option<ImageSide>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Source {
    Worktree {
        path: String,
        area: changes::Area,
    },
    Commit {
        hash: String,
        #[serde(rename = "parentIndex")]
        parent_index: usize,
        path: String,
        #[serde(rename = "oldPath")]
        old_path: Option<String>,
    },
    Range {
        base: String,
        target: String,
        path: String,
        #[serde(rename = "oldPath")]
        old_path: Option<String>,
    },
}

fn error(code: &'static str, message: impl Into<String>) -> GitError {
    GitError::new(code, message)
}

fn encode_base64(input: &[u8]) -> String {
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    let (chunks, remainder) = input.as_chunks::<3>();
    for chunk in chunks {
        let n = ((chunk[0] as u32) << 16) | ((chunk[1] as u32) << 8) | (chunk[2] as u32);
        out.push(BASE64_ALPHABET[((n >> 18) & 0x3F) as usize] as char);
        out.push(BASE64_ALPHABET[((n >> 12) & 0x3F) as usize] as char);
        out.push(BASE64_ALPHABET[((n >> 6) & 0x3F) as usize] as char);
        out.push(BASE64_ALPHABET[(n & 0x3F) as usize] as char);
    }
    if remainder.len() == 1 {
        let n = (remainder[0] as u32) << 16;
        out.push(BASE64_ALPHABET[((n >> 18) & 0x3F) as usize] as char);
        out.push(BASE64_ALPHABET[((n >> 12) & 0x3F) as usize] as char);
        out.push('=');
        out.push('=');
    } else if remainder.len() == 2 {
        let n = ((remainder[0] as u32) << 16) | ((remainder[1] as u32) << 8);
        out.push(BASE64_ALPHABET[((n >> 18) & 0x3F) as usize] as char);
        out.push(BASE64_ALPHABET[((n >> 12) & 0x3F) as usize] as char);
        out.push(BASE64_ALPHABET[((n >> 6) & 0x3F) as usize] as char);
        out.push('=');
    }
    out
}

fn is_lfs_pointer(bytes: &[u8]) -> bool {
    bytes.len() <= 1024 && bytes.starts_with(b"version https://git-lfs.github.com/spec/v1")
}

pub fn mime_for_path(path: &str) -> Option<&'static str> {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        Some("image/png")
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        Some("image/jpeg")
    } else if lower.ends_with(".webp") {
        Some("image/webp")
    } else if lower.ends_with(".gif") {
        Some("image/gif")
    } else if lower.ends_with(".svg") {
        Some("image/svg+xml")
    } else {
        None
    }
}

fn require_mime(path: &str) -> Result<&'static str> {
    mime_for_path(path).ok_or_else(|| {
        error(
            "UNSUPPORTED_IMAGE",
            "Este formato de archivo no admite comparación visual de imágenes.",
        )
    })
}

fn side_from_bytes(label: String, mime: &str, bytes: &[u8]) -> ImageSide {
    let size = bytes.len() as u64;
    if is_lfs_pointer(bytes) {
        return ImageSide {
            label,
            data_url: None,
            mime: mime.to_string(),
            bytes: size,
            is_lfs_pointer: true,
            too_large: false,
        };
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        return ImageSide {
            label,
            data_url: None,
            mime: mime.to_string(),
            bytes: size,
            is_lfs_pointer: false,
            too_large: true,
        };
    }
    let encoded = encode_base64(bytes);
    ImageSide {
        label,
        data_url: Some(format!("data:{mime};base64,{encoded}")),
        mime: mime.to_string(),
        bytes: size,
        is_lfs_pointer: false,
        too_large: false,
    }
}

fn read_git_blob_side(repo: &Repository, spec: &str, label: &str, mime: &str) -> Option<ImageSide> {
    let size_text = git::text(&repo.path, &["cat-file", "-s", spec]).ok()?;
    let size = size_text.trim().parse::<u64>().ok()?;
    if size > MAX_IMAGE_BYTES as u64 {
        return Some(ImageSide {
            label: label.to_string(),
            data_url: None,
            mime: mime.to_string(),
            bytes: size,
            is_lfs_pointer: false,
            too_large: true,
        });
    }
    let bytes = git::run(&repo.path, &["cat-file", "blob", spec]).ok()?;
    Some(side_from_bytes(label.to_string(), mime, &bytes))
}

fn read_worktree_file_side(
    repo: &Repository,
    path: &str,
    label: &str,
    mime: &str,
) -> Result<Option<ImageSide>> {
    let full = changes::validated_path(repo, path)?;
    let meta = match fs::symlink_metadata(&full) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => {
            return Err(error(
                "FILE_READ",
                "No se pudo inspeccionar la imagen del árbol de trabajo.",
            ));
        }
    };
    if meta.file_type().is_symlink() || meta.is_dir() {
        return Err(error(
            "UNSUPPORTED_IMAGE",
            "Sólo se admiten archivos de imagen regulares.",
        ));
    }
    let size = meta.len();
    if size > MAX_IMAGE_BYTES as u64 {
        return Ok(Some(ImageSide {
            label: label.to_string(),
            data_url: None,
            mime: mime.to_string(),
            bytes: size,
            is_lfs_pointer: false,
            too_large: true,
        }));
    }
    let bytes = fs::read(&full).map_err(|_| {
        error(
            "FILE_READ",
            "No se pudo leer la imagen desde el árbol de trabajo.",
        )
    })?;
    Ok(Some(side_from_bytes(label.to_string(), mime, &bytes)))
}

fn short_hash(hash: &str) -> &str {
    let end = 7.min(hash.len());
    &hash[..end]
}

pub fn read(repo: &Repository, source: Source, trusted: bool) -> Result<ImageDiff> {
    match source {
        Source::Worktree { path, area } => {
            if !trusted {
                return Err(error(
                    "TRUST_REQUIRED",
                    "Autoriza este repositorio antes de inspeccionar imágenes del árbol de trabajo.",
                ));
            }
            let _ = changes::validated_path(repo, &path)?;
            let mime = require_mime(&path)?;
            match area {
                changes::Area::Staged => {
                    let before = read_git_blob_side(repo, &format!("HEAD:{path}"), "HEAD", mime);
                    let after = read_git_blob_side(repo, &format!(":{path}"), "Preparado", mime);
                    Ok(ImageDiff {
                        path,
                        old_path: None,
                        mime: mime.to_string(),
                        before,
                        after,
                    })
                }
                changes::Area::Unstaged => {
                    let before = read_git_blob_side(repo, &format!(":{path}"), "Índice", mime)
                        .or_else(|| {
                            read_git_blob_side(repo, &format!("HEAD:{path}"), "HEAD", mime)
                        });
                    let after = read_worktree_file_side(repo, &path, "Árbol de trabajo", mime)?;
                    Ok(ImageDiff {
                        path,
                        old_path: None,
                        mime: mime.to_string(),
                        before,
                        after,
                    })
                }
            }
        }
        Source::Commit {
            hash,
            parent_index,
            path,
            old_path,
        } => {
            git::validate_rel_path(&path)?;
            if let Some(prev) = old_path.as_deref() {
                git::validate_rel_path(prev)?;
            }
            let mime = require_mime(&path)?;
            let (parent, _) = git::resolve_parent(repo, &hash, parent_index)?;
            let before_path = old_path.as_deref().unwrap_or(&path);
            let before = parent.and_then(|p| {
                let label = format!("Padre {}", short_hash(&p));
                read_git_blob_side(repo, &format!("{p}:{before_path}"), &label, mime)
            });
            let after_label = format!("Commit {}", short_hash(&hash));
            let after = read_git_blob_side(repo, &format!("{hash}:{path}"), &after_label, mime);
            Ok(ImageDiff {
                path,
                old_path,
                mime: mime.to_string(),
                before,
                after,
            })
        }
        Source::Range {
            base,
            target,
            path,
            old_path,
        } => {
            if !git::oid(&base) || !git::oid(&target) {
                return Err(error(
                    "INVALID_COMMIT",
                    "Selecciona commits válidos para comparar la imagen.",
                ));
            }
            git::validate_rel_path(&path)?;
            if let Some(prev) = old_path.as_deref() {
                git::validate_rel_path(prev)?;
            }
            let mime = require_mime(&path)?;
            let before_path = old_path.as_deref().unwrap_or(&path);
            let before = read_git_blob_side(
                repo,
                &format!("{base}:{before_path}"),
                &format!("Base {}", short_hash(&base)),
                mime,
            );
            let after = read_git_blob_side(
                repo,
                &format!("{target}:{path}"),
                &format!("Destino {}", short_hash(&target)),
                mime,
            );
            Ok(ImageDiff {
                path,
                old_path,
                mime: mime.to_string(),
                before,
                after,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        path::PathBuf,
        process::Command,
        sync::atomic::{AtomicU64, Ordering},
    };

    static NEXT_TEST: AtomicU64 = AtomicU64::new(0);

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "ravengit-imgdiff-{}-{}",
                std::process::id(),
                NEXT_TEST.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            let f = Self(path);
            f.git(&["init", "-b", "main"]);
            f.git(&["config", "user.name", "RavenGit"]);
            f.git(&["config", "user.email", "test@ravengit.local"]);
            f
        }
        fn git(&self, args: &[&str]) -> String {
            let out = Command::new("git")
                .current_dir(&self.0)
                .args(args)
                .output()
                .unwrap();
            assert!(
                out.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            String::from_utf8_lossy(&out.stdout).into_owned()
        }
        fn repo(&self) -> Repository {
            Repository {
                id: "img-test".into(),
                path: self.0.clone(),
            }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn reads_commit_range_worktree_renames_lfs_and_size_limits() {
        let f = Fixture::new();
        let repo = f.repo();
        let png_v1 = [0x89, b'P', b'N', b'G', 1, 2, 3];
        let png_v2 = [0x89, b'P', b'N', b'G', 4, 5, 6, 7];

        fs::write(f.0.join("logo.png"), png_v1).unwrap();
        fs::write(f.0.join("icon.svg"), "<svg><rect/></svg>").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "inicial con imagen"]);
        let c1 = f.git(&["rev-parse", "HEAD"]).trim().to_string();

        // Commit 1 added logo.png (no parent -> before is None)
        let added = read(
            &repo,
            Source::Commit {
                hash: c1.clone(),
                parent_index: 0,
                path: "logo.png".into(),
                old_path: None,
            },
            false,
        )
        .unwrap();
        assert!(added.before.is_none());
        assert!(
            added
                .after
                .as_ref()
                .and_then(|s| s.data_url.as_ref())
                .is_some_and(|u| u.starts_with("data:image/png;base64,"))
        );

        // Modify + rename icon.svg in c2
        fs::write(f.0.join("logo.png"), png_v2).unwrap();
        fs::remove_file(f.0.join("icon.svg")).unwrap();
        fs::write(f.0.join("mark.svg"), "<svg><circle/></svg>").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "actualiza png y renombra svg"]);
        let c2 = f.git(&["rev-parse", "HEAD"]).trim().to_string();

        let renamed = read(
            &repo,
            Source::Commit {
                hash: c2.clone(),
                parent_index: 0,
                path: "mark.svg".into(),
                old_path: Some("icon.svg".into()),
            },
            false,
        )
        .unwrap();
        assert_eq!(renamed.mime, "image/svg+xml");
        assert!(renamed.before.is_some());
        assert!(renamed.after.is_some());

        // Range diff c1..c2
        let range = read(
            &repo,
            Source::Range {
                base: c1,
                target: c2,
                path: "logo.png".into(),
                old_path: None,
            },
            false,
        )
        .unwrap();
        assert_eq!(range.before.unwrap().bytes, png_v1.len() as u64);
        assert_eq!(range.after.unwrap().bytes, png_v2.len() as u64);

        // Worktree staged & unstaged + untrusted gate
        fs::write(f.0.join("logo.png"), [0x89, b'P', b'N', b'G', 9]).unwrap();
        assert_eq!(
            read(
                &repo,
                Source::Worktree {
                    path: "logo.png".into(),
                    area: changes::Area::Unstaged,
                },
                false,
            )
            .unwrap_err()
            .code,
            "TRUST_REQUIRED"
        );
        let wt = read(
            &repo,
            Source::Worktree {
                path: "logo.png".into(),
                area: changes::Area::Unstaged,
            },
            true,
        )
        .unwrap();
        assert_eq!(wt.after.unwrap().bytes, 5);

        // LFS pointer detection & oversize check in worktree
        fs::write(
            f.0.join("lfs.webp"),
            "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1234\n",
        )
        .unwrap();
        let lfs = read(
            &repo,
            Source::Worktree {
                path: "lfs.webp".into(),
                area: changes::Area::Unstaged,
            },
            true,
        )
        .unwrap();
        assert!(lfs.after.unwrap().is_lfs_pointer);

        let huge = vec![0u8; MAX_IMAGE_BYTES + 16];
        fs::write(f.0.join("huge.png"), huge).unwrap();
        let oversize = read(
            &repo,
            Source::Worktree {
                path: "huge.png".into(),
                area: changes::Area::Unstaged,
            },
            true,
        )
        .unwrap();
        assert!(oversize.after.unwrap().too_large);

        assert_eq!(
            read(
                &repo,
                Source::Worktree {
                    path: "notes.txt".into(),
                    area: changes::Area::Unstaged,
                },
                true,
            )
            .unwrap_err()
            .code,
            "UNSUPPORTED_IMAGE"
        );
    }
}
