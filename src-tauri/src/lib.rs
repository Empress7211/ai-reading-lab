mod commands;
mod error;
mod storage;

use std::fs;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            let vault_dir = app_data_dir.join("vault");
            fs::create_dir_all(&vault_dir)?;
            let db_path = app_data_dir.join("paperweave.sqlite3");
            storage::initialize(&db_path).map_err(|error| error.to_string())?;
            app.manage(storage::AppState { db_path, vault_dir });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workspace_initialize,
            commands::workspace_snapshot,
            commands::import_local_pdf,
            commands::load_pdf_bytes,
            commands::save_anchor,
            commands::save_draft_bundle,
            commands::review_draft,
            commands::save_judgment,
            commands::save_settings,
            commands::open_ai_credential_status,
            commands::save_open_ai_api_key,
            commands::delete_open_ai_api_key,
            commands::generate_drafts,
        ])
        .run(tauri::generate_context!())
        .expect("PaperWeave failed to start");
}
