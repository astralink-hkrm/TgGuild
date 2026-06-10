# `app/src/components/dashboard/DownloadQueue.tsx` — Download Progress

- **Purpose**: Shows active download items with progress bars + batch management
- **Props**: `queue`, `batches`, `onCancel`, `onClear`, `onExpandBatch`
- **Layout**: Fixed bottom-right panel (shared position with UploadQueue)
- **Items**: Similar to UploadQueue but with save-to buttons
- **Batches**: Expandable batch cards via `BatchDownloadCard` showing per-item progress within a batch download
- **Tabs**: "Downloads" | "Batches" toggle for organized view
