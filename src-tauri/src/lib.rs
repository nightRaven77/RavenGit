mod accounts;
mod activity;
mod amend;
mod branches;
mod changes;
mod clone;
mod commands;
mod conflict_edit;
mod conflict_restore;
mod conflict_stage;
mod conflicts;
mod env_check;
mod external;
mod file_inspect;
mod forge;
mod git;
mod gix_engine;
mod image_diff;
mod initialize;
mod lfs;
mod library;
mod merge;
mod process;
mod pull;
mod push;
mod rebase;
mod rebase_plan;
mod remotes;
mod replay;
mod repository_delete;
mod repository_paths;
mod search;
mod settings;
mod snapshots;
mod ssh;
mod stash;
mod state;
mod submodules;
mod tag_push;
mod tags;
mod trust;
mod undo;
mod watcher;
mod worktree_restore;
mod worktrees;

use state::AppState;
use std::path::Path;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::app::read_app_settings,
            commands::app::save_app_settings,
            commands::app::read_external_apps,
            commands::app::open_in_external,
            commands::app::read_activity,
            commands::app::record_activity,
            commands::app::clear_activity,
            commands::app::export_diagnostics,
            commands::history::open_repository,
            commands::history::close_repository,
            commands::app::check_git_environment,
            commands::history::read_worktrees,
            commands::history::add_worktree,
            commands::history::lock_worktree,
            commands::history::unlock_worktree,
            commands::history::remove_worktree,
            commands::history::prune_worktrees,
            commands::history::open_worktree_external,
            commands::history::read_worktree_summary,
            commands::history::watch_repository,
            commands::app::get_default_repository_directory,
            commands::app::preview_repository_delete,
            commands::app::trash_repository,
            commands::app::initialize_repository,
            commands::app::clone_repository,
            commands::app::read_repository_library,
            commands::app::remember_repository,
            commands::app::edit_repository_library,
            commands::app::save_history_preferences,
            commands::app::relocate_repository,
            commands::history::refresh_repository,
            commands::history::read_history,
            commands::history::search_history,
            commands::history::read_search_match_diff,
            commands::history::read_commit_files,
            commands::history::read_commit_diff,
            commands::history::read_file_history,
            commands::history::read_file_blame,
            commands::history::read_range_files,
            commands::history::read_range_diff,
            commands::history::read_image_diff,
            commands::workspace::read_changes,
            commands::branches::read_branches,
            commands::branches::edit_branch,
            commands::branches::preview_merge,
            commands::branches::preview_rebase,
            commands::branches::review_interactive_rebase,
            commands::branches::read_rebase,
            commands::workspace::read_stash,
            commands::workspace::preview_stash,
            commands::workspace::confirm_stash,
            commands::workspace::finish_stash,
            commands::branches::read_replay,
            commands::branches::preview_replay,
            commands::branches::edit_replay,
            commands::branches::edit_rebase,
            commands::branches::read_merge,
            commands::branches::edit_merge,
            commands::sync::read_pull_options,
            commands::sync::preview_pull,
            commands::sync::integrate_pull,
            commands::workspace::authorize_repository,
            commands::workspace::revoke_repository_authorization,
            commands::workspace::read_file_diff,
            commands::workspace::read_conflict,
            commands::workspace::read_conflict_backups,
            commands::workspace::preview_conflict_restore,
            commands::workspace::restore_conflict_backup,
            commands::workspace::preview_conflict_edit,
            commands::workspace::save_conflict_result,
            commands::workspace::preview_conflict_stage,
            commands::workspace::prepare_conflict_result,
            commands::workspace::change_file,
            commands::workspace::change_files,
            commands::workspace::discard_file_lines,
            commands::workspace::check_worktree_restore,
            commands::workspace::preview_worktree_restore,
            commands::workspace::confirm_worktree_restore,
            commands::safety::read_snapshots,
            commands::safety::create_snapshot,
            commands::safety::delete_snapshot,
            commands::safety::preview_snapshot_restore,
            commands::safety::confirm_snapshot_restore,
            commands::safety::read_undo_state,
            commands::safety::preview_undo,
            commands::safety::confirm_undo,
            commands::safety::read_lfs_status,
            commands::safety::pull_lfs_objects,
            commands::safety::refresh_lfs_locks,
            commands::safety::lock_lfs_file,
            commands::safety::unlock_lfs_file,
            commands::safety::read_submodules,
            commands::safety::update_submodule,
            commands::workspace::create_commit,
            commands::workspace::preview_amend,
            commands::workspace::confirm_amend,
            commands::workspace::preview_tag,
            commands::workspace::create_tag,
            commands::workspace::read_tag_push_options,
            commands::workspace::preview_tag_push,
            commands::workspace::publish_tag,
            commands::sync::read_remotes,
            commands::sync::read_ssh_accounts,
            commands::sync::save_ssh_accounts,
            commands::sync::read_ssh_agent,
            commands::sync::read_authentication_status,
            commands::sync::authorize_remote_operations,
            commands::sync::edit_remote,
            commands::sync::contact_remote,
            commands::sync::read_push_options,
            commands::sync::preview_push,
            commands::sync::publish_push,
            commands::sync::read_forge_info,
            commands::sync::fetch_pull_requests,
            commands::sync::open_forge_url
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar RavenGit");
}

/// Restricted internal Git editor entry point; invoked before opening the GUI.
pub fn run_rebase_editor() -> Option<i32> {
    let args = std::env::args().collect::<Vec<_>>();
    if args.get(1).map(String::as_str) != Some("--ravengit-rebase-editor") {
        return None;
    }
    if args.len() != 6 {
        return Some(1);
    }
    Some(
        if rebase_plan::editor(&args[2], Path::new(&args[3]), &args[4], Path::new(&args[5])).is_ok()
        {
            0
        } else {
            1
        },
    )
}

#[cfg(test)]
mod tests {
    use super::AppState;
    use crate::git::Repository;
    use crate::state::{RepoSession, close_session, selected, session, trusted};
    use std::{path::PathBuf, sync::Arc};

    #[test]
    fn multi_repo_sessions_isolate_locks_trust_and_close() {
        let state = AppState::default();
        let s1 = Arc::new(RepoSession::new(
            Repository {
                id: "1".into(),
                path: PathBuf::from("/tmp/repo-a"),
            },
            true,
        ));
        let s2 = Arc::new(RepoSession::new(
            Repository {
                id: "2".into(),
                path: PathBuf::from("/tmp/repo-b"),
            },
            false,
        ));
        {
            let mut guard = state.sessions.lock().unwrap();
            guard.insert("1".into(), s1);
            guard.insert("2".into(), s2);
        }

        assert!(trusted(&state, "1").unwrap());
        assert!(!trusted(&state, "2").unwrap());
        assert_eq!(
            selected(&state, "2").unwrap().path,
            PathBuf::from("/tmp/repo-b")
        );

        let a = session(&state, "1").unwrap();
        let b = session(&state, "2").unwrap();
        let _lock_a = a.writes.try_lock().unwrap();
        // Holding session A write lock must not block session B write lock
        assert!(b.writes.try_lock().is_ok());

        // Closing session A fails with BUSY while its write lock is held
        let busy_err = close_session(&state, "1").unwrap_err();
        assert_eq!(busy_err.code, "BUSY");
        drop(_lock_a);

        // Once unlocked, closing removes only session A and leaves session B intact
        close_session(&state, "1").unwrap();
        assert_eq!(
            selected(&state, "1").unwrap_err().code,
            "REPOSITORY_CHANGED"
        );
        assert_eq!(
            selected(&state, "2").unwrap().path,
            PathBuf::from("/tmp/repo-b")
        );
    }
}
