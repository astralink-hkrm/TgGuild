# `app/src/hooks/useFileUpload.ts` — Upload Hook (~150 lines)

- **Purpose**: Dialog-based file upload with progress tracking
- **Imports**: Tauri `invoke`, `listen`, `@tauri-apps/plugin-dialog` (open), React hooks
- **Exports**: `useFileUpload(folderId, onUploadComplete?)`
- **State**: `queue` (QueueItem[]), `isUploading`
- **Flow**:
  1. `openDialog()` → Tauri file dialog (multi-select, all file types)
  2. For each file: create `QueueItem` with status 'queued', add to queue
  3. Process queue sequentially: update status → `invoke("upload_file", { folder_id, file_path, message_text })`
  4. Listen to `upload-progress` Tauri events → update progress/speed/ETA
  5. On complete: update status 'completed', invalidate query
  6. On error: status 'error', store error message
- **Functions**: `cancelUpload(id)`, `retryUpload(id)`, `clearCompleted()`
- **Returns**: `{ queue, openDialog, cancelUpload, retryUpload, clearCompleted, isUploading }`
