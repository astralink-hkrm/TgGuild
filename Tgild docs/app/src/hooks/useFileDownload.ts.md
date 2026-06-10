# `app/src/hooks/useFileDownload.ts` — Download Hook (~650 lines)

- **Purpose**: Single/batch file download, open file, progress queue management
- **Imports**: Tauri `invoke`, `listen`, `@tauri-apps/plugin-dialog` (save), `@tauri-apps/plugin-shell` (open), React hooks
- **Exports**: `useFileDownload(folderId)`
- **State**: `queue` (DownloadItem[]), `batches` (BatchDownload[]), `openingProgress` (OpeningProgress | null)
- **Single download**:
  - `downloadFile(file)` → `invoke("download_file", { message_id, folder_id })` → progress events → save dialog → shell.open or just save
- **Batch download**:
  - `downloadFiles(files)` → creates batch → sequentially downloads each file → progress per item + overall batch progress
- **Open file**:
  - `openFile(file)` → `invoke("get_stream_token")` → constructs stream URL → opens in system handler via `shell.open`, or previews inline for images/PDFs
- **Progress tracking**:
  - `listen("download-progress")` → updates { messageId, progress, speed } per item
  - `mountedRef` pattern to avoid setState after unmount (React 19 StrictMode)
  - ETA calculation via rolling average of recent speed samples
- **Batch management**: `expandBatch(id)`, `cancelBatch(id)`, `cancelDownload(id)`
- **Returns**: `{ queue, batches, openingProgress, downloadFile, downloadFiles, openFile, cancelDownload, cancelBatch, clearCompleted }`
