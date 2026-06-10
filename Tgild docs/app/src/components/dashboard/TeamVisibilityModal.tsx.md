# `app/src/components/dashboard/TeamVisibilityModal.tsx` — Hide/Show Items

- **Purpose**: Toggle visibility of teams, contacts, drives in sidebar
- **Props**: `hiddenItems`, `teams`, `contacts`, `drives`, `onToggle`, `onClose`
- **UI**: Three sections (Teams/Contacts/Drives) with toggle switches for each item
- **Persistence**: Hidden item IDs stored via local storage utility in `teamVisibility.ts`
