use tauri::State;

/// Holds the per-session streaming config (token + port)
pub struct StreamConfig {
    pub token: String,
    pub port: u16,
}

/// Returned to the frontend so it can construct stream URLs dynamically
#[derive(serde::Serialize)]
pub struct StreamInfo {
    pub token: String,
    pub base_url: String,
}

#[tauri::command]
pub fn cmd_get_stream_token(config: State<'_, StreamConfig>) -> String {
    config.token.clone()
}

/// Returns the streaming server's session token and base URL to the frontend.
#[tauri::command]
pub fn cmd_get_stream_info(config: State<'_, StreamConfig>) -> StreamInfo {
    StreamInfo {
        token: config.token.clone(),
        base_url: format!("http://localhost:{}", config.port),
    }
}
