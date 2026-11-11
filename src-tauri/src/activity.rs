//! Persistent, bounded operation activity and redacted diagnostic export.
use crate::git::{GitError, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const VERSION: u8 = 1;
const MAX_EVENTS: usize = 500;
const MAX_BYTES: u64 = 512 * 1024;
static NEXT: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Operation {
    Initialize,
    Clone,
    Stage,
    Unstage,
    Commit,
    Amend,
    Branch,
    Remote,
    Fetch,
    Pull,
    Push,
    Tag,
    PublishTag,
    Stash,
    Merge,
    Rebase,
    Replay,
    Conflict,
    RestoreConflict,
    Trust,
    SshAccounts,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Confirmed,
    Unchanged,
    Warning,
    Uncertain,
    Error,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Input {
    pub operation: Operation,
    pub status: Status,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Event {
    pub id: String,
    pub occurred_at: u64,
    pub operation: Operation,
    pub status: Status,
    pub repository: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Document {
    version: u8,
    events: Vec<Event>,
}

impl Default for Document {
    fn default() -> Self {
        Self {
            version: VERSION,
            events: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityLog {
    pub token: String,
    pub events: Vec<Event>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Platform {
    os: &'static str,
    architecture: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Diagnostic {
    version: u8,
    generated_at: u64,
    app_version: &'static str,
    platform: Platform,
    activity_count: usize,
    activity: Vec<Event>,
    exclusions: [&'static str; 5],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOutcome {
    pub message: String,
    pub event_count: usize,
}

fn error() -> GitError {
    GitError::new(
        "ACTIVITY",
        "No se pudo leer o guardar la actividad. Se conserva el archivo anterior; Git no se ha modificado.",
    )
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn target(directory: &Path) -> PathBuf {
    directory.join("activity-v1.json")
}

fn validate(document: &Document) -> Result<()> {
    if document.version != VERSION
        || document.events.len() > MAX_EVENTS
        || document.events.iter().any(|event| {
            event.id.is_empty()
                || event.id.len() > 80
                || event.id.chars().any(char::is_control)
                || event.repository.as_ref().is_some_and(|name| {
                    name.trim().is_empty()
                        || name.len() > 120
                        || name.chars().any(char::is_control)
                        || name.contains(['/', '\\'])
                })
        })
    {
        return Err(error());
    }
    Ok(())
}

fn read_bytes(path: &Path) -> Result<Vec<u8>> {
    match fs::symlink_metadata(path) {
        Err(value) if value.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Ok(metadata) if metadata.is_file() && metadata.len() <= MAX_BYTES => {
            let mut bytes = Vec::new();
            fs::File::open(path)
                .map_err(|_| error())?
                .take(MAX_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| error())?;
            if bytes.len() as u64 > MAX_BYTES {
                Err(error())
            } else {
                Ok(bytes)
            }
        }
        _ => Err(error()),
    }
}

pub fn read(directory: &Path) -> Result<ActivityLog> {
    let bytes = read_bytes(&target(directory))?;
    let document = if bytes.is_empty() {
        Document::default()
    } else {
        serde_json::from_slice::<Document>(&bytes).map_err(|_| error())?
    };
    validate(&document)?;
    Ok(ActivityLog {
        token: format!("{:x}", Sha256::digest(&bytes)),
        events: document.events,
    })
}

fn temporary(parent: &Path, stem: &str, extension: &str) -> PathBuf {
    parent.join(format!(
        "{stem}-{}-{}-{extension}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ))
}

fn replace_file(destination: &Path, bytes: &[u8], failure: fn() -> GitError) -> Result<()> {
    let parent = destination.parent().ok_or_else(failure)?;
    fs::create_dir_all(parent).map_err(|_| failure())?;
    if fs::symlink_metadata(destination).is_ok_and(|metadata| !metadata.is_file()) {
        return Err(failure());
    }
    let temp = temporary(parent, "ravengit-activity", "tmp");
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|_| failure())?;
    if file.write_all(bytes).and_then(|_| file.sync_all()).is_err() {
        let _ = fs::remove_file(&temp);
        return Err(failure());
    }
    drop(file);
    let backup = temporary(parent, "ravengit-activity", "backup");
    let had_destination = destination.exists();
    if had_destination && fs::rename(destination, &backup).is_err() {
        let _ = fs::remove_file(&temp);
        return Err(failure());
    }
    if fs::rename(&temp, destination).is_err() {
        if had_destination {
            let _ = fs::rename(&backup, destination);
        }
        let _ = fs::remove_file(&temp);
        return Err(failure());
    }
    if had_destination {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

fn save(directory: &Path, document: &Document) -> Result<()> {
    validate(document)?;
    let bytes = serde_json::to_vec_pretty(document).map_err(|_| error())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(error());
    }
    replace_file(&target(directory), &bytes, error)
}

pub fn record(directory: &Path, input: Input, repository: Option<String>) -> Result<Event> {
    let mut log = read(directory)?;
    let event = Event {
        id: format!(
            "activity-{}-{}",
            now(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ),
        occurred_at: now(),
        operation: input.operation,
        status: input.status,
        repository,
    };
    let mut events = Vec::with_capacity((log.events.len() + 1).min(MAX_EVENTS));
    events.push(event.clone());
    events.append(&mut log.events);
    events.truncate(MAX_EVENTS);
    save(
        directory,
        &Document {
            version: VERSION,
            events,
        },
    )?;
    Ok(event)
}

pub fn clear(directory: &Path, token: &str, confirmed: bool) -> Result<ActivityLog> {
    if !confirmed {
        return Err(GitError::new(
            "ACTIVITY_CONFIRM",
            "Confirma que quieres borrar sólo el registro local de actividad.",
        ));
    }
    if read(directory)?.token != token {
        return Err(GitError::new(
            "STALE_ACTIVITY",
            "La actividad cambió. Actualiza antes de borrarla.",
        ));
    }
    save(directory, &Document::default())?;
    read(directory)
}

fn export_error() -> GitError {
    GitError::new(
        "DIAGNOSTIC_EXPORT",
        "No se pudo exportar el diagnóstico. No se modificó la actividad ni ningún repositorio.",
    )
}

pub fn export(directory: &Path, destination: &Path) -> Result<ExportOutcome> {
    if !destination.is_absolute() || destination.parent().is_none_or(|parent| !parent.is_dir()) {
        return Err(export_error());
    }
    let log = read(directory)?;
    let mut repositories = BTreeMap::<String, String>::new();
    let activity = log
        .events
        .iter()
        .cloned()
        .map(|mut event| {
            if let Some(repository) = event.repository.take() {
                let next = repositories.len() + 1;
                event.repository = Some(
                    repositories
                        .entry(repository)
                        .or_insert_with(|| format!("Repositorio {next}"))
                        .clone(),
                );
            }
            event
        })
        .collect::<Vec<_>>();
    let count = activity.len();
    let bytes = serde_json::to_vec_pretty(&Diagnostic {
        version: VERSION,
        generated_at: now(),
        app_version: env!("CARGO_PKG_VERSION"),
        platform: Platform {
            os: std::env::consts::OS,
            architecture: std::env::consts::ARCH,
        },
        activity_count: count,
        activity,
        exclusions: [
            "repositoryPaths",
            "remoteUrlsAndCredentials",
            "gitOutput",
            "fileContentsAndDiffs",
            "commitBranchAndTagNames",
        ],
    })
    .map_err(|_| export_error())?;
    replace_file(destination, &bytes, export_error)?;
    Ok(ExportOutcome {
        message: "Diagnóstico exportado sin rutas, URLs, credenciales, salida Git ni contenido del repositorio.".into(),
        event_count: count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> PathBuf {
        std::env::temp_dir().join(format!(
            "ravengit-activity-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[test]
    fn persists_bounds_and_clears_only_current_activity() {
        let directory = fixture();
        let first = read(&directory).unwrap();
        record(
            &directory,
            Input {
                operation: Operation::Commit,
                status: Status::Confirmed,
            },
            Some("Proyecto".into()),
        )
        .unwrap();
        let current = record(
            &directory,
            Input {
                operation: Operation::Push,
                status: Status::Uncertain,
            },
            Some("Proyecto".into()),
        )
        .unwrap();
        let log = read(&directory).unwrap();
        assert_eq!(log.events.len(), 2);
        assert_eq!(log.events[0], current);
        assert_ne!(log.token, first.token);
        assert!(clear(&directory, &first.token, true).is_err());
        assert!(clear(&directory, &log.token, false).is_err());
        assert!(
            clear(&directory, &log.token, true)
                .unwrap()
                .events
                .is_empty()
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn export_redacts_repository_names_and_never_includes_paths_or_urls() {
        let directory = fixture();
        record(
            &directory,
            Input {
                operation: Operation::Fetch,
                status: Status::Error,
            },
            Some("cliente-secreto".into()),
        )
        .unwrap();
        let export_path = directory.join("diagnostico.json");
        export(&directory, &export_path).unwrap();
        let text = fs::read_to_string(&export_path).unwrap();
        assert!(text.contains("Repositorio 1"));
        assert!(!text.contains("cliente-secreto"));
        assert!(!text.contains("https://"));
        assert!(!text.contains(&directory.to_string_lossy().into_owned()));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn corrupt_or_unsafe_activity_never_gets_overwritten() {
        let directory = fixture();
        fs::create_dir_all(&directory).unwrap();
        let path = target(&directory);
        fs::write(&path, b"{broken").unwrap();
        assert!(
            record(
                &directory,
                Input {
                    operation: Operation::Commit,
                    status: Status::Confirmed,
                },
                None,
            )
            .is_err()
        );
        assert_eq!(fs::read(&path).unwrap(), b"{broken");
        fs::remove_dir_all(directory).unwrap();
    }
}
