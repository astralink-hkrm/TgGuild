use tauri::{State, Emitter};
use grammers_client::types::{Media, Peer};
use grammers_client::InputMessage;
use grammers_tl_types as tl;
use crate::TelegramState;
use crate::models::{FolderMetadata, FileMetadata};
use crate::bandwidth::BandwidthManager;
use crate::commands::utils::{resolve_peer, map_error};

const VIRTUAL_FOLDER_PREFIX: &str = "TGGuild_FOLDER_V1:";
const VIRTUAL_FILE_PREFIX: &str = "TGGuild_FILE_V1:";

fn parse_virtual_folder_meta(text: &str) -> Option<(String, Option<i64>, Option<i64>)> {
    let json = text.strip_prefix(VIRTUAL_FOLDER_PREFIX)?;
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    let name = value.get("name")?.as_str()?.to_string();
    let parent_id = value.get("parent_id").and_then(|v| {
        if v.is_null() {
            None
        } else {
            v.as_i64()
        }
    });
    let current_id = value.get("current_id").and_then(|v| {
        if v.is_null() {
            None
        } else {
            v.as_i64()
        }
    });
    Some((name, parent_id, current_id))
}

fn virtual_folder_meta_text(name: &str, parent_id: Option<i64>, current_id: Option<i64>) -> String {
    format!(
        "{}{}",
        VIRTUAL_FOLDER_PREFIX,
        serde_json::json!({ "name": name, "parent_id": parent_id, "current_id": current_id })
    )
}

fn parse_virtual_file_meta(text: &str) -> Option<(String, Option<i64>, Option<i64>)> {
    let json = text.strip_prefix(VIRTUAL_FILE_PREFIX)?;
    let mut lines = json.lines();
    let value: serde_json::Value = serde_json::from_str(lines.next()?).ok()?;
    let name = value.get("name")?.as_str()?.to_string();
    let parent_id = value.get("parent_id").and_then(|v| {
        if v.is_null() {
            None
        } else {
            v.as_i64()
        }
    });
    let current_id = value.get("current_id").and_then(|v| {
        if v.is_null() {
            None
        } else {
            v.as_i64()
        }
    });
    Some((name, parent_id, current_id))
}

fn virtual_file_meta_text(name: &str, parent_id: Option<i64>, current_id: Option<i64>) -> String {
    format!(
        "{}{}",
        VIRTUAL_FILE_PREFIX,
        serde_json::json!({ "name": name, "parent_id": parent_id, "current_id": current_id })
    )
}

#[tauri::command]
pub async fn cmd_create_folder(
    name: String,
    state: State<'_, TelegramState>,
) -> Result<FolderMetadata, String> {
    let client_opt = {
        state.client.lock().await.clone()
    };
    
    // --- MOCK ---
    if client_opt.is_none() {
        let mock_id = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
        log::info!("[MOCK] Created folder '{}' with ID {}", name, mock_id);
        return Ok(FolderMetadata {
            id: mock_id,
            name,
            parent_id: None,
            current_id: Some(mock_id),
            member_count: 0,
            top_members: Vec::new(),
        });
    }
    // -----------
    let client = client_opt.unwrap();
    log::info!("Creating Telegram Channel: {}", name);
    
    let result = client.invoke(&tl::functions::channels::CreateChannel {
        broadcast: true,
        megagroup: false,
        title: format!("{} [TD]", name),
        about: "TgGuild Storage Folder\n[tgguild-folder]".to_string(),
        geo_point: None,
        address: None,
        for_import: false,
        forum: false,
        ttl_period: None, // Initial creation TTL
    }).await.map_err(map_error)?;
    
    let (chat_id, access_hash) = match result {
        tl::enums::Updates::Updates(u) => {
             let chat = u.chats.first().ok_or("No chat in updates")?;
             match chat {
                 tl::enums::Chat::Channel(c) => (c.id, c.access_hash.unwrap_or(0)),
                 _ => return Err("Created chat is not a channel".to_string()),
             }
        },
        _ => return Err("Unexpected response (not Updates::Updates)".to_string()), 
    };

    // Explicitly Disable TTL
    let _input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
         channel_id: chat_id,
         access_hash,
    });

    let _ = client.invoke(&tl::functions::messages::SetHistoryTtl {
        peer: tl::enums::InputPeer::Channel(tl::types::InputPeerChannel { channel_id: chat_id, access_hash }),
        period: 0, 
    }).await;

    Ok(FolderMetadata {
        id: chat_id,
        name,
        parent_id: None,
        current_id: Some(chat_id),
        member_count: 1,
        top_members: Vec::new(),
    })
}

#[tauri::command]
pub async fn cmd_delete_folder(
    folder_id: i64,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = {
        state.client.lock().await.clone()
    };
    
    if client_opt.is_none() {
        log::info!("[MOCK] Deleted folder ID {}", folder_id);
        return Ok(true);
    }
    let client = client_opt.unwrap();
    log::info!("Deleting folder/channel: {}", folder_id);

    let peer = resolve_peer(&client, Some(folder_id), &state.peer_cache).await?;
    
    let input_channel = match peer {
        Peer::Channel(c) => {
             let chan = &c.raw;
             tl::enums::InputChannel::Channel(tl::types::InputChannel {
                 channel_id: chan.id,
                 access_hash: chan.access_hash.ok_or("No access hash for channel")?,
             })
        },
        _ => return Err("Only channels (folders) can be deleted.".to_string()),
    };
    
    client.invoke(&tl::functions::channels::DeleteChannel {
        channel: input_channel,
    }).await.map_err(|e| format!("Failed to delete channel: {}", e))?;
    
    Ok(true)
}


#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    id: String,
    percent: u8,
    uploaded_bytes: u64,
    total_bytes: u64,
    speed_bytes_per_sec: u64,
}

/// Async reader wrapper that tracks bytes read for progress reporting.
/// Wraps a tokio File and counts how many bytes have been consumed.
struct ProgressReader {
    inner: tokio::io::BufReader<tokio::fs::File>,
    bytes_read: std::sync::Arc<std::sync::atomic::AtomicU64>,
}

impl ProgressReader {
    async fn new(path: &str) -> Result<(Self, u64, std::sync::Arc<std::sync::atomic::AtomicU64>), String> {
        let file = tokio::fs::File::open(path).await.map_err(|e| e.to_string())?;
        let metadata = file.metadata().await.map_err(|e| e.to_string())?;
        let size = metadata.len();
        let counter = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
        let reader = Self {
            inner: tokio::io::BufReader::new(file),
            bytes_read: counter.clone(),
        };
        Ok((reader, size, counter))
    }
}

impl tokio::io::AsyncRead for ProgressReader {
    fn poll_read(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        let before = buf.filled().len();
        let result = std::pin::Pin::new(&mut self.inner).poll_read(cx, buf);
        if let std::task::Poll::Ready(Ok(())) = &result {
            let after = buf.filled().len();
            let delta = (after - before) as u64;
            self.bytes_read.fetch_add(delta, std::sync::atomic::Ordering::Relaxed);
        }
        result
    }
}

/// Delete a partial file with retries (best-effort cleanup)
fn cleanup_partial_file(path: &str) {
    let path = path.to_string();
    std::thread::spawn(move || {
        for attempt in 0..5 {
            match std::fs::remove_file(&path) {
                Ok(()) => {
                    log::info!("Cleaned up partial file: {}", path);
                    return;
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return,
                Err(e) => {
                    log::warn!("Cleanup attempt {}/5 failed for {}: {}", attempt + 1, path, e);
                    std::thread::sleep(std::time::Duration::from_secs(1));
                }
            }
        }
    });
}

#[tauri::command]
pub async fn cmd_cancel_transfer(
    transfer_id: String,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    log::info!("Cancelling transfer: {}", transfer_id);
    state.cancelled_transfers.write().await.insert(transfer_id);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_upload_file(
    path: String,
    folder_id: Option<i64>,
    virtual_folder_id: Option<i64>,
    transfer_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
) -> Result<String, String> {
    let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    bw_state.can_transfer(size)?;

    let tid = transfer_id.unwrap_or_default();

    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        log::info!("[MOCK] Uploaded file {} to {:?}/{:?}", path, folder_id, virtual_folder_id);
        bw_state.add_up(size);
        return Ok("Mock upload successful".to_string());
    }
    let client = client_opt.unwrap();

    // Emit start progress
    if !tid.is_empty() {
        let _ = app_handle.emit("upload-progress", ProgressPayload {
            id: tid.clone(), percent: 0, uploaded_bytes: 0, total_bytes: size, speed_bytes_per_sec: 0,
        });
    }

    // Create progress-tracking reader
    let (mut reader, file_size, bytes_counter) = ProgressReader::new(&path).await?;
    let file_name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());

    // Spawn a progress reporter task that emits events every 250ms
    let cancelled = state.cancelled_transfers.clone();
    let progress_tid = tid.clone();
    let progress_handle = app_handle.clone();
    let progress_counter = bytes_counter.clone();
    let progress_task = if !tid.is_empty() {
        Some(tokio::spawn(async move {
            let mut last_bytes: u64 = 0;
            let mut last_time = std::time::Instant::now();
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                let current = progress_counter.load(std::sync::atomic::Ordering::Relaxed);
                let now = std::time::Instant::now();
                let dt = now.duration_since(last_time).as_secs_f64();
                let speed = if dt > 0.0 { ((current - last_bytes) as f64 / dt) as u64 } else { 0 };
                let percent = if file_size > 0 { ((current as f64 / file_size as f64) * 100.0).min(99.0) as u8 } else { 0 };

                let _ = progress_handle.emit("upload-progress", ProgressPayload {
                    id: progress_tid.clone(), percent, uploaded_bytes: current, total_bytes: file_size, speed_bytes_per_sec: speed,
                });

                last_bytes = current;
                last_time = now;

                if current >= file_size { break; }
                // Check cancellation
                if cancelled.read().await.contains(&progress_tid) { break; }
            }
        }))
    } else {
        None
    };

    // Check cancellation before starting
    if state.cancelled_transfers.read().await.contains(&tid) {
        state.cancelled_transfers.write().await.remove(&tid);
        if let Some(t) = progress_task { t.abort(); }
        return Err("Transfer cancelled".to_string());
    }

    let client_clone = client.clone();
    let upload_file_name = file_name.clone();
    let upload_result = tokio::spawn(async move {
        client_clone.upload_stream(&mut reader, file_size as usize, upload_file_name).await
    }).await.map_err(|e| format!("Task join error: {}", e))?;

    // Stop progress reporter
    if let Some(t) = progress_task { t.abort(); }

    // Check cancellation after upload
    if state.cancelled_transfers.read().await.contains(&tid) {
        state.cancelled_transfers.write().await.remove(&tid);
        return Err("Transfer cancelled".to_string());
    }

    let uploaded_file = upload_result.map_err(map_error)?;
    let message = InputMessage::new()
        .text(virtual_file_meta_text(&file_name, virtual_folder_id, None))
        .file(uploaded_file);

    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;

    let sent = client.send_message(&peer, message).await.map_err(map_error)?;

    let message_id = sent.id();
    let input_peer = match &peer {
        Peer::Channel(c) => tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
            channel_id: c.raw.id,
            access_hash: c.raw.access_hash.unwrap_or(0),
        }),
        Peer::User(_) => tl::enums::InputPeer::PeerSelf,
        Peer::Group(_) => return Err("Groups are not supported for file operations.".to_string()),
    };

    let _ = client.invoke(&tl::functions::messages::EditMessage {
        no_webpage: true,
        peer: input_peer,
        id: message_id,
        message: Some(virtual_file_meta_text(&file_name, virtual_folder_id, Some(message_id as i64))),
        media: None,
        reply_markup: None,
        entities: None,
        schedule_date: None,
        invert_media: false,
        quick_reply_shortcut_id: None,
        schedule_repeat_period: None,
    }).await;

    bw_state.add_up(size);

    // Emit completion
    if !tid.is_empty() {
        let _ = app_handle.emit("upload-progress", ProgressPayload {
            id: tid, percent: 100, uploaded_bytes: size, total_bytes: size, speed_bytes_per_sec: 0,
        });
    }

    Ok("File uploaded successfully".to_string())
}

#[tauri::command]
pub async fn cmd_rename_folder(
    folder_id: i64,
    new_name: String,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        log::info!("[MOCK] Renamed folder ID {} to {}", folder_id, new_name);
        return Ok(true);
    }
    let client = client_opt.unwrap();
log::info!("[RENAME_FOLDER] folder_id={}, new_name='{}'", folder_id, new_name);
    println!("[RENAME_FOLDER] folder_id={}, new_name='{}'", folder_id, new_name);

    let peer = resolve_peer(&client, Some(folder_id), &state.peer_cache).await?;
    let input_channel = match peer {
        Peer::Channel(c) => {
            let chan = &c.raw;
            tl::enums::InputChannel::Channel(tl::types::InputChannel {
                channel_id: chan.id,
                access_hash: chan.access_hash.ok_or("No access hash for channel")?,
            })
        }
        _ => return Err("Only channels (folders) can be renamed.".to_string()),
    };

    let target_title = format!("{} [TD]", new_name);
    log::info!("[RENAME_FOLDER] Target title on Telegram will be: '{}'", target_title);
    println!("[RENAME_FOLDER] Target title on Telegram will be: '{}'", target_title);

    // Fetch fresh channel info from Telegram to get current title
    log::info!("[RENAME_FOLDER] Fetching current channel info from Telegram...");
    println!("[RENAME_FOLDER] Fetching current channel info from Telegram...");
    let current_title = match client.invoke(&tl::functions::channels::GetFullChannel {
        channel: input_channel.clone(),
    }).await {
        Ok(tl::enums::messages::ChatFull::Full(f)) => {
            let channel_opt = f.chats.iter().find_map(|c| {
                if let tl::enums::Chat::Channel(chan) = c {
                    Some(chan)
                } else {
                    None
                }
            });
            match channel_opt {
                Some(c) => {
                    log::info!("[RENAME_FOLDER] GetFullChannel Response - chats count: {}", f.chats.len());
                    log::info!("[RENAME_FOLDER] Current title on Telegram: '{}'", c.title);
                    println!("[RENAME_FOLDER] GetFullChannel Response - chats count: {}", f.chats.len());
                    println!("[RENAME_FOLDER] Current title on Telegram: '{}'", c.title);
                    c.title.clone()
                }
                None => return Err("Could not read channel info".to_string()),
            }
        }
        Err(e) => return Err(format!("Failed to get channel info: {}", e)),
    };

    log::info!("[RENAME_FOLDER] Comparing - current='{}' vs target='{}'", current_title, target_title);
    println!("[RENAME_FOLDER] Comparing - current='{}' vs target='{}'", current_title, target_title);

    if current_title == target_title {
        log::info!("[RENAME_FOLDER] SKIPPED: No change needed (title already matches)");
        println!("[RENAME_FOLDER] SKIPPED: No change needed (title already matches)");
        return Ok(true);
    }

    log::info!("[RENAME_FOLDER] CHANGE REQUIRED: '{}' -> '{}'", current_title, target_title);
    println!("[RENAME_FOLDER] CHANGE REQUIRED: '{}' -> '{}'", current_title, target_title);
    log::info!("[RENAME_FOLDER] Calling channels.editTitle API...");
    println!("[RENAME_FOLDER] Calling channels.editTitle API...");

    match client.invoke(&tl::functions::channels::EditTitle {
        channel: input_channel,
        title: target_title,
    }).await {
        Ok(result) => {
            log::info!("[RENAME_FOLDER] SUCCESS: API response = {:?}", result);
            println!("[RENAME_FOLDER] SUCCESS: API response = {:?}", result);
            Ok(true)
        }
        Err(e) => {
            log::error!("[RENAME_FOLDER] FAILED: API error = {}", e);
            eprintln!("[RENAME_FOLDER] FAILED: API error = {}", e);
            Err(format!("Failed to rename channel: {}", e))
        }
    }
}

#[tauri::command]
pub async fn cmd_rename_file(
    message_id: i32,
    folder_id: Option<i64>,
    new_name: String,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        log::info!("[MOCK] Renamed message {} in folder {:?} to {}", message_id, folder_id, new_name);
        return Ok(true);
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;
    if let Some(existing) = client
        .get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .flatten()
        .next()
    {
        if let Some((_, parent_id, current_id)) = parse_virtual_folder_meta(existing.text()) {
            let input_peer = match &peer {
                Peer::Channel(c) => tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
                    channel_id: c.raw.id,
                    access_hash: c.raw.access_hash.unwrap_or(0),
                }),
                Peer::User(_) => tl::enums::InputPeer::PeerSelf,
                Peer::Group(_) => return Err("Groups are not supported for file operations.".to_string()),
            };
            client.invoke(&tl::functions::messages::EditMessage {
                no_webpage: true,
                peer: input_peer,
                id: message_id,
                message: Some(virtual_folder_meta_text(&new_name, parent_id, current_id)),
                media: None,
                reply_markup: None,
                entities: None,
                schedule_date: None,
                invert_media: false,
                quick_reply_shortcut_id: None,
                schedule_repeat_period: None,
            }).await.map_err(|e| format!("Failed to rename folder: {}", e))?;
            return Ok(true);
        }
        if let Some((_, parent_id, current_id)) = parse_virtual_file_meta(existing.text()) {
            let input_peer = match &peer {
                Peer::Channel(c) => tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
                    channel_id: c.raw.id,
                    access_hash: c.raw.access_hash.unwrap_or(0),
                }),
                Peer::User(_) => tl::enums::InputPeer::PeerSelf,
                Peer::Group(_) => return Err("Groups are not supported for file operations.".to_string()),
            };
            client.invoke(&tl::functions::messages::EditMessage {
                no_webpage: true,
                peer: input_peer,
                id: message_id,
                message: Some(virtual_file_meta_text(&new_name, parent_id, current_id)),
                media: None,
                reply_markup: None,
                entities: None,
                schedule_date: None,
                invert_media: false,
                quick_reply_shortcut_id: None,
                schedule_repeat_period: None,
            }).await.map_err(|e| format!("Failed to rename file: {}", e))?;
            return Ok(true);
        }
    }

    let input_peer = match &peer {
        Peer::Channel(c) => tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
            channel_id: c.raw.id,
            access_hash: c.raw.access_hash.unwrap_or(0),
        }),
        Peer::User(u) => tl::enums::InputPeer::User(tl::types::InputPeerUser {
            user_id: u.raw.id(),
            access_hash: 0,
        }),
        Peer::Group(_) => return Err("Groups are not supported for file operations.".to_string()),
    };

    client.invoke(&tl::functions::messages::EditMessage {
        no_webpage: true,
        peer: input_peer,
        id: message_id,
        message: Some(new_name),
        media: None,
        reply_markup: None,
        entities: None,
        schedule_date: None,
        invert_media: false,
        quick_reply_shortcut_id: None,
        schedule_repeat_period: None,
    }).await.map_err(|e| format!("Failed to rename file (edit caption): {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn cmd_delete_file(
    message_id: i32,
    folder_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() { 
         log::info!("[MOCK] Deleted message {} from folder {:?}", message_id, folder_id);
        return Ok(true); 
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;
    client.delete_messages(&peer, &[message_id]).await.map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn cmd_download_file(
    message_id: i32,
    save_path: String,
    folder_id: Option<i64>,
    transfer_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
) -> Result<String, String> {
    let tid = transfer_id.unwrap_or_default();

    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() { 
        log::info!("[MOCK] Downloaded message {} from {:?} to {}", message_id, folder_id, save_path);
        if let Err(e) = std::fs::write(&save_path, b"Mock Content") { return Err(e.to_string()); }
        return Ok("Download successful".to_string());
    }
    let client = client_opt.unwrap();
    
    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;

    // Use get_messages_by_id for efficient message lookup (same as server.rs)
    let messages = client.get_messages_by_id(&peer, &[message_id]).await.map_err(|e| e.to_string())?;
    
    let msg = messages.into_iter()
        .flatten()
        .next()
        .ok_or_else(|| "Message not found".to_string())?;

    let media = msg.media()
        .ok_or_else(|| "No media in message".to_string())?;

    let total_size = match &media {
        Media::Document(d) => d.size() as u64,
        Media::Photo(_) => 1024 * 1024,
        _ => 0,
    };
    
    bw_state.can_transfer(total_size)?;

    // Emit start
    if !tid.is_empty() {
        let _ = app_handle.emit("download-progress", ProgressPayload {
            id: tid.clone(), percent: 0, uploaded_bytes: 0, total_bytes: total_size, speed_bytes_per_sec: 0,
        });
    }

    // Stream download with per-chunk progress
    let mut download_iter = client.iter_download(&media);
    let mut file = std::fs::File::create(&save_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut last_emit_time = std::time::Instant::now();
    let mut last_emit_bytes: u64 = 0;

    while let Some(chunk) = download_iter.next().await.transpose() {
        // Check cancellation
        if state.cancelled_transfers.read().await.contains(&tid) {
            state.cancelled_transfers.write().await.remove(&tid);
            drop(file);
            cleanup_partial_file(&save_path);
            return Err("Transfer cancelled".to_string());
        }

        let bytes = chunk.map_err(|e| format!("Download chunk error: {}", e))?;
        std::io::Write::write_all(&mut file, &bytes).map_err(|e| e.to_string())?;
        downloaded += bytes.len() as u64;
        
        // Time-based progress emission (every 250ms)
        if !tid.is_empty() {
            let now = std::time::Instant::now();
            let dt = now.duration_since(last_emit_time).as_secs_f64();
            if dt >= 0.25 || downloaded >= total_size {
                let speed = if dt > 0.0 { ((downloaded - last_emit_bytes) as f64 / dt) as u64 } else { 0 };
                let percent = if total_size > 0 { ((downloaded as f64 / total_size as f64) * 100.0).min(100.0) as u8 } else { 0 };
                let _ = app_handle.emit("download-progress", ProgressPayload {
                    id: tid.clone(), percent, uploaded_bytes: downloaded, total_bytes: total_size, speed_bytes_per_sec: speed,
                });
                last_emit_time = now;
                last_emit_bytes = downloaded;
            }
        }
    }

    bw_state.add_down(total_size);

    // Emit completion
    if !tid.is_empty() {
        let _ = app_handle.emit("download-progress", ProgressPayload {
            id: tid, percent: 100, uploaded_bytes: downloaded, total_bytes: total_size, speed_bytes_per_sec: 0,
        });
    }

    Ok("Download successful".to_string())
}

#[tauri::command]
pub async fn cmd_move_files(
    message_ids: Vec<i32>,
    source_folder_id: Option<i64>,
    target_folder_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    if source_folder_id == target_folder_id { return Ok(true); }
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() { 
        log::info!("[MOCK] Moved msgs {:?} from {:?} to {:?}", message_ids, source_folder_id, target_folder_id);
        return Ok(true); 
    }
    let client = client_opt.unwrap();

    let source_peer = resolve_peer(&client, source_folder_id, &state.peer_cache).await?;
    let target_peer = resolve_peer(&client, target_folder_id, &state.peer_cache).await?;

    match client.forward_messages(&target_peer, &message_ids, &source_peer).await {
        Ok(_) => {},
        Err(e) => return Err(format!("Forward failed: {}", e)),
    }
    
    match client.delete_messages(&source_peer, &message_ids).await {
        Ok(_) => {},
        Err(e) => return Err(format!("Delete original failed: {}", e)),
    }

    Ok(true)
}

#[tauri::command]
pub async fn cmd_share_files(
    message_ids: Vec<i32>,
    source_folder_id: Option<i64>,
    target_folder_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    if message_ids.is_empty() {
        return Ok(true);
    }

    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        log::info!("[MOCK] Shared msgs {:?} from {:?} to {:?}", message_ids, source_folder_id, target_folder_id);
        return Ok(true);
    }
    let client = client_opt.unwrap();

    let source_peer = resolve_peer(&client, source_folder_id, &state.peer_cache).await?;
    let target_peer = resolve_peer(&client, target_folder_id, &state.peer_cache).await?;

    client
        .forward_messages(&target_peer, &message_ids, &source_peer)
        .await
        .map_err(|e| format!("Share failed: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn cmd_get_files(
    folder_id: Option<i64>,
    virtual_folder_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<Vec<FileMetadata>, String> {
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() { 
        log::info!("[MOCK] Returning mock files for folder {:?}", folder_id);
        return Ok(Vec::new()); // No mock files for now
    }
    let client = client_opt.unwrap();
    let mut files = Vec::new();
    
    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;

    let mut msgs = client.iter_messages(&peer);
    while let Some(msg) = msgs.next().await.map_err(|e| e.to_string())? {
        if let Some((name, parent_virtual_folder_id, meta_current_id)) = parse_virtual_folder_meta(msg.text()) {
            if parent_virtual_folder_id == virtual_folder_id {
                files.push(FileMetadata {
                    id: msg.id() as i64,
                    folder_id,
                    virtual_folder_id: Some(msg.id() as i64),
                    parent_virtual_folder_id,
                    current_id: meta_current_id.or(Some(msg.id() as i64)),
                    name,
                    size: 0,
                    mime_type: None,
                    file_ext: None,
                    created_at: msg.date().to_string(),
                    icon_type: "folder".into(),
                });
            }
            continue;
        }

        if let Some(doc) = msg.media() {
            let (mut name, size, mime, ext) = match doc {
                Media::Document(d) => {
                    let n = d.name().to_string();
                    let s = d.size();
                    let m = d.mime_type().map(|s| s.to_string());
                    let e = std::path::Path::new(&n).extension().map(|os| os.to_str().unwrap_or("").to_string());
                    (n, s, m, e)
                },
                Media::Photo(_) => ("Photo.jpg".to_string(), 0, Some("image/jpeg".into()), Some("jpg".into())),
                _ => ("Unknown".to_string(), 0, None, None),
            };

            let mut parent_virtual_folder_id = None;
            let mut current_id = None;
            if let Some((meta_name, meta_parent_id, meta_current_id)) = parse_virtual_file_meta(msg.text()) {
                name = meta_name;
                parent_virtual_folder_id = meta_parent_id;
                current_id = meta_current_id;
            } else if !msg.text().is_empty() {
                name = msg.text().to_string();
            }

            if parent_virtual_folder_id != virtual_folder_id {
                continue;
            }

            files.push(FileMetadata {
                id: msg.id() as i64,
                folder_id,
                virtual_folder_id: None,
                parent_virtual_folder_id,
                current_id: current_id.or(Some(msg.id() as i64)),
                name,
                size: size as u64,
                mime_type: mime,
                file_ext: ext,
                created_at: msg.date().to_string(),
                icon_type: "file".into(),
            });
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn cmd_create_virtual_folder(
    folder_id: Option<i64>,
    parent_virtual_folder_id: Option<i64>,
    name: String,
    state: State<'_, TelegramState>,
) -> Result<FileMetadata, String> {
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        let id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        return Ok(FileMetadata {
            id,
            folder_id,
            virtual_folder_id: Some(id),
            parent_virtual_folder_id,
            current_id: Some(id),
            name,
            size: 0,
            mime_type: None,
            file_ext: None,
            created_at: "".to_string(),
            icon_type: "folder".into(),
        });
    }
    let client = client_opt.unwrap();
    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;
    let sent = client
        .send_message(&peer, InputMessage::new().text(virtual_folder_meta_text(&name, parent_virtual_folder_id, None)))
        .await
        .map_err(map_error)?;

    let message_id = sent.id();
    let input_peer = match &peer {
        Peer::Channel(c) => tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
            channel_id: c.raw.id,
            access_hash: c.raw.access_hash.unwrap_or(0),
        }),
        Peer::User(_) => tl::enums::InputPeer::PeerSelf,
        Peer::Group(_) => return Err("Groups are not supported for file operations.".to_string()),
    };

    let _ = client.invoke(&tl::functions::messages::EditMessage {
        no_webpage: true,
        peer: input_peer,
        id: message_id,
        message: Some(virtual_folder_meta_text(&name, parent_virtual_folder_id, Some(message_id as i64))),
        media: None,
        reply_markup: None,
        entities: None,
        schedule_date: None,
        invert_media: false,
        quick_reply_shortcut_id: None,
        schedule_repeat_period: None,
    }).await;

    Ok(FileMetadata {
        id: sent.id() as i64,
        folder_id,
        virtual_folder_id: Some(sent.id() as i64),
        parent_virtual_folder_id,
        current_id: Some(sent.id() as i64),
        name,
        size: 0,
        mime_type: None,
        file_ext: None,
        created_at: sent.date().to_string(),
        icon_type: "folder".into(),
    })
}

#[tauri::command]
pub async fn cmd_search_global(
    query: String,
    state: State<'_, TelegramState>,
) -> Result<Vec<FileMetadata>, String> {
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() { 
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();
    let mut files = Vec::new();
    
    log::info!("Searching global for: {}", query);

    let result = client.invoke(&tl::functions::messages::SearchGlobal {
        q: query,
        filter: tl::enums::MessagesFilter::InputMessagesFilterDocument,
        min_date: 0,
        max_date: 0,
        offset_rate: 0,
        offset_peer: tl::enums::InputPeer::Empty,
        offset_id: 0,
        limit: 50,
        folder_id: None,
        broadcasts_only: false,
        groups_only: false,
        users_only: false,
    }).await.map_err(map_error)?;

    if let tl::enums::messages::Messages::Messages(msgs) = result {
        for msg in msgs.messages {
            if let tl::enums::Message::Message(m) = msg {
                if let Some(tl::enums::MessageMedia::Document(d)) = m.media {
                    if let tl::enums::Document::Document(doc) = d.document.unwrap() {
                        let mut name = doc.attributes.iter().find_map(|a| match a {
                            tl::enums::DocumentAttribute::Filename(f) => Some(f.file_name.clone()),
                            _ => None
                        }).unwrap_or("Unknown".to_string());

                        let mut current_id = Some(m.id as i64);

                        // Use message text (caption) as rename override if present
                        if !m.message.is_empty() {
                            name = m.message.clone();
                            if let Some((meta_name, _, meta_current_id)) = parse_virtual_file_meta(&m.message) {
                                name = meta_name;
                                if let Some(cid) = meta_current_id {
                                    current_id = Some(cid);
                                }
                            }
                        }

                        let size = doc.size as u64;
                        let mime = doc.mime_type.clone();
                        let ext = std::path::Path::new(&name).extension().map(|os| os.to_str().unwrap_or("").to_string());
                        let folder_id = match m.peer_id {
                            tl::enums::Peer::Channel(c) => Some(c.channel_id),
                            tl::enums::Peer::User(u) => Some(u.user_id),
                            tl::enums::Peer::Chat(c) => Some(c.chat_id),
                        };
                        files.push(FileMetadata {
                            id: m.id as i64,
                            folder_id,
                            virtual_folder_id: None,
                            parent_virtual_folder_id: None,
                            current_id,
                            name,
                            size,
                            mime_type: Some(mime), file_ext: ext,
                            created_at: m.date.to_string(), icon_type: "file".into()
                        });
                    }
                }
            }
        }
    } else if let tl::enums::messages::Messages::Slice(msgs) = result {
        for msg in msgs.messages {
            if let tl::enums::Message::Message(m) = msg {
                if let Some(tl::enums::MessageMedia::Document(d)) = m.media {
                    if let tl::enums::Document::Document(doc) = d.document.unwrap() {
                        let mut name = doc.attributes.iter().find_map(|a| match a {
                            tl::enums::DocumentAttribute::Filename(f) => Some(f.file_name.clone()),
                            _ => None
                        }).unwrap_or("Unknown".to_string());

                        let mut current_id = Some(m.id as i64);

                        // Use message text (caption) as rename override if present
                        if !m.message.is_empty() {
                            name = m.message.clone();
                            if let Some((meta_name, _, meta_current_id)) = parse_virtual_file_meta(&m.message) {
                                name = meta_name;
                                if let Some(cid) = meta_current_id {
                                    current_id = Some(cid);
                                }
                            }
                        }

                        let size = doc.size as u64;
                        let mime = doc.mime_type.clone();
                        let ext = std::path::Path::new(&name).extension().map(|os| os.to_str().unwrap_or("").to_string());
                        let folder_id = match m.peer_id {
                            tl::enums::Peer::Channel(c) => Some(c.channel_id),
                            tl::enums::Peer::User(u) => Some(u.user_id),
                            tl::enums::Peer::Chat(c) => Some(c.chat_id),
                        };
                        files.push(FileMetadata {
                            id: m.id as i64,
                            folder_id,
                            virtual_folder_id: None,
                            parent_virtual_folder_id: None,
                            current_id,
                            name,
                            size,
                            mime_type: Some(mime), file_ext: ext,
                            created_at: m.date.to_string(), icon_type: "file".into()
                        });
                    }
                }
            }
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn cmd_scan_folders(
    state: State<'_, TelegramState>,
) -> Result<Vec<FolderMetadata>, String> {
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() { 
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();
    
    let mut folders = Vec::new();
    let mut dialogs = client.iter_dialogs();
    
    log::info!("Starting Folder Scan...");

    // Acquire write lock once for the entire scan to populate the peer cache
    let mut peer_cache = state.peer_cache.write().await;

    while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
        // Populate peer cache for every dialog we encounter (free priming)
        match &dialog.peer {
            Peer::Channel(c) => {
                let id = c.raw.id;
                peer_cache.insert(id, dialog.peer.clone());

                let name = c.raw.title.clone();
                let access_hash = c.raw.access_hash.unwrap_or(0);
                
                log::debug!("[SCAN] Processing Channel: '{}' (ID: {})", name, id);

                // Strategy 1: Title
                if name.to_lowercase().contains("[td]") {
                    log::info!(" -> MATCH via Title: {}", name);
                    let display_name = name.replace(" [TD]", "").replace(" [td]", "").replace("[TD]", "").replace("[td]", "").trim().to_string();
                    folders.push(FolderMetadata { 
                        id, 
                        name: display_name, 
                        parent_id: None,
                        current_id: Some(id),
                        member_count: 0,
                        top_members: Vec::new(),
                    });
                    continue; 
                }

                // Strategy 2: About
                let input_chan = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                    channel_id: c.raw.id,
                    access_hash,
                });
                
                match client.invoke(&tl::functions::channels::GetFullChannel {
                    channel: input_chan,
                }).await {
                    Ok(tl::enums::messages::ChatFull::Full(f)) => {
                        let member_count = match &f.full_chat {
                            tl::enums::ChatFull::ChannelFull(cf) => cf.participants_count.unwrap_or(0),
                            _ => 0,
                        };

                        if let tl::enums::ChatFull::ChannelFull(cf) = &f.full_chat {
                             if cf.about.contains("[telegram-drive-folder]") {
                                 log::info!(" -> MATCH via About: {}", name);
                                 folders.push(FolderMetadata { 
                                     id, 
                                     name: name.clone(), 
                                     parent_id: None,
                                     current_id: Some(id),
                                     member_count,
                                     top_members: Vec::new(),
                                 });
                             }
                        }
                    },
                    Err(e) => log::warn!(" -> Failed to get full info: {}", e),
                }
            },
            Peer::User(u) => {
                peer_cache.insert(u.raw.id(), dialog.peer.clone());
                log::debug!("[SCAN] Cached User Peer: {}", u.raw.id());
            },
            peer => {
                log::debug!("[SCAN] Skipped Peer: {:?}", peer);
            }
        }
    }
    
    log::info!("Scan complete. Found {} folders. Peer cache size: {}.", folders.len(), peer_cache.len());
    Ok(folders)
}
