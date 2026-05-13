/**
 * pdf/v3/reader.js — v3 PDF reader orchestrator.
 *
 * Drop-in replacement for v2's `codex.js` orchestrator. Returns the
 * same shape (root, load, close, destroy, keyMove, keyJump, etc.) so
 * PdfReaderApp can route to either without code branching.
 *
 * Phase B scope: continuous-strip-only rendering, offset-range
 * highlights, minimal Adobe-style toolbar, 5-color selection pill.
 * Search, sidebar, bookmarks, info panel, view modes, fullscreen,
 * dark pages, hand tool — all land in Phase C.
 *
 * Target size: ≤ 450 lines.
 */

import { el } from '../../utils/dom.js';
import { buildToolbar } from './chrome/toolbar.js';
import { buildSelectionPill } from './chrome/selectionPill.js';
import { buildPageStrip } from './render/pageStrip.js';
import { setPdfJsModule } from './render/pageView.js';
import { createSelectionWatcher } from './select/selectionWatcher.js';
import { createAnnotationStore } from './ops/annotationStore.js';

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

export function buildReader({ pdfStore, onToast, onClose } = {}) {
  if (!pdfStore) throw new Error('pdfStore required');
  const root = el('div', { class: 'pdf-reader-v3', tabindex: '0' });

  // Pre-allocate the active highlight color from storage if available.
  let activeColor = 'yellow';

  // Construction-time state.
  let pdfDoc = null;
  let docId = null;
  let docTitle = '';
  let totalPages = 0;
  let currentPage = 1;
  let userZoom = 1.0;
  let lastSelection = null;   // { page, charStart, charEnd, text } | { segments: [...] }
  let selectionRectScreen = null;

  const annStore = createAnnotationStore(pdfStore);

  // ── Toolbar ──
  const toolbar = buildToolbar({
    onPrev: () => goToPage(currentPage - 1),
    onNext: () => goToPage(currentPage + 1),
    onJumpToPage: (n) => goToPage(n),
    onZoomIn: () => setZoom(userZoom * 1.2),
    onZoomOut: () => setZoom(userZoom / 1.2),
    onZoomReset: () => setZoom(1.0),
    onClose: () => onClose?.(),
  });

  // ── Stage + Page Strip ──
  const stage = el('div', {
    class: 'pdf-stage',
    tabindex: '0',
    'data-allow-context': 'true',
  });
  const empty = el('div', { class: 'pdf-stage-empty' }, [
    el('div', { class: 'pdf-stage-empty-title' }, 'No PDF open'),
    el('div', { class: 'pdf-stage-empty-hint' }, 'Open a document from the Library.'),
  ]);
  stage.appendChild(empty);

  const strip = buildPageStrip({
    getHighlightsForPage: (page) => annStore.listTextAnchoredOnPage(docId, page),
    onPageMounted: (pageNum) => {
      // Update toolbar's page indicator using the most-visible page.
      // For simplicity, we report the latest-mounted page as "current."
      // A more accurate "current page" comes via scroll position
      // tracking — Phase C will add that.
      if (pageNum < currentPage) currentPage = pageNum;
      toolbar.update({ page: currentPage, totalPages, zoom: userZoom });
    },
  });
  stage.appendChild(strip.root);
  strip.root.style.display = 'none';

  // ── Selection pill ──
  const pill = buildSelectionPill({
    onColor: (color) => {
      activeColor = color;
      commitHighlight(color);
    },
    onCopy: () => {
      const text = lastSelection?.text || '';
      if (text) {
        try { navigator.clipboard.writeText(text); } catch { /* best-effort */ }
        onToast?.({ message: 'Selection copied', type: 'success' });
      }
    },
  });

  root.append(toolbar.root, stage, pill.root);

  // ── Selection watcher ──
  const watcher = createSelectionWatcher({
    stage,
    getPageIndexForElement: (pageEl) => strip.getPageIndexForElement(pageEl),
    getPageNumberForElement: (pageEl) => strip.getPageNumberForElement(pageEl),
    onChange: (update) => {
      lastSelection = update;
      selectionRectScreen = update.rect || null;
      if (selectionRectScreen) pill.show(selectionRectScreen);
    },
    onCleared: () => {
      lastSelection = null;
      selectionRectScreen = null;
      pill.hide();
    },
  });

  // ── Page navigation ──
  function clampPage(n) {
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(totalPages || 1, Math.floor(n)));
  }

  function goToPage(n) {
    const next = clampPage(n);
    if (!pdfDoc) return;
    currentPage = next;
    strip.scrollToPage(next, stage);
    toolbar.update({ page: currentPage, totalPages, zoom: userZoom });
    pill.hide();
  }

  async function setZoom(z) {
    const clamped = Math.max(0.25, Math.min(8, z));
    if (clamped === userZoom) return;
    userZoom = clamped;
    // Phase B: zoom triggers a full re-prepare. Phase C will hold
    // already-rendered pages and just rescale.
    if (pdfDoc) {
      await strip.prepareSlots(pdfDoc, stage, { zoom: userZoom });
      // Re-scroll to keep the user near where they were.
      strip.scrollToPage(currentPage, stage);
    }
    toolbar.update({ page: currentPage, totalPages, zoom: userZoom });
  }

  // ── Highlighting ──

  async function commitHighlight(color) {
    if (!docId || !lastSelection) return;
    try {
      if (!lastSelection.multiPage) {
        await annStore.addHighlight({
          docId, page: lastSelection.page,
          pageStartCharOffset: lastSelection.charStart,
          pageEndCharOffset: lastSelection.charEnd,
          color, text: lastSelection.text,
        });
        await strip.refreshHighlightsForPage(lastSelection.page);
      } else if (Array.isArray(lastSelection.segments)) {
        // Cross-page: emit one annotation per page, share groupId.
        const groupId = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        for (const seg of lastSelection.segments) {
          await annStore.addHighlight({
            docId, page: seg.page,
            pageStartCharOffset: seg.charStart,
            pageEndCharOffset: seg.charEnd,
            color, text: '', groupId,
          });
        }
        for (const seg of lastSelection.segments) {
          await strip.refreshHighlightsForPage(seg.page);
        }
      }
      pill.hide();
      // Clear native selection so the highlight is the only visible mark.
      try { window.getSelection()?.removeAllRanges(); } catch { /* best-effort */ }
      onToast?.({ message: 'Highlight saved', type: 'success' });
    } catch (e) {
      console.error('[pdf-v3] highlight save failed:', e);
      onToast?.({ message: 'Highlight save failed', type: 'error' });
    }
  }

  // ── Loading ──

  async function load({ source, name, id }) {
    const pdfjs = await loadPdfJs();
    docId = id || name || 'recent:doc.pdf';
    docTitle = name || 'document.pdf';

    pdfDoc = await pdfjs.getDocument({ ...source, isEvalSupported: false }).promise;
    totalPages = pdfDoc.numPages;
    currentPage = 1;

    empty.style.display = 'none';
    strip.root.style.display = '';
    toolbar.setTitle(docTitle);

    await strip.prepareSlots(pdfDoc, stage, { zoom: userZoom });
    toolbar.update({ page: 1, totalPages, zoom: userZoom, title: docTitle });

    onToast?.({ message: `Opened "${docTitle}"`, type: 'success' });
  }

  function close() {
    strip.destroy();
    pdfDoc = null;
    docId = null;
    docTitle = '';
    totalPages = 0;
    currentPage = 1;
    lastSelection = null;
    selectionRectScreen = null;
    pill.hide();
    toolbar.update({ page: 1, totalPages: 0, zoom: userZoom });
    empty.style.display = 'flex';
    strip.root.style.display = 'none';
  }

  function destroy() {
    watcher.destroy();
    strip.destroy();
  }

  return {
    root, load, close, destroy,
    keyMove(delta) { goToPage(currentPage + delta); },
    keyJump(where) {
      if (where === 'first') goToPage(1);
      else if (where === 'last') goToPage(totalPages);
    },
    refreshRail() { /* phase C */ },
    getCurrentPage() { return currentPage; },
    getDocId() { return docId; },
    setZoom, zoomStep: (d) => setZoom(userZoom * (d > 0 ? 1.2 : 1 / 1.2)),
    toggleSearch: () => { /* phase C */ },
    toggleFullscreen: () => { /* phase C */ },
    toggleDarkPages: () => { /* phase C */ },
    isDarkPages: () => false,
    getProperties: () => ({
      title: docTitle, pages: totalPages, docId,
      mode: 'continuous',
      zoom: `${Math.round(userZoom * 100)}%`,
      rotation: '0°',
    }),
    setHandMode: () => { /* phase C */ },
  };
}
