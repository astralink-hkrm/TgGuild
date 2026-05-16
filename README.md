# tgTeams

**tgTeams** is an open-source, cross-platform collaboration and storage powerhouse. It transforms your Telegram account into a unified workspace—serving as a secure, unlimited alternative to both **Google Drive** and **Microsoft Teams**. Built with **Tauri**, **Rust**, and **React**.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20MacOS%20%7C%20Linux-blue)

![Auth Screen](screenshots/AuthScreen.png)

## What is tgTeams?

tgTeams leverages the Telegram API to provide a seamless bridge between high-capacity cloud storage and team communication. By treating "Saved Messages" and Channels as organized folders and collaborative spaces, it provides a familiar, high-performance interface for your entire workflow.

### Key Vision

*   **Unified Workspace**: Combining the file management capabilities of Google Drive with the communication strengths of Teams.
*   **Unlimited Cloud Storage**: Utilizing Telegram's generous cloud infrastructure for all your team assets.
*   **Privacy & Security**: End-to-end focus where API keys and data stay local. No third-party servers.
*   **High Performance Grid**: Virtual scrolling handles folders with thousands of files instantly.
*   **Media & Document Support**: Integrated PDF viewer and media streaming for a complete "Office" experience.
*   **Cross-Platform**: Native apps for macOS (Intel/ARM), Windows, and Linux.

### Core Features (In Development)

*   **File Explorer**: Advanced folder management using private Telegram Channels.
*   **Team Collaboration**: Direct integration with Telegram groups for real-time team coordination.
*   **Auto-Updates**: Seamless updates for all desktop platforms.
*   **Drag & Drop**: Intuitive management for files and team resources.
*   **Thumbnail Previews**: Inline thumbnails for images and media files.

##  Screenshots

| Dashboard | File Preview |
|-----------|--------------|
| ![Dashboard](screenshots/DashboardWithFiles.png) | ![Preview](screenshots/ImagePreview.png) |

| Grid View | Authentication |
|-----------|----------------|
| ![Dark Mode](screenshots/DarkModeGrid.png) | ![Login](screenshots/LoginScreen.png) |

| Audio Playback | Video Playback |
|----------------|----------------|
| ![Audio Playback](screenshots/AudioPlayback.png) | ![Video Playback](screenshots/VideoPlayback.png) |

| Auth Code Screen | Upload Example |
|------------------|-------------|
| ![Auth Code Screen](screenshots/AuthCodeScreen.png) | ![Upload Example](screenshots/UploadExample.png) |

| Folder Creation | Folder List View |
|-----------------|------------------|
| ![Folder Creation](screenshots/FolderCreation.png) | ![Folder List View](screenshots/FolderListView.png) |

##  Tech Stack

*   **Frontend**: React, TypeScript, TailwindCSS, Framer Motion
*   **Backend**: Rust (Tauri), Grammers (Telegram Client)
*   **Build Tool**: Vite


##  Getting Started

### Prerequisites

*   **Node.js (v18+)**: [Download here](https://nodejs.org/)
*   **Rust (latest stable)**: Required to compile the Tauri backend. Install via [rustup](https://rustup.rs/):
    *   **macOS/Linux:** `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
    *   **Windows:** Download and run `rustup-init.exe` from [rustup.rs](https://rustup.rs/)
    *   *Verify installation:* run `rustc --version` and `cargo --version` in your terminal.
*   **OS-Specific Build Tools for Tauri**: 
    *   **macOS:** Xcode Command Line Tools (`xcode-select --install`).
    *   **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
    *   **Windows (CRITICAL):** You **must** install the [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/). During installation, select the **"Desktop development with C++"** workload. Without this, you will get a `linker 'link.exe' not found` error.
    *   **Windows (WebView2):** Windows 10/11 users usually have this pre-installed. If not, download the [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section).
    *   *Reference:* See the official [Tauri v2 Prerequisites Guide](https://v2.tauri.app/start/prerequisites/) for detailed instructions.
*   **Telegram API Credentials**: You need your own API ID and API Hash to communicate with Telegram's servers.
    1. Log into [my.telegram.org](https://my.telegram.org).
    2. Go to "API development tools" and create a new application to get your `api_id` and `api_hash`.

> [!NOTE]  
> **First-run Compile Time:** The initial build (`npm run tauri dev` or `npm run tauri build`) will download and compile over 300 Rust crates. This process can take **5 to 15 minutes** depending on your hardware. Subsequent builds will be much faster.

> [!TIP]
> **NPM Vulnerabilities:** You may see vulnerability warnings during `npm install`. These are usually related to build tools and dev dependencies. You can optionally run `npm audit fix`, but it is not strictly required to run the app.

### Installation

1.  **Navigate to the project directory**
    ```bash
    cd tgTeams
    ```

2.  **Install Dependencies**
    ```bash
    cd app
    npm install
    ```

3.  **Run in Development Mode**
    ```bash
    npm run tauri dev
    ```

4.  **Build/Compile**
    ```bash
    npm run tauri build
    ```

##  Open Source & License

This project is **Free and Open Source Software**. You are free to use, modify, and distribute it.

Licensed under the **MIT License**.

---
*Disclaimer: This application is not affiliated with Telegram FZ-LLC. Use responsibly and in accordance with Telegram's Terms of Service.*

If you're looking for a version of this app that's optimized for VPNs check out this repo:
https://github.com/caamer20/Telegram-Drive-ForVPNs

<div align="center">
  <!-- PayPal -->
  <div style="margin: 15px 0;">
    <a href="https://www.paypal.me/Caamer20">
      <img src="https://raw.githubusercontent.com/stefan-niedermann/paypal-donate-button/master/paypal-donate-button.png" alt="Donate with PayPal" width="200">
    </a>
    <div style="font-size: 14px; margin-top: 8px;">paypal.me/Caamer20</div>
  </div>

  <!-- Litecoin -->
  <div style="margin: 15px 0;">
    <a href="litecoin:ltc1q6wkr5ac4u0pxx4hx7xgwn0gsaku25ws0df73rp">
      <img src="https://img.shields.io/badge/Donate-LTC-345D9D?style=for-the-badge&logo=litecoin&logoColor=white" alt="Donate LTC">
    </a>
    <div style="font-family: monospace; font-size: 13px; margin-top: 8px; word-break: break-all;">
      ltc1q6wkr5ac4u0pxx4hx7xgwn0gsaku25ws0df73rp
    </div>
  </div>

  <!-- Bitcoin -->
  <div style="margin: 15px 0;">
    <a href="bitcoin:bc1q5pt7m2fk6w0dzsnf6vvd5k6nw5k44785286ujy">
      <img src="https://img.shields.io/badge/Donate-BTC-F7931A?style=for-the-badge&logo=bitcoin&logoColor=white" alt="Donate BTC">
    </a>
    <div style="font-family: monospace; font-size: 13px; margin-top: 8px; word-break: break-all;">
      bc1q5pt7m2fk6w0dzsnf6vvd5k6nw5k44785286ujy
    </div>
  </div>
</div>
