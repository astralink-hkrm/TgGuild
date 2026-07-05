use grammers_client::types::{LoginToken, PasswordToken, Peer};
use grammers_client::Client;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone, serde::Serialize)]
pub struct TypingEntry {
    pub user_id: i64,
    pub user_name: String,
    pub action: String,
    pub last_updated: i64,
}

/// Holds pre-classified dialog data from a single `iter_dialogs()` pass.
/// Populated and read by the three workspace commands so they share one traversal.
#[derive(Clone, Default)]
pub struct DialogCache {
    pub folders: Vec<crate::models::FolderMetadata>,
    pub teams: Vec<crate::commands::teams::TeamInfo>,
    pub direct_chats: Vec<crate::commands::teams::DirectChatInfo>,
}

/// Tracks the lifecycle of the Telegram connection
///
/// IMPORTANT: The `runner_shutdown` field is critical for preventing stack overflow.
/// When reconnecting, we MUST shutdown the old runner before spawning a new one.
/// Without this, runner tasks accumulate and exhaust the thread stack.
#[derive(Clone)]
pub struct TelegramState {
    pub client: Arc<Mutex<Option<Client>>>,
    pub login_token: Arc<Mutex<Option<LoginToken>>>,
    pub password_token: Arc<Mutex<Option<PasswordToken>>>,
    pub api_id: Arc<Mutex<Option<i32>>>,
    /// Send to this channel to request runner shutdown.
    /// Uses std::sync::Mutex (not tokio) so it can be locked from synchronous
    /// contexts like the RunEvent::Exit handler.
    pub runner_shutdown: Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    /// Counter for debugging runner lifecycle
    pub runner_count: Arc<std::sync::atomic::AtomicU32>,
    /// Cache of folder_id → Peer to avoid O(N) dialog scanning on every operation.
    /// Populated lazily on first resolve_peer call, eagerly during cmd_scan_folders.
    /// Cleared on logout.
    pub peer_cache: Arc<tokio::sync::RwLock<HashMap<i64, Peer>>>,
    /// Set of transfer IDs that have been cancelled. Checked cooperatively
    /// in upload/download chunk loops. Cleared on logout.
    pub cancelled_transfers: Arc<tokio::sync::RwLock<HashSet<String>>>,
    /// In-memory store for typing indicators keyed by peer_key -> user_id -> TypingEntry.
    /// Used for cross-client typing indicator sharing.
    pub typing_store: Arc<tokio::sync::Mutex<HashMap<String, HashMap<String, TypingEntry>>>>,
    /// Shared, lazily-populated dialog cache. All three workspace commands
    /// (cmd_scan_folders, cmd_get_teams, cmd_get_direct_chats) populate and read
    /// from this cache so dialogs are only traversed once per refresh cycle.
    pub dialog_cache: Arc<tokio::sync::RwLock<Option<DialogCache>>>,
}

pub mod auth;
pub mod fs;
pub mod password;
pub mod google;
pub mod network;
pub mod preview;
pub mod streaming;
pub mod teams;
pub mod utils;

pub use auth::*;
pub use fs::*;
pub use password::*;
pub use google::*;
pub use network::*;
pub use preview::*;
pub use streaming::*;
pub use teams::*;
pub use utils::*;
