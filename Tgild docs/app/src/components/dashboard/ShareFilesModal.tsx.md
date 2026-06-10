# `app/src/components/dashboard/ShareFilesModal.tsx` — Share Files

- **Purpose**: Share selected files to drive, team, or direct chat
- **Props**: `files`, `teams`, `contacts`, `drives`, `onShare`, `onClose`
- **Tabs**: "Drive" | "Team" | "Direct Chat"
- **Flow**: Select target → confirm → `invoke("share_files")`
- **Features**:
  - Search/filter for targets
  - Multi-select support
  - Permission display (read/write)
