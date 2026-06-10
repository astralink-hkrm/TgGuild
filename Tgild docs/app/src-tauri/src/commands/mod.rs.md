# `app/src-tauri/src/commands/mod.rs` — Commands Module

- **Purpose**: Module declarations + shared `TelegramState` definition
- **Module declarations**: `pub mod auth; pub mod fs; pub mod teams; pub mod preview; pub mod streaming; pub mod network; pub mod utils;`
- **`TelegramState` struct** (shared via `Arc<Mutex<Option<TelegramState>>>`):
  - `client: Option<grammers_client::Client>` — MTProto client
  - `login_token: Option<String>` — intermediate auth token
  - `password_token: Option<grammers_tl_types::account::Password>` — 2FA context
  - `api_id: i32` — Telegram API ID
  - `sessions_path: PathBuf` — path to session files
  - `runner_shutdown: Option<tokio::sync::oneshot::Sender<()>>` — signal to stop network runner
  - `runner_count: u32` — counter for runner instances (for diagnostics)
  - `peer_cache: HashMap<i64, grammers_tl_types::enums::Peer>` — cached peer resolution
  - `cancelled_transfers: Arc<Mutex<HashSet<String>>>` — cancelled upload/download tracking
- **Purpose of `TelegramState`**: Single source of truth for all Telegram interaction, shared across all command handlers
