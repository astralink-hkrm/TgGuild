# `app/src-tauri/src/commands/preview.rs` — Thumbnail & Preview Cache

- **Purpose**: Generates and caches thumbnails for image files with LRU eviction
- **Imports**: image (image crate), std::fs, std::path, sha2, tauri
- **Key functions**:
  - `cmd_get_thumbnail(folder_id, message_id, state, app_handle)` → downloads file → generates 200x200 thumbnail via `image` crate → saves to cache → returns path
  - `cmd_get_preview(...)` → similar for non-image previews (document text extraction?)
- **Cache management**:
  - Directory: App data dir `/thumbnails/`
  - Filename: SHA256 hash of `{folder_id}_{message_id}` + `.jpg`
  - LRU eviction: Tracks access times, evicts least recently used when count > 30 or total size > 80MB
  - Cleanup on app start: Removes orphaned cache files
