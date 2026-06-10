# `.github/workflows/autobuild.yml` — CI/CD Pipeline

- **Purpose**: Automated build and release on push to `main`
- **Trigger**: Push to `main` branch
- **Jobs**:
  - **version-bump**: Checks out repo, runs `node app/scripts/version-bump.js` with patch bump, commits and pushes version bump back to main
  - **build** (matrix): Windows (latest), Linux (latest), macOS (latest)
    - Steps: Checkout → Install Rust → Setup Node 18 → Install dependencies → Build frontend (`npm run build`) → Build Tauri app
    - Linux-specific: `sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libavformat-dev libavcodec-dev libavdevice-dev libavutil-dev libswscale-dev`
    - Uploads artifacts (.msi, .AppImage, .dmg) per platform
    - AppImage post-processing: patches via `appimagetool` for Arch/EGL compatibility
  - **publish**: Creates GitHub Release with artifacts from all platforms
- **Secrets**: `GH_PAT` for pushing version bumps
- **Artifact retention**: 7 days
