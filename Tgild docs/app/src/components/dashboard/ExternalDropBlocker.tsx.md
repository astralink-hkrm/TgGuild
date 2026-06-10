# `app/src/components/dashboard/ExternalDropBlocker.tsx` — Drop Blocker

- **Purpose**: Prevents native browser/Tauri drag-drop from opening files in webview
- **Props**: `onDragOver` callback to show overlay
- **Behavior**: Intercepts `dragover` and `drop` events at document level, prevents default, redirects to upload flow
- **Note**: Tauri has `dragDropEnabled: true` in config, but this component prevents native handling
