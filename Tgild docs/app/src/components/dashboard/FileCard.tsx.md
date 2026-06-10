# `app/src/components/dashboard/FileCard.tsx` — File Grid Card

- **Purpose**: Individual file card in grid view
- **Props**: `file`, `isSelected`, `onSelect`, `onContextMenu`, drag handlers, thumbnail options
- **Layout** (vertical):
  - **Thumbnail** (top): Lazy-loaded image via IntersectionObserver, fallback to `FileTypeIcon` while loading or on error
  - **File info** (bottom): Name (truncated with ellipsis), size, date
- **Features**:
  - Checkbox on hover (`.selection-checkbox`)
  - Double-click to open file
  - Drag source (`draggable`)
  - Selection highlight with border accent
  - Framer Motion layout animation
