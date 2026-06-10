# `app/src/utils.ts` — Utility Functions

- **Purpose**: Pure utility functions used across components
- **Exports**:
  - `formatBytes(bytes, decimals?)` — Converts bytes to human-readable string (KB/MB/GB/TB), detects `bytes: 0` → `0 B`
  - `formatDisplayDate(dateString)` — Formats ISO date to locale string, or "Just now" / "X minutes ago" / "X hours ago" for recent times
  - `isImageFile(filename)` — Checks extension against image types (png, jpg, jpeg, gif, bmp, webp, svg, ico)
  - `isVideoFile(filename)` — Checks mp4, webm, mkv, avi, mov, wmv, flv, m4v
  - `isAudioFile(filename)` — Checks mp3, wav, ogg, flac, aac, m4a, wma, opus
  - `isMediaFile(filename)` — `isImageFile || isVideoFile || isAudioFile`
  - `isPdfFile(filename)` — Checks .pdf
  - `isCodeFile(filename)` — Checks .js, .ts, .py, .rs, .go, .java, .cpp, .c, .h, .hpp, .cs, .swift, .kt, .rb, .php, .html, .css, .scss, .less, .json, .xml, .yaml, .yml, .toml, .sql, .sh, .bash, .ps1, .bat, .cmd, .dockerfile, .md
