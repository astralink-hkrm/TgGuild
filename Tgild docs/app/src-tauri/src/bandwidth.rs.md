# `app/src-tauri/src/bandwidth.rs` — Bandwidth Tracker

- **Purpose**: Daily bandwidth usage tracking with 250GB soft limit, persisted to JSON
- **Struct**: `BandwidthManager` — `{ current_date: String, bytes_used: u64, limit: u64 }`
- **Persistence**: `bandwidth.json` in app data directory (via Tauri's app_data_dir)
- **Key functions**:
  - `new()` — loads from file or creates fresh
  - `record_upload(bytes)` — adds to tally, saves
  - `record_download(bytes)` — adds to tally, saves
  - `get_stats()` — returns `{ used: u64, limit: u64, percentage: f64 }`
  - `reset_if_new_day()` — checks if date changed, resets counter
  - `save()` / `load()` — JSON serialization
- **Limit check**: `can_upload(bytes) -> bool` — returns false if adding bytes would exceed limit
- **Thread safety**: Wrapped in `Arc<Mutex<>>` in app state
