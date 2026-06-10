# `app/src/App.css` — Global Styles

- **Purpose**: App-wide CSS with Tailwind v4 import + custom theme variables and component styles
- **Key sections**:
  - `@import "tailwindcss"` — Tailwind v4 import (framework-agnostic)
  - **Theme variables** (`:root`): `--telegram-bg`, `--telegram-text`, `--telegram-hint`, `--telegram-link`, `--telegram-primary`, `--telegram-red`, `--telegram-green`, `--telegram-border`, `--telegram-secondary-bg` — Telegram-inspired color palette
  - **Theme overrides** (`.dark`, `.light`): scoped variable overrides for dark/light modes
  - **Auth gradient**: `.auth-gradient` — dark animated gradient background for auth wizard
  - **Glassmorphism**: `.glass`, `.glass-light`, `.glass-hover` — frosted glass effect with backdrop-blur
  - **Scrollbar**: Custom slim scrollbar (WebKit only), 6px wide, rounded thumb
  - **Context menu**: `.context-menu` — right-click menu with glass effect, shadow, entry animation
  - **Breadcrumb**: `.breadcrumb-separator` — chevron separator, `.breadcrumb-active` — highlight style
  - **Selection checkbox**: `.selection-checkbox` — absolute positioned checkbox overlay for file cards
  - **Skeleton loader**: `.skeleton` — shimmer animation for loading states
  - **File explorer grid**: `.file-explorer-grid` — responsive auto-fill grid with `minmax(150px, 1fr)` columns
  - **Upload queue**: `.upload-queue` — fixed bottom-right queue panel, `.upload-item` — progress bar styling
  - **Donation ball**: `.donation-ball` — floating animated sphere with gradient, orbit rings, glow, pulsing opacity
  - **Traffic light**: `.mac-traffic-lights` — macOS-style window controls for frameless window
