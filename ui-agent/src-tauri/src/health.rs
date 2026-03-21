use reqwest::StatusCode;

pub async fn check_gateway_health(port: u16) -> Result<bool, String> {
    let url = format!("http://127.0.0.1:{port}/health");
    let response = reqwest::get(url)
        .await
        .map_err(|error| format!("gateway health request failed: {error}"))?;

    Ok(response.status() == StatusCode::OK)
}
