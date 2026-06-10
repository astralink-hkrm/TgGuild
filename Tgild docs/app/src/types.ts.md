# `app/src/types.ts` — TypeScript Interfaces

- **Purpose**: Shared type definitions for frontend
- **Interfaces**:
  - `TelegramFile` — File metadata: `id`, `name`, `size`, `mimeType`, `date`, `messageId`, `folderId`, `thumbUri`, `chatId`, `fileType`, `streamUrl`, `downloadPath`
  - `TelegramFolder` — Folder metadata: `id`, `name`, `date`, `type` (normal/team/drive), `parentId`
  - `QueueItem` — Upload/download queue entry: `id`, `name`, `size`, `progress`, `status` (queued/uploading/downloading/paused/completed/error/cancelled), `speed`, `eta`, `error`
  - `BandwidthStats` — Bandwidth tracking: `used`, `limit`
  - `DownloadItem` — Extended QueueItem: `messageId`, `folderId`, `targetPath`
  - `BatchDownload` — Batch download group: `id`, `folderName`, `items`, `progress`, `status`
  - `OpeningProgress` — File open progress event: `messageId`, `progress`, `status`
  - `FolderTreeNode` — Tree node: `id`, `name`, `children`, `type`, `parentId`
  - `UserProfile` — Telegram user profile: `id`, `firstName`, `lastName`, `username`, `phone`, `photo`
  - `AuthSession` — Auth result: `session`, `apiId`, `userId`, `isLoggedIn`
