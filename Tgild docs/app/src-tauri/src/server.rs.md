# `app/src-tauri/src/server.rs` — Actix-web Streaming Server

- **Purpose**: HTTP server for media streaming, separate from Tauri (port 14201)
- **Entry**: `start_streaming_server(config: Arc<RwLock<StreamConfig>>)` — spawns Actix runtime
- **Endpoint**: `GET /stream/{folder_id}/{message_id}?token={token}`
- **Auth**: Validates `token` against `StreamConfig.active_tokens` map
- **Streaming logic**:
  - Parses `Range` header for byte-range requests (seeking)
  - Uses the shared `TelegramState` grammers client to download the message's media
  - Streams bytes directly to the HTTP response body
  - Sets appropriate `Content-Type` and `Content-Length` headers
  - Supports `206 Partial Content` for range requests
- **CORS**: Allows origin from Tauri webview (localhost:1420)
- **Cleanup**: Tokens are single-use or expire after stream completion
- **Thread safety**: `StreamConfig` shared via `Arc<RwLock<>>`
