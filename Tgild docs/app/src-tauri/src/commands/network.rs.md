# `app/src-tauri/src/commands/network.rs` — Network Check

- **Purpose**: TCP connectivity check to Telegram DC
- **Command**: `cmd_is_network_available()` → `invoke("is_network_available")`
- **Logic**: Opens TCP connection to `149.154.167.50:443` (Telegram DC 2) with 2-second timeout via `tokio::time::timeout`
- **Returns**: `bool` — `true` if connection succeeds, `false` on timeout/error
