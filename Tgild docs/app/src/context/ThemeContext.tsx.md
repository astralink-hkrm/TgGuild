# `app/src/context/ThemeContext.tsx` — Theme Provider

- **Purpose**: Dark/light theme management with flash prevention
- **Exports**: `ThemeProvider`, `useTheme`
- **State**: `theme` — 'dark' | 'light'
- **On mount**: Reads localStorage (`tgguild_theme`), falls back to system preference (`prefers-color-scheme: dark`)
- **Flash prevention**: Theme is applied to `<html>` element via inline `<script>` in `index.html` before React hydration; ThemeProvider syncs with React state after mount
- **Toggle**: `toggleTheme()` updates state, localStorage, and `<html>` class
- **System preference listener**: `matchMedia` change listener syncs when no stored preference
