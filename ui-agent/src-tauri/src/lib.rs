pub mod commands {
    pub mod app;
    pub mod mcpso;
}
pub mod gateway_sidecar;
pub mod health;

use tauri_plugin_opener::OpenerExt;
use crate::commands::app::{app_gateway_status, app_start_gateway, app_stop_gateway};
use crate::commands::mcpso::{mcpso_detail, mcpso_import, mcpso_search};
use crate::gateway_sidecar::GatewaySidecarState;

#[tauri::command]
fn reveal_finder(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let _ = app_handle.opener().open_path(path, None::<&str>);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(GatewaySidecarState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            reveal_finder,
            app_start_gateway,
            app_stop_gateway,
            app_gateway_status,
            mcpso_search,
            mcpso_detail,
            mcpso_import
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
