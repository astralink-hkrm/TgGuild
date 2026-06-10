# `app/vite.config.ts` — Vite Configuration

- **Purpose**: Vite dev server + build configuration for Tauri
- **Key settings**:
  - `server.port: 1420` — Dev server port
  - `server.hmr.port: 1421` — HMR WebSocket port
  - `server.strictPort: true` — Fail if ports are taken
  - `envPrefix: ["VITE_", "TAURI_"]` — Expose Tauri env vars
  - `build.target`: `esnext` for Tauri webview, `terser` for minification
  - `clearScreen: false` — Keep Tauri CLI output visible
- **Plugins**: `react()`, `tailwindcss()`
