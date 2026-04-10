# YancoTab

Your personal desktop in every new tab.

A full desktop experience running in your browser — apps, games, notes, weather — all local, all free, no account needed.

## Features

- **Full Desktop Experience** — App grid, dock, folders, drag-and-drop
- **18 Apps** — Browser, Notes, Todo, Pomodoro, Calculator, Weather, Clock, Files, Settings, and 9 games
- **Privacy First** — Everything runs locally. No accounts, no tracking, no servers
- **Works Offline** — Service worker caches everything for offline use
- **Cross-Device Sync** — As a Chrome extension, settings sync via Chrome
- **Beautiful Design** — Cosmic glass theme with starfield backgrounds

## Install as Chrome Extension

1. Clone this repo
2. Go to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select this folder
5. Open a new tab

## Run as Web App

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`

## Project Structure

```text
YancoTab/
├── index.html          # Main app
├── landing.html        # Marketing page
├── manifest.json       # Chrome Extension manifest (MV3)
├── sw.js               # Service worker (standalone only)
├── css/                # Design system
├── os/
│   ├── apps/           # All 18 apps
│   ├── core/           # Process manager, App base class
│   ├── services/       # Storage, clock, weather, filesystem
│   ├── ui/             # Shell, components, starfield
│   ├── boot.js         # App registration and boot sequence
│   └── kernel.js       # Core kernel
└── assets/             # Icons, wallpapers
```

## Support

If you like YancoTab, consider [buying me a coffee on Ko-fi](https://ko-fi.com/yamanaddas).

## License

MIT License. Copyright 2026 Yaman Addas.
