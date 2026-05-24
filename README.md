# CopyBox

A lightweight local clipboard manager with dual-window UI. Built with Tauri 2 + React.

## Features

- **Auto-monitoring** — captures text, links, images, files, and code snippets from the clipboard
- **Mixed content** — when you copy multiple types at once (e.g. text + image), they're grouped as one compound entry
- **8-category sidebar** — filter by all, text, link, image, file, code, favorite, or compound
- **Mini window** — a compact floating panel for quick access; includes one-click screenshot capture
- **Detail panel** — click any item to preview full content in the right workspace
- **History management** — pin favorites, soft-clear items, bulk delete (all, older than N days, all images)
- **Copy to clipboard** — re-copy any history item; compound entries support per-type copy
- **Global hotkey** — `Ctrl+Space` to show/hide (configurable)
- **System tray** — double-click tray icon to toggle window, right-click for menu
- **Auto-updater** — checks GitHub releases for new versions
- **Light / Dark theme**
- **Auto-start on boot** (Windows)
- **Custom storage path** — move clipboard database to any folder
- **Storage controls** — configurable total limit, auto-clean old entries, cache cleanup
- **Context menu** — right-click: copy, favorite, export, delete
- **SQLite** local database, fully offline

## Screenshots

| Main Window | Mini Window |
|---|---|
| 3-panel: sidebar / history / detail | Compact list + screenshot |

## Tech Stack

| Layer    | Technology                              |
| -------- | --------------------------------------- |
| Desktop  | Tauri 2 (Rust)                          |
| Frontend | React 18 + TypeScript + Vite            |
| Styling  | Tailwind CSS 3 + Framer Motion          |
| Storage  | SQLite (via rusqlite, bundled)          |
| Icons    | Lucide React                            |

## Requirements

- Node.js v18+
- Rust toolchain (rustup)
- Windows 10/11

## Quick Start

```bash
npm install
npm run tauri dev
```

The app opens the main window. Press `Ctrl+Space` or double-click the tray icon to show/hide.

## Shortcuts

| Key            | Action                     |
| -------------- | -------------------------- |
| `Ctrl+Space`   | Show / Hide (configurable) |
| `Delete`       | Delete selected item       |
| Double-click   | Open in text viewer / image |
| Tray double-click | Toggle window           |

## Settings

| Setting              | Default | Description                          |
| -------------------- | ------- | ------------------------------------ |
| Max text length      | 10,000  | Characters before truncation         |
| Max image size       | 10 MB   | Images above this are dropped        |
| Max file size        | 50 MB   | Files above this are dropped         |
| Total storage limit  | 500 MB  | Auto-deletes oldest non-favorite items |
| Auto-clean days      | 30      | Remove non-favorite items older than N days |
| Start minimized      | off     | Start in system tray                  |
| Storage path         | default | Custom folder for clipboard.db        |
| Theme                | dark    | dark / light                          |
| Auto-start           | off     | Launch on Windows boot                |

## Project Structure

```
copybox/
├── src/                              # React frontend
│   ├── main.tsx                      # Main window entry
│   ├── mini.tsx                      # Mini window entry
│   ├── App.tsx                       # Root component
│   ├── index.css                     # Tailwind + glass styles
│   ├── types.ts                      # TypeScript types
│   └── components/
│       ├── Sidebar.tsx               # Category navigation
│       ├── FloatingPanel.tsx         # History list with search + bulk actions
│       ├── DetailPanel.tsx           # Right-side preview workspace
│       ├── HistoryItem.tsx           # Single clipboard entry
│       ├── SearchBar.tsx             # Search + filter
│       ├── SettingsPanel.tsx         # Settings form
│       ├── MiniWindow.tsx            # Mini floating window
│       ├── Titlebar.tsx              # Custom title bar
│       ├── ContextMenu.tsx           # Right-click menu
│       ├── TextViewer.tsx            # Full-text modal
│       └── ShortcutCapture.tsx       # Hotkey configuration UI
├── src-tauri/                        # Tauri (Rust) backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   ├── icons/
│   └── src/
│       ├── main.rs                   # Binary entry point
│       ├── lib.rs                    # Tauri commands + app setup
│       ├── db.rs                     # SQLite schema + CRUD
│       ├── clipboard.rs              # Clipboard polling + content detection
│       └── tray.rs                   # System tray
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

## Database

SQLite file location (default):

- Windows: `%APPDATA%/com.copybox.app/clipboard.db`

Custom path can be set in Settings.

## Building

```bash
npm run tauri build
```

Output in `src-tauri/target/release/`.

## Updating

The app checks for updates on startup via GitHub Releases. When a new version is available, a notification appears.
