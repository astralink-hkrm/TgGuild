# `app/src/components/dashboard/SidebarItem.tsx` — Sidebar Folder Item

- **Purpose**: Individual folder item in sidebar's folder tree
- **Props**: `folder`, `isActive`, `onSelect`, `onContextMenu`, drag-drop handlers, `isEditing`, `onRename`
- **Features**:
  - Active state with left border accent
  - Inline rename input (double-click)
  - Drag source + drop target for reordering
  - Context menu (rename, delete, share)
  - Expand/collapse for nested folders
  - File count badge
