# `app/src/components/dashboard/teamVisibility.ts` — Visibility Persistence

- **Purpose**: localStorage-based persistence for hidden sidebar items
- **Exports**: `getHiddenItems()`, `setHiddenItems(ids)`, `toggleHiddenItem(id)`
- **Storage key**: `tgguild_hidden_items`
- **Format**: JSON array of string IDs
