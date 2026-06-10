# `app/src/hooks/useTelegramConnection.ts` — Connection State (~280 lines)

- **Purpose**: Manages Telegram folder scanning, store persistence, visibility filter, reconnection
- **Imports**: Tauri `invoke`, `listen`, TanStack Query (`useQuery`, `useQueryClient`)
- **Exports**: `useTelegramConnection(store)`
- **Data queries**:
  - `folders`: `invoke("get_folders")` — folder tree
  - `teams`: `invoke("get_teams")`
  - `contacts`: `invoke("get_contacts")`
  - `drives`: `invoke("get_drives")`
- **Visibility filter**: Wraps each list with `hiddenItems` from `teamVisibility.ts`
- **Reconnection**: Listens for `connection-status` Tauri events, refreshes queries on reconnect
- **Polling**: Optional 30s polling interval for data freshness
- **Returns**: `{ folders, teams, contacts, drives, isLoading, error, refetch, hiddenItems, toggleHidden }`
