use tauri::{AppHandle, State};

use crate::gateway_sidecar::{GatewaySidecarState, GatewayStatusSnapshot};
use crate::health::check_gateway_health;

#[tauri::command]
pub async fn app_start_gateway(
    app_handle: AppHandle,
    state: State<'_, GatewaySidecarState>,
) -> Result<(), String> {
    state.start(&app_handle)
}

#[tauri::command]
pub async fn app_stop_gateway(state: State<'_, GatewaySidecarState>) -> Result<(), String> {
    state.stop()
}

#[tauri::command]
pub async fn app_gateway_status(
    state: State<'_, GatewaySidecarState>,
) -> Result<GatewayStatusSnapshot, String> {
    let port = state.port();
    match check_gateway_health(port).await {
        Ok(healthy) => state.mark_health(healthy, None),
        Err(error) => state.mark_health(false, Some(error)),
    }

    state.snapshot()
}
