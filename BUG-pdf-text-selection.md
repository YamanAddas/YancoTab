# Bug: PDF Reader text selection doesn't work in Chrome extension

## Status
Open. Multiple fix attempts in this session did not resolve. Handing off.

## Reproduction
1. Open a YancoTab new tab in Chrome (extension or web app).
2. Open the PDF Reader app.
3. Open any PDF that contains text (e.g. `buoyancy.pdf` in the test library).
4. Try to drag-select text on the rendered page.

**Observed:** Text doesn't get highlighted. User cannot select any text by dragging.

## Acceptance criteria
- Dragging from a glyph to another glyph highlights only the dragged-over text (Acrobat-style).
- Dragging from empty space inside the page (between lines, in margins) does NOT start any selection.
- Cross-line drag selection works (e.g. drag from end of line 1 through line 2).
- Once selected, the existing selection menu (Highlight / Notes / Copy / Cite / Bookmark) appears as expected.

## Architecture context
- File rendering the text layer: `os/apps/pdf/view/pageView.js`
- pdf.js v4.10.38 vendored at `vendor/pdfjs/pdf.min.mjs`
- pdf.js's `TextLayer` API renders transparent `<span>`s positioned over the canvas with per-glyph `scaleX` transforms.
- CSS lives in `css/pdf-codex.css`, see `.cx-text-layer` block (around line 370).
- Shell-level CSS that affects this:
  - `os/ui/mobileShell.js:614-628` injects `html, body { user-select: none; ... }` inline.
  - `css/main.css:2941-2947` has `body.is-mobile * { user-select: none !important }`.
  - `css/pdf-codex.css` (around line 1280) opts out via `body.is-mobile [data-allow-context="true"] *  { user-select: text !important }`.
  - The PDF stage carries `data-allow-context="true"` (`os/apps/pdf/codex.js:104`).
- Shell-level JS that affects this:
  - `os/ui/mobileShell.js:663-671` — capture-phase `selectstart` handler; preventDefaults unless target is inside `[data-allow-context="true"]`. The PDF stage opts in.
  - `os/ui/mobileShell.js:652-661` — capture-phase `contextmenu` handler with the same opt-out.

## What was tried in this session

### Attempt 1 — pdf.js `TextLayer` API + manual scaleX
- Replaced manual span loop in `pageView.js` with `new pdfjsLib.TextLayer({...})`.
- Result: spans now have correct positioning. Did NOT fix selection.

### Attempt 2 — `pointer-events: none` on container, `auto` on spans
- CSS: `.cx-text-layer { pointer-events: none } .cx-text-layer span { pointer-events: auto }`.
- Result: empty space click correctly didn't start selection (passed through to canvas), BUT cross-span drag broke because the pointer entering gaps between spans hit the canvas too, breaking the selection.

### Attempt 3 — pdf.js viewer's `endOfContent` div trick
- Appended a `.cx-end-of-content` div to each text layer post-render.
- Toggled `.selecting` class on mousedown/mouseup to expand the div from `top: 100%` to `top: 0` covering gaps during a drag.
- Result: didn't work — possibly because of z-index/stacking interactions with the spans.

### Attempt 4 — Vanilla pdf.js TextLayer, no custom handlers
- Removed the `endOfContent` and `.selecting` toggle entirely.
- Trusted browser native selection with default `pointer-events: auto` and inherited `user-select: text` from the shell opt-in.
- Result: User reported "it selects A LOT of text when I drag from empty space" — confirming that empty space starts a selection that extends across all spans.

### Attempt 5 (current) — `user-select: none` on container, `text` on spans
- CSS:
  ```css
  .codex .cx-page .cx-text-layer { user-select: none !important; }
  .codex .cx-page .cx-text-layer span { user-select: text !important; }
  ```
- Specificity (0,3,0) and (0,3,1) beat the shell's `body.is-mobile [data-allow-context="true"] *` rule (0,2,1).
- Verified in preview: container computed `user-select: none`, spans computed `user-select: text`, both with `pointer-events: auto`.
- **User reports selection still doesn't work in Chrome.**

## Diagnostic data from preview

```
.cx-text-layer (container):
  user-select: none
  pointer-events: auto

.cx-text-layer span:
  user-select: text
  pointer-events: auto
  cursor: text
  position: absolute
  font-size: 14px (rendered via calc(var(--scale-factor)*16px))
  color: rgba(0, 0, 0, 0)
  bounds: 122x14 px (matches visible text)

Body:
  is-mobile: true
  user-select: none (from injected style)

Stage:
  data-allow-context: "true"

--scale-factor on container: not directly set, but spans render at correct font-size
  (suggests pdf.js sets it elsewhere or it inherits)
```

Programmatic Range API selection works (confirms the DOM is sound).

## Hypotheses for what's still wrong

1. **Stale extension code** — user reloaded but Chrome may have cached the old `pdf-codex.css` aggressively. Worth a hard cache clear on the extension.
2. **Some other CSS rule winning specificity** — unaccounted for. A full `getMatchedCSSRules`-style audit on a real span in the actual extension would pinpoint it.
3. **The shell's `selectstart` capture handler fires before the PDF stage's element gets a chance to be the target** — but its `closest('[data-allow-context="true"]')` check should pass for any descendant of the stage.
4. **`--scale-factor` not being set on the text layer container** — this could mean spans are sized via inheritance or are actually invisible/un-clickable hairlines. The bounds report 122x14 which suggests they're fine, but real Chrome rendering may differ.
5. **A capture-phase `mousedown` somewhere preventing default** — search didn't find one in `os/`, but worth checking `os/kernel.js` and `os/boot*.js`.

## Next steps for the next session

1. **First, get a console reading from the user's actual Chrome extension** — open DevTools on the new tab, run:
   ```js
   const span = document.querySelector('.cx-text-layer span');
   const r = span.getBoundingClientRect();
   console.log({
     spanRect: r,
     spanCS: {
       userSelect: getComputedStyle(span).userSelect,
       pointerEvents: getComputedStyle(span).pointerEvents,
     },
     containerCS: {
       userSelect: getComputedStyle(span.parentElement).userSelect,
     },
     elementAtCenter: document.elementFromPoint(r.x + r.width/2, r.y + r.height/2),
   });
   ```
   This tells us (a) whether spans render at all, (b) whether the computed CSS matches what we set, (c) whether clicking visible text actually hits the span.

2. **Add a temporary `selectstart` listener on the stage in capture phase** in `codex.js` that logs and DOES NOT prevent default — see if `selectstart` even fires for the user's drag. If it doesn't fire, the issue is upstream of CSS.

3. **Try a minimal test page** — strip down the entire PDF reader to just an `index.html` loading pdf.js + a single page render with the same CSS. If selection works there but not in YancoTab's shell, the shell is interfering. If it doesn't work there either, pdf.js TextLayer is the culprit.

4. **Consider abandoning the pdf.js TextLayer** and going back to manual span generation with proper position + dimensions — gives full control over the DOM/CSS.

## Files touched in this session
- `css/pdf-codex.css` — multiple iterations on the `.cx-text-layer` rules
- `os/apps/pdf/view/pageView.js` — switched to `pdfjsLib.TextLayer`
- `os/apps/pdf/codex.js` — added/removed mousedown handler for `.selecting` class, added hand tool toggle
- `os/apps/pdf/view/readerBar.js` — added text/hand tool toggle button
- `os/apps/PdfReaderApp.js` — added T/H keyboard shortcuts
- `sw.js` — bumped cache name multiple times

## Commits
- `ac30f06` Fix PDF text selection: use pdf.js TextLayer for accurate hit areas
- `4987476` Fix PDF text selection: Acrobat-model pointer routing  *(broke cross-span drag)*
- `3558970` Fix PDF text selection with proper pdf.js TextLayer pattern + hand tool  *(endOfContent attempt)*
- `ba45496` Simplify PDF text selection — drop endOfContent trick  *(broke empty-space)*
- `5c69cf1` Block selection from empty text-layer space  *(current — user reports still broken)*
