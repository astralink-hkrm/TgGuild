# `app/src/main.tsx` — React Entry Point

- **Purpose**: Application mount point
- **Imports**: `React`, `ReactDOM`, `App`
- **Content**: `createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)`
- **Note**: StrictMode enabled (causes double-render in dev)
