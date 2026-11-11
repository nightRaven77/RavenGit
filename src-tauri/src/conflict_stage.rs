use crate::{
    changes, conflict_edit,
    git::{self, GitError, Repository, Result},
};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    time::Duration,
};

pub struct Receipt {
    pub token: String,
    path: String,
    state: String,
    bytes: Vec<u8>,
    git_dir: PathBuf,
    operation: String,
    permissions: std::fs::Permissions,
}
#[derive(Clone, Serialize)]
pub struct Preview {
    pub token: String,
    pub path: String,
    pub hash: String,
    pub text: String,
    pub mode: String,
}
#[derive(Serialize)]
pub struct Outcome {
    pub message: String,
    pub warning: Option<String>,
}
fn stale() -> GitError {
    GitError::new(
        "CONFLICT_STAGE_STALE",
        "El archivo, índice u operación cambió. Actualiza y revisa la resolución; no se repite la preparación automáticamente.",
    )
}
pub fn saved(
    repo: &Repository,
    path: &str,
    bytes: &[u8],
    git_dir: PathBuf,
    operation: String,
) -> Option<Receipt> {
    let state = changes::read(repo, true).ok()?;
    let permissions = conflict_edit::bytes(&changes::validated_path(repo, path).ok()?)
        .ok()?
        .1;
    let receipt = Receipt {
        token: conflict_edit::nonce(),
        path: path.into(),
        state: state.token,
        bytes: bytes.into(),
        git_dir,
        operation,
        permissions,
    };
    check(repo, &receipt, true).ok()?;
    Some(receipt)
}
fn check(repo: &Repository, receipt: &Receipt, trusted: bool) -> Result<()> {
    if !trusted {
        return Err(GitError::new(
            "UNTRUSTED",
            "La autorización ya no está vigente.",
        ));
    }
    let full = changes::validated_path(repo, &receipt.path)?;
    let state = changes::read(repo, true)?;
    let current = conflict_edit::bytes(&full)?;
    if state.token != receipt.state
        || !state
            .entries
            .iter()
            .any(|entry| entry.path == receipt.path && entry.conflict && !entry.submodule)
        || current.0 != receipt.bytes
        || current.1 != receipt.permissions
        || conflict_edit::operation(&receipt.git_dir)? != receipt.operation
    {
        return Err(stale());
    }
    Ok(())
}
fn index(repo: &Repository, temporary: Option<&Path>) -> Result<Vec<Vec<u8>>> {
    let mut command = crate::process::git(&repo.path);
    command
        .args(["ls-files", "--stage", "-z"])
        .env("GIT_OPTIONAL_LOCKS", "0");
    if let Some(path) = temporary {
        command.env("GIT_INDEX_FILE", path);
    }
    let output = crate::process::execute(command, None, Duration::from_secs(15)).map_err(|_| {
        GitError::new(
            "CONFLICT_STAGE_READ",
            "No se pudo comprobar el índice de preparación.",
        )
    })?;
    if !output.success || output.bytes.len() > 2 * 1024 * 1024 {
        return Err(GitError::new(
            "CONFLICT_STAGE_READ",
            "El índice no se pudo comprobar o supera el límite de salida.",
        ));
    }
    Ok(output
        .bytes
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
        .map(|record| record.to_vec())
        .collect())
}
fn selected(record: &[u8], path: &str) -> bool {
    record
        .iter()
        .position(|byte| *byte == b'\t')
        .is_some_and(|offset| &record[offset + 1..] == path.as_bytes())
}
fn build(
    repo: &Repository,
    receipt: &Receipt,
    trusted: bool,
    reviewed: Option<&Preview>,
) -> Result<Preview> {
    check(repo, receipt, trusted)?;
    let transaction = changes::IndexTransaction::start(repo)?;
    check(repo, receipt, trusted)?;
    let before = index(repo, None)?;
    changes::write_git(
        repo,
        &transaction.temporary,
        &["add", "--", &receipt.path],
        None,
    )?;
    let after = index(repo, Some(&transaction.temporary))?;
    if before
        .iter()
        .filter(|record| !selected(record, &receipt.path))
        .collect::<Vec<_>>()
        != after
            .iter()
            .filter(|record| !selected(record, &receipt.path))
            .collect::<Vec<_>>()
    {
        return Err(stale());
    }
    let records: Vec<_> = after
        .iter()
        .filter(|record| selected(record, &receipt.path))
        .collect();
    if records.len() != 1 {
        return Err(stale());
    }
    let separator = records[0]
        .iter()
        .position(|byte| *byte == b'\t')
        .ok_or_else(stale)?;
    let header = std::str::from_utf8(&records[0][..separator]).map_err(|_| stale())?;
    let fields: Vec<_> = header.split(' ').collect();
    if fields.len() != 3
        || !matches!(fields[0], "100644" | "100755")
        || fields[2] != "0"
        || !matches!(fields[1].len(), 40 | 64)
        || !fields[1].bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(stale());
    }
    let size = git::text(
        &repo.path,
        &["--no-replace-objects", "cat-file", "-s", fields[1]],
    )?
    .trim()
    .parse::<usize>()
    .map_err(|_| stale())?;
    if size > 512 * 1024 {
        return Err(GitError::new(
            "CONFLICT_STAGE_TEXT",
            "El contenido preparado supera 512 KiB; utiliza Git externo.",
        ));
    }
    let bytes = git::run(
        &repo.path,
        &["--no-replace-objects", "cat-file", "blob", fields[1]],
    )?;
    let text = String::from_utf8(bytes).map_err(|_| {
        GitError::new(
            "CONFLICT_STAGE_TEXT",
            "El filtro produjo contenido no UTF-8; utiliza Git externo.",
        )
    })?;
    if text.len() != size
        || text.contains('\0')
        || text.lines().any(|line| {
            ["<<<<<<<", "|||||||", "=======", ">>>>>>>"]
                .iter()
                .any(|marker| line.starts_with(marker))
        })
    {
        return Err(GitError::new(
            "CONFLICT_STAGE_TEXT",
            "El contenido preparado contiene marcadores o datos binarios; no se instala.",
        ));
    }
    check(repo, receipt, trusted)?;
    let view = Preview {
        token: conflict_edit::nonce(),
        path: receipt.path.clone(),
        hash: fields[1].into(),
        text,
        mode: fields[0].into(),
    };
    if let Some(reviewed) = reviewed {
        if reviewed.hash != view.hash || reviewed.mode != view.mode {
            return Err(GitError::new(
                "CONFLICT_STAGE_FILTER",
                "Git produjo un contenido distinto del revisado. No se instaló el índice; revisa los filtros antes de repetir.",
            ));
        }
        transaction.install()?;
    }
    Ok(view)
}
pub fn preview(repo: &Repository, receipt: &Receipt, trusted: bool) -> Result<Preview> {
    build(repo, receipt, trusted, None)
}
pub fn prepare(
    repo: &Repository,
    receipt: Receipt,
    view: Preview,
    trusted: bool,
) -> Result<Outcome> {
    build(repo, &receipt, trusted, Some(&view))?;
    let confirmed = changes::read(repo, true).is_ok_and(|state| {
        !state
            .entries
            .iter()
            .any(|entry| entry.path == receipt.path && entry.conflict)
    });
    Ok(Outcome { message: "Resolución preparada. No se creó un commit ni se continuó la operación; revisa los conflictos restantes en su recuperación.".into(), warning: (!confirmed).then(|| "El índice se instaló, pero no se confirmó el refresco. Comprueba el estado antes de continuar; no repitas automáticamente.".into()) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conflicts::tests::Fixture;
    use std::fs;
    const FILE: &str = "archivo ü.txt";
    fn fixture() -> Fixture {
        let fixture = Fixture::new(Some(b"base\n"), Some(b"local\n"), b"incoming\n");
        fs::write(fixture.0.path.join("other.txt"), "unrelated\n").unwrap();
        fixture.git(&["add", "--", "other.txt"]);
        fixture
    }
    fn saved(fixture: &Fixture) -> Receipt {
        let token = changes::read(&fixture.0, true).unwrap().token;
        let plan = conflict_edit::preview(&fixture.0, &token, FILE, true).unwrap();
        conflict_edit::save(&fixture.0, plan, "resolved\n", true)
            .unwrap()
            .receipt
            .unwrap()
    }
    #[test]
    fn review_does_not_install_and_prepare_changes_only_selected_file() {
        let fixture = fixture();
        let receipt = saved(&fixture);
        let before = index(&fixture.0, None).unwrap();
        let head = git::text(&fixture.0.path, &["rev-parse", "HEAD"]).unwrap();
        let view = preview(&fixture.0, &receipt, true).unwrap();
        assert_eq!(view.text, "resolved\n");
        assert_eq!(index(&fixture.0, None).unwrap(), before);
        let outcome = prepare(&fixture.0, receipt, view, true).unwrap();
        assert!(outcome.warning.is_none());
        let after = index(&fixture.0, None).unwrap();
        assert_eq!(
            before
                .iter()
                .filter(|record| !selected(record, FILE))
                .collect::<Vec<_>>(),
            after
                .iter()
                .filter(|record| !selected(record, FILE))
                .collect::<Vec<_>>()
        );
        assert_eq!(
            after.iter().filter(|record| selected(record, FILE)).count(),
            1
        );
        assert_eq!(fs::read(fixture.0.path.join(FILE)).unwrap(), b"resolved\n");
        assert_eq!(
            git::text(&fixture.0.path, &["rev-parse", "HEAD"]).unwrap(),
            head
        );
        assert!(fixture.0.path.join(".git/MERGE_HEAD").is_file());
    }
    #[test]
    fn external_file_index_and_operation_changes_block_preparation() {
        for changed in ["file", "index", "operation"] {
            let fixture = fixture();
            let receipt = saved(&fixture);
            let view = preview(&fixture.0, &receipt, true).unwrap();
            match changed {
                "file" => fs::write(fixture.0.path.join(FILE), "external\n").unwrap(),
                "index" => {
                    fs::write(fixture.0.path.join("new.txt"), "new").unwrap();
                    fixture.git(&["add", "new.txt"]);
                }
                _ => fs::write(fixture.0.path.join(".git/MERGE_MSG"), "changed").unwrap(),
            }
            let before = index(&fixture.0, None).unwrap();
            assert!(prepare(&fixture.0, receipt, view, true).is_err());
            assert_eq!(index(&fixture.0, None).unwrap(), before);
        }
    }
    #[test]
    fn changed_clean_filter_output_is_not_installed() {
        let fixture = fixture();
        fs::write(
            fixture.0.path.join(".gitattributes"),
            "archivo*.txt filter=fixture\n",
        )
        .unwrap();
        fixture.git(&["config", "filter.fixture.clean", "cat"]);
        let receipt = saved(&fixture);
        let view = preview(&fixture.0, &receipt, true).unwrap();
        fixture.git(&["config", "filter.fixture.clean", "printf changed"]);
        let before = index(&fixture.0, None).unwrap();
        assert_eq!(
            prepare(&fixture.0, receipt, view, true).err().unwrap().code,
            "CONFLICT_STAGE_FILTER"
        );
        assert_eq!(index(&fixture.0, None).unwrap(), before);
    }
    #[test]
    fn respects_existing_index_lock_and_revoked_trust() {
        let fixture = fixture();
        let receipt = saved(&fixture);
        assert!(preview(&fixture.0, &receipt, false).is_err());
        let view = preview(&fixture.0, &receipt, true).unwrap();
        assert!(prepare(&fixture.0, receipt, view, false).is_err());
        let receipt = super::saved(
            &fixture.0,
            FILE,
            b"resolved\n",
            fixture.0.path.join(".git"),
            conflict_edit::operation(&fixture.0.path.join(".git")).unwrap(),
        )
        .unwrap();
        fs::write(fixture.0.path.join(".git/index.lock"), "external lock").unwrap();
        assert!(preview(&fixture.0, &receipt, true).is_err());
        assert_eq!(
            fs::read(fixture.0.path.join(".git/index.lock")).unwrap(),
            b"external lock"
        );
    }
    #[test]
    fn shows_git_normalized_content_and_keeps_crlf_worktree() {
        let fixture = fixture();
        fs::write(
            fixture.0.path.join(".gitattributes"),
            "*.txt text eol=crlf\n",
        )
        .unwrap();
        fs::write(fixture.0.path.join(FILE), "before\r\n").unwrap();
        let token = changes::read(&fixture.0, true).unwrap().token;
        let plan = conflict_edit::preview(&fixture.0, &token, FILE, true).unwrap();
        let receipt = conflict_edit::save(&fixture.0, plan, "resolved\n", true)
            .unwrap()
            .receipt
            .unwrap();
        let view = preview(&fixture.0, &receipt, true).unwrap();
        assert_eq!(view.text, "resolved\n");
        prepare(&fixture.0, receipt, view, true).unwrap();
        assert_eq!(
            fs::read(fixture.0.path.join(FILE)).unwrap(),
            b"resolved\r\n"
        );
    }
}
