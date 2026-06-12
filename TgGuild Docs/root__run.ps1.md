# `run.ps1` — Development Launcher

- **Purpose**: PowerShell script to start the app in dev mode
- **Contents**: `Set-Location -LiteralPath "app"; if ($?) { npm run tauri dev }`
- **Behavior**: Navigates to `app/` directory, runs `npm run tauri dev` (Vite dev server + Tauri dev window)
- **Usage**: `.\run.ps1` from project root
