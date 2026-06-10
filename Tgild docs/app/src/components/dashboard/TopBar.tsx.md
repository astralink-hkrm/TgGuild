# `app/src/components/dashboard/TopBar.tsx` — Top Bar

- **Purpose**: Header bar — breadcrumb navigation, search, view toggle, member stack, theme toggle
- **Props**: `folders`, `activeFolderId`, `onNavigate`, `viewMode`, `onViewModeChange`, `searchQuery`, `onSearchChange`, `members`
- **Breadcrumb**: Clickable path from root to current folder, chevron separators, active folder highlighted
- **Search**: Input field with search icon, debounced query updates
- **View toggle**: Grid/List buttons with lucide icons (LayoutGrid/List), active state highlight
- **MemberStack**: Overlapping avatars of folder members
- **ThemeToggle**: Sun/Moon button
