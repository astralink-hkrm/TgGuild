# `app/src/components/dashboard/BandwidthWidget.tsx` — Bandwidth Meter

- **Purpose**: Daily bandwidth usage indicator (250GB limit)
- **Props**: `stats` (BandwidthStats: { used, limit })
- **UI**: Horizontal progress bar with used/limit text, color changes based on usage level (green → yellow → red)
- **Data source**: Rust `BandwidthManager` persisted to `bandwidth.json`, fetched via `invoke("get_bandwidth_stats")`
