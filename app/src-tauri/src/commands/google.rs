use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

const SCOPES: &str = "https://www.googleapis.com/auth/calendar.events";

#[derive(Clone, Serialize, Deserialize)]
pub struct GoogleTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
}

#[derive(Clone)]
pub struct GoogleState {
    pub tokens: Arc<Mutex<Option<GoogleTokens>>>,
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

#[derive(Serialize)]
pub struct GoogleAuthUrl {
    pub url: String,
    pub callback_port: Option<u16>,
}

#[derive(Serialize)]
pub struct GoogleAuthStatus {
    pub connected: bool,
    pub email: Option<String>,
}

#[derive(Serialize)]
pub struct GoogleMeetInfo {
    pub meet_url: String,
    pub event_id: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: i64,
    refresh_token: Option<String>,
    scope: Option<String>,
    token_type: Option<String>,
}

#[derive(Deserialize)]
struct TokenRefreshResponse {
    access_token: String,
    expires_in: i64,
    scope: Option<String>,
    token_type: Option<String>,
}

#[derive(Serialize)]
struct CalendarEvent {
    summary: String,
    start: CalendarTime,
    end: CalendarTime,
    #[serde(rename = "conferenceData")]
    conference_data: ConferenceData,
}

#[derive(Serialize)]
struct CalendarTime {
    #[serde(rename = "dateTime")]
    date_time: String,
    #[serde(rename = "timeZone")]
    time_zone: String,
}

#[derive(Serialize)]
struct ConferenceData {
    #[serde(rename = "createRequest")]
    create_request: CreateRequest,
}

#[derive(Serialize)]
struct CreateRequest {
    #[serde(rename = "requestId")]
    request_id: String,
    #[serde(rename = "conferenceSolutionKey")]
    conference_solution_key: ConferenceSolutionKey,
}

#[derive(Serialize)]
struct ConferenceSolutionKey {
    #[serde(rename = "type")]
    solution_type: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarEventResponse {
    hangout_link: Option<String>,
    id: String,
    conference_data: Option<ConferenceDataResponse>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConferenceDataResponse {
    entry_points: Option<Vec<EntryPoint>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntryPoint {
    entry_point_type: Option<String>,
    uri: Option<String>,
}

#[derive(Deserialize)]
struct UserInfoResponse {
    email: Option<String>,
    name: Option<String>,
}

fn generate_request_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen()).collect();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn now_iso8601() -> String {
    use chrono::Utc;
    Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

fn one_hour_later_iso8601() -> String {
    use chrono::Utc;
    (Utc::now() + chrono::Duration::hours(1))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string()
}

async fn exchange_code(
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
    code: &str,
) -> Result<GoogleTokens, String> {
    let client = reqwest::Client::new();
    let params = [
        ("code", code),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("redirect_uri", redirect_uri),
        ("grant_type", "authorization_code"),
    ];

    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {}", e))?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("Token exchange failed ({}): {}", status, body));
    }

    let token_resp: TokenResponse =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse token response: {} - body: {}", e, body))?;

    let refresh_token = token_resp
        .refresh_token
        .ok_or_else(|| "No refresh token received".to_string())?;

    let expires_at = chrono::Utc::now().timestamp() + token_resp.expires_in;

    Ok(GoogleTokens {
        access_token: token_resp.access_token,
        refresh_token,
        expires_at,
    })
}

async fn refresh_access_token(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<(String, i64), String> {
    let client = reqwest::Client::new();
    let params = [
        ("refresh_token", refresh_token),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("grant_type", "refresh_token"),
    ];

    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {}", e))?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("Token refresh failed ({}): {}", status, body));
    }

    let refresh_resp: TokenRefreshResponse =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse refresh response: {} - body: {}", e, body))?;

    let expires_at = chrono::Utc::now().timestamp() + refresh_resp.expires_in;

    Ok((refresh_resp.access_token, expires_at))
}

async fn ensure_valid_token(state: &GoogleState) -> Result<String, String> {
    let mut tokens_lock = state.tokens.lock().await;
    let tokens = tokens_lock
        .as_ref()
        .ok_or_else(|| "Google account not connected".to_string())?;

    let now = chrono::Utc::now().timestamp();
    if tokens.expires_at > now + 60 {
        return Ok(tokens.access_token.clone());
    }

    let (new_access_token, new_expires_at) =
        refresh_access_token(&state.client_id, &state.client_secret, &tokens.refresh_token).await?;

    *tokens_lock = Some(GoogleTokens {
        access_token: new_access_token.clone(),
        refresh_token: tokens.refresh_token.clone(),
        expires_at: new_expires_at,
    });

    save_tokens_to_file(tokens_lock.as_ref().unwrap()).await;

    Ok(new_access_token)
}

fn tokens_file_path() -> std::path::PathBuf {
    let mut path = std::env::temp_dir();
    path.push("tgguild_google_tokens.json");
    path
}

async fn save_tokens_to_file(tokens: &GoogleTokens) {
    let path = tokens_file_path();
    let json = serde_json::to_string(tokens).unwrap_or_default();
    if let Err(e) = tokio::fs::write(&path, &json).await {
        log::error!("Failed to save Google tokens: {}", e);
    }
}

async fn load_tokens_from_file() -> Option<GoogleTokens> {
    let path = tokens_file_path();
    match tokio::fs::read_to_string(&path).await {
        Ok(json) => serde_json::from_str(&json).ok(),
        Err(_) => None,
    }
}

pub async fn start_callback_listener(
    port: u16,
    gstate: GoogleState,
) -> std::io::Result<u16> {
    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).await?;
    let actual_port = listener.local_addr()?.port();

    log::info!("Google OAuth callback listener started on port {}", actual_port);

    tokio::spawn(async move {
        match listener.accept().await {
            Ok((mut stream, _)) => {
                let mut reader = BufReader::new(&mut stream);
                let mut request_line = String::new();
                if reader.read_line(&mut request_line).await.is_err() {
                    return;
                }

                let code = request_line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|path| {
                        let query = path.split('?').nth(1)?;
                        for pair in query.split('&') {
                            let mut parts = pair.splitn(2, '=');
                            if parts.next()? == "code" {
                                return parts.next().map(url_decode);
                            }
                        }
                        None
                    });

                let response = if let Some(ref code) = code {
                    match exchange_code(
                        &gstate.client_id,
                        &gstate.client_secret,
                        &gstate.redirect_uri,
                        code,
                    )
                    .await
                    {
                        Ok(tokens) => {
                            *gstate.tokens.lock().await = Some(tokens.clone());
                            save_tokens_to_file(&tokens).await;
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<!DOCTYPE html><html><body style='font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f4f8'><div style='text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.1)'><h2 style='color:#1a73e8;margin-bottom:8px'>Authentication Successful!</h2><p style='color:#5f6368'>Your Google account has been connected. You can close this window.</p></div></body></html>"
                        }
                        Err(e) => {
                            log::error!("Google OAuth callback error: {}", e);
                            "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\n\r\n<!DOCTYPE html><html><body style='font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f4f8'><div style='text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.1)'><h2 style='color:#d93025;margin-bottom:8px'>Authentication Failed</h2><p style='color:#5f6368'>Could not complete authentication. Please try again.</p></div></body></html>"
                        }
                    }
                } else {
                    "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\n\r\nNo authorization code received"
                };

                let _ = stream.write_all(response.as_bytes()).await;
                let _ = stream.flush().await;
            }
            Err(e) => {
                log::error!("Google OAuth callback listener accept error: {}", e);
            }
        }
    });

    Ok(actual_port)
}

fn url_decode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        match c {
            '+' => result.push(' '),
            '%' => {
                let hex: String = chars.by_ref().take(2).collect();
                if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                    result.push(byte as char);
                }
            }
            _ => result.push(c),
        }
    }
    result
}

fn parse_port_from_redirect_uri(redirect_uri: &str) -> Option<u16> {
    let uri = redirect_uri.trim_start_matches("http://").trim_start_matches("https://");
    let after_host = uri.splitn(2, '/').next()?;
    let port_str = after_host.split(':').nth(1)?;
    port_str.parse::<u16>().ok()
}

fn build_auth_url(client_id: &str, redirect_uri: &str) -> String {
    format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        urlencoding(client_id),
        urlencoding(redirect_uri),
        urlencoding(SCOPES),
    )
}

fn urlencoding(s: &str) -> String {
    let mut result = String::new();
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            b' ' => result.push_str("%20"),
            b':' => result.push_str("%3A"),
            b'/' => result.push_str("%2F"),
            b'?' => result.push_str("%3F"),
            b'&' => result.push_str("%26"),
            b'=' => result.push_str("%3D"),
            b'#' => result.push_str("%23"),
            b'%' => result.push_str("%25"),
            _ => result.push_str(&format!("%{:02X}", byte)),
        }
    }
    result
}

#[tauri::command]
pub async fn cmd_google_auth_url(
    state: State<'_, GoogleState>,
) -> Result<GoogleAuthUrl, String> {
    let url = build_auth_url(&state.client_id, &state.redirect_uri);

    let port = if let Some(p) = parse_port_from_redirect_uri(&state.redirect_uri) {
        start_callback_listener(p, state.inner().clone()).await.ok()
    } else {
        None
    };

    Ok(GoogleAuthUrl {
        url,
        callback_port: port,
    })
}

#[tauri::command]
pub async fn cmd_google_exchange_code(
    code: String,
    state: State<'_, GoogleState>,
) -> Result<bool, String> {
    let tokens =
        exchange_code(&state.client_id, &state.client_secret, &state.redirect_uri, &code).await?;

    let path = tokens_file_path();
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create tokens directory: {}", e))?;
    }

    let json = serde_json::to_string(&tokens).map_err(|e| e.to_string())?;
    tokio::fs::write(&path, &json)
        .await
        .map_err(|e| format!("Failed to save tokens: {}", e))?;

    *state.tokens.lock().await = Some(tokens);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_google_auth_status(
    state: State<'_, GoogleState>,
) -> Result<GoogleAuthStatus, String> {
    let tokens = state.tokens.lock().await.clone();

    if tokens.is_some() {
        let access_token = match ensure_valid_token(&state).await {
            Ok(t) => t,
            Err(_) => {
                return Ok(GoogleAuthStatus {
                    connected: false,
                    email: None,
                });
            }
        };

        let client = reqwest::Client::new();
        let resp = client
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                let info: UserInfoResponse = r.json().await.unwrap_or(UserInfoResponse {
                    email: None,
                    name: None,
                });
                Ok(GoogleAuthStatus {
                    connected: true,
                    email: info.email,
                })
            }
            _ => Ok(GoogleAuthStatus {
                connected: true,
                email: None,
            }),
        }
    } else {
        Ok(GoogleAuthStatus {
            connected: false,
            email: None,
        })
    }
}

#[tauri::command]
pub async fn cmd_google_create_meet(
    summary: String,
    _creator_name: String,
    state: State<'_, GoogleState>,
) -> Result<GoogleMeetInfo, String> {
    let access_token = ensure_valid_token(&state).await?;

    let event = CalendarEvent {
        summary: format!("{} (TgGuild)", summary),
        start: CalendarTime {
            date_time: now_iso8601(),
            time_zone: "UTC".to_string(),
        },
        end: CalendarTime {
            date_time: one_hour_later_iso8601(),
            time_zone: "UTC".to_string(),
        },
        conference_data: ConferenceData {
            create_request: CreateRequest {
                request_id: generate_request_id(),
                conference_solution_key: ConferenceSolutionKey {
                    solution_type: "hangoutsMeet".to_string(),
                },
            },
        },
    };

    let client = reqwest::Client::new();
    let resp = client
        .post("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&event)
        .send()
        .await
        .map_err(|e| format!("Calendar API request failed: {}", e))?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let payload = serde_json::to_string(&event).unwrap_or_default();
        log::error!(
            "Calendar API error ({}): {}\nPayload: {}",
            status,
            body,
            payload
        );
        return Err(format!("Calendar API error ({}): {}", status, body));
    }

    let event_resp: CalendarEventResponse =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse Calendar response: {} - body: {}", e, body))?;

    let meet_url = event_resp
        .hangout_link
        .or_else(|| {
            event_resp
                .conference_data
                .as_ref()
                .and_then(|cd| cd.entry_points.as_ref())
                .and_then(|eps| {
                    eps.iter()
                        .find(|ep| ep.entry_point_type.as_deref() == Some("video"))
                        .and_then(|ep| ep.uri.clone())
                })
        });

    match meet_url {
        Some(url) => Ok(GoogleMeetInfo {
            meet_url: url,
            event_id: event_resp.id,
        }),
        None => {
            let payload = serde_json::to_string(&event).unwrap_or_default();
            log::error!(
                "No Meet URL in Calendar response.\nPayload: {}\nResponse: {}",
                payload,
                body
            );
            Err(format!(
                "No Meet URL in Calendar response. Payload: {} | Response: {}",
                payload, body
            ))
        }
    }
}

#[tauri::command]
pub async fn cmd_google_disconnect(
    state: State<'_, GoogleState>,
) -> Result<bool, String> {
    *state.tokens.lock().await = None;

    let path = tokens_file_path();
    let _ = tokio::fs::remove_file(&path).await;

    Ok(true)
}

pub async fn initialize_google_state() -> GoogleState {
    let client_id = std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default();
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default();
    let redirect_uri = std::env::var("GOOGLE_REDIRECT_URI")
        .unwrap_or_else(|_| "http://localhost:1420/auth/google/callback".to_string());

    let loaded_tokens = load_tokens_from_file().await;

    GoogleState {
        tokens: Arc::new(Mutex::new(loaded_tokens)),
        client_id,
        client_secret,
        redirect_uri,
    }
}
