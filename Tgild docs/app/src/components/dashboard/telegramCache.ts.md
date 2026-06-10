# `app/src/components/dashboard/telegramCache.ts` — Local Cache

- **Purpose**: localStorage cache for Telegram directory and message data
- **Exports**: `getCachedDirectories()`, `setCachedDirectories(data)`, `getCachedMessages(chatId)`, `setCachedMessages(chatId, messages)`, `clearCache()`
- **Storage keys**: `tgguild_dir_cache`, `tgguild_msg_cache_{chatId}`
- **TTL**: 5-minute expiry (timestamp stored alongside data)
- **Purpose**: Reduces redundant Telegram API calls on page navigation
