# `app/scripts/version-bump.js` — Version Bumper

- **Purpose**: Node.js script to bump version in `package.json` and `tauri.conf.json`
- **Usage**: `node scripts/version-bump.js [major|minor|patch]` (default: patch)
- **Logic**:
  1. Reads `app/package.json` and `app/src-tauri/tauri.conf.json`
  2. Parses current version (semver)
  3. Increments requested segment
  4. Writes updated version back to both files (preserving JSON formatting)
- **Used by**: CI workflow `autobuild.yml` on push to `main`
