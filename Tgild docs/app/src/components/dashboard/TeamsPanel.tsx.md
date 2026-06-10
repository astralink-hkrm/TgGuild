# `app/src/components/dashboard/TeamsPanel.tsx` — Teams & Contacts (~800 lines)

- **Purpose**: Team list, contact list, member management, group creation
- **Props**: `teams`, `contacts`, `activeTeamId`, `onTeamSelect`, visibility states
- **Tabs**: "Teams" | "Contacts"
- **Teams tab**: Scrollable team list with avatar, name, member count, unread badge. "Create Group" button opens group creation modal. Click to select → opens `TeamChat`
- **Contacts tab**: Contact list with avatar, name, status icon. Click to start direct chat. Search filter
- **Member management**: Inline member list with roles, add member, remove member, role change (admin/member)
- **Group creation**: Modal with name input, member multi-select from contacts
- **Invite**: Generate invite link or share QR code
