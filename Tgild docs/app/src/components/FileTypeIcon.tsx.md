# `app/src/components/FileTypeIcon.tsx` — File Type Icon

- **Purpose**: Maps file extensions to Lucide icons with color coding
- **Props**: `filename` (string), `size?` (number, default 24)
- **Icon map**:
  - image/* → `Image` icon (purple)
  - video/* → `Video` icon (blue)
  - audio/* → `Music` icon (green)
  - doc (pdf/doc/docx/xls/xlsx/ppt/pptx/txt) → `FileText` icon (red/blue/green depending on type)
  - archive (zip/rar/7z/tar/gz) → `Archive` icon (yellow)
  - code (js/ts/py/rs/html/css/json/xml/sh) → `Code` icon (cyan)
  - default → `File` icon (gray)
- **Logic**: Uses `isImageFile`, `isVideoFile` etc. from `utils.ts`
