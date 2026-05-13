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

import { el } from '../../../utils/dom.js';
import { buildToolbar } from './chrome/toolbar.js';
import { buildSelectionPill } from './chrome/selectionPill.js';
import { buildSidebar } from './chrome/sidebar.js';
import { buildThumbnailsTab } from './chrome/tabThumbnails.js';
import { buildOutlineTab } from './chrome/tabOutline.js';
import { buildBookmarksTab } from './chrome/tabBookmarks.js';
import { buildPageStrip } from './render/pageStrip.js';
import { setPdfJsModule } from './render/pageView.js';
import { createSelectionWatcher } from './select/selectionWatcher.js';
import { createAnnotationStore } from './ops/annotationStore.js';
import { commitSelectionAsHighlight } from './ops/highlightCommit.js';
import { createReadingMemory, resolveViewState, isResumable } from '../engine/reading.js';
import { buildMarkPopover } from './chrome/markPopover.js';
import { buildSearchBar } from './chrome/searchBar.js';
import { createSearchController } from './ops/searchController.js';
import { setupTools } from './readerTools.js';
import { migrateDocHighlights } from './migrate/highlightsV1ToV2.js';
import {
  loadPageOps,
  rotatePage as rotatePageOp,
  deletePage as deletePageOp,
  restorePage as restorePageOp,
  emptyPageOps,
} from './ops/pageOps.js';
import { createPageOpsController } from './readerPageOps.js';
import { createUndoStack } from './ops/undoStack.js';

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

export function buildReader({ pdfStore, kernel, onToast, onClose } = {}) {
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
  let pageOps = emptyPageOps();   // { pageRotations, pageOmits, pageOrder }

  const annStore = createAnnotationStore(pdfStore);
  const memory = createReadingMemory({
    loadViewState: (id) => pdfStore.getViewState(id),
    saveViewState: (id, patch) => pdfStore.saveViewState(id, patch),
  });

  // Forward-declared so the undo stack can call into it via closure
  // before `toolbar` is assigned a few lines below.
  let toolbarRef = null;
  const undoStack = createUndoStack({
    onChange: ({ canUndo, canRedo }) => {
      toolbarRef?.setUndoState?.({ canUndo, canRedo });
    },
  });

  // ── Toolbar ──
  const toolbar = buildToolbar({
    onPrev: () => goToPage(currentPage - 1),
    onNext: () => goToPage(currentPage + 1),
    onJumpToPage: (n) => goToPage(n),
    onZoomIn: () => setZoom(userZoom * 1.2),
    onZoomOut: () => setZoom(userZoom / 1.2),
    onZoomReset: () => setZoom(1.0),
    onClose: () => onClose?.(),
    onToggleSidebar: () => toggleSidebar(),
    onSelectTool: (toolId) => dispatcher.setActive(toolId),
    onUndo: () => undoStack.undo(),
    onRedo: () => undoStack.redo(),
  });
  toolbarRef = toolbar;

  // ── Sidebar ──
  const thumbsTab = buildThumbnailsTab({
    getPdfDoc: () => pdfDoc,
    onJumpToPage: (n) => goToPage(n),
    getPageOps: () => pageOps,
    onRotatePage: (p) => mutatePageOps((s) => rotatePageOp(s, p, 90)),
    onDeletePage: (p) => mutatePageOps((s) => deletePageOp(s, p)),
    onRestorePage: (p) => mutatePageOps((s) => restorePageOp(s, p)),
  });
  const outlineTab = buildOutlineTab({
    getPdfDoc: () => pdfDoc,
    onJumpToPage: (n) => goToPage(n),
  });
  const bookmarksTab = buildBookmarksTab({
    kernel,
    getDocId: () => docId,
    getCurrentPage: () => currentPage,
    onJumpToPage: (n) => goToPage(n),
    onToast,
  });
  const sidebar = buildSidebar({
    tabs: [
      { id: 'thumbs', label: 'Thumbnails', icon: 'thumbs', mount: thumbsTab.mount },
      { id: 'outline', label: 'Outline', icon: 'outline', mount: outlineTab.mount },
      { id: 'bookmarks', label: 'Bookmarks', icon: 'bookmark', mount: bookmarksTab.mount },
    ],
    initial: 'thumbs',
  });
  let sidebarCollapsed = false;
  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    sidebar.setCollapsed(sidebarCollapsed);
    root.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  }

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

  // ── Search ──
  // Build the search controller first so we can pass its match-lookup
  // into the page strip below.
  const search = createSearchController({
    getPdfDoc: () => pdfDoc,
    onResults: ({ matches, total, done }) => {
      searchBar.setCounter({ idx: search.getCursorIdx(), total: matches.length, done });
      strip.refreshAllSearchMatches();
    },
    onCursor: ({ idx, match }) => {
      searchBar.setCounter({ idx, total: search.getMatchCount(), done: true });
      strip.refreshAllSearchMatches();
      if (match && Number.isFinite(match.page)) {
        currentPage = match.page;
        toolbar.update({ page: currentPage, totalPages, zoom: userZoom });
        sidebar.updateTab('thumbs', { totalPages, currentPage });
        strip.scrollToPage(match.page, stage);
      }
    },
  });

  const searchBar = buildSearchBar({
    onChange: (q) => search.search(q),
    onPrev: () => search.step(-1),
    onNext: () => search.step(1),
    onClose: () => {
      searchBar.hide();
      searchBar.clear();
      search.clear();
    },
  });

  const strip = buildPageStrip({
    getHighlightsForPage: (page) => annStore.listTextAnchoredOnPage(docId, page),
    getNonTextAnnotationsForPage: (page) => annStore.listNonTextOnPage(docId, page),
    getSearchMatchesForPage: (page) => ({
      matches: search.matchesOnPage(page),
      currentMatch: search.getCurrent(),
    }),
    getPageOps: () => pageOps,
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
  stage.appendChild(searchBar.root);
  strip.root.style.display = 'none';

  // ── Mark popover (click on existing highlight) ──
  const markPopover = buildMarkPopover({
    onChangeColor: async (annId, color) => {
      try {
        await annStore.updateColor(annId, color);
        // Refresh the page that owned the mark. We don't track which page
        // hosts which annotation in this controller; refresh all visible.
        await strip.refreshAllHighlights();
      } catch { /* best-effort */ }
    },
    onDelete: async (annId) => {
      try {
        await annStore.deleteOne(annId);
        await strip.refreshAllHighlights();
        onToast?.({ message: 'Highlight deleted', type: 'success' });
      } catch {
        onToast?.({ message: 'Delete failed', type: 'error' });
      }
    },
  });

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

  // ── Tools (ink, shape, sign) ──
  const tools = setupTools({
    stage, strip, annStore, toolbar, kernel, onToast,
    getDocId: () => docId,
    undoStack,
  });
  const dispatcher = tools.dispatcher;

  // Layout: toolbar + (per-tool sub-toolbars) + sidebar/stage row.
  const main = el('div', { class: 'pdf-main' });
  main.append(sidebar.root, stage);
  root.append(toolbar.root, ...tools.subToolbarNodes, main, pill.root, markPopover.root);

  // ── Search toggle ──
  function toggleSearch() {
    if (searchBar.isOpen()) {
      searchBar.hide();
      searchBar.clear();
      search.clear();
    } else {
      searchBar.show();
    }
  }

  // ── Click-existing-highlight to edit/delete ──
  // Delegated capture-phase handler — fires before the textLayer's own
  // selection start, lets us preventDefault on mark clicks.
  stage.addEventListener('pointerdown', (e) => {
    const mark = e.target?.closest?.('mark.pdf-hl');
    if (!mark) return;
    const annIdStr = mark.dataset?.annId;
    const annId = annIdStr ? Number(annIdStr) : null;
    if (!Number.isFinite(annId)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = mark.getBoundingClientRect();
    markPopover.show(annId, rect);
  }, true);

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
    sidebar.updateTab('thumbs', { totalPages, currentPage });
    pill.hide();
    if (docId) memory.save(docId, { page: currentPage });
  }

  // ── Current-page tracking on scroll ──
  // The page whose top edge is closest to (but at or above) the
  // stage's vertical midline is the "current" page. Throttled via rAF.
  let scrollRaf = 0;
  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      if (!pdfDoc) return;
      const stageRect = stage.getBoundingClientRect();
      const midline = stageRect.top + stageRect.height * 0.35;
      const pageEls = strip.root.querySelectorAll('.pdf-strip-slot[data-page]');
      let best = currentPage;
      let bestDist = Infinity;
      for (const pe of pageEls) {
        const r = pe.getBoundingClientRect();
        // Skip pages entirely off-screen.
        if (r.bottom < stageRect.top || r.top > stageRect.bottom) continue;
        const dist = Math.abs(r.top - midline);
        if (dist < bestDist) {
          bestDist = dist;
          const n = Number(pe.dataset.page);
          if (Number.isFinite(n)) best = n;
        }
      }
      if (best !== currentPage) {
        currentPage = best;
        toolbar.update({ page: currentPage, totalPages, zoom: userZoom });
        sidebar.updateTab('thumbs', { totalPages, currentPage });
        if (docId) memory.save(docId, { page: currentPage, scrollY: stage.scrollTop });
      }
    });
  }
  stage.addEventListener('scroll', onScroll, { passive: true });

  async function setZoom(z) {
    const clamped = Math.max(0.25, Math.min(8, z));
    if (clamped === userZoom) return;
    userZoom = clamped;
    // Zoom currently triggers a full re-prepare; later phases can rescale in place.
    if (pdfDoc) {
      await strip.prepareSlots(pdfDoc, stage, { zoom: userZoom });
      strip.scrollToPage(currentPage, stage);
    }
    toolbar.update({ page: currentPage, totalPages, zoom: userZoom });
    if (docId) memory.save(docId, { zoom: userZoom });
  }

  // ── Highlighting ──

  function commitHighlight(color) {
    return commitSelectionAsHighlight({
      selection: lastSelection, docId, color,
      annotationStore: annStore, strip,
      onToast, onPillHide: () => pill.hide(),
      undoStack,
    });
  }

  // ── Page ops (rotate / delete / restore) ──
  const pageOpsCtrl = createPageOpsController({
    pdfStore,
    getDocId: () => docId,
    getPageOps: () => pageOps,
    setPageOps: (s) => { pageOps = s; },
    getTotalPages: () => totalPages,
    getCurrentPage: () => currentPage,
    setCurrentPage: (n) => { currentPage = n; },
    strip, sidebar, stage, toolbar,
    getZoom: () => userZoom,
  });
  const mutatePageOps = pageOpsCtrl.mutate;

  async function runMigration() {
    try {
      const r = await migrateDocHighlights({
        pdfDoc, docId, pdfStore, kernel, annotationStore: annStore,
      });
      if (r && !r.skipped && r.migrated > 0) {
        onToast?.({
          message: `Migrated ${r.migrated} highlight${r.migrated === 1 ? '' : 's'}`,
          type: 'success',
        });
      }
    } catch (e) {
      console.warn('[pdf-v3] highlight migration failed:', e);
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

    // Load per-page rotations / omits BEFORE prepareSlots so the strip
    // and thumbs render with the saved mutations on first paint.
    try { pageOps = await loadPageOps(pdfStore, docId); }
    catch { pageOps = emptyPageOps(); }

    empty.style.display = 'none';
    strip.root.style.display = '';
    toolbar.setTitle(docTitle);

    // One-shot v1→v2 highlight migration (lazy + idempotent).
    if (kernel) await runMigration();

    // Restore reading position if any.
    let resumePage = 1;
    let resumeZoom = userZoom;
    try {
      const saved = await memory.load(docId);
      const v = resolveViewState(saved);
      if (v) {
        if (typeof v.zoom === 'number') resumeZoom = v.zoom;
        if (isResumable(v)) resumePage = v.page;
      }
    } catch { /* best-effort */ }
    userZoom = resumeZoom;
    currentPage = Math.min(resumePage, totalPages);

    await strip.prepareSlots(pdfDoc, stage, { zoom: userZoom });
    toolbar.update({ page: currentPage, totalPages, zoom: userZoom, title: docTitle });
    sidebar.updateTab('thumbs', { totalPages, currentPage });
    sidebar.updateTab('outline', { totalPages });
    sidebar.updateTab('bookmarks', {});

    if (currentPage > 1) {
      requestAnimationFrame(() => strip.scrollToPage(currentPage, stage));
      onToast?.({ message: `Resumed on page ${currentPage}`, type: 'info' });
    } else {
      onToast?.({ message: `Opened "${docTitle}"`, type: 'success' });
    }
  }

  function close() {
    if (docId) memory.flush(docId);
    search.reset();
    searchBar.hide();
    searchBar.clear();
    strip.destroy();
    pdfDoc = null;
    docId = null;
    docTitle = '';
    totalPages = 0;
    currentPage = 1;
    lastSelection = null;
    selectionRectScreen = null;
    pageOps = emptyPageOps();
    pill.hide();
    toolbar.update({ page: 1, totalPages: 0, zoom: userZoom });
    sidebar.updateTab('thumbs', { totalPages: 0 });
    sidebar.updateTab('bookmarks', {});
    empty.style.display = 'flex';
    strip.root.style.display = 'none';
  }

  function destroy() {
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    stage.removeEventListener('scroll', onScroll);
    memory.flushAll();
    watcher.destroy();
    tools.destroy();
    markPopover.destroy();
    sidebar.destroy();
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
    toggleSearch,
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
