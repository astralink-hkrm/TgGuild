# `app/src/components/dashboard/PreviewModal.tsx` — Image Preview

- **Purpose**: Full-screen image viewer with zoom, navigation, prefetch
- **Props**: `file`, `files` (all files in folder for navigation), `onClose`
- **Features**:
  - Image cache: Loads image into `Image` object, displays once loaded
  - Zoom: Scroll-wheel zoom, click+drag pan when zoomed
  - Navigation: Left/right arrow keys, swipe gestures, prev/next buttons
  - Prefetch: Preloads adjacent images in background
  - Download button: Triggers file download
  - Close: Escape key or X button
- **Style**: Dark overlay backdrop, centered image with max-height/max-width containment
