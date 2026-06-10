# `app/src-tauri/src/commands/streaming.rs` — Stream Token Management

- **Purpose**: Manages one-time stream tokens for media access
- **Struct**: `StreamConfig` — `{ active_tokens: HashMap<String, StreamEntry> }`
  - `StreamEntry` — `{ folder_id: i64, message_id: i32, created_at: Instant }`
- **Commands**:
  - `cmd_get_stream_token(message_id, folder_id, state, stream_config)` → generates random 32-char hex token via `rand`, stores `StreamEntry` in `StreamConfig.active_tokens`, returns `{ token, stream_url: "http://localhost:14201/stream/{folder_id}/{message_id}?token={token}" }`
  - `cmd_get_stream_info(token, stream_config)` → looks up token, returns stream info if valid
- **Token lifecycle**: Created on `get_stream_token`, consumed on first stream request in `server.rs`, auto-expires after 5 minutes via cleanup task
