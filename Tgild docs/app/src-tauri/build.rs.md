# `app/src-tauri/build.rs` — Build Script

- **Purpose**: Standard Tauri build script
- **Content**: `fn main() { tauri_build::build() }`
- **Note**: Called by Cargo at build time; necessary for Tauri code generation (icons, resources, etc.)
