# Changelog

All notable changes to YancoTab will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [1.4.1] — 2026-08-03

Light theme was unusable on the home screen, and had been for a long
time. Apps and Focus Mode were fine, which is why it survived.

### Fixed

- **The dark wallpaper covered the light theme entirely.** `#app-shell`
  is full-bleed at `z-index: 1` with `background-image:
  url(wallpapers/emerald.webp)` hardcoded in `main.css`, and there was no
  light-mode counterpart. So light mode's `--bg` never showed: the dark
  photo stayed put while the light text tokens (`--text-bright` `#1d1d1f`)
  applied on top of it. Greeting, clock, app labels, page tabs and folder
  pills were all but invisible. Reproduced on defaults with no wallpaper
  set.

  Light mode now renders a surface instead of shipping eight light
  wallpapers. Contrast becomes deterministic — no photo can guarantee
  4.5:1 across every region a label might land on — and it adds no bytes
  to an offline-first extension.

  The `!important` on that rule is load-bearing rather than lazy:
  `themes.js applyWallpaper()` writes the wallpaper as an **inline**
  style for every non-default color theme, and `WallpaperManager` does
  the same for custom images. An important author declaration is the only
  thing in the cascade that outranks a normal inline one. A plain CSS
  override would have fixed the default theme and silently lost for
  anyone on Sapphire, Rose or a custom image.

  Trade-off, deliberate: the chosen wallpaper is not shown in light mode.
  It returns untouched in dark, which is the default.

  That this was the intended design all along is written into the
  codebase — `glass.css`'s light label rule opens with *"In light theme
  the wallpaper goes light"*, and the light greeting rules already swap
  their dark halos for light ones. Only the wallpaper override was ever
  missing.

- **`--text` had no contrast headroom in light mode.** `#6e6e73` (Apple's
  secondary label, which assumes pure white beneath) measured 4.66:1 on a
  perfectly flat `--bg` and dropped under 4.5:1 over *any* tint at all —
  4.09:1 on the darkest part of the new surface, failing AA for the date
  line and idle page tabs. Now `#5d5d63`: 5.28:1 there, 6.01:1 flat,
  6.54:1 on white cards, and still clearly between `--text-bright` and
  `--text-dim`.

- **Accent-as-text failed AA at small sizes.** Light mode's system blue
  `#007AFF` is 3.24:1 on the surface, so the greeting line (11px) and the
  active page tab (10.5px) both failed. New `--accent-text` token —
  `#0058bf`, 5.38:1 — used only where accent is *text*. Rims, fills and
  glows keep system blue. In dark mode `--accent-text` aliases `--accent`,
  so every switched call site is a literal no-op.

- **The Ko-fi "Support" badge was invisible in light mode**, at 1.08:1 —
  it hardcoded `rgba(200, 220, 240, …)`, which is exactly dark mode's
  `--ui-text-rgb`. Swapping the five occurrences to
  `rgba(var(--ui-text-rgb), …)` fixes the hue in light and changes
  nothing in dark, since that token already flips per theme. A light-only
  alpha bump (0.65 → 0.85) takes it to 5.71:1, matching the dark badge's
  5.72:1.

- **The search placeholder was 2.37:1** in light mode. It is this field's
  only label, so it is real text and owes 4.5:1; alpha 0.45 → 0.75 gives
  5.07:1. The dark rule has the same weakness and is deliberately left
  alone — dark is the default and out of scope here.

- **`.greeting-sec` re-declared `-webkit-text-fill-color: var(--accent)`
  after its `color`**, which silently overrides `color` on every WebKit
  engine. The seconds now take `--accent-text` in both declarations;
  without the second one the first was inert.

### Verified

Every element named above was measured, not eyeballed: text colour
composited through its own background chain down onto the **darkest pixel
the surface can produce** (bottom of the linear ramp plus the nearer
accent radial), with transitions suppressed. All 13 clear WCAG AA — 4.5:1
for normal text, 3:1 for large.

Three measurement traps were worth the trouble:

- `getComputedStyle` returns *interpolated mid-transition* values, so
  anything with a `color` transition reads as its previous colour right
  after a theme switch. Suppress transitions first.
- Suppressing **animations** too is wrong here: `greetFadeDown` uses
  `fill-mode: both`, and killing it drops the Ko-fi badge back to its
  declared `opacity: 0.32`. That cost one round of "fixing" an opacity
  that was never broken.
- The clock is `background-clip: text`, so a naive backdrop walk compares
  its gradient against itself and reports exactly 1.00:1.

### Dark theme

Unchanged, and asserted rather than assumed: wallpaper still
`emerald.webp`, `--accent-text` resolves to `#00e5c1`, `--text` to
`#8a9bb0`, and the Ko-fi text, border, ornament and placeholder all
resolve to their original literals.

### Tests

1938 (+13). `tests/light-theme-contrast.test.js` pins the combination
that failed — a token block in `tokens.css` and a background in
`main.css`, each individually fine. It asserts the light `#app-shell`
override exists, is `!important`, and does not reintroduce a wallpaper;
that the light text tokens clear AA against the computed worst-case
surface; that the hierarchy stays ordered; and that dark's
`--accent-text` still aliases `--accent`.

One test asserts `--accent` alone would **fail** AA, so that anyone
"simplifying" `--accent-text` away finds out why it exists. Both guards
were mutation-tested: reverting `--text` to `#6e6e73` fails the AA test,
and deleting the shell override fails three.

---

## [1.4.0] — 2026-08-03

The desktop learns to tell you something before you click. App icons now
carry live badges — and the badge path turns out to have been dead since
v1.0.

### Added — icon badges

`SmartIcon` has emitted a `.smart-badge` element since v1.0 whenever
`metadata.badge` was set. Nothing ever set it, and **no stylesheet ever
styled it**, so even a populated badge would have rendered as an unstyled
div. Both halves are now real.

| Icon | Badge | Source |
|---|---|---|
| Todo | red count pill, capped at `99+` | undone tasks across every mission |
| Pomodoro | pulsing teal dot | a session actively counting down |
| Clock | amber dot | at least one armed alarm |

Counts where the number is the message, dots where the state is. A count
of alarms would be noise — that *an* alarm is set is the whole point;
conversely a dot on Todo would hide the difference between one task and
thirty.

### How it is wired

Not by threading a `badge` field through the four places that construct a
`SmartIcon`. That would mean re-rendering icons on every data change,
which fights the grid's drag state, and it would have missed the dock and
folder overlay unless all four were kept in sync forever.

Instead `BadgeManager` paints onto whatever `.hex-icon[data-app-id]`
elements are in the document. Grid, dock and folder overlay get badges
without knowing badges exist — verified by switching page tabs and
opening/closing a folder overlay and confirming the badges survive.

Two triggers: storage subscriptions on the three source keys, and a
`MutationObserver` for re-rendered icons. The store only emits when
content actually changed, so a per-second Pomodoro `TICK` that changes
nothing costs nothing.

The painter writes badge nodes into the tree it observes, which is a
self-trigger loop waiting to happen. Every host carries a
`dataset.badgeSig` and painting is skipped when the signature is
unchanged, so a settled tree produces no mutations. Confirmed by watching
badge node add/remove counts for 3 idle seconds: **0 and 0**.

### Placement

The badge is a direct child of `.hex-icon`, which is deliberately the one
layer of the icon carrying no mask — the hexagon mask lives on
`.hex-icon::before`, `::after` and `.hex-icon-content`. Putting the badge
inside the content wrapper instead would have sliced it along the hexagon
edge, the same class of bug as v1.2.2 / v1.2.3. Verified rather than
assumed: the host reports `mask: none`, `clip-path: none`,
`overflow: visible`, and the badge overhangs the corner by 2px.

### Fixed

- **The status pill went stale on every todo change.** It refreshed only
  on alarm events and tab-visibility changes, so completing a task left
  it showing the old count until you switched tabs and back. Harmless
  while it was the only counter on screen — but a live icon badge now
  sits centimetres away, and "0 badge / 2 tasks" reads as a broken app.
  It subscribes to the same keys the badges do; verified moving in
  lockstep 2 → 1 → cleared.

- **The count pill failed WCAG AA in light mode**, at 3.55:1 (white on
  `--danger` `#ff3b30`). At 10px bold this is not "large text", so 4.5:1
  applies. Fixed by deepening the red rather than dimming the text —
  white on `#d70015` is 5.38:1, and dark ink on the brighter dark-mode
  red is 5.74:1.

  The two themes genuinely need opposite foregrounds, so this is a new
  `--badge-alert-bg` / `--badge-alert-fg` token pair rather than a
  hardcoded hex in `badges.css`. Both values were computed, not eyeballed.

### Changed

- **`countOpenTodos` / `countActiveAlarms` now have one definition**, in
  `badges/badgeModel.js`. `StatusBar` had its own copies; the pill and the
  icon badge reading from separate counters is precisely how the v1.1.1
  TodoWidget bug happened, and this time the two would have been rendered
  side by side.
- Badges hide entirely under `body.focus-active` — Focus Mode collapses
  the desktop, so badges must not outlive it.

### Tests

1925 (+26). `tests/badge-model.test.js` covers the counters against
hostile input (all three source blobs are user-editable by JSON import and
two are sync-replicated, and a badge that throws takes the icon paint down
with it): holes in the mission array, malformed tasks, a missing `done`
flag, non-finite counts.

Also covered: the cap at `99+`, that a paused timer does **not** read as
running, that an empty object does not read as running merely because its
phase isn't `'idle'`, and that `badgeSignature` is stable for equal
descriptors — that last one is load-bearing for correctness, not speed,
since an unstable signature would make the painter retrigger its own
observer forever.

### Known issue — not introduced here

Light theme is broken on the home screen: the body keeps its dark
background while light-mode text tokens apply, leaving the greeting,
clock, app labels and page tabs nearly unreadable. Apps and Focus Mode are
unaffected. Verified pre-existing by stashing all of the v1.3.0 and v1.4.0
work and reproducing on a clean tree with no wallpaper set. Tracked
separately; the dark default is unaffected.

### Service worker

Cache bumped to `yancotab-v1.4.0-badges`. Precache gains `css/badges.css`,
`badgeModel.js` and `BadgeManager.js`.

---

## [1.3.0] — 2026-08-03

Five releases of audits, so: a feature. **Focus Mode** — the last
surviving idea from the ORBIT concept in the production plan's design
fight, and the only Phase 4 item that never got built.

### Added — Focus Mode

Collapses the desktop to three things: the clock, one task, and the
Pomodoro ring. Grid, dock, search, widgets, folders, status bar and the
cosmic stage decorations all go away.

- **Entry:** `> focus` in SmartSearch, or **Ctrl+Shift+F**. Shift is
  required — plain Ctrl+F is the browser's find bar, which an extension
  has no business shadowing.
- **Exit:** Escape, or the exit button. Escape is two-stage: while the
  task input has focus it only blurs, so the key that dismisses a typo
  isn't also the key that tears down the screen.
- **Keyboard:** Space start/pause, ←/→ (and ↑/↓) change task, Enter
  completes.
- **The task** comes from the active Todo mission. Choosing one *pins*
  it, but a pin is honoured only while that task is still open — complete
  it in the Todo app or the Today widget and Focus Mode moves on rather
  than leaving you staring at something already finished. With no open
  tasks the card becomes an input, and what you type is created and
  pinned in one step.
- **Persists across reloads.** This is deliberate, not an oversight: a
  new tab opens dozens of times a day, and one opened mid-session should
  reinforce the session rather than drop you into a grid of games. It is
  skipped while onboarding is up, so a first run never starts occluded.

### Notes on ownership

Focus Mode reimplements neither system it renders.

- Timer transitions dispatch the same intents through
  `pomodoro/engine/reducer.js` that PomodoroApp uses. Three surfaces now
  tick (app, widget, focus); each re-reads storage before applying
  `TICK`, so whichever fires first advances the phase and the others
  observe the advanced state — one transition, one toast.
- Task writes route through `todo/persistence.js`, so `streakLog` and
  `completedAt` stay consistent with TodoApp's own writes. Verified by
  asserting a streak entry actually appears after completing from the
  focus screen — this is the exact bug class that bit TodoWidget in
  1.1.1, where it wrote a v1 schema the app no longer read.
- `yancotab_focus_v1` is the only key Focus Mode owns, and it is
  **never synced**. "Am I focusing right now" is a property of this
  device in this moment; replicating it would drop a second machine into
  Focus Mode with a task pinned by an id that may not resolve there.

### Fixed

- **Toasts were invisible behind the overlay.** Caught while
  red-teaming, not by looking at the code: the first version sat at a
  hand-picked `z-index: 9000`, above the entire token scale — so every
  toast painted underneath it. Proven rather than argued, by firing a
  real toast and confirming `elementFromPoint` at its centre returned
  the overlay. That silently swallowed "focus complete · 5-min break",
  which is the one message a focus session exists to deliver.

  The fix isn't a bigger number on the toast: a new `--z-focus: 750`
  token slots the overlay into the documented stacking order — above
  search (700), below toast (800), onboarding (950) and the boot screen.

- **Two labels failed WCAG AA in light mode.** `.fm-date` and
  `.fm-elapsed` used `--text-dim`, which light mode resolves to
  `#aeaeb2` — measured at **2.03:1**. Both now use `--text` (4.66:1
  light, 6.94:1 dark). All twelve text/background pairs were measured
  across both themes and all pass.

  Measuring this needed care: `.fm-exit` reads `2.61:1` if you sample it
  right after switching themes, because it is the only element here with
  a `color` transition and `getComputedStyle` returns the interpolated
  mid-flight value. With transitions suppressed it settles at 4.66:1.
  The label fixes were real; that one was the measurement lying.

- **Tap targets were 26px and 28px.** The checkbox is the primary action
  on the screen. Both now carry a true 44×44 hit area via an unstyled
  `::before`, with the visual size unchanged. `inset` resolves against
  the *padding* box, so the borders make the required offsets −11px and
  −9px rather than the −9px/−8px that arithmetic on the border box
  suggests — verified by hit-testing the corners, and by completing a
  task with a tap outside the visible circle.

### Changed

- **`mobileShell.js` 976 → 924 lines.** The contract says a non-trivial
  edit to a file over the cap should extract a chunk rather than add to
  it, so the global keyboard shortcuts moved to a new
  `os/ui/shellShortcuts.js`. Net effect of this release on the worst
  offender in the codebase is −52 lines.
- Focus Mode's own DOM scaffold lives in `focus/focusView.js`, following
  the view-extraction pattern already used by Tarneeb, Trix and Todo.
  No file added here exceeds 130 lines.

### Tests

1899 (+40). `tests/focus-mode.test.js` covers the pure core: task
selection and pin-staleness, cycling (asserted in *both* directions —
an unknown current id plus a naive `idx + step` sends dir=-1 to the end
of the list instead of the top), MM:SS and elapsed formatting, phase
labels, and ring progress.

Hostile input is covered because all three blobs Focus Mode reads are
reachable by JSON import: `normalizeFocusState` rejects non-string and
empty task ids (a `0` id is falsy-but-truthy enough to suppress the
first-open fallback), non-finite timestamps, and drops unknown keys.
Ring progress is clamped at both ends — a backgrounded tab can tick long
past a deadline, and a progress above 1 would invert the dash offset and
draw the ring backwards.

### Service worker

Cache bumped to `yancotab-v1.3.0-focus-mode`. Precache gains
`css/focus.css` and the four new modules.

---

## [1.2.5] — 2026-07-29

Extended the audit to HTML and the config files. The markup itself was
clean; the references between files were not.

### Fixed

- **Offline mode was serving no CSS at all.** `sw.js` precaches
  `'./css/shell.css'`, but `index.html` requests
  `'./css/shell.css?v=<version>'`. `caches.match()` keys on the full URL
  including the query, so every one of the 15 stylesheets missed the cache
  and fell through to the network. The precache *looked* healthy — 349
  entries, every path verified to exist in 1.2.0 — while offline had no
  styling whatsoever.

  Fixed with `{ ignoreSearch: true }` on the cache-first branch only. Proven
  both ways against the real Cache API: precached as `/css/shell.css` and
  requested as `/css/shell.css?v=v1.2.4`, exact matching misses and
  `ignoreSearch` hits. The network-first API branch deliberately keeps exact
  matching — the same probe showed `ignoreSearch` there returns one
  latitude's weather for another's.

- **`index.html` had drifted four versions behind.** All 15 `?v=`
  cache-busting queries and the boot screen's subtitle still read `v1.1.2`
  while manifest, package.json, `os/version.js` and `sw.js` had moved to
  `v1.2.4`. `ASSET_VERSION` exists in `os/version.js` but nothing consumes
  it, and with no build step there is nothing to template these — so the
  release version actually lives in **seven** places, not the four the
  project contract names.

  Consequence: returning web-app users kept the v1.1.2 CSS out of their HTTP
  cache, so none of the v1.2.x visual work reached them, and the boot screen
  advertised the wrong version.

### Audited clean

No findings in the shipped HTML for: boolean attributes set to `"false"`
(the same trap fixed in `el()` last release), duplicate ids, dangling
`for` / `aria-labelledby` / `aria-describedby` / `aria-controls`
references, missing local `href`/`src` targets, or inline scripts and
`on*` handlers (which MV3's CSP kills silently). `manifest.json` icons,
the new-tab override, and every `__MSG_*__` placeholder all resolve.

### Tests

1859 (+30). `tests/asset-refs.test.js` covers version sync across all seven
locations, service-worker cache correctness (precached paths exist, the
static branch ignores the query, the API branch does not), manifest and
locale references, and the six HTML checks above — run per shipped page.

Which pages ship is read from `scripts/pack-extension.sh`'s own `EXCLUDES`
list rather than hardcoded, so the audit follows the packer. That parser
needed a fix of exactly the kind this file exists to catch: one exclude
comment reads "aren't part of the extension", and that lone apostrophe
desynchronised naive quote-pairing, silently shifting every entry after it
and pulling two dev-only pages into the audit.

Both new guards were verified to fail on mutation — reverting `?v=` to the
stale value and removing `ignoreSearch` each turn the suite red.

---

## [1.2.4] — 2026-07-29

Applied the v1.2.3 audit idea to the JS side — "code that looks like it
works and silently does nothing" — and found a live one: **every button in
the Mahjong sidebar was dead**, including New Game.

### Fixed

- **`el()` now handles HTML boolean attributes correctly.**
  `os/utils/dom.js` routed every non-`class`/`style`/`on*` prop through
  `setAttribute(key, value)`. Boolean attributes are presence-based, so
  `setAttribute('disabled', 'false')` **disables** the element — meaning
  `disabled: someCondition` broke in exactly the case it was guarding: the
  falsy one, where the control was supposed to be *enabled*.

  Confirmed live before fixing: all four Mahjong sidebar buttons
  (Undo / Hint / Shuffle / New Game) reported `.disabled === true`, three of
  them rendering `disabled="false"` with no `is-disabled` class — so they
  looked perfectly clickable and did nothing. There was no way to start a new
  game from the sidebar.

  Ten call sites were affected across Mahjong, Tarneeb, Trix, Tic-Tac-Toe and
  three PDF chrome modules. Fixed once in `el()` rather than ten times at the
  call sites: a truthy value sets the attribute to `""` (the spec's canonical
  form), and `false` / `null` / `undefined` / `""` remove it.

  The list is explicit rather than "drop every falsy value", because
  `aria-expanded="false"` is meaningful and must survive. Verified both ways.

  `disabled: 'disabled'` — the deliberate always-off spelling used for the
  Files placeholder tab and Pomodoro's "coming soon" Detach button — still
  reads as truthy and keeps working.

- **Non-function `on*` props are dropped instead of becoming attributes.**
  `onclick: cond ? null : fn` fell past the listener branch (which requires
  `typeof value === 'function'`) into `setAttribute`, writing a literal
  `onclick="null"`. MV3's CSP makes that inert, so it failed silently. No
  standard attribute begins with `on`, so there is nothing to fall through to.

### Tests

1829 (+9). `tests/el-props.test.js`:

- Unit tests for the new `el()` behaviour against a DOM stub — falsy boolean
  omitted, truthy applied as `""`, ARIA `false` preserved, non-boolean
  attributes untouched, non-function `on*` dropped, and the exact expressions
  from the shipped bug (`!!(!canUndo)`, `i === 0`, …) asserted both ways.
- A source scanner over `os/` that still flags the *other* silent-failure
  shapes `el()` cannot fix: DOM-only properties with no content attribute
  (`textContent`, `className`, `innerHTML`, `htmlFor`), `value` on a
  `<textarea>` (whose value comes from child text — already fixed once for
  the OCR panel in 1.0.0), and non-function `on*` values.
- As with the CSS guard, a companion test asserts the scanner still parses
  >200 `el()` call sites, so a broken parser fails loudly instead of passing
  vacuously. That guard earned its keep immediately: the first version of the
  scanner matched tag names against a comment/string-blanked copy of the
  source and parsed zero call sites.

### Verified

Smoke-launched all 22 apps after the change: 21 render with zero console
errors, and Minesweeper mounts its 1280×520 canvas as expected (it is a
canvas game). Mahjong specifically: Undo correctly disabled at game start,
Hint / Shuffle / New Game enabled, and clicking Shuffle reorders the board
while preserving all 144 tiles.

---

## [1.2.3] — 2026-07-29

Swept every stylesheet for the clip-path bug fixed in v1.2.2, and added a
test so it cannot come back. Found 15 more instances across 8 files —
including an invisible keyboard focus ring, which is an accessibility bug.

### Fixed

Written as a static analyser rather than a grep, because the broken
declaration almost never sits in the same rule as the `clip-path` — it is
usually a state variant (`.x.is-selected .y`) on an element clipped by its
base rule, which no amount of grepping for `clip-path` will surface.

| file | what was dead |
|---|---|
| `browser.css` | `.wh-legend-dot.is-anchor` glow; `.is-standard` border |
| `calculator.css` | `.calc-key.is-eq` drop shadow |
| `files-vault.css` | `.fv-cell.is-drop-target` ring **and** glow; `.fv-coin.is-selected`; `.fv-coin.is-pinned`; the `fv-drop-flash` keyframes |
| `pdf-codex.css` | `.cx-ol-dot` border; `.cx-ol-item.is-active` glow |
| `photos-lightbox.css` | `.lb-month.is-active` glow; **`.lb-cell:focus-visible` outline** |
| `pomodoro.css` | `.sol-pip-dot` border; `.sol-pip.is-active` glow |
| `table.css` | `.table-player-av` lift; `.table-player-turn` glow **and** ring |
| `todo.css` | `.mc-chk` border |

Three deserve calling out:

- **Keyboard focus was invisible on clipped controls.** An `outline` paints
  outside the border box, so the global `*:focus-visible` ring is deleted on
  any clipped element. `.lb-cell`, `.mc-chk`, `.wh-portal-hex` and
  `.cx-bm-dot` now carry an inset focus ring instead.
- **Dragging a file onto a folder showed nothing.** `.fv-cell.is-drop-target`
  set both a `0 0 0 2px` ring and a 30px glow; a spread-only shadow paints
  entirely outside the border box, so the clip removed both.
- **The Tarneeb/Trix whose-turn indicator was fully invisible** — its glow
  was a `filter: drop-shadow` on the clipped element itself (deleted), and
  its ring was an `::after` at `inset: -3px` *inside* the clipped host, so
  the part that reached past the hexagon was cut.

### Changed

Fixes use whichever of three shapes fits:

- **Inset the effect** — a border becomes `box-shadow: inset 0 0 0 1px`,
  which follows the hexagon instead of being sliced into fragments along the
  two vertical edges. Used for the plain borders and focus rings.
- **Unclipped host + clipped `::before`/`::after` surface** — the host keeps
  no clip so it can carry a real `filter: drop-shadow()`, and a pseudo
  element carries the hexagon fill via a `--*-bg` variable so state variants
  stay one-liners. Used for `.wh-legend-dot`, `.calc-key`, `.fv-cell`,
  `.fv-coin`, `.cx-ol-dot`, `.lb-month-pip`, `.sol-pip-dot`. Hosts with text
  content get `isolation: isolate` so the `z-index: -1` surface sits behind
  the text without escaping behind an ancestor.
- **Move the effect to an unclipped ancestor** — used for the table avatar,
  where both pseudo-elements were already taken.

`fv-drop-flash` now animates `filter` rather than `box-shadow`: the shadow
was invisible while the host was clipped and would have drawn a rectangle
once it wasn't.

### Tests

1820 (+2). `tests/clip-path-effects.test.js` fails on any clipped element
that declares an outer `box-shadow`, a `filter: drop-shadow()`, an
`outline`, or a `border`, and follows `animation-name` into `@keyframes`
(the `fv-drop-flash` bug lived there and a rule-level scan missed it).

It resolves `var()` before deciding whether a shadow layer is `inset` —
without that, every token-composed inset shadow such as
`box-shadow: var(--lg-edge)` reads as a false positive and the guard is
useless. A second test asserts the analyser still finds >20 clipped classes,
so a broken selector parser fails loudly instead of silently passing.

---

## [1.2.2] — 2026-07-29

Revives twelve glows and outlines that `clip-path` has been silently
deleting — including the Notes star selection ring, which meant selecting
or dragging a star produced no visual feedback at all.

### Fixed

The v1.2.1 notes flagged three dead glows. Auditing properly found twelve,
because the first pass only inspected rules that *declare* `clip-path` — it
missed the state variants that set a shadow on an element clipped by its
base rule.

**Notes stars** (`.nc-star-core`): base, `.is-anchor`, `.is-idea`,
`.is-draft`, `.is-selected`, `.is-dragging`.
**Browser portals** (`.wh-portal-hex`): base, `.is-anchor`, `.is-dragging`,
`.is-merge-target`, `.is-floating`, `.is-recent`.
**Notes timeline** (`.nc-tl-marker`).

Three of these were worse than merely invisible:

- `.is-selected` / `.is-dragging` stars set `0 0 0 2px` selection rings. A
  spread-only shadow paints entirely outside the border box, so the clip
  removed it — selecting or dragging a star showed nothing.
- `.is-anchor` / `.is-merge-target` portals used `border: 1px/1.5px solid`.
  A border sits *inside* the border box, so the clip kept only the
  fragments running along the two vertical edges, drawing a broken outline
  rather than none.
- `.is-recent`'s pulse was an `::after` at `inset: -4px` *inside* the
  clipped hex. Children of a clipped element are clipped too, so the 4px it
  reached past the hexagon was cut, and `z-index: -1` hid the remainder
  behind the hex's own near-opaque background.

### How

Not fixable in place, and this was verified rather than assumed — each
option was rasterised through an SVG `foreignObject` and the pixels read:

| technique | glow outside the shape |
|---|---|
| `clip-path` + `box-shadow` | none (the original bug) |
| `clip-path` + `filter: drop-shadow()` on the **same** element | **none** — the filter is applied before the clip, so the clip eats it too |
| `filter: drop-shadow()` on an **unclipped ancestor** | works |

The ancestor-filter route was still wrong here: `.wh-portal` and `.nc-star`
also contain a favicon and a text label, which would have glowed too. So
each glow became its own unclipped layer on the parent — a `::before` aura
and a `::after` outline, both absolutely positioned, so neither adds
layout. Auras are radial rather than hexagonal: at these blur radii the two
are indistinguishable, and it avoids maintaining a second mask asset. The
outlines *are* hexagonal (a slightly larger clipped hexagon behind the
core, so the 1–2px that peeks out reads as a rim).

Parameterised via custom properties (`--aura-blur`, `--aura-rgb`,
`--aura-a`, `--ring-w`, `--ring-o`), all derived from the core's size, so
each of the twelve variants is one or two lines and `.is-anchor` can resize
the core without the aura drifting. `.is-done` now dims its aura too —
otherwise a completed star blazed as brightly as an open one.

Falloff was tuned against measured pixels rather than by eye; stops run to
100% of `closest-side` so the glow reaches the full blur distance (an
earlier attempt died at 74%, ~14px short on the portal).

### Notes

- Every dead `box-shadow` on the three clipped elements was removed rather
  than left in place. A declaration that looks functional but cannot render
  is how this bug survived in the first place.
- `.is-floating` keeps a white haze rather than the accent, so a detached
  portal still reads as detached.

---

## [1.2.1] — 2026-07-29

Carries the rounded-hex corners from the home screen into the app
interiors, so the whole extension matches instead of just the new-tab
surface.

### Changed

- **`--hex-clip` now resolves to a rounded clipPath** instead of
  `polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)`. That one
  token change rounds all 42 in-app hex decorations across 13 stylesheets —
  browser portals, files vault cells, notes markers, PDF outline dots,
  photo lightbox cells, pomodoro pips, settings badges, todo icons, table
  avatars, tic-tac-toe bezels, calculator keys.
- **40 literal `polygon(...)` copies replaced with `var(--hex-clip)`**, and
  the four `var(--hex-clip, polygon(...))` fallbacks in `maps.css`
  collapsed. The shape now has exactly one definition
  (`HEX_PATH_D` in `os/ui/icons/hexGeometry.js`) feeding three consumers:
  the `--hex-mask` token, the SVG rim stroke, and this clipPath.

### Why a clip and not the mask

An audit of all 42 rules before converting found two things that ruled out
reusing `--hex-mask` here:

- **Six sites are interactive** — `.calc-key`, `.fv-cell`, `.lb-cell`,
  `.mc-chk`, `.wh-portal-hex`, `.cx-bm-dot`. `clip-path` clips hit-testing;
  `mask` does not. Swapping them would have silently grown each click
  target from the hexagon to its full square bounding box, which for a
  calculator keypad or a packed photo grid means squares that can overlap
  their neighbours and steal clicks.
- **Three sites have outer glows that `clip-path` is silently discarding** —
  `.wh-portal-hex` (`0 0 24px`), `.nc-star-core` (`0 0 18px`),
  `.nc-tl-marker` (`0 0 10px`). Same latent bug the home tiles had. Left
  as-is deliberately: unclipping them is a visual change to Notes and the
  Browser that belongs in its own pass, not smuggled into a corner-radius
  change. Noted here so it isn't lost.

`clipPathUnits="objectBoundingBox"` is what makes one definition fit every
element size — `clip-path: path()` cannot, being fixed pixels. The 0..100
path is reused verbatim with `transform="scale(0.01)"`.

`os/boot.js` now calls `ensureHexDefs()` before first paint. This is
load-bearing: an invalid `clip-path: url()` reference computes to `none`
rather than erroring, so a missing `<defs>` would render every in-app hex
as a plain square with nothing in the console.

### Tests

1818 total (+5). New coverage in `tests/hex-geometry.test.js`:

- `--hex-clip` points at the clipPath rather than a polygon.
- **No stylesheet reintroduces the sharp hexagon.** Scans all of `css/`
  with block-comment stripping (line-based stripping reported tokens.css's
  own documentation of the old value as an offender). Verified to fail with
  an exact `file:line` when a sharp polygon is added back, and to pass once
  removed.
- `boot.js` imports and calls `ensureHexDefs`.
- `ensureHexDefs` emits both the gradient and the clipPath, with
  objectBoundingBox units and the `scale(0.01)` rescale.

Verified in-browser that the clip actually *resolves*, which computed style
cannot tell you — `clip-path` reports `url("#yv-hex-clip")` whether or not
the reference is live. Used hit-testing instead: on `.calc-key` the centre
hits the element while all three probed square corners miss, which is only
true if the clip is active. Confirmed `url("#yv-hex-clip")` and sane
near-square aspect ratios (0.87–0.89) on decorations across Todo, Settings
and Files.

### Service worker

Cache bumped to `yancotab-v1.2.1-hex-round` so existing installs evict the
13 stylesheets whose hex corners changed.

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
