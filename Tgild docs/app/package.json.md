# `app/package.json` — Frontend Dependencies

- **Version**: 1.3.28
- **Framework**: React 19, Vite 6
- **Key dependencies**:
  - `@tauri-apps/api` v2 — Tauri IPC
  - `@tauri-apps/plugin-*` — Tauri plugins (store, shell, dialog, fs, opener, updater)
  - `@tanstack/react-query` v5 — Server state / caching
  - `framer-motion` v11 — Animations
  - `react` v19, `react-dom` v19
  - `tailwindcss` v4, `@tailwindcss/vite` — CSS framework
  - `lucide-react` — Icon library
  - `pdfjs-dist` v4 — PDF rendering
  - `qrcode` v1 — QR code generation
  - `@types/react`, `typescript` v5 — Type checking
- **Scripts**:
  - `dev`: `tauri dev` — runs Vite + Tauri
  - `build`: `tsc && vite build` — typecheck + frontend build
  - `preview`: `vite preview`
- **Build output**: `dist/` (served by Tauri webview in production)
