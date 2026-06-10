# `app/src/components/dashboard/BatchDownloadCard.tsx` — Batch Download

- **Purpose**: Expandable card showing grouped batch download progress
- **Props**: `batch` (BatchDownload), `onCancel`
- **Layout**: Header (folder name + overall progress + expand toggle), expanded body shows per-file progress rows
- **Each row**: File name + individual progress bar + status icon
- **Animation**: Collapse/expand via framer-motion
