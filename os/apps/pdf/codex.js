/**
 * pdf/codex.js — Codex orchestrator.
 *
 * Owns the loaded pdf.js doc, current page, outline, bookmarks, the
 * in-session "Today's quotes" list, plus v2 view state: user zoom,
 * view mode (single/continuous/spread/book), and rotation.
 *
 * Lazy-loads pdf.js on first `load()` call so the rest of the app
 * isn't penalized by the worker startup cost.
 */

import { el } from '../../utils/dom.js';
import { buildSideRail } from './view/sideRail.js';
import { buildReaderBar } from './view/readerBar.js';
import { buildSpread } from './view/spread.js';
import { buildPageStrip } from './view/pageStrip.js';
import { buildSelectionMenu } from './view/selectionMenu.js';
import { buildInfoPanel } from './view/infoPanel.js';
import { setPdfJsModule } from './view/pageView.js';
import { applyHighlights } from './view/applyHighlights.js';

import { flattenOutline, annotateWithPages, destToKey } from './engine/outline.js';
import { evaluate, looksNumeric, format as formatCalc } from './engine/inlineCalc.js';
import { formatQuote, formatQuoteMarkdown } from './engine/quote.js';
import { stepZoom, clampZoom, formatLevel as fmtZoom } from './engine/zoom.js';
import { pickDefaultMode } from './engine/viewport.js';

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
  getStreakStrip, getStreakDays,
  getBookmarks, getHighlightsOnPage,
  onAddBookmark, onRemoveBookmark, onAddHighlight,
  onSendToNotes, onRecordOpen, onToast,
} = {}) {
  const root = el('div', { class: 'codex' });

  let pdfDoc = null;
  let docId = null;
  let docTitle = '';
  let outline = [];
  let currentPage = 1;
  let totalPages = 0;
  let lastSelection = { text: '', rect: null, page: null };
  let calcResult = null;
  let todaysQuotes = [];

  // ── v2 state ──
  let userZoom = 'fit-width';     // number | 'fit-width' | 'fit-page'
  let viewMode = 'continuous';    // 'single' | 'continuous' | 'spread' | 'book'
  let rotation = 0;               // 0 | 90 | 180 | 270

  const side = buildSideRail({
    onJumpToPage: (n) => goToPage(n),
    onRemoveBookmark: (b) => onRemoveBookmark?.(b),
  });

  const bar = buildReaderBar({
    onPrev: () => goToPage(currentPage - pageStep()),
    onNext: () => goToPage(currentPage + pageStep()),
    onJumpToPage: (n) => goToPage(n),
    onToggleSearch: () => onToast?.({ message: 'Search inside coming soon', type: 'info' }),
    onZoomStep: (dir) => zoomStep(dir),
    onZoomPick: (level) => setZoom(level),
    onModePick: (mode) => setMode(mode),
    onRotate: () => rotateRight(),
    getZoom: () => userZoom,
  });

  const stage = el('div', { class: 'cx-stage', tabindex: '0' });
  const empty = el('div', { class: 'cx-stage-empty' }, [
    el('div', { class: 'cx-stage-empty-title' }, 'No PDF open'),
    el('div', { class: 'cx-stage-empty-hint' }, 'Drop a PDF here or use the Open button.'),
  ]);
  const spread = buildSpread();
  const strip = buildPageStrip({
    onCurrentPageChange: (n) => { currentPage = n; renderRail(); renderBar(); },
  });
  spread.root.style.display = 'none';
  strip.root.style.display = 'none';
  stage.append(bar.root, empty, spread.root, strip.root);

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

  // ── Mode helpers ──

  function isSpreadMode() { return viewMode === 'spread' || viewMode === 'book'; }
  function pageStep() { return isSpreadMode() ? 2 : 1; }

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
    if (viewMode === 'continuous') {
      strip.scrollToPage(next, stage);
    } else {
      await renderStage();
    }
    renderRail();
    renderBar();
  }

  // ── Stage rendering ──

  async function renderStage() {
    if (!pdfDoc) {
      empty.style.display = 'flex';
      spread.root.style.display = 'none';
      strip.root.style.display = 'none';
      stage.classList.remove('is-continuous');
      return;
    }
    empty.style.display = 'none';

    if (viewMode === 'continuous') {
      spread.root.style.display = 'none';
      strip.root.style.display = '';
      stage.classList.add('is-continuous');
      // For continuous, zoom needs to be a number. Resolve fit-width
      // against the first-page intrinsic viewport.
      const zoomNumber = await resolveZoom();
      await strip.render({
        pdfDoc, scrollHost: stage, zoom: zoomNumber, docId,
      });
    } else {
      spread.root.style.display = '';
      strip.root.style.display = 'none';
      stage.classList.remove('is-continuous');
      const stageWidth = stage.clientWidth || 800;
      const stageHeight = stage.clientHeight || 600;
      const useSpread = isSpreadMode();
      // Book mode: page 1 alone, then page 2 left + page 3 right, etc.
      const left = currentPage;
      const right = useSpread
        ? (viewMode === 'book' && currentPage === 1 ? null : currentPage + 1)
        : null;
      await spread.render({
        pdfDoc, leftPage: left, rightPage: right,
        stageWidth, stageHeight,
        gapPx: 14, paddingPx: 24,
        docId, mode: viewMode, zoom: userZoom, rotation,
      });
      applyHighlightsToVisiblePages();
    }
  }

  /** Resolve zoom keyword to numeric using current page geometry. */
  async function resolveZoom() {
    if (typeof userZoom === 'number') return clampZoom(userZoom);
    if (!pdfDoc) return 1.0;
    try {
      const p = await pdfDoc.getPage(1);
      const vp = p.getViewport({ scale: 1, rotation });
      const stageW = stage.clientWidth || 800;
      const innerW = Math.max(0, stageW - 48);
      if (userZoom === 'fit-page') {
        const stageH = stage.clientHeight || 600;
        const innerH = Math.max(0, stageH - 48);
        return clampZoom(Math.min(innerW / vp.width, innerH / vp.height));
      }
      // fit-width
      return clampZoom(innerW / vp.width);
    } catch { return 1.0; }
  }

  // ── Zoom / Mode / Rotation actions ──

  async function setZoom(level) {
    if (typeof level === 'string' && level !== 'fit-width' && level !== 'fit-page') return;
    userZoom = typeof level === 'number' ? clampZoom(level) : level;
    await renderStage();
    renderBar();
  }

  async function zoomStep(dir) {
    const cur = await resolveZoom();
    const next = stepZoom(cur, dir);
    await setZoom(next);
  }

  async function setMode(mode) {
    if (!['single', 'continuous', 'spread', 'book'].includes(mode)) return;
    if (mode === viewMode) return;
    viewMode = mode;
    await renderStage();
    renderBar();
  }

  async function rotateRight() {
    rotation = (rotation + 90) % 360;
    await renderStage();
  }

  function getZoomLabel() {
    return fmtZoom(userZoom);
  }

  // ── Side rail / bar / info ──

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
    bar.update({
      docTitle, sectionLabel: activeOutlineLabel(),
      page: currentPage, totalPages,
      zoomLevel: userZoom, mode: viewMode,
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
    info.update({ selectionText: lastSelection.text, calc: calcResult, todaysQuotes });
  }

  function renderAll() { renderRail(); renderBar(); renderInfo(); }

  // ── Selection ──

  function getSelectionRectInsideStage() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!range || range.collapsed) return null;
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
    const dataPage = pageEl.closest?.('[data-page]')?.dataset?.page;
    if (dataPage) return Number(dataPage);
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
      text: s.text, rect: s.rect,
      page: pageNumberFromElement(pageElementOf(s.node)),
    };
    selMenu.setCalcAvailable(looksNumeric(s.text));
    selMenu.show(s.rect);
    calcResult = null;
    renderInfo();
  }

  document.addEventListener('selectionchange', () => {
    requestAnimationFrame(() => refreshSelection());
  });

  // ── Selection actions ──

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  }

  function copySelection() {
    if (!lastSelection.text) return;
    copyToClipboard(formatQuote({ text: lastSelection.text, docTitle, page: lastSelection.page }));
    onToast?.({ message: 'Quote copied', type: 'success' });
  }

  function copyCitation() {
    if (!lastSelection.text) return;
    copyToClipboard(`— ${docTitle.replace(/\.pdf$/i, '')}, p.${lastSelection.page || '?'}`);
    onToast?.({ message: 'Citation copied', type: 'success' });
  }

  function sendToNotes() {
    if (!lastSelection.text) return;
    const md = formatQuoteMarkdown({ text: lastSelection.text, docTitle, page: lastSelection.page });
    copyToClipboard(md);
    todaysQuotes.unshift({ text: lastSelection.text.slice(0, 240), docTitle, page: lastSelection.page, ts: Date.now() });
    todaysQuotes = todaysQuotes.slice(0, 32);
    onSendToNotes?.(md);
    renderInfo();
    onToast?.({ message: 'Quote copied — paste into Notes', type: 'success' });
  }

  function evalSelectionAsCalc() {
    if (!lastSelection.text) return;
    const r = evaluate(lastSelection.text);
    if (!r.ok) { onToast?.({ message: r.reason || 'Not a valid expression', type: 'error' }); calcResult = null; }
    else { calcResult = { ...r, formattedValue: formatCalc(r.value) }; }
    renderInfo();
  }

  function bookmarkSelection() {
    if (!docId || !Number.isFinite(lastSelection.page)) return;
    const label = lastSelection.text ? lastSelection.text.slice(0, 80) : `Page ${lastSelection.page}`;
    onAddBookmark?.({ docId, page: lastSelection.page, label, color: 'accent' });
    onToast?.({ message: 'Bookmark added', type: 'success' });
    renderRail();
  }

  function highlightSelection() {
    if (!docId || !Number.isFinite(lastSelection.page) || !lastSelection.text) return;
    onAddHighlight?.({ docId, page: lastSelection.page, text: lastSelection.text, color: 'accent' });
    onToast?.({ message: 'Highlight saved', type: 'success' });
    applyHighlightsToVisiblePages();
  }

  function applyHighlightsToVisiblePages() {
    if (!docId) return;
    const pages = stage.querySelectorAll('.cx-page');
    pages.forEach((pageEl) => {
      const pageNum = Number(pageEl.closest('[data-page]')?.dataset?.page) || pageNumberFromElement(pageEl);
      const textLayer = pageEl.querySelector('.cx-text-layer');
      if (!textLayer || !pageNum) return;
      const highlights = getHighlightsOnPage?.(docId, pageNum) || [];
      applyHighlights(textLayer, highlights);
    });
  }

  // ── Wheel zoom + double-click toggle ──

  stage.addEventListener('wheel', (e) => {
    if (!pdfDoc) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomStep(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  stage.addEventListener('dblclick', (e) => {
    if (!pdfDoc) return;
    if (e.target.closest('.cx-reader-bar')) return;
    if (typeof userZoom === 'number') setZoom('fit-width');
    else setZoom(1.0);
  });

  // ── Loading ──

  async function load({ source, name, id }) {
    const pdfjs = await loadPdfJs();
    docId = id || name || 'recent:' + (name || 'doc.pdf');
    docTitle = name || 'document.pdf';

    pdfDoc = await pdfjs.getDocument({ ...source, isEvalSupported: false }).promise;
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
        let dest = entry.dest;
        if (typeof dest === 'string') {
          dest = await pdfDoc.getDestination(dest);
          if (!dest) continue;
        }
        const ref = Array.isArray(dest) ? dest[0] : null;
        if (!ref) continue;
        const idx = await pdfDoc.getPageIndex(ref);
        if (Number.isFinite(idx)) pageByDestKey.set(key, idx + 1);
      } catch { /* ignore */ }
    }
    outline = annotateWithPages(flat, pageByDestKey);

    // Pick a default view mode based on stage geometry + page aspect.
    try {
      const firstPage = await pdfDoc.getPage(1);
      const baseViewport = firstPage.getViewport({ scale: 1 });
      viewMode = pickDefaultMode({
        stage: { width: stage.clientWidth || 800, height: stage.clientHeight || 600 },
        pageBaseViewport: baseViewport,
      });
    } catch { /* leave default */ }

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
    strip.destroy();
    renderAll();
    empty.style.display = 'flex';
    spread.root.style.display = 'none';
    strip.root.style.display = 'none';
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
    strip.destroy();
    bar.destroy?.();
  }

  return {
    root, load, close, destroy,
    keyMove(delta) { goToPage(currentPage + delta * pageStep()); },
    keyJump(where) {
      if (where === 'first') goToPage(1);
      else if (where === 'last') goToPage(totalPages);
    },
    refreshRail() { renderAll(); },
    getCurrentPage() { return currentPage; },
    getDocId() { return docId; },
    setZoom, zoomStep, setMode, rotateRight,
    getZoomLabel,
  };
}
