# YancoTab — Production Plan

> Master plan for taking YancoTab from v2.1.0 to Chrome Web Store and beyond.
> Last updated: 2026-04-12

---

## Table of Contents

1. [Vision](#vision)
2. [Design Philosophy — The Concept Fight](#design-philosophy--the-concept-fight)
3. [Current State Assessment](#current-state-assessment)
4. [Competitive Landscape](#competitive-landscape)
5. [Release Roadmap](#release-roadmap)
6. [Phase 1 — Harden (v2.2.0)](#phase-1--harden-v220)
7. [Phase 2 — Delight (v2.3.0)](#phase-2--delight-v230)
8. [Phase 3 — Store Launch (v2.4.0)](#phase-3--store-launch-v240)
9. [Phase 4 — Grow (v2.5.0+)](#phase-4--grow-v250)
10. [Visual Design System](#visual-design-system)
11. [Icon System](#icon-system)
12. [Widget System Specification](#widget-system-specification)
13. [Onboarding Flow](#onboarding-flow)
14. [Asset Production Guide](#asset-production-guide)
15. [Architecture Invariants](#architecture-invariants)
16. [Testing Strategy](#testing-strategy)
17. [Store Submission Checklist](#store-submission-checklist)

---

## Vision

YancoTab is a **local-first desktop OS inside the browser's new tab**. Every competitor is either a wallpaper+clock (Momentum, Bonjourr) or a bookmark organizer (Speed Dial, Infinity). YancoTab is the only extension that gives users a full app platform — 18+ apps, a virtual filesystem, a process manager, drag-and-drop desktop management — all running locally with zero accounts, zero tracking, zero servers.

**Core principles:**
- **Speed first** — A new tab must load faster than Chrome's default, never slower
- **Privacy by architecture** — No telemetry, no analytics, no remote calls except weather/geocoding APIs
- **Everything works offline** — Service worker ensures full offline operation
- **No lock-in** — Export everything, import everywhere, open source MIT

---

## Design Philosophy — The Concept Fight

We evaluated 5 radical design directions against YancoTab's existing "desktop OS" approach. Here's what survived:

### Concepts Evaluated

**1. ORBIT — Spatial Context Engine**
Physics-based spatial map where nodes cluster by project. Tabs and bookmarks float, drift, and cluster.
- **Verdict: Killed.** Too abstract, high learning curve, unfamiliar interaction model.
- **Salvaged: Focus Mode.** The concept of collapsing everything down to a single active context is powerful. Adopted for Phase 4 as a toggle that hides the grid and shows only clock + one task + Pomodoro timer.

**2. SIGNAL — Ambient Intelligence Dashboard**
Zero-interaction information surface. Bloomberg-terminal density, auto-prioritized by time of day.
- **Verdict: Killed.** Requires external API integrations (GitHub, Slack, email), violating our privacy principle. Too dense for a new tab glance.
- **Salvaged: Time-aware greeting + glanceable widgets.** The insight that a morning new tab should feel different from an evening one is real. Adopted as time-of-day greeting with contextual emphasis. The "glanceable surface" principle drives widget design — one primary metric per widget, zero interaction required to get value.

**3. GROVE — Digital Garden Start Page**
Knowledge garden with "seeds" (ideas/links/notes) that grow into interconnected nodes.
- **Verdict: Killed.** Too niche, too complex for a new tab that opens 50 times/day.
- **Salvaged: Quick Capture.** The idea of a front-and-center input box for capturing a fleeting thought is excellent. Adopted as a mode in SmartSearch — type a thought, press Enter, it becomes a note or todo without ever opening the app. Also adopted: "empty-state education" — when an app has no data, show what it could do.

**4. ATLAS — Mission Control with XP**
Gamified HQ with daily missions, XP, character levels, and boss battles for weekly goals.
- **Verdict: Killed.** Gamification is divisive and adds complexity. RPG framing doesn't match the "clean desktop" identity.
- **Salvaged: Optional streaks.** A small, subtle streak counter for Pomodoro sessions and Todo completions. Not XP, not levels — just "5-day streak" shown as a tiny badge. Opt-in via Settings.

**5. PANE — Modular Widget Canvas**
iOS-style freeform widget canvas with drag, resize, and snap-to-grid.
- **Verdict: Partially adopted.** Full freeform canvas is over-engineered for v2. But the Bento-grid widget layout IS the right approach for the home screen.
- **Adopted: Bento Widget Grid.** Fixed-position widget cards above the app grid. Users choose which widgets to show via Settings. Widgets are pre-sized (small/medium/large), not arbitrarily resizable. This gives 80% of the PANE value at 20% of the complexity.

### What YancoTab Becomes

The home screen evolves from "just an app grid" to a **layered information surface**:

```
┌─────────────────────────────────────────────────┐
│  StatusBar (time, battery)                       │
├─────────────────────────────────────────────────┤
│  Greeting ("Good morning, Yaman")                │
│  Wednesday, April 12 · Partly Cloudy 22°C        │
├─────────────────────────────────────────────────┤
│  SmartSearch / Command Palette                   │
│  [Search apps, web, or type > for commands...]   │
├─────────────────────────────────────────────────┤
│  Widget Bar (optional, user-configured)          │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ ⏰ 14:32  │ │ ⛅ 22°C  │ │ ✅ Buy milk     │  │
│  │ Wed Apr12 │ │ London   │ │    Call dentist  │  │
│  └──────────┘ └──────────┘ └────────────────┘  │
├─────────────────────────────────────────────────┤
│  Quick Links (optional)                          │
│  [G] [YT] [GH] [Wiki] [Reddit] [+]              │
├─────────────────────────────────────────────────┤
│  App Grid (pages, folders, drag-and-drop)        │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                    │
│  │ 📝 │ │ ✅ │ │ 🍅 │ │ 🔢 │  ...              │
│  │Note│ │Todo│ │Pomo│ │Calc│                    │
│  └────┘ └────┘ └────┘ └────┘                    │
├─────────────────────────────────────────────────┤
│  Dock [Browser] [Files] [Settings] [Notes]       │
└─────────────────────────────────────────────────┘
```

Each layer is independently toggleable. A minimalist user can hide everything except the search bar and app grid. A power user can enable greeting + widgets + quick links for maximum glanceability.

---

## Current State Assessment

### What's solid
- MV3 manifest with minimal permissions (`storage` only)
- Robust `AppStorage` layer with envelope format, migrations, validation, chrome.storage.sync replication, chunking, conflict resolution, import/export
- 18 well-built apps including card games with AI (Tarneeb, Trix)
- Virtual filesystem (FileSystemService) with directories, rename, search
- ProcessManager with spawn locking, lifecycle management, safe URL validation
- Cosmic glass design system with CSS custom properties
- Service worker with cache-first/network-first strategy
- Boot sequence with smoke checks, error overlays, timeout fallback
- Accessibility basics: aria attributes, prefers-reduced-motion, focus-visible

### What needs work

| Area | Issue | Severity |
|------|-------|----------|
| Performance | All 18 apps imported at boot; new tab loads slowly | Critical |
| Light theme | `theme-light` class exists but no CSS token overrides | High |
| Storage consistency | SettingsApp, WeatherService, NotesApp bypass `kernel.storage` | High |
| SmartSearch | Exact-match only, ignores user's search engine preference, no fuzzy | High |
| Icons | Mixed emoji + images, inconsistent sizes, no visual cohesion | High |
| i18n | No `_locales/` directory (CWS requirement) | High |
| Privacy policy | No privacy policy page | High |
| Keyboard shortcuts | None exist | Medium |
| Onboarding | No first-run experience | Medium |
| Toast/feedback | Operations complete silently | Medium |
| StatusBar | All inline styles, no CSS classes | Low |
| WeatherService | Direct localStorage access, not through AppStorage | Medium |
| Service worker | Cache version hardcoded, no auto-update coordination | Medium |
| Wallpapers | PNG format, oversized for new tab loads | Medium |

---

## Competitive Landscape

| Extension | Users | Rating | Model | YancoTab Advantage |
|-----------|-------|--------|-------|--------------------|
| Momentum | ~3M | 4.49 | Freemium, account required | No account, no paywall |
| Bonjourr | ~300K | 4.90 | Free, open source | Full app platform, not just widgets |
| Tabliss | ~200K | 4.68 | Free, open source (abandoned) | Actively maintained |
| Infinity | ~400K | 4.93 (declining) | Freemium, spyware allegations | Privacy-first, no data collection |
| Speed Dial 2 | ~1M | 4.12 | Freemium | Apps+games, not just bookmarks |
| CaretTab | ~40K | 4.63 | Free, open source | Full apps vs just widgets |

**YancoTab's unique niche:** Nobody offers a real application platform in the new tab. Every competitor is either pretty wallpapers or bookmark tiles. YancoTab is a desktop OS.

---

## Release Roadmap

```
v2.2.0 — HARDEN     Performance, icons, light theme, storage fixes, wallpapers
v2.3.0 — DELIGHT    Greeting, widgets, keyboard shortcuts, search upgrade, onboarding
v2.4.0 — LAUNCH     Store assets, i18n, privacy policy, CWS + Edge submission
v2.5.0 — GROW       Firefox port, custom themes, focus mode, community feedback
```

---

## Phase 1 — Harden (v2.2.0)

**Goal:** Fix everything that would cause a 1-star review or a store rejection.

### 1.1 Performance: Lazy-Load Apps
**Priority: Critical**

Currently `boot.js` statically imports all 18 apps. A new tab loads ~70 ES modules before showing anything.

**Change:** Register lazy factories instead of eager imports.

```js
// Before (boot.js):
import { CalculatorApp } from './apps/CalculatorApp.js';
kernel.processManager.register('calculator', CalculatorApp);

// After (boot.js):
kernel.processManager.registerLazy('calculator',
  () => import('./apps/CalculatorApp.js').then(m => m.CalculatorApp)
);
```

Only the shell, grid, dock, search, and statusbar load at boot. Apps load on first launch. ProcessManager caches the resolved class after first import so subsequent launches are instant.

**Target:** Boot loads 12 modules instead of 70. New tab to interactive < 200ms.

**Files:** `os/boot.js`, `os/core/processManager.js`

### 1.2 Performance: Starfield Optimization
**Priority: High**

Current: 120 stars, `requestAnimationFrame` loop, runs on every new tab.

**Changes:**
- Reduce default star count: **80** (saves ~33% draw calls)
- Skip starfield entirely when a wallpaper image is active (wallpaper already provides visual interest)
- On `prefers-reduced-motion: reduce` or `_shouldReduceEffects()`: render one static frame, no animation loop
- Add Settings toggle: "Background animation" on/off (stored in `kernel.storage`)
- Cap FPS to 30 when tab is visible but window is not focused (`document.hasFocus()`)

**Files:** `os/ui/starfield.js`, `os/apps/SettingsApp.js`

### 1.3 Unified Icon System
**Priority: High**

Current icons are an inconsistent mix: some emoji (⚙️, 📝, ✅), some image files (`browser-icon.png`), some custom SVG strings (`game:snake`). Emoji render differently across OS/browser/version and look unprofessional at scale.

**New system: Custom SVG icons for all 18 apps + system actions.**

Design specs (see [Icon System](#icon-system) section):
- **ViewBox:** 24x24
- **Stroke:** 2px, `stroke-linecap: round`, `stroke-linejoin: round`
- **Fill:** none (outline style), accent color via `currentColor`
- **Container:** 48px squircle (`border-radius: 12px`, 22% of size)
- **Container background:** category-based color (see palette below)

Create a new `os/ui/icons/AppIcons.js` module exporting SVG strings per app. The existing `PhosphorIcons.js` and `GameIcons.js` already follow this pattern — extend it to cover all apps.

**Category color palette:**
| Category | Apps | Container BG (dark) | Container BG (light) |
|----------|------|---------------------|----------------------|
| Productivity | Notes, Todo, Pomodoro, Calculator | `rgba(0,122,255,0.12)` | `rgba(0,122,255,0.08)` |
| Media | Browser, Files, Photos | `rgba(88,86,214,0.12)` | `rgba(88,86,214,0.08)` |
| Utilities | Clock, Weather, Settings | `rgba(0,229,193,0.12)` | `rgba(0,229,193,0.08)` |
| Games | All 9 games | `rgba(255,69,58,0.12)` | `rgba(255,69,58,0.08)` |
| External | Maps, custom shortcuts | `rgba(255,159,10,0.12)` | `rgba(255,159,10,0.08)` |

**Icon rendering in app grid:**
```
┌─────────────────┐
│                  │  48 x 48px squircle
│    ┌────────┐   │  border-radius: 12px
│    │  SVG   │   │  SVG: 24x24 centered
│    │  icon   │   │  Background: category color
│    └────────┘   │
│                  │
│    App Name      │  Font: 11px, weight 500
│                  │  Color: --text, single line
└─────────────────┘  Total cell: ~76px wide
```

**Files:** New `os/ui/icons/AppIcons.js`, modify `os/ui/desktop/SmartIcon.js`, `os/ui/components/GameIcons.js`

### 1.4 Light Theme
**Priority: High**

Add full light theme token overrides in `tokens.css`. Triggered by `body.theme-light`.

```css
body.theme-light {
  /* ── Backgrounds ── */
  --bg:          #f5f5f7;
  --bg-card:     rgba(255, 255, 255, 0.85);
  --bg-glass:    rgba(0, 122, 255, 0.04);
  --bg-panel:    rgba(245, 245, 247, 0.95);
  --bg-surface:  #ffffff;
  --bg-elevated: #f0f0f2;

  /* ── Accent (Blue in light mode for contrast) ── */
  --accent:        #007AFF;
  --accent-dim:    rgba(0, 122, 255, 0.15);
  --accent-glow:   rgba(0, 122, 255, 0.25);
  --accent-bright: #0A84FF;
  --accent-bg:     rgba(0, 122, 255, 0.06);

  /* ── Text ── */
  --text-bright: #1d1d1f;
  --text:        #6e6e73;
  --text-dim:    #aeaeb2;

  /* ── Semantic ── */
  --danger:  #ff3b30;
  --success: #34c759;
  --warning: #ff9500;
  --info:    #007AFF;

  /* ── Borders ── */
  --border:       rgba(0, 0, 0, 0.08);
  --border-accent: rgba(0, 122, 255, 0.12);
  --border-light: rgba(0, 0, 0, 0.05);

  /* ── Shadows (lighter, less dramatic) ── */
  --glow-sm:   0 0 15px rgba(0, 122, 255, 0.08);
  --glow-md:   0 2px 12px rgba(0, 0, 0, 0.08);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.12);

  /* ── Glass ── */
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-border: rgba(0, 0, 0, 0.06);
  --glass-surface-1: rgba(255, 255, 255, 0.6);
  --glass-surface-2: rgba(240, 240, 242, 0.8);
  --glass-surface-3: rgba(245, 245, 247, 0.9);

  /* ── Starfield: hide in light mode ── */
  --starfield-opacity: 0;
}
```

Also update `os/theme/theme.js` to support `prefers-color-scheme`:
```js
// If no explicit choice saved, follow OS preference
if (!localStorage.getItem('yancotab_theme_mode')) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}
```

**Files:** `css/tokens.css`, `os/theme/theme.js`

### 1.5 Storage Consistency
**Priority: High**

Multiple apps bypass `kernel.storage` and read/write localStorage directly:

| File | Direct access | Should use |
|------|--------------|------------|
| `SettingsApp.js` | `readJson()`, `localStorage.getItem()` | `kernel.storage.load()` |
| `WeatherService` | `localStorage.getItem/setItem` for state+cache | `kernel.storage.load/save()` |
| `NotesApp.js` | `localStorage.getItem(NOTES_META_KEY)` | `kernel.storage.load()` |
| `StatusBar.js` | `localStorage.getItem('yancotab_clock_v2')` | `kernel.storage.load()` |

**Fix:** Add missing keys to AppStorage REGISTRY (`yancotabWeatherState`, `yancotabWeatherCacheV2`, `yancotab_notes_meta_v2`, `yancotab_clock_state_v3`). Route all reads/writes through `kernel.storage`. Pass `kernel` to services that need storage access.

**Files:** `os/services/appStorage.js`, `os/apps/SettingsApp.js`, `os/services/weatherService.js`, `os/apps/NotesApp.js`, `os/ui/components/StatusBar.js`

### 1.6 SmartSearch Fixes
**Priority: High**

**Fuzzy matching algorithm:**
```
Score = 0
if (appName.toLowerCase() === query)       → Score = 100  (exact match)
if (appName.toLowerCase().startsWith(query)) → Score = 80   (prefix)
if (appName.toLowerCase().includes(query))  → Score = 50   (substring)
if (initials match, e.g. "ss" → "Spider Solitaire") → Score = 40
Sort by score descending, show top 5
```

**Search engine respect:**
```js
const engine = kernel.storage?.load('yancotabSearchEngine') || 'google';
const urls = {
  google: `https://www.google.com/search?q=${q}`,
  duck:   `https://duckduckgo.com/?q=${q}`,
  bing:   `https://www.bing.com/search?q=${q}`,
};
```

**URL safety:** Block `javascript:`, `data:`, `blob:`, `file:` schemes. Only allow `https:`, `http:`, `tel:`, `mailto:`, `sms:`.

**Dropdown UI specs:**
- Container: absolute positioned below search input, `max-height: 320px`, `overflow-y: auto`
- Background: `var(--bg-panel)`, `border: 1px solid var(--border)`, `border-radius: 12px`
- Each result: `48px` tall, icon + name + type badge, hover highlight `var(--accent-bg)`
- Keyboard: `ArrowDown/Up` to navigate, `Enter` to select, `Escape` to close

**Files:** `os/ui/components/SmartSearch.js`

### 1.7 Wallpaper Optimization
**Priority: Medium**

Current wallpapers are PNG. WebP is 26-42% smaller with equivalent quality.

**Action:**
- Convert all 7 wallpapers from PNG to WebP
- Target max file size: 300KB per wallpaper
- Provide 2 resolutions: 1920x1080 (default) and 3840x2160 (HiDPI, lazy-loaded)
- Update references in `sw.js`, `SettingsApp.js`, wallpaper picker

**Files:** `assets/wallpapers/*.png` → `*.webp`, `sw.js`, `os/apps/SettingsApp.js`

### 1.8 Service Worker Cache Coordination
**Priority: Medium**

`sw.js` hardcodes `CACHE_NAME = 'yancotab-v2.1.0'`. On updates, old cache persists.

**Fix:** Since `sw.js` can't use ES module imports, embed the version as a const at the top of `sw.js`. Use a comment marker that can be updated by a simple version-bump script. The `activate` event already cleans old caches — verify it works.

**Files:** `sw.js`, `os/version.js`

### 1.9 Error Boundaries for Apps
**Priority: Medium**

If an app's `render()` throws at runtime, the entire shell breaks.

**Fix:** In mobileShell's `process:started` handler, wrap app mounting in try-catch:

```js
try {
  chrome.appendChild(app.root);
} catch (e) {
  chrome.innerHTML = '';
  chrome.appendChild(el('div', { class: 'app-crash' }, [
    el('h3', {}, `${appName} crashed`),
    el('p', {}, e.message),
    el('button', { onclick: () => { app.close(); kernel.emit('app:open', appId); } }, 'Restart'),
  ]));
}
```

**Files:** `os/ui/mobileShell.js`

---

## Phase 2 — Delight (v2.3.0)

**Goal:** Add the features users expect from day 1 and that competitors offer.

### 2.1 Greeting Bar
**Priority: High**

A personalized greeting above the search bar. Every top-rated competitor has this.

**Design specs:**

```
┌──────────────────────────────────────────────┐
│  Good morning, Yaman                          │  Font: 24px (clamp 20-28px), weight 600
│  Wednesday, April 12                          │  Font: 14px, color: --text-dim
│  Partly Cloudy · 22°C London                  │  Font: 13px, color: --text-dim (optional)
└──────────────────────────────────────────────┘
```

- Time-of-day logic: 5-12 = morning, 12-17 = afternoon, 17-21 = evening, 21-5 = night
- User name stored in `kernel.storage` key `yancotab_user_name` (set during onboarding or Settings)
- If no name set: "Good morning" without name
- Weather line only shown if weather is configured and cached data exists
- Positioning: fixed at top, between StatusBar and SmartSearch
- Animation: fade-in on boot, 300ms ease-out

**Files:** New `os/ui/components/Greeting.js`, `os/ui/mobileShell.js`, `os/apps/SettingsApp.js`, `os/services/appStorage.js` (add key)

### 2.2 Home Screen Widgets (Bento Grid)
**Priority: High**

See [Widget System Specification](#widget-system-specification) for full details.

**Summary:** A horizontal row of glass-effect widget cards between the greeting/search and the app grid. Users choose which to show in Settings. Four built-in widgets at launch:

| Widget | Size | Content |
|--------|------|---------|
| Clock | Small (140x120px) | Large digital time + date |
| Weather | Small (140x120px) | Temp + icon + city |
| Todo | Medium (280x120px) | Top 3 undone tasks + inline checkbox |
| Pomodoro | Small (140x120px) | Timer (if active) or "Start Focus" |

**Files:** New `os/ui/components/WidgetBar.js`, new `os/ui/components/widgets/ClockWidget.js`, `WeatherWidget.js`, `TodoWidget.js`, `PomodoroWidget.js`

### 2.3 Keyboard Shortcuts
**Priority: High**

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl+K` / `Cmd+K` | Focus SmartSearch | Global |
| `Escape` | Close current app → go home | Global |
| `Ctrl+,` | Open Settings | Global |
| `Ctrl+N` | New note | When Notes is active |
| `Ctrl+Enter` | Quick capture to Notes | When SmartSearch focused |

Register a global `keydown` handler on `document` in `mobileShell.init()`. Respect `isComposing` for IME input. Don't override when user is typing in an input/textarea (except for Escape).

**Files:** `os/ui/mobileShell.js`, `os/ui/components/SmartSearch.js`

### 2.4 Command Palette (SmartSearch v2)
**Priority: High**

Extend SmartSearch into a command palette:

**Modes:**
- **Default:** Type app name → fuzzy match → open app. If no match → web search.
- **`>` prefix:** Command mode. Actions:
  - `> new note` / `> note [title]` → create note
  - `> add todo [text]` / `> todo [text]` → add to active todo list
  - `> dark` / `> light` → toggle theme
  - `> focus` → start focus mode (Phase 4)
  - `> export` → trigger data export
- **`!` prefix:** Quick capture. `! Buy milk` → saves to Notes as a new note titled "Buy milk"

**Dropdown design:**
```
┌─────────────────────────────────────────┐
│  🔍 calc                                │ ← input
├─────────────────────────────────────────┤
│  🔢  Calculator              App  ↵    │ ← selected (highlight)
│  📝  "calculus notes"      Note  ↵    │ ← file search result
│  🌐  Search "calc"          Web  ↵    │ ← web fallback
└─────────────────────────────────────────┘
```
- Max 7 results visible
- Keyboard nav: `↑↓` to move, `Enter` to select, `Escape` to dismiss
- Result types shown as pills: `App`, `Note`, `File`, `Web`, `Command`

**Files:** `os/ui/components/SmartSearch.js`

### 2.5 Toast Notification System
**Priority: Medium**

**Design specs:**
```
┌─────────────────────────────┐
│  ✓  Settings saved           │  Height: 44px
│                              │  Border-radius: 12px
└─────────────────────────────┘  Position: bottom-center, 24px from bottom
```

- Background: `var(--bg-panel)`, `border: 1px solid var(--border)`
- `backdrop-filter: blur(20px)` for glass effect
- Types: `success` (green left-border), `error` (red), `info` (teal), `warning` (orange)
- Auto-dismiss: 3000ms. Stackable up to 3.
- Enter animation: `translateY(20px) → 0` + `opacity 0 → 1`, 200ms ease-out
- Exit animation: `opacity 1 → 0`, 150ms

**API:** `kernel.emit('toast', { message: 'Settings saved', type: 'success' })`

**Files:** New `os/ui/components/Toast.js`, `os/ui/mobileShell.js`

### 2.6 First-Run Onboarding
**Priority: Medium**

See [Onboarding Flow](#onboarding-flow) for full details.

**Summary:** 3-step modal flow on first install. Progressive disclosure afterward.

### 2.7 Quick Links / Favorites Row
**Priority: Medium**

**Design specs:**
```
 [G]    [YT]   [GH]  [Wiki]  [📌]   [+]
Google  YouTube GitHub Wiki  Reddit  Add
```

- Row: horizontal flex, centered, `gap: 24px`
- Each item: 36px circle with favicon, 11px label below
- Favicon source: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
- Default items: Google, YouTube, GitHub, Wikipedia, Reddit
- Max visible: 8 items. Overflow: hidden with `+N` indicator
- Editable: long-press to delete, click `+` to add new URL
- Stored in `kernel.storage` key `yancotab_quick_links`

**Files:** New `os/ui/components/QuickLinks.js`, `os/ui/mobileShell.js`, `os/apps/SettingsApp.js`, `os/services/appStorage.js` (add key)

---

## Phase 3 — Store Launch (v2.4.0)

**Goal:** Everything needed to submit and get approved on Chrome Web Store.

### 3.1 Internationalization (i18n)
**Priority: Required for CWS**

Create `_locales/en/messages.json`:
```json
{
  "appName": {
    "message": "YancoTab",
    "description": "Extension name shown in browser toolbar and store"
  },
  "appDescription": {
    "message": "Your personal desktop in every new tab. Apps, games, notes, weather — all local, no tracking.",
    "description": "Extension description shown in store listing"
  }
}
```

Update `manifest.json` to reference message keys:
```json
"default_locale": "en",
"name": "__MSG_appName__",
"description": "__MSG_appDescription__"
```

**Files:** New `_locales/en/messages.json`, `manifest.json`

### 3.2 Privacy Policy Page
**Priority: Required for CWS**

Create `privacy.html` matching the app's design language (dark cosmic theme). Sections:
1. What data is collected → **None**
2. What permissions are used → `storage` only
3. External services used → Open-Meteo, Google Favicon, OSM Nominatim, NWS Alerts (all public, no auth)
4. Data storage → localStorage + chrome.storage.sync (encrypted by Chrome)
5. Contact info

**Files:** New `privacy.html`, update `landing.html` footer

### 3.3 Store Listing Assets
**Priority: Required for CWS**

See [Asset Production Guide](#asset-production-guide) for full specs.

### 3.4 Manifest Polish
**Priority: Required for CWS**

```json
{
  "manifest_version": 3,
  "name": "__MSG_appName__",
  "short_name": "YancoTab",
  "version": "2.4.0",
  "description": "__MSG_appDescription__",
  "default_locale": "en",
  "offline_enabled": true,
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  },
  "chrome_url_overrides": { "newtab": "index.html" },
  "permissions": ["storage"],
  "icons": {
    "16": "assets/icons/icon-16.png",
    "32": "assets/icons/icon-32.png",
    "48": "assets/icons/icon-48.png",
    "128": "assets/icons/icon-128.png"
  }
}
```

### 3.5 Edge Add-ons Submission
**Priority: Medium**

Edge uses Chromium — the same extension package works as-is. Submit to Microsoft Partner Center. Same screenshots work.

---

## Phase 4 — Grow (v2.5.0+)

**Goal:** Post-launch features based on user feedback and growth.

### 4.1 Firefox Port
- Add `browser_specific_settings`: `{ "gecko": { "id": "yancotab@yamanaddas.com" } }`
- Conditional API access: `const storage = (typeof browser !== 'undefined' ? browser : chrome).storage`
- Test all MV3 differences (Firefox MV3 has different CSP defaults)
- Submit to AMO (addons.mozilla.org)

### 4.2 Custom Themes
- **Accent color picker**: 8 preset colors + hex input. Stored as `--accent` override.
- **Custom wallpaper upload**: Via File input, resized to 1920x1080 max in a canvas, stored as base64 data URL in `kernel.storage`. Max 2MB after compression.
- **Community presets**: JSON files with token overrides. Import via Settings.

### 4.3 Focus Mode
Triggered from command palette (`> focus`) or keyboard shortcut.

**Layout:**
```
┌─────────────────────────────────────────┐
│                                          │
│           14:32                          │  Clock: 72px, weight 300
│        Wednesday, April 12               │  Date: 16px, --text-dim
│                                          │
│     ┌──────────────────────┐             │
│     │  🍅 Focus: 18:42     │             │  Pomodoro widget (if active)
│     └──────────────────────┘             │
│                                          │
│     ┌──────────────────────┐             │
│     │  ☐ Finish the report │             │  Single focus task
│     └──────────────────────┘             │
│                                          │
│           [Exit Focus]                   │
│                                          │
└─────────────────────────────────────────┘
```
- Background: solid gradient, no starfield, calming
- Everything else hidden: no grid, no dock, no search
- Task source: first undone item from active Todo list, or user types one
- Exit: click button, press Escape, or command palette

### 4.4 App Badges
- Todo icon: red circle badge with undone count (if > 0)
- Pomodoro icon: pulsing green dot when timer active
- Clock icon: orange dot when alarm is set
- Badge rendering: `position: absolute; top: -4px; right: -4px; width: 18px; height: 18px; border-radius: 50%; font-size: 10px`

### 4.5 Inter-App Communication
Via kernel event bus:
- Notes → Todo: `kernel.emit('todo:add', { text: 'From note: ...' })`
- Pomodoro completion → Notes: `kernel.emit('notes:quicksave', { body: 'Completed 25min focus at 14:32' })`
- Context menu on any selected text in any app: "Add to Todo" / "Save as Note"

### 4.6 Desktop Window Mode (Large Screens > 1200px)
- Side-by-side app windows (2-up layout)
- Window chrome: draggable header bar, resize handle bottom-right
- Snap zones: left half / right half / full screen (hover near edge to show zone)
- Taskbar at bottom showing open app indicators
- Grid becomes a widget/shortcut launcher in the background

### 4.7 Progressive Web App
```json
// manifest.webmanifest
{
  "name": "YancoTab",
  "short_name": "YancoTab",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#060b14",
  "theme_color": "#060b14",
  "icons": [
    { "src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "assets/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

---

## Visual Design System

### Spacing Scale (8px base)
```
--space-xs:  4px     (half unit)
--space-sm:  8px     (1 unit)
--space-md:  12px    (1.5 units)
--space-lg:  16px    (2 units)
--space-xl:  24px    (3 units)
--space-xxl: 32px    (4 units)
--space-3xl: 48px    (6 units)
--space-4xl: 64px    (8 units)
```

### Typography Scale
```
--font-xs:    11px   — icon labels, badges
--font-sm:    13px   — secondary text, metadata
--font-base:  14px   — body text, list items
--font-md:    16px   — inputs, buttons
--font-lg:    18px   — section headers
--font-xl:    24px   — greeting, page titles
--font-xxl:   28px   — large greeting
--font-hero:  48px   — clock widget time display
```

**Font stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif`
**Numeric:** `font-variant-numeric: tabular-nums` on all clock/counter displays to prevent layout shift.

### Radius Scale
```
--radius-xs:   4px   — small badges, inline elements
--radius-sm:   6px   — buttons, inputs
--radius-md:   12px  — cards, containers
--radius-lg:   16px  — widgets, modals
--radius-xl:   20px  — large panels
--radius-pill: 999px — pills, tags
--radius-icon: 12px  — app icons (22% of 48px = squircle)
```

### Glass Effect
```css
.glass {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
```

### Elevation Levels
```
Level 0 (flat):     no shadow
Level 1 (resting):  var(--shadow-sm)  — cards, widgets
Level 2 (raised):   var(--shadow-md)  — dropdowns, popovers
Level 3 (floating): var(--shadow-lg)  — modals, overlays
```

### Animation Standards
```
Micro (hover, focus):   150ms ease-out
Normal (open/close):    300ms ease-out
Emphasis (modal, boot): 500ms ease-out
Spring (bounce):        550ms cubic-bezier(0.34, 1.56, 0.64, 1)

Hover scale: transform: scale(1.06)  — not 1.1, that's too jumpy
Exit: always faster than enter (150ms vs 300ms)
```

### Responsive Breakpoints
```
Mobile:   < 640px    — 4-col grid, stacked layout, dock 4 items
Tablet:   640-1024px — 5-col grid, compact widgets
Laptop:   1024-1440px — 6-col grid, full widgets, side-by-side possible
Desktop:  > 1440px   — 8-col grid, max-width 1200px container centered
```

---

## Icon System

### Extension Icons (Chrome Web Store)

| Size | Usage | Design |
|------|-------|--------|
| 16x16 | Toolbar/favicon | Simple silhouette, 2 colors max, no detail |
| 32x32 | Bookmark bar | Same as 16 but slightly more detail |
| 48x48 | chrome://extensions page | Full icon with subtle shadow |
| 128x128 | Web Store listing | 96x96 artwork centered on 128x128 canvas, 16px padding, subtle outer glow |

**Design direction:** A rounded square (squircle) containing a stylized "Y" or abstract grid/window icon. Background: dark navy `#0c1628` to teal `#00e5c1` gradient. The icon should be recognizable as "desktop/launcher" at 16px.

### In-App Icons (18 apps)

All in-app icons use a consistent SVG system:

**Template:**
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- icon paths -->
</svg>
```

**Per-app icon descriptions:**

| App | Icon Concept | Key Shapes |
|-----|-------------|------------|
| Notes | Notepad with lines | Rectangle + 3 horizontal lines |
| Todo | Checklist | 3 rows: circle + line, checked circle + line, circle + line |
| Pomodoro | Tomato timer | Circle with top stem + clock hands |
| Calculator | Calculator body | Rectangle + 4x3 grid of small squares |
| Weather | Sun + cloud | Circle rays + cloud curve |
| Clock | Clock face | Circle + two hands (hour shorter) |
| Browser | Globe | Circle + latitude/longitude curves |
| Files | Folder | Classic folder shape with tab |
| Settings | Gear | 6-tooth gear with center circle |
| Solitaire | Playing card | Rectangle with suit symbol (spade) |
| Spider | Spider web card | Two overlapping cards |
| Minesweeper | Mine | Circle with spikes + flag |
| Mahjong | Tile stack | 3 layered rectangles |
| Snake | Snake | S-curve with small head |
| Memory | Brain / card pair | Two cards with ? marks |
| Tic-Tac-Toe | Grid | 2x2 grid lines with X and O |
| Tarneeb | Spade suit | Spade symbol |
| Trix | Diamond suit | Diamond symbol |

### System Action Icons

Also needed for UI chrome (24x24, same stroke style):
- Close (X), Back (←), Search (magnifying glass), Add (+), Delete (trash), Pin, Settings gear (small), Home, Menu (dots), Expand, Collapse

---

## Widget System Specification

### Layout

Widgets live in a **WidgetBar** component between SmartSearch and the App Grid.

```
Container: horizontal flex, gap: 12px, padding: 0 16px
           overflow-x: auto (scroll on mobile if needed)
           max-width: 100% of shell width
           Centered via margin: 0 auto on desktop
```

### Widget Sizes

```
Small:   140 x 120px  (clock, weather, pomodoro)
Medium:  280 x 120px  (todo, quick links mini)
Large:   420 x 120px  (combined weather+forecast, not in v2.3)
```

On mobile (< 640px): Small = 50% width, Medium = 100% width. Horizontal scroll.

### Widget Card Styling

```css
.widget-card {
  border-radius: 16px;
  padding: 14px 16px;
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  transition: transform 200ms ease-out, box-shadow 200ms ease-out;
  cursor: pointer;
  user-select: none;
}

.widget-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.widget-card:active {
  transform: scale(0.98);
}
```

### Widget Specifications

**Clock Widget (Small)**
```
┌────────────────────┐
│  14:32             │  Time: 32px, weight 300, tabular-nums
│  Wed, Apr 12       │  Date: 13px, --text-dim
│                    │
└────────────────────┘
```
- Tapping opens Clock app
- Updates every second (via `setInterval`, paused when `document.hidden`)

**Weather Widget (Small)**
```
┌────────────────────┐
│  ☀ 22°C           │  Temp: 28px, icon: 24px inline SVG
│  London            │  City: 13px, --text-dim
│  H:26° L:18°       │  Range: 11px, --text-dim
└────────────────────┘
```
- Tapping opens Weather app
- Data from cached `WeatherService` — never fetches on render
- If no weather configured: show "Set up weather" text

**Todo Widget (Medium)**
```
┌──────────────────────────────────────┐
│  My Tasks                       3   │  Title: 14px bold, count: badge
│  ☐ Buy milk                        │  Task: 13px, checkbox inline
│  ☐ Call dentist                     │  Max 3 items shown
│  ☐ Finish report                   │  If more: "+2 more" in --text-dim
└──────────────────────────────────────┘
```
- Tapping a checkbox toggles done (inline, no app open needed)
- Tapping the card opens Todo app
- Data from `kernel.storage.load('yancotab_todo_v1')`

**Pomodoro Widget (Small)**
```
┌────────────────────┐
│  🍅 Focus          │  Label: 14px
│  18:42             │  Timer: 28px, weight 300 (if active)
│  ████████░░ 72%    │  Progress bar: 4px height, accent color
└────────────────────┘
```
- If no timer active: show "Start Focus" button
- Tapping opens Pomodoro app
- If timer active: live countdown, progress bar fills

### Widget Toggle

In Settings → Display section, add:
```
Widgets
  ☐ Clock
  ☐ Weather
  ☐ Todo
  ☐ Pomodoro
```

Stored in `kernel.storage` key `yancotab_widgets` as `{ clock: true, weather: true, todo: true, pomodoro: false }`.

---

## Onboarding Flow

### Trigger

Show onboarding when no `yancotab_onboarding_done` key exists in localStorage.

### Step 1 — Welcome (Full-screen modal)

```
┌─────────────────────────────────────────────┐
│                                              │
│           [YancoTab Logo 64px]               │
│                                              │
│        Welcome to YancoTab                   │  28px, weight 700
│                                              │
│     Your personal desktop in every           │  16px, --text-dim
│     new tab. Let's get you set up.           │
│                                              │
│         [ Get Started ]                      │  Primary button
│         Skip →                               │  Text link, --text-dim
│                                              │
└─────────────────────────────────────────────┘
```

### Step 2 — Personalize (Full-screen modal)

```
┌─────────────────────────────────────────────┐
│                                              │
│     What should we call you?                │  20px, weight 600
│     ┌──────────────────────────┐            │
│     │  Your name (optional)    │            │  Input field
│     └──────────────────────────┘            │
│                                              │
│     Choose your theme                       │  16px
│     [● Dark]  [○ Light]  [○ Auto]           │  Radio group
│                                              │
│     Search engine                           │  16px
│     [● Google]  [○ DuckDuckGo]  [○ Bing]    │  Radio group
│                                              │
│         [ Continue ]                         │  Primary button
│         Skip →                               │
│                                              │
└─────────────────────────────────────────────┘
```

### Step 3 — Done (Full-screen modal, auto-dismisses after 3s)

```
┌─────────────────────────────────────────────┐
│                                              │
│           ✓                                  │  40px, accent color
│                                              │
│        You're all set!                      │  24px, weight 600
│                                              │
│     Tap apps to open them.                  │  14px, --text-dim
│     Long-press to rearrange.                │
│     Search does everything.                 │
│                                              │
│         [ Start Using YancoTab ]             │  Primary button
│                                              │
└─────────────────────────────────────────────┘
```

### Post-Onboarding: Progressive Discovery

- After 3 days: single inline card above grid — "Did you know? You can drag apps into folders."
- After 7 days: "You've used 4 of 18 apps. Tap to explore more."
- Empty-state education: when an app opens with no data, show helpful hint text (Notes already does this well).
- All discovery cards are dismissible and never repeat once dismissed.
- Stored: `yancotab_discovery_dismissed` array in storage.

---

## Asset Production Guide

### Extension Icon

**Design:** Rounded square (squircle) with dark navy-to-teal gradient background. Abstract "window grid" or stylized "Y" symbol in white/light teal.

**Sizes to produce:**

| File | Size | Canvas | Artwork | Notes |
|------|------|--------|---------|-------|
| `icon-16.png` | 16x16 | 16x16 | 16x16 | Simplified silhouette, no fine detail |
| `icon-32.png` | 32x32 | 32x32 | 32x32 | Slightly more detail |
| `icon-48.png` | 48x48 | 48x48 | 48x48 | Full icon |
| `icon-128.png` | 128x128 | 128x128 | 96x96 centered | 16px transparent padding, subtle outer glow |
| `icon-192.png` | 192x192 | 192x192 | 192x192 | For PWA manifest |
| `icon-512.png` | 512x512 | 512x512 | 512x512 | For PWA manifest |
| `icon-512-maskable.png` | 512x512 | 512x512 | ~376x376 centered | Safe zone for maskable icon (73%) |

**Format:** PNG. No SVG for store icons (Chrome rejects SVG in manifest icons).
**File size:** Each icon < 50KB. The 128px icon is the most important — it's what users see in the store.

### Store Screenshots

**Requirements:** 1280x800 or 640x400, PNG or JPG, 3-5 screenshots.

**Composition per screenshot:**
```
┌─────────────────────────────────────────────────────┐
│  Gradient background (#0c1628 → #1a1a2e)            │
│                                                      │
│  ┌───────────────────────────────────────────┐       │
│  │                                            │       │
│  │         Actual extension screenshot        │       │  Chrome browser
│  │         at ~90% scale                      │       │  mockup frame
│  │                                            │       │
│  └───────────────────────────────────────────┘       │
│                                                      │
│  "Your desktop, in every new tab."                   │  20px headline
│  ↑ 3-5 word caption below the mockup                 │  white, semi-bold
│                                                      │
└─────────────────────────────────────────────────────┘
```

**5 screenshots to produce:**

| # | Content | Caption |
|---|---------|---------|
| 1 | Home screen with greeting, widgets, app grid, starfield | "Your desktop, in every new tab." |
| 2 | Notes app open, split view, content visible | "Take notes without leaving your tab." |
| 3 | Solitaire game mid-play | "Games built in. No installs needed." |
| 4 | Weather app showing forecast + air quality | "Weather at a glance. Always cached." |
| 5 | Settings with wallpaper picker + theme toggle | "Make it yours. Seven themes included." |

**Tool:** Use `Screenshot.rocks` or RapidToolset Chrome Web Store Screenshot Generator for the browser frame mockup.

### Promotional Tile

**Small tile (440x280) — required:**
```
┌─────────────────────────────────────┐
│                                      │
│    [YancoTab Logo]                   │  Logo: 48px, centered top
│                                      │
│    Your desktop,                     │  18px, white, weight 600
│    in every new tab.                 │
│                                      │
│    ● 18 apps ● No tracking ● Free   │  12px, --text-dim
│                                      │
└─────────────────────────────────────┘
```
- Background: dark cosmic gradient (#060b14 → #0c1628)
- Subtle starfield dots in background for brand consistency
- Teal accent glow behind logo
- **No rounded corners** (store crops them)
- **No white border** (looks broken on white store background)

### Wallpapers

**Current state:** 7 PNG files. Convert to WebP.

| File | Current | Target | Max Size |
|------|---------|--------|----------|
| `black.png` → `black.webp` | ~? KB | 1920x1080 | 200KB |
| `dark.png` → `dark.webp` | ~? KB | 1920x1080 | 200KB |
| `deep-blue.png` → `deep-blue.webp` | ~? KB | 1920x1080 | 200KB |
| `mint.png` → `mint.webp` | ~? KB | 1920x1080 | 200KB |
| `pink.png` → `pink.webp` | ~? KB | 1920x1080 | 200KB |
| `sky.png` → `sky.webp` | ~? KB | 1920x1080 | 200KB |
| `violet.png` → `violet.webp` | ~? KB | 1920x1080 | 200KB |

Use `cwebp -q 85 input.png -o output.webp` for conversion.

**Fallback:** Keep one PNG fallback (`dark.png`) for browsers that don't support WebP (extremely rare in 2026 but safe).

### Favicon

Minimum set for web app mode:
- `favicon.ico` — multi-size ICO (16 + 32 + 48) ✅ already exists
- `apple-touch-icon.png` — 180x180 (needed for iOS "Add to Home Screen")
- Consider SVG favicon: `<link rel="icon" type="image/svg+xml" href="assets/icons/icon.svg">`

---

## Architecture Invariants

These rules must be followed in all development:

1. **No build step.** The extension ships as plain files. No webpack, no bundlers.
2. **No external dependencies.** No npm packages. Everything is hand-written.
3. **No inline scripts.** All JS must be in external files (MV3 CSP compliance).
4. **No remote code.** No CDN scripts, no eval, no dynamic import from URLs.
5. **Storage through kernel.** All persistent state goes through `kernel.storage` (AppStorage). No direct localStorage access in apps or services.
6. **Privacy by default.** No analytics, no telemetry, no tracking. External API calls only for weather/geocoding/favicons.
7. **Graceful degradation.** Every service init is individually guarded. One failure doesn't prevent boot.
8. **Offline-first.** Everything must work without network. Weather shows cached data.
9. **Minimal permissions.** Only `storage`. Never request `tabs`, `history`, `bookmarks`, or host permissions.
10. **Mobile-first, desktop-enhanced.** Shell uses MobileShell for all devices. Desktop features are progressive enhancements.
11. **8px grid.** All spacing, sizing, and positioning aligns to an 8px grid (4px for small elements).
12. **Consistent icon system.** All app icons are SVGs in a unified style. No mixing emoji and custom icons.

---

## Testing Strategy

### Pre-Release Checklist

- [ ] Load unpacked in Chrome — new tab opens, boot completes, no console errors
- [ ] Open every app — all 18 launch, render, and close without errors
- [ ] Create, edit, delete a note — autosave works
- [ ] Add, complete, delete a todo — persists across tab reloads
- [ ] Weather loads for a configured city
- [ ] Calculator: basic operations + edge cases (divide by zero)
- [ ] Every game launches and is playable
- [ ] Search bar: fuzzy match finds apps, web search respects engine preference
- [ ] SmartSearch: `>` commands work, `!` quick capture works, dropdown navigable with keyboard
- [ ] Settings: toggle dark/light mode, change wallpaper, change search engine
- [ ] Widgets: each widget shows correct data, tapping opens the right app, inline interactions work
- [ ] Greeting: correct time-of-day text, name shows if set
- [ ] Keyboard shortcuts: Ctrl+K focuses search, Escape closes apps, Ctrl+, opens Settings
- [ ] Export data → close all → reimport data → everything restored
- [ ] Onboarding: appears on fresh install, Skip works, preferences are applied
- [ ] Toast: triggers on settings save, note delete, data export
- [ ] Offline: disable network → open new tab → everything works (weather shows cache)
- [ ] Chrome sync: install on two devices → change settings on one → verify sync
- [ ] Light theme: toggle to light → all components readable, no broken colors
- [ ] Mobile viewport: resize to 375px wide → everything usable, widgets scroll horizontally
- [ ] Landscape: rotate to landscape → grid reflows, dock resizes
- [ ] Keyboard: Tab through interactive elements, focus-visible outlines visible

### Performance Benchmarks

- [ ] New tab open to interactive: < 200ms (with lazy loading)
- [ ] App launch (first time, cold): < 300ms (includes dynamic import)
- [ ] App launch (subsequent, warm): < 100ms
- [ ] Memory usage (idle, home screen): < 40MB
- [ ] No layout shifts after boot animation completes
- [ ] Starfield FPS: 60fps when focused, 30fps when unfocused, 0fps when hidden

---

## Store Submission Checklist

- [ ] `manifest.json` has `default_locale`, `offline_enabled`, `content_security_policy`
- [ ] `_locales/en/messages.json` exists with `appName` and `appDescription`
- [ ] Privacy policy page created (`privacy.html`) and hosted at a public URL
- [ ] 5 screenshots at 1280x800 with browser mockup frame and captions
- [ ] Small promotional tile 440x280 (no rounded corners, no white border)
- [ ] Store description written and fits within 16,000 char limit (see `STORE_LISTING.md`)
- [ ] New tab override justification written
- [ ] Icon sizes: 16, 32, 48, 128 present and tested on light+dark browser themes
- [ ] No console errors or warnings on clean install
- [ ] Tested on Chrome stable, beta, and canary
- [ ] Tested on 1920x1080, 1366x768, and 375x812 viewports
- [ ] Extension zip < 10MB
- [ ] No unused permissions
- [ ] All SVG icons render correctly (no broken paths)
- [ ] Light and dark themes both fully functional
- [ ] Developer account created on Chrome Web Store ($5 one-time fee)
- [ ] Developer account created on Microsoft Partner Center (Edge, free)
- [ ] Ko-fi / support link in store listing and Settings about page
