# YancoTab

**Your personal desktop in every new tab.**

A full desktop experience running in your browser — apps, games, notes, weather — all local, all free, no account needed.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-green.svg)](manifest.json)
[![Version](https://img.shields.io/badge/version-2.1.0-teal.svg)](CHANGELOG.md)

---

## What Is YancoTab?

YancoTab replaces your browser's new tab page with a full desktop — app grid, dock, folders, drag-and-drop, search bar, and 18 built-in apps. Everything runs locally in your browser. No accounts, no tracking, no servers.

**Not another wallpaper page. Not another bookmark bar. A real desktop.**

## Features

### 18 Built-In Apps

| Productivity | Games |
|-------------|-------|
| Notes — tags, search, pin, autosave | Solitaire & Spider Solitaire |
| Todo — multiple lists, due dates | Minesweeper |
| Pomodoro — focus timer with sessions | Mahjong |
| Calculator | Snake |
| Weather — 10-day forecast, air quality | Memory |
| Clock — alarms, timer, stopwatch | Tic-Tac-Toe |
| Browser — in-tab with bookmarks | Tarneeb (Arabic card game with AI) |
| Files — virtual file manager | Trix (Arabic card game with AI) |
| Settings | |

### Core Experience
- **Desktop UI** — App grid, dock, folders, drag-and-drop rearrangement
- **Smart Search** — Search apps, files, and the web from one search bar
- **Cosmic Glass Design** — Starfield background, glass morphism, smooth animations
- **7 Wallpapers** — Dark, light, and colorful themes
- **Light & Dark Mode** — Toggle or follow system preference

### Privacy & Performance
- **Privacy First** — Zero analytics, zero telemetry, zero tracking. Your data never leaves your browser
- **Works Offline** — Service worker caches everything. Even weather shows cached data offline
- **Cross-Device Sync** — Settings and data sync via Chrome's built-in sync (extension mode only)
- **Minimal Permissions** — Only `storage`. No access to history, tabs, or browsing data
- **Open Source** — MIT licensed. Inspect every line of code

## Install

### Chrome Extension (Recommended)

1. Clone this repo or [download the ZIP](https://github.com/YamanAddas/YancoTab/archive/refs/heads/main.zip)
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the YancoTab folder
5. Open a new tab — YancoTab is now your new tab page

> Chrome Web Store listing coming soon.

### Web App

```bash
git clone https://github.com/YamanAddas/YancoTab.git
cd YancoTab
python3 -m http.server 8000
```

Open `http://localhost:8000`

## Project Structure

```
YancoTab/
├── index.html              Main app (new tab page)
├── landing.html            Marketing / landing page
├── privacy.html            Privacy policy
├── manifest.json           Chrome Extension manifest (MV3)
├── sw.js                   Service worker (standalone web app only)
├── css/
│   ├── tokens.css          Design system tokens (colors, spacing, etc.)
│   ├── reset.css           CSS reset
│   ├── shell.css           Shell layout styles
│   ├── main.css            App window and component styles
│   └── [game].css          Per-game stylesheets
├── os/
│   ├── boot.js             App registration and boot sequence
│   ├── boot-init.js        Service worker registration, debug overlay
│   ├── boot-loader.js      ES module entry point
│   ├── kernel.js            Core kernel (services, bus, state)
│   ├── version.js          Version constants
│   ├── core/
│   │   ├── App.js          Base app class
│   │   └── processManager.js  App lifecycle management
│   ├── apps/               All 18 app implementations
│   │   ├── games/          Game apps + shared engine
│   │   └── ...
│   ├── services/
│   │   ├── appStorage.js   Unified storage layer + sync
│   │   ├── clockService.js Clock, alarms, timers
│   │   ├── weatherService.js  Weather API integration
│   │   └── fileSystemService.js  Virtual filesystem
│   ├── ui/
│   │   ├── mobileShell.js  Top-level shell (all devices)
│   │   ├── starfield.js    Canvas starfield background
│   │   └── components/     UI components (grid, dock, search, etc.)
│   ├── theme/
│   │   └── theme.js        Light/dark mode management
│   └── config/
│       └── defaultApps.js  Default folder contents (AI, TV, Social)
└── assets/
    ├── icons/              Extension icons (16, 32, 48, 128)
    ├── wallpapers/         7 wallpaper images
    └── browser-icon.png    Browser app icon
```

## Technical Highlights

- **Zero dependencies** — No npm, no webpack, no frameworks. Pure vanilla JavaScript with ES modules
- **MV3 compliant** — Manifest V3 with strict CSP, no inline scripts, no remote code
- **Robust storage** — AppStorage layer with key registry, validation, migrations, envelope format, chrome.storage.sync with chunking and conflict resolution
- **Process manager** — PID-based lifecycle, spawn locking, safe URL validation
- **Virtual filesystem** — localStorage-backed FS with directories, rename, move, search
- **Card game engine** — Shared deck/card primitives, FSM for game state, AI opponents

## Data & Privacy

YancoTab makes network requests only for:
- **Weather data**: Open-Meteo API (no API key required)
- **City search**: Open-Meteo Geocoding API
- **Reverse geocoding**: OpenStreetMap Nominatim
- **Website favicons**: Google Favicon API (for bookmark icons)

No user data is sent in any request. See [SECURITY.md](SECURITY.md) for details.

## Support

If you like YancoTab, consider [buying me a coffee on Ko-fi](https://ko-fi.com/yamanaddas).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT License. Copyright 2026 Yaman Addas.
