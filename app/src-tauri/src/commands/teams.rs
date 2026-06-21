use crate::commands::utils::{map_error, resolve_peer, resolve_input_peer};
use crate::TelegramState;
use grammers_client::types::Peer;
use grammers_client::InputMessage;
use grammers_tl_types as tl;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::State;
use tauri::Manager;
use chrono::Utc;

#[derive(Clone, serde::Serialize)]
pub struct TeamInfo {
    pub id: i64,
    pub name: String,
    pub username: Option<String>,
    pub member_count: i32,
    pub is_channel: bool,
    pub is_supergroup: bool,
    pub top_members: Vec<TeamMember>,
    pub unread_count: i32,
    pub photo_url: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub struct TeamMember {
    #[serde(serialize_with = "serialize_i64_to_string")]
    pub user_id: i64,
    pub first_name: String,
    pub last_name: Option<String>,
    pub username: Option<String>,
    pub phone: Option<String>,
    pub is_admin: bool,
    pub is_owner: bool,
    pub role: String,
    pub photo_url: Option<String>,
    pub invite_eligible: bool,
    pub invite_restriction: Option<String>,
    #[serde(serialize_with = "serialize_opt_i64_to_string")]
    pub access_hash: Option<i64>,
    pub joined_date: Option<String>,
    pub online_status: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub struct DirectChatInfo {
    #[serde(serialize_with = "serialize_i64_to_string")]
    pub user_id: i64,
    pub first_name: String,
    pub last_name: Option<String>,
    pub username: Option<String>,
    pub phone: Option<String>,
    pub photo_url: Option<String>,
    pub unread_count: i32,
    pub invite_eligible: bool,
    pub invite_restriction: Option<String>,
    #[serde(serialize_with = "serialize_opt_i64_to_string")]
    pub access_hash: Option<i64>,
}

#[derive(Clone, serde::Serialize)]
pub struct CurrentTelegramUser {
    #[serde(serialize_with = "serialize_i64_to_string")]
    pub user_id: i64,
    pub first_name: String,
    pub last_name: Option<String>,
    pub username: Option<String>,
    pub photo_url: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub struct TeamFullInfo {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub creation_date: String,
    pub member_count: i32,
    pub invite_link: Option<String>,
    pub is_channel: bool,
    pub is_supergroup: bool,
    pub can_edit_info: bool,
}

fn peer_to_input_peer(peer: &Peer) -> Result<tl::enums::InputPeer, String> {
    match peer {
        Peer::Channel(c) => Ok(tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
            channel_id: c.raw.id,
            access_hash: c.raw.access_hash.ok_or("No access hash for channel")?,
        })),
        Peer::User(u) => {
            let access_hash = match &u.raw {
                tl::enums::User::User(raw) => raw.access_hash.unwrap_or(0),
                _ => 0,
            };
            Ok(tl::enums::InputPeer::User(tl::types::InputPeerUser {
                user_id: u.raw.id(),
                access_hash,
            }))
        }
        Peer::Group(g) => match &g.raw {
            tl::enums::Chat::Chat(chat) => {
                Ok(tl::enums::InputPeer::Chat(tl::types::InputPeerChat {
                    chat_id: chat.id,
                }))
            }
            tl::enums::Chat::Channel(channel) => {
                Ok(tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
                    channel_id: channel.id,
                    access_hash: channel.access_hash.ok_or("No access hash for group")?,
                }))
            }
            _ => Err("Unsupported group type".to_string()),
        },
    }
}

fn peer_display_name(peer: &Peer) -> String {
    match peer {
        Peer::Channel(c) => c.raw.title.clone(),
        Peer::Group(g) => match &g.raw {
            tl::enums::Chat::Chat(chat) => chat.title.clone(),
            tl::enums::Chat::Channel(channel) => channel.title.clone(),
            _ => "team".to_string(),
        },
        Peer::User(u) => resolve_user_display_name(u),
    }
}

/// Resolve a Telegram User to a display name using the hierarchy:
/// displayName → username → fullName → fallback identifier.
/// Never exposes internal IDs, phone numbers, or account IDs
/// unless no other user information exists.
fn resolve_user_display_name(user: &grammers_client::types::User) -> String {
    if let Some(name) = user.first_name() {
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    if let Some(username) = user.username() {
        let trimmed = username.trim();
        if !trimmed.is_empty() {
            return format!("@{}", trimmed);
        }
    }
    let full = user.full_name();
    let trimmed = full.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    format!("User {}", user.raw.id())
}

fn serialize_i64_to_string<S>(val: &i64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&val.to_string())
}

fn serialize_opt_i64_to_string<S>(val: &Option<i64>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    match val {
        Some(v) => serializer.serialize_str(&v.to_string()),
        None => serializer.serialize_none(),
    }
}

#[derive(Clone, serde::Serialize)]
pub struct TeamsResponse {
    pub teams: Vec<TeamInfo>,
    pub next_before_date: Option<i64>,
    pub has_more: bool,
}

#[derive(Clone, serde::Serialize)]
pub struct DirectChatsResponse {
    pub chats: Vec<DirectChatInfo>,
    pub next_before_date: Option<i64>,
    pub has_more: bool,
}

#[derive(Clone, serde::Serialize)]
pub struct MessagesResponse {
    pub messages: Vec<ChatMessage>,
    pub next_before_message_id: Option<i32>,
    pub has_more: bool,
}

#[derive(Clone, serde::Serialize)]
pub struct ChatMessage {
    pub id: i32,
    pub sender_id: i64,
    pub sender_name: String,
    pub sender_photo_url: Option<String>,
    pub text: String,
    pub date: String,
    pub has_media: bool,
    pub media_type: String,
    pub media_name: String,
    pub media_size: i64,
    pub mime_type: String,
    pub outgoing: bool,
    pub pinned: bool,
    pub edited: bool,
    pub audio_duration: Option<f64>,
    pub message_type: String,
    pub action_params: Option<String>,
}

fn user_has_photo(user: &tl::enums::User) -> bool {
    let has_photo = match user {
        tl::enums::User::User(u) => match &u.photo {
            Some(tl::enums::UserProfilePhoto::Photo(_)) => true,
            _ => false,
        },
        _ => false,
    };
    if let tl::enums::User::User(u) = user {
        log::debug!(
            "[AUTH] User {} (ID: {}) has photo: {}",
            u.first_name.clone().unwrap_or_default(),
            u.id,
            has_photo
        );
    }
    has_photo
}

fn chat_has_photo(chat: &tl::enums::Chat) -> bool {
    match chat {
        tl::enums::Chat::Chat(c) => match &c.photo {
            tl::enums::ChatPhoto::Photo(_) => true,
            _ => false,
        },
        tl::enums::Chat::Channel(c) => match &c.photo {
            tl::enums::ChatPhoto::Photo(_) => true,
            _ => false,
        },
        _ => false,
    }
}

/// Get the role of a user in a group by iterating participants.
/// Returns "owner", "admin", "member", or an error.
async fn get_user_role_in_group(
    client: &grammers_client::Client,
    team_id: i64,
    user_id: i64,
    peer_cache: &Arc<tokio::sync::RwLock<HashMap<i64, Peer>>>,
) -> Result<String, String> {
    let peer = resolve_peer(client, Some(team_id), peer_cache).await?;
    let mut participants = client.iter_participants(&peer);
    while let Some(p) = participants.next().await.map_err(|e| e.to_string())? {
        if p.user.raw.id() == user_id {
            return Ok(match p.role {
                grammers_client::types::Role::Creator(_) => "owner".to_string(),
                grammers_client::types::Role::Admin(_) => "admin".to_string(),
                _ => "member".to_string(),
            });
        }
    }
    Err("User not found in group".to_string())
}

/// Resolve a user ID to a display name using the hierarchy:
/// displayName → username → fullName → fallback identifier.
/// Checks the peer cache first, then tries users.getUsers API,
/// and finally falls back to a dialog scan.
async fn get_user_display_name(
    client: &grammers_client::Client,
    user_id: i64,
    peer_cache: &Arc<tokio::sync::RwLock<HashMap<i64, Peer>>>,
) -> String {
    // Fast path: check peer cache
    {
        let cache = peer_cache.read().await;
        if let Some(peer) = cache.get(&user_id) {
            if let Peer::User(u) = peer {
                return resolve_user_display_name(u);
            }
        }
    }

    // Try users.getUsers API (works for users in mutual groups)
    let input_users = vec![tl::enums::InputUser::User(tl::types::InputUser {
        user_id,
        access_hash: 0,
    })];
    if let Ok(users) = client
        .invoke(&tl::functions::users::GetUsers { id: input_users })
        .await
    {
        if let Some(tl::enums::User::User(u)) = users.first() {
            let name = match u.first_name.as_deref() {
                Some(f) if !f.is_empty() => f.to_string(),
                _ => match u.username.as_deref() {
                    Some(un) if !un.is_empty() => format!("@{}", un),
                    _ => {
                        let first = u.first_name.as_deref().unwrap_or("");
                        let last = u.last_name.as_deref().unwrap_or("");
                        let full = format!("{} {}", first, last).trim().to_string();
                        if !full.is_empty() { full } else { format!("User {}", user_id) }
                    }
                },
            };
            return name;
        }
    }

    // Fallback: resolve_peer with cache (scans dialogs)
    if let Ok(peer) = resolve_peer(client, Some(user_id), peer_cache).await {
        if let Peer::User(u) = &peer {
            return resolve_user_display_name(u);
        }
        return peer_display_name(&peer);
    }

    format!("User {}", user_id)
}

/// Send a system message (action-like text) to the group.
async fn send_system_message(
    client: &grammers_client::Client,
    team_id: i64,
    peer_cache: &Arc<tokio::sync::RwLock<HashMap<i64, Peer>>>,
    text: String,
) -> Result<(), String> {
    let peer = resolve_peer(client, Some(team_id), peer_cache).await?;
    client
        .send_message(&peer, InputMessage::new().text(text))
        .await
        .map_err(|e| format!("Failed to send system message: {}", e))?;
    Ok(())
}

/// Check if the current user is the owner of a group. Returns Ok(()) if true.
async fn require_owner(
    client: &grammers_client::Client,
    team_id: i64,
    peer_cache: &Arc<tokio::sync::RwLock<HashMap<i64, Peer>>>,
) -> Result<(), String> {
    let me = client.get_me().await.map_err(|e| e.to_string())?;
    let my_id = me.raw.id();
    let role = get_user_role_in_group(client, team_id, my_id, peer_cache).await?;
    if role != "owner" {
        return Err("Only the group owner can perform this action".to_string());
    }
    Ok(())
}

/// Check if the current user is owner or admin. Returns Ok(()) if true.
async fn require_admin_or_owner(
    client: &grammers_client::Client,
    team_id: i64,
    peer_cache: &Arc<tokio::sync::RwLock<HashMap<i64, Peer>>>,
) -> Result<(), String> {
    let me = client.get_me().await.map_err(|e| e.to_string())?;
    let my_id = me.raw.id();
    let role = get_user_role_in_group(client, team_id, my_id, peer_cache).await?;
    if role != "owner" && role != "admin" {
        return Err("Only group admins or the owner can perform this action".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn cmd_get_current_user(
    state: State<'_, TelegramState>,
) -> Result<Option<CurrentTelegramUser>, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(None);
    }
    let client = client_opt.unwrap();
    let user = client.get_me().await.map_err(map_error)?;

    Ok(Some(CurrentTelegramUser {
        user_id: user.raw.id(),
        first_name: user.first_name().unwrap_or("You").to_string(),
        last_name: user.last_name().map(|s| s.to_string()),
        username: user.username().map(|s| s.to_string()),
        photo_url: if user_has_photo(&user.raw) {
            Some("present".to_string())
        } else {
            None
        },
    }))
}

#[tauri::command]
pub async fn cmd_get_teams(
    state: State<'_, TelegramState>,
    _before_date: Option<i64>,
    selective_ids: Option<Vec<i64>>,
) -> Result<TeamsResponse, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(TeamsResponse {
            teams: Vec::new(),
            next_before_date: None,
            has_more: false,
        });
    }
    let client = client_opt.unwrap();
    let mut teams = Vec::new();

    if let Some(ids) = &selective_ids {
        log::info!("Fetching {} selected Telegram groups", ids.len());
        // Use a more efficient way if we have specific IDs
        // For now, we still iterate dialogs but stop when we found them all
        // to stay within the high-level API safely.
        let mut dialogs = client.iter_dialogs();
        let mut remaining_ids: HashSet<i64> = ids.iter().cloned().collect();

        while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
            if remaining_ids.is_empty() {
                break;
            }

            let id = match &dialog.peer {
                Peer::Channel(c) => c.raw.id,
                Peer::Group(g) => g.raw.id(),
                _ => continue,
            };

            if remaining_ids.remove(&id) {
                match &dialog.peer {
                    Peer::Channel(c) => {
                        state.peer_cache.write().await.insert(id, dialog.peer.clone());
                        teams.push(TeamInfo {
                            id,
                            name: c.raw.title.clone(),
                            username: c.raw.username.clone(),
                            member_count: c.raw.participants_count.unwrap_or(0),
                            is_channel: false,
                            is_supergroup: c.raw.megagroup,
                            top_members: Vec::new(),
                            unread_count: get_dialog_unread_count(&dialog.raw),
                            photo_url: if chat_has_photo(&tl::enums::Chat::Channel(c.raw.clone())) {
                                Some("present".to_string())
                            } else {
                                None
                            },
                        });
                    }
                    Peer::Group(g) => {
                        let (title, username, member_count, is_supergroup) = match &g.raw {
                            tl::enums::Chat::Chat(c) => (c.title.clone(), None, c.participants_count, false),
                            tl::enums::Chat::Channel(c) => (c.title.clone(), c.username.clone(), c.participants_count.unwrap_or(0), c.megagroup),
                            _ => ("Unknown Group".to_string(), None, 0, false),
                        };
                        state.peer_cache.write().await.insert(id, dialog.peer.clone());
                        teams.push(TeamInfo {
                            id,
                            name: title,
                            username,
                            member_count,
                            is_channel: false,
                            is_supergroup,
                            top_members: Vec::new(),
                            unread_count: get_dialog_unread_count(&dialog.raw),
                            photo_url: if chat_has_photo(&g.raw) {
                                Some("present".to_string())
                            } else {
                                None
                            },
                        });
                    }
                    _ => {}
                }
            }
        }
    } else {
        log::info!("Fetching all Telegram group dialogs for Teams");
        let mut dialogs = client.iter_dialogs();

        while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
            match &dialog.peer {
                Peer::Channel(c) => {
                    if c.raw.broadcast {
                        continue;
                    }
                    let name = c.raw.title.clone();
                    let username = c.raw.username.clone();
                    let id = c.raw.id;
                    state
                        .peer_cache
                        .write()
                        .await
                        .insert(id, dialog.peer.clone());

                    teams.push(TeamInfo {
                        id,
                        name,
                        username,
                        member_count: c.raw.participants_count.unwrap_or(0),
                        is_channel: false,
                        is_supergroup: c.raw.megagroup,
                        top_members: Vec::new(),
                        unread_count: get_dialog_unread_count(&dialog.raw),
                        photo_url: if chat_has_photo(&tl::enums::Chat::Channel(c.raw.clone())) {
                            Some("present".to_string())
                        } else {
                            None
                        },
                    });
                }
                Peer::Group(g) => {
                    let (title, username, member_count, is_supergroup) = match &g.raw {
                        grammers_tl_types::enums::Chat::Chat(c) => (c.title.clone(), None, c.participants_count, false),
                        grammers_tl_types::enums::Chat::Channel(c) => (c.title.clone(), c.username.clone(), c.participants_count.unwrap_or(0), c.megagroup),
                        _ => ("Unknown Group".to_string(), None, 0, false),
                    };
                    let id = g.raw.id();
                    state
                        .peer_cache
                        .write()
                        .await
                        .insert(id, dialog.peer.clone());

                    teams.push(TeamInfo {
                        id,
                        name: title,
                        username,
                        member_count,
                        is_channel: false,
                        is_supergroup,
                        top_members: Vec::new(),
                        unread_count: get_dialog_unread_count(&dialog.raw),
                        photo_url: if chat_has_photo(&g.raw) {
                            Some("present".to_string())
                        } else {
                            None
                        },
                    });
                }
                _ => {}
            }
        }
    }

    log::info!("Found {} Telegram groups", teams.len());
    Ok(TeamsResponse {
        teams,
        next_before_date: None,
        has_more: false,
    })
}

#[tauri::command]
pub async fn cmd_get_direct_chats(
    state: State<'_, TelegramState>,
    _before_date: Option<i64>,
    selective_ids: Option<Vec<i64>>,
) -> Result<DirectChatsResponse, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(DirectChatsResponse {
            chats: Vec::new(),
            next_before_date: None,
            has_more: false,
        });
    }
    let client = client_opt.unwrap();
    let current_user_id = client.get_me().await.map_err(map_error)?.raw.id();
    let mut direct_by_id: HashMap<i64, DirectChatInfo> = HashMap::new();
    let mut dialog_order: Vec<i64> = Vec::new();

    if let Some(ids) = &selective_ids {
        log::info!("Fetching {} selected direct Telegram dialogs", ids.len());
        let mut dialogs = client.iter_dialogs();
        let mut remaining_ids: HashSet<i64> = ids.iter().cloned().collect();

        while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
            if remaining_ids.is_empty() {
                break;
            }

            if let Peer::User(user) = &dialog.peer {
                let user_id = user.raw.id();
                if remaining_ids.remove(&user_id) {
                    if user_id == current_user_id {
                        continue;
                    }

                    let (phone, access_hash) = match &user.raw {
                        tl::enums::User::User(raw) => (raw.phone.clone(), raw.access_hash),
                        _ => (None, None),
                    };

                    state
                        .peer_cache
                        .write()
                        .await
                        .insert(user_id, dialog.peer.clone());

                    direct_by_id.insert(user_id, DirectChatInfo {
                        user_id,
                        first_name: user.first_name().unwrap_or("Unknown").to_string(),
                        last_name: user.last_name().map(|s| s.to_string()),
                        username: user.username().map(|s| s.to_string()),
                        phone,
                        photo_url: if user_has_photo(&user.raw) { Some("present".to_string()) } else { None },
                        unread_count: get_dialog_unread_count(&dialog.raw),
                        invite_eligible: user.mutual_contact(),
                        invite_restriction: if user.mutual_contact() {
                            None
                        } else {
                            Some("Telegram only allows direct invites for mutual contacts. Share an invite link with this person instead.".to_string())
                        },
                        access_hash,
                    });
                    dialog_order.push(user_id);
                }
            }
        }
    } else {
        log::info!("Fetching all direct Telegram dialogs and contacts");
        let mut dialogs = client.iter_dialogs();

        while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
            if let Peer::User(user) = &dialog.peer {
                let user_id = user.raw.id();
                if user_id == current_user_id {
                    continue;
                }

                let (phone, access_hash) = match &user.raw {
                    tl::enums::User::User(raw) => (raw.phone.clone(), raw.access_hash),
                    _ => (None, None),
                };

                state
                    .peer_cache
                    .write()
                    .await
                    .insert(user_id, dialog.peer.clone());

                direct_by_id.insert(user_id, DirectChatInfo {
                    user_id,
                    first_name: user.first_name().unwrap_or("Unknown").to_string(),
                    last_name: user.last_name().map(|s| s.to_string()),
                    username: user.username().map(|s| s.to_string()),
                    phone,
                    photo_url: if user_has_photo(&user.raw) { Some("present".to_string()) } else { None },
                    unread_count: get_dialog_unread_count(&dialog.raw),
                    invite_eligible: user.mutual_contact(),
                    invite_restriction: if user.mutual_contact() {
                        None
                    } else {
                        Some("Telegram only allows direct invites for mutual contacts. Share an invite link with this person instead.".to_string())
                    },
                    access_hash,
                });
                dialog_order.push(user_id);
            }
        }

        let contact_result = client
            .invoke(&tl::functions::contacts::GetContacts { hash: 0 })
            .await
            .map_err(map_error)?;

        match contact_result {
            tl::enums::contacts::Contacts::Contacts(c) => {
                log::info!(
                    "Merging {} Telegram contacts into direct chats",
                    c.users.len()
                );
                for user in c.users {
                    if let tl::enums::User::User(u) = user {
                        if u.id == current_user_id {
                            continue;
                        }

                        let u_raw = tl::enums::User::User(u.clone());
                        state.peer_cache.write().await.insert(
                            u.id,
                            Peer::User(grammers_client::types::User::from_raw(u_raw.clone())),
                        );

                        direct_by_id.entry(u.id).or_insert_with(|| DirectChatInfo {
                            user_id: u.id,
                            first_name: u.first_name.clone().unwrap_or_else(|| "Unknown".to_string()),
                            last_name: u.last_name.clone(),
                            username: u.username.clone(),
                            phone: u.phone.clone(),
                            photo_url: if user_has_photo(&u_raw) { Some("present".to_string()) } else { None },
                            unread_count: 0,
                            invite_eligible: u.mutual_contact,
                            invite_restriction: if u.mutual_contact {
                                None
                            } else {
                                Some("Telegram only allows direct invites for mutual contacts. Share an invite link with this person instead.".to_string())
                            },
                            access_hash: u.access_hash,
                        });
                    }
                }
            }
            tl::enums::contacts::Contacts::NotModified => {
                log::info!("Telegram contacts not modified while loading direct chats");
            }
        }
    }

    let mut ordered = Vec::new();
    let mut seen = HashSet::new();
    for user_id in dialog_order {
        if seen.insert(user_id) {
            if let Some(chat) = direct_by_id.remove(&user_id) {
                ordered.push(chat);
            }
        }
    }

    let mut contact_only: Vec<_> = direct_by_id.into_values().collect();
    contact_only.sort_by(|a, b| {
        let a_name = format!(
            "{} {} {}",
            a.first_name,
            a.last_name.clone().unwrap_or_default(),
            a.username.clone().unwrap_or_default()
        )
        .to_lowercase();
        let b_name = format!(
            "{} {} {}",
            b.first_name,
            b.last_name.clone().unwrap_or_default(),
            b.username.clone().unwrap_or_default()
        )
        .to_lowercase();
        a_name.cmp(&b_name)
    });
    ordered.extend(contact_only);

    log::info!("Found {} direct Telegram chats and contacts", ordered.len());
    Ok(DirectChatsResponse {
        chats: ordered,
        next_before_date: None,
        has_more: false,
    })
}

fn get_dialog_unread_count(dialog: &tl::enums::Dialog) -> i32 {
    match dialog {
        tl::enums::Dialog::Dialog(d) => d.unread_count,
        tl::enums::Dialog::Folder(_) => 0,
    }
}

#[tauri::command]
pub async fn cmd_check_admin(
    team_id: i64,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    // Print "yes" to server terminal if logged in
    println!("yes");

    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;
    let me = client.get_me().await.map_err(map_error)?;

    let is_admin = match &peer {
        Peer::Channel(_) | Peer::Group(_) => {
            let mut participants = client.iter_participants(&peer);
            let mut found_me_as_admin = false;
            while let Some(p) = participants.next().await.map_err(map_error)? {
                if p.user.raw.id() == me.raw.id() {
                    found_me_as_admin = match p.role {
                        grammers_client::types::Role::Creator(_) | grammers_client::types::Role::Admin(_) => true,
                        _ => false,
                    };
                    break;
                }
            }
            found_me_as_admin
        }
        _ => false,
    };

    if is_admin {
        println!("yes");
    } else {
        println!("no");
    }

    Ok(is_admin)
}

#[tauri::command]
pub async fn cmd_get_team_members(
    team_id: i64,
    state: State<'_, TelegramState>,
) -> Result<Vec<TeamMember>, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;

    let mut members = Vec::new();
    let mut participants = client.iter_participants(&peer);

    loop {
        match participants.next().await {
            Ok(Some(p)) => {
                let joined_date = match &p.role {
                    grammers_client::types::Role::User(n) => Some(n.date().format("%Y-%m-%d").to_string()),
                    grammers_client::types::Role::Admin(a) => Some(a.date().format("%Y-%m-%d").to_string()),
                    grammers_client::types::Role::Banned(b) => Some(b.date().format("%Y-%m-%d").to_string()),
                    _ => None,
                };
                let online_status = match &p.user.raw {
                    tl::enums::User::User(ref u) => match &u.status {
                        Some(tl::enums::UserStatus::Online(_)) => Some("online".to_string()),
                        Some(tl::enums::UserStatus::Offline(off)) => {
                            let last = chrono::DateTime::from_timestamp(off.was_online as i64, 0)
                                .map(|d| format!("last seen {}", d.format("%Y-%m-%d %H:%M")))
                                .unwrap_or_else(|| "offline".to_string());
                            Some(last)
                        }
                        Some(tl::enums::UserStatus::Recently(_)) => Some("last seen recently".to_string()),
                        Some(tl::enums::UserStatus::LastWeek(_)) => Some("last seen this week".to_string()),
                        Some(tl::enums::UserStatus::LastMonth(_)) => Some("last seen this month".to_string()),
                        _ => Some("offline".to_string()),
                    },
                    _ => None,
                };
                members.push(TeamMember {
                    user_id: p.user.raw.id(),
                    first_name: p.user.first_name().unwrap_or("Unknown").to_string(),
                    last_name: p.user.last_name().map(|s| s.to_string()),
                    username: p.user.username().map(|s| s.to_string()),
                    phone: p.user.phone().map(|s| s.to_string()),
                    is_admin: match p.role {
                        grammers_client::types::Role::Admin(_) => true,
                        grammers_client::types::Role::Creator(_) => true,
                        _ => false,
                    },
                    is_owner: match p.role {
                        grammers_client::types::Role::Creator(_) => true,
                        _ => false,
                    },
                    role: match p.role {
                        grammers_client::types::Role::Creator(_) => "owner".to_string(),
                        grammers_client::types::Role::Admin(_) => "admin".to_string(),
                        _ => "member".to_string(),
                    },
                    access_hash: match p.user.raw {
                        tl::enums::User::User(ref u) => u.access_hash,
                        _ => None,
                    },
                    photo_url: if user_has_photo(&p.user.raw) {
                        Some("present".to_string())
                    } else {
                        None
                    },
                    invite_eligible: true,
                    invite_restriction: None,
                    joined_date,
                    online_status,
                });
            }
            Ok(None) => break,
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("CHAT_ADMIN_REQUIRED") {
                    log::warn!("Could not fetch member list for peer: {}", err_str);
                    return Ok(Vec::new());
                }
                return Err(map_error(e));
            }
        }
        if members.len() >= 100 { break; }
    }

    Ok(members)
}

#[tauri::command]
pub async fn cmd_search_users(
    query: String,
    state: State<'_, TelegramState>,
) -> Result<Vec<TeamMember>, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();

    log::info!("Searching users with query: {}", query);

    let result = client
        .invoke(&tl::functions::contacts::Search {
            q: query.clone(),
            limit: 20,
        })
        .await
        .map_err(map_error)?;

    let mut results = Vec::new();

    let f = match result {
        tl::enums::contacts::Found::Found(f) => f,
    };

    for user in f.users {
        if let tl::enums::User::User(u) = user {
            let first_name = u
                .first_name
                .clone()
                .unwrap_or_else(|| "Unknown".to_string());
            let last_name = u.last_name.clone();
            let username = u.username.clone();
            let phone = u.phone.clone();
            let u_raw = tl::enums::User::User(u.clone());

            results.push(TeamMember {
                user_id: u.id,
                first_name,
                last_name,
                username,
                phone,
                is_admin: false,
                is_owner: false,
                role: "member".to_string(),
                photo_url: if user_has_photo(&u_raw) { Some("present".to_string()) } else { None },
                invite_eligible: u.mutual_contact,
                invite_restriction: if u.mutual_contact {
                    None
                } else {
                    Some("Telegram only allows direct invites for mutual contacts. Share an invite link with this person instead.".to_string())
                },
                access_hash: u.access_hash,
                joined_date: None,
                online_status: None,
            });
            state.peer_cache.write().await.insert(
                u.id,
                Peer::User(grammers_client::types::User::from_raw(u_raw)),
            );
        }
    }

    log::info!("Found {} users matching query", results.len());
    Ok(results)
}

#[tauri::command]
pub async fn cmd_debug_subscriber_flow(
    _team_id: i64,
    query: String,
    state: State<'_, TelegramState>,
) -> Result<String, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Err("Client not connected".to_string());
    }
    let client = client_opt.unwrap();

    log::info!("DEBUG: Searching for '{}'", query);
    let result = client
        .invoke(&tl::functions::contacts::Search {
            q: query.clone(),
            limit: 10,
        })
        .await
        .map_err(map_error)?;

    let mut debug_info = format!("Search results for '{}':\n", query);

    let tl::enums::contacts::Found::Found(f) = result;
    for user in f.users {
        if let tl::enums::User::User(u) = user {
            let name = format!(
                "{} {}",
                u.first_name.clone().unwrap_or_default(),
                u.last_name.clone().unwrap_or_default()
            );
            debug_info.push_str(&format!(
                "- User: {} (ID: {}, Hash: {})\n",
                name,
                u.id,
                u.access_hash.unwrap_or(0)
            ));
            debug_info.push_str(&format!("  Caching peer for user {}...\n", u.id));
            state.peer_cache.write().await.insert(
                u.id,
                Peer::User(grammers_client::types::User::from_raw(
                    tl::enums::User::User(u.clone()),
                )),
            );
        }
    }

    Ok(debug_info)
}

#[tauri::command]
pub async fn cmd_get_contacts(state: State<'_, TelegramState>) -> Result<Vec<TeamMember>, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();

    log::info!("Fetching Telegram contacts");

    let result = client
        .invoke(&tl::functions::contacts::GetContacts { hash: 0 })
        .await
        .map_err(map_error)?;

    let mut results = Vec::new();

    match result {
        tl::enums::contacts::Contacts::Contacts(c) => {
            log::info!(
                "Received {} contacts and {} users from Telegram",
                c.contacts.len(),
                c.users.len()
            );
            for user in c.users {
                if let tl::enums::User::User(u) = user {
                    let first_name = u
                        .first_name
                        .clone()
                        .unwrap_or_else(|| "Unknown".to_string());
                    let last_name = u.last_name.clone();
                    let username = u.username.clone();
                    let phone = u.phone.clone();
                    let u_raw = tl::enums::User::User(u.clone());

                    results.push(TeamMember {
                        user_id: u.id,
                        first_name,
                        last_name,
                        username,
                        phone,
                        is_admin: false,
                        is_owner: false,
                        role: "member".to_string(),
                        photo_url: if user_has_photo(&u_raw) { Some("present".to_string()) } else { None },
                        invite_eligible: u.mutual_contact,
                        invite_restriction: if u.mutual_contact {
                            None
                        } else {
                            Some("Telegram only allows direct invites for mutual contacts. Share an invite link with this person instead.".to_string())
                        },
                        access_hash: u.access_hash,
                        joined_date: None,
                        online_status: None,
                    });
                }
            }
        }
        _ => {
            log::info!("Contacts not modified");
        }
    }

    log::info!("Found {} contacts", results.len());
    Ok(results)
}

#[tauri::command]
pub async fn cmd_add_team_member(
    team_id: i64,
    user_id_str: String,
    access_hash_str: Option<String>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    let user_id = user_id_str
        .parse::<i64>()
        .map_err(|_| "Invalid user ID format")?;
    let access_hash = access_hash_str
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    log::info!(
        "Adding user {} (hash: {}) to team {}",
        user_id,
        access_hash,
        team_id
    );

    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;
    let input_user = tl::enums::InputUser::User(tl::types::InputUser {
        user_id,
        access_hash,
    });

    match &peer {
        Peer::Channel(c) => {
            let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                channel_id: c.raw.id,
                access_hash: c.raw.access_hash.ok_or("No access hash")?,
            });

            client
                .invoke(&tl::functions::channels::InviteToChannel {
                    channel: input_channel,
                    users: vec![input_user],
                })
                .await
                .map_err(|e| format!("Failed to add member: {}", e))?;
        }
        Peer::Group(g) => {
            match &g.raw {
                tl::enums::Chat::Chat(chat) => {
                    client
                        .invoke(&tl::functions::messages::AddChatUser {
                            chat_id: chat.id,
                            user_id: input_user,
                            fwd_limit: 100,
                        })
                        .await
                        .map_err(|e| format!("Failed to add member: {}", e))?;
                }
                tl::enums::Chat::Channel(channel) => {
                    let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                        channel_id: channel.id,
                        access_hash: channel.access_hash.ok_or("No access hash for supergroup")?,
                    });

                    client
                        .invoke(&tl::functions::channels::InviteToChannel {
                            channel: input_channel,
                            users: vec![input_user],
                        })
                        .await
                        .map_err(|e| format!("Failed to add member to supergroup: {}", e))?;
                }
                _ => return Err("Unsupported group type for adding member".to_string()),
            }
        }
        _ => return Err("Invalid peer type".to_string()),
    }

    Ok(true)
}

#[tauri::command]
pub async fn cmd_get_team_full_info(
    team_id: i64,
    state: State<'_, TelegramState>,
) -> Result<TeamFullInfo, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Err("Not connected".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;

    match &peer {
        Peer::Channel(c) => {
            let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                channel_id: c.raw.id,
                access_hash: c.raw.access_hash.ok_or("No access hash")?,
            });

            let full = client
                .invoke(&tl::functions::channels::GetFullChannel {
                    channel: input_channel,
                })
                .await
                .map_err(|e| format!("Failed to get full channel info: {}", e))?;

            let tl::enums::messages::ChatFull::Full(f) = full;
            let can_edit = c.raw.creator || c.raw.admin_rights.as_ref().map_or(false, |r| { let tl::enums::ChatAdminRights::Rights(a) = r; a.change_info });
            let (desc, p_count, exported) = match f.full_chat {
                tl::enums::ChatFull::ChannelFull(cf) => {
                    let inv = match cf.exported_invite {
                        Some(tl::enums::ExportedChatInvite::ChatInviteExported(inv)) => Some(inv.link),
                        _ => None,
                    };
                    (cf.about, cf.participants_count.unwrap_or(0), inv)
                }
                tl::enums::ChatFull::Full(cf) => {
                    let inv = match cf.exported_invite {
                        Some(tl::enums::ExportedChatInvite::ChatInviteExported(inv)) => Some(inv.link),
                        _ => None,
                    };
                    let count = match cf.participants {
                        tl::enums::ChatParticipants::Participants(parts) => parts.participants.len() as i32,
                        _ => 0,
                    };
                    (cf.about, count, inv)
                }
            };
            let date_str = chrono::DateTime::from_timestamp(c.raw.date as i64, 0)
                .map(|d| d.format("%Y-%m-%d").to_string())
                .unwrap_or_else(|| "Unknown".to_string());

            Ok(TeamFullInfo {
                id: team_id,
                name: c.raw.title.clone(),
                description: desc,
                creation_date: date_str,
                member_count: p_count,
                invite_link: exported,
                is_channel: true,
                is_supergroup: c.raw.megagroup,
                can_edit_info: can_edit,
            })
        }
        Peer::Group(g) => {
            match &g.raw {
                tl::enums::Chat::Channel(chan) => {
                    let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                        channel_id: chan.id,
                        access_hash: chan.access_hash.ok_or("No access hash")?,
                    });
                    let full = client
                        .invoke(&tl::functions::channels::GetFullChannel {
                            channel: input_channel,
                        })
                        .await
                        .map_err(|e| format!("Failed to get full channel info: {}", e))?;
                    let tl::enums::messages::ChatFull::Full(f) = full;
                    let can_edit = chan.creator || chan.admin_rights.as_ref().map_or(false, |r| { let tl::enums::ChatAdminRights::Rights(a) = r; a.change_info });
                    let (desc, p_count, exported) = match f.full_chat {
                        tl::enums::ChatFull::ChannelFull(cf) => {
                            let inv = match cf.exported_invite {
                                Some(tl::enums::ExportedChatInvite::ChatInviteExported(inv)) => Some(inv.link),
                                _ => None,
                            };
                            (cf.about, cf.participants_count.unwrap_or(0), inv)
                        }
                        _ => ("".to_string(), 0, None),
                    };
                    let date_str = chrono::DateTime::from_timestamp(chan.date as i64, 0)
                        .map(|d| d.format("%Y-%m-%d").to_string())
                        .unwrap_or_else(|| "Unknown".to_string());
                    Ok(TeamFullInfo {
                        id: team_id,
                        name: chan.title.clone(),
                        description: desc,
                        creation_date: date_str,
                        member_count: p_count,
                        invite_link: exported,
                        is_channel: false,
                        is_supergroup: chan.megagroup,
                        can_edit_info: can_edit,
                    })
                }
                tl::enums::Chat::Chat(chat) => {
                    let full = client
                        .invoke(&tl::functions::messages::GetFullChat {
                            chat_id: chat.id,
                        })
                        .await
                        .map_err(|e| format!("Failed to get full chat info: {}", e))?;
                    let tl::enums::messages::ChatFull::Full(f) = full;
                    let can_edit = chat.creator || chat.admin_rights.as_ref().map_or(false, |r| { let tl::enums::ChatAdminRights::Rights(a) = r; a.change_info });
                    let (desc, p_count, exported) = match f.full_chat {
                        tl::enums::ChatFull::Full(cf) => {
                            let inv = match cf.exported_invite {
                                Some(tl::enums::ExportedChatInvite::ChatInviteExported(inv)) => Some(inv.link),
                                _ => None,
                            };
                            let count = match cf.participants {
                                tl::enums::ChatParticipants::Participants(parts) => parts.participants.len() as i32,
                                _ => 0,
                            };
                            (cf.about, count, inv)
                        }
                        _ => ("".to_string(), 0, None),
                    };
                    let date_str = chrono::DateTime::from_timestamp(chat.date as i64, 0)
                        .map(|d| d.format("%Y-%m-%d").to_string())
                        .unwrap_or_else(|| "Unknown".to_string());
                    Ok(TeamFullInfo {
                        id: team_id,
                        name: chat.title.clone(),
                        description: desc,
                        creation_date: date_str,
                        member_count: p_count,
                        invite_link: exported,
                        is_channel: false,
                        is_supergroup: false,
                        can_edit_info: can_edit,
                    })
                }
                _ => Err("Unsupported group type".to_string()),
            }
        }
        _ => Err("Invalid peer type".to_string()),
    }
}

#[tauri::command]
pub async fn cmd_get_team_invite_link(
    team_id: i64,
    state: State<'_, TelegramState>,
) -> Result<String, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Err("Not connected".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;
    let input_peer = peer_to_input_peer(&peer)?;

    let exported = client
        .invoke(&tl::functions::messages::ExportChatInvite {
            legacy_revoke_permanent: false,
            request_needed: false,
            peer: input_peer,
            expire_date: None,
            usage_limit: None,
            title: Some("TgGuild invite".to_string()),
            subscription_pricing: None,
        })
        .await
        .map_err(|e| format!("Failed to create invite link: {}", e))?;

    match exported {
        tl::enums::ExportedChatInvite::ChatInviteExported(invite) => {
            let hash = extract_invite_hash(&invite.link)
                .ok_or_else(|| format!("Unexpected invite link format: {}", invite.link))?;
            Ok(format!("tgguild://join/{}", hash))
        }
        tl::enums::ExportedChatInvite::ChatInvitePublicJoinRequests => {
            Err("This group is set to require join approval. Invite links are not available.".to_string())
        }
    }
}

#[tauri::command]
pub async fn cmd_revoke_invite_link(
    team_id: i64,
    state: State<'_, TelegramState>,
) -> Result<String, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Err("Not connected".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;
    let input_peer = peer_to_input_peer(&peer)?;

    // Export a new invite link, which revokes the previous one for legacy groups
    let exported = client
        .invoke(&tl::functions::messages::ExportChatInvite {
            legacy_revoke_permanent: false,
            request_needed: false,
            peer: input_peer,
            expire_date: None,
            usage_limit: None,
            title: Some("TgGuild invite".to_string()),
            subscription_pricing: None,
        })
        .await
        .map_err(|e| format!("Failed to create new invite link: {}", e))?;

    match exported {
        tl::enums::ExportedChatInvite::ChatInviteExported(invite) => {
            let hash = extract_invite_hash(&invite.link)
                .ok_or_else(|| format!("Unexpected invite link format: {}", invite.link))?;
            Ok(format!("tgguild://join/{}", hash))
        }
        tl::enums::ExportedChatInvite::ChatInvitePublicJoinRequests => {
            Err("This group requires join approval. Invite links not available.".to_string())
        }
    }
}

#[tauri::command]
pub async fn cmd_leave_team(
    team_id: i64,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    let me = client.get_me().await.map_err(map_error)?;
    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;

    match &peer {
        Peer::Channel(c) => {
            let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                channel_id: c.raw.id,
                access_hash: c.raw.access_hash.ok_or("No access hash")?,
            });

            client
                .invoke(&tl::functions::channels::LeaveChannel {
                    channel: input_channel,
                })
                .await
                .map_err(|e| format!("Failed to leave channel: {}", e))?;
        }
        Peer::Group(g) => {
            match &g.raw {
                tl::enums::Chat::Chat(chat) => {
                    client
                        .invoke(&tl::functions::messages::DeleteChatUser {
                            chat_id: chat.id,
                            user_id: tl::enums::InputUser::User(tl::types::InputUser {
                                user_id: me.raw.id(),
                                access_hash: 0,
                            }),
                            revoke_history: false,
                        })
                        .await
                        .map_err(|e| format!("Failed to leave group: {}", e))?;
                }
                tl::enums::Chat::Channel(channel) => {
                    let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                        channel_id: channel.id,
                        access_hash: channel.access_hash.ok_or("No access hash for supergroup")?,
                    });

                    client
                        .invoke(&tl::functions::channels::LeaveChannel {
                            channel: input_channel,
                        })
                        .await
                        .map_err(|e| format!("Failed to leave supergroup: {}", e))?;
                }
                _ => return Err("Unsupported group type for leaving".to_string()),
            }
        }
        _ => return Err("Invalid peer type".to_string()),
    }

    log::info!("Left team {}", team_id);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_send_team_invite_link(
    team_id: i64,
    user_id_str: String,
    access_hash_str: Option<String>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    let user_id = user_id_str
        .parse::<i64>()
        .map_err(|_| "Invalid user ID format")?;
    let access_hash = access_hash_str
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    let team_peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;
    let team_input_peer = peer_to_input_peer(&team_peer)?;
    let team_name = peer_display_name(&team_peer);

    log::info!(
        "Creating invite link for team {} (ID: {})",
        team_name,
        team_id
    );

    let exported = client
        .invoke(&tl::functions::messages::ExportChatInvite {
            legacy_revoke_permanent: false,
            request_needed: false,
            peer: team_input_peer,
            expire_date: None,
            usage_limit: None,
            title: Some("TgGuild invite".to_string()),
            subscription_pricing: None,
        })
        .await
        .map_err(|e| {
            log::error!("Failed to create invite link: {}", e);
            format!("Failed to create invite link: {}", e)
        })?;

    let invite_link = match exported {
        tl::enums::ExportedChatInvite::ChatInviteExported(invite) => {
            log::info!("Successfully created invite link: {}", invite.link);
            invite.link
        }
        tl::enums::ExportedChatInvite::ChatInvitePublicJoinRequests => {
            log::warn!(
                "Team {} uses join requests instead of invite links",
                team_id
            );
            return Err("This team is set to require join approval. Please change the group settings to allow invite links, or share the group's username with the user.".to_string());
        }
    };

    let cached_peer = {
        let cache = state.peer_cache.read().await;
        cache.get(&user_id).cloned()
    };

    log::info!(
        "Sending invite link to user_id: {}, access_hash: {}",
        user_id,
        access_hash
    );

    let target_peer = if let Some(peer) = cached_peer {
        log::info!("Using cached peer for user {}", user_id);
        peer_to_input_peer(&peer)?
    } else {
        if access_hash == 0 {
            log::error!("No access hash available for user {}", user_id);
            return Err("Cannot message this user because Telegram did not provide an access hash. Try searching for the user first to get their contact info.".to_string());
        }
        log::info!("Creating InputPeer from access_hash for user {}", user_id);
        tl::enums::InputPeer::User(tl::types::InputPeerUser {
            user_id,
            access_hash,
        })
    };

    let message = format!("You're invited to join {}:\n{}", team_name, invite_link);
    log::info!("Invite message to send: {}", message);

    match client
        .invoke(&tl::functions::messages::SendMessage {
            no_webpage: false,
            silent: false,
            background: false,
            clear_draft: true,
            noforwards: false,
            update_stickersets_order: false,
            invert_media: false,
            allow_paid_floodskip: false,
            peer: target_peer,
            reply_to: None,
            message,
            random_id: rand::random::<i64>(),
            reply_markup: None,
            entities: None,
            schedule_date: None,
            schedule_repeat_period: None,
            send_as: None,
            quick_reply_shortcut: None,
            effect: None,
            allow_paid_stars: None,
            suggested_post: None,
        })
        .await
    {
        Ok(_) => {
            log::info!("Successfully sent invite link to user {}", user_id);
        }
        Err(e) => {
            log::error!("Failed to send invite message: {}", e);
            return Err(format!("Failed to send invite link: {}. The user may have privacy restrictions that prevent receiving messages from non-contacts.", e));
        }
    }

    Ok(true)
}

#[tauri::command]
pub async fn cmd_remove_team_member(
    team_id: i64,
    user_id_str: String,
    access_hash_str: Option<String>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    let user_id = user_id_str
        .parse::<i64>()
        .map_err(|_| "Invalid user ID format")?;
    let access_hash = access_hash_str
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    let me = client.get_me().await.map_err(|e| e.to_string())?;
    let caller_id = me.raw.id();

    // Cannot remove yourself
    if user_id == caller_id {
        return Err("You cannot remove yourself. Use 'Leave Group' instead.".to_string());
    }

    // Check caller's role and target's role
    let caller_role = get_user_role_in_group(&client, team_id, caller_id, &state.peer_cache).await?;
    let target_role = get_user_role_in_group(&client, team_id, user_id, &state.peer_cache).await?;

    // Cannot remove the owner
    if target_role == "owner" {
        return Err("Cannot remove the group owner".to_string());
    }

    // Permission check: owner can remove anyone, admin can only remove members
    match caller_role.as_str() {
        "owner" => { /* owner can remove anyone except owner */ }
        "admin" => {
            if target_role == "admin" {
                return Err("Admins cannot remove other admins. Only the owner can.".to_string());
            }
        }
        _ => return Err("You do not have permission to remove members".to_string()),
    }

    log::info!("Removing user {} from team {}", user_id, team_id);

    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;

    match &peer {
        Peer::Channel(c) => {
            let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                channel_id: c.raw.id,
                access_hash: c.raw.access_hash.ok_or("No access hash")?,
            });

            let input_peer = tl::enums::InputPeer::User(tl::types::InputPeerUser {
                user_id,
                access_hash,
            });

            let banned_rights = tl::enums::ChatBannedRights::Rights(tl::types::ChatBannedRights {
                view_messages: true,
                send_messages: false,
                send_media: false,
                send_stickers: false,
                send_gifs: false,
                send_games: false,
                send_inline: false,
                embed_links: false,
                send_polls: false,
                change_info: false,
                invite_users: false,
                pin_messages: false,
                manage_topics: false,
                send_photos: false,
                send_videos: false,
                send_roundvideos: false,
                send_audios: false,
                send_voices: false,
                send_docs: false,
                send_plain: false,
                until_date: 0,
            });

            client
                .invoke(&tl::functions::channels::EditBanned {
                    channel: input_channel,
                    participant: input_peer,
                    banned_rights,
                })
                .await
                .map_err(|e| format!("Failed to remove member: {}", e))?;
        }
        Peer::Group(g) => {
            match &g.raw {
                tl::enums::Chat::Chat(chat) => {
                    client
                        .invoke(&tl::functions::messages::DeleteChatUser {
                            chat_id: chat.id,
                            user_id: tl::enums::InputUser::User(tl::types::InputUser {
                                user_id,
                                access_hash,
                            }),
                            revoke_history: false,
                        })
                        .await
                        .map_err(|e| format!("Failed to remove member: {}", e))?;
                }
                tl::enums::Chat::Channel(channel) => {
                    let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                        channel_id: channel.id,
                        access_hash: channel.access_hash.ok_or("No access hash for supergroup")?,
                    });

                    let input_peer = tl::enums::InputPeer::User(tl::types::InputPeerUser {
                        user_id,
                        access_hash,
                    });

                    let banned_rights = tl::enums::ChatBannedRights::Rights(tl::types::ChatBannedRights {
                        view_messages: true,
                        send_messages: false,
                        send_media: false,
                        send_stickers: false,
                        send_gifs: false,
                        send_games: false,
                        send_inline: false,
                        embed_links: false,
                        send_polls: false,
                        change_info: false,
                        invite_users: false,
                        pin_messages: false,
                        manage_topics: false,
                        send_photos: false,
                        send_videos: false,
                        send_roundvideos: false,
                        send_audios: false,
                        send_voices: false,
                        send_docs: false,
                        send_plain: false,
                        until_date: 0,
                    });

                    client
                        .invoke(&tl::functions::channels::EditBanned {
                            channel: input_channel,
                            participant: input_peer,
                            banned_rights,
                        })
                        .await
                        .map_err(|e| format!("Failed to remove member from supergroup: {}", e))?;
                }
                _ => return Err("Unsupported group type for member removal".to_string()),
            }
        }
        _ => return Err("Invalid peer type".to_string()),
    }

    // Send system message
    let actor_name = resolve_user_display_name(&me);
    let target_name = get_user_display_name(&client, user_id, &state.peer_cache).await;
    let msg = format!("{} removed {} from the group", actor_name, target_name);
    send_system_message(&client, team_id, &state.peer_cache, msg).await?;

    log::info!("Removed user {} from team {}", user_id, team_id);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_set_member_role(
    team_id: i64,
    user_id_str: String,
    access_hash_str: Option<String>,
    role: String,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    let user_id = user_id_str
        .parse::<i64>()
        .map_err(|_| "Invalid user ID format".to_string())?;
    let access_hash = access_hash_str
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    log::info!("Setting role '{}' for user {} in team {}", role, user_id, team_id);

    // Permission check: only owner can promote/demote to/from admin
    require_owner(&client, team_id, &state.peer_cache).await?;

    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;
    let input_user = tl::enums::InputUser::User(tl::types::InputUser {
        user_id,
        access_hash,
    });

    let is_promote = role == "admin";

    match &peer {
        Peer::Channel(c) => {
            let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                channel_id: c.raw.id,
                access_hash: c.raw.access_hash.ok_or("No access hash")?,
            });

            let admin_rights = if is_promote {
                tl::enums::ChatAdminRights::Rights(tl::types::ChatAdminRights {
                    change_info: true,
                    post_messages: true,
                    edit_messages: true,
                    delete_messages: true,
                    ban_users: true,
                    invite_users: true,
                    pin_messages: true,
                    add_admins: false,
                    anonymous: false,
                    manage_call: true,
                    other: true,
                    manage_topics: true,
                    post_stories: true,
                    edit_stories: true,
                    delete_stories: true,
                    manage_direct_messages: true,
                })
            } else {
                tl::enums::ChatAdminRights::Rights(tl::types::ChatAdminRights {
                    change_info: false,
                    post_messages: false,
                    edit_messages: false,
                    delete_messages: false,
                    ban_users: false,
                    invite_users: false,
                    pin_messages: false,
                    add_admins: false,
                    anonymous: false,
                    manage_call: false,
                    other: false,
                    manage_topics: false,
                    post_stories: false,
                    edit_stories: false,
                    delete_stories: false,
                    manage_direct_messages: false,
                })
            };

            client
                .invoke(&tl::functions::channels::EditAdmin {
                    channel: input_channel,
                    user_id: input_user,
                    admin_rights,
                    rank: if is_promote { "admin".to_string() } else { "".to_string() },
                })
                .await
                .map_err(|e| format!("Failed to set role: {}", e))?;
        }
        Peer::Group(g) => {
            match &g.raw {
                tl::enums::Chat::Chat(chat) => {
                    client
                        .invoke(&tl::functions::messages::EditChatAdmin {
                            chat_id: chat.id,
                            user_id: input_user,
                            is_admin: is_promote,
                        })
                        .await
                        .map_err(|e| format!("Failed to set role: {}", e))?;
                }
                tl::enums::Chat::Channel(channel) => {
                    let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                        channel_id: channel.id,
                        access_hash: channel.access_hash.ok_or("No access hash for supergroup")?,
                    });

                    let admin_rights = if is_promote {
                        tl::enums::ChatAdminRights::Rights(tl::types::ChatAdminRights {
                            change_info: true,
                            post_messages: true,
                            edit_messages: true,
                            delete_messages: true,
                            ban_users: true,
                            invite_users: true,
                            pin_messages: true,
                            add_admins: false,
                            anonymous: false,
                            manage_call: true,
                            other: true,
                            manage_topics: true,
                            post_stories: true,
                            edit_stories: true,
                            delete_stories: true,
                            manage_direct_messages: true,
                        })
                    } else {
                        tl::enums::ChatAdminRights::Rights(tl::types::ChatAdminRights {
                            change_info: false,
                            post_messages: false,
                            edit_messages: false,
                            delete_messages: false,
                            ban_users: false,
                            invite_users: false,
                            pin_messages: false,
                            add_admins: false,
                            anonymous: false,
                            manage_call: false,
                            other: false,
                            manage_topics: false,
                            post_stories: false,
                            edit_stories: false,
                            delete_stories: false,
                            manage_direct_messages: false,
                        })
                    };

                    client
                        .invoke(&tl::functions::channels::EditAdmin {
                            channel: input_channel,
                            user_id: input_user,
                            admin_rights,
                            rank: if is_promote { "admin".to_string() } else { "".to_string() },
                        })
                        .await
                        .map_err(|e| format!("Failed to set role in supergroup: {}", e))?;
                }
                _ => return Err("Unsupported group type for setting role".to_string()),
            }
        }
        _ => return Err("Invalid peer type".to_string()),
    }

    // Send system message
    let me = client.get_me().await.map_err(|e| e.to_string())?;
    let actor_name = resolve_user_display_name(&me);
    let target_name = get_user_display_name(&client, user_id, &state.peer_cache).await;
    let msg = if is_promote {
        format!("{} was promoted to Admin by {}", target_name, actor_name)
    } else {
        format!("{} is no longer an Admin", target_name)
    };
    send_system_message(&client, team_id, &state.peer_cache, msg).await?;

    log::info!("Successfully set role '{}' for user {} in team {}", role, user_id, team_id);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_create_team(
    name: String,
    _description: Option<String>,
    state: State<'_, TelegramState>,
) -> Result<TeamInfo, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(TeamInfo {
            id: 999,
            name,
            username: None,
            member_count: 0,
            is_channel: false,
            is_supergroup: true,
            top_members: Vec::new(),
            unread_count: 0,
            photo_url: None,
        });
    }
    let client = client_opt.unwrap();

    log::info!("Creating supergroup: {}", name);

    let result = client
        .invoke(&tl::functions::channels::CreateChannel {
            broadcast: false,
            megagroup: true,
            title: name.clone(),
            about: "".to_string(),
            geo_point: None,
            address: None,
            for_import: false,
            forum: false,
            ttl_period: None,
        })
        .await
        .map_err(|e| format!("Failed to create team: {}", e))?;

    let (id, username, access_hash) = match result {
        tl::enums::Updates::Updates(u) => {
            let chat = u.chats.first().ok_or("No chat in updates")?;
            match chat {
                tl::enums::Chat::Channel(c) => (
                    c.id,
                    c.username.clone(),
                    c.access_hash.unwrap_or(0),
                ),
                _ => return Err("Created chat is not a channel".to_string()),
            }
        }
        _ => return Err("Unexpected response".to_string()),
    };

    // Enable everyone to pin messages
    let _ = client
        .invoke(&tl::functions::messages::EditChatDefaultBannedRights {
            peer: tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
                channel_id: id,
                access_hash,
            }),
            banned_rights: tl::enums::ChatBannedRights::Rights(tl::types::ChatBannedRights {
                view_messages: false,
                send_messages: false,
                send_media: false,
                send_stickers: false,
                send_gifs: false,
                send_games: false,
                send_inline: false,
                embed_links: false,
                send_polls: false,
                change_info: false,
                invite_users: false,
                pin_messages: false,
                manage_topics: false,
                send_photos: false,
                send_videos: false,
                send_roundvideos: false,
                send_audios: false,
                send_voices: false,
                send_docs: false,
                send_plain: false,
                until_date: 0,
            }),
        })
        .await;

    log::info!("Created team: {} (ID: {})", name, id);
    Ok(TeamInfo {
        id,
        name,
        username,
        member_count: 1,
        is_channel: false,
        is_supergroup: true,
        top_members: Vec::new(),
        unread_count: 0,
        photo_url: None,
    })
}

#[tauri::command]
pub async fn cmd_transfer_ownership(
    team_id: i64,
    new_owner_user_id_str: String,
    new_owner_access_hash_str: Option<String>,
    password: String,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    // Only owner can transfer
    require_owner(&client, team_id, &state.peer_cache).await?;

    let new_owner_id = new_owner_user_id_str
        .parse::<i64>()
        .map_err(|_| "Invalid user ID format".to_string())?;
    let new_owner_hash = new_owner_access_hash_str
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    let me = client.get_me().await.map_err(|e| e.to_string())?;
    if me.raw.id() == new_owner_id {
        return Err("You are already the owner".to_string());
    }

    log::info!("Transferring ownership of team {} to user {}", team_id, new_owner_id);

    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;

    match &peer {
        Peer::Channel(c) => {
            let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                channel_id: c.raw.id,
                access_hash: c.raw.access_hash.ok_or("No access hash")?,
            });

            let input_user = tl::enums::InputUser::User(tl::types::InputUser {
                user_id: new_owner_id,
                access_hash: new_owner_hash,
            });

            client
                .invoke(&tl::functions::channels::EditCreator {
                    channel: input_channel,
                    user_id: input_user,
                    password: tl::enums::InputCheckPasswordSrp::InputCheckPasswordEmpty,
                })
                .await
                .map_err(|e| {
                    let err = e.to_string();
                    if err.contains("PASSWORD_MISSING") || err.contains("2FA") {
                        "Transfer requires Two-Factor Authentication. Please enable 2FA in Telegram settings first.".to_string()
                    } else {
                        format!("Failed to transfer ownership: {}", err)
                    }
                })?;
        }
        _ => return Err("Ownership transfer is only supported for supergroups (channels)".to_string()),
    }

    let actor_name = resolve_user_display_name(&me);
    let target_name = get_user_display_name(&client, new_owner_id, &state.peer_cache).await;
    let msg = format!("{} transferred ownership to {}", actor_name, target_name);
    send_system_message(&client, team_id, &state.peer_cache, msg).await?;

    log::info!("Transferred ownership of team {} to user {}", team_id, new_owner_id);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_delete_team(
    team_id: i64,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    // Only owner can delete
    require_owner(&client, team_id, &state.peer_cache).await?;

    log::info!("Deleting team {}", team_id);

    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;

    match &peer {
        Peer::Channel(c) => {
            let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                channel_id: c.raw.id,
                access_hash: c.raw.access_hash.ok_or("No access hash")?,
            });

            client
                .invoke(&tl::functions::channels::DeleteChannel {
                    channel: input_channel,
                })
                .await
                .map_err(|e| format!("Failed to delete team: {}", e))?;
        }
        Peer::Group(g) => {
            match &g.raw {
                tl::enums::Chat::Chat(chat) => {
                    client
                        .invoke(&tl::functions::messages::DeleteChat {
                            chat_id: chat.id,
                        })
                        .await
                        .map_err(|e| format!("Failed to delete team: {}", e))?;
                }
                tl::enums::Chat::Channel(channel) => {
                    let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                        channel_id: channel.id,
                        access_hash: channel.access_hash.ok_or("No access hash for supergroup")?,
                    });

                    client
                        .invoke(&tl::functions::channels::DeleteChannel {
                            channel: input_channel,
                        })
                        .await
                        .map_err(|e| format!("Failed to delete supergroup: {}", e))?;
                }
                _ => return Err("Unsupported group type for deletion".to_string()),
            }
        }
        _ => return Err("Invalid peer type".to_string()),
    }

    log::info!("Deleted team {}", team_id);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_delete_direct_chat(
    user_id: i64,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    log::info!("Deleting direct chat with user {}", user_id);

    let peer = resolve_peer(&client, Some(user_id), &state.peer_cache).await?;
    let input_peer = peer_to_input_peer(&peer)?;

    client
        .invoke(&tl::functions::messages::DeleteHistory {
            peer: input_peer,
            max_id: 0,
            max_date: Some(0),
            min_date: Some(0),
            just_clear: false,
            revoke: false,
        })
        .await
        .map_err(|e| format!("Failed to delete direct chat: {}", e))?;

    log::info!("Deleted direct chat with user {}", user_id);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_edit_team(
    team_id: i64,
    new_name: Option<String>,
    new_description: Option<String>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    // Only owner or admin can edit group info
    require_admin_or_owner(&client, team_id, &state.peer_cache).await?;

    log::info!(
        "Editing team {} with name {:?} and description {:?}",
        team_id,
        new_name,
        new_description
    );

    let me = client.get_me().await.map_err(|e| e.to_string())?;
    let actor_name = resolve_user_display_name(&me);
    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;

    match &peer {
        Peer::Channel(c) => {
            let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                channel_id: c.raw.id,
                access_hash: c.raw.access_hash.ok_or("No access hash")?,
            });

            if let Some(ref name) = new_name {
                client
                    .invoke(&tl::functions::channels::EditTitle {
                        channel: input_channel.clone(),
                        title: name.clone(),
                    })
                    .await
                    .map_err(|e| format!("Failed to rename: {}", e))?;
            }

            if let Some(ref desc) = new_description {
                let peer_input = peer_to_input_peer(&peer)?;
                client
                    .invoke(&tl::functions::messages::EditChatAbout {
                        peer: peer_input,
                        about: desc.clone(),
                    })
                    .await
                    .map_err(|e| format!("Failed to update description: {}", e))?;
            }
        }
        Peer::Group(g) => {
            match &g.raw {
                tl::enums::Chat::Chat(chat) => {
                    if let Some(ref name) = new_name {
                        client
                            .invoke(&tl::functions::messages::EditChatTitle {
                                chat_id: chat.id,
                                title: name.clone(),
                            })
                            .await
                            .map_err(|e| format!("Failed to rename: {}", e))?;
                    }
                }
                tl::enums::Chat::Channel(channel) => {
                    if let Some(ref name) = new_name {
                        let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                            channel_id: channel.id,
                            access_hash: channel.access_hash.ok_or("No access hash for supergroup")?,
                        });

                        client
                            .invoke(&tl::functions::channels::EditTitle {
                                channel: input_channel,
                                title: name.clone(),
                            })
                            .await
                            .map_err(|e| format!("Failed to rename supergroup: {}", e))?;
                    }
                }
                _ => return Err("Unsupported group type for editing".to_string()),
            }

            if let Some(ref desc) = new_description {
                let peer_input = peer_to_input_peer(&peer)?;
                client
                    .invoke(&tl::functions::messages::EditChatAbout {
                        peer: peer_input,
                        about: desc.clone(),
                    })
                    .await
                    .map_err(|e| format!("Failed to update description: {}", e))?;
            }
        }
        _ => return Err("Invalid peer type".to_string()),
    }

    // Send system messages for name/description changes
    if let Some(ref name) = new_name {
        let msg = format!("{} changed the group name to \"{}\"", actor_name, name);
        let _ = send_system_message(&client, team_id, &state.peer_cache, msg).await;
    }
    if new_description.is_some() {
        let msg = format!("{} updated the group description", actor_name);
        let _ = send_system_message(&client, team_id, &state.peer_cache, msg).await;
    }

    log::info!("Edited team {}", team_id);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_get_team_messages(
    team_id: Option<i64>,
    limit: Option<i32>,
    before_message_id: Option<i32>,
    media_filter: Option<String>,
    state: State<'_, TelegramState>,
) -> Result<MessagesResponse, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(MessagesResponse {
            messages: Vec::new(),
            next_before_message_id: None,
            has_more: false,
        });
    }
    let client = client_opt.unwrap();

    log::info!(
        "Fetching messages for peer: {:?}, before_message_id: {:?}",
        team_id,
        before_message_id
    );

    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;

    let msg_limit = limit.unwrap_or(50).clamp(1, 100) as usize;
    let fetch_limit = msg_limit + 1;
    let mut messages = Vec::new();
    let mut iter = match before_message_id {
        Some(id) if id > 0 => client.iter_messages(&peer).offset_id(id).limit(fetch_limit),
        _ => client.iter_messages(&peer).limit(fetch_limit),
    };
    let mut has_more = false;

    while let Some(msg) = iter.next().await.map_err(|e| e.to_string())? {
        if messages.len() >= msg_limit {
            has_more = true;
            break;
        }

        let (sender_name, sender_photo_url) = match msg.sender() {
            Some(Peer::User(u)) => {
                let name = resolve_user_display_name(&u);
                let photo = if user_has_photo(&u.raw) {
                    Some("present".to_string())
                } else {
                    None
                };
                (name, photo)
            }
            _ => ("Unknown".to_string(), None),
        };
        let sender_id = match msg.sender() {
            Some(Peer::User(u)) => u.raw.id() as i64,
            _ => 0,
        };

        let media = msg.media();
        let raw_text = msg.text().to_string();
        let text = if raw_text.starts_with("TGGuild_") {
            let first_line = raw_text.lines().next().unwrap_or(&raw_text);
            if first_line.starts_with("TGGuild_FILE_V1:") || first_line.starts_with("TGGuild_FOLDER_V1:") {
                String::new()
            } else {
                raw_text
            }
        } else {
            raw_text
        };
        let mut message_type = "text".to_string();
        let mut action_params: Option<String> = None;

        // Detect system/action messages
        let (has_media, media_type, media_name, media_size, mime_type, display_text, audio_duration) = match &msg.raw {
            tl::enums::Message::Service(service) => {
                let sender_name = sender_name.clone();
                let (system_text, params) = match &service.action {
                    tl::enums::MessageAction::PinMessage => {
                        let pinned_id = service.reply_to.as_ref()
                            .and_then(|r| match r {
                                tl::enums::MessageReplyHeader::Header(h) => h.reply_to_msg_id,
                                _ => None,
                            })
                            .unwrap_or(0);
                        (format!("📌 {} pinned a message", sender_name), Some(pinned_id.to_string()))
                    }
                    tl::enums::MessageAction::ChatAddUser(action) => {
                        let mut user_names = Vec::new();
                        for uid in &action.users {
                            let name = get_user_display_name(&client, *uid, &state.peer_cache).await;
                            user_names.push(name);
                        }
                        let users_str = user_names.join(", ");
                        (format!("👋 {} joined the group", users_str), None)
                    }
                    tl::enums::MessageAction::ChatJoinedByLink(_action) => {
                        (format!("👋 {} joined the group via invite link", sender_name), None)
                    }
                    tl::enums::MessageAction::ChatDeleteUser(action) => {
                        let name = get_user_display_name(&client, action.user_id, &state.peer_cache).await;
                        (format!("👋 {} left the group", name), None)
                    }
                    tl::enums::MessageAction::ChatCreate(action) => {
                        (format!("Group created: {}", action.title), None)
                    }
                    tl::enums::MessageAction::ChatEditTitle(action) => {
                        (format!("Group name changed to \"{}\"", action.title), None)
                    }
                    tl::enums::MessageAction::ChatEditPhoto(_) => {
                        (format!("{} changed the group photo", sender_name), None)
                    }
                    tl::enums::MessageAction::ChatDeletePhoto => {
                        (format!("{} removed the group photo", sender_name), None)
                    }
                    tl::enums::MessageAction::ChannelCreate(action) => {
                        (format!("Channel created: {}", action.title), None)
                    }
                    tl::enums::MessageAction::HistoryClear => {
                        ("History cleared".to_string(), None)
                    }
                    _ => {
                        // Unknown action type
                        ("System event".to_string(), None)
                    }
                };
                message_type = "system".to_string();
                action_params = params;
                (false, "none".to_string(), "".to_string(), 0, "".to_string(), system_text, None)
            }
            _ => {
                match media {
                    Some(grammers_client::types::Media::Photo(_)) => {
                        let display = if !text.is_empty() { text } else { "[Photo]".to_string() };
                        (true, "photo".to_string(), "Photo".to_string(), 0, "image/jpeg".to_string(), display, None)
                    }
                    Some(grammers_client::types::Media::Document(d)) => {
                        let name = d.name();
                        let size = d.size() as i64;
                        let mime = d.mime_type().map(|m| m.to_string()).unwrap_or_default();
                        let ext = std::path::Path::new(&name)
                            .extension()
                            .and_then(|e| e.to_str())
                            .map(|s| s.to_lowercase())
                            .unwrap_or_default();

                        let is_voice = d.raw.voice || (name.starts_with("voice-") && ext == "webm");

                        let duration = match &d.raw.document {
                            Some(tl::enums::Document::Document(doc)) => {
                                doc.attributes.iter().find_map(|attr| match attr {
                                    tl::enums::DocumentAttribute::Audio(a) => Some(a.duration as f64),
                                    _ => None,
                                })
                            }
                            _ => None,
                        };

                        let file_type = if is_voice {
                            "voice"
                        } else if ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].contains(&ext.as_str()) {
                            "image"
                        } else if ["mp4", "avi", "mov", "mkv", "webm"].contains(&ext.as_str()) {
                            "video"
                        } else if ["mp3", "wav", "ogg", "flac", "aac", "m4a"].contains(&ext.as_str()) {
                            "audio"
                        } else if ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"].contains(&ext.as_str()) {
                            "document"
                        } else {
                            "file"
                        }.to_string();

                        let default_display = match file_type.as_str() {
                            "image" => "[Image]",
                            "video" => "[Video]",
                            "audio" => "[Audio]",
                            "voice" => "[Voice]",
                            _ => &name,
                        }.to_string();
                        let display = if !text.is_empty() { text } else { default_display };
                        (true, file_type, name.to_string(), size, mime, display, duration)
                    }
                    _ => {
                        let display = if !text.is_empty() { text } else { String::new() };
                        (false, "none".to_string(), "".to_string(), 0, "".to_string(), display, None)
                    }
                }
            }
        };

        let date_str = msg.date().to_string();

        // Apply media_filter if specified
        if let Some(ref filter) = media_filter {
            let filter_lower = filter.to_lowercase();
            let matches = match filter_lower.as_str() {
                "photo" => media_type == "photo",
                "video" => media_type == "video",
                "audio" => media_type == "audio" || media_type == "voice",
                "voice" => media_type == "voice",
                "document" => media_type == "document" || media_type == "file",
                "file" => media_type == "file" || media_type == "document",
                "media" => has_media,
                "system" => message_type == "system",
                "text" => message_type == "text",
                _ => true,
            };
            if !matches {
                continue;
            }
        }

        messages.push(ChatMessage {
            id: msg.id(),
            sender_id,
            sender_name,
            sender_photo_url,
            text: display_text,
            date: date_str,
            has_media,
            media_type,
            media_name,
            media_size,
            mime_type,
            outgoing: msg.outgoing(),
            pinned: msg.pinned(),
            edited: msg.edit_date().is_some(),
            audio_duration,
            message_type,
            action_params,
        });
    }

    let next_before_message_id = if has_more {
        messages.last().map(|message| message.id)
    } else {
        None
    };

    log::info!(
        "Found {} messages for peer {:?} (has_more: {})",
        messages.len(),
        team_id,
        has_more
    );
    Ok(MessagesResponse {
        messages,
        next_before_message_id,
        has_more,
    })
}

#[tauri::command]
pub async fn cmd_send_team_message(
    team_id: Option<i64>,
    message: String,
    reply_to_message_id: Option<i32>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;
    let mut message_obj = grammers_client::InputMessage::new().text(message);
    message_obj = message_obj.reply_to(reply_to_message_id);

    client
        .send_message(&peer, message_obj)
        .await
        .map_err(|e| format!("Failed to send message: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn cmd_send_team_file(
    team_id: Option<i64>,
    path: String,
    caption: Option<String>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| e.to_string())?;
    let mut file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| e.to_string())?;
    let file_name = std::path::Path::new(&path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());

    let uploaded = client
        .upload_stream(&mut file, metadata.len() as usize, file_name)
        .await
        .map_err(map_error)?;
    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;
    let message = grammers_client::InputMessage::new()
        .text(caption.unwrap_or_default())
        .file(uploaded);

    client
        .send_message(&peer, message)
        .await
        .map_err(map_error)?;

    Ok(true)
}

#[tauri::command]
pub async fn cmd_edit_message(
    team_id: Option<i64>,
    message_id: i32,
    text: String,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();
    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;
    let input_peer = peer_to_input_peer(&peer)?;

    log::info!(
        "[cmd_edit_message] team_id={:?} message_id={} text_len={}",
        team_id,
        message_id,
        text.len()
    );

    client
        .edit_message(input_peer, message_id, InputMessage::new().text(text))
        .await
        .map_err(|e| {
            let msg = format!("Failed to edit message: {}", e);
            log::error!("[cmd_edit_message] ERROR: {}", msg);
            msg
        })?;

    log::info!("[cmd_edit_message] Success");
    Ok(true)
}

#[tauri::command]
pub async fn cmd_delete_messages(
    team_id: Option<i64>,
    message_ids: Vec<i32>,
    revoke: bool,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    let label = if revoke { "Delete for everyone" } else { "Delete for me" };
    let msg_count = message_ids.len();
    println!("[cmd_delete_messages] {}: {} msgs", label, msg_count);

    // Resolve the peer so we can choose the right TL function.
    // For channels / supergroups we must use channels.DeleteMessages — the
    // messages.DeleteMessages method simply ignores the `revoke` flag there
    // and only removes the message from the caller's view.
    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;

    match &peer {
        Peer::Channel(c) => {
            if revoke {
                let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                    channel_id: c.raw.id,
                    access_hash: c.raw.access_hash.ok_or("No access hash for channel")?,
                });

                client
                    .invoke(&tl::functions::channels::DeleteMessages {
                        channel: input_channel,
                        id: message_ids,
                    })
                    .await
                    .map_err(|e| {
                        let msg = format!("Failed to delete for everyone in channel: {}", e);
                        eprintln!("[cmd_delete_messages] ERROR: {}", msg);
                        msg
                    })?;
            } else {
                println!("[cmd_delete_messages] Skipping API call (revoke=false, local-only delete)");
            }
        }
        Peer::Group(g) => {
            match &g.raw {
                tl::enums::Chat::Channel(channel) => {
                    if revoke {
                        let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                            channel_id: channel.id,
                            access_hash: channel.access_hash.ok_or("No access hash for supergroup")?,
                        });

                        client
                            .invoke(&tl::functions::channels::DeleteMessages {
                                channel: input_channel,
                                id: message_ids,
                            })
                            .await
                            .map_err(|e| {
                                let msg = format!("Failed to delete for everyone in supergroup: {}", e);
                                eprintln!("[cmd_delete_messages] ERROR: {}", msg);
                                msg
                            })?;
                    } else {
                        println!("[cmd_delete_messages] Skipping API call (revoke=false, local-only delete)");
                    }
                }
                tl::enums::Chat::Chat(_) => {
                    // Legacy basic group — messages.DeleteMessages respects revoke
                    client
                        .invoke(&tl::functions::messages::DeleteMessages {
                            id: message_ids,
                            revoke,
                        })
                        .await
                        .map_err(|e| {
                            let msg = format!("Failed to {}: {}", label.to_lowercase(), e);
                            eprintln!("[cmd_delete_messages] ERROR: {}", msg);
                            msg
                        })?;
                }
                _ => {
                    return Err("Unsupported group type for message deletion".to_string());
                }
            }
        }
        Peer::User(_) => {
            // Direct / private chat — messages.DeleteMessages respects revoke
            client
                .invoke(&tl::functions::messages::DeleteMessages {
                    id: message_ids,
                    revoke,
                })
                .await
                .map_err(|e| {
                    let msg = format!("Failed to {}: {}", label.to_lowercase(), e);
                    eprintln!("[cmd_delete_messages] ERROR: {}", msg);
                    msg
                })?;
        }
    }

    println!("[cmd_delete_messages] Success: {} msgs {}", label, msg_count);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_download_team_media(
    message_id: i32,
    team_id: Option<i64>,
    save_path: String,
    state: State<'_, TelegramState>,
) -> Result<String, String> {
    use grammers_client::types::Media;

    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Err("Not logged in".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;

    let messages = client
        .get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?;

    let msg = messages
        .into_iter()
        .flatten()
        .next()
        .ok_or("Message not found")?;

    let media = msg.media().ok_or("No media in message")?;

    match media {
        Media::Photo(_) => {
            std::fs::File::create(&save_path).map_err(|e| e.to_string())?;
            log::info!("[MOCK] Saved photo to {}", save_path);
            Ok("Photo saved".to_string())
        }
        Media::Document(ref d) => {
            let name = d.name();
            let ext = std::path::Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("bin");
            let final_path = if save_path.ends_with(&format!(".{}", ext)) {
                save_path.clone()
            } else {
                format!("{}.{}", save_path, ext)
            };

            let mut download_iter = client.iter_download(&media);
            let mut file = std::fs::File::create(&final_path).map_err(|e| e.to_string())?;

            while let Some(chunk) = download_iter.next().await.transpose() {
                let bytes = chunk.map_err(|e| e.to_string())?;
                std::io::Write::write_all(&mut file, &bytes).map_err(|e| e.to_string())?;
            }

            log::info!("Downloaded file to {}", final_path);
            Ok(final_path)
        }
        _ => Err("Unsupported media type".to_string()),
    }
}

#[tauri::command]
pub async fn cmd_pin_team_message(
    team_id: Option<i64>,
    message_id: i32,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    // Only admins and owners can pin
    if let Some(tid) = team_id {
        require_admin_or_owner(&client, tid, &state.peer_cache)
            .await
            .map_err(|_| "Only admins can pin messages.".to_string())?;
    }

    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;
    let input_peer = resolve_input_peer(&peer)?;

    log::info!(
        "[cmd_pin_team_message] team_id={:?} message_id={}",
        team_id, message_id
    );

    client
        .invoke(&tl::functions::messages::UpdatePinnedMessage {
            silent: false,
            unpin: false,
            pm_oneside: false,
            peer: input_peer,
            id: message_id,
        })
        .await
        .map_err(|e| {
            let msg = format!("Failed to pin message: {}", e);
            log::error!("[cmd_pin_team_message] ERROR: {}", msg);
            msg
        })?;

    log::info!("[cmd_pin_team_message] Success");
    Ok(true)
}

// ========================
// REACTIONS
// ========================

#[derive(Clone, serde::Serialize)]
pub struct ReactionInfo {
    pub emoji: String,
    pub count: i32,
    pub chosen: bool,
    pub reactors: Vec<String>,
}

#[derive(Clone, serde::Serialize)]
pub struct ReactionsResponse {
    pub reactions: std::collections::HashMap<i32, Vec<ReactionInfo>>,
}

#[tauri::command]
pub async fn cmd_send_reaction(
    team_id: Option<i64>,
    message_id: i32,
    emoji: Option<String>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Err("Not connected".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;
    let input_peer = resolve_input_peer(&peer)?;

    let reaction = match &emoji {
        Some(e) => Some(vec![tl::enums::Reaction::Emoji(tl::types::ReactionEmoji {
            emoticon: e.clone(),
        })]),
        None => None,
    };

    client
        .invoke(&tl::functions::messages::SendReaction {
            peer: input_peer,
            msg_id: message_id,
            reaction,
            add_to_recent: true,
            big: false,
        })
        .await
        .map_err(|e| format!("Failed to send reaction: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn cmd_get_message_reactions(
    team_id: Option<i64>,
    message_ids: Vec<i32>,
    state: State<'_, TelegramState>,
) -> Result<ReactionsResponse, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(ReactionsResponse {
            reactions: std::collections::HashMap::new(),
        });
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;
    let input_peer = resolve_input_peer(&peer)?;

    let result = client
        .invoke(&tl::functions::messages::GetMessagesReactions {
            peer: input_peer,
            id: message_ids.clone(),
        })
        .await;

    let mut reactions_map: std::collections::HashMap<i32, Vec<ReactionInfo>> = std::collections::HashMap::new();

    if let Ok(updates) = result {
        let update_list: Vec<tl::enums::Update> = match &updates {
            tl::enums::Updates::Updates(u) => u.updates.clone(),
            tl::enums::Updates::Combined(c) => c.updates.clone(),
            tl::enums::Updates::UpdateShort(s) => vec![s.update.clone()],
            _ => Vec::new(),
        };
        for update in update_list {
            if let tl::enums::Update::MessageReactions(react_update) = update {
                let msg_id = react_update.msg_id;
                let mut infos: Vec<ReactionInfo> = Vec::new();
                let tl::enums::MessageReactions::Reactions(reactions_struct) = &react_update.reactions;
                for rc_enum in &reactions_struct.results {
                    let tl::enums::ReactionCount::Count(rc) = rc_enum;
                    let emoji = match &rc.reaction {
                        tl::enums::Reaction::Emoji(e) => e.emoticon.clone(),
                        _ => continue,
                    };
                    infos.push(ReactionInfo {
                        emoji,
                        count: rc.count,
                        chosen: rc.chosen_order.is_some(),
                        reactors: Vec::new(),
                    });
                }
                reactions_map.insert(msg_id, infos);
            }
        }
    } else {
        log::warn!("GetMessagesReactions failed or returned no data");
    }

    Ok(ReactionsResponse {
        reactions: reactions_map,
    })
}

// ========================
// READ RECEIPTS
// ========================

#[derive(Clone, serde::Serialize)]
pub struct ReadReceipt {
    pub user_id: i64,
    pub user_name: String,
    pub read_at: String,
}

#[derive(Clone, serde::Serialize)]
pub struct MessageReadStatus {
    pub is_read: bool,
    pub read_count: i32,
    pub total_count: i32,
    pub readers: Vec<ReadReceipt>,
}

#[tauri::command]
pub async fn cmd_mark_read(
    team_id: Option<i64>,
    max_message_id: i32,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Err("Not connected".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;
    let input_peer = resolve_input_peer(&peer)?;

    match &peer {
        Peer::Channel(_) => {
            let input_channel = match &input_peer {
                tl::enums::InputPeer::Channel(ch) => {
                    tl::enums::InputChannel::Channel(tl::types::InputChannel {
                        channel_id: ch.channel_id,
                        access_hash: ch.access_hash,
                    })
                }
                _ => return Err("Expected channel peer".to_string()),
            };
            client
                .invoke(&tl::functions::channels::ReadHistory {
                    channel: input_channel,
                    max_id: max_message_id,
                })
                .await
                .map_err(|e| format!("Failed to mark read: {}", e))?;
        }
        _ => {
            client
                .invoke(&tl::functions::messages::ReadHistory {
                    peer: input_peer,
                    max_id: max_message_id,
                })
                .await
                .map_err(|e| format!("Failed to mark read: {}", e))?;
        }
    }

    Ok(true)
}

#[tauri::command]
pub async fn cmd_get_message_read_status(
    team_id: Option<i64>,
    message_id: i32,
    state: State<'_, TelegramState>,
) -> Result<MessageReadStatus, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Err("Not connected".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;
    let input_peer = resolve_input_peer(&peer)?;

    let result = client
        .invoke(&tl::functions::messages::GetMessagesViews {
            peer: input_peer,
            id: vec![message_id],
            increment: false,
        })
        .await
        .map_err(|e| format!("Failed to get message views: {}", e))?;

    let tl::enums::messages::MessageViews::Views(views_response) = result;
    if let Some(view_enum) = views_response.views.first() {
        let tl::enums::MessageViews::Views(view) = view_enum;
        let read_count = view.views.unwrap_or(0).max(0) as i32;
        Ok(MessageReadStatus {
            is_read: read_count > 0,
            read_count,
            total_count: 0,
            readers: Vec::new(),
        })
    } else {
        Ok(MessageReadStatus {
            is_read: false,
            read_count: 0,
            total_count: 0,
            readers: Vec::new(),
        })
    }
}

// ========================
// TYPING INDICATORS
// ========================

#[derive(Clone, serde::Serialize)]
pub struct TypingUser {
    pub user_id: i64,
    pub user_name: String,
    pub action: String,
}

#[tauri::command]
pub async fn cmd_set_typing(
    team_id: Option<i64>,
    typing: bool,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Err("Not connected".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;
    let input_peer = resolve_input_peer(&peer)?;

    let action = if typing {
        tl::enums::SendMessageAction::SendMessageTypingAction
    } else {
        tl::enums::SendMessageAction::SendMessageCancelAction
    };

    client
        .invoke(&tl::functions::messages::SetTyping {
            peer: input_peer,
            action,
            top_msg_id: None,
        })
        .await
        .map_err(|e| format!("Failed to set typing: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn cmd_get_typing_status(
    team_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<Vec<TypingUser>, String> {
    let typing_store = state.typing_store.lock().await;
    let peer_key = format!("peer:{}", team_id.unwrap_or(0));
    let now = Utc::now().timestamp();

    let mut result = Vec::new();
    if let Some(users) = typing_store.get(&peer_key) {
        for (_user_id_str, typing_info) in users {
            if now - typing_info.last_updated < 7 {
                result.push(TypingUser {
                    user_id: typing_info.user_id,
                    user_name: typing_info.user_name.clone(),
                    action: typing_info.action.clone(),
                });
            }
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn cmd_record_typing(
    team_id: Option<i64>,
    user_id: i64,
    user_name: String,
    action: String,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let mut typing_store = state.typing_store.lock().await;
    let peer_key = format!("peer:{}", team_id.unwrap_or(0));
    let entry = typing_store.entry(peer_key).or_insert_with(std::collections::HashMap::new);
    entry.insert(
        user_id.to_string(),
        crate::commands::TypingEntry {
            user_id,
            user_name,
            action,
            last_updated: Utc::now().timestamp(),
        },
    );
    Ok(true)
}

// ========================
// ONLINE PRESENCE
// ========================

#[derive(Clone, serde::Serialize)]
pub struct UserPresence {
    pub user_id: i64,
    pub online: bool,
    pub last_seen: Option<String>,
}

#[tauri::command]
pub async fn cmd_update_presence(
    online: bool,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Err("Not connected".to_string());
    }
    let client = client_opt.unwrap();

    client
        .invoke(&tl::functions::account::UpdateStatus {
            offline: !online,
        })
        .await
        .map_err(|e| format!("Failed to update presence: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn cmd_get_user_presence(
    user_ids: Vec<i64>,
    state: State<'_, TelegramState>,
) -> Result<Vec<UserPresence>, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();

    let mut input_users = Vec::new();

    for &user_id in &user_ids {
        let cached_peer = {
            let cache = state.peer_cache.read().await;
            cache.get(&user_id).cloned()
        };

        let input_user = if let Some(peer) = cached_peer {
            match &peer {
                Peer::User(u) => {
                    let access_hash = match &u.raw {
                        tl::enums::User::User(raw) => raw.access_hash.unwrap_or(0),
                        _ => 0,
                    };
                    tl::enums::InputUser::User(tl::types::InputUser {
                        user_id,
                        access_hash,
                    })
                }
                _ => continue,
            }
        } else {
            tl::enums::InputUser::User(tl::types::InputUser {
                user_id,
                access_hash: 0,
            })
        };
        input_users.push(input_user);
    }

    if input_users.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    let users_result = client
        .invoke(&tl::functions::users::GetUsers {
            id: input_users,
        })
        .await
        .map_err(|e| format!("Failed to get users: {}", e))?;

    for user in users_result {
        if let tl::enums::User::User(u) = user {
            let status = u.status;
            let (online, last_seen) = match status {
                Some(tl::enums::UserStatus::Online(_)) => (true, None),
                Some(tl::enums::UserStatus::Offline(off)) => {
                    let was = chrono::DateTime::from_timestamp(off.was_online as i64, 0)
                        .map(|d| d.to_string())
                        .unwrap_or_else(|| "recently".to_string());
                    (false, Some(was))
                }
                Some(tl::enums::UserStatus::Recently(_)) => (false, Some("recently".to_string())),
                Some(tl::enums::UserStatus::LastWeek(_)) => (false, Some("last week".to_string())),
                Some(tl::enums::UserStatus::LastMonth(_)) => (false, Some("last month".to_string())),
                _ => (false, Some("recently".to_string())),
            };
            results.push(UserPresence {
                user_id: u.id,
                online,
                last_seen,
            });
        }
    }

    Ok(results)
}

// ========================
// ADVANCED MESSAGE MANAGEMENT
// ========================

#[derive(Clone, serde::Serialize)]
pub struct ForwardTarget {
    pub id: i64,
    pub name: String,
    pub photo_url: Option<String>,
    pub is_channel: bool,
    pub is_supergroup: bool,
}

#[derive(Clone, serde::Serialize)]
pub struct PinnedMessageInfo {
    pub message_id: i32,
    pub text: String,
    pub sender_name: String,
    pub date: String,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct StarredMessage {
    pub chat_id: i64,
    pub message_id: i32,
    pub chat_name: String,
    pub text: String,
    pub sender_name: String,
    pub date: String,
    pub starred_at: String,
}

#[tauri::command]
pub async fn cmd_unpin_team_message(
    team_id: Option<i64>,
    message_id: i32,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    // Only admins and owners can unpin
    if let Some(tid) = team_id {
        require_admin_or_owner(&client, tid, &state.peer_cache)
            .await
            .map_err(|_| "Only admins can unpin messages.".to_string())?;
    }

    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;
    let input_peer = resolve_input_peer(&peer)?;

    log::info!(
        "[cmd_unpin_team_message] team_id={:?} message_id={}",
        team_id, message_id
    );

    client
        .invoke(&tl::functions::messages::UpdatePinnedMessage {
            silent: false,
            unpin: true,
            pm_oneside: false,
            peer: input_peer,
            id: message_id,
        })
        .await
        .map_err(|e| {
            let msg = format!("Failed to unpin message: {}", e);
            log::error!("[cmd_unpin_team_message] ERROR: {}", msg);
            msg
        })?;

    log::info!("[cmd_unpin_team_message] Success");
    Ok(true)
}

#[tauri::command]
pub async fn cmd_get_pinned_messages(
    team_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<Vec<PinnedMessageInfo>, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();
    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;
    let input_peer = resolve_input_peer(&peer)?;

    let result = client
        .invoke(&tl::functions::messages::Search {
            peer: input_peer,
            q: String::new(),
            from_id: None,
            saved_peer_id: None,
            saved_reaction: None,
            top_msg_id: None,
            filter: tl::enums::MessagesFilter::InputMessagesFilterPinned,
            min_date: 0,
            max_date: 0,
            offset_id: 0,
            add_offset: 0,
            limit: 50,
            max_id: 0,
            min_id: 0,
            hash: 0,
        })
        .await
        .map_err(|e| format!("Failed to get pinned messages: {}", e))?;

    let messages_vec = match result {
        tl::enums::messages::Messages::Messages(m) => m.messages,
        tl::enums::messages::Messages::Slice(s) => s.messages,
        tl::enums::messages::Messages::ChannelMessages(c) => c.messages,
        _ => Vec::new(),
    };

    let mut pinned = Vec::new();
    for msg_enum in messages_vec {
        if let tl::enums::Message::Message(msg) = msg_enum {
            let sender_name = if let Some(ref from_id) = msg.from_id {
                match from_id {
                    tl::enums::Peer::User(u) => {
                        get_user_display_name(&client, u.user_id, &state.peer_cache).await
                    }
                    _ => "Unknown".to_string(),
                }
            } else {
                "Unknown".to_string()
            };
            pinned.push(PinnedMessageInfo {
                message_id: msg.id,
                text: msg.message.clone(),
                sender_name,
                date: chrono::DateTime::from_timestamp(msg.date as i64, 0)
                    .map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string())
                    .unwrap_or_default(),
            });
        }
    }

    Ok(pinned)
}

#[tauri::command]
pub async fn cmd_get_forward_targets(
    state: State<'_, TelegramState>,
) -> Result<Vec<ForwardTarget>, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();

    let mut dialogs = client.iter_dialogs();
    let mut targets = Vec::new();
    while let Some(dialog) = dialogs.next().await.map_err(map_error)? {
        let peer = &dialog.peer;
        let (id, name, is_channel, is_supergroup) = match peer {
            Peer::User(u) => (u.raw.id(), u.full_name(), false, false),
            Peer::Group(g) => {
                let name = match &g.raw {
                    tl::enums::Chat::Chat(c) => c.title.clone(),
                    tl::enums::Chat::Forbidden(f) => f.title.clone(),
                    _ => "Unknown".to_string(),
                };
                (g.raw.id(), name, false, false)
            }
            Peer::Channel(c) => {
                let is_ch = c.raw.broadcast;
                (c.raw.id, c.raw.title.clone(), is_ch, !is_ch)
            }
        };
        targets.push(ForwardTarget {
            id,
            name,
            photo_url: None,
            is_channel,
            is_supergroup,
        });
    }

    Ok(targets)
}

#[tauri::command]
pub async fn cmd_forward_messages(
    from_chat_id: Option<i64>,
    message_ids: Vec<i32>,
    to_chat_ids: Vec<i64>,
    send_copy: bool,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();

    let from_peer = resolve_peer(&client, from_chat_id, &state.peer_cache).await?;
    let from_input_peer = resolve_input_peer(&from_peer)?;

    log::info!(
        "[cmd_forward_messages] from={:?} msgs={} targets={} send_copy={}",
        from_chat_id, message_ids.len(), to_chat_ids.len(), send_copy
    );

    for &to_id in &to_chat_ids {
        let to_peer = resolve_peer(&client, Some(to_id), &state.peer_cache).await?;
        let to_input_peer = resolve_input_peer(&to_peer)?;

        let random_ids: Vec<i64> = message_ids.iter().map(|_| rand::random::<i64>()).collect();

        client
            .invoke(&tl::functions::messages::ForwardMessages {
                silent: false,
                background: false,
                with_my_score: false,
                drop_author: false,
                drop_media_captions: !send_copy,
                noforwards: false,
                allow_paid_floodskip: false,
                from_peer: from_input_peer.clone(),
                id: message_ids.clone(),
                random_id: random_ids,
                to_peer: to_input_peer,
                top_msg_id: None,
                reply_to: None,
                schedule_date: None,
                schedule_repeat_period: None,
                send_as: None,
                quick_reply_shortcut: None,
                video_timestamp: None,
                allow_paid_stars: None,
                suggested_post: None,
            })
            .await
            .map_err(|e| format!("Failed to forward to chat {}: {}", to_id, e))?;

        log::info!("[cmd_forward_messages] Forwarded to {} successfully", to_id);
    }

    Ok(true)
}

// ========================
// INVITE LINK HANDLING
// ========================

/// Information about a group that can be joined via an invite link.
#[derive(Clone, serde::Serialize)]
pub struct InviteGroupInfo {
    pub group_name: String,
    pub member_count: i32,
    pub is_channel: bool,
    pub is_supergroup: bool,
    /// The raw hash extracted from the invite link (e.g. "abc123" from t.me/+abc123)
    pub invite_hash: String,
}

/// Extract the invite hash from a `t.me/+xxx`, `tgguild://join/xxx`, or `https://invite.tgguild.app/join/xxx` URL.
fn extract_invite_hash(url: &str) -> Option<String> {
    let url = url.trim();

    // tgguild://join/<hash>
    if let Some(rest) = url.strip_prefix("tgguild://join/") {
        let hash = rest.split('?').next().unwrap_or(rest).trim_end_matches('/');
        if !hash.is_empty() {
            return Some(hash.to_string());
        }
    }

    // https://invite.tgguild.app/join/<hash>
    if let Some(rest) = url.strip_prefix("https://invite.tgguild.app/join/") {
        let hash = rest.split('?').next().unwrap_or(rest).trim_end_matches('/');
        if !hash.is_empty() {
            return Some(hash.to_string());
        }
    }

    // https://t.me/+<hash> or t.me/+<hash>
    let cleaned = url
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    if let Some(rest) = cleaned.strip_prefix("t.me/+") {
        let hash = rest.split('?').next().unwrap_or(rest).trim_end_matches('/');
        if !hash.is_empty() {
            return Some(hash.to_string());
        }
    }

    None
}

/// Resolve an invite link and return group preview information without joining.
#[tauri::command]
pub async fn cmd_resolve_invite_link(
    url: String,
    state: State<'_, TelegramState>,
) -> Result<InviteGroupInfo, String> {
    let hash = extract_invite_hash(&url)
        .ok_or_else(|| format!("Invalid invite URL: {}", url))?;

    let client_opt = state.client.lock().await.clone();
    let client = client_opt.ok_or("Not connected")?;

    let result = client
        .invoke(&tl::functions::messages::CheckChatInvite {
            hash: hash.clone(),
        })
        .await
        .map_err(|e| format!("Failed to resolve invite link: {}", e))?;

    match result {
        tl::enums::ChatInvite::Already(already) => {
            // User is already a member
            let (name, member_count, is_channel, is_supergroup) = match &already.chat {
                tl::enums::Chat::Chat(c) => (c.title.clone(), c.participants_count, false, false),
                tl::enums::Chat::Channel(c) => (
                    c.title.clone(),
                    c.participants_count.unwrap_or(0),
                    c.broadcast,
                    c.megagroup,
                ),
                _ => ("Unknown Group".to_string(), 0, false, false),
            };
            Ok(InviteGroupInfo {
                group_name: name,
                member_count,
                is_channel,
                is_supergroup,
                invite_hash: hash,
            })
        }
        tl::enums::ChatInvite::Invite(invite) => {
            Ok(InviteGroupInfo {
                group_name: invite.title.clone(),
                member_count: invite.participants_count,
                is_channel: invite.channel,
                is_supergroup: invite.megagroup,
                invite_hash: hash,
            })
        }
        tl::enums::ChatInvite::Peek(peek) => {
            let (name, member_count, is_channel, is_supergroup) = match &peek.chat {
                tl::enums::Chat::Chat(c) => (c.title.clone(), c.participants_count, false, false),
                tl::enums::Chat::Channel(c) => (
                    c.title.clone(),
                    c.participants_count.unwrap_or(0),
                    c.broadcast,
                    c.megagroup,
                ),
                _ => ("Unknown Group".to_string(), 0, false, false),
            };
            Ok(InviteGroupInfo {
                group_name: name,
                member_count,
                is_channel,
                is_supergroup,
                invite_hash: hash,
            })
        }
    }
}

/// Join a group using an invite link hash. Returns the numeric group ID on success.
#[tauri::command]
pub async fn cmd_join_group_by_invite(
    invite_hash: String,
    state: State<'_, TelegramState>,
) -> Result<i64, String> {
    let client_opt = state.client.lock().await.clone();
    let client = client_opt.ok_or("Not connected")?;

    let result = client
        .invoke(&tl::functions::messages::ImportChatInvite {
            hash: invite_hash.clone(),
        })
        .await
        .map_err(|e| format!("Failed to join group: {}", e))?;

    // Extract the group/channel ID from the updates
    let chat_id = match &result {
        tl::enums::Updates::Updates(u) => {
            u.chats.first().map(|chat| match chat {
                tl::enums::Chat::Chat(c) => c.id,
                tl::enums::Chat::Channel(c) => c.id,
                _ => 0,
            })
        }
        _ => None,
    };

    // Re-populate peer cache for the joined group so subsequent commands can use it
    if let Some(id) = chat_id {
        if let tl::enums::Updates::Updates(u) = &result {
            if let Some(chat) = u.chats.first() {
                let peer = match chat {
                    tl::enums::Chat::Chat(_) => {
                        resolve_peer(&client, Some(id), &state.peer_cache).await.ok()
                    }
                    tl::enums::Chat::Channel(_) => {
                        resolve_peer(&client, Some(id), &state.peer_cache).await.ok()
                    }
                    _ => None,
                };
                // peer_cache is updated inside resolve_peer; nothing more needed
                let _ = peer;
            }
        }
    }

    Ok(chat_id.unwrap_or(0))
}

/// Convert a Telegram t.me/+xxx invite link to the TGGuild deep link format.
#[tauri::command]
pub fn cmd_to_tgguild_invite_link(telegram_link: String) -> Result<String, String> {
    let hash = extract_invite_hash(&telegram_link)
        .ok_or_else(|| format!("Not a recognized invite link: {}", telegram_link))?;
    Ok(format!("tgguild://join/{}", hash))
}

/// Generate a TGGuild invite link for a group (creates a new Telegram invite and converts it).
#[tauri::command]
pub async fn cmd_get_tgguild_invite_link(
    team_id: i64,
    state: State<'_, TelegramState>,
) -> Result<String, String> {
    let client_opt = state.client.lock().await.clone();
    let client = client_opt.ok_or("Not connected")?;

    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;
    let input_peer = peer_to_input_peer(&peer)?;

    let exported = client
        .invoke(&tl::functions::messages::ExportChatInvite {
            legacy_revoke_permanent: false,
            request_needed: false,
            peer: input_peer,
            expire_date: None,
            usage_limit: None,
            title: Some("TgGuild invite".to_string()),
            subscription_pricing: None,
        })
        .await
        .map_err(|e| format!("Failed to create invite link: {}", e))?;

    let telegram_link = match exported {
        tl::enums::ExportedChatInvite::ChatInviteExported(invite) => invite.link,
        tl::enums::ExportedChatInvite::ChatInvitePublicJoinRequests => {
            return Err("Group requires join approval.".to_string());
        }
    };

    let hash = extract_invite_hash(&telegram_link)
        .ok_or_else(|| format!("Unexpected invite link format: {}", telegram_link))?;

    Ok(format!("tgguild://join/{}", hash))
}

fn star_file_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    path.push("starred_messages.json");
    path
}

fn load_starred(path: &std::path::Path) -> Vec<StarredMessage> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
        .unwrap_or_default()
}

fn save_starred(path: &std::path::Path, starred: &[StarredMessage]) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(data) = serde_json::to_string_pretty(starred) {
        let _ = std::fs::write(path, data);
    }
}

#[tauri::command]
pub async fn cmd_star_message(
    chat_id: i64,
    message_id: i32,
    text: Option<String>,
    sender_name: Option<String>,
    date: Option<String>,
    chat_name: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<bool, String> {
    let path = star_file_path(&app_handle);
    let mut starred = load_starred(&path);

    if !starred
        .iter()
        .any(|s| s.chat_id == chat_id && s.message_id == message_id)
    {
        starred.push(StarredMessage {
            chat_id,
            message_id,
            chat_name: chat_name.unwrap_or_default(),
            text: text.unwrap_or_default(),
            sender_name: sender_name.unwrap_or_default(),
            date: date.unwrap_or_default(),
            starred_at: chrono::Utc::now()
                .format("%Y-%m-%d %H:%M:%S")
                .to_string(),
        });
        save_starred(&path, &starred);
    }
    log::info!("[cmd_star_message] chat_id={} message_id={}", chat_id, message_id);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_unstar_message(
    chat_id: i64,
    message_id: i32,
    app_handle: tauri::AppHandle,
) -> Result<bool, String> {
    let path = star_file_path(&app_handle);
    let mut starred = load_starred(&path);
    starred.retain(|s| !(s.chat_id == chat_id && s.message_id == message_id));
    save_starred(&path, &starred);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_get_starred_messages(
    app_handle: tauri::AppHandle,
) -> Result<Vec<StarredMessage>, String> {
    let path = star_file_path(&app_handle);
    Ok(load_starred(&path))
}

#[tauri::command]
pub async fn cmd_is_message_starred(
    chat_id: i64,
    message_id: i32,
    app_handle: tauri::AppHandle,
) -> Result<bool, String> {
    let path = star_file_path(&app_handle);
    let starred = load_starred(&path);
    Ok(starred
        .iter()
        .any(|s| s.chat_id == chat_id && s.message_id == message_id))
}
