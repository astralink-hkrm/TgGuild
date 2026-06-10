# `app/src/components/dashboard/TelegramAvatar.tsx` — User Avatar

- **Purpose**: User avatar with photo fallback to initials + color hash
- **Props**: `user` (UserProfile), `size` (default 40px)
- **Behavior**:
  - If user has photo: renders `<img>` with photo URL
  - If no photo: renders initials (first letter of firstName + lastName) with background color derived from user ID hash
- **Style**: Circular, object-fit cover for photos, centered initials text
