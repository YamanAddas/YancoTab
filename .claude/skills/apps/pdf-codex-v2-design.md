---
name: pdf-codex-v2
status: design — awaiting Yaman approval
owner: architect
target-version: tracked under v1.2.x → v1.3.x (multi-phase)
supersedes: current PdfReaderApp + os/apps/pdf/codex.js
---

# PDF Codex v2 — design doc

> A research-and-design proposal for replacing the half-finished PDF
> Reader with a complete reading + annotation + library experience that
> belongs in YancoTab. **No implementation in this doc.** Pause here
> for Yaman's approval before any file lands.

The current PDF Reader has a strong foundation — the engine/view split,
the streak heatmap, the quote-with-citation formatter, and the
selection-menu plumbing are all good ideas. But the user-facing surface
is missing the basics every modern PDF reader ships with: zoom,
view modes, in-doc search, color-pickable highlights, sticky notes,
right-click that knows you're in a PDF, and storage that doesn't choke
on a textbook. v2 keeps the good ideas, fixes the perception gaps, and
lifts the size ceiling from "embarrassing 50 MB" to "limitless within
your disk."

---

## Table of contents

1. [Vision](#1-vision)
2. [Competitive landscape](#2-competitive-landscape)
3. [Storage redesign — `pdfStore` (IDB)](#3-storage-redesign--pdfstore-idb)
4. [Library shell](#4-library-shell)
5. [Reader chrome v2](#5-reader-chrome-v2)
6. [Search inside](#6-search-inside-replace-coming-soon)
7. [Annotations v2](#7-annotations-v2)
8. [PDF-specific context menu](#8-pdf-specific-context-menu)
9. [Innovation hooks](#9-innovation-hooks)
10. [Module layout](#10-module-layout)
11. [Storage keys + IDB schema](#11-storage-keys--idb-schema)
12. [Phased rollout](#12-phased-rollout)
13. [Risks](#13-risks)
14. [Out of scope](#14-out-of-scope)
15. [Open questions for Yaman](#15-open-questions-for-yaman)
16. [Tradeoffs at a glance](#16-tradeoffs-at-a-glance)

---

## 1. Vision

**The best PDF reader on the new tab page** — meaning: open any PDF
you have on disk, of any size, in two clicks; read it well (zoom,
modes, search, dark mode, fullscreen); mark it up (highlight, note,
underline, bookmark) with the same fidelity Acrobat gives you; never
lose your place across browser restarts; and have it *integrate* with
the rest of YancoTab — quotes flow into Notes, the streak counts
reading days, the library is a first-class app surface, not a "click
the + button" empty state. All local. No upload. No telemetry. No
account. The only network call is for the user's clipboard when they
hit Send-to-Notes.

If a feature doesn't serve "useful local PDF reader that respects
privacy and runs with no account," it doesn't belong.

---

## 2. Competitive landscape

| Reader | Strengths | What we beat them at |
|---|---|---|
| **Adobe Acrobat Reader (web/desktop)** | Industry standard. Forms, signatures, annotations, comments. | Privacy: Acrobat phones home aggressively. Speed: web Acrobat is heavyweight. Integration: Acrobat doesn't know about your Notes app. |
| **Edge built-in PDF viewer** | Excellent zoom, search, highlight, ink. Free. Cross-platform. Read-aloud. | We replace Edge inside Edge — and we're the new tab so we're already there. We don't *replace* it on `chrome://` opens; we add a Library + annotations + Notes integration that Edge has no concept of. |
| **SumatraPDF (desktop)** | Tiny, fast, every format. | We're inside the browser; no install. We have annotations; Sumatra famously refuses to add them. |
| **PDF Expert (macOS/iOS)** | Beautiful annotations, OCR, fill-and-sign. | Free. Local-first by architecture, not opt-in. No account. |
| **Foxit Reader** | Feature parity with Acrobat at lower price. | Privacy: Foxit also phones home. We're free and the source is auditable. |
| **Tabbedout / Brave's PDF.js viewer** | Same engine we use. | We layer a real product on top of pdf.js — they ship the raw viewer. |

### Table-stakes (must have)
- Zoom (in/out, fit, presets, pinch, ctrl+wheel)
- Page modes (single, continuous, two-up, presentation)
- In-doc search with match highlighting + match counter
- Highlight (multi-color), underline, strikethrough, sticky notes
- Bookmarks + outline (TOC)
- Reading position memory
- Page rotation
- Print
- Download
- Right-click that gives PDF actions, not the desktop menu
- Dark-mode page rendering
- PDF internal links (cross-refs, GoTo annotations) clickable
- Reasonable file-size handling (≥ a few hundred MB)

### Differentiator (we ship)
- **Library, not just a recents list** — IDB-backed, thumbnail grid,
  resume cards, progress bars, search across docs.
- **Reading streak** — already shipped, keep + promote.
- **Quote vault** — every Send-to-Notes ever, browsable by date/doc.
- **Quotes link back to source** — click a Notes quote, jump to that
  page in that PDF.
- **Bookmark constellation** — when ≥3 bookmarks exist, show them as
  stars on a vertical timeline you can tap.
- **Margin lab** — sticky notes auto-collated into a per-doc notebook.
- **Inline calc on selection** — already shipped, keep.
- **Auto-OCR for scanned PDFs** — tesseract is already vendored;
  detect text-layer-empty pages and offer OCR. Local, no upload.

### Deliberately out
- **Forms / fillable forms** — pdf.js can render the AcroForm UI but
  filling/saving requires writing the PDF back, which means
  re-serializing through pdf-lib (a runtime dep, banned).
- **Digital signatures** — same reason; cryptographic save path.
- **Redaction** — destructive edit; safe redaction requires re-write.
  Out unless we ship a real PDF writer (post-v2).
- **Reorder/insert/delete pages** — also requires writing the PDF.
- **Read-aloud / TTS** — Edge does this fine; we don't add value.
- **Cloud sync of annotations** — IDB is local-only; a future
  syncable-summary key in `chrome.storage.sync` could ferry small
  annotations only, but that's a v3 conversation.

---

## 3. Storage redesign — `pdfStore` (IDB)

### Why IDB, not the existing FilesApp / localStorage

The current path stores PDFs as base64 data URLs inside FilesApp,
which is itself backed by `localStorage`. The total per-origin
quota for `localStorage` is ~5–10 MB *across all keys combined*,
not per item. A 30 MB PDF cannot live there at all. Even at the
self-imposed 50 MB hard cap, base64 expansion (~33%) means a 35 MB
binary becomes a 47 MB string that immediately blows the origin
budget — silently failing other apps' writes too.

**IndexedDB** in modern Chrome:
- Quota is "best effort," typically a generous fraction of free
  disk (commonly several GB out of the box).
- `navigator.storage.persist()` upgrades to "persistent" status
  (browser will not evict under storage pressure) on user grant.
- Stores `Blob`s natively — no base64 expansion, no decode cost.
- Per-origin scoped; never reaches `chrome.storage.sync` unless we
  explicitly copy a derived summary out.
- MV3-compatible from extension pages (`chrome-extension://`).

**Why not OPFS?** OPFS (Origin Private File System) is faster
for streaming and is the right answer for "tons of small files," but:
- API is younger (Chrome 102+ is fine for us — we already require it
  for SIMD WASM — but the API surface is fiddlier).
- pdf.js consumes `ArrayBuffer` / `Uint8Array` / blob URLs, not
  file handles; no perf advantage in our access pattern.
- `chrome-extension://` origin support landed but tooling and
  debugger support lag IDB.

**Why not File System Access API (showOpenFilePicker)?** Requires
user grant on every load on extension pages (different from web
pages); would force a permission dance every time you open a PDF
already in your library. Bad UX.

**Decision:** IDB it is. Wrap it in a kernel-registered service so
no app talks to `indexedDB` globally.

### Schema

Database: `yancotab_pdf_v1` — version 1 to start.

```
ObjectStore: documents
  key:       id (string, e.g. 'doc-2026-05-10-a3f1')
  value:     {
    id, name, sizeBytes, importedAt, mtime,
    pageCount,                  // resolved on first open
    blob: Blob,                 // application/pdf
    thumbnailDataUrl?: string,  // 200x240 page-1 render, lazy
    sourcePath?: string,        // legacy fs path if migrated
    tags?: string[],
  }
  indexes:
    - byImportedAt
    - byMtime
    - bySourcePath (for the FilesApp bridge)

ObjectStore: viewState
  key:       docId
  value:     {
    docId,
    page: number,
    scrollY: number,            // continuous scroll
    zoom: number,               // 1.0 = 100%
    mode: 'single'|'continuous'|'spread'|'book',
    rotationByPage: { [page]: 0|90|180|270 },
    sidebar: 'outline'|'thumbnails'|'bookmarks'|null,
    lastOpenedAt: number,
  }

ObjectStore: annotations
  key:       autoIncrement
  value:     {
    id, docId, page, kind,      // 'highlight'|'underline'|'strike'|'note'|'ink'|'quote'
    color: 'accent'|'warm'|'rose'|'violet'|'cool'|'black'|'white',
    // shape varies by kind:
    text?: string,              // highlights/underline/strike: matched text
    body?: string,              // note: contents
    x?: number, y?: number,     // note/ink: page-relative %coords (0..1)
    paths?: string[],           // ink: SVG path 'd' strings
    createdAt, modifiedAt,
  }
  indexes:
    - byDocPage (compound [docId, page])
    - byDoc (docId)
    - byKind (compound [docId, kind])

ObjectStore: searchIndex
  key:       docId
  value:     {
    docId,
    builtAt: number,            // when extraction completed
    pageCount: number,
    pages: string[],            // pages[i-1] = lowercased text of page i
    bytes: number,              // approx size for quota math
  }
```

### API surface

Module: `os/services/pdfStore.js` (≤ 320 lines).
Exposed on the kernel as `kernel.getService('pdfStore')`.

```js
// Lifecycle
await pdfStore.open();                         // idempotent; opens DB
pdfStore.close();                              // tear-down on app destroy

// Documents
await pdfStore.addDocument(blob, name, meta?); // → { id, ...metadata }
await pdfStore.listDocuments({ sort, limit }); // → metadata[]
await pdfStore.getDocument(id);                // → { ...metadata, blob }
await pdfStore.readBlob(id);                   // → Blob (no metadata)
await pdfStore.updateMeta(id, patch);          // partial, validated
await pdfStore.deleteDocument(id);             // also drops annotations + view + index
await pdfStore.replaceContent(id, blob);       // for the rare "import a newer copy"

// View state
await pdfStore.getViewState(docId);
await pdfStore.saveViewState(docId, patch);    // debounced on caller side

// Annotations
await pdfStore.listAnnotations(docId);
await pdfStore.listAnnotationsOnPage(docId, page);
await pdfStore.addAnnotation(docId, ann);      // → { id, ... }
await pdfStore.updateAnnotation(id, patch);
await pdfStore.deleteAnnotation(id);
await pdfStore.deleteAnnotationsForDoc(docId);

// Search index
await pdfStore.getSearchIndex(docId);
await pdfStore.saveSearchIndex(docId, pages);  // pages: string[]
await pdfStore.deleteSearchIndex(docId);

// Quota
await pdfStore.estimateQuota();                // → { usage, quota, persistent }
await pdfStore.requestPersistence();           // → boolean
```

All methods return Promises; never throw on "not found" (return
null). Throws on `QuotaExceededError` so callers can surface a
toast — wrapped in a typed `PdfStoreQuotaError` so the UI can
match against the cause without sniffing strings.

### Quota strategy

- On first `addDocument`, call `navigator.storage.persist()` once.
  Persistence cannot be revoked from script; if denied, store still
  works under "best effort."
- Show used / available in the Library footer:
  `12.4 GB free of 18.2 GB · Persistent storage on`.
- On `QuotaExceededError`: toast `Storage full — free up space in
  Library` with a CTA that scrolls the Library to the largest doc.
- Soft warning when usage > 80% of quota, again at 95%.
- `pdfStore.estimateQuota()` wraps `navigator.storage.estimate()`
  with a fallback for browsers that don't expose it (returns
  `{ usage: null, quota: null }`).

### Migration

- One-shot on first v2 launch: enumerate `kernel.storage.load('yancotab_pdf_recent')`,
  for each entry whose `path` resolves to a real PDF in FilesApp:
    - Read the data URL out of FilesApp.
    - Decode to `Blob`.
    - `pdfStore.addDocument(blob, name, { sourcePath: path })`.
    - Migrate the bookmarks/highlights map keyed by `path` to be
      keyed by the new `docId` (we store `sourcePath` so we can
      look up).
- Don't delete the FilesApp copies during migration. Yaman keeps
  authority over his FS.
- After migration, recents list is no longer the canonical home —
  Library is. We keep `yancotab_pdf_recent` as a fast-access
  array of `{docId, openedAt}` for the home/Recent filter.

### `Save to Files` button — keep or kill?

**Recommendation: keep, but rename to "Export to Files."**
Rationale: the Library is canonical; FilesApp is a virtual FS the
user thinks of as theirs. A user who imports a PDF probably wants
it in the Library, not in `/home/documents/`. But some users want
a doc to appear in their FS (e.g., to send via the Browser app or
share via some future export path). Make it a deliberate export,
not a default.

The current "Save to Files" silently fails for any PDF over ~5 MB
because of the localStorage cap. Document this in the button
tooltip: "Export to Files (max ~5 MB)." For larger files, gray it
out and explain in the tooltip.

---

## 4. Library shell

The current empty state is one button + 5 recents. v2 promotes the
empty state to a real Library that is the app home screen.

### Layout

```
+---------------------------------------------------------------+
|  PDF Library                              [Import] [More]    |   <- top bar
+---------------------------------------------------------------+
|  [All]  [Recent]  [Reading now]   Search docs                |   <- filter row
|                              Sort: Last opened    Grid       |
+---------------------------------------------------------------+
|                                                                |
|   [thumb]  [thumb]  [thumb]  [thumb]  [thumb]                  |   <- cards
|   Cosmic   Snow      ICRP-103  thesis   FDIC                  |
|   p.12/108  p.1/210   p.4/96    p.79/210 p.34/52              |
|   |||      |        |          ||||    |||||                   |
|                                                                |
|   [thumb]  [thumb]  [thumb]  [drop +]                          |
|                                                                |
+---------------------------------------------------------------+
|  12.4 GB free of 18.2 GB - Persistent storage on              |   <- footer gauge
+---------------------------------------------------------------+
```

### Per-card behavior

```
+-------------+     thumbnail (page 1, lazy-rendered & cached
|             |       in IDB after first open)
|   [thumb]   |
|             |
+-------------+
  Cosmic Klondike Strategy            (name, clamp 2 lines)
  p.12 of 108                         (last-read page)
  ||||||||                            (progress bar)
  Resume - 2h ago                     (CTA + last opened)
```

Click card -> resume reader at last view state.

Right-click on card opens a card-specific context menu:
- Resume
- Open in new window  *(future, when we have multi-window)*
- Rename — opens an inline input
- Reveal in Files  *(only if `sourcePath` exists)*
- Export to Files
- Download to disk
- Remove from Library  *(confirms; deletes blob + annotations)*
- Share quote  *(opens Quote vault filtered to this doc)*

### Filter row

- **All** — every doc in the library
- **Recent** — opened in the last 30 days, sorted last-opened-desc
- **Reading now** — has a `viewState.page > 1` and `lastOpenedAt`
  within 7 days. The "I am in the middle of this" filter.
- **Search docs** — searches title + extracted text from
  `searchIndex`. Hits show a snippet + page number.

Sort dropdown: Last opened / Date added / Name / Size.

View toggle: Grid (default) / List.

### Library drag-drop

- Dropping a PDF anywhere in the Library calls
  `pdfStore.addDocument()` and opens it.
- Dropping a folder (where supported) recursively imports all
  `.pdf` files inside. Capped at 50 files at once with a progress
  toast.

### Empty Library state (truly first-run)

```
+----------------------------------------+
|                                         |
|             [book icon]                 |
|                                         |
|      Your PDF library is empty.         |
|                                         |
|   Drop a PDF here or click Import.      |
|                                         |
|      [Import PDF]  [Import from Files]  |
|                                         |
+----------------------------------------+
```

The "Import from Files" button opens a sub-modal that lists
`*.pdf` items in `/home/documents/` and offers to copy them in.

### Storage gauge

Footer pill that updates on every doc add/delete:

```
12.4 GB free of 18.2 GB - Persistent storage on
```

Click -> opens a "Manage storage" modal listing docs sorted by
size, with delete buttons. This is the pressure-relief valve when
the user runs out.

---

## 5. Reader chrome v2

A complete redesign of the reader top bar plus the addition of
optional sidebars. The current bar (prev / title / counter / heat /
search-stub / next) is a reading-only bar. v2 supports interaction.

### Top bar

```
+----------------------------------------------------------------------+
| [Library]   Title - Section          Search   Rotate  Modes  More  | -+ |
|                                                                       |
|                                  [page 12 / 108]                      |
+----------------------------------------------------------------------+
```

Left to right:
- **Library button** — back to the Library shell. Doesn't close the doc;
  the reader unmounts but `viewState` is saved first so reopening
  resumes instantly.
- **Title - Section** — same as today, the active outline section
  trails the doc title.
- **Search** — opens the find-bar (see Section 6).
- **Rotate** — rotates current page 90 degrees clockwise. Long-press for
  rotate-counterclockwise / rotate-doc-not-just-page.
- **View-mode group** (4 segmented icons):
  - Single page
  - Continuous (default for portrait stages)
  - Two-up spread (default for landscape >= 920px)
  - Two-up book (cover-offset spread)
  Active mode highlighted; click cycles or opens a popup picker.
- **More menu**: Print, Download, Properties (page count, file
  size, PDF version, title metadata), Toggle dark page rendering,
  Toggle thumbnails sidebar, Toggle outline sidebar, Toggle
  bookmarks sidebar, Show keyboard shortcuts.
- **Fullscreen** — uses the Fullscreen API on the reader root.
  Slide indicator at top edge for nav when chrome is hidden.
- **Zoom group ( -  100%  + )** — zoom group (see below).

### Zoom controls

```
+------+---------------+------+
|  -   |  100%  v      |  +   |
+------+---------------+------+
```

- `-` decreases by one zoom step.
- `+` increases.
- The `100%` button is a clickable picker:
  - 50%, 75%, 100%, 125%, 150%, 200%, 300%, 400%
  - **Fit page** (vertical fit)
  - **Fit width** (default)
  - **Actual size** (1.0)
- Custom %: type a number, press Enter.

Zoom math is pure — implemented in `engine/zoom.js`:

```js
nextZoom(zoom, delta, mode)
// Snaps to nearest preset within plus-or-minus 5%, otherwise
// multiplies by 1.25.
zoomToFit(viewport, page, mode)
levelFromString(s)
formatLevel(z)
```

Inputs:
- **Ctrl/Cmd + wheel** — zoom in/out, anchored to mouse.
- **Pinch** on touch — zoom anchored to pinch center, via two
  pointer events (no `gesturechange` — that is webkit-only).
- **Double-tap / double-click on page area** — toggle Fit-width
  vs Actual size.
- **Ctrl + 0** — Fit width.
- **Ctrl + 1** — Actual size.
- **Ctrl + + / Ctrl + -** — zoom in/out.

The pinch implementation uses pointer event capture (no
`document.onmousemove` globals) and a 2-finger tracker. State lives
on the reader root; canceled by `pointercancel`.

### View modes

Four:

1. **Single page** — one page at a time. Page-flip is teleport (no
   scroll). Used for very tall pages or low-bandwidth scrolling.
2. **Continuous scroll** — virtualized vertical list. The default
   for portrait stages or any stage < 920px. Renders only the
   pages within the viewport plus or minus 1 page above/below;
   pages beyond that drop their canvas to a gray placeholder of
   correct aspect ratio. (See Section 13 risks for memory math.)
3. **Two-up spread** — current behavior. Default for landscape
   stages >= 920px.
4. **Two-up book** — page 1 alone (cover), then 2-3 / 4-5 /
   6-7... so even pages always land on the right (matches a
   physical book).

Mode persists per doc in `viewState`. App default for new docs is
Continuous on portrait stages, Two-up spread on landscape >= 920px.

### Reading-position memory

Saved on a 500ms debounce after every:
- Page change
- Scroll (continuous mode — record `scrollY`)
- Zoom change
- View-mode change
- Rotation change

When the doc reopens:
- Reader restores `{page, scrollY, zoom, mode}` immediately (before
  the first render) so there is no FOUC of "snap to page 1, then
  jump to page 47."
- A small "Resume p.47" pill appears for 3s in the top-right;
  tapping it does nothing (already resumed); ignoring it just
  fades out.
- A "Resume" button on Library cards skips the pill and goes
  straight to the saved state.

### Fullscreen / presentation

**Recommendation: use the Fullscreen API**, not in-window expansion.
Reasons:
- Users expect F11 to mean OS fullscreen.
- Hides the new-tab chrome around the reader.
- Escape exits, naturally.

Triggers: F11 key, fullscreen button, or `>` `present` command in
SmartSearch (later).

In fullscreen:
- All chrome auto-hides after 2s of inactivity.
- A 4px slide indicator clings to the top edge; mouse-near or tap
  reveals the chrome again.
- Spacebar / arrow keys advance pages.
- Esc returns to normal.

In presentation mode (a fullscreen variant): no scroll. Each page
is a "slide." Clicks/taps advance. Useful for reading slide-decks
or showing a paper to someone over screen-share.

### Page rotation

- Per-page rotation, persisted in `viewState.rotationByPage`.
- "Rotate doc 90 degrees" applies to all pages (writes a base
  rotation + clears per-page deltas).
- Toggle in the More menu for "Apply to all pages on next change."
- Default rotation is the PDF intrinsic page rotation (some PDFs
  ship with `Rotate 90` already in the page dict; pdf.js exposes
  it via `page.rotate`).

### Thumbnails sidebar

- Toggle from the More menu or `Ctrl + 2`.
- Width: 160px on the left; reader canvas shrinks accordingly.
- Each thumb: 140x180 page render at low DPR, page number under.
- Active page outlined in `--accent`.
- Click thumb -> jump to page (smooth scroll if continuous, teleport
  if single).
- Right-click thumb -> page menu (jump, bookmark page, rotate this
  page, copy page text).
- Lazy-render: only thumbs in the visible scroll window are
  generated; placeholder gray box otherwise.

### Outline sidebar

Already exists. Promote: become a top-level toggleable sidebar (not
just the side rail). Same 160px column slot. Click entries jump.

### Bookmarks sidebar

Already exists in the side rail. Same lift.

### Sidebar coordination

Only one sidebar at a time. Toggling Outline closes Thumbnails, etc.
The current "side rail" composite that shows Outline + Bookmarks +
Streak gets retired in favor of: each gets its own toggle, plus a
dedicated "Reading" panel for streak + quote vault.

---

## 6. Search inside (replace "coming soon")

The current button shows a coming-soon toast. v2 ships full-text search.

### UX

- Triggered by **Ctrl/Cmd + F**, the search button in the top bar,
  or `>` `find` in SmartSearch.
- Find-bar slides down from under the top bar:

```
+----------------------------------------------------+
| [search] buoyancy            3 of 47   < >  Aa W X |
+----------------------------------------------------+
```

- Match counter "3 of 47" updates as you type.
- `<` / `>` = previous / next match.
- `Aa` = case-sensitive toggle.
- `W` = whole-word toggle.
- `X` = close (or Esc).
- **Enter** = next match. **Shift+Enter** = previous.
- Last query persists per-doc in `viewState` so reopening the
  find-bar in the same doc shows the same query.

Match highlighting style: `background: var(--accent-bg)` for all
matches, `outline: 2px solid var(--accent)` for the current match.
Distinct from persistent highlights (which are background-fill).

### Engine

Module: `engine/search.js`.

Lazy text-extract on first search per doc:

```js
async function buildIndex(pdfDoc, docId, kernel, onProgress) {
  const pages = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const tc = await pdfDoc.getPage(i).getTextContent();
    pages.push(tc.items.map(x => x.str).join(' ').toLowerCase());
    onProgress?.(i / pdfDoc.numPages);
  }
  await kernel.getService('pdfStore').saveSearchIndex(docId, pages);
  return pages;
}
```

First search shows a progress toast: `Indexing buoyancy.pdf... 47%`.
After build, search is sync against the cached array — `O(N x K)`
where N = total chars, K = query length, fine for everything under
~10 MB of extracted text. Above that, fall back to per-page
lazy-load (scan page-by-page, stop after the user has 200 matches).

Index size: typical novel ~ 500 KB extracted, technical paper ~ 50
KB. Cap the cache at 5 MB per doc; for huge tomes we truncate to
first N pages and warn.

### Match-to-DOM rendering

When the user navigates to match #i:
- If continuous mode: scroll the page containing the match into
  view, then in `applyHighlights`-style fashion, scan the text
  layer spans and wrap the matching tokens in
  `<mark class="cx-find-match">`. Current match gets an additional
  `.is-current` modifier.
- If single/spread: jump page, then highlight as above.
- Highlights are transient — cleared on find-bar close or query
  change.

### Quirk: PDF text-layer ordering

pdf.js text items are not always in reading order (they are in
content-stream order). The search index works on the
flat-concatenated string per page, so "buoyancy" matches even if
pdf.js delivers `[buoy, ancy]` as two items. The find-bar prev/next
is index-based on the cached string; the visual highlight fans out
across however many spans contain the chars.

---

## 7. Annotations v2

Three annotation kinds in v2 (P3 milestone), one in v3 (P5).

### Kind matrix

| Kind | Storage shape | Render | Edit |
|---|---|---|---|
| **highlight** | `{kind:'highlight', text, color}` keyed by docId+page | wraps text-layer spans | click -> palette |
| **underline** | `{kind:'underline', text, color}` | text-layer underline | same |
| **strike** | `{kind:'strike', text, color}` | text-layer line-through | same |
| **note** | `{kind:'note', x, y, body, color}` (x,y are 0..1 page-relative) | 24px hex pip overlay | click -> popover |
| **ink** | `{kind:'ink', paths[], color, strokeWidth}` (P5) | SVG paths over page | eraser |

All four highlight-style kinds share the same `applyHighlights`-style
text-matching strategy already in place — just different CSS.

Color palette (already defined): `accent`, `warm`, `rose`, `violet`,
`cool`, plus `black`, `white` for ink.

### Selection palette redesign

Replace the current floating menu with a more compact pill row:

```
+------------------------------------------------------------+
|  [c1][c2][c3][c4][c5]  H U S Note  Copy Cite Calc   -> Notes |
+------------------------------------------------------------+
   colors                types       actions          primary
```

- Five color chips (small squares filled with the palette colors).
  Clicking a chip applies the current annotation kind in that
  color. If no kind has been chosen yet, defaults to highlight.
- Three type pills:
  - H Highlight (default)
  - U Underline
  - S Strikethrough
  - Note (places a note at selection start)
- Three action icons:
  - Copy
  - Cite (citation only)
  - Calc (only when numeric)
- Primary `-> Notes` button on the right.

Behavior:
- Clicking a color chip applies that color to the current
  highlight type and closes the menu.
- Clicking a type pill switches the active type — the next color
  chip applies that type. (Or: clicking a type pill with no color
  yet applies in the default color and closes.)
- Existing keyboard pattern: drag-select fires the menu near the
  selection rect, clicked-elsewhere dismisses.

### Highlight delete

Click an existing highlight -> small popover:

```
  +---------------------------+
  |  [c1][c2][c3][c4][c5]   X |
  +---------------------------+
```

- Click a different color -> re-color in place (calls `update`).
- Click `X` -> delete (calls `delete`).
- Click outside -> dismiss.

### Sticky notes

`engine/notes.js` reducer + IDB-backed persistence.

Note model:
```js
{
  id,
  docId,
  page,        // 1-based
  x, y,        // 0..1, page-relative (resilient to zoom/rotation)
  body,        // string, max 2000 chars
  color,       // palette
  createdAt, modifiedAt,
}
```

Render: a 24px hex pip absolutely positioned at `(x*pageW, y*pageH)`
inside the page annotation overlay.

Click pip -> expands to a glass popover:

```
  +-------------------------+
  | [c1][c2][c3]            |
  | +---------------------+ |
  | | Type your note...   | |  <- textarea, autofocus
  | |                     | |
  | +---------------------+ |
  |  Save - Delete - Close  |
  +-------------------------+
```

- Saves on blur or `Cmd+Enter`.
- Drag the pip (pointer-down + move > 6px) to reposition.
- Escape closes without saving (if dirty, prompts).

Add a note via:
- Selection palette `Note` button (anchors to selection start).
- Right-click on blank page area -> "Add note here" (anchors to
  click coordinates).

### Free-draw / ink (P5, deferred)

SVG paths, not raster, so they scale with zoom. Color from
palette + black/white. Simple eraser by stroke-overlap test. Pen
sizes: thin / medium / thick.

Recommendation: defer to P5. The complexity of an undo/redo stack
+ smooth path simplification + eraser hit-testing is significant,
and the primary reading workflow is annotation-by-text, not ink.

### Underline / strikethrough

Trivial variants of highlight: same text-matching, different CSS:

```css
.cx-hl.cx-hl-underline-accent  { background: none; text-decoration: underline; text-decoration-color: var(--accent); }
.cx-hl.cx-hl-strike-accent     { background: none; text-decoration: line-through; text-decoration-color: var(--accent); }
```

Stored under the same `annotations` IDB store, distinguished by `kind`.

### Quote vault

The current `todaysQuotes` list is in-session only — closing the
PDF wipes it. v2 promotes this to a **Quote vault**, persistent
across docs and time:

- Reuse IDB `annotations` store with `kind: 'quote'`.
- Every Send-to-Notes adds a quote entry: `{docId, page, text, ts}`.
- Quote vault UI lives in the right column (replaces the current
  info panel) and in the Library right tab.
- Browsable by date or by doc.
- Each entry has a "Jump to source" button -> reopens the doc at
  that page (and scrolls to the highlight if it still exists).
- Quote-vault entries can be deleted individually.

The privacy default: vault is local, no sync.

---

## 8. PDF-specific context menu

Yaman complaint: **"right click does not give options related to
where i right click in the pdf reader. it gives the general right
click that i do in desktop."**

Root cause: `mobileShell.js` lines 652 and 665 attach contextmenu
handlers in the capture phase that always `preventDefault()` and
either suppress the menu entirely (for inputs/text-editable) or
show the desktop grid menu. The PDF reader stage never gets a
chance to react.

### Fix

Approach: a one-line `defaultPrevented` check in the bubble handler
plus a `data-allow-context="true"` opt-out attribute honored by the
capture handler.

```js
// PDF reader stage attaches:
stage.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();          // prevent shell grid menu
  showPdfMenu(e);
}, { capture: false });
```

Modify `mobileShell.js` lines 652-656 (capture handler):

```js
scope().addEventListener('contextmenu', (e) => {
  const t = e.target;
  if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
  if (t?.closest?.('[data-allow-context="true"]')) return;   // <- opt-out
  if (e.cancelable) e.preventDefault();
}, { passive: false, capture: true });
```

Modify `mobileShell.js` lines 664-669 (bubble handler):

```js
scope().addEventListener('contextmenu', (e) => {
  if (e.defaultPrevented) return;     // <- add
  if (e.target.closest('.app-icon') || e.target.closest('.m-dock')) return;
  e.preventDefault();
  this.components.contextMenu.show({ type: 'grid', x: e.clientX, y: e.clientY }, e.clientX, e.clientY);
});
```

This is the standard browser pattern: any descendant that handles
contextmenu calls `e.preventDefault()` and the shell stops. Makes
future apps lives easier too. The opt-out attribute is set only on
the PDF reader stage; no other app sees behavior change.

### Hit-test logic

When the user right-clicks inside the reader stage:

```
1. If on selected text -> 'selection' menu
2. Else if on a highlight/note/ink -> 'annotation' menu  (target type)
3. Else if on a link annotation (pdf.js getAnnotations()) -> 'link' menu
4. Else if on a thumbnail in thumbnails sidebar -> 'thumbnail' menu
5. Else (blank page area) -> 'page' menu
```

### Menus

**`selection` menu:**
- Copy
- Highlight  > submenu of 5 colors
- Underline  > submenu
- Strikethrough  > submenu
- Add Note (anchored to selection start)
- Send to Notes
- Calc (only if numeric)
- Cite
- Search "<selection>" inside doc
- Search "<selection>" on Web

**`annotation` menu (right-click on existing highlight/note/ink):**
- Copy text (highlights only)
- Edit (notes only)
- Change color  >
- Delete

**`link` menu (right-click on a GoTo or URI annotation):**
- Open link
- Copy link
- Open in new tab (emits `openUrl` for the Browser app)

**`page` menu (blank area):**
- Add note here
- Bookmark this page
- Go to page...
- Rotate page right / left
- Fit width
- Fit page
- Copy page text (extracts text-layer)
- Print this page only

**`thumbnail` menu (in thumbnails sidebar):**
- Jump to page
- Bookmark page
- Rotate this page
- Copy page text

### Visual style

Yanco glass panel:

```css
.cx-ctx-menu {
  position: fixed;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow-lg);
  padding: 4px;
  min-width: 200px;
  font: 13px var(--font-sans);
  color: var(--text-bright);
}
.cx-ctx-item { padding: 6px 12px; border-radius: 4px; }
.cx-ctx-item:hover { background: var(--accent-bg); }
.cx-ctx-sep { height: 1px; background: var(--border); margin: 4px 0; }
```

Position-clamped to viewport (within 8px of edge -> flip).
Dismiss on Escape, outside-click, scroll. Submenus slide right
on hover.

---

## 9. Innovation hooks (Yanco-flavored differentiators)

We pick the ones that pay off and keep the rest as ideas.

### Recommended (ship)

- **Reading streak (already exists, keep + promote)**
  Surface in Library too — a small streak pill in the top bar of
  the Library shell, same look as today. Cheap signal that says
  "you read every day." Drives habit.

- **Quote vault (promote from session-only)**
  Every Send-to-Notes ever, browsable by date/doc. Already
  designed in Section 7. Real differentiator vs every other PDF
  reader.

- **Cross-doc citations / Notes back-links**
  When Send-to-Notes copies a quote, the markdown includes a
  YancoTab-internal link:
  `> the buoyant force... — *Snow Crash*, p.34 [open](#yancotab://pdf/doc-2026-05-10-a3f1#p=34)`
  Clicking the `open` link in Notes emits `kernel.emit('app:open',
  'pdf-reader', { docId, page })`. PDF Reader resumes that doc at
  that page. Wires PDF into Notes via the kernel event bus, no new
  permission, no networking.

- **Bookmark constellation map**
  In docs with at least 3 bookmarks, the bookmarks sidebar gets a
  "Map" toggle. Switches from a list to a vertical timeline of doc
  pages (1 at top, last at bottom), with each bookmark as a small
  star positioned at its page relative depth. Gives an "I left
  markers throughout this 400-page tome" overview without
  scrolling a list. Click star -> jump.

- **Auto-OCR for scanned PDFs**
  On open, sample 3 random pages. If their `getTextContent()`
  returns < 5 items each, the doc is likely scanned. Show a
  one-time pill: "Looks like a scan. Run OCR? (10-60s, local)".
  On accept: iterate pages, render to canvas, send to
  `kernel.getService('ocr')` (already shipped). Insert recognized
  text into the search index AND make text-layer-style spans for
  selection — even on the rendered canvas. Privacy: tesseract is
  local; nothing leaves the box. Time: ~1s/page on a laptop CPU
  for English fast model. For 200-page books, this is
  multi-minute; we run in a worker and show a progress bar with
  cancel.

### Recommended (later)

- **Margin lab** — Auto-collate sticky notes per doc into a
  notebook view. Useful but adds UI surface; defer to P4 once
  notes ship.

- **Reader mode for PDFs** — Extract text from a page and reflow
  it Safari-Reader-style alongside the page image. Killer for
  bad-column academic papers. Defer to P5 — tricky to do well
  (column detection, footnote reattachment).

### Skip

- **Spaced-repetition flashcards from highlights** — Cool but
  a dedicated app, not a PDF feature. Out.
- **PDF chat / "ask the doc"** — Would require a remote LLM call.
  Off-brand.
- **Voice notes** — Would need `microphone` permission. Off-brand.

---

## 10. Module layout

The 500-line cap means `codex.js` (432 today) cannot grow further.
v2 splits the orchestrator into focused units. Estimates assume
typical density (~ 70% comments + headers + the actual code).

### Tree

```
os/apps/
  PdfReaderApp.js                          <=180  app shell, lifecycle
                                                 — toggles Library <-> Reader

  pdf/
    library/
      LibraryView.js                        <=300  library grid + filter row + footer gauge
      LibraryCard.js                        <=120  per-doc card (thumb, name, progress)
      LibraryFilter.js                      <=120  filters + sort dropdowns
      LibraryStorageGauge.js                <=80   storage usage footer
      importExport.js                       <=200  import-from-FilesApp, export-to-FilesApp,
                                                  download-to-disk, drag-drop bridge

    reader/
      Reader.js                             <=320  was codex.js — owns pdfDoc, current view,
                                                  delegates rendering, no DOM building
      Stage.js                              <=180  stage container, sidebar coordination
      pageStrip.js                          <=260  continuous-scroll virtualization
      spread.js                             <=120  unchanged in spirit, two-page spread
                                                  + book-mode offset
      pageView.js                           <=260  was the existing pageView; minor changes
                                                  for rotation + zoom + annotation overlay
      readerBar.js                          <=200  redesigned top bar (replaces current)
      zoomControls.js                       <=140  zoom group UI + the tiny preset popover
      viewModeMenu.js                       <=80   single/continuous/spread/book picker
      moreMenu.js                           <=140  print/download/properties/sidebars/etc
      thumbnailRail.js                      <=220  thumbnails sidebar
      outlineRail.js                        <=120  outline sidebar (extracted from current
                                                  sideRail composite)
      bookmarksRail.js                      <=140  bookmarks sidebar (extracted)
      quoteVaultPanel.js                    <=180  quote vault right column
      searchBar.js                          <=220  in-doc find-bar UI + state
      contextMenu.js                        <=220  PDF-specific right-click menu
      selectionPalette.js                   <=220  redesigned selection floater
      annotationLayer.js                    <=260  per-page overlay (highlights+notes
                                                  +ink)
      noteEditor.js                         <=180  sticky-note popover + drag-to-move
      linkLayer.js                          <=140  pdf.js link-annotation rendering
      inkTool.js                            <=260  free-draw, deferred to P5
      animations.js                         <=80   transient flourishes (resume pill,
                                                  highlight glow on jump)

    engine/
      streak.js                             keep (111)
      outline.js                            keep (88)
      inlineCalc.js                         keep (197)
      quote.js                              extend -> adds yancotab:// link slug (<=80)
      highlights.js                         extend (<=140) — color picker, edit, delete
      bookmarks.js                          keep (84) — minor patch for color CTA
      notes.js                              NEW (<=180) sticky-note reducer
      ink.js                                NEW (<=200) Phase 5
      search.js                             NEW (<=200) per-doc text index + match
      zoom.js                               NEW (<=160) pure zoom-level math + presets
      viewport.js                           NEW (<=160) pure scroll/zoom/rotation geometry
      reading.js                            NEW (<=140) last-position memory + restore
      ocr.js                                NEW (<=180) page-text-emptiness detect +
                                                  ocr-orchestrate via existing ocrService

    persistence.js                          extend -> bridges to pdfStore (<=220)

os/services/
  pdfStore.js                               <=320  IDB wrapper service

css/
  pdf-codex.css                             keep, refactor — extract per-area files
                                              if it grows past 800 lines:
    pdf-library.css                         NEW (<=300)
    pdf-reader.css                          NEW (replace pdf-codex.css when ready)
    pdf-annotations.css                     NEW (<=200)
    pdf-context-menu.css                    NEW (<=140)
```

**Lines-budget total:** ~ 5800 lines of new/modified `.js` across
~ 28 files. Existing 2828 lines redistribute; new code is ~ 3000.

### Files at risk of breaching the 500-line cap

- `Reader.js` — orchestration logic compounds. Mitigation: keep
  pure logic in engines, push DOM building into `Stage.js`,
  `readerBar.js`, etc. Reader is glue + state, nothing else.
- `LibraryView.js` — grid + filters + sort + storage + drag-drop +
  empty-state handlers. Mitigation: split filter/sort/gauge into
  their own files (above).
- `pageStrip.js` — virtualization is delicate. Mitigation: factor
  pure scroll-math into a sibling `engine/viewport.js`.
- `contextMenu.js` — many menus. Mitigation: each menu is a
  factory function in the same file, but if it crosses 250 lines,
  split per-menu.
- `pdfStore.js` — IDB CRUD is verbose. Mitigation: keep schema
  open + close + the four object-store wrappers in this file;
  push `searchIndex` and `viewState` builders to engines.

---

## 11. Storage keys + IDB schema

### Principle

> **Blob/binary content lives in IDB.** Metadata, settings,
> reading-streak, recents, and other small/sync-friendly state
> live in `kernel.storage`.

### `kernel.storage` keys (small, sync-friendly)

| Key | Status | Shape | Sync | Notes |
|---|---|---|---|---|
| `yancotab_pdf_recent` | extend | `[{docId, openedAt}]` | never | Was `[{name, path, openedAt}]`. Migrate on first v2 launch. Capped at 20. |
| `yancotab_pdf_streak_v1` | keep | `{days: {YYYY-MM-DD: {openings, lastTs}}}` | never | local-only history. |
| `yancotab_pdf_bookmarks_v1` | keep, evolve key | `{[docId]: [{page, label, color, addedTs}]}` | conditional | Migration: rekey `path` -> new `docId`. |
| `yancotab_pdf_settings_v1` | NEW | `{defaultMode, defaultZoom, sidebarPref, theme: 'auto'|'dark'|'light', findCaseSensitive, findWholeWord, animatedQuotes, ocrAutoPrompt}` | conditional | App-level prefs. |
| `yancotab_pdf_library_view_v1` | NEW | `{filter, sort, viewMode}` | conditional | Last-used filter/sort/grid-vs-list in Library. |

### Removed from `kernel.storage`

| Key | Reason |
|---|---|
| `yancotab_pdf_highlights_v1` | Highlights move to IDB `annotations` store. They are per-doc and can be many MB; sync-eligible AppStorage is wrong tier. |

Migration: on first v2 launch, copy any existing
`yancotab_pdf_highlights_v1` map into IDB `annotations` (with
`kind: 'highlight'`), then **leave the old key in place** (do not
delete — paranoid backup) and ignore it.

### IDB

Database: `yancotab_pdf_v1`, version 1.

```js
const SCHEMA = {
  documents: {
    keyPath: 'id',
    indexes: [
      { name: 'byImportedAt', keyPath: 'importedAt' },
      { name: 'byMtime',      keyPath: 'mtime'      },
      { name: 'bySourcePath', keyPath: 'sourcePath' },
    ],
  },
  viewState: { keyPath: 'docId' },
  annotations: {
    keyPath: 'id', autoIncrement: true,
    indexes: [
      { name: 'byDocPage', keyPath: ['docId', 'page'] },
      { name: 'byDoc',     keyPath: 'docId' },
      { name: 'byKind',    keyPath: ['docId', 'kind'] },
    ],
  },
  searchIndex: { keyPath: 'docId' },
};
```

### Sync implications

IDB is **never replicated to chrome.storage.sync**, by design.
Reasons:
1. chrome.storage.sync has an 8 KB-per-item limit; PDF blobs would
   need chunking into hundreds of items.
2. Total chrome.storage.sync quota is ~ 100 KB. A single 50-page
   PDF annotations could exceed that.
3. PDFs are private documents; the privacy default is stay on
   this device.

A future v3 feature could opt-in a *summary* (just bookmark+highlight
counts) into sync as a "what doc did I read on the laptop?" hint,
but blobs and annotations stay local.

### Quotes

Store with `kind: 'quote'` in the `annotations` IDB store, so the
quote vault is just a filtered query: `byKind` index where
`kind = 'quote'`.

---

## 12. Phased rollout

Five phases. **Each phase is shippable on its own**: even if we
stop after P1, the user gets a strictly better PDF Reader (just
backed by IDB, with a Library, but old-style chrome).

### Phase P1 — Storage + library shell

**Goal:** kill the size cap, give the Library a real home.

**Scope:**
- New `os/services/pdfStore.js` (IDB wrapper, registered on the
  kernel).
- New `os/apps/pdf/library/` (LibraryView, LibraryCard,
  LibraryFilter, LibraryStorageGauge, importExport).
- `PdfReaderApp.js` becomes a Library/Reader switcher; opening a
  doc transitions from Library -> Reader.
- One-shot migration: existing `yancotab_pdf_recent` items in
  FilesApp -> IDB.
- Remove the 50 MB cap; new cap is whatever IDB will hold.
- Reader still uses todays chrome (search-stub still says coming
  soon). Annotations still color-locked to `accent`. No new
  annotation kinds. **No regression for the old features.**
- The Save-to-Files button stays for now; renamed Export-to-Files
  with disabled-tooltip when too big.

**Files:**

| File | New/Mod | LOC est. |
|---|---|---|
| `os/services/pdfStore.js` | NEW | 320 |
| `os/apps/pdf/library/LibraryView.js` | NEW | 300 |
| `os/apps/pdf/library/LibraryCard.js` | NEW | 120 |
| `os/apps/pdf/library/LibraryFilter.js` | NEW | 120 |
| `os/apps/pdf/library/LibraryStorageGauge.js` | NEW | 80 |
| `os/apps/pdf/library/importExport.js` | NEW | 200 |
| `os/apps/PdfReaderApp.js` | MOD | 180 (was 393) |
| `os/apps/pdf/persistence.js` | MOD | 220 (was 128) — bridges to pdfStore |
| `os/services/appStorage.js` | MOD | new keys, migration |
| `css/pdf-library.css` | NEW | 300 |
| `manifest.json` | none | (no new permissions; IDB is built-in) |

**Tests:**
- `tests/pdfStore.test.js` — IDB CRUD, quota error, migration
  read, search-index roundtrip. (Using `fake-indexeddb` would
  bring in a runtime dep; ban. Instead, hand-write a tiny IDB
  shim under `tests/_helpers/idbShim.js` or run only the pure
  parts of pdfStore — schema validation, error wrapping,
  migration-mapper. The IDB-touching code is integration-tested
  via the preview workflow.)
- `tests/pdf-library-reducer.test.js` — pure filter/sort/search
  logic.
- `tests/pdf-recents-migration.test.js` — given an old
  `yancotab_pdf_recent` shape + a fake FilesApp, the migration
  produces the expected IDB plan.

**Acceptance:**
- A 200 MB PDF can be imported and opens in the reader.
- Storage gauge displays usage and quota.
- Drag-drop a PDF onto the library imports + opens.
- Library shows recent + all + reading-now filters.
- Resume cards work — clicking opens at last-read page.
- The 50 MB toast is gone.
- All current features (highlight in `accent`, bookmarks, streak,
  outline, quote-to-Notes) still work unchanged.

**Risks:**
- Migration corruption — back up `yancotab_pdf_*` keys to
  `yancotab_pdf_*_pre_v2` before rewriting.
- Quota denial on first `addDocument` — fall back to best-effort,
  warn user once.

---

### Phase P2 — Reader chrome v2

**Goal:** parity with Edge built-in viewer.

**Scope:**
- Zoom controls (math + UI + ctrl+wheel + pinch + double-tap).
- View modes: single, continuous, two-up, book.
- Continuous-scroll virtualization (`pageStrip.js`).
- Reading-position memory.
- Page rotation.
- Fullscreen / presentation.
- In-doc search (replaces the coming-soon toast).
- Thumbnails sidebar.
- Outline + bookmarks lift to dedicated sidebars.
- Print / Download / Properties in More menu.
- Dark-mode page rendering (CSS filter:invert, optional toggle).
- PDF link annotations (clickable cross-refs, GoTo, URI).

**Depends on:** P1 (pdfStore for viewState + searchIndex).

**Files:**

| File | New/Mod | LOC est. |
|---|---|---|
| `os/apps/pdf/reader/Reader.js` | MOD | 320 (was codex.js 432) |
| `os/apps/pdf/reader/Stage.js` | NEW | 180 |
| `os/apps/pdf/reader/pageStrip.js` | NEW | 260 |
| `os/apps/pdf/reader/zoomControls.js` | NEW | 140 |
| `os/apps/pdf/reader/viewModeMenu.js` | NEW | 80 |
| `os/apps/pdf/reader/moreMenu.js` | NEW | 140 |
| `os/apps/pdf/reader/thumbnailRail.js` | NEW | 220 |
| `os/apps/pdf/reader/outlineRail.js` | NEW | 120 |
| `os/apps/pdf/reader/bookmarksRail.js` | NEW | 140 |
| `os/apps/pdf/reader/searchBar.js` | NEW | 220 |
| `os/apps/pdf/reader/linkLayer.js` | NEW | 140 |
| `os/apps/pdf/reader/readerBar.js` | MOD | 200 (was 74) |
| `os/apps/pdf/reader/spread.js` | MOD | 120 (was 73) — book-mode offset |
| `os/apps/pdf/reader/pageView.js` | MOD | 260 (was 152) — rotation, zoom-aware |
| `os/apps/pdf/engine/zoom.js` | NEW | 160 |
| `os/apps/pdf/engine/viewport.js` | NEW | 160 |
| `os/apps/pdf/engine/reading.js` | NEW | 140 |
| `os/apps/pdf/engine/search.js` | NEW | 200 |
| `css/pdf-reader.css` | NEW (replaces pdf-codex.css) | 600 |

**Tests:**
- `tests/pdf-zoom.test.js` — preset snapping, fit-page math,
  fit-width math, pinch anchor.
- `tests/pdf-viewport.test.js` — visible-page calc for
  virtualization, rotation transform, scroll-anchored zoom.
- `tests/pdf-search.test.js` — index build, match enumeration,
  case-sensitive + whole-word toggles, multi-page match cursor.
- `tests/pdf-reading.test.js` — viewState save/restore,
  debounce timing, mode-default resolution.

**Acceptance:**
- All zoom inputs work (buttons, ctrl+wheel, pinch, dblclick,
  preset picker, custom %).
- All four view modes render and persist per-doc.
- Continuous scroll on a 500-page PDF does not OOM the tab; only
  visible-pages-+/-1 are kept canvased.
- Closing and reopening a doc resumes at exact (page, scrollY,
  zoom).
- Find-bar finds 47 of 47 occurrences of `the` in a 200-page PDF.
- Thumbnails render lazily and clicking them jumps.
- Outline + bookmarks toggle independently.
- Print and Download produce a sensible result.
- Internal links jump pages; URI links open in Browser app.
- F11 enters fullscreen; Esc exits.

**Risks:**
- Continuous scroll memory profile under bad-actor PDFs (huge
  pages, gigantic embedded images).
- pdf.js render-task lifecycle: every cancellation must
  await its promise before re-render or pdf.js throws.
- Pinch anchor math drift on very-large zoom levels (10x+).

---

### Phase P3 — Annotations v2 + context menu

**Goal:** highlight / underline / strike / sticky-note / right-click
that knows you are in a PDF.

**Scope:**
- Multi-color highlight palette in the selection palette and
  context menu.
- Underline, strikethrough as new annotation kinds.
- Sticky notes: pip overlay, popover editor, drag-to-move.
- Click-to-edit / delete on existing highlights and notes.
- PDF-specific context menu (5 menu types: selection, annotation,
  link, page, thumbnail).
- The single-line `mobileShell.js` patch to honor
  `defaultPrevented` + the `data-allow-context` opt-out.
- Annotation IDB store + reducers + persistence.

**Depends on:** P1 (pdfStore.annotations store).

**Files:**

| File | New/Mod | LOC est. |
|---|---|---|
| `os/apps/pdf/reader/contextMenu.js` | NEW | 220 |
| `os/apps/pdf/reader/selectionPalette.js` | NEW | 220 |
| `os/apps/pdf/reader/annotationLayer.js` | NEW | 260 |
| `os/apps/pdf/reader/noteEditor.js` | NEW | 180 |
| `os/apps/pdf/engine/notes.js` | NEW | 180 |
| `os/apps/pdf/engine/highlights.js` | MOD | 140 (was 90) — edit + delete |
| `os/apps/pdf/engine/quote.js` | MOD | 80 (was 50) — yancotab:// link slug |
| `os/apps/pdf/persistence.js` | MOD | additions for notes |
| `os/ui/mobileShell.js` | MOD | 1-line patch + opt-out attr handling |
| `css/pdf-annotations.css` | NEW | 200 |
| `css/pdf-context-menu.css` | NEW | 140 |

**Tests:**
- `tests/pdf-notes-engine.test.js` — note CRUD, drag-position
  bounds, validation.
- `tests/pdf-highlights-edit.test.js` — color change, delete,
  idempotent re-add.
- `tests/pdf-context-menu.test.js` — hit-test classification (pure
  function: target -> menu kind).
- `tests/pdf-context-menu-opt-out.test.js` — verify the shell
  patch lets the reader contextmenu through when
  `defaultPrevented` is set.

**Acceptance:**
- Right-click selected text -> selection menu with 5-color
  highlight + underline + strike + add-note + send-to-Notes +
  calc.
- Right-click a highlight -> palette + delete.
- Right-click a link annotation -> open / copy / open-in-new-tab.
- Right-click blank page area -> page menu with rotate /
  bookmark / copy-page / etc.
- Right-click a thumbnail -> thumbnail menu.
- Sticky notes can be added (selection palette or right-click),
  edited, dragged, deleted.
- Underline + strike persist and re-apply on reopen.
- Notes back-link from Notes app reopens PDF at correct page.
- The desktop grid context menu DOES NOT appear when right-
  clicking inside the PDF reader.
- The desktop grid context menu STILL appears when right-clicking
  the desktop background (no regression elsewhere).

**Risks:**
- The `defaultPrevented` patch on the shell is a cross-cutting
  change. Test against the 17 other apps contextmenu behavior in
  a smoke test.
- Sticky-note coordinates are `(x, y)` as fractions of the page
  in CSS-pixel space. Rotation invalidates — store a `rotation`
  field too and re-project on render.

---

### Phase P4 — Differentiators

**Goal:** features the user tells friends about.

**Scope:**
- **Quote vault** as a permanent persistent list (replaces the
  in-session list). Right-column toggle `quoteVaultPanel.js`.
- **Quote back-link** from Notes — `kernel.on('app:open',
  'pdf-reader', { docId, page })` already works after P2.
- **Bookmark constellation** — when at least 3 bookmarks, sidebar
  adds a Map toggle; renders the timeline view.
- **Auto-OCR for scanned PDFs** — detect, prompt, run, integrate
  into searchIndex.
- **Reading streak promotion** to Library top bar.
- **Margin lab** (auto-collated notes per doc) — small panel in
  the right column when a doc has at least 2 notes.

**Depends on:** P3 (notes), P2 (search-index).

**Files:**

| File | New/Mod | LOC est. |
|---|---|---|
| `os/apps/pdf/reader/quoteVaultPanel.js` | NEW | 180 |
| `os/apps/pdf/reader/marginLabPanel.js` | NEW | 140 |
| `os/apps/pdf/reader/constellationMap.js` | NEW | 200 |
| `os/apps/pdf/engine/ocr.js` | NEW | 180 |
| `os/apps/pdf/library/LibraryView.js` | MOD | + streak pill |
| `os/apps/pdf/persistence.js` | MOD | + quotes (kind:quote) |

**Tests:**
- `tests/pdf-quote-vault.test.js` — add, list, filter by date/doc,
  jump-to-source URL parsing.
- `tests/pdf-ocr-detect.test.js` — text-empty page detection
  pure function.
- `tests/pdf-constellation-layout.test.js` — pure layout for the
  star map (page -> y%).

**Acceptance:**
- Quote vault persists across sessions and shows quotes from all
  docs.
- Clicking a quote-vault entry reopens the source doc at the
  page.
- Bookmark map renders when threshold met; clicking stars jumps.
- OCR prompt appears for genuinely-scanned docs and not for
  text-layered ones.
- Running OCR fills the search index and enables search to find
  text on scan-only pages.
- Reading streak pill in Library top bar matches Reader-side
  streak.
- Margin lab opens when at least 2 notes exist; shows them with
  page-jump links.

**Risks:**
- OCR is slow on long scans. UX must show progress, allow cancel,
  allow background continuation.
- IDB write churn during OCR (one searchIndex update per page
  batch). Batch into chunks of 10 pages.

---

### Phase P5 — Free-draw / ink + Reader Mode (optional)

**Goal:** post-essentials polish.

**Scope:**
- SVG-based free-draw ink with eraser.
- Pen sizes + colors.
- Reader mode for academic papers (text reflow alongside page
  image).

**Depends on:** P3.

**Files:**

| File | New/Mod | LOC est. |
|---|---|---|
| `os/apps/pdf/reader/inkTool.js` | NEW | 260 |
| `os/apps/pdf/engine/ink.js` | NEW | 200 |
| `os/apps/pdf/reader/readerMode.js` | NEW | 240 |

**Acceptance:**
- Pen tool draws strokes that survive reload, scale with zoom,
  eraser deletes them.
- Reader mode produces readable reflow on a typical 2-column
  paper.

**Recommendation:** ship **only if** P1-P4 are stable and Yaman
asks for it. Free-draw is a tar pit (palm rejection, smoothing,
undo/redo, merge logic) and Reader mode is hard to do well.

---

## 13. Risks

### R1 — pdf.js memory at 200+ MB PDFs

pdf.js holds page objects in memory; `getPage(n)` returns a
proxy that internally references decoded streams. A 200 MB scanned
textbook can balloon to 800 MB resident if all pages are loaded.

**Mitigations:**
- Continuous-scroll virtualization renders only +/-1 page from the
  viewport; pages outside that drop their canvas (`canvas.width =
  0`) and forget their textContent. The pdf.js internal page proxy
  remains until we explicitly call `page.cleanup()`.
- Periodic cleanup pass: every 30s of inactivity, sweep `pdfDoc.getPage()`
  cache and call `page.cleanup()` on all pages > 5 pages from the
  current view.
- DPR cap stays at 2 (already in `pageView.js`).
- Cap canvas width at 4096 even at high zoom; tile into multiple
  canvases for ultra-zoom (P5; defer).
- For genuinely huge PDFs (> 500 MB), warn on import: "This is a
  large PDF (612 MB). Open anyway?"

### R2 — IDB quota under best-effort mode

In Chrome best-effort mode (the default), IDB data **can** be
evicted under storage pressure. `navigator.storage.persist()`
upgrades to persistent mode — never evicted — but requires user
permission.

**Mitigations:**
- Request `persist()` on first `addDocument`. If granted, never
  ask again.
- If denied, show a one-time toast: "Storage is best-effort. Your
  PDFs may be cleared if your disk fills up. Re-grant in Site
  settings to make persistent."
- Storage gauge shows the persistent flag.
- `QuotaExceededError` -> toast + Library scroll-to-largest.

### R3 — Annotation persistence collisions across devices

IDB is local-only. A user with YancoTab on a laptop AND a desktop
will have **two separate annotation sets**. There is no sync.

**Mitigations:**
- Document this honestly in the help text + the storage gauge:
  "PDFs and annotations are local to this device. They do not sync."
- Future v3: an opt-in syncable summary (just the
  highlights+notes, no blobs) under `chrome.storage.sync` with
  per-doc chunking. Not in v2.
- In the long term, a manual export/import: "Export annotations
  for this doc" -> JSON file user can put in a USB drive and
  import on the other machine.

### R4 — Selection / context-menu interaction with mobileShell

The shell hijacks contextmenu globally. Our patch is one line in
the bubble handler (`if (e.defaultPrevented) return;`) plus a
data-attribute opt-out at capture phase. **Risk: side-effects on
other apps that also rely on the shell to suppress text-select /
contextmenu.**

**Mitigations:**
- Smoke-test against the 17 other apps before shipping P3.
- The opt-out attribute is `data-allow-context="true"` —
  applied only on the PDF reader stage. Apps that do not set it
  see no behavior change.
- The bubble-handler `defaultPrevented` check is the standard
  browser pattern — apps that want to handle their own contextmenu
  call `e.preventDefault()` and the shell stops. This makes future
  apps lives easier too.

### R5 — pdf.js worker termination on app close

`Reader.destroy()` must call `pdfDoc.destroy()` and wait for it.
Today `codex.destroy()` calls `spread.destroy()` which only
clears canvases — the pdf.js worker keeps the doc loaded.

**Mitigations:**
- `Reader.destroy()` awaits `pdfDoc.destroy()`.
- Any in-flight render task is cancelled first (already in
  `pageView.js`).
- Library switching from Reader -> Library does not tear down
  the worker — just unmounts the reader DOM. The worker stays
  alive for fast re-open. It is torn down on app close (via
  `PdfReaderApp.destroy()`).

### R6 — Print path on chrome-extension origin

`window.print()` from an extension page works but prints the
*new tab page itself*, including chrome. We need a hidden iframe
print path:

1. Create a hidden `<iframe>` with `src` = blob URL of the PDF.
2. Let pdf.js or the browser native viewer render it (in an
   iframe, the browser uses its built-in PDF viewer).
3. Call `iframe.contentWindow.print()`.
4. Remove the iframe.

**Caveat:** Some Chrome versions do not allow native PDF rendering
in `chrome-extension://` iframes due to CSP. Fallback: render a
print-only DOM with each page as a `<canvas>` in a `print` media
stylesheet, then call `window.print()` from a print-mode root.

**Recommendation:** prototype both in P2; the canvas-fallback
path is the safer default. The native iframe path only works on
some Chrome versions.

### R7 — 500-line cap on every new file

Files at risk:
- `Reader.js` (orchestrator): mitigation — push state-decisions
  into engines, push DOM into smaller view files.
- `LibraryView.js`: mitigation — pre-split filter, sort, gauge,
  card.
- `pageStrip.js`: virtualization is delicate; mitigation — pure
  scroll math in `engine/viewport.js`.
- `contextMenu.js`: mitigation — each menu is a factory; if it
  exceeds, split per-menu into `contextMenu/selectionMenu.js`,
  etc.
- `pdfStore.js`: IDB CRUD is verbose; mitigation — push search
  index + view-state shape validators into engines.

### R8 — Migration corruption

Migrating `yancotab_pdf_*` from the FilesApp/localStorage path to
IDB on first v2 launch could fail mid-flight (quota, IDB error).

**Mitigations:**
- Before mutating, copy old keys to `*_pre_v2`:
  `yancotab_pdf_recent_pre_v2`, etc.
- Migration is idempotent — running it again on partial state is
  safe (skip docs with `bySourcePath` already present).
- A "Reset to v1 storage" debug option in Settings -> Apps for the
  worst case (recovery from a broken migration).

### R9 — Yaman perception "no select and highlight and notes"

The features partly exist but are undiscoverable. v2 must surface
them prominently in:
- The empty-state hint of the Library: "Drag to select text,
  highlight, and quote."
- The reader chrome: a permanent toolbar group for annotation
  tools (highlight pen, note, underline) — even when no selection.
  Clicking the highlight pen tool *enters highlight mode* — next
  selection is auto-highlighted in the active color.
- The right-click menu: even on first launch, the user discovers
  the actions there.
- The onboarding: a single tooltip on first reader open: "Right-click
  to highlight, note, or send to Notes."

---

## 14. Out of scope

Documented here so we do not accidentally re-litigate them.

| Feature | Why out | What it would take later |
|---|---|---|
| **Filling AcroForms** | pdf.js can render the form UI but saving requires writing the PDF. Needs a PDF writer (pdf-lib) — runtime npm dep, banned. | A vendored pdf-lib or hand-written form-fill writer (months of work). |
| **Digital signatures** | Crypto + write path. | Same as forms + cryptography library. |
| **Redaction** | Destructive edit; safe redaction needs re-write. | Same as forms. |
| **Insert / delete / reorder pages** | Write path. | Same. |
| **Read-aloud / TTS** | Edge does it well; we add no value. | Web Speech API — straightforward later if asked. |
| **Cloud sync of annotations** | Privacy default + `chrome.storage.sync` 100 KB total quota. | A new "Sync annotations only" toggle in Settings, with chunking. |
| **PDF chat / Q&A** | Off-brand — would need a remote LLM. | Never. |
| **Voice notes** | New permission. | Off-brand. |
| **Multi-window comparison** | We have no real multi-window OS layer yet. | After window-manager v2. |
| **Collaborative annotations** | Server. Off-brand. | Never. |

---

## 15. Open questions for Yaman

Each has a recommendation. Stamp or push back.

### Q1 — Library vs FilesApp relationship

> Migrate FilesApp PDFs into Library on first run and delete them
> from FilesApp? Or keep both copies?

**Recommendation: keep both.** Library is canonical (Reader uses
it). FilesApp keeps its copy untouched. We import-copy on
migration, never move. Users who treat FilesApp as their FS still
have the file there. Tradeoff: 2x disk for migrated PDFs once.
Cheap given IDB quota.

### Q2 — Continuous scroll vs spread as default?

> Which default mode for new docs?

**Recommendation:** view-mode default is *stage-aware*: Continuous
on portrait or stage < 920px, Two-up spread on landscape >= 920px.
Once the user changes it, persist per-doc. This matches user
expectation across desktop vs phone.

### Q3 — Ship OCR-on-scanned in P4 or hold?

**Recommendation: ship in P4.** Tesseract is already vendored;
the marginal cost is `engine/ocr.js` (~ 180 lines) and a UI
prompt. The privacy-positive local-OCR beat is exactly the
brand we want to build. Risk: slow on long scans — mitigated by
backgrounded run + cancel.

### Q4 — Free-draw worth it?

**Recommendation: defer to P5, optional.** The reading workflow
is text-based. Free-draw doubles the annotation surface area
without a clear payoff for that use. Ship if asked.

### Q5 — Native print or Codex print preview?

**Recommendation:** prototype both in P2; ship the canvas-DOM
print path as default, fall back to native iframe only if Chrome
allows it. Native is faster and more accurate; canvas is
universally compatible.

### Q6 — Sticky-note model: per-page coordinate vs per-text-anchor?

**Recommendation: per-page coordinate (0..1, 0..1).** Resilient
across pdf.js versions, does not break if the text layer changes
order. Tradeoff: does not survive page reflow if we ever ship a
reflow mode (P5 reader-mode). For the P3 sticky-note ship,
coordinate is the right call.

### Q7 — Quote vault: replace today-quotes panel or live alongside?

**Recommendation: replace.** Today-quotes is just "vault filtered
to today." The vault becomes the canonical surface; a Today
filter at the top defaults the view to today quotes.

### Q8 — Streak pill in Reader top bar too?

> Should the Library top-bar streak pill also live in the Reader
> top-bar?

**Recommendation: yes, in both.** It is a habit-forming signal;
costs ~60px of right-aligned space. Make it Settings-toggleable
for users who do not want it.

### Q9 — Maximum doc size before we warn?

**Recommendation:** warn at 500 MB import: "This is a large PDF
(612 MB). Importing may take a moment." Hard-cap at 2 GB (a
single IDB record blob; some Chrome versions wobble above this).
Above 2 GB, tell user to split the PDF.

### Q10 — Auto-rollout to existing v1 users?

> Do we ship the v2 reader to existing v1 users automatically, or
> behind a feature flag?

**Recommendation:** automatic, gated by version bump. Migration
is idempotent + has the `*_pre_v2` backup keys. There is no v1
behavior the user would prefer.

---

## 16. Tradeoffs at a glance

Non-obvious tradeoffs the design makes, in one table for the PR
description.

| Decision | Cost | Benefit |
|---|---|---|
| IDB instead of FilesApp/localStorage | New service module, 1x per-origin DB upgrade | Lifts size cap from ~5 MB total to gigabytes per file |
| Library replaces empty-state | Brand-new shell to design + code | Real product surface; users find their docs at a glance |
| `defaultPrevented` shell patch | Cross-cutting change to mobileShell.js | Standard browser pattern; future apps benefit too |
| Per-page coordinate notes | Notes can drift if pdf.js text order changes | Resilient across pdf.js upgrades; no fragile span+offset |
| Continuous scroll default on portrait | Memory-heavier than single-page mode | Matches modern reader expectations (Edge, Chrome) |
| Annotations not synced | Two-device users lose annotations across devices | Privacy default; no chunking-into-100-KB-buckets nightmare |
| Lazy text-extraction for search | First search has a 1-2s indexing toast | Keeps boot fast; 99% of docs never get searched |
| Quote vault as `kind:'quote'` in `annotations` | Mixes annotations with captures | One IDB store, one set of indexes, one query for both |
| Free-draw deferred to P5 | No ink in v2 ship | Text-first reader; ink is a tar pit |
| OCR prompt only for scanned docs (3-page sample) | Some text-light scans get false-negative | No OCR-cost surprise on already-readable PDFs |
| Bookmark constellation gated at >= 3 marks | Most docs never see it | Does not pollute the sidebar of a 1-bookmark casual read |
| Migration backs up old keys instead of deleting | Slight storage waste once | Reversible if migration corrupts |
| Save to Files renamed Export to Files | UI rename | Reframes the canonical home (Library), keeps escape hatch |
| Print: prototype native, ship canvas | Two paths to maintain initially | One always works; native is the cherry on top |

---

## End

This doc lays out the path from "half-finished PDF Reader" to
"best PDF reader on the new tab page" in five phases, with
file-level estimates and per-phase acceptance criteria. P1
(storage + library) unblocks every other phase by killing the
size cap and giving the app a real home. P2 brings parity with
Edge built-in viewer. P3 fixes the discoverability disasters
(multi-color highlights, sticky notes, PDF-aware right-click).
P4 ships the differentiators that make YancoTab PDF Reader feel
like *YancoTab*. P5 is optional polish.

**Awaiting Yaman review.** Reply `ship P1` (or `ship P1+P2`,
etc.) and I will start implementation in dependency order. Reply
with concerns or scope edits and I will revise.
