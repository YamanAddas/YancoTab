# YancoTab — v1.0 Completion Plan

> Concrete session-by-session work plan based on a full audit of all 19 apps and 9 games.
> Created: 2026-05-06 — Last updated: 2026-05-06

---

## Status after audit

**What's already done:**
- v1.0.0 version across all 5 files (manifest, package, version.js, sw.js, changelog)
- Settings redesigned (4 tabs, 499 lines + external CSS)
- Greeting bar with Playfair Display, live time, weather
- All Phase 1-3 features from PRODUCTION_PLAN.md shipped (lazy loading, icons, light theme, storage fixes, SmartSearch, widgets, toast, onboarding, quick links, i18n, privacy policy, keyboard shortcuts, error boundaries)
- Solitaire + Spider fully rebuilt with engine/view split, persistence, stats, settings panels
- 387 tests passing

**What the audit found:**

| Category | Issue | Severity |
|----------|-------|----------|
| Games (7/9) | Persistence completely broken or missing | 🔴 Critical |
| Games | No Games tab in Settings | 🟡 Medium |
| Apps | No Apps tab in Settings | 🟡 Medium |
| Apps (5+) | `confirm()`/`prompt()` for user input | 🟡 Medium |
| Apps (3) | Inline CSS (300-400 lines each) | 🟡 Medium |
| Mahjong | Tile layout bug (19 tiles stacked at 0,0) | 🔴 Critical |
| Games (7) | No sound effects | 🟢 Low |
| Apps/Games (6) | Files over 500-line cap | 🟢 Low (tech debt) |

---

## Session Plan

### Session 1 — Fix Game Persistence (Critical)

**Goal:** Make all 9 games save their settings, stats, and progress.

**Problem:** Snake, TicTacToe, Memory, and Minesweeper instantiate an engine class (NeonSerpent, NeonTactics, NeonRecall, NeonMines) that tries `this.kernel.storage.load()` but `this.kernel` is never set. The try/catch silently swallows the error. Mahjong, Tarneeb, and Trix have zero persistence code at all.

**Work:**

1. **Snake** (`os/apps/SnakeApp.js`)
   - Pass `kernel` from `SnakeApp` to `NeonSerpent` constructor
   - Or: use callback pattern — `NeonSerpent` receives `{ load, save }` functions bound to kernel
   - Verify high score, theme, and wall mode persist across close/reopen

2. **TicTacToe** (`os/apps/TicTacToeApp.js`)
   - Same fix — pass kernel or callbacks to `NeonTactics`
   - Verify wins, difficulty, theme persist

3. **Memory** (`os/apps/MemoryApp.js`)
   - Same fix — pass kernel or callbacks to `NeonRecall`
   - Verify best scores, difficulty, theme persist

4. **Minesweeper** (`os/apps/games/MinesweeperApp.js`)
   - Same fix — pass kernel or callbacks to `NeonMines`
   - Verify best times, difficulty, theme persist

5. **Mahjong** (`os/apps/games/MahjongApp.js`)
   - Register storage key `yancotab_mahjong` in `appStorage.js`
   - Add `_save()` / `_loadSave()` methods
   - Save: best times, games played, games won
   - Fix tile layout bug: turtle layout generates ~125 positions, needs 144. The padding at line 140 stacks 19 tiles at (0,0,0) — fix the layout generator to produce all 144 positions correctly

6. **Tarneeb** (`os/apps/games/TarneebApp.js`)
   - Register storage key `yancotab_tarneeb` in `appStorage.js`
   - Save: difficulty preference, games played, games won, win rate
   - Load difficulty on startup

7. **Trix** (`os/apps/games/TrixApp.js`)
   - Register storage key `yancotab_trix` in `appStorage.js`
   - Save: mode, difficulty, rule profile, games played, games won
   - Load preferences on startup

**Files touched:**
- `os/apps/SnakeApp.js`
- `os/apps/TicTacToeApp.js`
- `os/apps/MemoryApp.js`
- `os/apps/games/MinesweeperApp.js`
- `os/apps/games/MahjongApp.js`
- `os/apps/games/TarneebApp.js`
- `os/apps/games/TrixApp.js`
- `os/services/appStorage.js` (3 new registry entries)

**Acceptance criteria:**
- [ ] Open each game, change a setting, close, reopen — setting persists
- [ ] Win a game, close, reopen — stats show the win
- [ ] Mahjong: all 144 tiles render correctly with no overlaps
- [ ] All 387+ tests still pass

**Model + effort:** `sonnet` / `high`

---

### Session 2 — Games Settings Tab

**Goal:** Add a Games tab to Settings where users can configure shared game settings, per-game defaults, and view/reset stats.

**Design:**

```
┌─ Games Tab ────────────────────────────────┐
│                                             │
│  CARD GAMES                                 │
│  ┌─────────────────────────────────────┐   │
│  │ Card Back          [Nebula ▾]       │   │
│  │ 4-Color Suits      [toggle]         │   │
│  │ Left-Handed        [toggle]         │   │
│  │ Show Timer         [toggle]         │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  SOLITAIRE                                  │
│  ┌─────────────────────────────────────┐   │
│  │ Draw Mode          Draw 1 / Draw 3  │   │
│  │ Scoring            Standard ▾       │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  SPIDER SOLITAIRE                           │
│  ┌─────────────────────────────────────┐   │
│  │ Default Difficulty  1-Suit ▾        │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ARCADE GAMES                               │
│  ┌─────────────────────────────────────┐   │
│  │ Theme Color        [● ● ● ●]       │   │  (4 color dots)
│  └─────────────────────────────────────┘   │
│                                             │
│  DIFFICULTY DEFAULTS                        │
│  ┌─────────────────────────────────────┐   │
│  │ Minesweeper        Easy ▾           │   │
│  │ Tic-Tac-Toe        Medium ▾         │   │
│  │ Memory             Easy ▾           │   │
│  │ Tarneeb            Moderate ▾       │   │
│  │ Trix               Moderate ▾       │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  DATA                                       │
│  ┌─────────────────────────────────────┐   │
│  │ Reset All Game Stats           ›    │   │
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

**How it works:**
- Shared card game settings read/write `yancotab_solitaire_settings` and `yancotab_spider_settings` — both games already watch these keys
- Arcade theme color reads/writes `yancotab_neon_serpent`, `yancotab_neon_tactics`, `yancotab_neon_recall`, `yancotab_neon_mines` (theme field in each)
- Difficulty defaults read/write each game's storage key
- Changes dispatch events so running games react (e.g. `yancotab:game_settings_changed`)
- Reset stats clears stats fields in all game storage keys

**Files touched:**
- `os/apps/SettingsApp.js` — add Games tab + `_renderGames()` method
- `css/settings.css` — any new styles needed (color dot picker, dropdown)
- May need to extract a method or two to stay under 500 lines — if SettingsApp grows past 500, extract `_renderGames` into a separate `os/apps/settings/GamesSettings.js` module

**Acceptance criteria:**
- [ ] Games tab visible in Settings with all sections
- [ ] Change card back in Settings → open Solitaire → card back matches
- [ ] Change arcade theme in Settings → open Snake → theme matches
- [ ] Change Minesweeper difficulty in Settings → open Minesweeper → difficulty matches
- [ ] Reset All Game Stats → all game stats zeroed
- [ ] SettingsApp.js stays ≤ 500 lines (extract if needed)

**Model + effort:** `sonnet` / `high`

---

### Session 3 — Apps Settings Tab

**Goal:** Add an Apps tab to Settings for cross-app preferences that don't have a natural in-app home.

**Design:**

```
┌─ Apps Tab ─────────────────────────────────┐
│                                             │
│  NOTES                                      │
│  ┌─────────────────────────────────────┐   │
│  │ Spell Check         [toggle]        │   │
│  │ Default View        Grid / List     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  TODO                                       │
│  ┌─────────────────────────────────────┐   │
│  │ Show Completed      [toggle]        │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  WEATHER                                    │
│  ┌─────────────────────────────────────┐   │
│  │ Background Effects  [toggle]        │   │  (already stored, not exposed)
│  └─────────────────────────────────────┘   │
│                                             │
│  CLOCK                                      │
│  ┌─────────────────────────────────────┐   │
│  │ Alarm Sound         Pulse ▾         │   │
│  │ Alarm Volume        [slider]        │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  FILES                                      │
│  ┌─────────────────────────────────────┐   │
│  │ Default View        Grid / List     │   │
│  │ Default Sort        Newest ▾        │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  CALCULATOR                                 │
│  ┌─────────────────────────────────────┐   │
│  │ Angle Mode          Rad / Deg       │   │
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

**How it works:**
- Each section reads/writes the corresponding app's storage key
- Apps listen for settings change events or read on next open
- Only settings that make sense to configure outside the app are included (e.g. Notes font size affects the editor — better in-app; Notes spellcheck is a global pref — fits here)

**Files touched:**
- `os/apps/SettingsApp.js` — add Apps tab + `_renderApps()` method
- Likely needs extraction: with 6 tabs and ~600+ lines, split render methods into `os/apps/settings/` modules
- `css/settings.css` — slider styles for volume control

**Acceptance criteria:**
- [ ] Apps tab visible with all sections
- [ ] Toggle Notes spell check → open Notes → spellcheck attribute matches
- [ ] Change Files default view → open Files → view matches
- [ ] SettingsApp stays ≤ 500 lines (extract render modules)

**Model + effort:** `sonnet` / `medium`

---

### Session 4 — SettingsApp Extraction

**Goal:** SettingsApp will exceed 500 lines with 6 tabs. Extract each tab's render method into its own module.

**New structure:**
```
os/apps/
├── SettingsApp.js           (~200 lines — shell, sidebar, routing)
├── settings/
│   ├── AppearanceSettings.js (~120 lines)
│   ├── HomeSettings.js       (~50 lines)
│   ├── GamesSettings.js      (~150 lines)
│   ├── AppsSettings.js       (~120 lines)
│   ├── BrowserSettings.js    (~60 lines)
│   └── AboutSettings.js      (~130 lines)
```

Each module exports a single function: `renderAppearance(container, kernel, helpers)` where `helpers` bundles the shared `_group`, `_toggleRow`, `_choiceRow`, `_actionRow` builders.

**Files touched:**
- `os/apps/SettingsApp.js` (reduce to shell)
- New: `os/apps/settings/*.js` (6 modules)
- `sw.js` — add new modules to precache

**Acceptance criteria:**
- [ ] Settings works identically to before
- [ ] Every file ≤ 500 lines
- [ ] All tabs still render correctly
- [ ] sw.js precache updated

**Model + effort:** `sonnet` / `medium`

---

### Session 5 — CSS Extraction

**Goal:** Extract inline CSS from apps that embed 300+ lines of styles via `_injectStyles()`.

**Work:**

1. **TodoApp** (`os/apps/TodoApp.js`)
   - Extract ~300 lines of CSS from `_injectStyles()` into `css/todo.css`
   - Add `<link>` to `index.html`
   - Add to `sw.js` precache
   - Remove `_injectStyles()` method

2. **MapsApp** (`os/apps/MapsApp.js`)
   - Extract ~400 lines of CSS from `_injectStyles()` into `css/maps.css`
   - Add `<link>` to `index.html`
   - Add to `sw.js` precache
   - Remove `_injectStyles()` method
   - Fix: `_injectStyles()` is called on every `render()`, injecting duplicate style elements

3. **Dead CSS cleanup**
   - `css/minesweeper.css` — 298 lines of DOM-based styles for a game that's entirely Canvas-rendered. Either delete the file or verify no selector is actually used
   - `os/apps/games/solitaire/ui/pause.js` — dead file, never imported. Delete

**Files touched:**
- `os/apps/TodoApp.js`
- `os/apps/MapsApp.js`
- New: `css/todo.css`, `css/maps.css`
- `index.html` (2 new CSS links)
- `sw.js` (2 new precache entries)
- Delete or clean: `css/minesweeper.css`, `os/apps/games/solitaire/ui/pause.js`

**Acceptance criteria:**
- [ ] Todo app renders identically
- [ ] Maps app renders identically
- [ ] No duplicate `<style>` tags in DOM
- [ ] Dead CSS/JS files removed
- [ ] sw.js precache updated

**Model + effort:** `sonnet` / `medium`

---

### Session 6 — Shared Modal System

**Goal:** Replace all native `confirm()`, `prompt()`, and `alert()` calls with styled modals that match the YancoVerse aesthetic.

**Problem:** 11+ files use native browser dialogs. These look jarring, break immersion, and can't be styled.

**Solution:** Create a `YancoModal` utility in `os/ui/components/YancoModal.js`:

```js
// API:
import { showConfirm, showPrompt, showAlert } from '../ui/components/YancoModal.js';

// Usage:
const yes = await showConfirm('Reset layout?', 'Icons will be rearranged.');
const name = await showPrompt('Rename', 'Enter new name:', currentName);
await showAlert('Done', 'Data exported successfully.');
```

**Visual design:**
- Glass backdrop (`rgba(0,0,0,0.5)` + `backdrop-filter: blur(8px)`)
- Centered card (`var(--glass-surface-2)`, `border-radius: 16px`, `max-width: 340px`)
- Title (18px bold), body text (14px), input field (if prompt), action buttons
- Buttons: Cancel (ghost) + Confirm (accent fill)
- Danger variant: Confirm button red for destructive actions
- Enter = confirm, Escape = cancel
- 200ms fade-in, 150ms fade-out

**Files that use native dialogs (replace in this session or next):**

| File | Dialog type | Count |
|------|------------|-------|
| `SettingsApp.js` | `confirm()` | 5 |
| `FilesApp.js` | `prompt()`, `confirm()` | 10+ |
| `NotesApp.js` | `prompt()` | 3 |
| `BrowserApp.js` | `prompt()`, `confirm()` | 4 |
| `QuickLinks.js` | `prompt()` | 2 |
| `TodoApp.js` | `prompt()` | 3 |
| `SolitaireApp.js` | `confirm()`, `prompt()` | 3 |
| `SpiderSolitaireApp.js` | `confirm()` | 2 |

**Files touched:**
- New: `os/ui/components/YancoModal.js` (~150 lines)
- New: `css/modal.css` (~100 lines)
- `index.html` (add CSS link)
- `sw.js` (add to precache)
- All files listed above (replace dialog calls)

**Acceptance criteria:**
- [ ] All `confirm()` calls replaced with styled modals
- [ ] All `prompt()` calls replaced with styled modals
- [ ] Modals match YancoVerse aesthetic (glass, accent colors, tokens)
- [ ] Enter confirms, Escape cancels
- [ ] Works on mobile (touch-friendly button sizes)
- [ ] No native browser dialogs remain in the codebase

**Note:** This is a large session. Can be split into two: Session 6a (create modal + Settings/games) and Session 6b (Files/Notes/Browser/Todo/QuickLinks).

**Model + effort:** `sonnet` / `high`

---

### Session 7 — Mahjong Completeness

**Goal:** Bring Mahjong up to the quality level of Solitaire/Spider.

**Current gaps:**
- No persistence (fixed in Session 1)
- No keyboard navigation
- No undo
- No sound/haptics
- No settings (theme, layout choices)
- No hover highlighting on free tiles
- Only one layout (Turtle)

**Work:**
1. Add keyboard navigation (arrow keys to move between free tiles, Enter to select)
2. Add undo (at least 1-step undo of last match)
3. Add haptic feedback (vibrate on match, mismatch)
4. Add hover highlighting on free tiles
5. Add settings: hint/shuffle penalty toggle, auto-match last pair
6. Add scoring system (time bonus, combo for consecutive matches, penalty for hints/shuffles)

**Files touched:**
- `os/apps/games/MahjongApp.js`

**Acceptance criteria:**
- [ ] Keyboard-navigable
- [ ] Undo works for last match
- [ ] Haptics on match/mismatch
- [ ] Scoring system visible in HUD and on win
- [ ] Free tiles highlight on hover/keyboard focus

**Model + effort:** `sonnet` / `medium`

---

### Session 8 — Tarneeb & Trix Polish

**Goal:** Add card animations, sound/haptics, and fix dead animation code in both Arabic card games.

**Current gaps:**
- `is-place-anim` class set in JS but no CSS keyframes exist — dead animation code
- No sound or haptics (Solitaire/Spider both have them)
- No card play animation
- Both files over 500-line cap (Tarneeb 679, Trix 748)

**Work:**
1. Add CSS keyframes for `is-place-anim` (card slide-in animation on trick play)
2. Add haptic feedback (vibrate on card play, trick win, round end)
3. Extract view code to reduce main file size
   - Tarneeb: extract hand view + modals → `os/apps/games/tarneeb/tarneebView.js`
   - Trix: extract hand view + modals → `os/apps/games/trix/trixView.js`

**Files touched:**
- `os/apps/games/TarneebApp.js`
- `os/apps/games/TrixApp.js`
- New: `os/apps/games/tarneeb/tarneebView.js`
- New: `os/apps/games/trix/trixView.js`
- `css/tarneeb.css` (add keyframes)
- `css/trix.css` (add keyframes)
- `sw.js` (add new modules)

**Acceptance criteria:**
- [ ] Cards animate when played to trick table
- [ ] Haptic feedback on card play and trick win
- [ ] TarneebApp.js ≤ 500 lines
- [ ] TrixApp.js ≤ 500 lines

**Model + effort:** `sonnet` / `high`

---

### Session 9 — Shared Game Infrastructure

**Goal:** Deduplicate shared code across games.

**Current duplication:**
- `haptics.js` — identical between Solitaire and Spider (and should be used by all games)
- `overlay.js` — identical between Solitaire and Spider
- `hashString` — duplicated between Solitaire and Spider reducers
- Neon games (Snake, TicTacToe, Memory, Minesweeper) duplicate: hex grid background, particle system, button system, color constants (~40 lines each × 4 games)

**Work:**
1. Move `haptics.js` to `os/apps/games/shared/haptics.js`
   - Update imports in Solitaire, Spider
   - Use from Mahjong, Tarneeb, Trix, neon games
2. Move `overlay.js` to `os/apps/games/shared/overlay.js`
3. Move `hashString` to `os/apps/games/shared/hash.js`
4. Extract shared neon-game canvas utilities to `os/apps/games/shared/neonCanvas.js`:
   - Hex grid background renderer
   - Particle system
   - Button system
   - Color constants

**Files touched:**
- New: `os/apps/games/shared/haptics.js`
- New: `os/apps/games/shared/overlay.js`
- New: `os/apps/games/shared/hash.js`
- New: `os/apps/games/shared/neonCanvas.js`
- Delete: `os/apps/games/solitaire/ui/haptics.js`
- Delete: `os/apps/games/spider/ui/haptics.js`
- Delete: `os/apps/games/solitaire/ui/overlay.js`
- Delete: `os/apps/games/spider/ui/overlay.js`
- Update imports in all game files
- `sw.js` (update precache)

**Acceptance criteria:**
- [ ] No duplicated game utility files
- [ ] All games still work correctly
- [ ] sw.js precache updated

**Model + effort:** `sonnet` / `medium`

---

### Session 10 — Calculator Completeness

**Goal:** Fix Calculator's broken features and add missing essentials.

**Current gaps:**
- Parentheses buttons `(` and `)` exist but do nothing (explicitly return early)
- No keyboard input (physical keyboard)
- No calculation history
- No copy-to-clipboard
- No persistence (resets every session)
- 521 lines (slightly over cap)

**Work:**
1. Implement parentheses (expression parsing with proper precedence)
2. Add physical keyboard input (digits, operators, Enter=equals, Escape=AC, Backspace=delete)
3. Add calculation history panel (last 20 calculations, tappable to reuse result)
4. Add copy-to-clipboard button on display
5. Persist angle mode and history via `kernel.storage`
6. Register storage key `yancotab_calculator` in appStorage

**Files touched:**
- `os/apps/CalculatorApp.js`
- `os/services/appStorage.js`

**Acceptance criteria:**
- [ ] `(2+3)*4` evaluates to `20`
- [ ] Physical keyboard works for basic operations
- [ ] History shows last 20 calculations
- [ ] Tap history item → loads result
- [ ] Copy button copies display value
- [ ] Angle mode persists across sessions

**Model + effort:** `sonnet` / `high`

---

### Session 11 — Final Polish & QA

**Goal:** Final cleanup, test everything, rebuild CWS zip.

**Work:**
1. Run full test suite, fix any failures
2. Walk through every app and game manually:
   - Open, use core feature, close
   - Verify settings persist
   - Check for console errors
3. Verify Settings shows all 6 tabs, all controls work
4. Check responsive layouts (375px, 768px, 1920px)
5. Check light theme across all apps
6. Update CHANGELOG.md with all changes
7. Rebuild `yancotab-v1.0.0.zip` for CWS submission
8. Update sw.js precache with any new files

**Acceptance criteria:**
- [ ] All tests pass
- [ ] Zero console errors on clean install
- [ ] All 19 apps open and function
- [ ] All 9 games save settings and stats
- [ ] Settings has 6 working tabs
- [ ] Extension zip < 10MB
- [ ] CHANGELOG.md up to date

**Model + effort:** `sonnet` / `medium`

---

## Session Dependency Graph

```
Session 1 (Game Persistence) ──────┐
                                    ├── Session 2 (Games Settings Tab)
                                    │
                                    ├── Session 7 (Mahjong Completeness)
                                    │
                                    └── Session 8 (Tarneeb & Trix Polish)

Session 2 (Games Settings) ────────┐
Session 3 (Apps Settings) ─────────┤
                                    ├── Session 4 (SettingsApp Extraction)
                                    │
Session 5 (CSS Extraction) ────────┘    (independent)

Session 6 (Modal System) ──────────     (independent, can run anytime)

Session 9 (Shared Game Infra) ─────     (after Sessions 7, 8)

Session 10 (Calculator) ──────────      (independent)

Session 11 (Final QA) ────────────      (after ALL others)
```

**Recommended order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

**Parallelizable:** Sessions 5, 6, 10 are independent and can run in any order or parallel with others.

---

## What's NOT in this plan (post-v1.0)

These are real improvements but don't block release:

- **Sound effects for all games** — significant effort, needs WebAudio synthesis to avoid binary assets bloating the zip. Track as v1.1.
- **2-player mode for TicTacToe** — nice-to-have, not blocking.
- **Multiple Mahjong layouts** — Turtle is fine for v1.0.
- **Custom difficulty for Minesweeper** — standard 3 difficulties are sufficient.
- **Notes markdown preview** — plain text editor is fine for v1.0.
- **File multi-select** — single-file operations work, multi-select is a v1.1 feature.
- **Engine/view split for neon games** — tech debt, not user-facing. Track but don't block.
- **Unit tests for neon games** — same.
- **Daily Deal for Spider** — Spider ships without it.
- **Win cascade animation for Spider** — nice-to-have.
- **Accessibility (ARIA labels)** — important but large scope. Track as v1.1.
- **App badges** (todo count, alarm indicator) — Phase 4 feature per PRODUCTION_PLAN.md.
