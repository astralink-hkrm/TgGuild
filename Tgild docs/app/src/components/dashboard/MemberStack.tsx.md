# `app/src/components/dashboard/MemberStack.tsx` — Avatar Stack

- **Purpose**: Overlapping circular avatar stack with overflow count
- **Props**: `members` (UserProfile[]), `max` (default 4), `size` (default 32px)
- **Behavior**: Renders up to `max` avatars with negative margin overlap, "+N" overflow badge
- **Avatars**: Uses `TelegramAvatar` component
