# TgGuild

<div align="center">
  <img src="Public/baner.png" alt="TgGuild Banner" width="100%">
  <br />
  <img src="Public/logo.png" alt="TgGuild Logo" width="120">
  <h3>The Ultimate Collaborative Workspace Powered by Telegram</h3>
</div>

---

**TgGuild** is an open-source, cross-platform collaboration and storage powerhouse. It transforms your Telegram account into a unified workspace—serving as a secure, unlimited alternative to both **Google Drive** and **Microsoft Teams**. Built with **Tauri**, **Rust**, and **React**.

> [!IMPORTANT]
> This project is inspired by and expanded from the [Telegram-Drive](https://github.com/caamer20/Telegram-Drive) repository. We have significantly extended its capabilities to include comprehensive Microsoft Teams integration and Google Workspace-style features for a complete team ecosystem.

---

## 🚀 Key Features

### 📂 Advanced Drive Functionalities
*   **Infinite Storage**: Leveraging Telegram's unlimited cloud storage for all your assets.
*   **File & Folder Management**: Full-featured drive operations—create, rename, move, and organize folders with ease.
*   **Collaboration First**: Add members to specific drive folders for real-time collaborative work.
*   **Drag & Drop**: Intuitive and high-performance file management interface.

### 👥 Enterprise Team Management
*   **Microsoft Teams Inspired**: Bringing familiar channel structures and team communication into the Telegram ecosystem.
*   **Google Workspace for Teams**: Integrated features for document management and team coordination directly within the app.
*   **Robust Team Management**: Powerful controls for managing team members, roles, and workspace visibility.
*   **1:1 & Group Meetings**: Built-in coordination for direct meetings and group collaboration.
*   **Corporate Hierarchy**: Features tailored for company-wide management and department-specific workspaces.

### 🛠️ Technical Excellence
*   **Privacy & Security**: End-to-end focus where all API keys and data stay local. No third-party servers.
*   **High-Performance Grid**: Virtual scrolling handles thousands of files and folders instantly.
*   **Media & Document Support**: Integrated PDF viewer, media streaming, and rich file previews.
*   **Cross-Platform Native**: High-performance apps for Windows, macOS, and Linux built with Tauri & Rust.

---

## 📸 Screenshots

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

---

## 🛠️ Tech Stack

*   **Frontend**: React 19, TypeScript, TailwindCSS, Framer Motion
*   **Backend**: Rust (Tauri v2), Grammers (High-performance Telegram Client)
*   **Build Tool**: Vite, Cargo

---

## 🚀 Getting Started

### Prerequisites

*   **Node.js (v18+)**
*   **Rust (latest stable)**
*   **OS-Specific Build Tools**:
    *   **Windows**: Visual Studio Build Tools with "Desktop development with C++" workload.
    *   **macOS**: Xcode Command Line Tools.
    *   **Linux**: `libwebkit2gtk-4.1-dev`, `build-essential`, etc.
*   **Telegram API Credentials**: Get your `api_id` and `api_hash` from [my.telegram.org](https://my.telegram.org).

### Quick Start

1.  **Clone and Install Dependencies**
    ```bash
    git clone https://github.com/yourusername/TgGuild.git
    cd TgGuild/app
    npm install
    ```

2.  **Generate App Icons**
    ```bash
    npm run tauri icon ../Public/logo.png
    ```

3.  **Run Development Mode**
    ```bash
    npm run tauri dev
    ```

4.  **Build Production App**
    ```bash
    npm run tauri build
    ```

---

## 📄 License

This project is licensed under the **MIT License**.

---
*Disclaimer: This application is not affiliated with Telegram FZ-LLC. Use responsibly and in accordance with Telegram's Terms of Service.*

---

<div align="center">
  <p>If you like this project, consider supporting the original developer of Telegram-Drive:</p>
  <a href="https://www.paypal.me/Caamer20">
    <img src="https://raw.githubusercontent.com/stefan-niedermann/paypal-donate-button/master/paypal-donate-button.png" alt="Donate with PayPal" width="200">
  </a>
</div>
