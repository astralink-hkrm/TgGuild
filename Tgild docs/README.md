# TgGuild — Full Codebase Architecture

## Overview

TgGuild v1.3.28 is a **Tauri v2 desktop application** that provides a cloud storage and collaboration platform on top of **Telegram's MTProto API**. It uses a user's Telegram account (Saved Messages + group chats) as a virtual filesystem — files are uploaded as Telegram messages, and a JSON-based virtual folder system (stored in message text) tracks the tree structure.

```
┌─────────────────────────────────────────────────┐
│                  Tauri v2 Shell                   │
│  ┌──────────────────┐  ┌─────────────────────┐  │
│  │   React Frontend  │  │   Rust Backend       │  │
│  │   (Vite + Tailwind│  │   (grammers MTProto) │  │
│  │    + TanStack Q)  │  │   + Actix Streaming  │  │
│  └──────┬───────────┘  └──────────┬──────────┘  │
│         │      Tauri IPC (invoke) │              │
│         └─────────────────────────┘              │
└─────────────────────────────────────────────────┘
```

### Core Architecture

- **Frontend**: React 19 + TypeScript, Vite dev server (port 1420), Tailwind v4, Framer Motion, TanStack Query v5, PDF.js, QRCode.js
- **Backend**: Rust with Tauri v2, grammers-client for Telegram MTProto, Actix-web for media streaming (port 14201)
- **Build target**: Windows (MSI), Linux (AppImage/deb), macOS (DMG)
- **CI**: GitHub Actions — auto-builds on push to `main`

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Virtual folders as JSON messages | No external DB needed; Telegram drives are self-contained |
| Saved Messages as root drive | Always available, no team/chat dependency |
| Grammers MTProto client | Full Telegram API access vs Bot API limitations |
| Actix-web streaming server | Separate HTTP server for media range requests |
| Bandwidth tracking (250GB/day) | Soft limit per Telegram drive account |
| LRU thumbnail cache (30 files, 80MB) | Prevents disk bloat from previews |
| Session runners per drive | Each API ID pair gets its own grammers network runner |

### Communication Flow

```
User Action → React Component → TanStack Query Mutation
  → Tauri IPC invoke() → Rust Command (async)
    → grammers MTProto call → Telegram DC Response
  → Progress Tauri Events → React Query Cache Update
→ UI Re-render
```

### Virtual Filesystem Protocol

Messages in Telegram chats are tagged with prefixes:
- `TGGuild_FOLDER_V1:{json_metadata}` — virtual folder marker
- `TGGuild_FILE_V1:{json_metadata}` — file placeholder marker
- `TGGUILD_TREE_V1:{json_tree}` — folder tree structure

The tree is fully materialized on each load from these markers.

### Security Model

- **Auth**: Phone → Code → 2FA Password flow via Telegram MTProto
- **API ID**: Encrypted in Tauri Store (`api_id.enc` key)
- **Streaming tokens**: Random 32-char hex per session, validated on each request
- **CSP**: Restricted to allow only localhost:14201 for media
- **Sessions**: SQLite session files per API ID, stored in app data directory

---

## Directory Map

```
TgGuild/
├── app/                          # Main application
│   ├── src/                      # React frontend source
│   │   ├── main.tsx              # Entry point
│   │   ├── App.tsx               # Root component (orchestrator)
│   │   ├── App.css               # Global styles + Tailwind
│   │   ├── types.ts              # TypeScript interfaces
│   │   ├── utils.ts              # Utility functions
│   │   ├── components/           # React components
│   │   │   ├── AuthWizard.tsx    # Auth flow (phone→code→password)
│   │   │   ├── Dashboard.tsx     # Main workspace orchestrator
│   │   │   ├── ErrorBoundary.tsx # Error boundary
│   │   │   ├── FileTypeIcon.tsx  # File type icon mapper
│   │   │   ├── ThemeToggle.tsx   # Dark/light toggle
│   │   │   ├── UpdateBanner.tsx  # Update notification
│   │   │   ├── WindowControls.tsx# Custom titlebar buttons
│   │   │   └── dashboard/        # Dashboard sub-components
│   │   │       ├── Sidebar.tsx, TopBar.tsx, FileExplorer.tsx
│   │   │       ├── FileCard.tsx, FileListItem.tsx
│   │   │       ├── ContextMenu.tsx, EmptyState.tsx
│   │   │       ├── UploadQueue.tsx, DownloadQueue.tsx
│   │   │       ├── BatchDownloadCard.tsx
│   │   │       ├── PreviewModal.tsx, MediaPlayer.tsx, PdfViewer.tsx
│   │   │       ├── TeamChat.tsx, TeamsPanel.tsx
│   │   │       ├── RenameModal.tsx, CreateFolderModal.tsx
│   │   │       ├── MoveToFolderModal.tsx, ShareFilesModal.tsx
│   │   │       ├── DragDropOverlay.tsx, ExternalDropBlocker.tsx
│   │   │       ├── SidebarItem.tsx, MemberStack.tsx
│   │   │       ├── TelegramAvatar.tsx, BandwidthWidget.tsx
│   │   │       ├── AddSubscriberModal.tsx
│   │   │       ├── TeamVisibilityModal.tsx
│   │   │       ├── OpeningOverlay.tsx
│   │   │       ├── teamVisibility.ts, telegramCache.ts
│   │   │       └── teams/ (subdir)
│   │   ├── context/
│   │   │   ├── ThemeContext.tsx
│   │   │   └── ConfirmContext.tsx
│   │   ├── contexts/
│   │   │   └── DropZoneContext.tsx
│   │   └── hooks/
│   │       ├── useFileOperations.ts
│   │       ├── useTelegramConnection.ts
│   │       ├── useFileUpload.ts
│   │       ├── useFileDownload.ts
│   │       ├── useUpdateCheck.ts
│   │       ├── useNetworkStatus.ts
│   │       ├── useKeyboardShortcuts.ts
│   │       └── useFileDrop.ts
│   ├── src-tauri/                # Rust backend
│   │   ├── src/
│   │   │   ├── main.rs           # Linux EGL fix + app entry
│   │   │   ├── lib.rs            # Tauri app builder + state init
│   │   │   ├── models.rs         # Rust data structures
│   │   │   ├── bandwidth.rs      # Bandwidth tracker
│   │   │   ├── server.rs         # Actix-web streaming server
│   │   │   └── commands/
│   │   │       ├── mod.rs        # Module exports + TelegramState
│   │   │       ├── auth.rs       # Auth commands + runner lifecycle
│   │   │       ├── fs.rs         # Filesystem commands (~2300 lines)
│   │   │       ├── teams.rs      # Teams/chat commands (~1800 lines)
│   │   │       ├── preview.rs    # Thumbnail/preview cache
│   │   │       ├── streaming.rs  # Stream token management
│   │   │       ├── network.rs    # Network availability check
│   │   │       └── utils.rs      # Peer resolution helpers
│   │   ├── tauri.conf.json       # Tauri configuration
│   │   ├── capabilities/default.json  # Permissions
│   │   ├── build.rs              # Tauri build script
│   │   └── Cargo.toml            # Rust dependencies
│   ├── scripts/version-bump.js   # Version bumper
│   ├── package.json              # Node dependencies
│   ├── vite.config.ts            # Vite configuration
│   ├── tsconfig.json             # TypeScript config
│   ├── index.html                # HTML entry
│   └── postcss.config.js         # PostCSS config
├── .github/workflows/autobuild.yml  # CI pipeline
├── .gemini/settings.json         # Gemini settings
├── README.md                     # Project README
├── CHANGELOG.md                  # Version history
├── run.ps1                       # Dev launcher
└── screenshots/                  # App screenshots
```

---

## Data Flow Diagrams

### Authentication Flow
```
User → AuthWizard (PhoneInput)
     → invoke("start_login", { phone })
     → Rust: send_code request to Telegram DC
     ← AuthWizard (CodeInput)
     → invoke("verify_code", { code })
     → Rust: sign_in request
     ← If 2FA required → AuthWizard (PasswordInput)
     → invoke("verify_password", { password })
     → Rust: check_password request
     ← AuthSession → App.tsx: setLoggedIn(true)
     → Dashboard mounts
```

### File Upload Flow
```
User → FileExplorer/UploadQueue
     → useFileUpload.openDialog()
     → Tauri dialog.open() → file paths
     → invoke("upload_file", { folder_id, file_path, message_text })
     → Rust: reads file, splits into chunks
     → uploads via grammers (sequential/smart chunking)
     → emits "upload-progress" events
     ← Rust: returns FileMetadata
     → React Query invalidation → UI update
```

### File Download Flow
```
User → FileExplorer (click download / open)
     → useFileDownload.downloadFile()
     → invoke("download_file", { message_id, folder_id })
     → Rust: reads from Telegram via grammers
     → emits "download-progress" events
     → writes to temp file in appdata
     ← Rust: returns file path
     → shell.open() or save dialog
```

### Media Streaming Flow
```
User → PreviewModal / MediaPlayer
     → invoke("get_stream_token", { message_id, folder_id })
     → Rust: generates random 32-char token
     ← returns { token, stream_url }
     → Frontend constructs: http://localhost:14201/stream/{folder_id}/{message_id}?token={token}
     → Actix-web server validates token
     → streams media via grammers client
     → Range request support for seeking
```

---

## Key Technical Details

- **React 19 + StrictMode**: Dev double-renders caught via `mountedRef` pattern in useFileDownload
- **TanStack Query**: `queryKey: ['files', activeFolderId]` — cache invalidated on mutations
- **Tauri Events**: `listen("upload-progress")`, `listen("download-progress")` — progress bar updates
- **Framer Motion**: `AnimatePresence` for queues/modals, layout animations for file grid
- **Grammers Runner**: Critical `runner_shutdown.take()` before spawning new runner to prevent stack overflow on repeated auth
- **Peer Cache**: `HashMap<folder_id, Peer>` in TelegramState avoids O(N) dialog scan per file operation
- **Virtual Folder Tree**: Each folder creates a message with `TGGuild_FOLDER_V1:...` text; the full tree is rebuilt from these markers
- **Bandwidth Persistence**: `bandwidth.json` in appdata directory, daily reset at midnight UTC
- **Thumbnail Cache**: LRU eviction when exceeding 30 files or 80MB in temp directory
- **Preview Prefetch**: `Image` object preloading, swipe gesture navigation between images
- **PDF Streaming**: Range requests via Actix streaming endpoint, PDF.js progressive loading
- **Electron Alternative**: Uses Tauri's webview (WebView2 on Windows, WebKitGTK on Linux)
- **Session Isolation**: SQLite files per API ID, separate grammers client instances per account
