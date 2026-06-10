# `app/src/hooks/useNetworkStatus.ts` — Network Monitor

- **Purpose**: Monitors network connectivity via TCP ping to Telegram DC2
- **Imports**: Tauri `invoke`
- **Exports**: `useNetworkStatus()`
- **State**: `isOnline` (boolean), `lastChecked` (timestamp)
- **Polling**: `invoke("is_network_available")` every 10 seconds
- **Returns**: `{ isOnline, lastChecked }`
- **Backend**: Rust `cmd_is_network_available` — TCP ping to 149.154.167.50:443 with 2s timeout
