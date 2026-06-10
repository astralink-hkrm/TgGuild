# `.gitignore` — Git Ignore Rules

- **Location**: Root `.gitignore`
- **Ignored patterns**:
  - `node_modules/` — npm dependencies
  - `dist/` — build output
  - `target/` — Rust build output
  - `.env` — environment variables
  - `.vscode/`, `.idea/` — editor settings
  - `CompiledApps/` — bundled releases
  - `logs/`, `Error.html` — debug artifacts
- **Purpose**: Prevent build artifacts, dependencies, and local config from being committed
