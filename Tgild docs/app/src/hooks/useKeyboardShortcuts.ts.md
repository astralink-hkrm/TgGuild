# `app/src/hooks/useKeyboardShortcuts.ts` — Keyboard Shortcuts

- **Purpose**: Global keyboard shortcut handler for the dashboard
- **Exports**: `useKeyboardShortcuts(handlers)`
- **Handlers config**: `{ onDelete, onEscape, onEnter, onSelectAll, onSearch, onBackspace }`
- **Bindings**:
  - `Delete/Backspace` → onDelete (selected items)
  - `Escape` → onEscape (close modals, deselect)
  - `Enter` → onEnter (open selected)
  - `Cmd+A / Ctrl+A` → onSelectAll
  - `Cmd+F / Ctrl+F` → onSearch (focus search bar)
  - `Backspace` (on folder) → navigate to parent folder
- **Implementation**: `useEffect` with `keydown` event listener, checks for metaKey/ctrlKey
