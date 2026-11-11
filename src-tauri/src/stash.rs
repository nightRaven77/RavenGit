use crate::{
    changes,
    git::{self, GitError, Repository, Result},
    merge, process,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    time::Duration,
};

const RECORD: &str = "ravengit-stash.json";
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Action {
    Save { message: String, untracked: bool },
    Apply { hash: String, index: bool },
}
#[derive(Debug, Clone, Serialize)]
pub struct Entry {
    pub hash: String,
    pub label: String,
    pub subject: String,
}
#[derive(Debug, Clone, Serialize)]
pub struct Plan {
    pub token: String,
    pub action: Action,
    pub head: String,
    pub branch: String,
    pub files: Vec<String>,
    pub patch: String,
}
#[derive(Serialize, Deserialize)]
struct Saved {
    action: Action,
    head: String,
    branch: String,
    previous: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recovery {
    pub token: String,
    pub action: Action,
    pub head: String,
    pub branch: String,
    pub conflicts: Vec<String>,
    pub can_finish: bool,
}
#[derive(Debug, Serialize)]
pub struct Options {
    pub trusted: bool,
    pub entries: Vec<Entry>,
    pub recovery: Option<Recovery>,
}
fn encode(value: &(impl Serialize + ?Sized)) -> Result<Vec<u8>> {
    serde_json::to_vec(value).map_err(|_| error("No se pudo serializar la revisión de stash."))
}
fn error(message: &str) -> GitError {
    GitError::new("STASH", message)
}
fn marker(repo: &Repository) -> std::path::PathBuf {
    repo.path.join(".git").join(RECORD)
}
fn exists(repo: &Repository, name: &str) -> bool {
    fs::symlink_metadata(repo.path.join(".git").join(name)).is_ok()
}
fn hash(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn command(repo: &Repository, args: &[&str]) -> Result<process::Output> {
    let mut cmd = process::git(&repo.path);
    // No user pathspecs are accepted here. Git stash internally passes quoted filenames
    // to clean; forcing literal pathspecs leaves non-ASCII untracked files behind.
    cmd.env_remove("GIT_LITERAL_PATHSPECS");
    cmd.args([
        "--no-replace-objects",
        "-c",
        "submodule.recurse=false",
        "-c",
        "stash.index=false",
        "-c",
        "rerere.enabled=false",
        "-c",
        "rerere.autoupdate=false",
    ])
    .args(args)
    .env("GIT_EDITOR", "true");
    process::execute(cmd, None, Duration::from_secs(60)).map_err(|_| error("Resultado incierto. Actualiza Stash y revisa el registro antes de repetir; no se borran archivos ni stashes."))
}
fn list(repo: &Repository) -> Result<Vec<Entry>> {
    // NUL separates fields; subjects may contain tabs but Git subjects cannot contain NUL/newlines.
    let raw = git::text(&repo.path, &["stash", "list", "--format=%H%x00%gd%x00%s"])?;
    raw.lines()
        .map(|line| {
            let mut fields = line.splitn(3, '\0');
            let oid = fields.next().unwrap_or("");
            let label = fields
                .next()
                .ok_or_else(|| error("Lista de stash no compatible."))?;
            let subject = fields
                .next()
                .ok_or_else(|| error("Lista de stash no compatible."))?;
            if !hash(oid) {
                return Err(error("Hash de stash no válido."));
            }
            Ok(Entry {
                hash: oid.into(),
                label: label.into(),
                subject: subject.into(),
            })
        })
        .collect()
}
fn supported(repo: &Repository, recovering: bool) -> Result<changes::Changes> {
    if !fs::symlink_metadata(repo.path.join(".git"))
        .is_ok_and(|m| m.is_dir() && !m.file_type().is_symlink())
    {
        return Err(error("Stash requiere un directorio .git local."));
    }
    merge::supported(repo)?;
    for name in [
        "MERGE_HEAD",
        "ravengit-rebase.json",
        "ravengit-replay.json",
        "refs/stash.lock",
        "logs/refs/stash.lock",
    ] {
        if exists(repo, name) {
            return Err(error(
                "Termina la operación Git o revisa sus locks antes de usar Stash.",
            ));
        }
    }
    if !recovering && exists(repo, RECORD) {
        return Err(error(
            "Hay un stash pendiente de revisión. Abre su recuperación antes de continuar.",
        ));
    }
    let state = changes::read(repo, true)?;
    if state.operation.is_some() || (!recovering && state.entries.iter().any(|e| e.conflict)) {
        return Err(error(
            "Termina la operación Git y resuelve los conflictos antes de usar Stash.",
        ));
    }
    if state.head.is_none() || state.branch.is_none() {
        return Err(error(
            "Stash requiere una rama local con al menos un commit.",
        ));
    }
    Ok(state)
}
fn fingerprint(
    state: &changes::Changes,
    entries: &[Entry],
    action: &Action,
    extra: &[u8],
) -> Result<String> {
    let mut digest = Sha256::new();
    for bytes in [
        state.token.as_bytes(),
        encode(entries)?.as_slice(),
        encode(action)?.as_slice(),
        extra,
    ] {
        digest.update((bytes.len() as u64).to_le_bytes());
        digest.update(bytes);
    }
    Ok(format!("{:x}", digest.finalize()))
}
pub fn read(repo: &Repository, trusted: bool) -> Result<Options> {
    if !trusted {
        return Ok(Options {
            trusted: false,
            entries: vec![],
            recovery: None,
        });
    }
    // Do not inspect a record through an external .git file or symlink.
    if !fs::symlink_metadata(repo.path.join(".git"))
        .is_ok_and(|m| m.is_dir() && !m.file_type().is_symlink())
    {
        return Err(error(
            "Stash requiere un directorio .git local, sin worktrees enlazados.",
        ));
    }
    let entries = list(repo)?;
    let recovery = if exists(repo, RECORD) {
        Some(recovery(repo)?)
    } else {
        None
    };
    Ok(Options {
        trusted: true,
        entries,
        recovery,
    })
}
pub fn preview(repo: &Repository, action: Action, trusted: bool) -> Result<Plan> {
    if !trusted {
        return Err(error("Autoriza el repositorio antes de usar Stash."));
    }
    let state = supported(repo, false)?;
    let entries = list(repo)?;
    let (files, patch) = match &action {
        Action::Save { message, untracked } => {
            if message.trim().is_empty()
                || message.len() > 1000
                || message.chars().any(char::is_control)
            {
                return Err(error(
                    "Escribe una descripción de una línea, de hasta 1000 bytes.",
                ));
            }
            let selected: Vec<_> = state
                .entries
                .iter()
                .filter(|e| !e.untracked || *untracked)
                .collect();
            if selected.is_empty() {
                return Err(error("No hay cambios que guardar con estas opciones."));
            }
            // Reject embedded repositories/directories rather than relying on git clean's nested-repository rules.
            for entry in &selected {
                let path = changes::validated_path(repo, entry.path.trim_end_matches('/'))?;
                if entry.untracked && fs::symlink_metadata(&path).is_ok_and(|m| m.is_dir()) {
                    return Err(error(
                        "Hay una carpeta sin seguimiento o un repositorio anidado. Revísala desde Git antes de incluir archivos nuevos.",
                    ));
                }
                let mut parent = path.parent();
                while let Some(p) = parent.filter(|p| *p != repo.path) {
                    if fs::symlink_metadata(p.join(".git")).is_ok() {
                        return Err(error("No se guardan repositorios anidados en un stash."));
                    }
                    parent = p.parent();
                }
            }
            (
                selected.iter().map(|e| e.path.clone()).collect(),
                String::new(),
            )
        }
        Action::Apply {
            hash: oid,
            index: _,
        } => {
            if !hash(oid) || !entries.iter().any(|e| e.hash == *oid) {
                return Err(error(
                    "El stash ya no está en la lista. Actualiza y vuelve a seleccionarlo.",
                ));
            }
            if !state.entries.is_empty()
                || !git::run(
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
                    "Para restaurar, deja el árbol limpio, incluidos archivos nuevos e ignorados. Muévelos o guárdalos primero.",
                ));
            }
            let patch = git::text(
                &repo.path,
                &[
                    "--no-replace-objects",
                    "stash",
                    "show",
                    "--include-untracked",
                    "--patch",
                    "--no-ext-diff",
                    "--no-textconv",
                    oid,
                    "--",
                ],
            )?;
            (vec![], patch)
        }
    };
    let token = fingerprint(&state, &entries, &action, patch.as_bytes())?;
    Ok(Plan {
        token,
        action,
        head: state.head.unwrap(),
        branch: state.branch.unwrap(),
        files,
        patch,
    })
}
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
    let bytes = encode(saved)?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| error("Reloj no válido. No se inició Stash."))?
        .as_nanos();
    let temporary = repo
        .path
        .join(".git")
        .join(format!("ravengit-stash-{}-{nonce}.tmp", std::process::id()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|_| error("No se pudo crear el registro temporal. No se inició Stash."))?;
    let written = persist(&mut file, &bytes);
    drop(file);
    if written.is_err() {
        let _ = fs::remove_file(&temporary);
        return Err(error(
            "No se pudo guardar el registro completo. No se inició Stash.",
        ));
    }
    // Both names are in the same directory. Publish exclusively after sync;
    // neither a partial record nor a replacement of an older one is allowed.
    let published = fs::hard_link(&temporary, marker(repo));
    let _ = fs::remove_file(&temporary);
    published.map_err(|_| error("Ya existe un registro o no se pudo publicarlo de forma segura. No se inició Stash; revisa permisos y el sistema de archivos antes de repetir."))
}
fn saved(repo: &Repository) -> Result<(Saved, Vec<u8>)> {
    let path = marker(repo);
    let meta =
        fs::symlink_metadata(&path).map_err(|_| error("No se pudo leer el registro de stash."))?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 16384 {
        return Err(error(
            "Registro de stash no compatible; revísalo desde Git.",
        ));
    }
    let bytes = fs::read(path).map_err(|_| error("No se pudo leer el registro de stash."))?;
    let record: Saved = serde_json::from_slice(&bytes).map_err(|_| {
        error("Registro de stash dañado. Conserva los archivos y revísalo desde Git.")
    })?;
    if !hash(&record.head) || record.branch.is_empty() {
        return Err(error("Registro de stash no válido."));
    }
    Ok((record, bytes))
}
fn backup(repo: &Repository, oid: &str) -> Result<()> {
    if !hash(oid) {
        return Err(error("No se pudo verificar el respaldo de stash."));
    }
    let reference = format!("refs/ravengit/stash/{oid}");
    let existing =
        git::text(&repo.path, &["rev-parse", "--verify", &reference]).unwrap_or_default();
    if existing.trim() == oid {
        return Ok(());
    }
    if !existing.is_empty() {
        return Err(error("El respaldo existente cambió; no se reemplaza."));
    }
    if !command(
        repo,
        &["update-ref", &reference, oid, &"0".repeat(oid.len())],
    )?
    .success
    {
        return Err(error(
            "No se pudo conservar el respaldo; revisa el registro de Stash.",
        ));
    }
    Ok(())
}
fn recovery(repo: &Repository) -> Result<Recovery> {
    let state = supported(repo, true)?;
    let entries = list(repo)?;
    let (saved, bytes) = saved(repo)?;
    let conflicts = state
        .entries
        .iter()
        .filter(|e| e.conflict)
        .map(|e| e.path.clone())
        .collect::<Vec<_>>();
    let can_finish = state.head.as_deref() == Some(&saved.head)
        && state.branch.as_deref() == Some(&saved.branch)
        && conflicts.is_empty();
    Ok(Recovery {
        token: fingerprint(&state, &entries, &saved.action, &bytes)?,
        action: saved.action,
        head: saved.head,
        branch: saved.branch,
        conflicts,
        can_finish,
    })
}
pub fn finish(repo: &Repository, token: &str, trusted: bool) -> Result<String> {
    if !trusted {
        return Err(error(
            "Autoriza el repositorio antes de revisar la recuperación.",
        ));
    }
    let state = recovery(repo)?;
    if state.token != token || !state.can_finish {
        return Err(error(
            "El estado cambió o quedan conflictos. Actualiza y revisa la recuperación.",
        ));
    }
    let (saved, _) = saved(repo)?;
    match saved.action {
        Action::Apply { hash, .. } => backup(repo, &hash)?,
        Action::Save { .. } => {
            if let Some(entry) = list(repo)?
                .first()
                .filter(|e| Some(&e.hash) != saved.previous.as_ref())
            {
                backup(repo, &entry.hash)?;
            }
        }
    }
    fs::remove_file(marker(repo)).map_err(|_| {
        error("No se pudo retirar el registro; los archivos y stashes se conservan.")
    })?;
    Ok("Revisión finalizada. Se conservan los archivos, el index y los stashes; no se repite ninguna operación.".into())
}
pub fn execute(repo: &Repository, plan: Plan, trusted: bool) -> Result<String> {
    if preview(repo, plan.action.clone(), trusted)?.token != plan.token {
        return Err(error(
            "El repositorio o la lista de stash cambió. Vuelve a revisar.",
        ));
    }
    let previous = list(repo)?.first().map(|e| e.hash.clone());
    if let Action::Apply { hash, .. } = &plan.action {
        backup(repo, hash)?;
    }
    save_record(
        repo,
        &Saved {
            action: plan.action.clone(),
            head: plan.head.clone(),
            branch: plan.branch.clone(),
            previous: previous.clone(),
        },
    )?;
    let output = match &plan.action {
        Action::Save { message, untracked } => {
            let mut args = vec!["stash", "push", "--message", message.as_str()];
            if *untracked {
                args.push("--include-untracked");
            }
            command(repo, &args)?
        }
        Action::Apply { hash, index } => {
            let mut args = vec!["stash", "apply"];
            if *index {
                args.push("--index");
            }
            args.push(hash);
            command(repo, &args)?
        }
    };
    if !output.success {
        return Err(error(
            "Git no completó Stash. Se conserva el registro: actualiza, revisa los archivos y resuelve los conflictos desde Git. No repitas la operación.",
        ));
    }
    let state = recovery(repo)?;
    if !state.can_finish {
        return Err(error(
            "La operación requiere revisión. Se conservan el registro y los stashes.",
        ));
    }
    if let Action::Save { .. } = &plan.action {
        let entries = list(repo)?;
        let entry = entries
            .first()
            .filter(|e| Some(&e.hash) != previous.as_ref())
            .ok_or_else(|| {
                error("No se confirmó un nuevo stash. Revisa el registro antes de repetir.")
            })?;
        backup(repo, &entry.hash)?;
        let after = changes::read(repo, true)?;
        let include_new = matches!(
            &plan.action,
            Action::Save {
                untracked: true,
                ..
            }
        );
        if after
            .entries
            .iter()
            .any(|entry| !entry.untracked || include_new)
        {
            return Err(error(
                "El stash se guardó, pero quedan archivos por revisar. Se conserva el registro; no repitas el guardado.",
            ));
        }
    }
    finish(repo, &state.token, trusted)?;
    Ok(match plan.action { Action::Save { .. } => "Cambios guardados en Stash. Los archivos ignorados se conservan en el árbol.", Action::Apply { .. } => "Stash restaurado. La entrada original y su respaldo se conservan; revisa Cambios antes de crear un commit." }.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    struct Fixture(Repository);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "ravengit-stash-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            let f = Self(Repository {
                id: "stash-fixture".into(),
                path,
            });
            f.git(&["init", "-b", "main"]);
            for (name, value) in [
                ("user.name", "Fixture"),
                ("user.email", "fixture@example.invalid"),
                ("commit.gpgsign", "false"),
                ("core.autocrlf", "false"),
            ] {
                f.git(&["config", name, value]);
            }
            f.git(&[
                "config",
                "core.hooksPath",
                f.0.path.join(".git/no-hooks").to_str().unwrap(),
            ]);
            f.write("file.txt", "base\n");
            f.write("other.txt", "other\n");
            f.write(".gitignore", "ignored.txt\n");
            f.git(&["add", "--all"]);
            f.git(&["commit", "-m", "Base"]);
            f
        }
        fn git(&self, args: &[&str]) -> String {
            git::text(&self.0.path, args).unwrap()
        }
        fn write(&self, path: &str, text: &str) {
            fs::write(self.0.path.join(path), text).unwrap();
        }
        fn save(&self, untracked: bool) -> String {
            execute(
                &self.0,
                preview(
                    &self.0,
                    Action::Save {
                        message: "Trabajo ü".into(),
                        untracked,
                    },
                    true,
                )
                .unwrap(),
                true,
            )
            .unwrap();
            list(&self.0).unwrap()[0].hash.clone()
        }
        fn apply(&self, oid: &str, index: bool) -> Result<String> {
            execute(
                &self.0,
                preview(
                    &self.0,
                    Action::Apply {
                        hash: oid.into(),
                        index,
                    },
                    true,
                )?,
                true,
            )
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0.path);
        }
    }
    fn recovery_record(f: &Fixture) -> Saved {
        Saved {
            action: Action::Save {
                message: "Registro ü".into(),
                untracked: false,
            },
            head: f.git(&["rev-parse", "HEAD"]).trim().into(),
            branch: "main".into(),
            previous: None,
        }
    }
    fn assert_no_record_temporaries(f: &Fixture) {
        assert!(fs::read_dir(f.0.path.join(".git")).unwrap().all(|entry| {
            let name = entry.unwrap().file_name().to_string_lossy().into_owned();
            !(name.starts_with("ravengit-stash-") && name.ends_with(".tmp"))
        }));
    }
    #[test]
    fn recovery_record_is_published_complete_without_replacing_previous() {
        let f = Fixture::new();
        let record = recovery_record(&f);
        save_record(&f.0, &record).unwrap();
        let original = fs::read(marker(&f.0)).unwrap();
        assert_eq!(original, encode(&record).unwrap());
        assert_eq!(saved(&f.0).unwrap().0.head, record.head);
        assert!(save_record(&f.0, &record).is_err());
        assert_eq!(fs::read(marker(&f.0)).unwrap(), original);
        assert_no_record_temporaries(&f);
    }
    #[test]
    fn recovery_record_write_and_sync_errors_leave_no_partial_final_record() {
        for existing in [false, true] {
            for partial in [false, true] {
                let f = Fixture::new();
                let record = recovery_record(&f);
                if existing {
                    fs::write(marker(&f.0), b"previous recovery").unwrap();
                }
                let failure = save_record_using(&f.0, &record, |file, bytes| {
                    file.write_all(if partial {
                        &bytes[..bytes.len() / 2]
                    } else {
                        bytes
                    })?;
                    Err(std::io::Error::other("simulated storage failure"))
                })
                .expect_err("a storage failure must prevent publication");
                assert!(failure.message.contains("No se inició Stash"));
                if existing {
                    assert_eq!(fs::read(marker(&f.0)).unwrap(), b"previous recovery");
                } else {
                    assert!(!marker(&f.0).exists());
                }
                assert_no_record_temporaries(&f);
                assert_eq!(f.git(&["rev-parse", "HEAD"]).trim(), record.head);
                assert!(f.git(&["status", "--porcelain"]).is_empty());
                assert!(list(&f.0).unwrap().is_empty());
            }
        }
    }
    #[test]
    fn saves_and_restores_both_layers_without_changing_head_or_dropping_stash() {
        let f = Fixture::new();
        let head = f.git(&["rev-parse", "HEAD"]);
        f.write("file.txt", "staged\n");
        f.git(&["add", "file.txt"]);
        f.write("file.txt", "working\n");
        let oid = f.save(false);
        assert!(changes::read(&f.0, true).unwrap().entries.is_empty());
        assert!(!marker(&f.0).exists());
        f.apply(&oid, true).unwrap();
        assert_eq!(f.git(&["show", ":file.txt"]), "staged\n");
        assert_eq!(
            fs::read_to_string(f.0.path.join("file.txt")).unwrap(),
            "working\n"
        );
        assert_eq!(f.git(&["rev-parse", "HEAD"]), head);
        assert_eq!(list(&f.0).unwrap()[0].hash, oid);
        assert_eq!(
            f.git(&["rev-parse", &format!("refs/ravengit/stash/{oid}")])
                .trim(),
            oid
        );
    }
    #[test]
    fn explicit_restore_option_overrides_stash_index_configuration() {
        let f = Fixture::new();
        f.write("file.txt", "prepared\n");
        f.git(&["add", "file.txt"]);
        f.write("file.txt", "working\n");
        let oid = f.save(false);
        f.git(&["config", "stash.index", "true"]);
        f.apply(&oid, false).unwrap();
        assert_eq!(f.git(&["show", ":file.txt"]), "base\n");
        assert_eq!(
            fs::read_to_string(f.0.path.join("file.txt")).unwrap(),
            "working\n"
        );
        assert_eq!(f.git(&["config", "stash.index"]).trim(), "true");
    }
    #[test]
    fn new_files_are_opt_in_and_ignored_files_are_never_stashed() {
        let f = Fixture::new();
        f.write("file.txt", "edit\n");
        f.write("new ü.txt", "new\n");
        f.write("ignored.txt", "secret\n");
        let oid = f.save(false);
        assert!(f.0.path.join("new ü.txt").exists());
        assert!(f.0.path.join("ignored.txt").exists());
        assert!(f.apply(&oid, false).is_err()); // both new/ignored files block restoration
        let oid2 = f.save(true);
        assert!(!f.0.path.join("new ü.txt").exists());
        assert_eq!(
            fs::read_to_string(f.0.path.join("ignored.txt")).unwrap(),
            "secret\n"
        );
        fs::remove_file(f.0.path.join("ignored.txt")).unwrap();
        f.apply(&oid2, false).unwrap();
        assert_eq!(
            fs::read_to_string(f.0.path.join("new ü.txt")).unwrap(),
            "new\n"
        );
        assert_eq!(list(&f.0).unwrap().len(), 2);
    }
    #[test]
    fn rejects_stale_worktree_and_stack_and_untrusted_or_injected_actions() {
        let f = Fixture::new();
        f.write("file.txt", "one\n");
        let action = Action::Save {
            message: "work".into(),
            untracked: false,
        };
        assert!(!read(&f.0, false).unwrap().trusted);
        assert!(preview(&f.0, action.clone(), false).is_err());
        let p = preview(&f.0, action.clone(), true).unwrap();
        f.write("file.txt", "two\n");
        assert!(execute(&f.0, p, true).is_err());
        assert!(list(&f.0).unwrap().is_empty());
        let p = preview(&f.0, action, true).unwrap();
        f.git(&["stash", "push", "-m", "external"]);
        assert!(execute(&f.0, p, true).is_err());
        assert_eq!(list(&f.0).unwrap().len(), 1);
        assert!(
            preview(
                &f.0,
                Action::Apply {
                    hash: "--all".into(),
                    index: false
                },
                true
            )
            .is_err()
        );
        assert!(!marker(&f.0).exists());
    }
    #[test]
    fn conflicting_apply_survives_reopen_blocks_writes_and_finishes_without_reset() {
        let f = Fixture::new();
        f.write("file.txt", "stash version\n");
        let oid = f.save(false);
        f.write("file.txt", "branch version\n");
        f.git(&["add", "file.txt"]);
        f.git(&["commit", "-m", "Divergence"]);
        let head = f.git(&["rev-parse", "HEAD"]);
        assert!(f.apply(&oid, false).is_err());
        assert!(marker(&f.0).exists());
        let reopened = Repository {
            id: "reopened".into(),
            path: f.0.path.clone(),
        };
        let state = read(&reopened, true).unwrap().recovery.unwrap();
        assert_eq!(state.conflicts, vec!["file.txt"]);
        assert!(!state.can_finish);
        assert!(finish(&reopened, &state.token, true).is_err());
        assert!(
            crate::branches::read(&reopened, true)
                .unwrap()
                .restriction
                .unwrap()
                .contains("Stash")
        );
        assert!(crate::tags::preview(&reopened, "v1", head.trim(), true).is_err());
        f.write("file.txt", "chosen resolution\n");
        f.git(&["add", "file.txt"]);
        assert!(finish(&reopened, &state.token, true).is_err()); // must reread after external resolution
        let state = read(&reopened, true).unwrap().recovery.unwrap();
        assert!(state.can_finish);
        let changes = changes::read(&reopened, true).unwrap();
        assert_eq!(
            changes::commit(&reopened, &changes.token, "Must stay blocked", true)
                .unwrap_err()
                .code,
            "OPERATION_ACTIVE"
        );
        assert!(crate::amend::preview(&reopened, None, true).is_err());
        finish(&reopened, &state.token, true).unwrap();
        assert!(!marker(&f.0).exists());
        assert_eq!(f.git(&["rev-parse", "HEAD"]), head);
        assert_eq!(f.git(&["show", ":file.txt"]), "chosen resolution\n");
        assert_eq!(list(&f.0).unwrap()[0].hash, oid);
    }
    #[test]
    fn interrupted_save_record_requires_review_and_preserves_files() {
        let f = Fixture::new();
        f.write("file.txt", "not yet saved\n");
        let state = changes::read(&f.0, true).unwrap();
        save_record(
            &f.0,
            &Saved {
                action: Action::Save {
                    message: "test".into(),
                    untracked: false,
                },
                head: state.head.unwrap(),
                branch: state.branch.unwrap(),
                previous: None,
            },
        )
        .unwrap();
        let state = recovery(&f.0).unwrap();
        finish(&f.0, &state.token, true).unwrap();
        assert_eq!(
            fs::read_to_string(f.0.path.join("file.txt")).unwrap(),
            "not yet saved\n"
        );
        assert!(list(&f.0).unwrap().is_empty());
    }
    #[cfg(windows)]
    #[test]
    #[ignore = "worker invoked only by the Stash interruption test"]
    fn forced_stash_worker() {
        let Some(path) = std::env::var_os("RAVENGIT_STASH_FIXTURE") else {
            return;
        };
        let repo = Repository {
            id: "forced-stash".into(),
            path: path.into(),
        };
        let action: Action =
            serde_json::from_str(&std::env::var("RAVENGIT_STASH_ACTION").unwrap()).unwrap();
        execute(&repo, preview(&repo, action, true).unwrap(), true).unwrap();
        panic!("Stash must remain paused until its owning process is killed");
    }
    #[cfg(windows)]
    #[test]
    fn interrupted_stash_save_and_apply_keep_record_and_never_repeat_command() {
        use std::os::windows::process::CommandExt;
        for applying in [false, true] {
            let f = Fixture::new();
            f.write("file.txt", "stash interruption ü\n");
            let action = if applying {
                Action::Apply {
                    hash: f.save(false),
                    index: false,
                }
            } else {
                Action::Save {
                    message: "Interrupted save".into(),
                    untracked: false,
                }
            };
            let head = f.git(&["rev-parse", "HEAD"]);
            f.write(".git/info/attributes", "file.txt filter=pause\n");
            // Preflight reads pass through unchanged. Only the real Stash
            // command, after publishing its record, reaches the barrier.
            f.write(".git/stash-pause", "#!/bin/sh\nif [ -f .git/ravengit-stash.json ]; then\n  cat > .git/stash-filter-input\n  echo ready > .git/stash-ready\n  while [ ! -f .git/stash-release ]; do sleep 0.1; done\n  echo escaped > .git/stash-escaped\n  cat .git/stash-filter-input\nelse\n  cat\nfi\n");
            f.git(&[
                "config",
                "filter.pause.clean",
                if applying {
                    "cat"
                } else {
                    "sh .git/stash-pause"
                },
            ]);
            f.git(&[
                "config",
                "filter.pause.smudge",
                if applying {
                    "sh .git/stash-pause"
                } else {
                    "cat"
                },
            ]);
            f.git(&["config", "filter.pause.required", "true"]);
            let plan = preview(&f.0, action.clone(), true).unwrap();
            let mut child = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "stash::tests::forced_stash_worker",
                    "--ignored",
                    "--nocapture",
                ])
                .env("RAVENGIT_STASH_FIXTURE", &f.0.path)
                .env(
                    "RAVENGIT_STASH_ACTION",
                    serde_json::to_string(&action).unwrap(),
                )
                .creation_flags(0x08000000)
                .spawn()
                .unwrap();
            let deadline = std::time::Instant::now() + Duration::from_secs(90);
            while !f.0.path.join(".git/stash-ready").exists() {
                if let Some(status) = child.try_wait().unwrap() {
                    panic!("Stash worker exited before barrier: {status}");
                }
                if std::time::Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    panic!("Stash did not reach the active-command barrier");
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            child.kill().unwrap();
            assert!(!child.wait().unwrap().success());
            let record = fs::read(marker(&f.0)).unwrap();
            serde_json::from_slice::<Saved>(&record).unwrap();
            f.write(".git/stash-release", "release");
            std::thread::sleep(Duration::from_secs(1));
            assert!(!f.0.path.join(".git/stash-escaped").exists());
            let stack = f.git(&["stash", "list", "--format=%H"]);
            assert_eq!(f.git(&["rev-parse", "HEAD"]), head);
            if let Action::Apply { hash, .. } = &action {
                assert!(stack.lines().any(|line| line == hash));
                assert_eq!(
                    f.git(&["rev-parse", &format!("refs/ravengit/stash/{hash}")])
                        .trim(),
                    hash
                );
            }
            // A new repository handle must expose recovery or reject an
            // incomplete/locked state. It must never retry push/apply.
            let reopened = Repository {
                id: "reopened-stash-cut".into(),
                path: f.0.path.clone(),
            };
            if let Ok(options) = read(&reopened, true) {
                assert!(options.recovery.is_some());
            }
            assert!(execute(&reopened, plan, true).is_err());
            assert_eq!(fs::read(marker(&reopened)).unwrap(), record);
            assert_eq!(f.git(&["rev-parse", "HEAD"]), head);
            assert_eq!(f.git(&["stash", "list", "--format=%H"]), stack);
        }
    }
    #[test]
    fn locks_and_other_operations_and_unsupported_repos_are_rejected() {
        let f = Fixture::new();
        f.write("file.txt", "edit\n");
        for name in [
            "index.lock",
            "refs/stash.lock",
            "ravengit-replay.json",
            "ravengit-rebase.json",
        ] {
            f.write(&format!(".git/{name}"), "lock");
            assert!(
                preview(
                    &f.0,
                    Action::Save {
                        message: "test".into(),
                        untracked: false
                    },
                    true
                )
                .is_err()
            );
            fs::remove_file(f.0.path.join(".git").join(name)).unwrap();
        }
        f.git(&["config", "core.sparseCheckout", "true"]);
        assert!(
            preview(
                &f.0,
                Action::Save {
                    message: "test".into(),
                    untracked: false
                },
                true
            )
            .is_err()
        );
    }
}
