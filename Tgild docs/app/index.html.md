# `app/index.html` — HTML Entry Point

- **Purpose**: Single HTML page loaded by Tauri webview
- **Content**:
  - `<meta charset="UTF-8" />`
  - `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`
  - `<title>TgGuild</title>`
  - Inline `<script>` to prevent theme flash: checks localStorage for theme, applies `dark`/`light` class to `<html>` before React hydration
  - `<div id="root">` — React mount point
  - `<script type="module" src="/src/main.tsx">` — Vite entry
