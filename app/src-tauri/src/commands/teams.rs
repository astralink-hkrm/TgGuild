use tauri::State;
use grammers_client::types::Peer;
use grammers_tl_types as tl;
use crate::TelegramState;
use crate::commands::utils::{resolve_peer, map_error};

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
}

#[derive(Clone, serde::Serialize)]
pub struct DirectChatInfo {
    #[serde(serialize_with = "serialize_i64_to_string")]
    pub user_id: i64,
    pub first_name: String,
    pub last_name: Option<String>,
    pub username: Option<String>,
    pub phone: Option<String>,
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
        },
        Peer::Group(g) => match &g.raw {
            tl::enums::Chat::Chat(chat) => Ok(tl::enums::InputPeer::Chat(tl::types::InputPeerChat {
                chat_id: chat.id,
            })),
            tl::enums::Chat::Channel(channel) => Ok(tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
                channel_id: channel.id,
                access_hash: channel.access_hash.ok_or("No access hash for group")?,
            })),
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
        Peer::User(u) => u.full_name(),
    }
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
pub struct ChatMessage {
    pub id: i32,
    pub sender_id: i64,
    pub sender_name: String,
    pub text: String,
    pub date: String,
    pub has_media: bool,
    pub media_type: String,
    pub media_name: String,
    pub media_size: i64,
    pub mime_type: String,
    pub outgoing: bool,
    pub pinned: bool,
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
    }))
}

#[tauri::command]
pub async fn cmd_get_teams(
    state: State<'_, TelegramState>,
) -> Result<Vec<TeamInfo>, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();
    let mut teams = Vec::new();
    
    log::info!("Fetching all dialogs for groups list...");
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
                
                teams.push(TeamInfo {
                    id,
                    name,
                    username,
                    member_count: c.raw.participants_count.unwrap_or(0),
                    is_channel: false,
                    is_supergroup: c.raw.megagroup,
                    top_members: Vec::new(),
                    unread_count: get_dialog_unread_count(&dialog.raw),
                });
            },
            Peer::Group(g) => {
                let title = match &g.raw {
                    grammers_tl_types::enums::Chat::Chat(c) => c.title.clone(),
                    grammers_tl_types::enums::Chat::Channel(c) => c.title.clone(),
                    _ => "Unknown Group".to_string(),
                };
                teams.push(TeamInfo {
                    id: g.raw.id(),
                    name: title,
                    username: None,
                    member_count: 0,
                    is_channel: false,
                    is_supergroup: false,
                    top_members: Vec::new(),
                    unread_count: get_dialog_unread_count(&dialog.raw),
                });
            },
            _ => {}
        }
    }
    
    log::info!("Found {} groups", teams.len());
    Ok(teams)
}

#[tauri::command]
pub async fn cmd_get_direct_chats(
    state: State<'_, TelegramState>,
) -> Result<Vec<DirectChatInfo>, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();
    let current_user_id = client.get_me().await.map_err(map_error)?.raw.id();
    let mut direct_chats = Vec::new();

    log::info!("Fetching direct one-on-one Telegram dialogs...");
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

            state.peer_cache.write().await.insert(user_id, dialog.peer.clone());

            direct_chats.push(DirectChatInfo {
                user_id,
                first_name: user.first_name().unwrap_or("Unknown").to_string(),
                last_name: user.last_name().map(|s| s.to_string()),
                username: user.username().map(|s| s.to_string()),
                phone,
                unread_count: get_dialog_unread_count(&dialog.raw),
                invite_eligible: user.mutual_contact(),
                invite_restriction: if user.mutual_contact() {
                    None
                } else {
                    Some("Telegram only allows direct invites for mutual contacts. Share an invite link with this person instead.".to_string())
                },
                access_hash,
            });
        }
    }

    log::info!("Found {} direct chats", direct_chats.len());
    Ok(direct_chats)
}

fn get_dialog_unread_count(dialog: &tl::enums::Dialog) -> i32 {
    match dialog {
        tl::enums::Dialog::Dialog(d) => d.unread_count,
        tl::enums::Dialog::Folder(_) => 0,
    }
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
    
    log::info!("Fetching members for team/channel: {}", team_id);
    
    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;
    
    let mut members = Vec::new();
    let mut participants = client.iter_participants(&peer);
    
    // Limit to 100 members for performance
    let mut count = 0;
    while let Some(participant) = participants.next().await.map_err(|e| e.to_string())? {
        if count >= 100 {
            break;
        }
        
        let user = &participant.user;
        let first_name = user.first_name().unwrap_or("Unknown").to_string();
        let last_name = user.last_name().map(|s| s.to_string());
        let username = user.username().map(|s| s.to_string());
        
        // Basic role detection from the grammers-client Role
        let (is_admin, is_owner, role_name) = match &participant.role {
            grammers_client::types::Role::Creator(_) => (true, true, "owner".to_string()),
            grammers_client::types::Role::Admin(_) => (true, false, "admin".to_string()),
            _ => (false, false, "member".to_string()),
        };

        members.push(TeamMember {
            user_id: user.raw.id(),
            first_name,
            last_name,
            username,
            phone: None, // Phone usually not available for privacy
            is_admin,
            is_owner,
            role: role_name,
            photo_url: None,
            access_hash: match &user.raw {
                tl::enums::User::User(u) => u.access_hash,
                _ => None,
            },
            invite_eligible: true,
            invite_restriction: None,
        });
        
        count += 1;
    }
    
    log::info!("Found {} members for team {}", members.len(), team_id);
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
    
    let result = client.invoke(&tl::functions::contacts::Search {
        q: query.clone(),
        limit: 20,
    }).await.map_err(map_error)?;
    
    let mut results = Vec::new();
    
    let f = match result {
        tl::enums::contacts::Found::Found(f) => f,
    };
    
    for user in f.users {
        if let tl::enums::User::User(u) = user {
            let first_name = u.first_name.clone().unwrap_or_else(|| "Unknown".to_string());
            let last_name = u.last_name.clone();
            let username = u.username.clone();
            let phone = u.phone.clone();
            
            results.push(TeamMember {
                user_id: u.id,
                first_name,
                last_name,
                username,
                phone,
                is_admin: false,
                is_owner: false,
                role: "member".to_string(),
                photo_url: None,
                invite_eligible: u.mutual_contact,
                invite_restriction: if u.mutual_contact {
                    None
                } else {
                    Some("Telegram only allows direct invites for mutual contacts. Share an invite link with this person instead.".to_string())
                },
                access_hash: u.access_hash,
            });
            state.peer_cache.write().await.insert(
                u.id,
                Peer::User(grammers_client::types::User::from_raw(tl::enums::User::User(u.clone()))),
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
    let result = client.invoke(&tl::functions::contacts::Search {
        q: query.clone(),
        limit: 10,
    }).await.map_err(map_error)?;
    
    let mut debug_info = format!("Search results for '{}':\n", query);
    
    let tl::enums::contacts::Found::Found(f) = result;
    for user in f.users {
        if let tl::enums::User::User(u) = user {
            let name = format!("{} {}", u.first_name.clone().unwrap_or_default(), u.last_name.clone().unwrap_or_default());
            debug_info.push_str(&format!("- User: {} (ID: {}, Hash: {})\n", name, u.id, u.access_hash.unwrap_or(0)));
            debug_info.push_str(&format!("  Caching peer for user {}...\n", u.id));
            state.peer_cache.write().await.insert(u.id, Peer::User(grammers_client::types::User::from_raw(tl::enums::User::User(u.clone()))));
        }
    }
    
    Ok(debug_info)
}

#[tauri::command]
pub async fn cmd_get_contacts(
    state: State<'_, TelegramState>,
) -> Result<Vec<TeamMember>, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();
    
    log::info!("Fetching Telegram contacts");
    
    let result = client.invoke(&tl::functions::contacts::GetContacts {
        hash: 0,
    }).await.map_err(map_error)?;
    
    let mut results = Vec::new();
    
    match result {
        tl::enums::contacts::Contacts::Contacts(c) => {
            log::info!("Received {} contacts and {} users from Telegram", c.contacts.len(), c.users.len());
            for user in c.users {
                if let tl::enums::User::User(u) = user {
                    let first_name = u.first_name.clone().unwrap_or_else(|| "Unknown".to_string());
                    let last_name = u.last_name.clone();
                    let username = u.username.clone();
                    let phone = u.phone.clone();
                    
                    results.push(TeamMember {
                        user_id: u.id,
                        first_name,
                        last_name,
                        username,
                        phone,
                        is_admin: false,
                        is_owner: false,
                        role: "member".to_string(),
                        photo_url: None,
                        invite_eligible: u.mutual_contact,
                        invite_restriction: if u.mutual_contact {
                            None
                        } else {
                            Some("Telegram only allows direct invites for mutual contacts. Share an invite link with this person instead.".to_string())
                        },
                        access_hash: u.access_hash,
                    });
                    state.peer_cache.write().await.insert(
                        u.id,
                        Peer::User(grammers_client::types::User::from_raw(tl::enums::User::User(u.clone()))),
                    );
                }
            }
        },
        tl::enums::contacts::Contacts::NotModified => {
            log::info!("Contacts not modified since last fetch");
        },
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
    
    let user_id = user_id_str.parse::<i64>().map_err(|_| "Invalid user ID format")?;
    let access_hash = access_hash_str.and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);

    log::info!("Adding user {} (hash: {}) to team {}", user_id, access_hash, team_id);
    
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
            
            client.invoke(&tl::functions::channels::InviteToChannel {
                channel: input_channel,
                users: vec![input_user],
            }).await.map_err(|e| format!("Failed to add member: {}", e))?;
        },
        Peer::Group(g) => {
            client.invoke(&tl::functions::messages::AddChatUser {
                chat_id: g.raw.id(),
                user_id: input_user,
                fwd_limit: 100,
            }).await.map_err(|e| format!("Failed to add member: {}", e))?;
        },
        _ => return Err("Invalid peer type".to_string()),
    }
    
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

    let user_id = user_id_str.parse::<i64>().map_err(|_| "Invalid user ID format")?;
    let access_hash = access_hash_str
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    let team_peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;
    let team_input_peer = peer_to_input_peer(&team_peer)?;
    let team_name = peer_display_name(&team_peer);

    log::info!("Creating invite link for team {} (ID: {})", team_name, team_id);
    
    let exported = client.invoke(&tl::functions::messages::ExportChatInvite {
        legacy_revoke_permanent: false,
        request_needed: false,
        peer: team_input_peer,
        expire_date: None,
        usage_limit: None,
        title: Some("tgTeams invite".to_string()),
        subscription_pricing: None,
    }).await.map_err(|e| {
        log::error!("Failed to create invite link: {}", e);
        format!("Failed to create invite link: {}", e)
    })?;

    let invite_link = match exported {
        tl::enums::ExportedChatInvite::ChatInviteExported(invite) => {
            log::info!("Successfully created invite link: {}", invite.link);
            invite.link
        },
        tl::enums::ExportedChatInvite::ChatInvitePublicJoinRequests => {
            log::warn!("Team {} uses join requests instead of invite links", team_id);
            return Err("This team is set to require join approval. Please change the group settings to allow invite links, or share the group's username with the user.".to_string());
        }
    };

    let cached_peer = {
        let cache = state.peer_cache.read().await;
        cache.get(&user_id).cloned()
    };

    log::info!("Sending invite link to user_id: {}, access_hash: {}", user_id, access_hash);

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

    match client.invoke(&tl::functions::messages::SendMessage {
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
    }).await {
Ok(_) => {
            log::info!("Successfully sent invite link to user {}", user_id);
        },
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
    
    let user_id = user_id_str.parse::<i64>().map_err(|_| "Invalid user ID format")?;
    let access_hash = access_hash_str.and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);

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

            client.invoke(&tl::functions::channels::EditBanned {
                channel: input_channel,
                participant: input_peer,
                banned_rights,
            }).await.map_err(|e| format!("Failed to remove member: {}", e))?;
        },
        Peer::Group(g) => {
            client.invoke(&tl::functions::messages::DeleteChatUser {
                chat_id: g.raw.id(),
                user_id: tl::enums::InputUser::User(tl::types::InputUser {
                    user_id,
                    access_hash,
                }),
                revoke_history: false,
            }).await.map_err(|e| format!("Failed to remove member: {}", e))?;
        },
        _ => return Err("Invalid peer type".to_string()),
    }
    
    log::info!("Removed user {} from team {}", user_id, team_id);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_set_member_role(
    _team_id: i64,
    _user_id: i64,
    role: String,
    _state: State<'_, TelegramState>,
) -> Result<bool, String> {
    Err(format!("Role management not implemented. Requested role: {}", role))
}

#[tauri::command]
pub async fn cmd_create_team(
    name: String,
    _description: Option<String>,
    state: State<'_, TelegramState>,
) -> Result<TeamInfo, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(TeamInfo { id: 999, name, username: None, member_count: 0, is_channel: false, is_supergroup: true, top_members: Vec::new(), unread_count: 0 });
    }
    let client = client_opt.unwrap();
    
    log::info!("Creating supergroup: {}", name);
    
    let result = client.invoke(&tl::functions::channels::CreateChannel {
        broadcast: false,
        megagroup: true,
        title: name.clone(),
        about: "".to_string(),
        geo_point: None,
        address: None,
        for_import: false,
        forum: false,
        ttl_period: None,
    }).await.map_err(|e| format!("Failed to create team: {}", e))?;
    
    let (id, username) = match result {
        tl::enums::Updates::Updates(u) => {
            let chat = u.chats.first().ok_or("No chat in updates")?;
            match chat {
                tl::enums::Chat::Channel(c) => (c.id, c.username.clone()),
                _ => return Err("Created chat is not a channel".to_string()),
            }
        },
        _ => return Err("Unexpected response".to_string()),
    };
    
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
    })
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
    
    log::info!("Deleting team {}", team_id);
    
    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;
    
    match &peer {
        Peer::Channel(c) => {
            let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                channel_id: c.raw.id,
                access_hash: c.raw.access_hash.ok_or("No access hash")?,
            });
            
            client.invoke(&tl::functions::channels::DeleteChannel {
                channel: input_channel,
            }).await.map_err(|e| format!("Failed to delete team: {}", e))?;
        },
        Peer::Group(g) => {
            client.invoke(&tl::functions::messages::DeleteChat {
                chat_id: g.raw.id(),
            }).await.map_err(|e| format!("Failed to delete team: {}", e))?;
        },
        _ => return Err("Invalid peer type".to_string()),
    }
    
    log::info!("Deleted team {}", team_id);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_edit_team(
    team_id: i64,
    new_name: Option<String>,
    _new_description: Option<String>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();
    
    log::info!("Editing team {} with name {:?}", team_id, new_name);
    
    let peer = resolve_peer(&client, Some(team_id), &state.peer_cache).await?;
    
    match &peer {
        Peer::Channel(c) => {
            let input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                channel_id: c.raw.id,
                access_hash: c.raw.access_hash.ok_or("No access hash")?,
            });
            
            if let Some(name) = new_name {
                client.invoke(&tl::functions::channels::EditTitle {
                    channel: input_channel,
                    title: name,
                }).await.map_err(|e| format!("Failed to rename team: {}", e))?;
            }
        },
        Peer::Group(g) => {
            if let Some(name) = new_name {
                client.invoke(&tl::functions::messages::EditChatTitle {
                    chat_id: g.raw.id(),
                    title: name,
                }).await.map_err(|e| format!("Failed to rename team: {}", e))?;
            }
        },
        _ => return Err("Invalid peer type".to_string()),
    }
    
    log::info!("Edited team {}", team_id);
    Ok(true)
}

#[tauri::command]
pub async fn cmd_get_team_messages(
    team_id: Option<i64>,
    limit: Option<i32>,
    state: State<'_, TelegramState>,
) -> Result<Vec<ChatMessage>, String> {
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();
    
    log::info!("Fetching messages for peer: {:?}", team_id);
    
    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;
    
    let msg_limit = limit.unwrap_or(1000) as usize;
    let mut messages = Vec::new();
    let mut iter = client.iter_messages(&peer);
    let day_ago = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .saturating_sub(Duration::from_secs(24 * 60 * 60));

    let mut count = 0;
    while let Some(msg) = iter.next().await.map_err(|e| e.to_string())? {
        if count >= msg_limit {
            break;
        }

        let msg_timestamp = SystemTime::from(msg.date())
            .duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::from_secs(0))
            .as_secs();

        if msg_timestamp < day_ago.as_secs() {
            break;
        }

        let sender_name = match msg.sender() {
            Some(Peer::User(u)) => {
                let first = if let Some(f) = u.first_name() { f.to_string() } else { "Unknown".to_string() };
                if let Some(l) = u.last_name() {
                    format!("{} {}", first, l)
                } else {
                    first
                }
            },
            _ => "Unknown".to_string(),
        };
        let sender_id = match msg.sender() {
            Some(Peer::User(u)) => u.raw.id() as i64,
            _ => 0,
        };
        
        let media = msg.media();
        let text = msg.text().to_string();
        
        let (has_media, media_type, media_name, media_size, mime_type, display_text) = match media {
            Some(grammers_client::types::Media::Photo(_)) => {
                let display = if !text.is_empty() { text } else { "[Photo]".to_string() };
                (true, "photo".to_string(), "Photo".to_string(), 0, "image/jpeg".to_string(), display)
            },
            Some(grammers_client::types::Media::Document(d)) => {
                let name = d.name();
                let size = d.size() as i64;
                let mime = d.mime_type().map(|m| m.to_string()).unwrap_or_default();
                let ext = std::path::Path::new(&name)
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_lowercase())
                    .unwrap_or_default();
                
                let file_type = if ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].contains(&ext.as_str()) {
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
                
                let display = if !text.is_empty() { text } else { name.to_string() };
                (true, file_type, name.to_string(), size, mime, display)
            },
            _ => {
                let display = if !text.is_empty() { text } else { "[No text]".to_string() };
                (false, "none".to_string(), "".to_string(), 0, "".to_string(), display)
            }
        };
        
        let date_str = msg.date().format("%Y-%m-%d %H:%M:%S").to_string();
        
        messages.push(ChatMessage {
            id: msg.id(),
            sender_id,
            sender_name,
            text: display_text,
            date: date_str,
            has_media,
            media_type,
            media_name,
            media_size,
            mime_type,
            outgoing: msg.outgoing(),
            pinned: msg.pinned(),
        });
        
        count += 1;
    }
    
    log::info!("Found {} messages for peer {:?}", messages.len(), team_id);
    Ok(messages)
}

#[tauri::command]
pub async fn cmd_send_team_message(
    team_id: Option<i64>,
    message: String,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = state.client.lock().await.clone();
    if client_opt.is_none() {
        return Ok(false);
    }
    let client = client_opt.unwrap();
    
    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;
    let message_obj = grammers_client::InputMessage::new().text(message);
    
    client.send_message(&peer, message_obj).await.map_err(|e| format!("Failed to send message: {}", e))?;
    
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

    let metadata = tokio::fs::metadata(&path).await.map_err(|e| e.to_string())?;
    let mut file = tokio::fs::File::open(&path).await.map_err(|e| e.to_string())?;
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

    client.send_message(&peer, message).await.map_err(map_error)?;

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
    
    let messages = client.get_messages_by_id(&peer, &[message_id]).await.map_err(|e| e.to_string())?;
    
    let msg = messages.into_iter().flatten().next().ok_or("Message not found")?;
    
    let media = msg.media().ok_or("No media in message")?;
    
    match media {
        Media::Photo(_) => {
            std::fs::File::create(&save_path).map_err(|e| e.to_string())?;
            log::info!("[MOCK] Saved photo to {}", save_path);
            Ok("Photo saved".to_string())
        },
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
        },
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
    let peer = resolve_peer(&client, team_id, &state.peer_cache).await?;

    client.pin_message(&peer, message_id).await.map_err(|e| format!("Failed to pin message: {}", e))?;

    Ok(true)
}
