# `app/src-tauri/src/models.rs` — Rust Data Structures

- **Purpose**: Serialize/deserialize structs for Tauri IPC between Rust and TypeScript
- **Derives**: `Serialize`, `Deserialize`, `Clone`, `Debug` where appropriate
- **Structs**:
  - `AuthState` — `{ authorized: bool, user_id: Option<i64>, api_id: Option<i32> }`
  - `AuthResult` — `{ session: String, api_id: i32, user_id: i64, is_logged_in: bool }`
  - `FileMetadata` — `{ id: String, name: String, size: i64, mime_type: String, date: String, message_id: i32, folder_id: i64, thumb_uri: Option<String>, chat_id: i64, file_type: String, stream_url: Option<String>, download_path: Option<String>, is_file: bool }`
  - `Member` — `{ user_id: i64, first_name: String, last_name: Option<String>, username: Option<String>, role: String, photo: Option<String> }`
  - `FolderMetadata` — `{ id: String, name: String, date: String, folder_type: String, parent_id: Option<String> }`
  - `Drive` — `{ id: i64, title: String, drive_type: String, about: Option<String> }`
  - `FolderTreeNode` — `{ id: String, name: String, children: Vec<FolderTreeNode>, folder_type: String, parent_id: Option<String> }`
  - `UserProfile` — `{ id: i64, first_name: String, last_name: Option<String>, username: Option<String>, phone: Option<String>, photo: Option<String> }`
