//! Safe detection and launching of external editors, terminals, and file explorers.
//! Uses explicit argument lists without shell interpolation.
use crate::{
    git::{self, GitError, Repository, Result},
    settings::ExternalPreferences,
};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExternalKind {
    Editor,
    Terminal,
    Explorer,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExternalApp {
    pub id: String,
    pub name: String,
    pub kind: ExternalKind,
    pub command: String,
    pub custom: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppsState {
    pub editors: Vec<ExternalApp>,
    pub terminals: Vec<ExternalApp>,
    pub explorer: ExternalApp,
    pub preferences: ExternalPreferences,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenExternalOutcome {
    pub app_id: String,
    pub app_name: String,
    pub kind: ExternalKind,
    pub message: String,
}

fn find_in_path(bins: &[&str]) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|raw| std::env::split_paths(&raw).collect())
        .unwrap_or_default();

    #[cfg(unix)]
    {
        for extra in ["/opt/homebrew/bin", "/usr/local/bin"] {
            let candidate = PathBuf::from(extra);
            if !dirs.contains(&candidate) {
                dirs.push(candidate);
            }
        }
        if let Some(home) = std::env::var_os("HOME") {
            let local_bin = PathBuf::from(home).join(".local/bin");
            if !dirs.contains(&local_bin) {
                dirs.push(local_bin);
            }
        }
    }

    for bin in bins {
        for dir in &dirs {
            let candidate = dir.join(bin);
            if is_executable_file(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

#[cfg(target_os = "macos")]
fn find_macos_app(bundles: &[&str]) -> Option<PathBuf> {
    let mut roots = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        roots.insert(1, PathBuf::from(home).join("Applications"));
    }
    for bundle in bundles {
        for root in &roots {
            let candidate = root.join(bundle);
            if candidate.is_dir() {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn detect_platform_editors() -> Vec<ExternalApp> {
    const CATALOG: [(&str, &str, &[&str], &[&str]); 17] = [
        (
            "antigravity",
            "Antigravity IDE",
            &["Antigravity.app", "Antigravity IDE.app"],
            &["antigravity"],
        ),
        (
            "vscode",
            "Visual Studio Code",
            &["Visual Studio Code.app"],
            &["code"],
        ),
        (
            "vscode-insiders",
            "VS Code Insiders",
            &["Visual Studio Code - Insiders.app"],
            &["code-insiders"],
        ),
        ("cursor", "Cursor", &["Cursor.app"], &["cursor"]),
        ("windsurf", "Windsurf", &["Windsurf.app"], &["windsurf"]),
        ("zed", "Zed", &["Zed.app"], &["zed"]),
        ("vscodium", "VSCodium", &["VSCodium.app"], &["codium"]),
        ("sublime", "Sublime Text", &["Sublime Text.app"], &["subl"]),
        (
            "intellij",
            "IntelliJ IDEA",
            &[
                "IntelliJ IDEA.app",
                "IntelliJ IDEA CE.app",
                "IntelliJ IDEA Ultimate.app",
            ],
            &["idea"],
        ),
        ("webstorm", "WebStorm", &["WebStorm.app"], &["webstorm"]),
        (
            "pycharm",
            "PyCharm",
            &["PyCharm.app", "PyCharm CE.app"],
            &["pycharm"],
        ),
        ("rustrover", "RustRover", &["RustRover.app"], &["rustrover"]),
        ("fleet", "JetBrains Fleet", &["Fleet.app"], &["fleet"]),
        ("xcode", "Xcode", &["Xcode.app"], &[]),
        ("nova", "Nova", &["Nova.app"], &[]),
        ("neovide", "Neovide", &["Neovide.app"], &["neovide"]),
        ("macvim", "MacVim", &["MacVim.app"], &["mvim"]),
    ];

    CATALOG
        .iter()
        .filter_map(|(id, name, bundles, cli)| {
            let found = find_macos_app(bundles).or_else(|| find_in_path(cli))?;
            Some(ExternalApp {
                id: (*id).into(),
                name: (*name).into(),
                kind: ExternalKind::Editor,
                command: found.to_string_lossy().into_owned(),
                custom: false,
            })
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn detect_platform_terminals() -> Vec<ExternalApp> {
    const CATALOG: [(&str, &str, &[&str]); 8] = [
        ("terminal", "Terminal", &["Terminal.app"]),
        ("iterm2", "iTerm2", &["iTerm.app"]),
        ("warp", "Warp", &["Warp.app"]),
        ("ghostty", "Ghostty", &["Ghostty.app"]),
        ("wezterm", "WezTerm", &["WezTerm.app"]),
        ("kitty", "kitty", &["kitty.app"]),
        ("alacritty", "Alacritty", &["Alacritty.app"]),
        ("hyper", "Hyper", &["Hyper.app"]),
    ];

    let mut terminals: Vec<ExternalApp> = CATALOG
        .iter()
        .filter_map(|(id, name, bundles)| {
            let found = find_macos_app(bundles)?;
            Some(ExternalApp {
                id: (*id).into(),
                name: (*name).into(),
                kind: ExternalKind::Terminal,
                command: found.to_string_lossy().into_owned(),
                custom: false,
            })
        })
        .collect();

    if !terminals.iter().any(|item| item.id == "terminal") {
        terminals.insert(
            0,
            ExternalApp {
                id: "terminal".into(),
                name: "Terminal".into(),
                kind: ExternalKind::Terminal,
                command: "Terminal".into(),
                custom: false,
            },
        );
    }
    terminals
}

#[cfg(target_os = "macos")]
fn platform_explorer() -> ExternalApp {
    ExternalApp {
        id: "finder".into(),
        name: "Finder".into(),
        kind: ExternalKind::Explorer,
        command: "open".into(),
        custom: false,
    }
}

#[cfg(target_os = "windows")]
fn find_windows_app(relative_paths: &[&str], path_bins: &[&str]) -> Option<PathBuf> {
    let mut roots = Vec::new();
    for env_key in ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(value) = std::env::var_os(env_key) {
            roots.push(PathBuf::from(value));
        }
    }
    for rel in relative_paths {
        for root in &roots {
            let candidate = root.join(rel);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    find_in_path(path_bins)
}

#[cfg(target_os = "windows")]
fn detect_platform_editors() -> Vec<ExternalApp> {
    const CATALOG: [(&str, &str, &[&str], &[&str]); 14] = [
        (
            "antigravity",
            "Antigravity IDE",
            &[
                r"Programs\Antigravity\Antigravity.exe",
                r"Programs\Antigravity IDE\Antigravity IDE.exe",
            ],
            &["antigravity.cmd", "antigravity.exe"],
        ),
        (
            "vscode",
            "Visual Studio Code",
            &[
                r"Programs\Microsoft VS Code\Code.exe",
                r"Microsoft VS Code\Code.exe",
            ],
            &["code.cmd", "code.exe"],
        ),
        (
            "vscode-insiders",
            "VS Code Insiders",
            &[
                r"Programs\Microsoft VS Code Insiders\Code - Insiders.exe",
                r"Microsoft VS Code Insiders\Code - Insiders.exe",
            ],
            &["code-insiders.cmd", "code-insiders.exe"],
        ),
        (
            "cursor",
            "Cursor",
            &[r"Programs\cursor\Cursor.exe", r"Programs\Cursor\Cursor.exe"],
            &["cursor.cmd", "cursor.exe"],
        ),
        (
            "windsurf",
            "Windsurf",
            &[r"Programs\Windsurf\Windsurf.exe"],
            &["windsurf.cmd", "windsurf.exe"],
        ),
        ("zed", "Zed", &[r"Programs\Zed\Zed.exe"], &["zed.exe"]),
        (
            "vscodium",
            "VSCodium",
            &[r"Programs\VSCodium\VSCodium.exe", r"VSCodium\VSCodium.exe"],
            &["codium.cmd", "codium.exe"],
        ),
        (
            "sublime",
            "Sublime Text",
            &[r"Sublime Text\sublime_text.exe"],
            &["subl.exe"],
        ),
        (
            "notepadpp",
            "Notepad++",
            &[r"Notepad++\notepad++.exe"],
            &["notepad++.exe"],
        ),
        (
            "intellij",
            "IntelliJ IDEA",
            &[],
            &["idea64.exe", "idea.bat"],
        ),
        (
            "webstorm",
            "WebStorm",
            &[],
            &["webstorm64.exe", "webstorm.bat"],
        ),
        ("pycharm", "PyCharm", &[], &["pycharm64.exe", "pycharm.bat"]),
        (
            "rustrover",
            "RustRover",
            &[],
            &["rustrover64.exe", "rustrover.bat"],
        ),
        ("neovide", "Neovide", &[], &["neovide.exe"]),
    ];

    CATALOG
        .iter()
        .filter_map(|(id, name, rels, bins)| {
            let found = find_windows_app(rels, bins)?;
            Some(ExternalApp {
                id: (*id).into(),
                name: (*name).into(),
                kind: ExternalKind::Editor,
                command: found.to_string_lossy().into_owned(),
                custom: false,
            })
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn detect_platform_terminals() -> Vec<ExternalApp> {
    let mut terminals = Vec::new();
    if let Some(wt) = find_windows_app(&[r"Microsoft\WindowsApps\wt.exe"], &["wt.exe"]) {
        terminals.push(ExternalApp {
            id: "windows-terminal".into(),
            name: "Windows Terminal".into(),
            kind: ExternalKind::Terminal,
            command: wt.to_string_lossy().into_owned(),
            custom: false,
        });
    }
    if let Some(pwsh) = find_windows_app(&[r"PowerShell\7\pwsh.exe"], &["pwsh.exe"]) {
        terminals.push(ExternalApp {
            id: "pwsh".into(),
            name: "PowerShell 7".into(),
            kind: ExternalKind::Terminal,
            command: pwsh.to_string_lossy().into_owned(),
            custom: false,
        });
    }
    terminals.push(ExternalApp {
        id: "powershell".into(),
        name: "Windows PowerShell".into(),
        kind: ExternalKind::Terminal,
        command: find_in_path(&["powershell.exe"])
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|| "powershell.exe".into()),
        custom: false,
    });
    if let Some(git_bash) = find_windows_app(&[r"Git\git-bash.exe"], &["git-bash.exe"]) {
        terminals.push(ExternalApp {
            id: "git-bash".into(),
            name: "Git Bash".into(),
            kind: ExternalKind::Terminal,
            command: git_bash.to_string_lossy().into_owned(),
            custom: false,
        });
    }
    terminals.push(ExternalApp {
        id: "cmd".into(),
        name: "Símbolo del sistema (CMD)".into(),
        kind: ExternalKind::Terminal,
        command: "cmd.exe".into(),
        custom: false,
    });
    terminals
}

#[cfg(target_os = "windows")]
fn platform_explorer() -> ExternalApp {
    ExternalApp {
        id: "explorer".into(),
        name: "Explorador de archivos".into(),
        kind: ExternalKind::Explorer,
        command: "explorer.exe".into(),
        custom: false,
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn detect_platform_editors() -> Vec<ExternalApp> {
    const CATALOG: [(&str, &str, &[&str]); 15] = [
        ("antigravity", "Antigravity IDE", &["antigravity"]),
        ("vscode", "Visual Studio Code", &["code"]),
        ("vscode-insiders", "VS Code Insiders", &["code-insiders"]),
        ("cursor", "Cursor", &["cursor"]),
        ("windsurf", "Windsurf", &["windsurf"]),
        ("zed", "Zed", &["zed", "zeditor"]),
        ("vscodium", "VSCodium", &["codium"]),
        ("sublime", "Sublime Text", &["subl"]),
        ("intellij", "IntelliJ IDEA", &["idea"]),
        ("webstorm", "WebStorm", &["webstorm"]),
        ("pycharm", "PyCharm", &["pycharm"]),
        ("rustrover", "RustRover", &["rustrover"]),
        ("fleet", "JetBrains Fleet", &["fleet"]),
        ("neovide", "Neovide", &["neovide"]),
        ("kate", "Kate", &["kate"]),
    ];

    CATALOG
        .iter()
        .filter_map(|(id, name, bins)| {
            let found = find_in_path(bins)?;
            Some(ExternalApp {
                id: (*id).into(),
                name: (*name).into(),
                kind: ExternalKind::Editor,
                command: found.to_string_lossy().into_owned(),
                custom: false,
            })
        })
        .collect()
}

#[cfg(all(unix, not(target_os = "macos")))]
fn detect_platform_terminals() -> Vec<ExternalApp> {
    const CATALOG: [(&str, &str, &[&str]); 8] = [
        ("ghostty", "Ghostty", &["ghostty"]),
        ("kitty", "kitty", &["kitty"]),
        ("alacritty", "Alacritty", &["alacritty"]),
        ("wezterm", "WezTerm", &["wezterm"]),
        ("konsole", "Konsole", &["konsole"]),
        ("gnome-terminal", "GNOME Terminal", &["gnome-terminal"]),
        ("xfce4-terminal", "XFCE Terminal", &["xfce4-terminal"]),
        (
            "x-terminal-emulator",
            "Terminal del sistema",
            &["x-terminal-emulator"],
        ),
    ];

    CATALOG
        .iter()
        .filter_map(|(id, name, bins)| {
            let found = find_in_path(bins)?;
            Some(ExternalApp {
                id: (*id).into(),
                name: (*name).into(),
                kind: ExternalKind::Terminal,
                command: found.to_string_lossy().into_owned(),
                custom: false,
            })
        })
        .collect()
}

#[cfg(all(unix, not(target_os = "macos")))]
fn platform_explorer() -> ExternalApp {
    ExternalApp {
        id: "files".into(),
        name: "Gestor de archivos".into(),
        kind: ExternalKind::Explorer,
        command: "xdg-open".into(),
        custom: false,
    }
}

fn custom_editor_name(path: &Path, saved_name: Option<&str>) -> String {
    if let Some(name) = saved_name.map(str::trim).filter(|s| !s.is_empty()) {
        return name.to_string();
    }
    path.file_stem()
        .or_else(|| path.file_name())
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Editor personalizado".into())
}

pub fn detect_apps(preferences: &ExternalPreferences) -> ExternalAppsState {
    let mut editors = detect_platform_editors();
    if let Some(custom_path) = preferences.custom_editor_path.as_deref() {
        let path = Path::new(custom_path);
        if path.exists() {
            editors.push(ExternalApp {
                id: "custom".into(),
                name: custom_editor_name(path, preferences.custom_editor_name.as_deref()),
                kind: ExternalKind::Editor,
                command: custom_path.to_string(),
                custom: true,
            });
        }
    }

    ExternalAppsState {
        editors,
        terminals: detect_platform_terminals(),
        explorer: platform_explorer(),
        preferences: preferences.clone(),
    }
}

pub fn resolve_target(
    state: &ExternalAppsState,
    kind: ExternalKind,
    app_id: Option<&str>,
) -> Result<ExternalApp> {
    match kind {
        ExternalKind::Explorer => Ok(state.explorer.clone()),
        ExternalKind::Editor => {
            if let Some(id) = app_id {
                state
                    .editors
                    .iter()
                    .find(|item| item.id == id)
                    .cloned()
                    .ok_or_else(|| {
                        GitError::new(
                            "EXTERNAL_NOT_FOUND",
                            "El editor seleccionado ya no está disponible.",
                        )
                    })
            } else {
                state
                    .preferences
                    .preferred_editor_id
                    .as_deref()
                    .and_then(|pref| state.editors.iter().find(|item| item.id == pref))
                    .or_else(|| state.editors.first())
                    .cloned()
                    .ok_or_else(|| {
                        GitError::new(
                            "EXTERNAL_NOT_FOUND",
                            "No se detectó ningún editor instalado. Usa «Elegir otro editor…» para seleccionar uno.",
                        )
                    })
            }
        }
        ExternalKind::Terminal => {
            if let Some(id) = app_id {
                state
                    .terminals
                    .iter()
                    .find(|item| item.id == id)
                    .cloned()
                    .ok_or_else(|| {
                        GitError::new(
                            "EXTERNAL_NOT_FOUND",
                            "La terminal seleccionada ya no está disponible.",
                        )
                    })
            } else {
                state
                    .preferences
                    .preferred_terminal_id
                    .as_deref()
                    .and_then(|pref| state.terminals.iter().find(|item| item.id == pref))
                    .or_else(|| state.terminals.first())
                    .cloned()
                    .ok_or_else(|| {
                        GitError::new(
                            "EXTERNAL_NOT_FOUND",
                            "No se detectó ninguna terminal compatible en este sistema.",
                        )
                    })
            }
        }
    }
}

fn clean_repo_path(path: &Path) -> Result<PathBuf> {
    let canonical = path.canonicalize().map_err(|_| {
        GitError::new(
            "PATH_INVALID",
            "La carpeta del repositorio ya no existe o no es accesible.",
        )
    })?;
    if !canonical.is_dir() {
        return Err(GitError::new(
            "PATH_INVALID",
            "La ruta del repositorio no es una carpeta válida.",
        ));
    }
    #[cfg(windows)]
    {
        let text = canonical.to_string_lossy();
        if let Some(stripped) = text.strip_prefix(r"\\?\")
            && !stripped.starts_with(r"UNC\")
        {
            return Ok(PathBuf::from(stripped));
        }
    }
    Ok(canonical)
}

#[cfg(target_os = "macos")]
fn build_command(repo_path: &Path, target: &ExternalApp) -> Command {
    match target.kind {
        ExternalKind::Explorer => {
            let mut cmd = Command::new("open");
            cmd.arg(repo_path);
            cmd
        }
        ExternalKind::Editor | ExternalKind::Terminal => {
            let is_bundle = target.command.ends_with(".app")
                || (target.kind == ExternalKind::Terminal && target.command == "Terminal");
            if is_bundle {
                let mut cmd = Command::new("open");
                cmd.arg("-a").arg(&target.command);
                if target.id == "alacritty" {
                    cmd.arg("--args").arg("--working-directory").arg(repo_path);
                } else {
                    cmd.arg(repo_path);
                }
                cmd
            } else {
                let mut cmd = Command::new(&target.command);
                cmd.arg(repo_path);
                cmd
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn build_command(repo_path: &Path, target: &ExternalApp) -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    match target.kind {
        ExternalKind::Explorer => {
            let mut cmd = Command::new(&target.command);
            cmd.arg(repo_path);
            cmd
        }
        ExternalKind::Terminal => {
            let mut cmd = Command::new(&target.command);
            match target.id.as_str() {
                "windows-terminal" => {
                    cmd.arg("-d").arg(repo_path);
                }
                "git-bash" => {
                    cmd.arg(format!("--cd={}", repo_path.to_string_lossy()));
                }
                "pwsh" | "powershell" => {
                    cmd.arg("-NoExit")
                        .current_dir(repo_path)
                        .creation_flags(CREATE_NEW_CONSOLE);
                }
                _ => {
                    cmd.arg("/K")
                        .current_dir(repo_path)
                        .creation_flags(CREATE_NEW_CONSOLE);
                }
            }
            cmd
        }
        ExternalKind::Editor => {
            let mut cmd = Command::new(&target.command);
            cmd.arg(repo_path);
            let lower = target.command.to_ascii_lowercase();
            if lower.ends_with(".cmd") || lower.ends_with(".bat") {
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            cmd
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn build_command(repo_path: &Path, target: &ExternalApp) -> Command {
    match target.kind {
        ExternalKind::Explorer => {
            let mut cmd = Command::new(&target.command);
            cmd.arg(repo_path);
            cmd
        }
        ExternalKind::Terminal => {
            let mut cmd = Command::new(&target.command);
            match target.id.as_str() {
                "kitty" => {
                    cmd.arg("--directory").arg(repo_path);
                }
                "alacritty" | "gnome-terminal" | "xfce4-terminal" => {
                    cmd.arg("--working-directory").arg(repo_path);
                }
                "wezterm" => {
                    cmd.arg("start").arg("--cwd").arg(repo_path);
                }
                "konsole" => {
                    cmd.arg("--workdir").arg(repo_path);
                }
                _ => {
                    cmd.current_dir(repo_path);
                }
            }
            cmd
        }
        ExternalKind::Editor => {
            let mut cmd = Command::new(&target.command);
            cmd.arg(repo_path);
            cmd
        }
    }
}

pub fn open_in(
    repo: &Repository,
    kind: ExternalKind,
    app_id: Option<&str>,
    preferences: &ExternalPreferences,
) -> Result<OpenExternalOutcome> {
    let repo_path = clean_repo_path(&repo.path)?;
    let state = detect_apps(preferences);
    let target = resolve_target(&state, kind, app_id)?;

    let mut command = build_command(&repo_path, &target);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    command.spawn().map_err(|_| {
        git::GitError::new(
            "EXTERNAL_LAUNCH_FAILED",
            format!("No se pudo abrir {} para este repositorio.", target.name),
        )
    })?;

    Ok(OpenExternalOutcome {
        app_id: target.id,
        app_name: target.name.clone(),
        kind: target.kind,
        message: format!("Abierto en {}", target.name),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        sync::atomic::{AtomicU64, Ordering},
    };
    static NEXT: AtomicU64 = AtomicU64::new(0);

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "ravengit-external-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn detect_apps_always_provides_explorer_and_validates_custom_editor() {
        let fixture = Fixture::new();
        let state_none = detect_apps(&ExternalPreferences::default());
        assert_eq!(state_none.explorer.kind, ExternalKind::Explorer);
        assert!(!state_none.explorer.command.is_empty());
        assert!(!state_none.editors.iter().any(|app| app.id == "custom"));

        let missing_custom = ExternalPreferences {
            custom_editor_path: Some(fixture.0.join("Missing.app").to_string_lossy().into()),
            custom_editor_name: Some("Missing".into()),
            ..ExternalPreferences::default()
        };
        assert!(
            !detect_apps(&missing_custom)
                .editors
                .iter()
                .any(|app| app.id == "custom")
        );

        let custom_dir = fixture.0.join("MiEditor.app");
        fs::create_dir_all(&custom_dir).unwrap();
        let valid_custom = ExternalPreferences {
            custom_editor_path: Some(custom_dir.to_string_lossy().into()),
            custom_editor_name: None,
            ..ExternalPreferences::default()
        };
        let detected = detect_apps(&valid_custom);
        let custom = detected
            .editors
            .iter()
            .find(|app| app.id == "custom")
            .unwrap();
        assert!(custom.custom);
        assert_eq!(custom.name, "MiEditor");
    }

    #[test]
    fn resolve_target_respects_precedence_and_rejects_unknown_ids() {
        let state = ExternalAppsState {
            editors: vec![
                ExternalApp {
                    id: "antigravity".into(),
                    name: "Antigravity IDE".into(),
                    kind: ExternalKind::Editor,
                    command: "/Applications/Antigravity.app".into(),
                    custom: false,
                },
                ExternalApp {
                    id: "vscode".into(),
                    name: "Visual Studio Code".into(),
                    kind: ExternalKind::Editor,
                    command: "/Applications/Visual Studio Code.app".into(),
                    custom: false,
                },
            ],
            terminals: vec![
                ExternalApp {
                    id: "terminal".into(),
                    name: "Terminal".into(),
                    kind: ExternalKind::Terminal,
                    command: "Terminal".into(),
                    custom: false,
                },
                ExternalApp {
                    id: "iterm2".into(),
                    name: "iTerm2".into(),
                    kind: ExternalKind::Terminal,
                    command: "/Applications/iTerm.app".into(),
                    custom: false,
                },
            ],
            explorer: ExternalApp {
                id: "finder".into(),
                name: "Finder".into(),
                kind: ExternalKind::Explorer,
                command: "open".into(),
                custom: false,
            },
            preferences: ExternalPreferences {
                preferred_editor_id: Some("vscode".into()),
                preferred_terminal_id: Some("iterm2".into()),
                ..ExternalPreferences::default()
            },
        };

        assert_eq!(
            resolve_target(&state, ExternalKind::Editor, None)
                .unwrap()
                .id,
            "vscode"
        );
        assert_eq!(
            resolve_target(&state, ExternalKind::Editor, Some("antigravity"))
                .unwrap()
                .id,
            "antigravity"
        );
        assert_eq!(
            resolve_target(&state, ExternalKind::Terminal, None)
                .unwrap()
                .id,
            "iterm2"
        );
        assert_eq!(
            resolve_target(&state, ExternalKind::Explorer, None)
                .unwrap()
                .id,
            "finder"
        );
        assert_eq!(
            resolve_target(&state, ExternalKind::Editor, Some("nonexistent"))
                .unwrap_err()
                .code,
            "EXTERNAL_NOT_FOUND"
        );
    }

    #[test]
    fn open_in_rejects_missing_repository_directory_before_spawning() {
        let fixture = Fixture::new();
        let missing_repo = Repository {
            id: "missing".into(),
            path: fixture.0.join("deleted-repo"),
        };
        let err = open_in(
            &missing_repo,
            ExternalKind::Explorer,
            None,
            &ExternalPreferences::default(),
        )
        .unwrap_err();
        assert_eq!(err.code, "PATH_INVALID");
    }
}
