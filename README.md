# CopyBox

A lightweight local clipboard manager with a floating panel UI. Built with Tauri + React.

## Features

- Auto-monitors clipboard text content (polling every 500ms)
- History list with time-sorted entries
- Click any item to re-copy to clipboard
- Pin/favorite items for permanent storage
- Search and filter history
- Settings: set max text length, image/file size limits
- System tray integration
- Global hotkey: `Ctrl+Space` to show/hide
- Dark frosted-glass floating panel UI
- SQLite local database

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
- Windows 10/11 or macOS

## Quick Start

```bash
# 1. Install Node dependencies
npm install

# 2. Run in development mode
npm run tauri dev
```

The app starts hidden. Press `Ctrl+Space` to open the floating panel.

## Shortcuts

| Key           | Action              |
| ------------- | ------------------- |
| Ctrl+Space    | Show / Hide panel   |
| Click item    | Copy to clipboard   |
| Star icon     | Toggle favorite     |
| Click outside | Auto-hide panel     |

## Settings

Access via the gear icon or tray menu. Configurable:

- **Max text length** — characters before truncation (default: 10,000)
- **Max image size** — MB limit (default: 10)
- **Max file size** — MB limit (default: 50)

Over-limit content is silently truncated/dropped.

## Project Structure

```
copybox/
├── src/                          # React frontend
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Root component
│   ├── index.css                 # Tailwind + glass styles
│   ├── types.ts                  # TypeScript types
│   └── components/
│       ├── FloatingPanel.tsx     # Main history view
│       ├── HistoryItem.tsx       # Single clipboard entry
│       ├── SearchBar.tsx         # Search input
│       └── SettingsPanel.tsx     # Settings form
├── src-tauri/                    # Tauri (Rust) backend
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri configuration
│   ├── capabilities/default.json # Permission grants
│   ├── icons/                    # App icons
│   └── src/
│       ├── main.rs               # Entry + Tauri commands
│       ├── db.rs                 # SQLite schema + CRUD
│       ├── clipboard.rs          # Clipboard polling loop
│       └── tray.rs               # System tray setup
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

## Database

SQLite file location:

- Windows: `%APPDATA%/com.copybox.app/clipboard.db`
- macOS:   `~/Library/Application Support/com.copybox.app/clipboard.db`

## Building

```bash
npm run tauri build
```

Output in `src-tauri/target/release/`.
