# Changelog

All notable changes to YancoTab will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

---

## [2.3.3] — 2026-04-24

### Fixed
- **Spider drag snap-back discipline** — cards dropped anywhere outside a legal target now glide back to their source position instead of freezing at the release point. The 2-suit "cards go all over" chaos was caused by two interacting bugs:
  - `CardView.update()` short-circuited when the logical coords matched — so when `drag.js` wrote `style.transform` directly during a gesture, `cur` went stale and the post-dispatch `_render` silently refused to correct the position.
  - `drag.js._onUp` re-parsed the mid-drag `style.transform` with a regex and wrote it back to itself, which was a no-op on paths where no dispatch follows (illegal drops, non-tableau drops, same-column drops). `_onCancel` never snapped back at all.
- Fix: `CardView.update` always refreshes `cur` and gates the DOM write on the `.dragging` class. `drag.js` caches each card's pre-drag transform + zIndex in `dataset.dragBase{X,Y,Z}` at `_beginDrag`, and a shared `_snapBackDragged()` restores all three on both `_onUp` and `_onCancel`. `_updateDropHint` also now pre-validates legality (target top rank = head rank + 1, or empty column) so no-op hovers over the source column and mismatched-rank columns don't glow as if they were valid drop zones.
- **Topmost-card glow for drop hints** — non-empty tableau columns now light the topmost card with a new `.hot-target` class (accent outline + drop-shadow, token-sourced) so the hint is visible above stacked cards instead of being hidden behind them.

### Added
- Regression suite `tests/spider-drag-snapback.test.js` — 4 tests with a DOM shim covering illegal drop, non-tableau drop, pointer cancel, and the tap (no-movement) path. Wired into `npm test`. Full project suite now 369/369.

### Changed
- Service worker cache bumped to `yancotab-v2.3.3` to force eviction of the pre-fix `drag.js` / `CardView.js` that broke 2-suit drag on any cached install.

---

## [2.3.2] — 2026-04-24

### Added
- **Cosmic Spider (Spider Solitaire rewrite)** — wholesale replacement of the legacy broken Spider with a Yanco-themed rebuild matching the Solitaire architecture:
  - Pure engine + view split under `os/apps/games/spider/` (state, rules, moves, hints, deal, reducer)
  - 1-suit / 2-suit / 4-suit difficulty picker on the start screen; deck composition and shuffle are seeded (Mulberry32) for reproducible deals
  - 10-column tableau, stock dealt in rows of 10, K→A same-suit runs auto-collected to foundation (no manual sends), 8 foundation trophy slots tracking completed suits
  - Unlimited undo/redo, ranked hint engine (flip > empty > same-suit build > empty-target), stuck detection when no legal move AND stock is empty
  - Tap-to-move routes to the best legal destination; pointer-based drag with 6px/150ms disambiguation; Pointer Events throughout
  - Pause overlay (reuses the main menu pattern); keyboard shortcuts (N/U/R/Space/H/P/Esc)
  - Persistence through `kernel.storage` — game survives browser close; resume prompt on reopen; per-difficulty stats (best time/moves/score) in the Stats panel
  - Haptics (`navigator.vibrate`) for pickup/place/invalid/win; shared card-back gallery (Nebula/Hex/Warp/Aurora), 2-color + 4-color suit modes, left-handed mirror
  - New stylesheet `css/cosmic/spider.css` — difficulty picker + stock-pile indicator + per-difficulty stat blocks; all colors resolve to tokens from `css/tokens.css`
- Test suite `tests/spider-engine.test.js` — 64 tests covering state/rules/moves/hints/reducer/deal; full project suite stays green (365 tests)

### Changed
- `os/boot.js` lazy-registers `spider-solitaire` to the new `os/apps/games/spider/SpiderSolitaireApp.js` path
- Legacy `os/apps/games/SpiderSolitaireApp.js` removed (cardEngine retained — still used by Tarneeb/Trix)
- AppStorage REGISTRY: added `yancotab_spider_save`, `yancotab_spider_stats`, `yancotab_spider_settings` keys
- Service worker cache bumped to `yancotab-v2.3.2`, new Spider asset manifest added so fresh installs precache the full game

### Fixed
- Broken legacy Spider (DOM-owning cards, global `document.onmousemove`/`ontouchmove` drag, direct `localStorage`, no undo/redo, no seed, no stats, no save) is now a playable, persistent, Yanco-themed game

---

## [2.3.1] — 2026-04-24

### Added
- **Cosmic Klondike (Solitaire rewrite)** — complete replacement of the legacy blue Solitaire with a full Yanco-themed rebuild:
  - Pure engine + view split under `os/apps/games/solitaire/` (state, rules, moves, scoring, hints, solver)
  - Seeded Mulberry32 RNG for reproducible deals; Daily Deal keyed to UTC date
  - Draw-1/Draw-3 modes, Standard/Vegas/Cumulative Vegas scoring, timed/relaxed toggle
  - Winnable-only deals via bounded DFS solver; stuck detection when no legal moves remain
  - Unlimited undo/redo, ranked hint engine, auto-finish when board is solved-but-not-done
  - Tap-to-move and smart drag with 6px/150ms disambiguation; Pointer Events throughout
  - Pause overlay with timer freeze; keyboard shortcuts (N/U/R/Space/H/A/P/Esc)
  - Persistence through `kernel.storage` — game survives browser close; resume prompt on reopen
  - Win 3.x-style card cascade on victory (physics fountain per suit, 80ms spawn, gravity + bounce damping); static gold-halo fallback on `prefers-reduced-motion`
  - Haptics (`navigator.vibrate`) for pickup/place/invalid/win
  - 4 card backs (Nebula/Hex/Warp/Aurora), 2-color + 4-color suit modes, left-handed mirror
  - Stats panel with per-mode aggregates, Vegas bank tracking, streaks, best time/moves/score
  - New stylesheet `css/cosmic/solitaire.css` — all colors resolve to tokens from `css/tokens.css`
- `ui/haptics.js` and `ui/pause.js` helper modules to keep `SolitaireApp.js` under the 500-line cap

### Changed
- `os/boot.js` now lazy-registers `solitaire` to the new cosmic path; legacy `os/apps/games/SolitaireApp.js` and `cardEngine/` removed
- AppStorage REGISTRY: `yancotab_solitaire_settings` gains `timed: true` default, `yancotab_solitaire_stats` gains `vegasBank: 0`
- One-shot migration from legacy `yancotab_card_settings` localStorage key on first run
- Service worker cache bumped to `yancotab-v2.3.1` to force eviction of stale blue Solitaire assets

### Fixed
- Version bumped to v2.3.1 across `manifest.json`, `package.json`, `os/version.js`, and `sw.js` — this bump is itself the fix for users seeing cached v2.3.0 assets (old blue Solitaire) after the mid-2.3.x rewrite

---

## [2.3.0] — 2026-04-12

### Added
- **Greeting bar** — time-of-day personalized greeting (Good morning/afternoon/evening/night) with user name, date, and inline weather summary
- **Widget bar** — Bento-style horizontal widget row with 4 built-in widgets:
  - **Clock widget** — large digital time + date, live updating
  - **Weather widget** — temp + city + high/low from cached data
  - **Todo widget** — top 3 undone tasks with inline checkboxes (toggle without opening app)
  - **Pomodoro widget** — live countdown + progress bar when timer active
- **Quick links row** — favicon circles for favorite sites; default: Google, YouTube, GitHub, Wikipedia, Reddit; add/remove via tap/long-press
- **Command palette** — SmartSearch extended with `>` prefix for commands (`> new note`, `> add todo`, `> dark`, `> light`, `> export`) and `!` prefix for quick capture to Notes
- **Toast notification system** — glass pill notifications at bottom-center; 4 types (success/error/info/warning); auto-dismiss 3s; stackable up to 3; triggered via `kernel.emit('toast')`
- **Keyboard shortcuts** — Ctrl+K focus search, Escape close app/unfocus, Ctrl+, open Settings
- **First-run onboarding** — 3-step modal flow: Welcome → Personalize (name, theme, search engine) → Done; auto-dismiss on step 3; sets `yancotab_onboarding_done` flag
- New storage keys: `yancotab_user_name`, `yancotab_widgets`, `yancotab_quick_links`, `yancotab_onboarding_done`, `yancotab_discovery_dismissed`
- Version bumped to v2.3.0

---

## [2.2.0] — 2026-04-12

### Added
- Light theme with full CSS token overrides (`body.theme-light`) — backgrounds, accents, text, borders, shadows, glass, scrollbars, focus styles
- OS `prefers-color-scheme` auto-detection when no theme is explicitly set
- Unified icon system (`os/ui/icons/AppIcons.js`) with category-based container backgrounds (productivity, media, utilities, games, external)
- SmartSearch dropdown with fuzzy matching (exact/prefix/substring/initials scoring), keyboard navigation (arrows + Enter + Escape), file results, and web search fallback
- SmartSearch URL safety validation (blocks `javascript:`, `data:`, `blob:`, `file:` schemes)
- SmartSearch respects user's search engine preference (Google/DuckDuckGo/Bing)
- App error boundaries — crashed apps show error message with Restart button instead of breaking the shell
- Starfield Settings toggle (`yancotab_starfield_enabled` key)
- WebP wallpapers (95% smaller than PNG originals)

### Changed
- Apps now lazy-load on first launch via `registerLazy()` — boot loads only 5 core modules instead of 70+
- Starfield reduced from 120 to 80 stars; skips entirely when wallpaper image is active; caps FPS to 30 when window unfocused
- Service worker cache version synced with `os/version.js` (was hardcoded)
- Storage consistency: NotesApp, StatusBar, SettingsApp, WeatherService now route through `kernel.storage` instead of direct `localStorage`
- AppStorage REGISTRY keys fixed to match actual localStorage keys used by services
- Version bumped to v2.2.0 across manifest.json, version.js, and sw.js

### Planned (v2.3.0 — Delight)
- Greeting bar with personalized message and date
- Home screen widgets (clock, weather, next todo, pomodoro)
- Keyboard shortcuts (Ctrl+K search, Escape home)
- Command palette (SmartSearch v2)
- Toast notification system
- First-run onboarding experience
- Quick links / favorites row

### Planned (v2.4.0 — Store Launch)
- Chrome Web Store submission
- Edge Add-ons submission
- Internationalization (_locales)
- Privacy policy page
- Store listing assets (screenshots, tiles)

---

## [2.1.0] — 2026-04-10

Initial release of YancoTab.

### Added
- 18 apps: Browser, Notes, Todo, Pomodoro, Calculator, Weather, Clock, Files, Settings, Solitaire, Spider Solitaire, Minesweeper, Mahjong, Snake, Memory, Tic-Tac-Toe, Tarneeb, Trix
- Chrome Extension (MV3) with new tab override
- Cosmic glass design system with CSS custom properties
- Animated starfield background (canvas-based, 120 stars)
- App grid with drag-and-drop, folders, multi-page support
- Dock with pin/unpin, reorder, drag-to-grid
- Smart Search bar (app search + web fallback)
- Status bar with real-time clock and battery indicator
- Unified storage layer (AppStorage) with:
  - Key registry with validation and defaults
  - Envelope format with timestamps and sequence numbers
  - Chrome storage sync with chunking for large data
  - Last-write-wins conflict resolution with device ID tiebreak
  - Cross-tab change detection
  - Export/Import with automatic backup
- Virtual filesystem (localStorage-backed) with directories, rename, move, search
- Process manager with PID lifecycle, spawn locking, safe URL validation
- Service worker for offline support (standalone web app mode)
- 7 wallpapers (black, dark, deep-blue, mint, pink, sky, violet)
- Light/dark mode toggle
- Boot sequence with smoke checks, error overlays, 12-second timeout fallback
- Default app folders (AI, TV, Social) with favicon auto-fetch
- Alarm overlay system for Clock app
- Card game engine with shared Deck/Card primitives
- AI opponents for Tarneeb and Trix card games
- Game state management via FSM (finite state machine)
- Responsive design with orientation detection and safe area support
- Accessibility: aria attributes, prefers-reduced-motion, focus-visible outlines
- Landing page (landing.html) with feature showcase

[Unreleased]: https://github.com/YamanAddas/YancoTab/compare/v2.3.0...HEAD
[2.3.0]: https://github.com/YamanAddas/YancoTab/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/YamanAddas/YancoTab/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/YamanAddas/YancoTab/releases/tag/v2.1.0
