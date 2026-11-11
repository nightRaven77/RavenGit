use crate::{
    branches,
    git::{self, GitError, Repository, Result},
    merge,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::Write, time::Duration};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    #[serde(skip)]
    config: Vec<u8>,
    pub token: String,
    pub branch: String,
    pub base: String,
    pub head_hash: String,
    pub base_hash: String,
    pub relation: &'static str,
    pub candidates: usize,
    pub commits: Vec<merge::Commit>,
    pub truncated: bool,
    pub contains_merges: bool,
    pub interactive: Option<crate::rebase_plan::Plan>,
}

// Local analysis. The IPC worker stores the returned plan for single-use execution.
pub fn preview(repo: &Repository, token: &str, base: &str, trusted: bool) -> Result<Preview> {
    if !trusted {
        return Err(GitError::new(
            "UNTRUSTED",
            "Autoriza el repositorio antes de revisar un rebase.",
        ));
    }
    merge::supported(repo)?;
    let comparison = merge::preview(repo, token, base, true)?;
    let range = format!(
        "{}..{}",
        comparison.source_hash, comparison.destination_hash
    );
    let log = git::text(
        &repo.path,
        &[
            "log",
            "--no-show-signature",
            "--topo-order",
            "--reverse",
            "--format=%H%x00%s",
            "--max-count=100",
            &range,
            "--",
        ],
    )?;
    let commits = log
        .lines()
        .map(|line| {
            let (hash, subject) = line.split_once('\0').ok_or_else(|| {
                GitError::new(
                    "REBASE_FORMAT",
                    "No se pudo interpretar un commit candidato.",
                )
            })?;
            Ok(merge::Commit {
                hash: hash.into(),
                subject: subject.into(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let merges = git::text(
        &repo.path,
        &["rev-list", "--merges", "--max-count=1", &range, "--"],
    )?;
    // An empty common ancestry is not presented as an ordinary rebase.
    git::text(
        &repo.path,
        &[
            "merge-base",
            &comparison.source_hash,
            &comparison.destination_hash,
        ],
    )?;
    if branches::read(repo, true)?.token != token {
        return Err(GitError::new(
            "STALE",
            "El repositorio cambió durante la revisión. Actualiza las ramas.",
        ));
    }
    Ok(Preview {
        config: git::run(&repo.path, &["config", "--includes", "--null", "--list"])?,
        token: token.into(),
        branch: comparison.destination,
        base: comparison.source,
        head_hash: comparison.destination_hash,
        base_hash: comparison.source_hash,
        relation: if comparison.incoming == 0 {
            "upToDate"
        } else if comparison.local == 0 {
            "fastForward"
        } else {
            "diverged"
        },
        candidates: comparison.local,
        truncated: comparison.local > commits.len(),
        contains_merges: !merges.trim().is_empty(),
        interactive: None,
        commits,
    })
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Edit {
    ClearRecord,
    Continue,
    Abort,
    Resolve { path: String },
}

#[derive(Serialize, Deserialize)]
pub(crate) struct Saved {
    branch: String,
    original: String,
    base: String,
    backup: String,
    #[serde(default)]
    pub(crate) interactive: Option<crate::rebase_plan::Plan>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub active: bool,
    pub token: String,
    pub branch: String,
    pub original: String,
    pub base: String,
    pub backup: Option<String>,
    pub conflicts: Vec<String>,
    pub can_continue: bool,
}
fn error(message: &str) -> GitError {
    GitError::new("REBASE_STATE", message)
}
fn metadata(repo: &Repository, name: &str) -> std::path::PathBuf {
    repo.path.join(".git").join(name)
}

// Publish a complete record without replacing an existing recovery record.
// A crash before publication leaves only an unreferenced temporary file; Git
// and the backup ref have not been changed at that point.
fn save_record(repo: &Repository, saved: &Saved) -> Result<()> {
    save_record_using(repo, saved, |file, bytes| {
        file.write_all(bytes).and_then(|_| file.sync_all())
    })
}

fn save_record_using(
    repo: &Repository,
    saved: &Saved,
    persist: impl FnOnce(&mut fs::File, &[u8]) -> std::io::Result<()>,
) -> Result<()> {
    let bytes = serde_json::to_vec(saved)
        .map_err(|_| error("No se pudo serializar el registro. No se inició rebase."))?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| error("Reloj no válido. No se inició rebase."))?
        .as_nanos();
    let temporary = metadata(
        repo,
        &format!("ravengit-rebase-{}-{nonce}.tmp", std::process::id()),
    );
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|_| error("No se pudo crear el registro temporal. No se inició rebase."))?;
    let written = persist(&mut file, &bytes);
    drop(file);
    if written.is_err() {
        let _ = fs::remove_file(&temporary);
        return Err(error(
            "No se pudo guardar el registro completo. No se inició rebase.",
        ));
    }
    // Both paths are in the same Git directory. hard_link creates the final
    // name exclusively, unlike rename which may replace it on some systems.
    let published = fs::hard_link(&temporary, metadata(repo, "ravengit-rebase.json"));
    let _ = fs::remove_file(&temporary);
    published.map_err(|_| {
        error(
            "Ya existe un registro o el sistema de archivos no permite publicarlo de forma segura. No se inició rebase; comprueba permisos y Git antes de repetir.",
        )
    })
}

fn saved(repo: &Repository) -> Result<Saved> {
    let path = metadata(repo, "ravengit-rebase.json");
    let meta = fs::symlink_metadata(&path)
        .map_err(|_| error("Este rebase no tiene registro de RavenGit. Recupéralo desde Git."))?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 512 * 1024 {
        return Err(error("Registro de rebase no válido."));
    }
    serde_json::from_slice(
        &fs::read(path).map_err(|_| error("No se pudo leer el registro de rebase."))?,
    )
    .map_err(|_| error("Registro de rebase no válido."))
}
fn command_with_timeout(
    repo: &Repository,
    args: &[&str],
    timeout: Duration,
) -> Result<crate::process::Output> {
    let mut cmd = crate::process::git(&repo.path);
    cmd.args([
        "-c",
        "submodule.recurse=false",
        "-c",
        "rebase.autoStash=false",
        "-c",
        "rebase.updateRefs=false",
        "-c",
        "rebase.instructionFormat=%s",
        "-c",
        "rebase.abbreviateCommands=false",
        "-c",
        "rebase.autoSquash=false",
        "-c",
        "rerere.enabled=false",
    ])
    .env("GIT_EDITOR", "true")
    .env("GIT_SEQUENCE_EDITOR", "false")
    .env("GIT_NO_REPLACE_OBJECTS", "1")
    .env("GCM_INTERACTIVE", "never");
    if metadata(repo, "ravengit-rebase.json").exists() {
        let saved = saved(repo)?;
        if saved.interactive.is_some() {
            cmd.args(["-c", "commit.cleanup=verbatim"]);
            let exe = std::env::current_exe()
                .map_err(|_| error("No se pudo localizar el editor interno."))?;
            #[cfg(test)]
            let exe = exe
                .parent()
                .and_then(|p| p.parent())
                .unwrap()
                .join(if cfg!(windows) {
                    "ravengit.exe"
                } else {
                    "ravengit"
                });
            let record = metadata(repo, "ravengit-rebase.json");
            let bytes = fs::read(&record).map_err(|_| error("Registro no disponible."))?;
            let digest = crate::rebase_plan::digest(&bytes);
            for (variable, mode) in [
                ("GIT_SEQUENCE_EDITOR", "sequence"),
                ("GIT_EDITOR", "message"),
            ] {
                cmd.env(
                    variable,
                    format!(
                        "{} --ravengit-rebase-editor {} {} {}",
                        crate::rebase_plan::shell_quote(&exe.to_string_lossy()),
                        mode,
                        crate::rebase_plan::shell_quote(&record.to_string_lossy()),
                        digest
                    ),
                );
            }
        }
    }
    cmd.args(args);
    crate::process::execute(cmd, None, timeout).map_err(|_| error("Resultado incierto. Actualiza y comprueba el rebase antes de repetir; no hay reintentos automáticos."))
}

fn command(repo: &Repository, args: &[&str]) -> Result<crate::process::Output> {
    command_with_timeout(repo, args, Duration::from_secs(60))
}

pub fn read(repo: &Repository, trusted: bool) -> Result<Option<State>> {
    if !trusted {
        return Ok(None);
    }
    if !metadata(repo, "rebase-merge").exists() {
        if metadata(repo, "ravengit-rebase.json").exists() {
            return orphan(repo).map(Some);
        }
        return Ok(None);
    }
    merge::supported_mode(repo, true)?;
    let saved = saved(repo)?;
    let mut digest = Sha256::new();
    for (name, expected) in [
        ("head-name", format!("refs/heads/{}", saved.branch)),
        ("orig-head", saved.original.clone()),
        ("onto", saved.base.clone()),
    ] {
        let value = fs::read(metadata(repo, &format!("rebase-merge/{name}")))
            .map_err(|_| error("Estado Git incompleto."))?;
        if std::str::from_utf8(&value).ok().map(str::trim) != Some(expected.as_str()) {
            return Err(error(
                "El registro y el estado Git no coinciden. Revisa desde Git.",
            ));
        }
        digest.update(value);
    }
    if !saved.backup.starts_with("refs/ravengit/rebase/")
        || git::text(&repo.path, &["rev-parse", "--verify", &saved.backup])?.trim()
            != saved.original
    {
        return Err(error("El respaldo original cambió. Revisa desde Git."));
    }
    let branch_ref = format!("refs/heads/{}", saved.branch);
    if git::text(&repo.path, &["rev-parse", "--verify", &branch_ref])?.trim() != saved.original {
        return Err(error(
            "La rama original cambió fuera del rebase. Revisa desde Git.",
        ));
    }
    let original_range = format!("{}..{}", saved.base, saved.original);
    let original_commits = git::text(&repo.path, &["rev-list", &original_range, "--"])?;
    if metadata(repo, "MERGE_HEAD").exists() {
        return Err(error("Hay otra integración activa. Revisa desde Git."));
    }
    for name in ["CHERRY_PICK_HEAD", "REBASE_HEAD"] {
        if metadata(repo, name).exists() {
            let value = fs::read_to_string(metadata(repo, name))
                .map_err(|_| error("Estado de commit no válido."))?;
            if !original_commits.lines().any(|hash| hash == value.trim()) {
                return Err(error("El commit detenido no pertenece al rango original."));
            }
            digest.update(value.as_bytes());
        }
    }
    for name in [
        "stopped-sha",
        "message",
        "author-script",
        "strategy",
        "strategy_opts",
        "msgnum",
        "end",
    ] {
        let path = metadata(repo, &format!("rebase-merge/{name}"));
        if path.exists() {
            if fs::metadata(&path)
                .map_err(|_| error("Estado no válido."))?
                .len()
                > 2 * 1024 * 1024
            {
                return Err(error("Estado de rebase demasiado grande."));
            }
            digest
                .update(fs::read(path).map_err(|_| error("No se pudo leer el estado de rebase."))?);
        }
    }
    if let Some(plan) = &saved.interactive {
        let original = preview_for_saved(repo, &saved)?;
        crate::rebase_plan::validate(&original, &plan.steps)?;
        let done = fs::read_to_string(metadata(repo, "rebase-merge/done"))
            .map_err(|_| error("Falta secuencia completada."))?;
        let pending = fs::read_to_string(metadata(repo, "rebase-merge/git-rebase-todo"))
            .map_err(|_| error("Falta secuencia pendiente."))?;
        crate::rebase_plan::check_sequence(plan, &done, &pending)?;
    }
    // Linear rebases still reject every instruction other than pick.
    for name in ["git-rebase-todo", "done"] {
        let bytes = fs::read(metadata(repo, &format!("rebase-merge/{name}")))
            .map_err(|_| error("No se pudo leer la secuencia del rebase."))?;
        let text = std::str::from_utf8(&bytes).map_err(|_| error("Secuencia no válida."))?;
        if text
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
            .any(|line| {
                let mut fields = line.split_whitespace();
                let action = fields.next();
                if saved.interactive.is_none() && action != Some("pick") {
                    return true;
                }
                if !matches!(
                    action,
                    Some("pick" | "reword" | "squash" | "fixup" | "drop")
                ) {
                    return true;
                }
                let Some(hash) = fields.next() else {
                    return true;
                };
                hash.len() < 7
                    || !hash.bytes().all(|b| b.is_ascii_hexdigit())
                    || original_commits
                        .lines()
                        .filter(|original| original.starts_with(hash))
                        .count()
                        != 1
            })
        {
            return Err(error(
                "La secuencia contiene instrucciones no admitidas. Continúa desde Git.",
            ));
        }
        digest.update(bytes);
    }
    for name in ["autostash", "rebase-merges", "update-refs"] {
        if metadata(repo, &format!("rebase-merge/{name}")).exists() {
            return Err(error(
                "Este rebase usa opciones avanzadas. Recupéralo desde Git.",
            ));
        }
    }
    let changes = crate::changes::read(repo, true)?;
    if changes.branch.is_some() {
        return Err(error(
            "HEAD dejó de estar separado durante el rebase. Revisa desde Git.",
        ));
    }
    digest.update(changes.token.as_bytes());
    digest.update(serde_json::to_vec(&saved).map_err(|_| error("Registro no válido."))?);
    let conflicts = changes
        .entries
        .iter()
        .filter(|entry| entry.conflict)
        .map(|entry| entry.path.clone())
        .collect::<Vec<_>>();
    let can_continue = conflicts.is_empty()
        && changes
            .entries
            .iter()
            .all(|entry| !entry.untracked && entry.worktree_status == ' ')
        && changes.author.is_some();
    Ok(Some(State {
        active: true,
        token: format!("{:x}", digest.finalize()),
        branch: saved.branch,
        original: saved.original,
        base: saved.base,
        backup: Some(saved.backup),
        conflicts,
        can_continue,
    }))
}

// Only acknowledge a rejected/non-started operation when the original branch is intact.
fn orphan(repo: &Repository) -> Result<State> {
    merge::supported(repo)?;
    let saved = saved(repo)?;
    let branches = branches::read(repo, true)?;
    if branches.restriction.is_some()
        || branches.current.as_deref() != Some(saved.branch.as_str())
        || branches.head.as_deref() != Some(saved.original.as_str())
        || metadata(repo, "MERGE_HEAD").exists()
    {
        return Err(error(
            "El registro no tiene un inicio rechazado verificable. Comprueba el resultado y el respaldo desde Git.",
        ));
    }
    if !saved.backup.starts_with("refs/ravengit/rebase/") {
        return Err(error(
            "No se confirmó el respaldo. Conserva el registro y comprueba Git.",
        ));
    }
    let backup = command(repo, &["rev-parse", "--verify", &saved.backup])?;
    let backup = if backup.success {
        let oid = String::from_utf8(backup.bytes)
            .map_err(|_| error("No se pudo verificar el respaldo."))?;
        if oid.trim() != saved.original {
            return Err(error(
                "El respaldo no coincide con el commit original. Conserva el registro y comprueba Git.",
            ));
        }
        Some(saved.backup.clone())
    } else {
        None
    };
    let mut digest = Sha256::new();
    digest.update(branches.token.as_bytes());
    digest.update(serde_json::to_vec(&saved).map_err(|_| error("Registro no válido."))?);
    Ok(State {
        active: false,
        token: format!("{:x}", digest.finalize()),
        branch: saved.branch,
        original: saved.original,
        base: saved.base,
        backup,
        conflicts: vec![],
        can_continue: false,
    })
}

fn finish(
    repo: &Repository,
    output: crate::process::Output,
    saved: &Saved,
    abort: bool,
) -> Result<merge::Outcome> {
    if metadata(repo, "rebase-merge").exists() {
        read(repo, true)?;
        return Ok(merge::Outcome { message: "Rebase detenido. Revisa conflictos o commits vacíos antes de continuar; puedes abortar.".into(), warning: None });
    }
    let current = git::text(&repo.path, &["symbolic-ref", "--quiet", "HEAD"])?;
    let head = git::text(&repo.path, &["rev-parse", "HEAD"])?;
    let confirmed = if abort {
        head.trim() == saved.original
    } else {
        command(
            repo,
            &["merge-base", "--is-ancestor", &saved.base, head.trim()],
        )?
        .success
    };
    if !output.success || current.trim() != format!("refs/heads/{}", saved.branch) || !confirmed {
        return Err(error(
            "No se confirmó el resultado del rebase. Comprueba Git y el respaldo antes de repetir.",
        ));
    }
    fs::remove_file(metadata(repo, "ravengit-rebase.json")).map_err(|_| error("Operación completada, pero no se pudo retirar el registro. Revisa desde Git; no repitas el rebase."))?;
    Ok(merge::Outcome {
        message: if abort {
            "Rebase abortado; rama original restaurada."
        } else {
            "Rebase completado y rama confirmada."
        }
        .into(),
        warning: Some(format!("Respaldo conservado en {}.", saved.backup)),
    })
}

pub fn start(repo: &Repository, plan: Preview, trusted: bool) -> Result<merge::Outcome> {
    start_with_timeout(repo, plan, trusted, Duration::from_secs(60))
}

fn start_with_timeout(
    repo: &Repository,
    plan: Preview,
    trusted: bool,
    timeout: Duration,
) -> Result<merge::Outcome> {
    let fresh = preview(repo, &plan.token, &plan.base, trusted)?;
    if fresh.head_hash != plan.head_hash
        || fresh.config != plan.config
        || fresh.base_hash != plan.base_hash
        || fresh.branch != plan.branch
        || fresh.contains_merges
        || (fresh.relation == "upToDate" && plan.interactive.is_none())
    {
        return Err(error(
            "La revisión cambió, contiene merges o no requiere rebase. Revisa de nuevo.",
        ));
    }
    if let Some(interactive) = &plan.interactive {
        crate::rebase_plan::validate(&fresh, &interactive.steps)?;
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
            "Aparta los archivos ignorados antes del rebase; podrían ser sobrescritos al cambiar de base.",
        ));
    }
    let backup = format!(
        "refs/ravengit/rebase/{}-{}",
        plan.head_hash,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| error("Reloj no válido."))?
            .as_nanos()
    );
    let saved = Saved {
        branch: plan.branch,
        original: plan.head_hash,
        base: plan.base_hash,
        backup,
        interactive: plan.interactive,
    };
    save_record(repo, &saved)?;
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
        return Err(error("No se confirmó el respaldo. No se inició rebase."));
    }
    // Preserve empty commits; stop instead of silently dropping newly empty ones.
    let mut args = vec!["rebase"];
    if saved.interactive.is_some() {
        args.extend(["--interactive", "--force-rebase"]);
    }
    args.extend([
        "--merge",
        "--no-autostash",
        "--no-update-refs",
        "--no-rebase-merges",
        "--no-fork-point",
        "--reapply-cherry-picks",
        "--keep-empty",
        "--empty=stop",
        "--strategy=ort",
        "--onto",
        &saved.base,
        &saved.base,
    ]);
    let output = command_with_timeout(repo, &args, timeout)?;
    finish(repo, output, &saved, false)
}

#[cfg(all(test, any(unix, windows)))]
pub(crate) fn start_with_timeout_for_test(
    repo: &Repository,
    plan: Preview,
    trusted: bool,
    timeout: Duration,
) -> Result<merge::Outcome> {
    start_with_timeout(repo, plan, trusted, timeout)
}

pub fn edit(repo: &Repository, token: &str, edit: Edit, trusted: bool) -> Result<merge::Outcome> {
    if !trusted {
        return Err(GitError::new(
            "UNTRUSTED",
            "Autoriza el repositorio antes de recuperar un rebase.",
        ));
    }
    let state = read(repo, true)?.ok_or_else(|| error("No hay rebase activo."))?;
    if state.token != token {
        return Err(GitError::new(
            "STALE",
            "El rebase cambió. Actualiza antes de continuar.",
        ));
    }
    let saved = saved(repo)?;
    if !state.active {
        if !matches!(edit, Edit::ClearRecord) {
            return Err(error("No hay rebase activo para continuar o abortar."));
        }
        fs::remove_file(metadata(repo, "ravengit-rebase.json"))
            .map_err(|_| error("No se pudo retirar el registro. Actualiza antes de repetir."))?;
        return Ok(merge::Outcome {
            message: "Registro de inicio rechazado retirado; rama y archivos intactos.".into(),
            warning: state
                .backup
                .map(|backup| format!("Respaldo conservado en {backup}.")),
        });
    }
    if matches!(edit, Edit::ClearRecord) {
        return Err(error(
            "No se puede retirar el registro de un rebase activo.",
        ));
    }
    if let Edit::Resolve { path } = edit {
        if !state.conflicts.contains(&path) {
            return Err(error("Selecciona un archivo en conflicto."));
        }
        let full = crate::changes::validated_path(repo, &path)?;
        match fs::symlink_metadata(&full) {
            Ok(meta)
                if meta.is_file()
                    && !meta.file_type().is_symlink()
                    && meta.len() <= 2 * 1024 * 1024 =>
            {
                let bytes = fs::read(&full).map_err(|_| error("No se pudo leer el archivo."))?;
                let text = std::str::from_utf8(&bytes)
                    .map_err(|_| error("Resuelve binarios desde Git."))?;
                if bytes.contains(&0)
                    || text.lines().any(|line| {
                        ["<<<<<<<", "=======", ">>>>>>>", "|||||||"]
                            .iter()
                            .any(|marker| line.starts_with(marker))
                    })
                {
                    return Err(error(
                        "Elimina los marcadores de conflicto antes de preparar la resolución.",
                    ));
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            _ => {
                return Err(error(
                    "Sólo texto de hasta 2 MiB o eliminaciones; resuelve los casos avanzados desde Git.",
                ));
            }
        }
        if read(repo, true)?.is_none_or(|s| s.token != token) {
            return Err(error("El archivo cambió. Actualiza."));
        }
        if !command(repo, &["add", "--", &path])?.success
            || read(repo, true)?.is_none_or(|s| s.conflicts.contains(&path))
        {
            return Err(error("No se confirmó la resolución. Actualiza."));
        }
        return Ok(merge::Outcome {
            message: format!("Resolución preparada: {path}."),
            warning: None,
        });
    }
    let abort = matches!(edit, Edit::Abort);
    if !abort && !state.can_continue {
        return Err(error(
            "Resuelve los conflictos, prepara los cambios y configura tu autor antes de continuar.",
        ));
    }
    let output = command(
        repo,
        &["rebase", if abort { "--abort" } else { "--continue" }],
    )?;
    finish(repo, output, &saved, abort)
}

fn preview_for_saved(repo: &Repository, saved: &Saved) -> Result<Preview> {
    let range = format!("{}..{}", saved.base, saved.original);
    let log = git::text(
        &repo.path,
        &[
            "log",
            "--no-show-signature",
            "--reverse",
            "--topo-order",
            "--format=%H%x00%s",
            "--max-count=51",
            &range,
            "--",
        ],
    )?;
    let commits = log
        .lines()
        .map(|line| {
            let (hash, subject) = line
                .split_once('\0')
                .ok_or_else(|| error("Commit original no válido."))?;
            Ok(merge::Commit {
                hash: hash.into(),
                subject: subject.into(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(Preview {
        config: vec![],
        token: String::new(),
        branch: saved.branch.clone(),
        base: saved.base.clone(),
        head_hash: saved.original.clone(),
        base_hash: saved.base.clone(),
        relation: "diverged",
        candidates: commits.len(),
        commits,
        truncated: false,
        contains_merges: !git::text(&repo.path, &["rev-list", "--merges", &range, "--"])?
            .trim()
            .is_empty(),
        interactive: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    struct RecordFixture(Repository);

    impl RecordFixture {
        fn new() -> Self {
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "ravengit-record-{}-{nonce}-{}",
                std::process::id(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            fs::create_dir(path.join(".git")).unwrap();
            Self(Repository {
                id: "record-test".into(),
                path,
            })
        }

        fn record(&self) -> Saved {
            Saved {
                branch: "prueba ü".into(),
                original: "a".repeat(40),
                base: "b".repeat(40),
                backup: "refs/ravengit/rebase/test".into(),
                interactive: None,
            }
        }

        fn entries(&self) -> Vec<String> {
            fs::read_dir(self.0.path.join(".git"))
                .unwrap()
                .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
                .collect()
        }
    }

    impl Drop for RecordFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0.path);
        }
    }

    #[test]
    fn publishes_complete_record_and_removes_temporary() {
        let fixture = RecordFixture::new();
        let record = fixture.record();
        save_record(&fixture.0, &record).unwrap();
        assert_eq!(
            fs::read(metadata(&fixture.0, "ravengit-rebase.json")).unwrap(),
            serde_json::to_vec(&record).unwrap()
        );
        let recovered = saved(&fixture.0).unwrap();
        assert_eq!(recovered.branch, record.branch);
        assert_eq!(recovered.original, record.original);
        assert_eq!(fixture.entries(), vec!["ravengit-rebase.json"]);
    }

    #[test]
    fn publication_preserves_existing_record_even_when_invalid() {
        let fixture = RecordFixture::new();
        let path = metadata(&fixture.0, "ravengit-rebase.json");
        for previous in [b"{incomplete".as_slice(), b"previous recovery record"] {
            fs::write(&path, previous).unwrap();
            assert!(save_record(&fixture.0, &fixture.record()).is_err());
            assert_eq!(fs::read(&path).unwrap(), previous);
            assert_eq!(fixture.entries(), vec!["ravengit-rebase.json"]);
        }
    }

    #[test]
    fn publication_failure_preserves_destination_directory() {
        let fixture = RecordFixture::new();
        let path = metadata(&fixture.0, "ravengit-rebase.json");
        fs::create_dir(&path).unwrap();
        fs::write(path.join("sentinel"), b"preserve").unwrap();
        assert!(save_record(&fixture.0, &fixture.record()).is_err());
        assert_eq!(fs::read(path.join("sentinel")).unwrap(), b"preserve");
        assert_eq!(fixture.entries(), vec!["ravengit-rebase.json"]);
    }

    #[test]
    fn missing_git_directory_does_not_create_final_record() {
        let fixture = RecordFixture::new();
        fs::remove_dir(fixture.0.path.join(".git")).unwrap();
        assert!(save_record(&fixture.0, &fixture.record()).is_err());
        assert_eq!(fs::read_dir(&fixture.0.path).unwrap().count(), 0);
    }

    #[test]
    fn storage_write_or_sync_failure_never_publishes_or_replaces_record() {
        for existing in [false, true] {
            for partial in [false, true] {
                let fixture = RecordFixture::new();
                let path = metadata(&fixture.0, "ravengit-rebase.json");
                if existing {
                    fs::write(&path, b"prior durable record").unwrap();
                }
                let failure = save_record_using(&fixture.0, &fixture.record(), |file, bytes| {
                    // Model a partial write (e.g. storage full), or a failed
                    // sync after all bytes were written. No disk is filled.
                    file.write_all(if partial {
                        &bytes[..bytes.len() / 2]
                    } else {
                        bytes
                    })?;
                    Err(std::io::Error::other("simulated storage failure"))
                })
                .expect_err("storage error must stop publication");
                assert_eq!(failure.code, "REBASE_STATE");
                assert!(failure.message.contains("No se inició rebase"));
                if existing {
                    assert_eq!(fs::read(path).unwrap(), b"prior durable record");
                    assert_eq!(fixture.entries(), vec!["ravengit-rebase.json"]);
                } else {
                    assert!(fixture.entries().is_empty());
                }
            }
        }
    }

    #[cfg(windows)]
    #[test]
    fn sharing_denial_preserves_unreadable_record() {
        use std::os::windows::fs::OpenOptionsExt;
        let fixture = RecordFixture::new();
        save_record(&fixture.0, &fixture.record()).unwrap();
        let path = metadata(&fixture.0, "ravengit-rebase.json");
        let original = fs::read(&path).unwrap();
        let handle = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        assert!(saved(&fixture.0).is_err());
        assert!(save_record(&fixture.0, &fixture.record()).is_err());
        drop(handle);
        assert_eq!(fs::read(path).unwrap(), original);
        assert_eq!(fixture.entries(), vec!["ravengit-rebase.json"]);
    }

    #[test]
    fn untrusted_never_inspects_repository() {
        let repo = Repository {
            id: "fixture".into(),
            path: "nonexistent-rebase-fixture".into(),
        };
        assert_eq!(
            preview(&repo, "", "main", false).unwrap_err().code,
            "UNTRUSTED"
        );
    }
}
