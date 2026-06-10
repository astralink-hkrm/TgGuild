# `app/src/components/dashboard/Sidebar.tsx` — Sidebar (~750 lines)

- **Purpose**: Left navigation panel — folder tree, teams, contacts, drives, bandwidth, member management
- **Props**: `folders`, `teams`, `contacts`, `drives`, `activeFolderId`, `activeTeamId`, `store`, `hiddenItems`, search states, visibility/rename/team callbacks
- **Sections**:
  - **Folder tree**: Alphabetically sorted, expandable virtual folders, inline rename via `editingFolderId`, active folder highlight with left border accent
  - **Teams panel**: Team list with avatar + unread badge, "Create Group" button, expandable member view
  - **Contacts**: Scrollable contact list with avatar/name/status
  - **Drives**: Connected account drives, on-hover remove button
  - **Bandwidth widget**: Daily usage bar (250GB limit) via `BandwidthWidget`
  - **Member stack**: Overlapping avatar stack with total count
- **Folder item**: Drag-drop reorder support via `onReorderFolders`, inline rename input
- **Hidden items**: Respects `hiddenItems` from `TeamVisibilityModal`
- **Scroll**: Custom slim scrollbar, max-height with overflow-y-auto
