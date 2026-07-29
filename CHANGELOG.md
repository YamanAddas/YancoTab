# Changelog

All notable changes to YancoTab will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [1.2.0] — 2026-07-29

The "Mail + edges" wave — a Mail launcher with real multi-account
addressing, and a root-cause fix for hex icon edge quality.

### Added — Mail hub

- **`os/apps/MailApp.js`** — a Mail app in the grid and app list. It is a
  launcher, not a client. Live unread counts are impossible without
  breaking the project's core contract: Gmail and Outlook both require
  OAuth2 (plus a server to hold the client secret) and the `identity`
  permission, and iCloud Mail exposes no public API at any permission
  level. YancoTab declares only `storage` and holds no accounts, so what
  the app buys is speed of access rather than inbox sync.
- **12 providers** (`os/apps/mail/providers.js`) — Gmail, Outlook
  (personal), Outlook 365 (work/school), iCloud Mail, Proton Mail, Yahoo,
  Zoho, Fastmail, Yandex, GMX, AOL, Tuta. Every host was verified to
  resolve before shipping.
- **Multi-account addressing** — the actual differentiator. Gmail
  multiplexes signed-in accounts by path segment (`/mail/u/0/`,
  `/mail/u/1/`), so pinning "work" and "personal" as separate accounts
  removes the account-switcher round trip on every visit. Outlook does the
  same with `/mail/0/`. Providers without that scheme set
  `accountIndex: false` and the UI hides the control entirely rather than
  asking a question with no answer.
- **Compose deep links**, suppressed where a provider has none. iCloud
  gets an "Open inbox" button only — a Compose button that just reopened
  the inbox would be a lie.
- **Zero-setup path** — provider tiles open immediately with no account
  configured. The account picker arms from "+ Add account" (the grid
  itself becomes the picker) and cancels on Esc.
- **Keyboard** — Enter opens the default inbox, C composes.
- Accounts persist through `kernel.storage` under a new registry key
  `yancotab_mail_v1` (`user-data`, conditional sync). Stores a provider id,
  a small account index, and a nickname — no addresses, no credentials, no
  tokens, because there is nothing to authenticate with.

### Changed — rounded-hex edge system

The hex tile stacked four independently `clip-path`-ed layers, which
capped how good it could look:

1. Six needle-sharp vertices.
2. **No outer glow was possible.** `clip-path` removes everything outside
   the shape, so every shadow on a clipped element had to be `inset` — the
   "outer bloom" was a hard-edged hexagon 5px larger with `blur(1px)`, a
   ring rather than a halo.
3. **Rim width drifted around the perimeter** (~3.0px on the vertical
   edges vs ~2.68px mid-diagonal), because offsetting a percentage-based
   polygon is not an equidistant offset.

- **`os/ui/icons/hexGeometry.js`** — one rounded-hexagon path, used two
  ways: a CSS `mask-image` for the tile body (a mask, unlike a clip, still
  permits an ancestor `drop-shadow`), and an SVG `<path>` stroke for the
  rim. A stroke is uniform by construction, and `vector-effect:
  non-scaling-stroke` holds it at a constant screen width at any tile
  size, which removes defect 3 outright. Same silhouette as the polygon it
  replaces, so nothing shifts on screen.
- **One shared `#yv-hex-rim` gradient** for every rim on the page. Its
  stops read `--accent` / `--hex-rim-mid` / `--hex-rim-deep`, and because
  gradient stops resolve custom properties against their own position in
  the tree, anchoring the `<defs>` in `<body>` makes a theme switch
  repaint every rim for free. One node instead of one per tile, and no
  per-instance ids to collide.
- **New tokens** — `--hex-mask`, `--hex-rim-w`, `--hex-rim-mid`,
  `--hex-rim-deep`, `--hex-bloom-*`. `--hex-clip` is retained for the
  in-app hex decorations (browser tabs, files vault, notes, pdf, photos,
  settings) that were not part of this pass.

### Fixed

- **Light-mode hex icons were being washed out.** `glass.css` repurposed
  `.hex-icon::before` from "outer bloom" to the animated specular sweep,
  but `body.theme-light .hex-icon::before` in `shell.css` had higher
  specificity (0,0,2,1 vs 0,0,1,1) and won — repainting the sweep as a
  flat teal wash at opacity 0.4 with `mix-blend-mode: screen` across the
  whole tile. Removed; the rule had no remaining job.
- **Dock tiles had no hover coverage.** The rim/bloom hover rules keyed off
  `.app-icon` / `.m-app-item`, neither of which wraps a dock tile, so
  hovering a dock tile's padding left the rim cold. `.app-dock-tile` added.
- **Pomodoro rendered as an emoji.** `APP_ICON_REGISTRY` already declared
  a `phosphor` SVG for it, but `SmartIcon._phosphorMap` didn't route it, so
  it fell through to the 🍅 static fallback.

### Changed — home screen

- **The content stack is centred instead of pinned to the top.** At
  1440×900 the Apps stack is ~490px inside a ~745px content box, so
  `justify-content: flex-start` left ~240px of dead space between the
  folder rail and the dock while crowding everything under the status bar.
  Uses `safe center`, not plain `center`: a centred flex column that *does*
  overflow pushes its first child past the scroll origin where no
  scrollbar can reach it — verified that plain `center` puts the greeting
  at −132px (unreachable) under forced overflow, while `safe center` keeps
  it at +20px.
- **`.page-tabs` and `.folder-pill` brought onto the shared edge recipe.**
  An audit of computed styles found the search bar, dock and widget cards
  already sharing one vocabulary (inset top highlight + inset bottom
  shadow + inset accent hairline ring + accent under-cast + depth), while
  `.page-tabs` was missing the accent ring and cast, and `.folder-pill`
  had only a 1px border over a 3% white fill — no shadow, no inset
  highlight, no ring, making it the flattest element on a page whose
  neighbours are all rendered glass. Both now compose from the same
  `--lg-*` tokens, so a token change moves every surface together.
  Light mode keeps the hairline and drops the accent cast, which reads as
  grime rather than light on `#f5f5f7`.

### Tests

1813 total (+52 from 1761).

- **`tests/hex-geometry.test.js`** — guards CSS/JS drift on the hex path.
  CSS cannot read a JS constant, so the path is necessarily duplicated
  between `HEX_PATH_D` and the `--hex-mask` token; the test parses the
  token back out of `tokens.css` and compares. Verified to fail on a
  one-digit mutation. Extents are measured on the *rendered* outline
  (solving B′(t)=0 per axis) rather than raw command coordinates, because
  a quadratic does not pass through its control point — asserting
  `min(y) === 0` would have passed while describing a shape that does not
  exist. The computed 2.235 inset matches Chrome's `getBBox()`.
- **`tests/mail-providers.test.js`** — `buildUrl()` is the only value handed
  to `window.open`, so it is the security boundary. Sweeps every provider ×
  hostile account indexes (`NaN`, negatives, floats, `'javascript:alert(1)'`,
  `'../../evil'`) × both kinds, asserting the result is always `https` with
  no leaked scheme, traversal, or unsubstituted placeholder. Unknown
  provider returns `null`, never a fallback guess.
- **`tests/mail-persistence.test.js`** — the blob is sync-replicated and
  reachable by JSON import, so it can arrive malformed. Covers unknown
  providers being dropped rather than remapped, id de-duplication across
  devices, dangling `defaultId` repair, the account cap, and label hygiene
  (C0/C1 controls, zero-widths and bidi overrides stripped; Arabic and
  emoji preserved).

### Service worker

Cache bumped to `yancotab-v1.2.0-mail-edges`. Precache gains the four Mail
modules, `css/mail.css`, and `hexGeometry.js`; all 349 entries verified to
exist on disk, since one missing path makes `cache.addAll()` reject and
silently disables offline support.

---

## [Unreleased]

The "PDF Reader v2" wave — the empty-state app from v1.1.1 grew into a
real reader with an IDB-backed library, four view modes, full-text
search, multi-color annotations, and Acrobat-style text selection.
Plus listing prep for the Chrome Web Store.

### Added — PDF Reader v2 (P1: Library + storage)

- **IndexedDB-backed `pdfStore` service** lifts the per-doc ceiling
  from ~5–10 MB (FilesApp's base64-in-localStorage budget) to
  gigabytes per file. Stores: `documents` (sourcePath-indexed),
  `viewState`, `annotations`, `searchIndex`, `quotes` (added in P4).
  Quota estimation, `navigator.storage.persist()` request, typed
  `PdfStoreQuotaError`.
- **PDF Library home screen** (`os/apps/pdf/library/`, 8 files):
  grid of doc cards with pdf.js-rendered thumbnails cached on the
  doc record, filter pills (All / Recent / Reading now), sort +
  search, grid↔list toggle, drag-drop import, Import-from-Files
  bridge to FilesApp, storage usage gauge, per-card context menu.
- **One-shot v1→v2 migration** — walks legacy `yancotab_pdf_recent`,
  decodes FilesApp data-URLs into Blobs, imports into IDB, rewrites
  recents to use docIds; backs v1 up to `_pre_v2`. Idempotent.
- Magic-byte vet on import (`%PDF-`), soft-warn at 500 MB, hard
  refuse at 2 GB.

### Added — PDF Reader v2 (P2: Reader chrome)

- **Zoom controls** — preset ladder (50/75/100/125/150/200/300/400 +
  Fit width / Fit page / Actual size), step-with-snap, clamp
  [0.25, 8.0], string parsing, pinch-anchor math. Ctrl+wheel zooms;
  double-click on empty page area toggles fit-width ↔ actual size.
- **Four view modes** — Single / Continuous (virtualized scroll
  list with IntersectionObserver upgrades) / Spread / Book (cover
  offset). Default mode picked from stage geometry on first load.
- **Page rotation** — 0/90/180/270 button; pdf.js's
  `getViewport({rotation})` handles geometry; render cache key
  includes rotation.
- **Reading-position memory** — page, zoom, view-mode, and rotation
  persist per-doc through `pdfStore.viewState`. Reopening any doc
  restores the exact reading state. "Resumed on page N" pill fades
  in for resumed pages > 1. Debounced 500ms write buffer.
- **Fullscreen** — F11 / titlebar button toggles
  `document.fullscreenElement` on the codex root. Side rail + info
  panel hide; stage fills the screen.
- **Keyboard** — F11 fullscreen, Ctrl+/-/0/1 zoom, arrows/PgUp-Dn
  page navigation, Home/End jump, T/H text-tool/hand-tool,
  Ctrl/Cmd+F find.
- **In-doc search** with "n of m" stepping, regex escape, case +
  whole-word toggles, persistent search index per doc cached to
  IDB. **Adobe-style highlights**: every match on every visible page
  gets a yellow tint, the current match gets bright orange + outline
  + glow; smooth-scrolls into view on step.
- **Print** (current page / page range / all), **Download** /
  **Export to Files**, **Dark pages** (CSS filter for dark-mode
  reading), **Link layer** (clickable cross-refs + URI links from
  PDF annotations), **More menu** (⋯).

### Added — PDF Reader v2 (P3: Annotations)

- **PDF-aware right-click menu** with five hit classifications:
  selection / annotation / link / page / shell. Selection menu has
  5-color highlight palette + Add note here + Send to Notes (primary)
  + Calc-on-numeric + Bookmark + Search inside doc + Search web. Page
  menu has Add note / Bookmark / Go to / Rotate / Fit / Copy page
  text. Annotation menu has Change color (5 swatches) + Delete. Link
  menu has Open / Copy. Position-clamped, dismiss on outside-click +
  Esc + scroll.
- **Multi-color highlights** — 5 swatches (teal/amber/rose/violet/
  blue), click-to-edit, delete via context menu.
- **Sticky notes** — `kind: 'note'` rows in `pdfStore.annotations`
  with body + 0..1 fractional coords (resilient across pdf.js
  versions). Pip rendered after every render; popover editor with
  Save / Delete / Close.
- **`mobileShell` opt-out** — `data-allow-context="true"` attribute
  on the PDF stage stops the shell's bubble-phase contextmenu
  preventDefault, and the capture-phase `selectstart` handler
  honors the same opt-out so text selection works inside the reader.

### Added — PDF Reader v2 (P4: Differentiators)

- **Quote Vault** — `pdfStore` v2 adds a `quotes` IDB store; context
  menu's "Save to vault" persists selected text + page citation.
  Side rail SAVED QUOTES section shows last 5 entries; click p.N to
  jump; × removes.
- **Bookmark Constellation** — when ≥3 bookmarks exist, an SVG
  star-chart timeline appears above the bookmark list. Stars
  positioned proportionally (page / totalPages), alternate above/
  below baseline; click to jump.
- **Auto-OCR for scanned PDFs** — pages with <5 chars after pdf.js
  text extraction are rendered to OffscreenCanvas at 1.5× scale and
  passed through tesseract-wasm. OCR results merge into the search
  index so scanned PDFs become searchable.

### Added — Final polish

- **Export Annotations as Markdown** — ⋯ menu collects all bookmarks,
  highlights, sticky notes, and saved quotes for the open doc,
  formats them sorted by page, and downloads as
  `<title>-annotations.md`.
- **Acrobat-style text selection + hand tool** — text-tool (Ꮖ) drags
  to select text across span boundaries (uses pdf.js's official
  `endOfContent` div trick to bridge gaps between spans during a
  drag). Hand-tool (✋) drags to pan/scroll the page; pointer-capture
  + grab/grabbing cursors. Toggle via toolbar button or T/H keys.

### Fixed

- **Selection bug from manual span loop** — replaced 24-line manual
  `<span>` builder in `pageView.js` with `pdfjsLib.TextLayer`. The
  manual version skipped the per-glyph `scaleX` transform that
  pdf.js computes from font metrics, so span hit-areas didn't match
  rendered glyph widths and drag-selection skipped words / jumped
  erratically.

### Tests

+128 tests since v1.1.1 (1337 → 1465+ depending on which P-phase
counter you trust): `pdf-zoom`, `pdf-viewport`, `pdf-reading`,
`pdf-search`, `pdf-notes-engine`, `pdf-libraryReducer`,
`pdf-migration`, `pdf-import-vet`, `ocr-service`.

### Service worker

Cache name evolved through the buildout:
`yancotab-v1.2.0-pdf-library` → `v1.2.1-pdf-zoom-modes` →
`v1.2.2-pdf-resume-fullscreen` → `v1.2.3-pdf-search` →
`v1.3.0-pdf-annotations` → `v1.4.0-pdf-tools`.

---

## [1.1.1] — 2026-05-08

Pre-CWS audit pass. Fixed real user-visible bugs in shipped v1.1.0,
plus architectural debt and AI-cruft cleanup.

### Fixed (user-visible bugs in v1.1.0)

- **TodoWidget + SmartSearch wrote v1 schema while TodoApp used v2.**
  Toggling a checkbox in the home-screen Todo widget mutated a
  schema TodoApp no longer reads — UI showed done, app showed open.
  Two tasks with the same text collided. New `quickAddTask` /
  `quickToggleTask` helpers in `os/apps/todo/persistence.js` route
  through the v2 reducer (mission ids, streak log, completedAt).
- **Settings 24-Hour Time toggle now propagates everywhere.**
  Previously wrote to a phantom `yancotab_clock_state_v3` (registered
  but unused) and read from `yancotab_clock_v2` (not registered);
  ClockApp / StatusBar / ClockWidget all stayed on 12-hour. Six
  callers collapsed onto canonical `yancotab_clock_v3`.
- **Game saves no longer fail silently on storage full.** Six game
  persistence paths (Solitaire, Spider, Mahjong, Tarneeb, Trix,
  Minesweeper) used `try { save() } catch {}`. New
  `os/utils/safeSave.js` helper warns + emits a single deduped
  toast per session.
- **`'auto'` theme + AppStorage string-save bug.** Latent: AppStorage
  `normalize()` was running `JSON.parse()` on every string input,
  silently dropping every string-typed preference write (search
  engine, theme, sort modes, view modes). Fixed; raw scalar
  strings now persist correctly. `'auto'` added to theme validator
  and resolved at boot via `matchMedia` to prevent FOUC.

### Security (defense in depth)

- **Scheme allowlist for user-controllable URLs.** New
  `os/utils/url.js` `isSafeUrl()` allows only `https`, `http`,
  `mailto`, `tel`, `sms`. Closed the `javascript:` XSS path in
  `MobileShortcutModal` save + `AppGrid.openUserApp`. `FilesApp.
  _sendToBrowser` now refuses `data:` URLs entirely.
- **File-import size caps.** Wallpaper 5 MB, Photos 10 MB, Files 10 MB.
  Quota-exceeded errors surface as toast.
- **PDF magic-byte verification + 50 MB cap.** Blocks renamed binary
  blobs from reaching pdf.js. `isEvalSupported: false` set on
  `getDocument()` for defense-in-depth against CVE-2024-4367 (we
  ship pdf.js 4.10.38 which has the patch already; this is the
  third layer).
- **Ko-fi modal `sandbox` + `referrerpolicy="no-referrer"`.** Hides
  the chrome-extension://<id> URL and prevents framebust. Modal
  also gained `role="dialog"`, `aria-modal`, `aria-labelledby`,
  Escape-to-close, and focus-on-open.
- **`importAll` strips `__proto__`/`constructor`/`prototype` keys.**
- **CSV-injection escape in calculator tape export.**
- **NaN guards** on parseFloat/parseInt slider readers (ClockApp
  alarm volume, PhotoEditor adjustments + brush size).

### Architecture / cleanup

- **Wallpaper writes route through `kernel.storage`** so the choice
  syncs across devices via chrome.storage.sync. Custom-image data
  URL stays in raw localStorage (would blow the 8 KB/item cap).
  Envelope-aware readers added to themes.js, starfield, and
  MobileContextMenu for early-boot paths.
- **`function css(href)` extracted from 14 app files** into
  `os/utils/dom.js` `cssLink(href)`. −56 LOC.
- **ProcessManager public API**: `getInstance(pid)`,
  `getProcessInfo(pid)`, `closeProcess(pid)`. Three sites in
  mobileShell that were poking past `processManager.processes` now
  go through the API.
- **Event names normalized to kebab-case.** 5 snake_case events
  renamed (`theme_change`, `name_changed`, `clock_update`,
  `theme_request`, `weatherchange`). `KNOWN_EVENTS` const added to
  `os/kernel.js` documenting both buses.
- **REGISTRY duplicate `yancotab_starfield_enabled` removed** +
  source-grep regression test that fails on any future duplicate.
- **`offline_enabled: true`** added to manifest.
- **Dead `css/solitaire.css` deleted** (812 lines, was only in SW
  precache; the live cosmic Solitaire uses a different file).

### Tests

1337 tests, +16 from v1.1.0. New suites:
- `tests/url-safe.test.js`
- `tests/safeSave.test.js`
- `tests/todo-persistence-helpers.test.js`
- `tests/appStorage-string-save.test.js`
- `tests/appStorage-registry-integrity.test.js`

---

## [1.1.0] — 2026-05-07

The "Table salon" wave — Tarneeb and Trix share a new oval-felt
salon shell with AI banter, Quick-start presets, hand history, and
cross-game tab switching. TicTacToe rebuilt from canvas to DOM in
the cosmic design language.

### Added — Table salon (shared shell for Tarneeb + Trix)

- **`os/apps/games/table/TableShell.js`** — layout component the two
  card games mount. Owns the chrome (titlebar with elegant Playfair
  Display italic title + cross-game tab pills Tarneeb/Trix/Hand history),
  left rail with Quick-start preset cards, center felt slot, right rail
  with scoresheet + side-actions slot + banter feed + emote row. Mobile
  collapses to single column at ≤ 720px.
- **`os/apps/games/table/banter.js`** — AI flavor-line dispatcher.
  Subscribes to reducer events (`bid:total`, `trick:won`, `slam`,
  `contract:picked`, `kingdom:end`, `game:end`, etc.), picks lines per
  seat × trigger with non-repeat ring buffer + 1.5s cooldown +
  per-trigger probability gates. One-way only — replaces the mock's
  multiplayer chat (no input field, no networking).
- **`os/apps/games/table/presets.js`** — generic preset registry; per-game
  packs (Tarneeb: Hamra Salon casual / Damascus Diwan expert / Solo;
  Trix: Bourj Trix / Saida Partners / Solo) provide the configs.
- **`os/apps/games/table/handHistory.js`** — per-game persistence
  (`yancotab_tarneeb_history_v1`, `yancotab_trix_history_v1`); newest-
  first append with 50-entry trim. Hand-history tab in titlebar shows
  last N rounds for the host game.
- **`os/apps/games/table/avatars.js`** — hex-clip compass avatars for
  N/E/S/W with role-based gradient (you / partner / opponent) and turn
  glow.
- **`os/apps/games/table/cardFace.js`** — bone-parchment Georgia-serif
  card face for the trick area + hand fan; `#c5152e` red, `#0c0c0c`
  black per the design package.

### Added — Tarneeb on the salon

- **`tarneebFeltView.js`** — oval green felt arena. Trump banner top-
  right, 4 compass avatars (south = you, north = partner per actual
  partnership), trick area in middle with cards rotated per seat,
  glass bid-bar overlay (12 number buttons + PASS) during the BIDDING
  phase, 7-position fan rotation map for the 13-card hand, status line
  bottom-center.
- **`tarneebSalonView.js`** — right-rail scoresheet (HAND/BID/US/THEM
  with last 7 rounds + totals row + "First to 41" footer) and
  per-round history-entry builder.
- **`tarneebBanter.js`** — Levantine flavor pack across 9 triggers.
- **`tarneebPresets.js`** — 3 quick-start configs.
- **`tarneebReducer.js`** — emits `bid:total` event after bidding
  completes (winner + top + total) for banter context.
- **`TarneebApp.js`** — mounts TableShell, accepts `config.preset`
  ride-along on spawn, modals (rules / scores) overlay on app root.

### Added — Trix on the salon

- **`trixFeltView.js`** — same compass + trick + hand pattern, but
  trump banner becomes a contract banner (♚/♛/♦/✚/✦), bid bar becomes
  a contract picker (5 pill buttons for remaining contracts) when
  south is the kingdom owner, "X is picking…" wait pill otherwise,
  trick area swaps to a 4-row layout board during the trix layout
  contract, hand fan grows to 13-position rotation, layout PASS
  button when no legal play is available.
- **`trixSalonView.js`** — right-rail scoresheet (last 6 deals as
  K# + contract glyph + your delta + total + per-seat tally; flips
  to team scores in partners mode) and per-deal history-entry builder.
- **`trixBanter.js`** — Levantine flavor pack across 9 triggers.
- **`trixPresets.js`** — 3 quick-start configs.
- **`trixReducer.js`** — `contract:picked`, `kingdom:end`, `game:end`
  events; `advanceAfterDeal` now takes events to push from inside.
- **`TrixApp.js`** — mounts TableShell with the same pattern as Tarneeb.

### Added — TicTacToe DOM rebuild (Cosmic redesign)

- **`os/apps/tictactoe/engine.js`** — pure FSM. Reducer over PLACE /
  RESET / RESET_STATS / SET_MODE / SET_DIFFICULTY / HYDRATE; whitelist
  on hydration so junk in storage can't poison state.
- **`os/apps/tictactoe/ai.js`** — minimax with smart-chance gating
  (easy 15% / medium 60% / hard 100% optimal); injectable RNG for
  test determinism.
- **`os/apps/tictactoe/view.js`** — DOM builder for the entire app
  frame: titlebar with vs AI / Single / Stats tabs, oval board with
  3×3 squircle grid, hex-clip corner bezels matching the dock-tile
  motif, status pulse, score chips, action row with difficulty
  chooser. Stats panel with 6 stat blocks + Reset.
- **`os/apps/tictactoe/winLine.js`** — animated SVG comet streak
  for the winning line (glow + main paths, CSS keyframe
  stroke-dashoffset reveal).
- **`TicTacToeApp.js`** — replaced wholesale (1201 → 211 lines).
  Reads new `yancotab_tictactoe_v1` storage key; one-shot migrates
  from legacy `yancotab_neon_tactics`. Keyboard: arrows/WASD cursor,
  Enter/Space place, R reset, 1/2/3 difficulty, Esc close.
- **`css/tictactoe.css`** — replaced wholesale; all colors from
  `css/tokens.css`. Mobile (≤ 720px) collapses stats grid to 2-col.
  Reduced-motion drops every animation to instant.

### Changed

- **Salon titlebar simplified** — dropped the macOS-style traffic-light
  dots and the "the table / X" breadcrumb (decorative-only). Title is
  just the game name in Playfair Display italic 24px with a faint
  accent glow.
- **Salon sizing override** — `:has()` selector opens Tarneeb / Trix
  windows at 90%×92% of viewport (vs the default 75%×84%) so the 200/
  1fr/240 stage fits the oval felt comfortably. WindowChrome edge-
  handle resize still works — manual inline styles override the
  default.
- **Salon app-root override** — `.trix-remake { height: 100vh }` was
  bursting out of the chrome content area. New `:has(.table-app-frame)`
  rule forces the root to fill its windowed parent.
- **Felt positions percentage-based** — north top / east-west / south /
  hand / bid-bar / status all expressed as % of the 660px design
  baseline so the oval scales gracefully on resize.
- **Process manager** — `kernel.on('app:open', ...)` now forwards the
  optional `config` arg (`spawn(appId, config)`) so future home-screen
  / search launches can pass `{preset: 'damascus'}` directly. Existing
  single-arg callers unaffected.

### Storage

- New REGISTRY entries: `yancotab_tarneeb_history_v1`,
  `yancotab_trix_history_v1` (user-data, conditional sync, 50-cap),
  `yancotab_table_banter_seed` (volatile, never sync),
  `yancotab_tictactoe_v1` (user-data, conditional sync, replaces the
  legacy `yancotab_neon_tactics` shape via one-shot migration).

### Tests

- 502 total (was 471, +31 new). Covers TableShell presets/banter/
  hand-history (Wave 1) plus the TicTacToe engine + AI (Wave 3).

### Service worker

- Cache name `yancotab-v1.1.0-table-ttt` to evict pre-rebuild assets.
- Precache list gains the 7 table modules + 4 trix salon files +
  4 tictactoe modules + `css/table.css`.

---

## [1.0.0] — 2026-05-06

First public release on Chrome Web Store.

### Added — Liquid Glass design pass (post-launch polish)

Implements the design from claude.ai/design (handoff bundle archived in
`design-lab/fetched-design/`). Source materials: README + chat log where
each surface was approved + the hi-fi `YancoTab New Tab.html` mock.

- **Tokens** (`css/tokens.css`) — new `--lg-*` recipe layer (tints, sheen,
  edge, spotlight, cast, sweep) + canonical `--motion-snappy` /
  `--motion-cinematic` / `--motion-spring` curves. Light-mode mirror for
  every token.
- **`css/glass.css`** — new polish stylesheet that loads last so it wins
  specificity. Owns the polish across hex tiles, search bar, widget cards,
  status bar, dock, cosmic stage (horizon glow + perspective grid floor),
  ⌘K hint, section headings, signature pill, scope tabs, folder rail.
- **Hex app icons** — chromed accent ring, wet-glass body, top sheen +
  spotlight, animated specular sweep on hover, accent under-cast halo.
- **Search bar** — bumped to 620×56 (design target). Accent-tinted
  border, layered top-light glass, drop shadow, accent under-glow on
  focus, `⌘K` hint badge that fades on focus + hides on touch devices.
- **Search scope tabs** (`SmartSearch.js`) — All / Apps / Files / Notes /
  Web below the input. Functional filter: each scope narrows result types
  and the Web fallback. Empty-state row when a scoped query has no
  matches.
- **Game icons** (`GameIcons.js`) — all 9 game SVGs replaced with the
  design's photoreal versions: Solitaire (green felt + 3 red card-backs +
  Ace top), Spider (3 stacks + cobweb hint + spider), Mahjong (ivory tile
  + bold red 中), Snake (pixel sprite + apple), Memory (3 cards w/ flipped
  star), Minesweeper (cell grid + numbers + flag + mine), Tic-Tac-Toe
  (engraved grid + teal X + red O), Tarneeb (fan + K♠ trump), Trix
  (fan + A♦). Gradient IDs prefixed `gi-` for uniqueness on the page.
- **Status bar** (`StatusBar.js`) — restructured into a full-width 3-column
  tray. Brand mark (hex glyph + YancoTab + /new tab) on the left, mid
  pills (local weather city·temp + net online/offline) in the middle,
  right cluster keeps activity pill + clock + theme + settings buttons.
- **Greeting hero** (`Greeting.js`) — design's structure: small mono
  uppercase greet line ("WEDNESDAY · GOOD EVENING, YAMAN") in accent
  color, giant `clamp(56px, 12vw, 96px)` live clock with teal `·SS`
  seconds, mono uppercase day-of-year date.
- **Pomodoro widget** (`widgets/PomodoroWidget.js`) — focus timer.
  State machine `idle → focus (25min) → break (5min)` × 4 sessions.
  Click to start / pause / resume; right-click to reset. State persists
  via `kernel.storage`. Phase transitions fire kernel toasts and emit
  `yancotab:activity` events. Visual: 88px SVG ring with accent stroke +
  drop-shadow + 2s pulse during focus, MM:SS centered, mono session
  label below.
- **Activity feed widget** (`widgets/ActivityWidget.js`) — recent
  activity, newest-first. Listens to `process:started` and the custom
  `yancotab:activity` event. 20-event ring buffer; displays the last 4.
  De-dupes identical labels within 2s. `*foo*` markdown renders as
  `<em>`. Empty-state hint on first install.
- **Folder rail** (`FolderRail.js`) — pill row below the grid mirroring
  the folders that already live in AppGrid. Each pill: 18×18 mini 2×2
  hex preview + folder name + child count. Click dispatches the same
  `item:open` event the in-grid hex uses.
- **Hex-tile dock** (`AppDock.js`) — replaces the old labeled NavBar
  with the design's exact 9-tile + 2-separator row:
  Browser | Notes | Todo | Weather | Clock | sep | Solitaire | Snake |
  Files | sep | Settings. Each tile uses SmartIcon at `--hex-size:
  44px`. Click → `kernel.emit('app:open', appId)`. Subscribes to
  `process:started` / `process:stopped` and lights a 4px pulsing accent
  dot under the tile while the matching pid is alive.
- **Cosmic stage** — `body::before` accent horizon glow (320px), `body::
  after` perspective grid floor (80×60px accent grid, `rotateX(60deg)`,
  masked to fade up). Light-mode mirrors.
- **Section headings** — uppercase title + 1px gradient rule + mono
  meta tag, between widgets and grid. Numbers omitted per Yaman's call.
- **Signature pill** — fixed bottom-right `${VERSION} · all systems
  nominal` pill with pulsing accent dot. Hides in-app.
- **AppGrid stale-positions reflow** (`MobileGridState.js`) —
  `_hasStalePositions()` repacks items into the current cols on first
  boot at a wider viewport. Fixes the symptom where items saved at
  narrower cols would render in only the leftmost columns of a 9-col
  desktop grid.
- **Storage** — three new REGISTRY entries: `yancotab_pomodoro_v1` and
  `yancotab_activity_v1` (user-data, sync conditional), and an updated
  `yancotab_widgets` default that ships `pomodoro: true`, `activity:
  true`, `clock: false`.
- **Service worker cache** bumped to `yancotab-v1.0.0-glass` so existing
  installs at the prior `yancotab-v1.0.0` cache pick up the new files
  on reload.

### Added — Phase 3 (LAUNCH) closeout
- **Promotional tile generator** (`promo-tile-generator.html`) — open in browser, click Download, get a 440×280 PNG ready for the Chrome Web Store listing's small tile slot. Uses the YancoTab logo on the left over a deep-space gradient with subtle starfield, accent glow, and "Your desktop, in every new tab." tagline. Required for CWS submission.
- **Phase 3 verification:** i18n complete (`_locales/en/messages.json` + manifest `__MSG_*__` references), privacy.html shipped (covers data/permissions/external services/storage/contact), 5 store screenshots at 1280×800, manifest CSP and permissions clean (`storage` only), all 4 icon sizes present, version synced across manifest/package/version.js/sw.js, extension payload ~9MB (under 10MB limit).
- **Remaining manual steps** before CWS submission: (1) generate the promo tile from the HTML page; (2) host `privacy.html` at a public URL and link in the CWS listing; (3) zip the extension and upload.

### Added — Phase 2 (DELIGHT) closeout
- **`Ctrl+N`** — creates a new note when the Notes app is the active window. Calls `NotesApp._createDocument()` which writes a blank note to the filesystem and opens it in a new editor window.
- **`Ctrl+Enter`** in SmartSearch — quick-capture as a note. Prepends `!` to whatever the user typed (existing quick-capture syntax) and triggers Enter, so the typed text becomes a new note title.
- **SmartSearch result limit raised 5 → 7** to match the production plan spec.
- **Phase 2 audit summary:** Greeting, Toast, Onboarding, Quick Links all verified DONE. Widget bar ships 3/4 widgets — Pomodoro widget deferred (no Pomodoro app exists yet; building the app is out of v1 scope). Command palette `> focus` mode also deferred — depends on Focus Mode (Phase 4 feature).

### Added — Error boundary safety net (Phase 1.9 closeout)
- **MobileShell `process:started` handler** — already wrapped app-mount in try/catch with a "App crashed" + Restart card (verified working). Extended to ALSO wrap `WindowChrome` instantiation so a fundamental DOM-construction failure in window chrome can't take down the entire shell. On WindowChrome failure: console.error + error toast, app.close() called, home grid stays usable.

### Fixed — Wallpaper precache + dead-path cleanup (Phase 1.7 closeout)
- **Service worker precache** was referencing 7 wallpapers + 1 root `wallpaper.webp` that no longer exist (`black`, `dark`, `deep-blue`, `mint`, `pink`, `sky`, `violet` — replaced months ago by 8 themed wallpapers `emerald`, `obsidian`, `sapphire`, `amethyst`, `rose`, `arctic`, `sunset`, `crimson`). The dead refs caused `cache.addAll()` to reject on first SW install, silently disabling offline support. Replaced with the 8 real wallpapers.
- **MobileContextMenu wallpaper picker** referenced the same dead 7-list. Updated to the 8 themed wallpapers and added migration entries for old gradient strings + old image paths so users with stale `yancotab_wallpaper` values (`url("assets/wallpapers/deep-blue.webp")`, hex colors, etc.) auto-migrate to the closest current theme.
- **`scripts/take-screenshots.mjs`** updated to reference `sapphire.webp` instead of dead `deep-blue.webp`.

### Changed — Storage consistency (Phase 1.5 closeout, Tier 1)
- **NotesApp** — `view` and `sort` UI prefs migrated from raw `localStorage` to `kernel.storage` (with new REGISTRY entries `yancotab_notes_view` and `yancotab_notes_sort`).
- **StatusBar** — removed legacy `yancotab_clock_v2` fallback. Now reads only the canonical `yancotab_clock_state_v3` via `kernel.storage`.
- **AppearanceSettings** — Background Animation toggle now writes through `kernel.storage` instead of raw `localStorage` (registered new key `yancotab_starfield_enabled`).
- **starfield.js** — envelope-aware: parses AppStorage's `{data, version, ts, ...}` wrapper as well as plain JSON / legacy strings. Required because starfield boots before kernel.storage is ready.
- **WeatherService** confirmed compliant — already prefers `kernel.storage` when the service constructor receives it from kernel.js (always, in normal operation). Legacy localStorage reads at lines 122-152 are one-time migration paths reading deprecated keys, not violations.

### Added — Starfield motion toggle (Phase 1.2 closeout)
- **Settings → Appearance → Motion → Background Animation** — toggle for the starfield. Storage key `yancotab_starfield_enabled` was already wired up in `starfield.js` but no UI exposed it. Toggling reuses the `yancotab:theme_change` event so the starfield starts/stops live without needing a page reload (and without registering duplicate listeners).
- The other §1.2 plan items (80-star count, image-wallpaper skip, prefers-reduced-motion, FPS cap when blurred) were already shipped — confirmed in the audit.

### Changed — Unified icon system closeout
- **Built-in app icons** — all 11 standard apps and 9 games now resolve through the central icon registry (`os/ui/icons/AppIcons.js` → `PHOSPHOR_ICONS` / `GAME_ICONS`). Emoji values (`'🔢'`, `'⚙️'`, `'📝'`…) and game-prefix strings (`'game:mahjong'`…) removed from `mobileShell.js`'s apps array. User-added shortcuts still use their own `icon` (favicon URL or picked emoji) via the static-fallback path.
- **Hex container background** — single source of truth via `getCategoryColor(appId)` (productivity blue / media purple / utilities teal / games red / external orange). Per-app gradient block deleted from `shell.css` — it was fighting the inline category color and making the icons inconsistent in light mode.
- **Dead code removal** — `SmartIcon.js` lost 9 unreachable render methods (renderPhotos, renderMaps, renderSettings, renderBrowser, renderWeather, renderNotes, renderFolder, renderFiles, renderCalculator) — they were shadowed by the registry dispatch and never fired. 412 → 250 lines.

### Added — Light theme completion
- **`Auto` theme mode** — third option alongside Dark/Light. New users default to Auto and follow their OS `prefers-color-scheme` setting. Runtime listener flips the theme when the user changes their OS theme without needing a tab reload.
- **Theme settings UI** — replaces the binary Dark Mode toggle with a Dark / Light / Auto segmented control.
- **Light-mode token completeness** — `--accent-contrast`, `--depth-1..5`, `--aurora-1..3`, `--aurora-bg`, `--particle-dim`, `--particle-bright`, `--specular` all defined under `body.theme-light`. Previously these fell through to dark values, leaking dark glows + shadows into a light UI.
- **Light-mode accent pinning** — color themes (Emerald, Crimson, Amethyst…) keep their accent in dark mode but pin to system blue `#007AFF` in light mode. Reason: teal `#00e5c1` on white is 1.46:1 contrast (fails WCAG); blue is 4.51:1 (passes AA exactly). Color-theme choice is preserved — switching back to dark restores the picked accent.
- **Starfield off in light mode** — twinkling teal/white dots over a light gradient look like noise, not stars. Subscribes to `yancotab:theme_change` to start/stop on the fly.
- **`tests/theme-mode.test.js`** — 16 cases covering `getStoredMode` + `getThemeMode` resolution across explicit/legacy/auto/null storage states × OS-light/OS-dark.


- **Lazy-load apps** — boot no longer eagerly imports all 20 app classes. Each app's JS is fetched on first launch and cached on the registry entry. Boot script graph drops from ~70 modules to ~25; mid-tier-Android boot saves ~60–250ms of parse time. The service-worker precache list is unchanged so offline-first still holds — the win is JS parse cost, not bytes downloaded.
- **Spawn double-tap fix** — rapid double-tap on an icon previously dropped the second tap silently (returned pid `-1`). Empty-config spawns are now deduped: two simultaneous taps share one pid, one window. Single-window-per-icon-tap behavior preserved.
- **Multi-file open from FilesApp** — `spawn('notes', {path:A})` and `spawn('notes', {path:B})` now correctly produce two separate pids and two windows. Previously the second call could collide with the first via the spawn lock and silently fail.
- **Import failure UX** — failed lazy `import()` (network glitch, deleted file, parse error, 15s timeout) emits `system:app-error`; MobileShell shows a "Couldn't load X" toast. Previously failed silently.
- **Import retry** — a rejected loader now clears its cached promise so the next spawn re-attempts.
- **Service-worker version skew** — when SW activates over a real older cache, open clients get a `sw-updated` postMessage. MobileShell shows a non-dismissible "Reload" banner so users don't end up mixing old- and new-version modules.
- **`tests/process-manager.test.js`** — 16 cases covering register/registerLazy, concurrent spawn dedup, config-bearing spawn isolation, import failure + retry, init failure cleanup, kill-during-init, URL/scheme guards, and lifecycle event order.
- **`tests/_helpers/fakeKernel.js`** — minimal kernel double; sets the convention for future test helpers.

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
