# `app/src/context/ConfirmContext.tsx` — Confirm Dialog

- **Purpose**: Promise-based confirmation dialog context (e.g., "Are you sure?")
- **Exports**: `ConfirmProvider`, `useConfirm`
- **Usage**: `const confirmed = await confirm("Delete this file?")` — returns `boolean`
- **UI**: Centered modal with message + Cancel/Confirm buttons
- **Implementation**: Stores resolve function in ref, opens modal, returns promise that resolves on button click
