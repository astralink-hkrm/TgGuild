# `app/src/components/dashboard/OpeningOverlay.tsx` — File Open Progress

- **Purpose**: Popup overlay showing file opening/download progress
- **Props**: `openingProgress` (OpeningProgress | null)
- **UI**: Centered overlay with file name + progress bar + status text
- **States**: "Opening..." → "Downloading..." → "Ready" → auto-close
- **Events**: Listens to Tauri `opening-progress` events via `listen()`
