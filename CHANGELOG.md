# Changelog

All notable changes to YancoTab will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [1.1.0] — 2026-05-06

Performance phase. App boot is leaner; spawn pipeline is correct under concurrency.

### Performance
- **Lazy-load apps** — boot no longer eagerly imports all 20 app classes. Each app's JS is fetched on first launch and cached on the registry entry. Boot script graph drops from ~70 modules to ~25; mid-tier-Android boot saves ~60–250ms of parse time. The service-worker precache list is unchanged so offline-first still holds — the win is JS parse cost, not bytes downloaded.

### Fixed
- **Spawn double-tap regression (high)** — rapid double-tap on an icon previously dropped the second tap silently (returned pid `-1`). Empty-config spawns are now deduped properly: two simultaneous taps share one pid, one window. Single-window-per-icon-tap behavior preserved.
- **Multi-file open from FilesApp** — `spawn('notes', {path:A})` and `spawn('notes', {path:B})` now correctly produce two separate pids and two windows. Previously the second call could collide with the first via the spawn lock and silently fail.
- **Import failure UX** — failed lazy `import()` (network glitch, deleted file, parse error, 15s timeout) emits `system:app-error`; MobileShell shows a "Couldn't load X" toast. Previously failed silently, leaving the user staring at the icon.
- **Import retry** — a rejected loader now clears its cached promise so the next spawn re-attempts. Previously the rejected promise would be reused forever.
- **Service-worker version skew** — when SW activates with a fresh `CACHE_NAME` over an existing tab, all open clients get a `sw-updated` postMessage. MobileShell shows a non-dismissible "New version available — Reload" banner so users don't end up mixing old- and new-version modules in one session.

### Added
- **`tests/process-manager.test.js`** — 16 cases covering register/registerLazy, concurrent spawn dedup, config-bearing spawn isolation, import failure + retry, init failure cleanup, kill-during-init, URL/scheme guards, and lifecycle event order.
- **`tests/_helpers/fakeKernel.js`** — minimal kernel double for testing kernel-coupled subsystems. Sets the convention for future test helpers.

### Internal
- **`processManager.js`** — `_spawning: Set` removed; replaced with `_inflightNoConfig: Map<id, Promise<pid>>` keyed only by empty-config spawns. Config-bearing spawns bypass the dedup. `_resolve()` caches the in-flight import promise on the registry entry; rejection clears it. 15s timeout on `import()` so hung loaders don't permanently lock the entry. 188 → 268 lines.
- **`sw.js`** — `CACHE_NAME` bumped to `yancotab-v1.1.0`. Activate handler now broadcasts `{type:'sw-updated', version}` to clients when an older cache existed (only on real version bumps, not first install).
- **Version bump** across `manifest.json`, `package.json`, `os/version.js` (BUILD `20260506b`), `sw.js`.

---

## [1.0.0] — 2026-05-06

First public release on Chrome Web Store.

### Added — V1 completion polish
- **YancoModal system** — async modal dialogs (`showConfirm`, `showPrompt`, `showAlert`) with glass backdrop, Enter/Escape/click-outside support. Replaces native `confirm()`/`prompt()` in Settings, Todo, QuickLinks (14 call sites). CSS in `css/modal.css`.
- **Mahjong undo** — single-level undo restores the last matched pair. Undo button in header, disabled until a match is made.
- **Mahjong hover highlighting** — free tiles glow with teal outline on hover.
- **Card play animations** — CSS keyframes for `is-place-anim` in Tarneeb and Trix (was dead code with no CSS). Cards slide up and scale in when played to trick table.
- **Haptic feedback** — vibrate on card play (15ms) and trick win (10-30-10ms) in Tarneeb and Trix.
- **Calculator parentheses** — expression stack enables `(2+3)*4=20`. Was broken (returned early).
- **Calculator keyboard input** — digits, operators, Enter, Escape, Backspace all work from physical keyboard.
- **Calculator history** — last 20 calculations shown in toggleable panel, tappable to reuse result.
- **Calculator copy-to-clipboard** — button in display copies current value.
- **Calculator persistence** — angle mode and history saved via `kernel.storage`.

### Changed — V1 completion refactors
- **SettingsApp extraction** — 6 tab modules extracted to `os/apps/settings/` (Appearance, Home, Games, Apps, Browser, About). Shell reduced from 499 to 154 lines.
- **TodoApp CSS extraction** — inline styles moved to `css/todo.css` (381 lines). App reduced from 791 to 408 lines.
- **MapsApp CSS extraction** — inline styles moved to `css/maps.css` (413 lines). App reduced from 681 to 263 lines. Fixed duplicate style injection on every render.
- **TarneebApp view extraction** — UI builders moved to `tarneeb/tarneebView.js` (367 lines). App reduced from 707 to 396 lines.
- **TrixApp view extraction** — UI builders moved to `trix/trixView.js` (465 lines). App reduced from 789 to 314 lines.
- **CalculatorApp compaction** — `KEY_ROWS` constant and `SCI_UNARY` lookup table replace verbose methods. Reduced from 520 to 422 lines.
- **Shared game modules** — `haptics.js`, `overlay.js`, `hash.js` deduplicated from Solitaire/Spider into `os/apps/games/shared/`. 4 duplicate files deleted.

### Removed
- `css/minesweeper.css` — dead file (Minesweeper is a canvas game, never used external CSS).
- `os/apps/games/solitaire/ui/pause.js` — never imported.
- Duplicate `haptics.js` and `overlay.js` from Solitaire and Spider `ui/` directories.

### Added
- **`privacy.html`** — full public privacy policy page (12 sections: data collection, storage, permissions, third-party APIs, COPPA, security, contact). Matches landing.html visual system, self-contained, indexable. Linked from landing.html footer.
- **`_locales/en/messages.json`** — i18n message catalog with `appName`, `appShortName`, `appDescription`. Required for the `__MSG_*__` placeholders in the manifest and as the foundation for future locale additions.

### Added — OCR text recognition (Phases O1–O3: engine, UI, smoke-tested)
- **`vendor/tesseract/`** — vendored tesseract-wasm v0.11.0 (Apache-2.0): `lib.js` (96 KB), `tesseract-core.wasm` (1.8 MB SIMD build), `tesseract-worker.js` (92 KB), `eng.traineddata` (4.0 MB fast model). Full provenance in `PROVENANCE.md`. No fallback WASM (Chrome 102+ targets support SIMD).
- **`os/services/ocrService.js`** — singleton OCR service with lazy initialization. Loads tesseract-wasm on first `recognize()` call; auto-destroys worker after 30 s idle. API: `ocrService.recognize(imageSource, { unit, onProgress })` → `{ text, boxes }`. Uses `chrome.runtime.getURL()` for extension-safe asset resolution; falls back to `import.meta.url` in standalone web-app mode.
- **`os/apps/photos/OcrTool.js`** — self-contained OCR tool panel + bounding-box overlay for PhotoEditor (355 lines). "Aa Text" tool in the sidebar scans the image, shows interactive word bounding boxes, supports click/shift-click selection and Copy All / Copy Selected.
- **`tests/ocr-service.test.js`** — 18 tests covering lifecycle (init, lazy load, re-init after destroy), recognize output (text trimming, structured boxes, confidence fallback, rect isolation), idle timer teardown, concurrency (single-init for parallel calls), error propagation, and asset URL resolution. Full suite now 387/387.

### Fixed
- **OCR textarea visibility** — `el()` helper sets `value` via `setAttribute` which doesn't populate `<textarea>` visible content. Fixed to set `.value` DOM property directly.

### Changed
- **`manifest.json`** — added the three CWS-required fields the audit flagged as missing:
  - `default_locale: "en"` (mandatory once `__MSG_*__` placeholders are used)
  - `content_security_policy.extension_pages` — `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; object-src 'self'` (`wasm-unsafe-eval` required for tesseract-wasm's `WebAssembly.compile()`; allowed in MV3 since Chrome 103)
  - `name` and `description` switched to `__MSG_appName__` / `__MSG_appDescription__`; `short_name` switched to `__MSG_appShortName__`
- **`landing.html`** — footer gains a Privacy link as the first item.
- **`sw.js`** — precache list gains OCR vendor files (`lib.js`, `tesseract-worker.js`, `tesseract-core.wasm`, `eng.traineddata`) and `ocrService.js`.
- **`SECURITY.md`** — updated CSP section to document `wasm-unsafe-eval` allowance with rationale and scope.

### Changed — storage consistency (CLAUDE.md non-negotiable #4)
- **`BrowserApp.js`** — `loadPrefs()`, `savePrefs()`, `loadState()`, `saveState()` all migrated from direct `localStorage` to `kernel.storage`. Two new REGISTRY keys added (`yancotab_browser_prefs_v1`, already in use by the app; `yancotabSearchEngine` was already registered). The one-off legacy-bookmark migration read (`_loadLegacyBookmarks`) stays as direct `localStorage` and is now labeled with a comment.
- **`ClockApp.js`** — `loadState()` and `saveState()` migrated from direct `localStorage` to `kernel.storage`. New REGISTRY key `yancotab_clock_v3` added (the phantom `yancotab_clock_state_v3` key that was in the registry but never written by any app is retained as-is).
- **`FilesApp.js`** — `sortMode`/`viewMode` constructor reads, `setView()`, `showSortMenu()` sort action, `_loadFavorites()`, `_saveFavorites()`, `_loadOrderMap()`, `_saveOrderMap()` all migrated. Four new REGISTRY keys added (`yancotab_files_sort`, `yancotab_files_view`, `yancotab_files_favs`, `yancotab_files_order_v1`). The `getStorageInfo()` loop that iterates all localStorage keys to count total bytes is intentional system-level access and stays, now documented with a comment.
- **`PhotosApp.js`** — `viewMode`, `sortMode` constructor reads and toolbar writes migrated from direct `localStorage` to `kernel.storage`. `_setAsWallpaper()` wallpaper writes also migrated. Legacy gallery migration block stays as intentional direct localStorage (one-shot, now documented with comment).
- **`appStorage.js`** — 9 new REGISTRY entries total: 6 from Browser/Clock/Files migration, plus `yancotab_photos_view`, `yancotab_photos_sort`, `yancotab_wallpaper_custom`.
- **`package.json`** — test script changed from explicit 4-file list to `node --test tests/*.test.js` (covers all 387 tests across 11 files).

### Notes
- Version intentionally **not** bumped. Per the project contract, `manifest.json` / `package.json` / `CHANGELOG.md` move together at release time. These commits land under `[Unreleased]` until the v2.4.0 cut.
- Remaining intentional direct-`localStorage` access: `BrowserApp._loadLegacyBookmarks()`, `FilesApp.getStorageInfo()`, `PhotosApp._migrateLegacyGallery()` — all one-shot migration reads or system-level byte accounting, documented with comments in each file.

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
- **18 built-in apps** — Notes, Todo, Pomodoro, Calculator, Weather, Clock, Browser, Files, Settings, Solitaire, Spider Solitaire, Minesweeper, Mahjong, Snake, Memory, Tic-Tac-Toe, Tarneeb, Trix
- **Desktop UI** — app grid with drag-and-drop, folders, multi-page support, pinnable dock
- **Smart Search** — fuzzy matching, command palette (`>` prefix), quick capture (`!` prefix), keyboard navigation
- **Greeting bar** — time-of-day greeting with Playfair Display serif font, date, live clock
- **Widget bar** — glanceable clock, weather, todo (inline checkboxes), pomodoro widgets
- **Quick links** — favicon row for favorite sites
- **Cosmic glass design** — starfield background, glass morphism, 7 wallpapers, light/dark mode
- **Cosmic Klondike** — full Solitaire rewrite with Draw-1/3, Vegas scoring, daily deals, seeded RNG, unlimited undo, win cascade, card-back gallery
- **Cosmic Spider** — full Spider Solitaire rewrite with 1/2/4-suit difficulty, persistence, stats
- **OCR text recognition** — extract text from images in Photos app via tesseract-wasm
- **PDF Reader** — open, import, save, print PDFs with drag-and-drop support
- **Onboarding** — 3-step first-run flow (welcome, personalize, done)
- **Toast notifications** — glass pill feedback for user actions
- **Keyboard shortcuts** — Ctrl+K search, Escape close, Ctrl+, settings
- **Privacy policy** — full privacy.html page for store compliance
- **i18n** — `_locales/en/messages.json` for CWS manifest localization
- **Lazy loading** — apps load on first launch, boot loads only core modules
- **Unified storage** — AppStorage with envelope format, chrome.storage.sync, chunking, export/import
- **Virtual filesystem** — localStorage-backed with directories, rename, move, search
- **AI card games** — Tarneeb and Trix with intelligent AI opponents
- **Offline-first** — service worker caches everything, works without network
- **Zero tracking** — no analytics, no telemetry, no accounts, `storage` permission only

[1.0.0]: https://github.com/YamanAddas/YancoTab/releases/tag/v1.0.0
