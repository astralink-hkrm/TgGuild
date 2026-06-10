# `app/src/hooks/useFileOperations.ts` — File Operations Hook (~400 lines)

- **Purpose**: Centralizes all file CRUD operations with TanStack Query mutations
- **Imports**: Tauri `invoke`, `@tauri-apps/plugin-dialog` (save, confirm), `@tanstack/react-query` (useMutation, useQueryClient)
- **Exports**: `useFileOperations(folderId, selectedItems, onClearSelection)`
- **Mutations**:
  - `deleteFile` → `invoke("delete_file", { folder_id, message_id })` → invalidates query
  - `deleteFolder` → `invoke("delete_folder", { folder_id })` → invalidates queries
  - `renameFile` → `invoke("rename_file", { message_id, folder_id, name })` → invalidates
  - `renameFolder` → `invoke("rename_folder", { folder_id, name })` → invalidates
  - `downloadFile` → delegates to `useFileDownload`
  - `bulkDownload` → delegates to `useFileDownload`
  - `bulkDelete` → iterates selected items, calls deleteFile/deleteFolder per item
  - `moveToFolder` → `invoke("move_file_to_folder", { message_id, source_folder_id, target_folder_id })`
  - `moveToVirtualFolder` → `invoke("move_to_folder", { folder_id, target_folder_id })`
- **Return**: All mutation objects with `mutate`, `isPending`, `error` per operation
