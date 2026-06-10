# `app/src/components/dashboard/RenameModal.tsx` — Rename Modal

- **Purpose**: Modal dialog for renaming files/folders
- **Props**: `item` (TelegramFile | TelegramFolder), `onRename`, `onClose`
- **Features**:
  - Pre-filled input with current name
  - Auto-focus + select-all on mount
  - Enter to submit, Escape to cancel
  - Validation: empty name check
- **Style**: Centered modal with glass effect, backdrop overlay
