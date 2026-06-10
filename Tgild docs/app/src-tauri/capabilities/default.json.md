# `app/src-tauri/capabilities/default.json` — Permissions

- **Purpose**: Tauri v2 capability-based permission system
- **Permissions granted**:
  - `core:default` — basic Tauri operations
  - `core:window:allow-*` — window ops (minimize, maximize, close, toggleMaximize)
  - `core:window:deny-hide` — explicitly deny hide
  - `core:process:default` — process operations
  - `opener:default` — open URLs/files
  - `shell:default` — shell operations
  - `store:default` — persistent key-value store
  - `dialog:default` — file dialogs
  - `dialog:allow-save`, `dialog:allow-open`, `dialog:allow-ask`, `dialog:allow-message`, `dialog:allow-confirm`
  - `fs:default` — filesystem access
  - `fs:allow-appdata-read`, `fs:allow-appdata-write` — app data directory
  - `fs:allow-temp-read`, `fs:allow-temp-write` — temp directory
  - `updater:default` — app updates
