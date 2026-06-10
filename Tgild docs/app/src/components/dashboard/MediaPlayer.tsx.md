# `app/src/components/dashboard/MediaPlayer.tsx` — Video/Audio Player

- **Purpose**: Video and audio playback via Actix-web streaming backend
- **Props**: `file` (TelegramFile with streamUrl populated)
- **Source**: Constructs `<video>` or `<audio>` element with `src` pointing to `http://localhost:14201/stream/{folder_id}/{message_id}?token={token}`
- **Features**:
  - Native HTML5 controls (play/pause/seek/volume/fullscreen)
  - Streaming via range requests (seeking supported)
  - Auto-detects video vs audio from file type
  - Error handling for stream failures
