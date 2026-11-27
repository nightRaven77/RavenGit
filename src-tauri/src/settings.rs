//! Local application appearance and external tool preferences. Never touches Git repositories.
use crate::git::{GitError, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const VERSION: u8 = 1;
const MAX_BYTES: u64 = 64 * 1024;
const MAX_OPEN_TABS: usize = 12;
const FILE_NAME: &str = "settings-v1.json";
static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

pub const THEMES: [&str; 7] = [
    "obsidian",
    "raven-violet",
    "emerald-abyss",
    "crimson-dusk",
    "nordic-slate",
    "arctic-light",
    "high-contrast",
];

pub const GRAPH_PALETTES: [&str; 5] = ["kraken", "identity", "neon", "pastel", "accessible"];
pub const GRAPH_STYLES: [&str; 2] = ["tributary", "compact"];

fn default_graph_style() -> String {
    "tributary".into()
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct ExternalPreferences {
    pub preferred_editor_id: Option<String>,
    pub preferred_terminal_id: Option<String>,
    pub custom_editor_path: Option<String>,
    pub custom_editor_name: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct SnapshotPreferences {
    pub auto_enabled: bool,
    pub interval_minutes: u16,
    pub max_snapshots: u16,
    pub max_disk_mb: u16,
}

impl Default for SnapshotPreferences {
    fn default() -> Self {
        Self {
            auto_enabled: true,
            interval_minutes: 10,
            max_snapshots: 30,
            max_disk_mb: 100,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub version: u8,
    pub theme: String,
    pub graph_palette: String,
    #[serde(default = "default_graph_style")]
    pub graph_style: String,
    pub simple_mode: bool,
    pub external: ExternalPreferences,
    pub open_tabs: Vec<String>,
    pub active_tab: Option<String>,
    pub snapshots: SnapshotPreferences,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: VERSION,
            theme: "obsidian".into(),
            graph_palette: "kraken".into(),
            graph_style: default_graph_style(),
            simple_mode: false,
            external: ExternalPreferences::default(),
            open_tabs: Vec::new(),
            active_tab: None,
            snapshots: SnapshotPreferences::default(),
        }
    }
}

fn error(code: &'static str, text: &str) -> GitError {
    GitError::new(code, text)
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn valid_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 4096
        && !value.chars().any(|ch| ch == '\0' || ch.is_control())
}

fn valid_name(value: &str) -> bool {
    !value.is_empty()
        && value == value.trim()
        && value.chars().count() <= 80
        && !value.chars().any(char::is_control)
}

pub fn validate(settings: &AppSettings) -> Result<()> {
    let invalid = || {
        error(
            "SETTINGS_INVALID",
            "La configuración local de RavenGit contiene valores no válidos.",
        )
    };
    if settings.version != VERSION
        || !THEMES.contains(&settings.theme.as_str())
        || !GRAPH_PALETTES.contains(&settings.graph_palette.as_str())
        || !GRAPH_STYLES.contains(&settings.graph_style.as_str())
        || settings.open_tabs.len() > MAX_OPEN_TABS
        || settings.open_tabs.iter().any(|path| !valid_path(path))
        || settings
            .active_tab
            .as_deref()
            .is_some_and(|path| !valid_path(path))
        || settings
            .external
            .preferred_editor_id
            .as_deref()
            .is_some_and(|id| !valid_id(id))
        || settings
            .external
            .preferred_terminal_id
            .as_deref()
            .is_some_and(|id| !valid_id(id))
        || settings
            .external
            .custom_editor_path
            .as_deref()
            .is_some_and(|path| !valid_path(path))
        || settings
            .external
            .custom_editor_name
            .as_deref()
            .is_some_and(|name| !valid_name(name))
        || !(1..=120).contains(&settings.snapshots.interval_minutes)
        || !(5..=200).contains(&settings.snapshots.max_snapshots)
        || !(10..=2048).contains(&settings.snapshots.max_disk_mb)
    {
        return Err(invalid());
    }
    let mut seen_tabs = std::collections::HashSet::with_capacity(settings.open_tabs.len());
    for tab in &settings.open_tabs {
        if !seen_tabs.insert(tab.as_str()) {
            return Err(invalid());
        }
    }
    Ok(())
}

pub fn read(directory: &Path) -> Result<AppSettings> {
    let file = match fs::File::open(directory.join(FILE_NAME)) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(AppSettings::default()),
        Err(_) => {
            return Err(error(
                "SETTINGS_READ",
                "No se pudo leer la configuración local.",
            ));
        }
    };
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| error("SETTINGS_READ", "No se pudo leer la configuración local."))?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(error(
            "SETTINGS_FORMAT",
            "La configuración local excede el tamaño permitido y se conserva sin sobrescribir.",
        ));
    }
    let parsed: AppSettings = serde_json::from_slice(&bytes).map_err(|_| {
        error(
            "SETTINGS_FORMAT",
            "La configuración local tiene un formato no compatible y se conserva sin sobrescribir.",
        )
    })?;
    validate(&parsed)?;
    Ok(parsed)
}

pub fn save(directory: &Path, settings: &AppSettings) -> Result<AppSettings> {
    validate(settings)?;
    let fail = || {
        error(
            "SETTINGS_SAVE",
            "No se pudo guardar la configuración de RavenGit. El repositorio Git no se ha modificado.",
        )
    };
    let bytes = serde_json::to_vec_pretty(settings).map_err(|_| fail())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(fail());
    }
    fs::create_dir_all(directory).map_err(|_| fail())?;
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp = directory.join(format!(
        "settings-{}-{}-{suffix}.tmp",
        std::process::id(),
        NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
    ));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|_| fail())?;
    let result = (|| -> std::io::Result<()> {
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, directory.join(FILE_NAME))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|_| fail())?;
    Ok(settings.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    static NEXT: AtomicU64 = AtomicU64::new(0);

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "ravengit-settings-{}-{}",
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
    fn missing_file_returns_default_without_writing() {
        let fixture = Fixture::new();
        let loaded = read(&fixture.0).unwrap();
        assert_eq!(loaded, AppSettings::default());
        assert!(!fixture.0.join(FILE_NAME).exists());
    }

    #[test]
    fn save_and_read_round_trip() {
        let fixture = Fixture::new();
        let settings = AppSettings {
            version: 1,
            theme: "raven-violet".into(),
            graph_palette: "neon".into(),
            graph_style: "compact".into(),
            simple_mode: true,
            external: ExternalPreferences {
                preferred_editor_id: Some("antigravity".into()),
                preferred_terminal_id: Some("iterm2".into()),
                custom_editor_path: Some("/Applications/Custom.app".into()),
                custom_editor_name: Some("Custom Editor".into()),
            },
            open_tabs: vec![
                "/Users/erick/repo-uno".into(),
                "/Users/erick/repo-dos".into(),
            ],
            active_tab: Some("/Users/erick/repo-dos".into()),
            snapshots: SnapshotPreferences {
                auto_enabled: false,
                interval_minutes: 15,
                max_snapshots: 50,
                max_disk_mb: 250,
            },
        };
        let saved = save(&fixture.0, &settings).unwrap();
        assert_eq!(saved, settings);
        let reloaded = read(&fixture.0).unwrap();
        assert_eq!(reloaded, settings);

        // Legacy v1 settings without openTabs / activeTab / snapshots must deserialize cleanly
        fs::write(
            fixture.0.join(FILE_NAME),
            br#"{"version":1,"theme":"obsidian","graphPalette":"kraken","external":{}}"#,
        )
        .unwrap();
        let legacy = read(&fixture.0).unwrap();
        assert!(legacy.open_tabs.is_empty());
        assert_eq!(legacy.active_tab, None);
        assert_eq!(legacy.snapshots, SnapshotPreferences::default());
        assert_eq!(legacy.graph_style, "tributary");
        assert!(!legacy.simple_mode);
    }

    #[test]
    fn rejects_invalid_values_and_preserves_corrupt_file() {
        let fixture = Fixture::new();
        let invalid_cases = [
            AppSettings {
                version: 2,
                ..AppSettings::default()
            },
            AppSettings {
                theme: "unknown-theme".into(),
                ..AppSettings::default()
            },
            AppSettings {
                graph_palette: "unknown-palette".into(),
                ..AppSettings::default()
            },
            AppSettings {
                graph_style: "unknown-style".into(),
                ..AppSettings::default()
            },
            AppSettings {
                open_tabs: (0..=MAX_OPEN_TABS).map(|i| format!("/repo-{i}")).collect(),
                ..AppSettings::default()
            },
            AppSettings {
                open_tabs: vec!["/dup".into(), "/dup".into()],
                ..AppSettings::default()
            },
            AppSettings {
                active_tab: Some("/bad\0/tab".into()),
                ..AppSettings::default()
            },
            AppSettings {
                external: ExternalPreferences {
                    preferred_editor_id: Some("bad id!".into()),
                    ..ExternalPreferences::default()
                },
                ..AppSettings::default()
            },
            AppSettings {
                external: ExternalPreferences {
                    preferred_terminal_id: Some(String::new()),
                    ..ExternalPreferences::default()
                },
                ..AppSettings::default()
            },
            AppSettings {
                external: ExternalPreferences {
                    custom_editor_path: Some("/bad\0/path".into()),
                    ..ExternalPreferences::default()
                },
                ..AppSettings::default()
            },
            AppSettings {
                external: ExternalPreferences {
                    custom_editor_name: Some("  padded  ".into()),
                    ..ExternalPreferences::default()
                },
                ..AppSettings::default()
            },
            AppSettings {
                external: ExternalPreferences {
                    custom_editor_name: Some("line\nbreak".into()),
                    ..ExternalPreferences::default()
                },
                ..AppSettings::default()
            },
            AppSettings {
                snapshots: SnapshotPreferences {
                    interval_minutes: 0,
                    ..SnapshotPreferences::default()
                },
                ..AppSettings::default()
            },
            AppSettings {
                snapshots: SnapshotPreferences {
                    max_snapshots: 4,
                    ..SnapshotPreferences::default()
                },
                ..AppSettings::default()
            },
            AppSettings {
                snapshots: SnapshotPreferences {
                    max_disk_mb: 5000,
                    ..SnapshotPreferences::default()
                },
                ..AppSettings::default()
            },
        ];
        for case in invalid_cases {
            assert!(save(&fixture.0, &case).is_err());
        }

        let file = fixture.0.join(FILE_NAME);
        for raw in [
            b"not-json".as_slice(),
            br#"{"version":99,"theme":"obsidian","graphPalette":"kraken"}"#.as_slice(),
            br#"{"version":1,"theme":"bogus","graphPalette":"kraken"}"#.as_slice(),
        ] {
            fs::write(&file, raw).unwrap();
            assert!(read(&fixture.0).is_err());
            assert_eq!(fs::read(&file).unwrap(), raw);
        }
    }
}
