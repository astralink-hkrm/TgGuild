# `app/src-tauri/src/commands/utils.rs` — Peer Resolution Helpers

- **Purpose**: Resolves folder IDs to Telegram peers (chats/users) with caching
- **Key functions**:
  - `resolve_peer(folder_id, state, client)` → checks `peer_cache` first; if miss, resolves via `client.resolve_peer()` or by scanning dialogs, inserts into cache, returns `Peer`
  - `resolve_input_peer(folder_id, state, client)` → wraps `resolve_peer` result into `InputPeer` for API calls
  - `map_error(err)` → converts grammers/telegram errors to user-friendly string for Tauri IPC responses
- **Peer cache**: `HashMap<i64, Peer>` in `TelegramState` — lazily populated to avoid O(N) dialog scan on every file operation
