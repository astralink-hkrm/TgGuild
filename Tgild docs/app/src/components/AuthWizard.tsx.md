# `app/src/components/AuthWizard.tsx` — Authentication Wizard (~1100 lines)

- **Purpose**: Full Telegram auth flow — Phone → Code → 2FA Password, plus QR code login
- **Imports**: React 19 (useState, useEffect, useCallback, useRef), Tauri IPC (invoke, listen), lucide-react icons, framer-motion, QRCode
- **Props**: `store` (Tauri Store), `onLogin` (callback with AuthSession)
- **States**:
  - `step`: 'phone' | 'code' | 'password' | 'qr'
  - `phone`, `code`, `password` — form inputs
  - `loading`, `error`, `qrCode` (base64 data URL)
  - `rememberSession` — toggle for session persistence
- **Flow**:
  1. PhoneInput: Country code + phone number, "Continue" button
     - On submit: `invoke("start_login", {phone})` → TOTP notice, transition to code step
  2. CodeInput: 6-digit code input (individual digit boxes), auto-submit on complete
     - Shows "Sent via SMS" context
     - On submit: `invoke("verify_code", {code})` → if 2FA required → password step; else → login success
  3. PasswordInput: Password field with show/hide toggle
     - On submit: `invoke("verify_password", {password})` → login success
  4. QR Login: QR code rendered with `qrcode` library, click to toggle, WebApp login link
- **Additional features**:
  - Desktop/browser detection: Tauri's `getCurrentWebviewWindow` checks `isTauri`
  - Donation modal: Heart button → "Buy me a coffee" modal with BTC/ETH/LTC/XMR addresses
  - Theme toggle: `ThemeToggle` component, synced via `useTheme` from `ThemeContext`
  - Version display: Bottom-left shows current version from `package.json`
  - 4 BTC bounty link
  - Remember me toggle
  - Logo: "TgGuild" with gradient text
