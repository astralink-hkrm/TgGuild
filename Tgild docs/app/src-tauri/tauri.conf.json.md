# `app/src-tauri/tauri.conf.json` — Tauri Configuration

- **Product**: `TgGuild`, version from `package.json`
- **Identifier**: `com.tgguild.app`
- **Build**: `beforeDevCommand: "npm run dev"`, `beforeBuildCommand: "npm run build"`, `devUrl: "http://localhost:1420"`, `frontendDist: "../dist"`
- **Window**:
  - Title: `TgGuild`
  - Size: 1200x800
  - Min size: 900x600
  - Decorations: `false` (frameless — custom titlebar via `WindowControls`)
  - `dragDropEnabled: true` (native drag-drop enabled, intercepted by frontend)
- **Plugins enabled**:
  - `updater`: Active, endpoint points to GitHub releases, signature verification via `.sig` file
  - `shell`: `open: true` (open files/URLs)
- **Security**:
  - CSP: `default-src 'self'; img-src 'self' asset: https://asset.localhost data:; media-src 'self' http://localhost:14201; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://*; connect-src 'self' http://localhost:14201 https://*`
  - Allows `localhost:14201` for Actix streaming server
  - Allows `unsafe-inline` for style/script (Framer Motion, PDF.js)
- **AppData directory**: Project-specific, isolated from other Tauri apps
