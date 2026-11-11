// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(code) = ravengit_lib::run_rebase_editor() {
        std::process::exit(code);
    }
    ravengit_lib::run()
}
