# `app/src/components/dashboard/MoveToFolderModal.tsx` — Move Files

- **Purpose**: Folder tree browser for selecting destination when moving files
- **Props**: `folders`, `currentFolderId`, `selectedItems`, `onMove`, `onClose`
- **Features**:
  - Expandable folder tree (`FolderTreeNode[]`)
  - Current folder excluded from options
  - Visual active/hover states
  - "Move here" button on selection
