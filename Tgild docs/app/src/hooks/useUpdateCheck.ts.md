# `app/src/hooks/useUpdateCheck.ts` — Update Check

- **Purpose**: Tauri updater integration
- **Imports**: `@tauri-apps/plugin-updater` (check, download, install)
- **Exports**: `useUpdateCheck()`
- **State**: `status` ('checking' | 'available' | 'downloading' | 'downloaded' | 'uptodate'), `progress` (number), `error`
- **Flow**:
  1. On mount: `check()` → if update available, set status 'available'
  2. `downloadUpdate()` → download with progress callback → set status 'downloaded'
  3. `installUpdate()` → `install()` → app restart
- **Returns**: `{ status, progress, error, checkForUpdates, downloadUpdate, installUpdate }`
