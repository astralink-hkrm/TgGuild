# `app/src/components/dashboard/FileListItem.tsx` — File List Row

- **Purpose**: Individual file row in list view
- **Props**: `file`, `isSelected`, `onSelect`, `onContextMenu`, drag handlers
- **Layout** (horizontal):
  - Checkbox → `FileTypeIcon` → Name (truncated) → Size (right-aligned) → Date (right-aligned)
- **Features**:
  - Selection highlight
  - Drag source
  - Double-click to open
  - Hover background change
