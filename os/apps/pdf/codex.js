/**
 * pdf/codex.js — Codex orchestrator.
 *
 * Composes side rail + reader bar + spread + info panel + selection
 * menu. Owns the loaded pdf.js doc, current page, outline, bookmarks,
 * and the in-session "Today's quotes" list.
 *
 * Lazy-loads pdf.js on first `load()` call so the rest of the app
 * isn't penalized by the worker startup cost.
 */

import { el } from '../../utils/dom.js';
import { buildSideRail } from './view/sideRail.js';
import { buildReaderBar } from './view/readerBar.js';
import { buildSpread } from './view/spread.js';
import { buildSelectionMenu } from './view/selectionMenu.js';
import { buildInfoPanel } from './view/infoPanel.js';
import { setPdfJsModule } from './view/pageView.js';
import { applyHighlights } from './view/applyHighlights.js';

import { flattenOutline, annotateWithPages, destToKey } from './engine/outline.js';
import { evaluate, looksNumeric, format as formatCalc } from './engine/inlineCalc.js';
import { formatQuote, formatQuoteMarkdown } from './engine/quote.js';

const PDFJS_URL = 'vendor/pdfjs/pdf.min.mjs';
const PDFJS_WORKER_URL = 'vendor/pdfjs/pdf.worker.min.mjs';

let pdfjsModulePromise = null;

async function loadPdfJs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      const mod = await import(`/${PDFJS_URL}`);
      mod.GlobalWorkerOptions.workerSrc = `/${PDFJS_WORKER_URL}`;
      setPdfJsModule(mod);
      return mod;
    })();
  }
  return pdfjsModulePromise;
}

export function buildCodex({
  getStreakStrip,
  getStreakDays,
  getBookmarks,
  getHighlightsOnPage,
  onAddBookmark,
  onRemoveBookmark,
  onAddHighlight,
  onSendToNotes,
  onRecordOpen,
  onToast,
} = {}) {
  const root = el('div', { class: 'codex' });

  let pdfDoc = null;
  let docId = null;
  let docTitle = '';
  let outline = [];          // flat: { title, depth, page }
  let currentPage = 1;
  let totalPages = 0;
  let lastSelection = { text: '', rect: null, page: null };
  let calcResult = null;     // { ok, value, expr, formattedValue }
  let todaysQuotes = [];

  const side = buildSideRail({
    onJumpToPage: (n) => goToPage(n),
    onRemoveBookmark: (b) => onRemoveBookmark?.(b),
  });

  const bar = buildReaderBar({
    onPrev: () => goToPage(currentPage - pageStep()),
    onNext: () => goToPage(currentPage + pageStep()),
    onJumpToPage: (n) => goToPage(n),
    onToggleSearch: () => onToast?.({ message: 'Search inside coming soon', type: 'info' }),
  });

  const stage = el('div', { class: 'cx-stage' });
  const empty = el('div', { class: 'cx-stage-empty' }, [
    el('div', { class: 'cx-stage-empty-title' }, 'No PDF open'),
    el('div', { class: 'cx-stage-empty-hint' }, 'Drop a PDF here or use the Open button.'),
  ]);
  const spread = buildSpread();
  spread.root.style.display = 'none';
  stage.append(bar.root, empty, spread.root);

  const info = buildInfoPanel({
    onClearTodays: () => { todaysQuotes = []; renderInfo(); },
    onJumpToQuote: (q) => q.page && goToPage(q.page),
  });

  const selMenu = buildSelectionMenu({
    onCopy: () => copySelection(false),
    onSendToNotes: () => sendToNotes(),
    onCalc: () => evalSelectionAsCalc(),
    onCite: () => copyCitation(),
    onBookmark: () => bookmarkSelection(),
    onHighlight: () => highlightSelection(),
  });

  root.append(side.root, stage, info.root, selMenu.root);

  function pageStep() { return spread.isSpread(stage.clientWidth) ? 2 : 1; }

  function clampPage(n) {
    if (!Number.isFinite(n)) return 1;
    const m = Math.floor(n);
    if (m < 1) return 1;
    if (m > totalPages) return totalPages;
    return m;
  }

  async function goToPage(n) {
    const next = clampPage(n);
    if (!pdfDoc) return;
    currentPage = next;
    selMenu.hide();
    await renderStage();
    renderRail();
    renderBar();
  }

  async function renderStage() {
    if (!pdfDoc) {
      empty.style.display = 'flex';
      spread.root.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    spread.root.style.display = '';
    const stageWidth = stage.clientWidth || 800;
    const left = currentPage;
    const right = spread.isSpread(stageWidth) ? currentPage + 1 : null;
    await spread.render({
      pdfDoc, leftPage: left, rightPage: right,
      stageWidth, gapPx: 14, paddingPx: 24,
      docId,
    });
    // Re-apply persisted highlights to the freshly built text layers.
    applyHighlightsToVisiblePages();
  }

  function renderRail() {
    side.update({
      outline,
      bookmarks: getBookmarks?.(docId) || [],
      currentPage,
      streak: getStreakStrip?.() || [],
      streakDays: getStreakDays?.() || 0,
    });
  }

  function renderBar() {
    const sectionLabel = activeOutlineLabel();
    bar.update({
      docTitle, sectionLabel,
      page: currentPage, totalPages,
      streakStrip: getStreakStrip?.() || [],
    });
  }

  function activeOutlineLabel() {
    if (!outline.length) return '';
    let best = '';
    for (const e of outline) {
      if (Number.isFinite(e.page) && e.page <= currentPage) best = e.title;
    }
    return best;
  }

  function renderInfo() {
    info.update({
      selectionText: lastSelection.text,
      calc: calcResult,
      todaysQuotes,
    });
  }

  function renderAll() {
    renderRail();
    renderBar();
    renderInfo();
  }

  // ── Selection handling ──

  function getSelectionRectInsideStage() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!range || range.collapsed) return null;
    // Only honor selections that originate inside our text layers.
    const ancestor = range.commonAncestorContainer;
    const node = ancestor.nodeType === 1 ? ancestor : ancestor.parentElement;
    if (!node || !stage.contains(node)) return null;
    const rect = range.getBoundingClientRect();
    if (!rect || rect.width === 0 && rect.height === 0) return null;
    return { rect, text: sel.toString(), node };
  }

  function pageElementOf(node) {
    let p = node;
    while (p && p !== stage) {
      if (p.classList?.contains('cx-page')) return p;
      p = p.parentElement;
    }
    return null;
  }

  function pageNumberFromElement(pageEl) {
    if (!pageEl) return null;
    // The two-page spread renders left, then right at currentPage and currentPage+1.
    const idx = [...stage.querySelectorAll('.cx-page')].indexOf(pageEl);
    if (idx < 0) return null;
    return idx === 0 ? currentPage : currentPage + 1;
  }

  function refreshSelection() {
    const s = getSelectionRectInsideStage();
    if (!s) {
      lastSelection = { text: '', rect: null, page: null };
      calcResult = null;
      selMenu.hide();
      renderInfo();
      return;
    }
    lastSelection = {
      text: s.text,
      rect: s.rect,
      page: pageNumberFromElement(pageElementOf(s.node)),
    };
    // Calc availability hint:
    const numeric = looksNumeric(s.text);
    selMenu.setCalcAvailable(numeric);
    selMenu.show(s.rect);
    // Don't auto-evaluate; only evaluate when user hits Calc.
    calcResult = null;
    renderInfo();
  }

  // Re-position the menu on selection changes inside our stage.
  document.addEventListener('selectionchange', () => {
    // Throttle via rAF so dragging doesn't stomp.
    requestAnimationFrame(() => refreshSelection());
  });

  // ── Selection actions ──

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); }
    catch { /* old browsers — ignore; toast still fires */ }
  }

  function copySelection() {
    if (!lastSelection.text) return;
    const formatted = formatQuote({
      text: lastSelection.text, docTitle, page: lastSelection.page,
    });
    copyToClipboard(formatted);
    onToast?.({ message: 'Quote copied', type: 'success' });
  }

  function copyCitation() {
    if (!lastSelection.text) return;
    const cite = `— ${docTitle.replace(/\.pdf$/i, '')}, p.${lastSelection.page || '?'}`;
    copyToClipboard(cite);
    onToast?.({ message: 'Citation copied', type: 'success' });
  }

  function sendToNotes() {
    if (!lastSelection.text) return;
    const md = formatQuoteMarkdown({
      text: lastSelection.text, docTitle, page: lastSelection.page,
    });
    copyToClipboard(md);
    todaysQuotes.unshift({
      text: lastSelection.text.slice(0, 240),
      docTitle, page: lastSelection.page, ts: Date.now(),
    });
    todaysQuotes = todaysQuotes.slice(0, 32);
    onSendToNotes?.(md);
    renderInfo();
    onToast?.({ message: 'Quote copied — paste into Notes', type: 'success' });
  }

  function evalSelectionAsCalc() {
    if (!lastSelection.text) return;
    const r = evaluate(lastSelection.text);
    if (!r.ok) {
      onToast?.({ message: r.reason || 'Not a valid expression', type: 'error' });
      calcResult = null;
    } else {
      calcResult = { ...r, formattedValue: formatCalc(r.value) };
    }
    renderInfo();
  }

  function bookmarkSelection() {
    if (!docId || !Number.isFinite(lastSelection.page)) return;
    const label = lastSelection.text
      ? lastSelection.text.slice(0, 80)
      : `Page ${lastSelection.page}`;
    onAddBookmark?.({
      docId,
      page: lastSelection.page,
      label,
      color: 'accent',
    });
    onToast?.({ message: 'Bookmark added', type: 'success' });
    renderRail();
  }

  function highlightSelection() {
    if (!docId || !Number.isFinite(lastSelection.page) || !lastSelection.text) return;
    onAddHighlight?.({
      docId,
      page: lastSelection.page,
      text: lastSelection.text,
      color: 'accent',
    });
    onToast?.({ message: 'Highlight saved', type: 'success' });
    // Re-apply to the live text layer of the selection's page so the
    // visual highlight appears immediately.
    applyHighlightsToVisiblePages();
  }

  /** For each visible page in the spread, re-apply stored highlights. */
  function applyHighlightsToVisiblePages() {
    if (!docId) return;
    const pages = stage.querySelectorAll('.cx-page');
    pages.forEach((pageEl, idx) => {
      const pageNum = idx === 0 ? currentPage : currentPage + 1;
      const textLayer = pageEl.querySelector('.cx-text-layer');
      if (!textLayer || !pageNum) return;
      const highlights = getHighlightsOnPage?.(docId, pageNum) || [];
      applyHighlights(textLayer, highlights);
    });
  }

  // ── Loading ──

  async function load({ source, name, id }) {
    const pdfjs = await loadPdfJs();
    docId = id || name || 'recent:' + (name || 'doc.pdf');
    docTitle = name || 'document.pdf';

    // source: { url } | { data: ArrayBuffer | Uint8Array }
    pdfDoc = await pdfjs.getDocument(source).promise;
    totalPages = pdfDoc.numPages;
    currentPage = 1;

    // Outline + page resolution
    let rawOutline = [];
    try { rawOutline = await pdfDoc.getOutline(); } catch { /* ignore */ }
    const flat = flattenOutline(rawOutline || []);
    const pageByDestKey = new Map();
    for (const entry of flat) {
      const key = destToKey(entry.dest);
      if (!key) continue;
      try {
        // Resolve named or ref destinations to page indices.
        let dest = entry.dest;
        if (typeof dest === 'string') {
          dest = await pdfDoc.getDestination(dest);
          if (!dest) continue;
        }
        const ref = Array.isArray(dest) ? dest[0] : null;
        if (!ref) continue;
        const idx = await pdfDoc.getPageIndex(ref);
        if (Number.isFinite(idx)) pageByDestKey.set(key, idx + 1);
      } catch { /* ignore individual misses */ }
    }
    outline = annotateWithPages(flat, pageByDestKey);

    onRecordOpen?.();
    await renderStage();
    renderAll();
    onToast?.({ message: `Opened "${docTitle}"`, type: 'success' });
  }

  function close() {
    pdfDoc = null;
    docId = null;
    docTitle = '';
    outline = [];
    currentPage = 1;
    totalPages = 0;
    todaysQuotes = [];
    spread.destroy();
    renderAll();
    empty.style.display = 'flex';
    spread.root.style.display = 'none';
  }

  // ── Resize awareness ──
  let resizeRaf = 0;
  const ro = new ResizeObserver(() => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => renderStage());
  });
  ro.observe(stage);

  function destroy() {
    ro.disconnect();
    spread.destroy();
  }

  return {
    root,
    load,
    close,
    destroy,
    /** Forward keyboard shortcuts from the app shell. */
    keyMove(delta) { goToPage(currentPage + delta * pageStep()); },
    keyJump(where) {
      if (where === 'first') goToPage(1);
      else if (where === 'last') goToPage(totalPages);
    },
    /** Re-render rail/bar after the parent updates streak/bookmarks. */
    refreshRail() { renderAll(); },
    getCurrentPage() { return currentPage; },
    getDocId() { return docId; },
  };
}
