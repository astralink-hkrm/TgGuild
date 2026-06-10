# `app/src/components/dashboard/PdfViewer.tsx` — PDF Viewer

- **Purpose**: In-app PDF rendering using PDF.js with streaming
- **Props**: `file` (TelegramFile), `onClose`
- **Source**: Streams PDF via `http://localhost:14201/stream/{folder_id}/{message_id}?token={token}` with range requests
- **Features**:
  - PDF.js `getDocument` with range request transport for progressive loading
  - Page navigation (prev/next + page number input)
  - Zoom controls (zoom in/out/fit)
  - Loading progress indicator
  - Error fallback with reload option
  - Full-screen mode toggle
- **Performance**: PDF.js worker via CDN (`pdf.worker.min.mjs` v4), canvas rendering per page
