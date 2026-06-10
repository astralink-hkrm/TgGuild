# `app/src/components/UpdateBanner.tsx` — Update Notification

- **Purpose**: Shows in-app update notification when a new version is available
- **Hook**: Uses `useUpdateCheck` for update state
- **States**:
  - `checking`: Loading spinner
  - `available`: "Update available" banner with download button
  - `downloading`: Progress bar with percentage
  - `downloaded`: "Restart to install" button
  - `uptodate`: Hidden
- **Style**: Fixed top banner with glass effect, slides down via framer-motion
