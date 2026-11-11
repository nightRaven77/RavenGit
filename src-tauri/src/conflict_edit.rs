use crate::{
    changes, conflict_stage, conflicts,
    git::{self, GitError, Repository, Result},
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions, Permissions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const LIMIT: usize = 512 * 1024;
static NEXT: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub token: String,
    pub path: String,
    pub text: String,
    pub line_ending: String,
}
pub struct Plan {
    pub view: Preview,
    state_token: String,
    original: Vec<u8>,
    permissions: Permissions,
    git_dir: PathBuf,
    operation: String,
}
pub enum Session {
    Recovering(crate::conflict_restore::Plan),
    Editing(Plan),
    Saved(conflict_stage::Receipt),
    Reviewed(conflict_stage::Receipt, conflict_stage::Preview),
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub backup: String,
    pub message: String,
    pub prepare_token: Option<String>,
    #[serde(skip)]
    pub receipt: Option<conflict_stage::Receipt>,
}
fn failure(message: &str) -> GitError {
    GitError::new("CONFLICT_EDIT", message)
}
fn stale() -> GitError {
    GitError::new(
        "CONFLICT_STALE",
        "El archivo, índice u operación cambió. Conserva tu borrador y vuelve a revisar antes de guardar.",
    )
}
pub(crate) fn nonce() -> String {
    format!(
        "{}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}
pub(crate) fn bytes(path: &Path) -> Result<(Vec<u8>, Permissions)> {
    let meta = fs::symlink_metadata(path)
        .map_err(|_| failure("No se pudo revisar el archivo de trabajo."))?;
    if !meta.is_file()
        || meta.file_type().is_symlink()
        || meta.len() > LIMIT as u64
        || meta.permissions().readonly()
    {
        return Err(failure(
            "Se requiere un archivo regular escribible de hasta 512 KiB, sin enlaces.",
        ));
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| failure("No se pudo leer el archivo."))?
        .take((LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| failure("No se pudo leer el archivo."))?;
    if bytes.len() > LIMIT {
        return Err(failure("El archivo supera 512 KiB."));
    }
    Ok((bytes, meta.permissions()))
}
pub(crate) fn operation(git_dir: &Path) -> Result<String> {
    let mut hash = Sha256::new();
    for name in [
        "MERGE_HEAD",
        "MERGE_MSG",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge/head-name",
        "rebase-merge/onto",
        "rebase-merge/orig-head",
        "rebase-merge/git-rebase-todo",
        "rebase-merge/done",
        "rebase-merge/stopped-sha",
        "rebase-apply/next",
        "rebase-apply/last",
        "rebase-apply/orig-head",
        "rebase-apply/head-name",
        "rebase-apply/onto",
        "sequencer/head",
        "sequencer/todo",
        "sequencer/opts",
    ] {
        hash.update(name.as_bytes());
        match fs::symlink_metadata(git_dir.join(name)) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => hash.update([0]),
            Ok(meta)
                if meta.is_file()
                    && !meta.file_type().is_symlink()
                    && meta.len() <= LIMIT as u64 =>
            {
                let data = fs::read(git_dir.join(name))
                    .map_err(|_| failure("No se pudo revisar la operación Git."))?;
                if data.len() > LIMIT {
                    return Err(failure("Los metadatos Git superan el límite."));
                }
                hash.update([1]);
                hash.update((data.len() as u64).to_le_bytes());
                hash.update(data);
            }
            _ => {
                return Err(failure(
                    "No se pudieron verificar los metadatos de la operación Git.",
                ));
            }
        }
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn text(bytes: &[u8]) -> Result<(String, bool)> {
    if bytes.contains(&0) {
        return Err(failure("No se edita contenido binario."));
    }
    let value = std::str::from_utf8(bytes)
        .map_err(|_| failure("Sólo se edita UTF-8 sin conversión con pérdida."))?;
    let normalized = value.replace("\r\n", "\n");
    let crlf = value.contains("\r\n");
    if normalized.contains('\r') || (crlf && value.replace("\r\n", "").contains('\n')) {
        return Err(failure(
            "Finales de línea mezclados o CR aislado: utiliza un editor externo.",
        ));
    }
    Ok((normalized, crlf))
}
pub fn preview(repo: &Repository, token: &str, path: &str, trusted: bool) -> Result<Plan> {
    let conflict = conflicts::read(repo, token, path, trusted)?;
    if conflict.versions.len() != 3
        || conflict
            .versions
            .iter()
            .any(|version| version.text.is_none() || version.restriction.is_some())
    {
        return Err(failure(
            "Este editor admite tres etapas textuales regulares. Altas, eliminaciones, enlaces o binarios requieren resolución externa.",
        ));
    }
    let full = changes::validated_path(repo, path)?;
    let (original, permissions) = bytes(&full)?;
    let (text, crlf) = text(&original)?;
    let git_dir = PathBuf::from(
        git::text(&repo.path, &["rev-parse", "--absolute-git-dir"])?.trim_end_matches('\n'),
    )
    .canonicalize()
    .map_err(|_| failure("No se pudo verificar la carpeta Git."))?;
    let operation = operation(&git_dir)?;
    if changes::read(repo, trusted)?.token != token {
        return Err(stale());
    }
    Ok(Plan {
        view: Preview {
            token: nonce(),
            path: path.into(),
            text,
            line_ending: if crlf { "CRLF" } else { "LF" }.into(),
        },
        state_token: token.into(),
        original,
        permissions,
        git_dir,
        operation,
    })
}
struct Temporary(PathBuf);
impl Drop for Temporary {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
fn create(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|_| {
            failure("No se pudo crear el respaldo o archivo temporal. No se guardó la resolución.")
        })?;
    file.write_all(bytes).and_then(|_| file.sync_all()).map_err(|_| failure("No se pudo completar el respaldo o archivo temporal. Comprueba el archivo antes de repetir."))
}
pub fn save(repo: &Repository, plan: Plan, result: &str, trusted: bool) -> Result<Outcome> {
    if !trusted {
        return Err(failure("La autorización ya no está vigente."));
    }
    let (normalized, _) = text(result.as_bytes())?;
    if normalized.lines().any(|line| {
        line.starts_with("<<<<<<<")
            || line.starts_with("|||||||")
            || line == "======="
            || line.starts_with(">>>>>>>")
    }) {
        return Err(failure(
            "El resultado todavía contiene marcadores de conflicto. Revísalo antes de guardar.",
        ));
    }
    let output = if plan.view.line_ending == "CRLF" {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };
    if output.len() > LIMIT {
        return Err(failure("El resultado supera 512 KiB."));
    }
    let full = changes::validated_path(repo, &plan.view.path)?;
    let current = bytes(&full)?;
    if changes::read(repo, true)?.token != plan.state_token
        || current.0 != plan.original
        || current.1 != plan.permissions
        || operation(&plan.git_dir)? != plan.operation
    {
        return Err(stale());
    }
    if output.as_bytes() == plan.original {
        return Err(failure("El resultado no cambia el archivo de trabajo."));
    }
    let backup = plan
        .git_dir
        .join(format!("ravengit-conflict-{}", plan.view.token));
    fs::create_dir(&backup).map_err(|_| {
        failure("No se pudo crear una carpeta de respaldo exclusiva. No se modificó el archivo.")
    })?;
    create(&backup.join("original"), &plan.original)?;
    let metadata = serde_json::to_vec_pretty(&serde_json::json!({ "path": plan.view.path, "originalSha256": format!("{:x}", Sha256::digest(&plan.original)), "resultSha256": format!("{:x}", Sha256::digest(output.as_bytes())), "stateToken": plan.state_token, "operation": plan.operation, "lineEnding": plan.view.line_ending })).map_err(|_| failure("No se pudo registrar el respaldo."))?;
    create(&backup.join("metadata.json"), &metadata)?;
    let temporary = Temporary(backup.join("result.tmp"));
    create(&temporary.0, output.as_bytes())?;
    fs::set_permissions(&temporary.0, plan.permissions.clone())
        .map_err(|_| failure("No se pudieron conservar los permisos del archivo."))?;
    let current = bytes(&full)?;
    if changes::read(repo, true)?.token != plan.state_token
        || current.0 != plan.original
        || current.1 != plan.permissions
        || operation(&plan.git_dir)? != plan.operation
    {
        return Err(stale());
    }
    changes::validated_path(repo, &plan.view.path)?;
    fs::rename(&temporary.0, &full).map_err(|_| failure("No se pudo reemplazar el archivo. El respaldo se conserva en la carpeta Git; comprueba el estado antes de repetir."))?;
    let receipt = conflict_stage::saved(
        repo,
        &plan.view.path,
        output.as_bytes(),
        plan.git_dir,
        plan.operation,
    );
    let prepare_token = receipt.as_ref().map(|receipt| receipt.token.clone());
    Ok(Outcome { backup: backup.to_string_lossy().into_owned(), message: "Resolución guardada en el archivo de trabajo. El índice sigue en conflicto; no se preparó ni continuó la operación.".into(), prepare_token, receipt })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conflicts::tests::Fixture;
    const FILE: &str = "archivo ü.txt";
    fn fixture() -> Fixture {
        Fixture::new(Some(b"base\n"), Some(b"local\n"), b"incoming\n")
    }
    fn plan(fixture: &Fixture) -> Plan {
        preview(
            &fixture.0,
            &changes::read(&fixture.0, true).unwrap().token,
            FILE,
            true,
        )
        .unwrap()
    }
    #[test]
    fn saves_with_durable_backup_without_preparing_or_finishing_merge() {
        let fixture = fixture();
        let original = fs::read(fixture.0.path.join(FILE)).unwrap();
        let index = git::run(&fixture.0.path, &["ls-files", "--stage", "-z"]).unwrap();
        let head = git::text(&fixture.0.path, &["rev-parse", "HEAD"]).unwrap();
        let result = save(&fixture.0, plan(&fixture), "resuelto\n", true).unwrap();
        assert_eq!(fs::read(fixture.0.path.join(FILE)).unwrap(), b"resuelto\n");
        assert_eq!(
            fs::read(Path::new(&result.backup).join("original")).unwrap(),
            original
        );
        assert!(Path::new(&result.backup).join("metadata.json").is_file());
        assert_eq!(
            git::run(&fixture.0.path, &["ls-files", "--stage", "-z"]).unwrap(),
            index
        );
        assert_eq!(
            git::text(&fixture.0.path, &["rev-parse", "HEAD"]).unwrap(),
            head
        );
        assert!(
            changes::read(&fixture.0, true)
                .unwrap()
                .entries
                .iter()
                .any(|entry| entry.conflict)
        );
        assert!(fixture.0.path.join(".git/MERGE_HEAD").is_file());
    }
    #[test]
    fn rejects_external_file_or_operation_changes() {
        for operation_changed in [false, true] {
            let fixture = fixture();
            let reviewed = plan(&fixture);
            if operation_changed {
                fs::write(fixture.0.path.join(".git/MERGE_MSG"), "changed operation").unwrap();
            } else {
                fs::write(fixture.0.path.join(FILE), "externo\n").unwrap();
            }
            let before = fs::read(fixture.0.path.join(FILE)).unwrap();
            assert_eq!(
                save(&fixture.0, reviewed, "resuelto\n", true)
                    .err()
                    .unwrap()
                    .code,
                "CONFLICT_STALE"
            );
            assert_eq!(fs::read(fixture.0.path.join(FILE)).unwrap(), before);
        }
    }
    #[test]
    fn rejects_staged_resolution_and_revoked_trust() {
        let fixture = fixture();
        let reviewed = plan(&fixture);
        fixture.git(&["add", "--", FILE]);
        assert_eq!(
            save(&fixture.0, reviewed, "resuelto\n", true)
                .err()
                .unwrap()
                .code,
            "CONFLICT_STALE"
        );
        let fixture = self::fixture();
        let before = fs::read(fixture.0.path.join(FILE)).unwrap();
        assert!(save(&fixture.0, plan(&fixture), "resuelto\n", false).is_err());
        assert_eq!(fs::read(fixture.0.path.join(FILE)).unwrap(), before);
    }
    #[test]
    fn rejects_markers_binary_oversize_and_unchanged_result() {
        let fixture = fixture();
        let original = fs::read(fixture.0.path.join(FILE)).unwrap();
        for result in [
            "<<<<<<< local\n",
            "=======\n",
            ">>>>>>> incoming\n",
            "||||||| base\n",
            "binary\0",
        ] {
            assert!(save(&fixture.0, plan(&fixture), result, true).is_err());
        }
        assert!(save(&fixture.0, plan(&fixture), &"x".repeat(LIMIT + 1), true).is_err());
        fs::write(fixture.0.path.join(FILE), "already edited\n").unwrap();
        assert!(save(&fixture.0, plan(&fixture), "already edited\n", true).is_err());
        assert!(!original.is_empty());
        assert_eq!(
            fs::read(fixture.0.path.join(FILE)).unwrap(),
            b"already edited\n"
        );
    }
    #[test]
    fn preserves_crlf_and_missing_final_newline() {
        let fixture = fixture();
        fs::write(fixture.0.path.join(FILE), "local\r\nentrante\r\n").unwrap();
        let reviewed = plan(&fixture);
        assert_eq!(reviewed.view.line_ending, "CRLF");
        assert_eq!(reviewed.view.text, "local\nentrante\n");
        save(&fixture.0, reviewed, "ambos\nfinal", true).unwrap();
        assert_eq!(
            fs::read(fixture.0.path.join(FILE)).unwrap(),
            b"ambos\r\nfinal"
        );
    }
    #[test]
    fn refuses_missing_stages_binary_worktree_and_mixed_line_endings() {
        let added = Fixture::new(None, Some(b"local\n"), b"incoming\n");
        assert!(
            preview(
                &added.0,
                &changes::read(&added.0, true).unwrap().token,
                FILE,
                true
            )
            .is_err()
        );
        let fixture = fixture();
        for bytes in [b"binary\0".as_slice(), b"mixed\r\nline\n", b"nonutf8\xff"] {
            fs::write(fixture.0.path.join(FILE), bytes).unwrap();
            assert!(
                preview(
                    &fixture.0,
                    &changes::read(&fixture.0, true).unwrap().token,
                    FILE,
                    true
                )
                .is_err()
            );
        }
    }
    #[test]
    fn backup_creation_failure_leaves_file_untouched() {
        let fixture = fixture();
        let reviewed = plan(&fixture);
        fs::create_dir(
            reviewed
                .git_dir
                .join(format!("ravengit-conflict-{}", reviewed.view.token)),
        )
        .unwrap();
        let before = fs::read(fixture.0.path.join(FILE)).unwrap();
        assert!(save(&fixture.0, reviewed, "resuelto\n", true).is_err());
        assert_eq!(fs::read(fixture.0.path.join(FILE)).unwrap(), before);
    }
    #[cfg(unix)]
    #[test]
    fn symlink_worktree_is_not_edited() {
        let fixture = fixture();
        fs::remove_file(fixture.0.path.join(FILE)).unwrap();
        std::os::unix::fs::symlink("keep", fixture.0.path.join(FILE)).unwrap();
        assert!(
            preview(
                &fixture.0,
                &changes::read(&fixture.0, true).unwrap().token,
                FILE,
                true
            )
            .is_err()
        );
    }
}
