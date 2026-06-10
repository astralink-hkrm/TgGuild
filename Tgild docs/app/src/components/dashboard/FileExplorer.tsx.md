# `app/src/components/dashboard/FileExplorer.tsx` — File Explorer (~540 lines)

- **Purpose**: Main file grid/list view with sorting, selection, bulk actions, context menu
- **Props**: `files`, `activeFolderId`, `viewMode`, `sortBy`, `sortOrder`, `onSort`, `selectedItems`, `onSelectionChange`, `thumbnailCache`, scroll refs, drag-drop handlers, callbacks for all file operations
- **Views**:
  - **Grid**: `file-explorer-grid` CSS class with auto-fill responsive columns, renders `FileCard` for each file, `EmptyState` when no files
  - **List**: Table-like rows via `FileListItem`, header row with sortable columns (Name, Size, Date)
- **Features**:
  - Sorting: By name/size/date, ascending/descending toggle
  - Multi-select: Shift-click for range, Cmd/Ctrl-click for toggle, checkbox on hover
  - Bulk actions: Delete, Download, Move, Share (shown in floating action bar when items selected)
  - Drag-drop: HTML5 drag events for reordering/moving, file drop handling
  - Context menu: Right-click on file → `ContextMenu`
  - Empty state: SVG illustration with upload prompt
  - Loading state: 8 skeleton cards with shimmer animation
  - Virtual scrolling: IntersectionObserver-based lazy rendering for large lists
