pub mod commands {
    pub mod app;
    pub mod mcpso;
}
pub mod gateway_sidecar;
pub mod health;

use crate::commands::app::{app_gateway_status, app_start_gateway, app_stop_gateway};
use crate::commands::mcpso::{mcpso_detail, mcpso_import, mcpso_search};
use crate::gateway_sidecar::GatewaySidecarState;
use serde::{Deserialize, Serialize};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn reveal_finder(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let _ = app_handle.opener().open_path(path, None::<&str>);
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum CliSoftwarePathPickerKind {
    Directory,
    File,
}

#[derive(Serialize)]
struct CliSoftwarePathPickerResult {
    paths: Vec<String>,
}

#[tauri::command]
fn pick_cli_software_paths(
    kind: CliSoftwarePathPickerKind,
) -> Result<CliSoftwarePathPickerResult, String> {
    let paths = match kind {
        CliSoftwarePathPickerKind::Directory => {
            rfd::FileDialog::new().pick_folder().map(|path| vec![path])
        }
        CliSoftwarePathPickerKind::File => rfd::FileDialog::new().pick_files(),
    }
    .unwrap_or_default()
    .into_iter()
    .map(|path| path.to_string_lossy().to_string())
    .collect();

    Ok(CliSoftwarePathPickerResult { paths })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(GatewaySidecarState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            reveal_finder,
            pick_cli_software_paths,
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
