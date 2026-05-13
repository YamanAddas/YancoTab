# PDF Reader v3 — Adobe-class Rewrite

**Status:** Design proposal. No implementation until approved.
**Author:** architect agent for Yaman.
**Replaces:** the entire `os/apps/pdf/codex*.js` orchestrator + most of `os/apps/pdf/view/*` + `css/pdf-codex.css`.
**Preserves:** pdf.js engine (`vendor/pdfjs/`), Library (`os/apps/pdf/library/`), `pdfStore` IDB schema (extended, not rewritten), engine helpers (`engine/bookmarks.js`, `engine/inlineCalc.js`, `engine/streak.js`, `engine/notes.js`, `engine/outline.js`, `engine/quote.js`, `engine/reading.js`, `engine/viewport.js`, `engine/zoom.js`).

---

## 1. Scope & goals

### In scope

1. **Adobe Acrobat-style chrome.** Real toolbar with SVG icons, real left sidebar with tabs, real selection pill with color chips. Document-first neutral surface. No more uppercase 10px mono "Codex" chrome.
2. **Offset-based highlight ranges.** Replace `applyHighlights.js`'s normalized-substring matcher with `{pageStartCharOffset, pageEndCharOffset}` against pdf.js's `getTextContent()` stream. Re-build DOM Ranges on render. Migrate existing text-based highlights (best-effort, with fallback rendering for unmatched ones).
3. **Adobe-paid features, built locally:**
   - Freehand ink annotations (Catmull-Rom-smoothed polylines)
   - Shape annotations (rect, ellipse, arrow, line) with stroke/fill/dash
   - Underline + strike-through (extending the v2 scaffolding) using the same offset-range pipeline
   - Sign PDF (draw-pad modal, 3 saved signatures, drop on page, scale handle)
   - Page reorder (drag thumbnails), single-page rotate, delete page (export-time)
   - Merge PDFs (multi-doc into one) + split PDF (page-range → new doc)
   - AcroForm fill (enable pdf.js's `AnnotationLayer` editable mode)
   - Image extract (canvas-crop per rect → PNG download)
   - Side-by-side compare (split-view + synchronized scroll + per-page diff overlay)
   - Redact (white-out boxes baked into exported copy)
4. **Feature flag.** v3 ships alongside v2 behind a `yancotab_pdf_reader_v3` preference. Default off through one full release cycle; default on next; v2 removed in the follow-up.

### Explicitly out of scope

- Collaboration / sharing / multi-user comments (no server, no accounts — non-negotiable per CLAUDE.md).
- `chrome.storage.sync` of annotations. Annotation volumes blow chunk limits; we already chose IDB for notes for the same reason. The "Export annotations as Markdown" path is the only cross-device story.
- AI summarization / chat-with-PDF. No remote inference, and a local LLM is out of v3 scope.
- AcroForm save-back to the original PDF binary. We capture form values into IDB; baking them into a saved copy is a follow-up.
- OCR-as-default. OCR remains opt-in via the Photos OCR service.
- A new PDF binary mutator (merge/split/redact-bake) until §6.6 resolves — see Risks.

---

## 2. Module layout

New tree under `os/apps/pdf/v3/`. v2 (`os/apps/pdf/codex*.js`, `os/apps/pdf/view/*`) stays on disk and stays bootable until cutover. Both load the same Library and the same `pdfStore`.

```
os/apps/pdf/v3/
├── reader.js                      orchestrator (≤450)  — replaces codex.js
├── readerKeys.js                  keyboard binding map (≤120)
├── readerActions.js               action funcs called by toolbar + keys (≤350)
│
├── chrome/
│   ├── toolbar.js                 top toolbar builder (≤400)
│   ├── toolbarClusters.js         5 cluster sub-builders (≤350)
│   ├── sidebar.js                 left rail container + tab switcher (≤300)
│   ├── tabThumbnails.js           thumbnail grid + drag-reorder (≤350)
│   ├── tabOutline.js              outline tree (≤200)
│   ├── tabBookmarks.js            bookmark list + constellation SVG (≤250)
│   ├── tabAnnotations.js          annotation list grouped by page (≤300)
│   ├── tabSearch.js               search-results list (≤200)
│   ├── selectionPill.js           floating selection menu (≤300)
│   ├── inkToolbar.js              ink color/width sub-toolbar (≤150)
│   ├── shapeToolbar.js            shape style sub-toolbar (≤200)
│   ├── signatureModal.js          draw-pad + saved-signature picker (≤400)
│   ├── pageOpsModal.js            merge/split/delete confirm UIs (≤350)
│   ├── compareView.js             side-by-side compare shell (≤350)
│   └── icons.js                   SVG icon registry, 24×24, 2px stroke (≤400)
│
├── select/
│   ├── offsetRanges.js            DOM Range ↔ {start,end} char offset (≤300)
│   ├── pageTextIndex.js           per-page text-stream index cache (≤200)
│   ├── selectionWatcher.js        selectionchange → controller (≤150)
│   └── crossPage.js               multi-page selection helper (≤200)
│
├── render/
│   ├── pageView.js                canvas + text-layer (replaces v2; ≤400)
│   ├── pageStrip.js               virtualized continuous (≤400)
│   ├── spread.js                  single/spread/book (≤350)
│   ├── annotationLayer.js         renders all annotations onto a page (≤400)
│   ├── highlightRender.js         offset-range → DOM <mark> ranges (≤300)
│   ├── inkRender.js               polyline → SVG path with smoothing (≤250)
│   ├── shapeRender.js             shape geometry → SVG (≤250)
│   ├── signatureRender.js         sig PNG → positioned <img> (≤150)
│   ├── redactRender.js            redact rect (live + baked) (≤200)
│   └── linkLayer.js               internal/external links (kept from v2; ≤120)
│
├── tools/
│   ├── inkTool.js                 pointer capture, sample, smooth, commit (≤400)
│   ├── shapeTool.js               rect/ellipse/arrow/line draw (≤400)
│   ├── noteTool.js                click-to-place sticky note (≤200)
│   ├── signTool.js                drop saved signature onto page (≤300)
│   ├── redactTool.js              rect-select for redact (≤250)
│   ├── handTool.js                grab-to-pan (≤150)
│   └── textTool.js                default selection mode (no-op stub) (≤80)
│
├── ops/
│   ├── annotationStore.js         CRUD wrapper around pdfStore.annotations (≤350)
│   ├── pageOps.js                 reorder/rotate/delete bookkeeping (≤300)
│   ├── pdfWriter.js               PDF mutation engine (see Risks §10) (≤500)
│   ├── merge.js                   multi-doc merge (≤200)
│   ├── split.js                   range-split (≤200)
│   ├── compareEngine.js           text-diff per page (≤350)
│   ├── extractImage.js            canvas region → PNG (≤150)
│   ├── exportSigned.js            bake signatures + redactions into output (≤300)
│   └── acroForms.js               read+save form values via pdf.js (≤300)
│
├── migrate/
│   └── highlightsV1ToV2.js        one-shot: text-shape → offset-shape (≤300)
│
└── README.md                      v3 internals doc; cross-reference points
```

**Per-file size discipline.** Every file lists a target cap in its header comment. CI is informal (no lint step) — the architect agent re-audits on each PR. If any file exceeds 500 lines during implementation: split before merging.

**Why no `v3/` shared with `library/`:** the library is restyled in place. New file: `css/pdf-library-v3-overrides.css` only loads when v3 is active.

**Decommission plan.** After 1 release with v3 default-on and no critical bugs: delete `os/apps/pdf/codex.js`, `codexSelection.js`, `codexSearch.js`, `codexAnnotations.js`, `codexLoad.js`, `os/apps/pdf/view/*` (except `linkLayer.js` which moved into `v3/render/`), `css/pdf-codex.css`. Move `os/apps/pdf/v3/*` up one level. Migration tests stay.

---

## 3. Adobe-style UI spec

### 3.1 Toolbar

Fixed 48px-tall pill-bordered bar across the top of the reader (below the existing app titlebar). Flat surface (`--bg-surface` in dark, `--bg` in light), no glass blur — chrome must read as a stable document workspace, not a floating widget.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [☰] | [◀] [▶]  [12 / 248]   |  [▤ ▦ ▥ ▤]  |  [−] [125%] [+] [⛶]                  │
│      |                       |              |                                     │
│      |  [T] [✋]  |  [▰▰▰▰▰][✎][▭][📝][✍]  |  [🔍] [↻] [⛶] [⎙] [↗] [⋯]           │
└──────────────────────────────────────────────────────────────────────────────────┘
   ^      ^                ^                                  ^
sidebar  nav             zoom + view-mode             tools + actions
toggle
```

Five clusters, separated by 1px `var(--border)` dividers, 16px horizontal gap inside each cluster, 24px between clusters.

| Cluster | Members | Notes |
|---|---|---|
| **Sidebar toggle** | `☰` | Single icon button. Toggles left rail. |
| **Navigation** | `◀ prev`, `▶ next`, page-number input, total | Page input is an `<input type="text" inputmode="numeric">` with `data-testid="page-input"`. Enter jumps. |
| **View mode + zoom** | Single / Continuous / Spread / Book toggle (4-segment pill), `−` zoom-out, level dropdown (50/75/100/125/150/200/300/400 / Fit width / Fit page / Actual), `+` zoom-in, fullscreen | View-mode segments are mutually exclusive, accent fill on active. |
| **Tools** | Text (T), Hand (H), Highlight color picker, Ink, Shape, Sticky note, Sign | Highlight color picker is a button that opens 5 color chips horizontally below it. Tool buttons are radio: only one active at a time except Hand which can layer. |
| **Actions** | Search (Ctrl+F), Rotate page, Fullscreen, Print, Share/Download, More (⋯) | More menu: Dark mode, Properties, Export annotations, Merge, Split, Compare, Redact mode, Page ops. |

**Visual spec.**
- Button: 32×32 hit area, 24×24 SVG inside, `border-radius: 8px`, transparent background, hover `var(--bg-glass)`, active `var(--accent-bg)` with `var(--accent)` icon stroke.
- Active tool: 2px bottom border in `var(--accent)`.
- Dividers: 1px wide, 20px tall, `var(--border)`, vertically centered.
- Page input: 56px wide, 28px tall, `--font-mono`, centered numeric.
- Zoom level dropdown: chevron-down trigger, opens menu with 12 presets + custom %-input at the bottom.
- All toolbar colors via tokens. Light mode: identical structure, `--bg` becomes `#fafafa`-equivalent (already in tokens.css under `body.theme-light`).

### 3.2 Sidebar

Left rail, 240px default, drag-resize handle on right edge (200–360px clamp). Collapsible to 0 via toolbar `☰` button.

Tabbed at the top, vertical icon-only tabs on the inner-left edge:

```
┌────┬─────────────────────┐
│ ▤  │  ╭─Thumbnails──╮    │   ▤ Thumbnails (default)
│ ≡  │  │              │   │   ≡ Outline
│ ★  │  │  pg 1  ▢    │   │   ★ Bookmarks
│ ✎  │  │  pg 2  ▢    │   │   ✎ Annotations
│ 🔍 │  │  pg 3  ▢    │   │   🔍 Search results
│    │  │   ...        │   │
│    │  ╰──────────────╯   │
└────┴─────────────────────┘
```

- Tab strip: 40px wide, vertically stacked icon buttons, 32×32 each. Active tab has 2px left border `var(--accent)` and background `var(--accent-bg)`.
- Content panel: scrolls vertically. Header (sticky 36px) shows tab name + a "+" or sort/filter action button where relevant.
- Per-tab content:
  - **Thumbnails:** vertical list of canvas thumbs at 160px wide, page number below, current page highlighted with `var(--accent)` outline. Drag-to-reorder enabled when in Page Ops mode (More menu → "Edit page order" toggles this). Right-click thumb → rotate-90, delete-page, insert-after.
  - **Outline:** existing pdf.js outline tree (we have this in `engine/outline.js`). Indented, expandable.
  - **Bookmarks:** existing bookmark list + the constellation SVG (≥3 bookmarks) that's already shipping. Restyled.
  - **Annotations:** grouped by page, each row shows kind icon (highlight/note/ink/shape/sign) + first-40-chars text or thumbnail + page link + delete. Click row → scroll to + flash annotation.
  - **Search results:** existing search UX moved out of the find-bar into the rail. Find-bar still exists as a thin overlay on the page area (replaces full top bar) — see §3.4.

### 3.3 Selection pill

Anchored above selection, flips below if selection top is within 60px of viewport top. White pill in light mode, `var(--bg-card)` glass in dark mode (this is the one place glass is allowed — it floats over content).

```
┌──────────────────────────────────────────────────────────┐
│ ● ● ● ● ●  │ U  S  │  ✎  ✉  📋  🔖  🔍  ƒ              │
└──────────────────────────────────────────────────────────┘
  yellow         underline   sticky-     copy   bookmark   calc
  green          strike      note               (if numeric)
  blue
  pink
  purple
                 send-to-Notes
```

- 5 color chips, 18px circle each, 6px gap. Click = highlight in that color.
- `U` button: applies underline annotation in selected color (defaults to last-used color).
- `S` button: applies strikethrough.
- 7 icon actions: 24×24, 4px gap, divider after color chips and between groups.
- Pill: 44px tall, `border-radius: 22px`, 1px border `var(--border)`, `box-shadow: var(--shadow-md)`, 12px padding sides.
- Selection-color memory: last color used persists in `kernel.storage` under `yancotab_pdf_highlight_color` (key registered).

### 3.4 Search bar (find)

Floating pill anchored top-right of the page area (16px inset). 320px wide. Single input + match counter (`3 of 47`) + prev/next + close (×). Per-match list in the sidebar's Search Results tab. The current `searchBar.js` rendering style is replaced.

### 3.5 Right panel (optional, hidden by default)

Annotations comments panel — same content as sidebar's Annotations tab but in card form with editable text bodies (for notes) and a "Reply" stub (stub only, no reply chain feature). Toggle via More menu → "Show comments". Out-of-the-way default.

### 3.6 Aesthetic rules

- **Light by default in the reader area.** The PDF page itself sits on a near-white surface (`--bg-elevated` light). The toolbar is the only chrome the user sees while reading. No deep-space `#060b14` inside the reader — that's for the home shell.
- Toolbar background: `--pdf-toolbar-bg` (new token; light: `#f7f7f9`, dark: `#0f1623`).
- Page background: `--pdf-page-bg` (new token; light: `#ffffff`, dark: `#0c0c0c`).
- Page shadow: `--pdf-page-shadow` (new token).
- Sidebar background: `--pdf-sidebar-bg` (new token; light: `#fafafa`, dark: `#0c1220`).
- Selection highlight (transient): `rgba(var(--accent-rgb), 0.20)`.
- Saved highlight default (yellow): `rgba(255, 222, 89, 0.45)` over text — multiplied via `mix-blend-mode: multiply` so it darkens text the way Acrobat does, not just overlays.
- No starfield, no glass blur, no hex-clips inside the reader. Yanco motifs are confined to the Library home and the app titlebar.

### 3.7 SVG icon registry (`v3/chrome/icons.js`)

Same pattern as the existing `os/ui/icons/PhosphorIcons.js` / `os/ui/icons/AppIcons.js`. 30+ icons covering every toolbar/sidebar/menu need. 24×24 viewBox, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. Returned as inline `<svg>` strings; helper `svg(name)` returns a parsed `<svg>` node for paranoid contexts.

---

## 4. Selection + offset-range pipeline

### 4.1 The bug being fixed

`os/apps/pdf/view/applyHighlights.js` walks the rendered text-layer `<span>`s and tries to concatenate their normalized text contents until the stored highlight text appears as a substring. Failure modes:

1. **Hyphenated line breaks.** pdf.js renders `"care-"` on one line and `"ful"` on the next as two separate `<span>`s. Normalized concat gives `"care- ful"`, which doesn't contain `"careful"`.
2. **Ligatures.** PDFs encode `fi` as U+FB01. Normalized concat gives `"deﬁne"`, which doesn't substring-match `"define"`. The matcher uses `String.toLowerCase()` which doesn't decompose ligatures.
3. **Per-glyph scaleX fragments.** pdf.js v4's TextLayer emits one `<span>` per glyph fragment when the PDF uses unusual font metrics. The MAX_SPAN_RUN cap of 80 silently bails on long passages with many fragments.
4. **`matchesPrefix` heuristic is wrong.** It accepts `acc` if `target.startsWith(acc.split(' ').pop())` — that allows a wildly different passage to "match" the start, then drift mid-run.
5. **Repeated text on a page.** If "the analysis" appears twice on a page, both get highlighted. Storing only the text loses position.

### 4.2 The fix: offset-based ranges

**Data shape:**

```js
// New annotation row (pdfStore.annotations, kind='highlight')
{
  id: <autoincrement>,
  docId: 'doc-...',
  kind: 'highlight' | 'underline' | 'strike',
  page: 12,
  pageStartCharOffset: 1842,   // index into pdf.js text stream for that page
  pageEndCharOffset:   1903,
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple',
  text: 'cached display string, max 240 chars',   // for sidebar list + search
  textHash: 'fnv32-of-text',     // used by fallback locator on failed offsets
  createdAt: 1715600000000,
  modifiedAt: 1715600000000,
}
```

**Per-page text index** (`v3/select/pageTextIndex.js`):

When a page renders, we already call `pdfPage.streamTextContent()` for the TextLayer. We additionally build a flat index of `{flat: string, spans: [{spanIdx, flatStart, flatEnd, spanCharStart, synthHyphen?}]}`. Hyphenated line endings are joined (no space). Ligature glyphs are decomposed (NFKC). Cached per (docId, page) in an LRU of size 32.

**API:**

```js
// v3/select/pageTextIndex.js
export async function getPageIndex(pdfPage, options) → Promise<PageIndex>
export function findRangeInIndex(index, charStart, charEnd)
  → { spans: Array<{spanIdx, spanCharStart, spanCharEnd}> }

// v3/select/offsetRanges.js
export function rangeFromOffsets(index, textLayerEl, charStart, charEnd)
  → DOMRange | null
export function offsetsFromRange(index, textLayerEl, domRange)
  → { charStart, charEnd } | null
```

**At selection time** (selectionchange handler):
1. Get `window.getSelection().getRangeAt(0)`.
2. Determine which page(s) the range touches by walking up to the nearest `[data-page]`.
3. For each page, call `offsetsFromRange()` to get `{charStart, charEnd}`.
4. Show selection pill anchored to selection rect.
5. If user clicks a color chip: `annotationStore.add({docId, page, kind:'highlight', pageStartCharOffset, pageEndCharOffset, color, text, textHash})`.

**At re-render time:**
1. After page renders + text layer mounts, query annotations for that page from `pdfStore`.
2. For each highlight/underline/strike: `rangeFromOffsets()` to get the DOM Range.
3. Wrap via `surroundContents` if possible; if it crosses spans, split the spans and apply `<mark class="pdf-hl pdf-hl-<color>">` to each segment.
4. If offsets fail (page index changed because pdf.js re-extracted text differently): fall back to the old text-substring locator using `text + textHash`, marked with `data-fallback="1"`.

### 4.3 Cross-page selections

Range can span two pages in continuous/spread modes. Convert into TWO highlight annotations, one per page, both stamped with the same `groupId` so the sidebar list shows them as one entry and "delete" removes both.

### 4.4 OCR'd pages

When a page has been OCR'd via `ocrService`, the page-text-index detects empty pdf.js text and instead builds the index from OCR word boxes. Offsets work the same way.

### 4.5 Edge cases

- Selection that starts in margin / between paragraphs: pageView still prevents `mousedown` on the text-layer container.
- Selection that includes pdf.js's invisible whitespace spans: trimmed at offset time (we use the flat-text index, not the DOM, as source of truth).
- Re-extracted text on doc replace: if `pdfStore.replaceContent` is called, all annotations for that doc are invalidated. One-time toast: "Annotations may be misaligned after replacing this PDF."

---

## 5. Annotation model

Unified shape in `pdfStore.annotations`:

```js
{
  id: <autoIncrement>,
  docId: string,
  kind: 'highlight' | 'underline' | 'strike' | 'note' | 'ink' | 'shape' | 'signature' | 'redact',
  page: number,
  createdAt: number,
  modifiedAt: number,
  color: string,
  groupId?: string,

  // For text-anchored kinds (highlight, underline, strike):
  pageStartCharOffset?: number,
  pageEndCharOffset?: number,
  text?: string,
  textHash?: string,

  // For point/region kinds (note, ink, shape, signature, redact):
  // Fractional coords [0, 1] of page intrinsic viewport. Rotation-invariant.
  x?: number, y?: number, w?: number, h?: number,

  // Kind-specific payload:
  body?: string,
  points?: Array<[x, y, p?]>,
  width?: number,
  shape?: 'rect'|'ellipse'|'arrow'|'line',
  fill?: string, dash?: 'solid'|'dashed'|'dotted',
  imageDataUrl?: string,
  baked?: boolean,
}
```

**Storage tier per kind:**

| Kind | Storage | Why |
|---|---|---|
| highlight/underline/strike/note/ink/shape/signature instances/redact | `pdfStore.annotations` (IDB) | Volumes can be high; IDB is the right tier. |
| **saved signatures** (user's reusable 3) | `kernel.storage.yancotab_pdf_signatures` | User-level, cross-doc, syncable. Max 3 × 50KB. |
| **bookmarks** | `kernel.storage.yancotab_pdf_bookmarks_v1` (existing) | Small, syncable. Unchanged. |

---

## 6. Per-feature design

### 6.1 Freehand ink

Capture pointer positions on a transparent SVG overlay. Catmull-Rom smoothing (tension 0.5, ~30 lines no deps). Store raw points + pressure. Render as multi-segment `<path>` with variable stroke-width when pressure was captured. Eraser tool deletes by hit-test via `pointer-events: stroke`.

### 6.2 Shapes

Rect / ellipse / arrow / line via pointerdown→pointermove→pointerup live preview. Stroke color (6 palette), width (1/2/4 pt), dash (solid/dashed/dotted), fill (none / 20% alpha). Shift snaps to 15°/aspect.

### 6.3 Signatures

Max 3 saved signatures stored in `kernel.storage.yancotab_pdf_signatures` as PNG data URLs (max 80KB each after canvas-trim). Draw modal: 480×180 canvas, same Catmull-Rom smoothing as ink. Drop-on-page: cursor becomes "ghost signature", click to drop. Drag to move, corner handle to resize. Validator rejects any data URL whose prefix isn't exactly `data:image/png;base64,`.

### 6.4 Page operations

- **Single-page rotate** stored per-page in `pdfStore.viewState.pageRotations: {pageN: deg}`. Non-destructive.
- **Drag-to-reorder** thumbnails. Stored as `pdfStore.viewState.pageOrder: number[]`. Non-destructive.
- **Delete page** marks `pdfStore.viewState.pageOmits: Set<number>`. Annotations on omitted pages remain in IDB but aren't rendered.
- **Bake-on-export** runs pdfWriter (§6.6) to produce a new PDF binary respecting all the above + redact annotations.

### 6.5 Merge / split

Modal lists current doc + library docs. Merge: drag to reorder, output = new doc in pdfStore. Split: page-range input (`1-10, 15, 20-25`) → new docs per range. Both depend on §6.6 pdfWriter.

### 6.6 PDF mutation — pdfWriter (the unknown)

**Constraint:** no npm runtime deps. pdf-lib is npm.

**Options evaluated:**

| Option | Cost | Verdict |
|---|---|---|
| Vendor pdf-lib UMD bundle (~700KB) into `vendor/pdf-lib/` | Adds 700KB to extension zip (currently ~9MB; CWS limit 10MB) | **Plausible.** pdf-lib is MIT, no runtime deps, ships UMD. Loaded only when user triggers merge/split/delete/bake. |
| Build a minimal PDF mutator from scratch | High effort | High risk. Would consume the entire v3 cycle. |
| Use pdf.js's `pdfDocument.saveDocument()` | Saves AcroForm fills + some annotations, NOT page deletion/reorder | **Partial.** Useful for AcroForms only. |
| Render-and-rasterize | Loses text searchability; bloats 5–20× | Not acceptable. |

**Recommendation: vendor pdf-lib v1.17.1.** ~700KB. MIT. No eval. Dynamic-import-only when needed.

**Risk if rejected:** ship v3 with merge/split/delete-page/bake-redact disabled (greyed out with "Coming soon"). Sign/ink/shape/highlight/note/forms still work — they're overlays. **Decision needed before implementation begins.**

### 6.7 AcroForm fill

Enable pdf.js's `AnnotationEditorLayer` editable mode. Form values stored per-doc in `pdfStore.viewState.formValues`. Save-back via pdf.js `saveDocument()` — works for fills, no pdf-lib needed.

### 6.8 Image extract

Rect-select tool → canvas-crop the rendered page at that rect → PNG download. Adequate for "save a chart for slides." Embedded-image extraction is out of v3 scope.

### 6.9 Side-by-side compare

Split-view modal picks a second doc. Page-by-page Myers line-diff in a Web Worker (`worker-src 'self'` is in manifest). Diff lines tinted green/red/amber. Prompt for confirmation on docs >100 pages.

### 6.10 Redact

Live overlay: rect-select → opaque white box (live UI-only). Bake-on-export embeds white rectangles into the page content streams AND removes any annotations under the rect. Until baked, redacted text is still in the underlying PDF binary — UI shows a yellow "Not yet baked" badge.

---

## 7. Storage migration

### 7.1 Existing data

- **Highlights** today: `kernel.storage.yancotab_pdf_highlights = { [docId]: [{page, text, color}] }`.
- **Bookmarks**: `yancotab_pdf_bookmarks_v1` — unchanged.
- **Notes**: `pdfStore.annotations` kind:'note' — unchanged.
- **Quotes**: `pdfStore.quotes` — unchanged.

### 7.2 The migration

`migrate/highlightsV1ToV2.js` runs lazily per-doc on first v3 open of that doc. Tracked via `pdfStore.viewState[docId]._migrated_v2 = ts`. Algorithm: load doc, open pdf.js, for each highlight try to locate text in flat index → store offset-shape; if not found, store as legacy-shape with `offsets=null` for fallback rendering. Idempotent.

### 7.3 `pdfStore` schema bump

`DB_VERSION` 2 → 3. New indexes: `byDocPageKind`, `byGroup`. Existing v2 records remain readable.

### 7.4 New AppStorage REGISTRY entries

- `yancotab_pdf_highlight_color` (preferences, sync, default 'yellow')
- `yancotab_pdf_ink_color` / `yancotab_pdf_ink_width`
- `yancotab_pdf_signatures` (userdata, sync, max 3 × 80KB)
- `yancotab_pdf_highlights_migrated_v2` (cache, never sync)
- `yancotab_pdf_reader_v3` (preferences, sync, default `false` — feature flag)

---

## 8. Test plan

### 8.1 Preserve existing

All 14 PDF test files (1963 LOC) stay green. The v2 modules they cover are unchanged. `tests/pdf-highlights.test.js` (143 LOC) kept as regression for the legacy fallback path.

### 8.2 New tests (~1880 LOC across 9 files)

```
tests/pdf-v3-offset-ranges.test.js       (~250 LOC)
tests/pdf-v3-page-text-index.test.js     (~200 LOC)
tests/pdf-v3-ink-smoothing.test.js       (~180 LOC)
tests/pdf-v3-annotation-store.test.js    (~250 LOC)
tests/pdf-v3-page-ops.test.js            (~200 LOC)
tests/pdf-v3-signature-validator.test.js (~100 LOC)
tests/pdf-v3-compare-engine.test.js      (~250 LOC)
tests/pdf-v3-migration.test.js           (~300 LOC)
tests/pdf-v3-redact-bake.test.js         (~150 LOC, MOCKED pdf-lib)
```

### 8.3 Manual smoke checklist (before default-on)

10-item list covering hyphenated/ligature highlights, ink across pages, signature, page reorder + rotate + export, compare, redact bake, theme toggle, keyboard focus, multi-tab IDB.

---

## 9. Rollout

| Version | Action |
|---|---|
| v1.2.0 (next) | v3 ships behind flag, default off. Migration runs lazily per-doc. |
| v1.3.0 | v3 default on for new installs. |
| v1.4.0 | v3 default on for everyone. v2 modules deleted. |
| v1.5.0 | Migration code removed; legacy fallback render path removed. |

`PdfReaderApp.init()` reads the flag and imports either `pdf/v3/reader.js` or `pdf/codex.js`. Both consume same `pdfStore` + `kernel.storage` + library.

---

## 10. Risks

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| 10.1 | pdf-lib vendor (700KB) | HIGH | Decision needed: vendor it OR ship v3 without binary mutation. |
| 10.2 | Signature XSS via data URL | LOW | Strict `data:image/png;base64,` prefix validator. We construct, never accept user-supplied. |
| 10.3 | Continuous mode perf with 1000+ ink strokes | MED | Rasterize ink to canvas when >30 strokes per page; switch back to SVG in edit mode. |
| 10.4 | Migration of huge libraries | LOW | Lazy per-doc on first open, not eager batch. |
| 10.5 | IDB version-bump conflict with open v2 tabs | LOW | Existing `versionchange` handler closes v2 tabs; v2 reader is fully compatible with v3 schema. |
| 10.6 | MV3 dynamic import path | LOW | Proven by ocr-service + pdfjs already. |
| 10.7 | v3 annotations orphaned if user disables flag | LOW | v2 silently ignores unknown kinds; data preserved. One-time toast on flag-off. |

---

## 11. Non-obvious tradeoffs

1. **Light reader chrome breaks Yanco aesthetic locally.** Adobe is white-paged; we honor Yaman's "real PDF app" ask by sourcing light values from existing `body.theme-light` tokens + a few new namespaced `--pdf-*` tokens. No raw hex.
2. **Annotations in IDB, signatures in kernel.storage.** Splits storage tiers by volume rather than purity.
3. **pdf-lib vendor** consumes most of the remaining CWS-zip headroom (~700KB of ~1MB free).
4. **v3 alongside v2** doubles PDF code for one release cycle; cleanup committed in §9.
5. **Offset ranges tied to pdf.js text extraction.** v5 upgrades may shift offsets; `textHash` lets re-migration recover.
6. **Compare diff is line-level, not character-level.** Same as `git diff`. Acceptable trade.
7. **Side-by-side compare** is its own shell with two readers — bigger than it sounds.
8. **SVG icons via `innerHTML`** — strings are author-trusted; commented `// trusted-svg: authored` on each call.

---

**Pause for approval.** When approved, Phase A starts with offset-range engine + page text index + tests — has the most bug-fixing value and zero dependency on the pdf-lib decision. The pdf-lib question (§10.1) needs a separate yes/no before Phase D (mutation features).
