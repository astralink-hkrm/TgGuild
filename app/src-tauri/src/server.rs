use crate::commands::utils::resolve_peer;
use crate::commands::TelegramState;
use actix_cors::Cors;
use actix_web::{get, web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use grammers_client::types::Media;

use std::sync::Arc;

/// Holds the per-session streaming token for Actix validation
pub struct StreamTokenData {
    pub token: String,
}

#[derive(serde::Deserialize)]
struct StreamQuery {
    token: Option<String>,
}

#[get("/stream/{folder_id}/{message_id}")]
async fn stream_media(
    req: HttpRequest,
    path: web::Path<(String, i32)>,
    query: web::Query<StreamQuery>,
    data: web::Data<Arc<TelegramState>>,
    token_data: web::Data<StreamTokenData>,
) -> impl Responder {
    let (folder_id_str, message_id) = path.into_inner();

    // Validate session token
    match &query.token {
        Some(t) if t == &token_data.token => {}
        _ => {
            return HttpResponse::Forbidden().body("Invalid or missing stream token");
        }
    }

    let folder_id = if folder_id_str == "me" || folder_id_str == "home" || folder_id_str == "null" {
        None
    } else {
        match folder_id_str.parse::<i64>() {
            Ok(id) => Some(id),
            Err(_) => return HttpResponse::BadRequest().body("Invalid folder ID"),
        }
    };

    let client_opt = { data.client.lock().await.clone() };

    if let Some(client) = client_opt {
        match resolve_peer(&client, folder_id, &data.peer_cache).await {
            Ok(peer) => {
                match client.get_messages_by_id(peer, &[message_id]).await {
                    Ok(messages) => {
                        if let Some(Some(msg)) = messages.first() {
                            if let Some(media) = msg.media() {
                                let total_size = match &media {
                                    Media::Document(d) => d.size(),
                                    Media::Photo(_) => 0,
                                    _ => 0,
                                };
                                let mime = mime_type_from_media(&media);

                                // Parse Range header for seek support
                                let range_header = req.headers().get("Range").and_then(|v| v.to_str().ok());

                                if let Some(range_str) = range_header {
                                    if let Some((start, end)) = parse_range(range_str, total_size as u64) {
                                        let range_len = end - start + 1;
                                        log::debug!("Stream request: Range {}-{}/{} for msg {}", start, end, total_size, message_id);

                                        let mut download_iter = client.iter_download(&media);
                                        let stream = async_stream::stream! {
                                        let mut bytes_skipped: u64 = 0;
                                        let mut bytes_sent: u64 = 0;
                                            while let Some(chunk) = download_iter.next().await.transpose() {
                                                match chunk {
                                                    Ok(bytes) => {
                                                        let chunk_len = bytes.len() as u64;
                                                        let chunk_start = bytes_skipped;
                                                        let chunk_end = bytes_skipped + chunk_len;

                                                        if chunk_end <= start {
                                                            bytes_skipped += chunk_len;
                                                            continue;
                                                        }

                                                        if bytes_sent >= range_len {
                                                            break;
                                                        }

                                                        let offset = if chunk_start < start {
                                                            (start - chunk_start) as usize
                                                        } else {
                                                            0
                                                        };

                                                        let available = chunk_len.saturating_sub(offset as u64);
                                                        let remaining = range_len.saturating_sub(bytes_sent);
                                                        let take = available.min(remaining) as usize;

                                                        if take > 0 {
                                                            let slice = &bytes[offset..offset + take];
                                                            bytes_sent += take as u64;
                                                            yield Ok::<_, actix_web::Error>(web::Bytes::copy_from_slice(slice));
                                                        }

                                                        bytes_skipped += chunk_len;

                                                        if bytes_sent >= range_len {
                                                            break;
                                                        }
                                                    }
                                                    Err(e) => {
                                                        log::error!("Stream error on msg {}: {}", message_id, e);
                                                        break;
                                                    }
                                                }
                                            }
                                        };

                                        return HttpResponse::PartialContent()
                                            .insert_header(("Content-Type", mime))
                                            .insert_header(("Content-Length", range_len.to_string()))
                                            .insert_header(("Content-Range", format!("bytes {}-{}/{}", start, end, total_size)))
                                            .insert_header(("Accept-Ranges", "bytes"))
                                            .insert_header(("Cache-Control", "private, max-age=120"))
                                            .streaming(stream);
                                    }
                                }

                                // Full content response
                                let mut download_iter = client.iter_download(&media);
                                let stream = async_stream::stream! {
                                    while let Some(chunk) = download_iter.next().await.transpose() {
                                        match chunk {
                                            Ok(bytes) => yield Ok::<_, actix_web::Error>(web::Bytes::from(bytes)),
                                            Err(e) => {
                                                log::error!("Stream error on msg {}: {}", message_id, e);
                                                break;
                                            }
                                        }
                                    }
                                };

                                return HttpResponse::Ok()
                                    .insert_header(("Content-Type", mime))
                                    .insert_header(("Content-Length", total_size.to_string()))
                                    .insert_header(("Accept-Ranges", "bytes"))
                                    .insert_header(("Cache-Control", "private, max-age=120"))
                                    .streaming(stream);
                            }
                        }
                        HttpResponse::NotFound().body("Message or media not found")
                    }
                    Err(e) => HttpResponse::InternalServerError()
                        .body(format!("Failed to fetch message: {}", e)),
                }
            }
            Err(e) => HttpResponse::BadRequest().body(format!("Peer resolution failed: {}", e)),
        }
    } else {
        HttpResponse::ServiceUnavailable().body("Telegram client not connected")
    }
}

fn parse_range(range_str: &str, file_size: u64) -> Option<(u64, u64)> {
    let range_str = range_str.strip_prefix("bytes=")?;
    let (start_str, end_str) = range_str.split_once('-')?;
    let start: u64 = start_str.parse().ok()?;
    let end: u64 = if end_str.is_empty() {
        file_size.saturating_sub(1)
    } else {
        end_str.parse().ok()?
    };
    if start >= file_size || end >= file_size || start > end {
        return None;
    }
    Some((start, end))
}

#[get("/avatar/{user_id}")]
async fn stream_avatar(
    user_id: web::Path<i64>,
    query: web::Query<StreamQuery>,
    data: web::Data<Arc<TelegramState>>,
    token_data: web::Data<StreamTokenData>,
) -> impl Responder {
    let uid = user_id.into_inner();

    // Validate session token
    match &query.token {
        Some(t) if t == &token_data.token => {
            log::debug!(
                "Avatar request: Token validated successfully for user {}",
                uid
            );
        }
        _ => {
            log::error!(
                "Avatar request failed: Invalid or missing stream token for user {}",
                uid
            );
            return HttpResponse::Forbidden().body("Invalid or missing stream token");
        }
    }

    let client_opt = { data.client.lock().await.clone() };

    if let Some(client) = client_opt {
        let peer = match resolve_peer(&client, Some(uid), &data.peer_cache).await {
            Ok(p) => p,
            Err(_) => return HttpResponse::NotFound().body("Peer not found"),
        };

        let mut photos = client.iter_profile_photos(&peer);
        match photos.next().await {
            Ok(Some(photo)) => {
                let mut download_iter = client.iter_download(&photo);
                let stream = async_stream::stream! {
                    while let Some(chunk) = download_iter.next().await.transpose() {
                        match chunk {
                            Ok(bytes) => yield Ok::<_, actix_web::Error>(web::Bytes::from(bytes)),
                            Err(e) => {
                                log::error!("Avatar stream error on peer {}: {}", uid, e);
                                break;
                            }
                        }
                    }
                };

                return HttpResponse::Ok()
                    .insert_header(("Content-Type", "image/jpeg"))
                    .insert_header(("Cache-Control", "private, max-age=3600"))
                    .streaming(stream);
            }
            Ok(None) => {}
            Err(e) => log::warn!(
                "Avatar request failed while fetching photos for peer {}: {}",
                uid,
                e
            ),
        }

        HttpResponse::NotFound().body("Avatar not found")
    } else {
        HttpResponse::ServiceUnavailable().body("Telegram client not connected")
    }
}

fn mime_type_from_media(media: &Media) -> String {
    match media {
        Media::Document(d) => {
            let is_voice = d.raw.voice;
            let name = d.name();
            let is_voice_name = name.starts_with("voice-") && name.ends_with(".webm");

            if is_voice || is_voice_name {
                return "audio/webm".to_string();
            }

            d.mime_type()
                .unwrap_or("application/octet-stream")
                .to_string()
        }
        _ => "application/octet-stream".to_string(),
    }
}

pub async fn start_server(
    state: Arc<TelegramState>,
    port: u16,
    token: String,
) -> std::io::Result<actix_web::dev::Server> {
    let state_data = web::Data::new(state);
    let token_data = web::Data::new(StreamTokenData { token });

    log::info!("Starting Streaming Server on port {}", port);

    let server = HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .send_wildcard()
            .allow_any_method()
            .allow_any_header()
            .expose_headers(["Content-Range", "Accept-Ranges", "Content-Length"]);

        App::new()
            .wrap(cors)
            .app_data(state_data.clone())
            .app_data(token_data.clone())
            .service(stream_media)
            .service(stream_avatar)
    })
    .bind(("127.0.0.1", port))?
    .run();

    log::info!(
        "Streaming Server started successfully on http://127.0.0.1:{}",
        port
    );

    Ok(server)
}
