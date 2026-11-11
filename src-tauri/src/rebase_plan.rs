use crate::{
    git::{GitError, Result},
    rebase,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, fs, path::Path};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Pick,
    Reword,
    Squash,
    Fixup,
    Drop,
}
impl Action {
    pub fn word(&self) -> &'static str {
        match self {
            Self::Pick => "pick",
            Self::Reword => "reword",
            Self::Squash => "squash",
            Self::Fixup => "fixup",
            Self::Drop => "drop",
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub hash: String,
    pub action: Action,
    pub message: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub token: String,
    pub steps: Vec<Step>,
}
fn error(message: &str) -> GitError {
    GitError::new("REBASE_PLAN", message)
}
pub fn validate(preview: &rebase::Preview, steps: &[Step]) -> Result<()> {
    if preview.contains_merges
        || preview.truncated
        || steps.is_empty()
        || steps.len() > 50
        || steps.len() != preview.commits.len()
    {
        return Err(error(
            "Se requiere un rango lineal completo de 1 a 50 commits, sin merges.",
        ));
    }
    let mut seen = HashSet::new();
    let mut retained = false;
    for step in steps {
        if !preview
            .commits
            .iter()
            .any(|commit| commit.hash == step.hash)
            || !seen.insert(&step.hash)
        {
            return Err(error(
                "El plan debe incluir cada commit original exactamente una vez.",
            ));
        }
        if step.message.len() > 4096
            || step.message.contains('\0')
            || step
                .message
                .chars()
                .any(|c| c.is_control() && c != '\n' && c != '\t')
        {
            return Err(error(
                "Cada mensaje admite hasta 4096 bytes UTF-8, sin NUL ni retornos CR.",
            ));
        }
        match step.action {
            Action::Pick => {
                retained = true;
                if !step.message.is_empty() {
                    return Err(error("Pick conserva el mensaje original."));
                }
            }
            Action::Reword => {
                retained = true;
                if step.message.trim().is_empty() {
                    return Err(error("Reword requiere el mensaje final."));
                }
            }
            Action::Squash | Action::Fixup if !retained => {
                return Err(error(
                    "Squash y fixup necesitan un commit anterior conservado.",
                ));
            }
            Action::Squash if step.message.trim().is_empty() => {
                return Err(error("Squash requiere el mensaje final del grupo."));
            }
            Action::Drop | Action::Fixup if !step.message.is_empty() => {
                return Err(error("Drop y fixup no admiten un mensaje nuevo."));
            }
            _ => {}
        }
    }
    if !retained {
        return Err(error(
            "Conserva al menos un commit; no se admite eliminar todo el rango.",
        ));
    }
    Ok(())
}
pub fn todo(plan: &Plan) -> String {
    plan.steps
        .iter()
        .map(|s| format!("{} {}\n", s.action.word(), s.hash))
        .collect()
}
pub fn check_sequence(plan: &Plan, done: &str, pending: &str) -> Result<()> {
    let actual = [done, pending]
        .into_iter()
        .flat_map(|text| text.lines())
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .collect::<Vec<_>>();
    if actual.len() != plan.steps.len()
        || actual.iter().zip(&plan.steps).any(|(line, step)| {
            let mut fields = line.split_whitespace();
            fields.next() != Some(step.action.word())
                || fields
                    .next()
                    .is_none_or(|hash| hash.len() < 7 || !step.hash.starts_with(hash))
        })
    {
        return Err(error(
            "La secuencia difiere del plan revisado. Conserva el respaldo y recupera desde Git.",
        ));
    }
    Ok(())
}
pub fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn regular(path: &Path, limit: u64) -> Result<Vec<u8>> {
    let meta = fs::symlink_metadata(path)
        .map_err(|_| error("No se pudo comprobar el archivo del editor interno."))?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > limit {
        return Err(error("Archivo del editor interno no válido."));
    }
    fs::read(path).map_err(|_| error("No se pudo leer el archivo del editor interno."))
}
// Git invokes this application in a restricted editor mode, before Tauri starts.
// No shell instructions or paths from editable messages are executed.
pub fn editor(mode: &str, record: &Path, expected: &str, target: &Path) -> Result<()> {
    let bytes = regular(record, 512 * 1024)?;
    if digest(&bytes) != expected {
        return Err(error("El registro del editor cambió."));
    }
    let saved: rebase::Saved =
        serde_json::from_slice(&bytes).map_err(|_| error("Registro interno no válido."))?;
    let plan = saved
        .interactive
        .ok_or_else(|| error("Falta el plan interactivo."))?;
    let dir = record
        .parent()
        .ok_or_else(|| error("Falta carpeta Git."))?
        .canonicalize()
        .map_err(|_| error("Carpeta Git no válida."))?;
    let sequence_dir = fs::symlink_metadata(dir.join("rebase-merge"))
        .map_err(|_| error("Falta carpeta de secuencia."))?;
    if !sequence_dir.is_dir() || sequence_dir.file_type().is_symlink() {
        return Err(error("No se siguen enlaces a la secuencia."));
    }
    let expected_target = match mode {
        "sequence" => dir.join("rebase-merge/git-rebase-todo"),
        "message" => dir.join("COMMIT_EDITMSG"),
        _ => return Err(error("Modo de editor interno no válido.")),
    };
    regular(target, 2 * 1024 * 1024)?;
    let actual = target
        .canonicalize()
        .map_err(|_| error("Destino no verificable."))?;
    let expected = expected_target
        .canonicalize()
        .map_err(|_| error("Destino Git no verificable."))?;
    if actual != expected {
        return Err(error("Destino del editor interno no válido."));
    }
    let content = if mode == "sequence" {
        Some(todo(&plan).into_bytes())
    } else {
        let done = String::from_utf8(regular(&dir.join("rebase-merge/done"), 512 * 1024)?)
            .map_err(|_| error("Secuencia no válida."))?;
        let last = done
            .lines()
            .rfind(|l| !l.trim().is_empty() && !l.starts_with('#'))
            .ok_or_else(|| error("Falta commit actual."))?;
        let hash = last
            .split_whitespace()
            .nth(1)
            .ok_or_else(|| error("Commit actual no válido."))?;
        let index = plan
            .steps
            .iter()
            .position(|s| s.hash.starts_with(hash))
            .ok_or_else(|| error("Commit fuera del plan."))?;
        let mut message = None;
        let mut original = None;
        for step in plan.steps[..=index].iter().rev() {
            if matches!(step.action, Action::Reword | Action::Squash) {
                message = Some(
                    format!(
                        "{}{}",
                        step.message,
                        if step.message.ends_with('\n') {
                            ""
                        } else {
                            "\n"
                        }
                    )
                    .into_bytes(),
                );
                break;
            }
            if step.action == Action::Pick {
                original = Some(step.hash.as_str());
                break;
            }
        }
        if message.is_none() {
            let hash =
                original.ok_or_else(|| error("No se pudo identificar el mensaje original."))?;
            let repo = dir.parent().ok_or_else(|| error("Falta repositorio."))?;
            let object = crate::git::run(repo, &["cat-file", "commit", hash])?;
            if object.len() >= 2 * 1024 * 1024 {
                return Err(error(
                    "Mensaje original demasiado grande para revisión guiada.",
                ));
            }
            let offset = object
                .windows(2)
                .position(|bytes| bytes == b"\n\n")
                .ok_or_else(|| error("Objeto commit no válido."))?
                + 2;
            message = Some(object[offset..].to_vec());
        }
        message
    };
    if let Some(content) = content {
        fs::write(target, content)
            .map_err(|_| error("No se pudo escribir el contenido revisado."))?;
    }
    Ok(())
}
pub fn shell_quote(text: &str) -> String {
    #[cfg(windows)]
    let normalized = text.replace('\\', "/");
    #[cfg(windows)]
    let text = normalized.as_str();
    format!("'{}'", text.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sequence_must_match_reviewed_actions_and_order_without_exec_or_omissions() {
        let plan = Plan {
            token: "t".into(),
            steps: vec![
                Step {
                    hash: "a".repeat(40),
                    action: Action::Reword,
                    message: "literal".into(),
                },
                Step {
                    hash: "b".repeat(40),
                    action: Action::Fixup,
                    message: String::new(),
                },
            ],
        };
        assert!(
            check_sequence(
                &plan,
                "reword aaaaaaaa subject\n",
                "fixup bbbbbbbb subject\n"
            )
            .is_ok()
        );
        for bad in [
            "exec command\n",
            "pick aaaaaaaa\nfixup bbbbbbbb\n",
            "fixup bbbbbbbb\nreword aaaaaaaa\n",
            "reword aaaaaaaa\n",
        ] {
            assert!(check_sequence(&plan, "", bad).is_err());
        }
    }
}
