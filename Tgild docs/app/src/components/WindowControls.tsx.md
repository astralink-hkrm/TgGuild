# `app/src/components/WindowControls.tsx` — Titlebar Buttons

- **Purpose**: Custom window control buttons for frameless Tauri window
- **Imports**: `getCurrentWindow` from `@tauri-apps/api/window`
- **Buttons**: Minimize, Maximize (toggle), Close
- **Style**: macOS-style traffic light circles (red/yellow/green) via `mac-traffic-lights` CSS class
- **On hover**: Shows corresponding lucide icon (Minus, Square, X)
- **Actions**: Direct calls to `appWindow.minimize()`, `appWindow.toggleMaximize()`, `appWindow.close()`
