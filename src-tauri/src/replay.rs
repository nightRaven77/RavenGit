use crate::{
    branches, changes,
    git::{self, GitError, Repository, Result},
    merge, process,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::Write, time::Duration};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    CherryPick,
    Revert,
}
impl Kind {
    fn command(self) -> &'static str {
        match self {
            Self::CherryPick => "cherry-pick",
            Self::Revert => "revert",
        }
    }
    fn marker(self) -> &'static str {
        match self {
            Self::CherryPick => "CHERRY_PICK_HEAD",
            Self::Revert => "REVERT_HEAD",
        }
    }
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub token: String,
    pub kind: Kind,
    pub commit: String,
    pub subject: String,
    pub branch: String,
    pub head: String,
    pub patch: String,
}
#[derive(Serialize, Deserialize)]
struct Saved {
    kind: Kind,
    commit: String,
    branch: String,
    original: String,
    backup: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recovery {
    pub token: String,
    pub kind: Kind,
    pub commit: String,
    pub branch: String,
    pub original: String,
    pub backup: String,
    pub status: &'static str,
    pub conflicts: Vec<String>,
    pub can_continue: bool,
    pub can_clear: bool,
}
#[derive(Debug, Serialize)]
pub struct Options {
    pub trusted: bool,
    pub branch: Option<String>,
    pub restriction: Option<String>,
    pub recovery: Option<Recovery>,
}
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Action {
    Continue,
    Abort,
    ClearRecord,
    Resolve { path: String },
}
fn error(message: &str) -> GitError {
    GitError::new("REPLAY", message)
}
fn path(repo: &Repository, name: &str) -> std::path::PathBuf {
    repo.path.join(".git").join(name)
}
fn bytes(repo: &Repository, name: &str) -> Result<Vec<u8>> {
    let p = path(repo, name);
    match fs::symlink_metadata(&p) {
        Ok(m) if m.is_file() && !m.file_type().is_symlink() && m.len() <= 2 * 1024 * 1024 => {
            fs::read(p).map_err(|_| error("No se pudo leer el registro Git."))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        _ => Err(error("Registro Git no compatible o demasiado grande.")),
    }
}
fn saved(repo: &Repository) -> Result<Saved> {
    serde_json::from_slice(&bytes(repo, "ravengit-replay.json")?)
        .map_err(|_| error("El registro no es válido. Conserva los archivos y comprueba Git."))
}
fn command(repo: &Repository, args: &[&str]) -> Result<process::Output> {
    let mut cmd = process::git(&repo.path);
    cmd.args([
        "-c",
        "submodule.recurse=false",
        "-c",
        "rerere.enabled=false",
        "-c",
        "rerere.autoupdate=false",
    ])
    .args(args)
    .env("GIT_EDITOR", "true")
    .env("GIT_NO_REPLACE_OBJECTS", "1");
    process::execute(cmd, None, Duration::from_secs(60)).map_err(|_| {
        error("Resultado incierto. Actualiza y comprueba la operación antes de repetir.")
    })
}
pub fn options(repo: &Repository, trusted: bool) -> Result<Options> {
    if !trusted {
        return Ok(Options {
            trusted: false,
            branch: None,
            restriction: None,
            recovery: None,
        });
    }
    let state = branches::read(repo, true)?;
    let recovery = if path(repo, "ravengit-replay.json").exists() {
        Some(read(repo)?)
    } else {
        None
    };
    Ok(Options {
        trusted: true,
        branch: state.current,
        restriction: state.restriction,
        recovery,
    })
}
pub fn preview(repo: &Repository, kind: Kind, commit: &str, trusted: bool) -> Result<Plan> {
    if !trusted {
        return Err(GitError::new(
            "UNTRUSTED",
            "Autoriza el repositorio antes de revisar esta operación.",
        ));
    }
    if !matches!(commit.len(), 40 | 64) || !commit.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(error(
            "Selecciona un hash completo de commit; no se aceptan opciones ni rangos.",
        ));
    }
    merge::supported(repo)?;
    let normalized = commit.to_ascii_lowercase();
    let commit = normalized.as_str();
    if path(repo, "ravengit-replay.json").exists() || path(repo, "ravengit-rebase.json").exists() {
        return Err(error(
            "Hay un registro pendiente. Recupéralo antes de iniciar otra operación.",
        ));
    }
    let state = branches::read(repo, true)?;
    if let Some(reason) = state.restriction {
        return Err(error(&reason));
    }
    if changes::read(repo, true)?.author.is_none() {
        return Err(error(
            "Configura user.name y user.email en Git antes de crear un commit con esta operación.",
        ));
    }
    let branch = state
        .current
        .ok_or_else(|| error("Cambia a una rama local antes de continuar."))?;
    let head = state
        .head
        .ok_or_else(|| error("Crea el primer commit antes de continuar."))?;
    if git::text(&repo.path, &["cat-file", "-t", commit])?.trim() != "commit" {
        return Err(error("El objeto seleccionado no es un commit."));
    }
    let parents = git::text(
        &repo.path,
        &["rev-list", "--parents", "-n", "1", commit, "--"],
    )?;
    if parents.split_whitespace().count() > 2 {
        return Err(error(
            "Los commits de merge requieren elegir un padre principal; este flujo todavía no los admite.",
        ));
    }
    let subject = git::text(&repo.path, &["log", "-1", "--format=%s", commit, "--"])?;
    let direction = if kind == Kind::Revert {
        "-R"
    } else {
        "--no-renames"
    };
    let patch = git::text(
        &repo.path,
        &[
            "show",
            "--format=",
            "--no-show-signature",
            "--no-ext-diff",
            "--no-textconv",
            direction,
            commit,
            "--",
        ],
    )?;
    let config = git::run(&repo.path, &["config", "--includes", "--null", "--list"])?;
    if branches::read(repo, true)?.token != state.token {
        return Err(error(
            "El repositorio cambió durante la revisión. Actualiza.",
        ));
    }
    let mut hash = Sha256::new();
    hash.update(state.token.as_bytes());
    hash.update(config);
    hash.update(commit.as_bytes());
    hash.update(kind.command().as_bytes());
    Ok(Plan {
        token: format!("{:x}", hash.finalize()),
        kind,
        commit: commit.into(),
        subject: subject.trim_end().into(),
        branch,
        head,
        patch,
    })
}
fn read(repo: &Repository) -> Result<Recovery> {
    merge::supported_replay(repo)?;
    if path(repo, "MERGE_HEAD").exists() || path(repo, "ravengit-rebase.json").exists() {
        return Err(error("Hay otra operación o registro. Comprueba Git."));
    }
    let saved = saved(repo)?;
    if !saved.backup.starts_with("refs/ravengit/replay/")
        || git::text(&repo.path, &["rev-parse", "--verify", &saved.backup])?.trim()
            != saved.original
    {
        return Err(error("No se confirmó el respaldo original. Comprueba Git."));
    }
    let state = changes::read(repo, true)?;
    if state.branch.as_deref() != Some(saved.branch.as_str()) {
        return Err(error(
            "La rama activa cambió. Comprueba Git antes de recuperar la operación.",
        ));
    }
    let marker = bytes(repo, saved.kind.marker())?;
    let other = if saved.kind == Kind::CherryPick {
        "REVERT_HEAD"
    } else {
        "CHERRY_PICK_HEAD"
    };
    if !bytes(repo, other)?.is_empty() {
        return Err(error(
            "El estado Git contiene otra operación. Comprueba Git.",
        ));
    }
    let active = !marker.is_empty();
    let status = if active {
        if std::str::from_utf8(&marker).ok().map(str::trim) != Some(saved.commit.as_str())
            || state.head.as_deref() != Some(saved.original.as_str())
        {
            return Err(error("El commit pendiente o HEAD cambió. Comprueba Git."));
        }
        "active"
    } else if state.head.as_deref() == Some(saved.original.as_str()) {
        "unchanged"
    } else {
        let parents = git::text(
            &repo.path,
            &["rev-list", "--parents", "-n", "1", "HEAD", "--"],
        )?;
        let parents = parents.split_whitespace().collect::<Vec<_>>();
        if parents.len() != 2 || parents[1] != saved.original {
            return Err(error(
                "El resultado no tiene el padre original esperado. Comprueba Git.",
            ));
        }
        "completed"
    };
    let mut hash = Sha256::new();
    hash.update(state.token.as_bytes());
    hash.update(serde_json::to_vec(&saved).map_err(|_| error("Registro no válido."))?);
    hash.update(marker);
    hash.update(bytes(repo, "MERGE_MSG")?);
    hash.update(git::run(
        &repo.path,
        &["config", "--includes", "--null", "--list"],
    )?);
    let conflicts = state
        .entries
        .iter()
        .filter(|e| e.conflict)
        .map(|e| e.path.clone())
        .collect::<Vec<_>>();
    let can_continue = active
        && conflicts.is_empty()
        && state
            .entries
            .iter()
            .all(|e| !e.untracked && e.worktree_status == ' ')
        && state.author.is_some();
    Ok(Recovery {
        token: format!("{:x}", hash.finalize()),
        kind: saved.kind,
        commit: saved.commit,
        branch: saved.branch,
        original: saved.original,
        backup: saved.backup,
        status,
        conflicts,
        can_continue,
        can_clear: !active && state.entries.is_empty(),
    })
}
fn finish(repo: &Repository, output: process::Output, abort: bool) -> Result<merge::Outcome> {
    let state = read(repo)?;
    if state.status == "active" {
        if abort {
            return Err(error(
                "Git no confirmó el aborto. Conserva los archivos y comprueba el estado antes de repetir.",
            ));
        }
        return Ok(merge::Outcome { message: "Operación detenida. Revisa conflictos, hooks o un resultado vacío antes de continuar o abortar.".into(), warning: None });
    }
    let expected = if abort { "unchanged" } else { "completed" };
    if !output.success || state.status != expected {
        return Err(error(
            "No se confirmó el resultado. Revisa el registro y Git antes de repetir.",
        ));
    }
    fs::remove_file(path(repo, "ravengit-replay.json")).map_err(|_| {
        error("El resultado existe, pero no se pudo retirar el registro. No repitas la operación.")
    })?;
    Ok(merge::Outcome {
        message: if abort {
            "Operación abortada; commit original restaurado."
        } else {
            "Nuevo commit confirmado; historial previo conservado."
        }
        .into(),
        warning: Some(format!(
            "Respaldo conservado en {}. Revisa los efectos de hooks y firma.",
            state.backup
        )),
    })
}
pub fn start(repo: &Repository, plan: Plan, trusted: bool) -> Result<merge::Outcome> {
    let fresh = preview(repo, plan.kind, &plan.commit, trusted)?;
    if fresh.token != plan.token {
        return Err(error("La revisión cambió. Revisa de nuevo."));
    }
    if !git::run(
        &repo.path,
        &[
            "ls-files",
            "--others",
            "--ignored",
            "--exclude-standard",
            "-z",
        ],
    )?
    .is_empty()
    {
        return Err(error(
            "Aparta los archivos ignorados antes de iniciar; este flujo no arriesga sobrescribirlos.",
        ));
    }
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| error("Reloj no válido."))?
        .as_nanos();
    let saved = Saved {
        kind: plan.kind,
        commit: plan.commit,
        branch: plan.branch,
        original: plan.head.clone(),
        backup: format!("refs/ravengit/replay/{}-{nonce}", plan.head),
    };
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path(repo, "ravengit-replay.json"))
        .map_err(|_| {
            error("No se pudo crear el registro. Comprueba si hay una operación pendiente.")
        })?;
    file.write_all(
        &serde_json::to_vec(&saved).map_err(|_| error("No se pudo guardar el registro."))?,
    )
    .and_then(|_| file.sync_all())
    .map_err(|_| error("No se pudo guardar el registro."))?;
    if !command(
        repo,
        &[
            "update-ref",
            &saved.backup,
            &saved.original,
            &"0".repeat(saved.original.len()),
        ],
    )?
    .success
    {
        return Err(error(
            "No se confirmó el respaldo. No se inició la operación.",
        ));
    }
    let result = command(
        repo,
        &[
            saved.kind.command(),
            "--no-edit",
            "--no-rerere-autoupdate",
            "--strategy=ort",
            &saved.commit,
        ],
    )?;
    finish(repo, result, false)
}
pub fn edit(
    repo: &Repository,
    token: &str,
    action: Action,
    trusted: bool,
) -> Result<merge::Outcome> {
    if !trusted {
        return Err(GitError::new(
            "UNTRUSTED",
            "Autoriza antes de recuperar la operación.",
        ));
    }
    let state = read(repo)?;
    if token != state.token {
        return Err(error("La operación cambió. Actualiza antes de continuar."));
    }
    if matches!(action, Action::ClearRecord) {
        if !state.can_clear {
            return Err(error(
                "Sólo se retira un registro sin operación activa y con árbol limpio.",
            ));
        }
        fs::remove_file(path(repo, "ravengit-replay.json"))
            .map_err(|_| error("No se pudo retirar el registro."))?;
        return Ok(merge::Outcome {
            message: "Registro retirado; archivos e historial conservados.".into(),
            warning: Some(format!("Respaldo conservado en {}.", state.backup)),
        });
    }
    if state.status != "active" {
        return Err(error(
            "No hay operación activa. Revisa el resultado antes de retirar su registro.",
        ));
    }
    if let Action::Resolve { path: selected } = action {
        if !state.conflicts.contains(&selected) {
            return Err(error("Selecciona un archivo en conflicto."));
        }
        let full = changes::validated_path(repo, &selected)?;
        match fs::symlink_metadata(&full) {
            Ok(m) if m.is_file() && !m.file_type().is_symlink() && m.len() <= 2 * 1024 * 1024 => {
                let bytes = fs::read(full).map_err(|_| error("No se pudo leer el archivo."))?;
                let text = std::str::from_utf8(&bytes)
                    .map_err(|_| error("Resuelve binarios desde Git."))?;
                if bytes.contains(&0)
                    || text.lines().any(|line| {
                        ["<<<<<<<", "=======", ">>>>>>>", "|||||||"]
                            .iter()
                            .any(|m| line.starts_with(m))
                    })
                {
                    return Err(error(
                        "Elimina los marcadores antes de preparar la resolución.",
                    ));
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            _ => {
                return Err(error(
                    "Sólo texto de hasta 2 MiB o eliminaciones; resuelve otros casos desde Git.",
                ));
            }
        }
        if read(repo)?.token != token {
            return Err(error("El archivo cambió. Actualiza."));
        }
        if !command(repo, &["add", "--", &selected])?.success
            || read(repo)?.conflicts.contains(&selected)
        {
            return Err(error("No se confirmó la resolución. Actualiza."));
        }
        return Ok(merge::Outcome {
            message: format!("Resolución preparada: {selected}."),
            warning: None,
        });
    }
    let abort = matches!(action, Action::Abort);
    if !abort && !state.can_continue {
        return Err(error(
            "Resuelve y prepara los cambios, sin archivos nuevos ni cambios sin preparar, antes de continuar.",
        ));
    }
    let result = command(
        repo,
        &[
            state.kind.command(),
            if abort { "--abort" } else { "--continue" },
        ],
    )?;
    finish(repo, result, abort)
}
