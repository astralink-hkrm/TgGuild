# `app/src/components/ErrorBoundary.tsx` — Error Boundary

- **Purpose**: React class component error boundary — catches render errors and shows fallback UI
- **State**: `hasError`, `error`
- **Fallback UI**: Centered error message with "Something went wrong" + error details + "Reload" button (calls `window.location.reload()`)
- **Usage**: Wraps entire `<App />` in `App.tsx`
