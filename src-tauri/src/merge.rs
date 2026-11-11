use crate::{
    branches, changes,
    git::{self, GitError, Repository, Result},
    process,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf, time::Duration};

#[derive(Debug, Clone, Serialize)]
pub struct Commit {
    pub hash: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub token: String,
    pub source: String,
    pub destination: String,
    pub source_hash: String,
    pub destination_hash: String,
    pub relation: &'static str,
    pub incoming: usize,
    pub local: usize,
    pub commits: Vec<Commit>,
    pub truncated: bool,
    pub shallow: bool,
}

fn classify(incoming: usize, local: usize) -> &'static str {
    if incoming == 0 {
        "upToDate"
    } else if local == 0 {
        "fastForward"
    } else {
        "diverged"
    }
}

pub fn preview(repo: &Repository, token: &str, source: &str, trusted: bool) -> Result<Preview> {
    preview_impl(repo, token, source, None, trusted)
}

pub(crate) fn preview_target(
    repo: &Repository,
    token: &str,
    source: &str,
    hash: &str,
    trusted: bool,
) -> Result<Preview> {
    if !matches!(hash.len(), 40 | 64) || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(GitError::new(
            "MERGE_SOURCE",
            "El commit de origen no es válido.",
        ));
    }
    preview_impl(repo, token, source, Some(hash), trusted)
}

fn preview_impl(
    repo: &Repository,
    token: &str,
    source: &str,
    hash: Option<&str>,
    trusted: bool,
) -> Result<Preview> {
    if !trusted {
        return Err(GitError::new(
            "UNTRUSTED",
            "Autoriza el repositorio antes de revisar una integración.",
        ));
    }
    let state = branches::read(repo, true)?;
    if state.token != token {
        return Err(GitError::new(
            "STALE",
            "El repositorio cambió. Actualiza las ramas y vuelve a revisar.",
        ));
    }
    if let Some(reason) = state.restriction {
        return Err(GitError::new("MERGE_RESTRICTED", reason));
    }
    let destination = state.current.ok_or_else(|| {
        GitError::new(
            "MERGE_DETACHED",
            "Cambia a una rama local antes de revisar una integración.",
        )
    })?;
    if hash.is_none() && source == destination {
        return Err(GitError::new(
            "MERGE_SOURCE",
            "Elige una rama distinta de la activa.",
        ));
    }
    let source_hash = if let Some(hash) = hash {
        hash.to_string()
    } else {
        state
            .branches
            .iter()
            .find(|branch| branch.name == source)
            .ok_or_else(|| {
                GitError::new(
                    "MERGE_SOURCE",
                    "La rama de origen ya no existe. Actualiza las ramas.",
                )
            })?
            .hash
            .clone()
    };
    let destination_hash = state
        .head
        .ok_or_else(|| GitError::new("MERGE_HEAD", "No hay un commit de destino."))?;
    let range = format!("{destination_hash}...{source_hash}");
    let counts = git::text(
        &repo.path,
        &["rev-list", "--left-right", "--count", &range, "--"],
    )?;
    let numbers = counts
        .split_whitespace()
        .map(str::parse::<usize>)
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| {
            GitError::new(
                "MERGE_FORMAT",
                "No se pudo interpretar la comparación de commits.",
            )
        })?;
    let [local, incoming] = numbers.as_slice() else {
        return Err(GitError::new(
            "MERGE_FORMAT",
            "La comparación de commits está incompleta.",
        ));
    };
    let log_range = format!("{destination_hash}..{source_hash}");
    let log = git::text(
        &repo.path,
        &[
            "log",
            "--no-show-signature",
            "--format=%H%x00%s",
            "--max-count=100",
            &log_range,
            "--",
        ],
    )?;
    let commits = log
        .lines()
        .map(|line| {
            let (hash, subject) = line.split_once('\0').ok_or_else(|| {
                GitError::new("MERGE_FORMAT", "No se pudo interpretar un commit entrante.")
            })?;
            Ok(Commit {
                hash: hash.into(),
                subject: subject.into(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let shallow =
        git::text(&repo.path, &["rev-parse", "--is-shallow-repository"])?.trim() == "true";
    if branches::read(repo, true)?.token != token {
        return Err(GitError::new(
            "STALE",
            "El repositorio cambió durante la revisión. Actualiza las ramas.",
        ));
    }
    Ok(Preview {
        token: token.into(),
        source: source.into(),
        destination,
        source_hash,
        destination_hash,
        relation: classify(*incoming, *local),
        incoming: *incoming,
        local: *local,
        truncated: *incoming > commits.len(),
        commits,
        shallow,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub token: String,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub source_hash: String,
    pub conflicts: Vec<String>,
    pub staged: Vec<String>,
    pub can_continue: bool,
    pub restriction: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Edit {
    #[serde(skip)]
    Reviewed {
        source: String,
        source_hash: String,
        destination_hash: String,
    },
    Start {
        source: String,
        source_hash: String,
        destination_hash: String,
    },
    Resolve {
        path: String,
    },
    Continue {
        message: String,
    },
    Abort,
}

#[derive(Debug, Serialize)]
pub struct Outcome {
    pub message: String,
    pub warning: Option<String>,
}

fn metadata(repo: &Repository, name: &str) -> Result<PathBuf> {
    let directory = repo.path.join(".git");
    if directory.is_dir() {
        return Ok(directory.join(name));
    }
    Ok(PathBuf::from(
        git::text(
            &repo.path,
            &["rev-parse", "--path-format=absolute", "--git-path", name],
        )?
        .trim_end_matches('\n'),
    ))
}

fn contents(repo: &Repository, name: &str) -> Result<Vec<u8>> {
    match fs::read(metadata(repo, name)?) {
        Ok(bytes) => Ok(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(_) => Err(GitError::new(
            "MERGE_STATE",
            "No se pudo leer el estado de merge.",
        )),
    }
}

fn command(repo: &Repository, args: &[&str]) -> Result<process::Output> {
    let mut command = process::git(&repo.path);
    command
        .args([
            "-c",
            "submodule.recurse=false",
            "-c",
            "merge.autoStash=false",
            "-c",
            "rerere.enabled=false",
        ])
        .args(args)
        .env("GIT_NO_REPLACE_OBJECTS", "1")
        .env("GIT_MERGE_AUTOEDIT", "no")
        .env("GIT_EDITOR", "false")
        .env("GCM_INTERACTIVE", "never")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "");
    process::execute(command, None, Duration::from_secs(60)).map_err(|_| GitError::new("MERGE_UNCERTAIN", "Git se interrumpió. Actualiza y comprueba el merge antes de repetir; no hay reintentos automáticos."))
}

pub(crate) fn supported(repo: &Repository) -> Result<()> {
    supported_mode(repo, false)
}

pub(crate) fn supported_mode(repo: &Repository, recovering_rebase: bool) -> Result<()> {
    supported_impl(repo, recovering_rebase, false)
}
pub(crate) fn supported_replay(repo: &Repository) -> Result<()> {
    supported_impl(repo, false, true)
}
fn supported_impl(
    repo: &Repository,
    recovering_rebase: bool,
    recovering_replay: bool,
) -> Result<()> {
    let worktrees = git::text(&repo.path, &["worktree", "list", "--porcelain", "-z"])?;
    let index = git::run(&repo.path, &["ls-files", "--stage", "-z"])?;
    let flags = git::run(&repo.path, &["ls-files", "-v", "-z"])?;
    let sparse =
        git::text(&repo.path, &["config", "--bool", "core.sparseCheckout"]).unwrap_or_default();
    let split = git::text(&repo.path, &["rev-parse", "--shared-index-path"])?;
    let partial =
        git::text(&repo.path, &["config", "--get", "extensions.partialClone"]).unwrap_or_default();
    let promisor = git::text(
        &repo.path,
        &[
            "config",
            "--bool",
            "--get-regexp",
            "^remote\\..*\\.promisor$",
        ],
    )
    .unwrap_or_default();
    let replacements = git::text(
        &repo.path,
        &["for-each-ref", "--format=%(refname)", "refs/replace/"],
    )?;
    if repo.path.join(".git").is_file()
        || worktrees
            .split('\0')
            .filter(|part| part.starts_with("worktree "))
            .count()
            != 1
        || index
            .split(|byte| *byte == 0)
            .any(|entry| entry.starts_with(b"160000 "))
        || flags.split(|byte| *byte == 0).any(|entry| {
            entry
                .first()
                .is_some_and(|flag| flag.is_ascii_lowercase() || *flag == b'S')
        })
        || sparse.trim() == "true"
        || !split.trim().is_empty()
        || !partial.trim().is_empty()
        || promisor
            .lines()
            .any(|line| line.split_whitespace().last() == Some("true"))
        || !replacements.trim().is_empty()
        || metadata(repo, "info/grafts")?.exists()
        || git::text(&repo.path, &["rev-parse", "--is-shallow-repository"])?.trim() == "true"
    {
        return Err(GitError::new(
            "MERGE_UNSUPPORTED",
            "Este flujo requiere un repositorio completo, sin worktrees enlazados, submódulos, sparse/split index, reemplazos de objetos ni marcas que oculten cambios.",
        ));
    }
    for name in [
        "index.lock",
        "HEAD.lock",
        "MERGE_AUTOSTASH",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
        "sequencer",
        "BISECT_LOG",
    ] {
        if recovering_rebase && matches!(name, "rebase-merge" | "CHERRY_PICK_HEAD") {
            continue;
        }
        if recovering_replay && matches!(name, "CHERRY_PICK_HEAD" | "REVERT_HEAD") {
            continue;
        }
        if metadata(repo, name)?.exists() {
            return Err(GitError::new(
                "MERGE_RESTRICTED",
                "Hay locks, autostash u otra operación Git. Revísalos desde Git; RavenGit no los elimina.",
            ));
        }
    }
    Ok(())
}

pub fn read(repo: &Repository, trusted: bool) -> Result<Option<State>> {
    if !trusted {
        return Ok(None);
    }
    let merge_head = contents(repo, "MERGE_HEAD")?;
    if merge_head.is_empty() {
        return Ok(None);
    }
    let supported_restriction = supported(repo).err().map(|error| error.message);
    let changes = changes::read(repo, true)?;
    let source_hash = String::from_utf8(merge_head.clone())
        .map_err(|_| GitError::new("MERGE_STATE", "MERGE_HEAD no es válido."))?
        .trim()
        .to_string();
    let mut digest = Sha256::new();
    digest.update(changes.token.as_bytes());
    for bytes in [
        &merge_head,
        &contents(repo, "ORIG_HEAD")?,
        &contents(repo, "MERGE_MSG")?,
        &contents(repo, "MERGE_AUTOSTASH")?,
    ] {
        digest.update((bytes.len() as u64).to_le_bytes());
        digest.update(bytes);
    }
    let restriction = supported_restriction.or_else(|| {
        if !matches!(source_hash.len(), 40 | 64) || !source_hash.bytes().all(|byte| byte.is_ascii_hexdigit()) || changes.branch.is_none() {
            Some("Sólo se admite merge de una rama sobre una rama local activa.".into())
        } else if contents(repo, "ORIG_HEAD").ok().and_then(|bytes| String::from_utf8(bytes).ok()).as_deref().map(str::trim) != changes.head.as_deref() {
            Some("ORIG_HEAD no coincide con HEAD. Revisa el merge desde Git antes de continuar o abortar.".into())
        } else { None }
    });
    let conflicts: Vec<_> = changes
        .entries
        .iter()
        .filter(|entry| entry.conflict)
        .map(|entry| entry.path.clone())
        .collect();
    let can_continue = restriction.is_none()
        && conflicts.is_empty()
        && changes.author.is_some()
        && changes
            .entries
            .iter()
            .all(|entry| !entry.untracked && entry.worktree_status == ' ');
    let staged = changes
        .entries
        .iter()
        .filter(|entry| !entry.untracked && !entry.conflict && entry.index_status != ' ')
        .map(|entry| entry.path.clone())
        .collect();
    if contents(repo, "MERGE_HEAD")? != merge_head {
        return Err(GitError::new(
            "STALE",
            "El estado del merge cambió durante la lectura. Actualiza.",
        ));
    }
    Ok(Some(State {
        token: format!("{:x}", digest.finalize()),
        branch: changes.branch,
        head: changes.head,
        source_hash,
        conflicts,
        staged,
        can_continue,
        restriction,
    }))
}

pub fn edit(repo: &Repository, token: &str, edit: Edit, trusted: bool) -> Result<Outcome> {
    if !trusted {
        return Err(GitError::new(
            "UNTRUSTED",
            "Autoriza el repositorio antes de integrar.",
        ));
    }
    let start = match &edit {
        Edit::Start {
            source,
            source_hash,
            destination_hash,
        } => Some((
            preview(repo, token, source, true)?,
            source_hash,
            destination_hash,
        )),
        Edit::Reviewed {
            source,
            source_hash,
            destination_hash,
        } => Some((
            preview_target(repo, token, source, source_hash, true)?,
            source_hash,
            destination_hash,
        )),
        _ => None,
    };
    if let Some((review, source_hash, destination_hash)) = start {
        if review.source_hash != *source_hash || review.destination_hash != *destination_hash {
            return Err(GitError::new(
                "STALE",
                "Los commits revisados cambiaron. Revisa otra vez.",
            ));
        }
        supported(repo)?;
        if review.relation == "upToDate" {
            return Err(GitError::new(
                "MERGE_CURRENT",
                "No hay commits entrantes que integrar.",
            ));
        }
        if !command(
            repo,
            &["merge-base", &review.destination_hash, &review.source_hash],
        )?
        .success
        {
            return Err(GitError::new(
                "MERGE_BASE",
                "No se confirmó un ancestro común. No se permite integrar historiales sin relación ni descargar objetos implícitamente.",
            ));
        }
        let root = repo
            .path
            .canonicalize()
            .map_err(|_| GitError::new("MERGE_PATH", "No se pudo comprobar la raíz."))?;
        for hash in [&review.source_hash, &review.destination_hash] {
            let tree = git::run(&repo.path, &["ls-tree", "-r", "-z", hash])?;
            for entry in tree
                .split(|byte| *byte == 0)
                .filter(|entry| !entry.is_empty())
            {
                if entry.starts_with(b"160000 ") {
                    return Err(GitError::new(
                        "MERGE_UNSUPPORTED",
                        "Las ramas contienen submódulos.",
                    ));
                }
                let path = entry
                    .iter()
                    .position(|byte| *byte == b'\t')
                    .and_then(|position| std::str::from_utf8(&entry[position + 1..]).ok())
                    .ok_or_else(|| {
                        GitError::new("MERGE_PATH", "No se pudo validar una ruta del árbol Git.")
                    })?;
                let full = changes::validated_path(repo, path)?;
                if full.exists()
                    && !full
                        .canonicalize()
                        .map_err(|_| {
                            GitError::new("MERGE_PATH", "No se pudo comprobar una ruta de destino.")
                        })?
                        .starts_with(&root)
                {
                    return Err(GitError::new(
                        "PATH_ESCAPE",
                        "Una ruta del merge atraviesa un enlace fuera del repositorio.",
                    ));
                }
            }
        }
        if branches::read(repo, true)?.token != token {
            return Err(GitError::new(
                "STALE",
                "El repositorio cambió antes de integrar.",
            ));
        }
        let strategy = if review.relation == "fastForward" {
            "--ff-only"
        } else {
            "--no-ff"
        };
        let merge_options = format!("branch.{}.mergeOptions=", review.destination);
        let output = command(
            repo,
            &[
                "-c",
                &merge_options,
                "merge",
                strategy,
                "--no-commit",
                "--no-edit",
                "--no-autostash",
                "--no-overwrite-ignore",
                "--no-squash",
                "--strategy=ort",
                &review.source_hash,
            ],
        )?;
        if let Some(state) = read(repo, true)? {
            if state.head.as_deref() == Some(destination_hash) && state.source_hash == *source_hash
            {
                return Ok(Outcome { message: if state.conflicts.is_empty() { "Merge preparado. Revisa los cambios y continúa para crear el commit." } else { "Merge en pausa: resuelve los archivos en conflicto y marca cada uno como resuelto." }.into(), warning: None });
            }
        } else if git::text(&repo.path, &["rev-parse", "HEAD"])?.trim() == source_hash {
            return Ok(Outcome {
                message: "Fast-forward completado.".into(),
                warning: (!output.success).then(|| {
                    "El avance quedó confirmado, pero Git o un hook informó un error.".into()
                }),
            });
        }
        return Err(GitError::new(
            "MERGE_FAILED",
            "No se confirmó el merge. Git pudo rechazarlo por cambios, archivos ignorados o configuración. Actualiza antes de repetir.",
        ));
    }
    let state = read(repo, true)?
        .ok_or_else(|| GitError::new("MERGE_MISSING", "No hay un merge en curso."))?;
    if state.token != token {
        return Err(GitError::new(
            "STALE",
            "El merge o sus archivos cambiaron. Actualiza antes de continuar.",
        ));
    }
    if let Some(reason) = state.restriction {
        return Err(GitError::new("MERGE_RESTRICTED", reason));
    }
    match edit {
        Edit::Resolve { path } => {
            if !state.conflicts.contains(&path) {
                return Err(GitError::new(
                    "MERGE_PATH",
                    "Selecciona un archivo que siga en conflicto.",
                ));
            }
            let full = changes::validated_path(repo, &path)?;
            match fs::symlink_metadata(&full) {
                Ok(metadata)
                    if metadata.is_file()
                        && !metadata.file_type().is_symlink()
                        && metadata.len() <= 2 * 1024 * 1024 =>
                {
                    let bytes = fs::read(&full)
                        .map_err(|_| GitError::new("MERGE_FILE", "No se pudo leer el archivo."))?;
                    let text = std::str::from_utf8(&bytes).map_err(|_| {
                        GitError::new("MERGE_FILE", "Resuelve archivos binarios desde Git.")
                    })?;
                    if bytes.contains(&0)
                        || text.lines().any(|line| {
                            ["<<<<<<<", "=======", ">>>>>>>", "|||||||"]
                                .iter()
                                .any(|marker| line.starts_with(marker))
                        })
                    {
                        return Err(GitError::new(
                            "MERGE_MARKERS",
                            "El archivo contiene marcadores de conflicto o contenido binario. Edita y guarda su resolución antes de marcarlo.",
                        ));
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                _ => {
                    return Err(GitError::new(
                        "MERGE_FILE",
                        "Este flujo admite archivos de texto de hasta 2 MiB o eliminaciones. Resuelve enlaces y casos avanzados desde Git.",
                    ));
                }
            }
            if read(repo, true)?.is_none_or(|current| current.token != token) {
                return Err(GitError::new(
                    "STALE",
                    "El archivo cambió antes de prepararlo. Actualiza.",
                ));
            }
            let output = command(repo, &["add", "--", &path])?;
            if !output.success
                || read(repo, true)?.is_none_or(|current| current.conflicts.contains(&path))
            {
                return Err(GitError::new(
                    "MERGE_RESOLVE",
                    "No se confirmó la resolución. Actualiza antes de repetir.",
                ));
            }
            Ok(Outcome {
                message: format!("Resolución preparada: {path}."),
                warning: None,
            })
        }
        Edit::Continue { message } => {
            if !state.can_continue
                || message.trim().is_empty()
                || message.len() > 65536
                || message.contains('\0')
            {
                return Err(GitError::new(
                    "MERGE_CONTINUE",
                    "Resuelve todos los conflictos, guarda/prepara los cambios y configura tu autor antes de continuar con un mensaje.",
                ));
            }
            let output = command(repo, &["commit", "-m", &message])?;
            let parents = git::text(&repo.path, &["rev-list", "--parents", "-n", "1", "HEAD"])?;
            let parents: Vec<_> = parents.split_whitespace().collect();
            if contents(repo, "MERGE_HEAD")?.is_empty()
                && parents.len() == 3
                && Some(parents[1]) == state.head.as_deref()
                && parents[2] == state.source_hash
            {
                Ok(Outcome { message: "Merge completado: commit de dos padres confirmado.".into(), warning: (!output.success).then(|| "El commit existe, pero Git o un hook informó un error. Revisa sus efectos.".into()) })
            } else {
                Err(GitError::new(
                    "MERGE_CONTINUE",
                    "No se confirmó el commit de merge. Revisa hooks, firma y cambios; el merge puede seguir en curso. No se reintenta automáticamente.",
                ))
            }
        }
        Edit::Abort => {
            let output = command(repo, &["merge", "--abort"])?;
            let head = git::text(&repo.path, &["rev-parse", "HEAD"])?;
            if output.success
                && contents(repo, "MERGE_HEAD")?.is_empty()
                && Some(head.trim()) == state.head.as_deref()
            {
                Ok(Outcome {
                    message: "Merge abortado. Revisa tus archivos antes de seguir.".into(),
                    warning: None,
                })
            } else {
                Err(GitError::new(
                    "MERGE_ABORT",
                    "Git no confirmó el aborto. Conserva los archivos y comprueba el estado desde Git; no se fuerza ningún reset.",
                ))
            }
        }
        Edit::Start { .. } | Edit::Reviewed { .. } => unreachable!(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_direction_from_destination_to_source() {
        assert_eq!(classify(0, 0), "upToDate");
        assert_eq!(classify(0, 3), "upToDate");
        assert_eq!(classify(3, 0), "fastForward");
        assert_eq!(classify(3, 2), "diverged");
    }

    #[test]
    fn rejects_untrusted_without_reading_the_repository() {
        let repo = Repository {
            id: "fixture".into(),
            path: std::path::PathBuf::from("nonexistent-merge-fixture"),
        };
        assert_eq!(
            preview(&repo, "", "main", false).unwrap_err().code,
            "UNTRUSTED"
        );
    }
}
