//! Local application metadata only. Never edits Git configuration or repository files.
use crate::git::{GitError, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
const MAX_BYTES: u64 = 512 * 1024;
static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub inspector_open: bool,
    pub inspector_size: u8,
    pub author_width: u16,
    pub show_date: bool,
    pub show_hash: bool,
    pub scope: String,
    pub query: String,
    pub selected_commit: Option<String>,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            inspector_open: true,
            inspector_size: 38,
            author_width: 160,
            show_date: true,
            show_hash: false,
            scope: "all".into(),
            query: String::new(),
            selected_commit: None,
        }
    }
}
impl Preferences {
    fn valid(&self) -> bool {
        (30..=60).contains(&self.inspector_size)
            && (120..=240).contains(&self.author_width)
            && self.query.chars().count() <= 500
            && self.scope.len() <= 4096
            && (self.scope == "all"
                || self.scope == "HEAD"
                || self.scope.starts_with("refs/heads/")
                || self.scope.starts_with("refs/remotes/"))
            && self.selected_commit.as_ref().is_none_or(|hash| {
                matches!(hash.len(), 40 | 64) && hash.bytes().all(|b| b.is_ascii_hexdigit())
            })
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub pinned: bool,
    pub last_opened: u64,
    pub preferences: Preferences,
    #[serde(default)]
    pub collection_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub version: u8,
    pub repositories: Vec<Entry>,
    pub collections: Vec<Collection>,
}
impl Default for Library {
    fn default() -> Self {
        Self {
            version: 2,
            repositories: Vec::new(),
            collections: Vec::new(),
        }
    }
}
fn error(code: &'static str, text: &str) -> GitError {
    GitError::new(code, text)
}
fn read_file(directory: &Path, name: &str) -> Result<Option<Vec<u8>>> {
    let file = match fs::File::open(directory.join(name)) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => {
            return Err(error(
                "LIBRARY_READ",
                "No se pudo leer la biblioteca local.",
            ));
        }
    };
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| error("LIBRARY_READ", "No se pudo leer la biblioteca local."))?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(invalid());
    }
    Ok(Some(bytes))
}
fn invalid() -> GitError {
    error(
        "LIBRARY_FORMAT",
        "La biblioteca local tiene un formato no compatible. Se conserva sin sobrescribir; puedes seguir abriendo carpetas manualmente.",
    )
}
fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name == name.trim()
        && name.chars().count() <= 80
        && !name.chars().any(char::is_control)
}
fn validate(value: &Library) -> Result<()> {
    if value.version != 2
        || value.repositories.len() > 100
        || value.collections.len() > 30
        || value
            .collections
            .iter()
            .enumerate()
            .any(|(index, collection)| {
                collection.id.is_empty()
                    || matches!(collection.id.as_str(), "all" | "none")
                    || collection.id.len() > 128
                    || !collection
                        .id
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
                    || !valid_name(&collection.name)
                    || value.collections[..index].iter().any(|other| {
                        other.id == collection.id
                            || other.name.to_lowercase() == collection.name.to_lowercase()
                    })
            })
        || value.repositories.iter().enumerate().any(|(i, e)| {
            e.path.is_empty()
                || e.path.len() > 32768
                || e.name.len() > 4096
                || !e.preferences.valid()
                || e.collection_id.as_ref().is_some_and(|id| {
                    !value
                        .collections
                        .iter()
                        .any(|collection| &collection.id == id)
                })
                || value.repositories[..i]
                    .iter()
                    .any(|other| other.path == e.path)
        })
    {
        return Err(invalid());
    }
    Ok(())
}
pub fn read(directory: &Path) -> Result<Library> {
    if let Some(bytes) = read_file(directory, "repositories-v2.json")? {
        let value: Library = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
        validate(&value)?;
        return Ok(value);
    }
    let Some(bytes) = read_file(directory, "repositories-v1.json")? else {
        return Ok(Library::default());
    };
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct LegacyLibrary {
        version: u8,
        repositories: Vec<Entry>,
    }
    let legacy: LegacyLibrary = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    if legacy.version != 1
        || legacy
            .repositories
            .iter()
            .any(|entry| entry.collection_id.is_some())
    {
        return Err(invalid());
    }
    let value = Library {
        repositories: legacy.repositories,
        ..Library::default()
    };
    validate(&value)?;
    save(directory, &value)?;
    Ok(value)
}
fn save(directory: &Path, library: &Library) -> Result<()> {
    validate(library)?;
    let fail = || {
        error(
            "LIBRARY_SAVE",
            "No se pudieron guardar los repositorios y preferencias. El repositorio Git no se ha modificado.",
        )
    };
    let bytes = serde_json::to_vec_pretty(library).map_err(|_| fail())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(fail());
    }
    fs::create_dir_all(directory).map_err(|_| fail())?;
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp = directory.join(format!(
        "repositories-{}-{}-{suffix}.tmp",
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
        fs::rename(&temp, directory.join("repositories-v2.json"))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|_| fail())
}
pub fn remember(directory: &Path, path: &Path) -> Result<Library> {
    let mut value = read(directory)?;
    let path_text = path.to_string_lossy().into_owned();
    let mut entry = value
        .repositories
        .iter()
        .find(|e| e.path == path_text)
        .cloned()
        .unwrap_or(Entry {
            path: path_text.clone(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            pinned: false,
            last_opened: 0,
            preferences: Preferences::default(),
            collection_id: None,
        });
    value.repositories.retain(|e| e.path != path_text);
    if value.repositories.len() >= 100 {
        let oldest = value.repositories.iter().enumerate().filter(|(_,e)| !e.pinned && e.collection_id.is_none()).min_by_key(|(_,e)| e.last_opened).map(|(i,_)| i).ok_or_else(|| error("LIBRARY_LIMIT", "La biblioteca ya contiene 100 repositorios fijados o en colecciones. Quita uno de la lista para guardar otro."))?;
        value.repositories.remove(oldest);
    }
    entry.last_opened = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX);
    value.repositories.insert(0, entry);
    save(directory, &value)?;
    Ok(value)
}
#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Edit {
    Pin {
        path: String,
        pinned: bool,
    },
    Forget {
        path: String,
    },
    CreateCollection {
        name: String,
    },
    RenameCollection {
        id: String,
        name: String,
    },
    RemoveCollection {
        id: String,
    },
    MoveCollection {
        id: String,
        direction: Direction,
    },
    AssignCollection {
        path: String,
        #[serde(deserialize_with = "Option::deserialize")]
        collection_id: Option<String>,
    },
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Direction {
    Up,
    Down,
}
fn collection_index(value: &Library, id: &str) -> Result<usize> {
    value
        .collections
        .iter()
        .position(|collection| collection.id == id)
        .ok_or_else(|| {
            error(
                "LIBRARY_COLLECTION",
                "La colección ya no existe. Actualiza la biblioteca.",
            )
        })
}
fn collection_name(value: &Library, name: &str, except: Option<&str>) -> Result<String> {
    if name.chars().any(char::is_control) {
        return Err(error(
            "LIBRARY_COLLECTION_NAME",
            "El nombre no admite caracteres de control.",
        ));
    }
    let name = name.trim();
    if !valid_name(name)
        || value.collections.iter().any(|collection| {
            Some(collection.id.as_str()) != except
                && collection.name.to_lowercase() == name.to_lowercase()
        })
    {
        return Err(error(
            "LIBRARY_COLLECTION_NAME",
            "Usa un nombre único de 1 a 80 caracteres, sin caracteres de control.",
        ));
    }
    Ok(name.to_owned())
}
pub fn edit(directory: &Path, edit: Edit) -> Result<Library> {
    let mut value = read(directory)?;
    match edit {
        Edit::Pin { path, pinned } => {
            let entry = value
                .repositories
                .iter_mut()
                .find(|e| e.path == path)
                .ok_or_else(|| {
                    error(
                        "LIBRARY_ENTRY",
                        "El repositorio ya no está en la biblioteca.",
                    )
                })?;
            entry.pinned = pinned;
        }
        Edit::Forget { path } => value.repositories.retain(|e| e.path != path),
        Edit::CreateCollection { name } => {
            if value.collections.len() >= 30 {
                return Err(error(
                    "LIBRARY_COLLECTION_LIMIT",
                    "La biblioteca admite hasta 30 colecciones.",
                ));
            }
            let name = collection_name(&value, &name, None)?;
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let id = format!(
                "collection-{}-{suffix}-{}",
                std::process::id(),
                NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
            );
            value.collections.push(Collection { id, name });
        }
        Edit::RenameCollection { id, name } => {
            let index = collection_index(&value, &id)?;
            let name = collection_name(&value, &name, Some(&id))?;
            value.collections[index].name = name;
        }
        Edit::RemoveCollection { id } => {
            let index = collection_index(&value, &id)?;
            value.collections.remove(index);
            for entry in &mut value.repositories {
                if entry.collection_id.as_ref() == Some(&id) {
                    entry.collection_id = None;
                }
            }
        }
        Edit::MoveCollection { id, direction } => {
            let index = collection_index(&value, &id)?;
            let target = match direction {
                Direction::Up => index.checked_sub(1),
                Direction::Down => index
                    .checked_add(1)
                    .filter(|next| *next < value.collections.len()),
            }
            .ok_or_else(|| {
                error(
                    "LIBRARY_COLLECTION_ORDER",
                    "La colección ya está en el extremo de la lista.",
                )
            })?;
            value.collections.swap(index, target);
        }
        Edit::AssignCollection {
            path,
            collection_id,
        } => {
            if let Some(id) = &collection_id {
                collection_index(&value, id)?;
            }
            let entry = value
                .repositories
                .iter_mut()
                .find(|entry| entry.path == path)
                .ok_or_else(|| {
                    error(
                        "LIBRARY_ENTRY",
                        "El repositorio ya no está en la biblioteca.",
                    )
                })?;
            entry.collection_id = collection_id;
        }
    }
    save(directory, &value)?;
    Ok(value)
}
pub fn preferences(directory: &Path, path: &Path, preferences: Preferences) -> Result<()> {
    if !preferences.valid() {
        return Err(error(
            "LIBRARY_PREFERENCES",
            "Las preferencias del historial no son válidas.",
        ));
    }
    let mut value = read(directory)?;
    let path = path.to_string_lossy();
    let entry = value
        .repositories
        .iter_mut()
        .find(|e| e.path == path)
        .ok_or_else(|| {
            error(
                "LIBRARY_ENTRY",
                "Abre de nuevo el repositorio para guardar sus preferencias.",
            )
        })?;
    entry.preferences = preferences;
    save(directory, &value)
}
pub fn relocate(directory: &Path, old: &str, path: &Path) -> Result<Library> {
    let mut value = read(directory)?;
    let mut entry = value
        .repositories
        .iter()
        .find(|e| e.path == old)
        .cloned()
        .ok_or_else(|| error("LIBRARY_ENTRY", "La entrada original ya no existe."))?;
    let new_path = path.to_string_lossy().into_owned();
    if new_path != old && value.repositories.iter().any(|e| e.path == new_path) {
        return Err(error(
            "LIBRARY_DUPLICATE",
            "Esta ubicación ya está en la biblioteca. Ábrela desde su entrada existente.",
        ));
    }
    value.repositories.retain(|e| e.path != old);
    entry.path = new_path;
    entry.name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    value.repositories.insert(0, entry);
    save(directory, &value)?;
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(0);
    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "ravengit-library-{}-{}-{}",
                std::process::id(),
                NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
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
    fn persists_pin_preferences_relocation_and_forget_without_touching_repository() {
        let f = Fixture::new();
        let directory = f.0.join("settings");
        let repo = f.0.join("repo ü");
        let moved = f.0.join("moved");
        fs::create_dir_all(&repo).unwrap();
        fs::write(repo.join("keep.txt"), "unchanged").unwrap();
        assert!(read(&directory).unwrap().repositories.is_empty());
        remember(&directory, &repo).unwrap();
        remember(&directory, &repo).unwrap();
        assert_eq!(read(&directory).unwrap().repositories.len(), 1);
        let path = repo.to_string_lossy().to_string();
        edit(
            &directory,
            Edit::Pin {
                path: path.clone(),
                pinned: true,
            },
        )
        .unwrap();
        let prefs = Preferences {
            show_hash: true,
            scope: "refs/heads/feature".into(),
            query: "fix".into(),
            selected_commit: Some("a".repeat(40)),
            ..Preferences::default()
        };
        preferences(&directory, &repo, prefs.clone()).unwrap();
        remember(&directory, &repo).unwrap();
        let saved = read(&directory).unwrap();
        assert!(saved.repositories[0].pinned);
        assert_eq!(saved.repositories[0].preferences, prefs);
        fs::rename(&repo, &moved).unwrap();
        assert_eq!(read(&directory).unwrap().repositories[0].path, path);
        relocate(&directory, &path, &moved).unwrap();
        assert_eq!(read(&directory).unwrap().repositories[0].preferences, prefs);
        edit(
            &directory,
            Edit::Forget {
                path: moved.to_string_lossy().into_owned(),
            },
        )
        .unwrap();
        assert!(read(&directory).unwrap().repositories.is_empty());
        assert_eq!(
            fs::read_to_string(moved.join("keep.txt")).unwrap(),
            "unchanged"
        );
    }
    #[test]
    fn corrupt_future_or_invalid_settings_are_preserved() {
        let f = Fixture::new();
        let file = f.0.join("repositories-v1.json");
        for raw in ["broken", "{\"version\":2,\"repositories\":[]}"] {
            fs::write(&file, raw).unwrap();
            assert!(read(&f.0).is_err());
            assert!(remember(&f.0, &f.0.join("repo")).is_err());
            assert_eq!(fs::read_to_string(&file).unwrap(), raw);
        }
        fs::write(&file, "{\"version\":1,\"repositories\":[]}").unwrap();
        remember(&f.0, &f.0.join("repo")).unwrap();
        let before = fs::read(&file).unwrap();
        assert!(
            preferences(
                &f.0,
                &f.0.join("repo"),
                Preferences {
                    author_width: 1,
                    ..Preferences::default()
                }
            )
            .is_err()
        );
        assert_eq!(fs::read(&file).unwrap(), before);
    }
    #[test]
    fn relocation_never_merges_existing_entries_or_removes_other_metadata() {
        let f = Fixture::new();
        let a = f.0.join("a");
        let b = f.0.join("b");
        remember(&f.0, &a).unwrap();
        remember(&f.0, &b).unwrap();
        assert!(relocate(&f.0, &a.to_string_lossy(), &b).is_err());
        assert_eq!(read(&f.0).unwrap().repositories.len(), 2);
        let blocked = f.0.join("blocked");
        fs::write(&blocked, "file").unwrap();
        assert!(remember(&blocked, &a).is_err());
    }
    #[test]
    fn full_library_preserves_pins_and_evicts_only_an_unpinned_entry() {
        let f = Fixture::new();
        let value = Library {
            version: 2,
            collections: Vec::new(),
            repositories: (0..100)
                .map(|i| Entry {
                    path: f.0.join(format!("repo-{i}")).to_string_lossy().into_owned(),
                    name: format!("repo-{i}"),
                    pinned: true,
                    last_opened: i,
                    preferences: Preferences::default(),
                    collection_id: None,
                })
                .collect(),
        };
        save(&f.0, &value).unwrap();
        assert_eq!(
            remember(&f.0, &f.0.join("new")).unwrap_err().code,
            "LIBRARY_LIMIT"
        );
        assert_eq!(read(&f.0).unwrap().repositories.len(), 100);
        let removed = value.repositories[5].path.clone();
        edit(
            &f.0,
            Edit::Pin {
                path: removed.clone(),
                pinned: false,
            },
        )
        .unwrap();
        let updated = remember(&f.0, &f.0.join("new")).unwrap();
        assert_eq!(updated.repositories.len(), 100);
        assert!(
            !updated
                .repositories
                .iter()
                .any(|entry| entry.path == removed)
        );
        assert_eq!(
            updated
                .repositories
                .iter()
                .filter(|entry| entry.pinned)
                .count(),
            99
        );
    }
    fn create_collection(directory: &Path, name: &str) -> String {
        edit(directory, Edit::CreateCollection { name: name.into() })
            .unwrap()
            .collections
            .last()
            .unwrap()
            .id
            .clone()
    }
    #[test]
    fn migrates_v1_once_preserving_original_bytes_preferences_and_pins() {
        let fixture = Fixture::new();
        let repo = fixture.0.join("repo ü");
        let legacy = serde_json::json!({"version":1,"repositories":[{
            "path":repo.to_string_lossy(), "name":"Proyecto", "pinned":true,
            "lastOpened":42, "preferences": {"query":"persistir", "showHash":true}
        }]});
        let original = serde_json::to_vec_pretty(&legacy).unwrap();
        let old_file = fixture.0.join("repositories-v1.json");
        fs::write(&old_file, &original).unwrap();
        let migrated = read(&fixture.0).unwrap();
        assert_eq!(migrated.version, 2);
        assert!(migrated.collections.is_empty());
        assert!(migrated.repositories[0].collection_id.is_none());
        assert!(migrated.repositories[0].pinned);
        assert_eq!(migrated.repositories[0].preferences.query, "persistir");
        assert!(migrated.repositories[0].preferences.show_hash);
        let collection = create_collection(&fixture.0, "Trabajo");
        edit(
            &fixture.0,
            Edit::AssignCollection {
                path: repo.to_string_lossy().into(),
                collection_id: Some(collection.clone()),
            },
        )
        .unwrap();
        assert_eq!(
            read(&fixture.0).unwrap().repositories[0]
                .collection_id
                .as_ref(),
            Some(&collection)
        );
        assert_eq!(fs::read(old_file).unwrap(), original);
    }
    #[test]
    fn collections_reorder_rename_relocate_and_remove_without_losing_repositories() {
        let fixture = Fixture::new();
        let repo = fixture.0.join("repo");
        let moved = fixture.0.join("moved");
        let settings = fixture.0.join("settings");
        fs::create_dir(&repo).unwrap();
        fs::write(repo.join("keep.txt"), "unchanged").unwrap();
        remember(&settings, &repo).unwrap();
        let path = repo.to_string_lossy().into_owned();
        edit(
            &settings,
            Edit::Pin {
                path: path.clone(),
                pinned: true,
            },
        )
        .unwrap();
        let prefs = Preferences {
            query: "filtro".into(),
            ..Preferences::default()
        };
        preferences(&settings, &repo, prefs.clone()).unwrap();
        let first = create_collection(&settings, "Personal");
        let second = create_collection(&settings, "Trabajo");
        edit(
            &settings,
            Edit::AssignCollection {
                path: path.clone(),
                collection_id: Some(first.clone()),
            },
        )
        .unwrap();
        edit(
            &settings,
            Edit::AssignCollection {
                path: path.clone(),
                collection_id: Some(second.clone()),
            },
        )
        .unwrap();
        edit(
            &settings,
            Edit::MoveCollection {
                id: second.clone(),
                direction: Direction::Up,
            },
        )
        .unwrap();
        edit(
            &settings,
            Edit::RenameCollection {
                id: second.clone(),
                name: "  Equipo  ".into(),
            },
        )
        .unwrap();
        assert_eq!(read(&settings).unwrap().collections[0].name, "Equipo");
        fs::rename(&repo, &moved).unwrap();
        relocate(&settings, &path, &moved).unwrap();
        remember(&settings, &moved).unwrap();
        let entry = read(&settings).unwrap().repositories.remove(0);
        assert_eq!(entry.collection_id.as_ref(), Some(&second));
        assert_eq!(entry.preferences, prefs);
        assert!(entry.pinned);
        let result = edit(&settings, Edit::RemoveCollection { id: second }).unwrap();
        assert_eq!(result.collections[0].id, first);
        assert_eq!(result.repositories.len(), 1);
        assert!(result.repositories[0].collection_id.is_none());
        assert!(result.repositories[0].pinned);
        assert_eq!(result.repositories[0].preferences, prefs);
        assert_eq!(
            fs::read_to_string(moved.join("keep.txt")).unwrap(),
            "unchanged"
        );
    }
    #[test]
    fn invalid_names_stale_ids_and_order_preserve_saved_metadata() {
        let fixture = Fixture::new();
        let id = create_collection(&fixture.0, "Equipo");
        let file = fixture.0.join("repositories-v2.json");
        let before = fs::read(&file).unwrap();
        for name in ["", "  ", "EQUIPO", "mal\nnombre", &"ü".repeat(81)] {
            assert!(edit(&fixture.0, Edit::CreateCollection { name: name.into() }).is_err());
            assert_eq!(fs::read(&file).unwrap(), before);
        }
        for edit_request in [
            Edit::RenameCollection {
                id: "missing".into(),
                name: "Otro".into(),
            },
            Edit::RemoveCollection {
                id: "missing".into(),
            },
            Edit::MoveCollection {
                id: id.clone(),
                direction: Direction::Up,
            },
            Edit::MoveCollection {
                id: id.clone(),
                direction: Direction::Down,
            },
            Edit::AssignCollection {
                path: "missing".into(),
                collection_id: Some(id),
            },
        ] {
            assert!(edit(&fixture.0, edit_request).is_err());
            assert_eq!(fs::read(&file).unwrap(), before);
        }
        let repo = fixture.0.join("repo");
        remember(&fixture.0, &repo).unwrap();
        assert!(
            edit(
                &fixture.0,
                Edit::AssignCollection {
                    path: repo.to_string_lossy().into(),
                    collection_id: Some("missing".into())
                }
            )
            .is_err()
        );
    }
    #[test]
    fn corrupt_or_future_v2_never_falls_back_to_legacy_or_overwrites_either_file() {
        let fixture = Fixture::new();
        let old_file = fixture.0.join("repositories-v1.json");
        let legacy = b"{\"version\":1,\"repositories\":[]}";
        fs::write(&old_file, legacy).unwrap();
        let file = fixture.0.join("repositories-v2.json");
        for raw in [
            "broken",
            "{\"version\":3,\"repositories\":[],\"collections\":[]}",
            "{\"version\":2,\"repositories\":[]}",
        ] {
            fs::write(&file, raw).unwrap();
            assert!(read(&fixture.0).is_err());
            assert!(
                edit(
                    &fixture.0,
                    Edit::CreateCollection {
                        name: "Nuevo".into()
                    }
                )
                .is_err()
            );
            assert_eq!(fs::read(&file).unwrap(), raw.as_bytes());
            assert_eq!(fs::read(&old_file).unwrap(), legacy);
        }
        let value = Library {
            collections: vec![
                Collection {
                    id: "same".into(),
                    name: "Uno".into(),
                },
                Collection {
                    id: "same".into(),
                    name: "Dos".into(),
                },
            ],
            ..Library::default()
        };
        fs::write(&file, serde_json::to_vec(&value).unwrap()).unwrap();
        assert!(read(&fixture.0).is_err());
    }
    #[test]
    fn collection_limit_and_missing_destination_are_safe_and_unassignment_persists() {
        let fixture = Fixture::new();
        let repo = fixture.0.join("repo");
        remember(&fixture.0, &repo).unwrap();
        let id = create_collection(&fixture.0, "Grupo 0");
        for index in 1..30 {
            create_collection(&fixture.0, &format!("Grupo {index}"));
        }
        assert!(
            edit(
                &fixture.0,
                Edit::CreateCollection {
                    name: "Exceso".into()
                }
            )
            .is_err()
        );
        let path = repo.to_string_lossy().into_owned();
        edit(
            &fixture.0,
            Edit::AssignCollection {
                path: path.clone(),
                collection_id: Some(id),
            },
        )
        .unwrap();
        edit(
            &fixture.0,
            Edit::AssignCollection {
                path,
                collection_id: None,
            },
        )
        .unwrap();
        let value = read(&fixture.0).unwrap();
        assert_eq!(value.collections.len(), 30);
        assert!(value.repositories[0].collection_id.is_none());
    }
    #[test]
    fn collection_members_are_not_silently_evicted_at_repository_limit() {
        let fixture = Fixture::new();
        let mut value = Library::default();
        value.collections.push(Collection {
            id: "group".into(),
            name: "Grupo".into(),
        });
        value.repositories = (0..100)
            .map(|index| Entry {
                path: fixture
                    .0
                    .join(format!("repo-{index}"))
                    .to_string_lossy()
                    .into(),
                name: format!("Repo {index}"),
                pinned: false,
                last_opened: index,
                preferences: Preferences::default(),
                collection_id: Some("group".into()),
            })
            .collect();
        save(&fixture.0, &value).unwrap();
        assert_eq!(
            remember(&fixture.0, &fixture.0.join("new"))
                .unwrap_err()
                .code,
            "LIBRARY_LIMIT"
        );
        let path = value.repositories[0].path.clone();
        edit(
            &fixture.0,
            Edit::AssignCollection {
                path: path.clone(),
                collection_id: None,
            },
        )
        .unwrap();
        let updated = remember(&fixture.0, &fixture.0.join("new")).unwrap();
        assert_eq!(updated.repositories.len(), 100);
        assert!(!updated.repositories.iter().any(|entry| entry.path == path));
        assert_eq!(
            updated
                .repositories
                .iter()
                .filter(|entry| entry.collection_id.is_some())
                .count(),
            99
        );
    }
    #[test]
    fn rejects_dangling_memberships_duplicate_names_and_reserved_ids_without_repairing() {
        let fixture = Fixture::new();
        remember(&fixture.0, &fixture.0.join("repo")).unwrap();
        let original = read(&fixture.0).unwrap();
        let file = fixture.0.join("repositories-v2.json");
        let mut dangling = original.clone();
        dangling.repositories[0].collection_id = Some("missing".into());
        let mut duplicate = original.clone();
        duplicate.collections = vec![
            Collection {
                id: "one".into(),
                name: "Equipo".into(),
            },
            Collection {
                id: "two".into(),
                name: "EQUIPO".into(),
            },
        ];
        let mut reserved = original;
        reserved.collections.push(Collection {
            id: "all".into(),
            name: "Grupo".into(),
        });
        for value in [dangling, duplicate, reserved] {
            let bytes = serde_json::to_vec(&value).unwrap();
            fs::write(&file, &bytes).unwrap();
            assert!(read(&fixture.0).is_err());
            assert!(remember(&fixture.0, &fixture.0.join("new")).is_err());
            assert_eq!(fs::read(&file).unwrap(), bytes);
        }
    }
    #[test]
    fn ipc_assignment_uses_camel_case_and_persists_after_reopening() {
        let fixture = Fixture::new();
        let repo = fixture.0.join("repo");
        remember(&fixture.0, &repo).unwrap();
        let id = create_collection(&fixture.0, "Trabajo");
        for collection_id in [Some(id.clone()), None, Some(id.clone())] {
            let payload = serde_json::json!({
                "kind":"assignCollection", "path":repo.to_string_lossy(),
                "collectionId":collection_id,
            });
            let request: Edit = serde_json::from_value(payload).unwrap();
            let updated = edit(&fixture.0, request).unwrap();
            assert_eq!(updated.repositories[0].collection_id, collection_id);
            let reopened: serde_json::Value =
                serde_json::to_value(read(&fixture.0).unwrap()).unwrap();
            assert_eq!(
                reopened["repositories"][0]["collectionId"],
                serde_json::json!(collection_id)
            );
        }
        let before = fs::read(fixture.0.join("repositories-v2.json")).unwrap();
        for payload in [
            serde_json::json!({"kind":"assignCollection","path":repo.to_string_lossy(),"collection_id":id}),
            serde_json::json!({"kind":"assignCollection","path":repo.to_string_lossy()}),
            serde_json::json!({"kind":"assignCollection","path":repo.to_string_lossy(),"collectionId":42}),
        ] {
            assert!(serde_json::from_value::<Edit>(payload).is_err());
        }
        assert_eq!(
            fs::read(fixture.0.join("repositories-v2.json")).unwrap(),
            before
        );
    }
}
