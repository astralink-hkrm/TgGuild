# `app/src-tauri/src/main.rs` — Application Entry

- **Purpose**: Binary entry point with Linux platform fixes
- **Platform-specific**: On Linux, sets env vars `WEBKIT_DISABLE_COMPOSITING_MODE=1`, `WEBKIT_DISABLE_DMABUF_RENDERER=1` to fix EGL/rendering issues on Arch Linux
- **Entry**: Calls `app_lib::run()`
