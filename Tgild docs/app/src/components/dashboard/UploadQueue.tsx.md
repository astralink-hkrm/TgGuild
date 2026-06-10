# `app/src/components/dashboard/UploadQueue.tsx` — Upload Progress

- **Purpose**: Shows active upload items with progress bars
- **Props**: `queue` (QueueItem[]), `onCancel`, `onRetry`, `onClear`
- **Layout**: Fixed bottom-right panel, expandable header with count
- **Items**: File icon + name + progress bar (animated fill) + percentage + speed/ETA text + cancel/retry buttons
- **States**: Queued (waiting), Uploading (progress), Completed (green check), Error (red + retry), Cancelled (gray)
- **Animation**: Framer Motion `AnimatePresence` for item enter/exit
