/**
 * pdf/codex.js — Codex orchestrator.
 *
 * Owns the loaded pdf.js doc, current page, outline, bookmarks,
 * v2 view state (zoom, view-mode, rotation), and reading-position
 * memory persisted via pdfStore.viewState.
 *
 * Selection handling lives in `codexSelection.js` to keep this file
 * under the 500-line cap.
 */

import { el } from '../../utils/dom.js';
import { buildSideRail } from './view/sideRail.js';
import { buildReaderBar } from './view/readerBar.js';
import { buildSpread } from './view/spread.js';
import { buildPageStrip } from './view/pageStrip.js';
import { buildSelectionMenu } from './view/selectionMenu.js';
import { buildInfoPanel } from './view/infoPanel.js';
import { setPdfJsModule } from './view/pageView.js';

import { stepZoom, clampZoom, formatLevel as fmtZoom } from './engine/zoom.js';
import { createReadingMemory } from './engine/reading.js';
import { createSelectionController } from './codexSelection.js';
import { createSearchController } from './codexSearch.js';
import { createAnnotationsController } from './codexAnnotations.js';
import {
  resolveOutline, resolveLinkDestination, openExternalUrl,
  restoreViewState, ensureDefaultMode,
} from './codexLoad.js';

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
  onAddBookmark, onRemoveBookmark, onAddHighlight, onRemoveHighlight,
  onSendToNotes, onRecordOpen, onToast,
  pdfStore,    // used for viewState (reading-position memory)
} = {}) {
  const root = el('div', { class: 'codex' });

  let pdfDoc = null;
  let docId = null;
  let docTitle = '';
  let outline = [];
  let currentPage = 1;
  let totalPages = 0;
  let calcResult = null;
  let todaysQuotes = [];

  let userZoom = 'fit-width';
  let viewMode = 'continuous';
  let rotation = 0;

  let isFullscreen = false;
  let resumePill = null;
  let darkPages = false;

  // Reading-position memory.
  const memory = pdfStore ? createReadingMemory({
    loadViewState: (id) => pdfStore.getViewState(id),
    saveViewState: (id, patch) => pdfStore.saveViewState(id, patch),
  }) : null;

  const side = buildSideRail({
    onJumpToPage: (n) => goToPage(n),
    onRemoveBookmark: (b) => onRemoveBookmark?.(b),
    onDeleteQuote: async (q) => {
      if (pdfStore && q?.id) {
        try { await pdfStore.deleteQuote(q.id); await ann?.refreshNotes?.(); } catch { /* ignore */ }
        renderRail();
      }
    },
  });

  const bar = buildReaderBar({
    onPrev: () => goToPage(currentPage - pageStep()),
    onNext: () => goToPage(currentPage + pageStep()),
    onJumpToPage: (n) => goToPage(n),
    onToggleSearch: () => search.toggle(),
    onZoomStep: (dir) => zoomStep(dir),
    onZoomPick: (level) => setZoom(level),
    onModePick: (mode) => setMode(mode),
    onRotate: () => rotateRight(),
    onToolToggle: (mode) => setHandMode(mode === 'hand'),
    getZoom: () => userZoom,
  });

  // data-allow-context opts out of the shell's contextmenu + selectstart suppression.
  const stage = el('div', { class: 'cx-stage', tabindex: '0', 'data-allow-context': 'true' });
  const empty = el('div', { class: 'cx-stage-empty' }, [
    el('div', { class: 'cx-stage-empty-title' }, 'No PDF open'),
    el('div', { class: 'cx-stage-empty-hint' }, 'Drop a PDF here or use the Open button.'),
  ]);
  const linkCallbacks = {
    onLinkInternal: async ({ dest }) => {
      const t = await resolveLinkDestination(pdfDoc, dest);
      if (t) goToPage(t);
    },
    onLinkExternal: openExternalUrl,
  };
  const spread = buildSpread(linkCallbacks);
  const strip = buildPageStrip({
    ...linkCallbacks,
    onCurrentPageChange: (n) => {
      currentPage = n; renderRail(); renderBar();
      memory?.save(docId, { page: currentPage, scrollY: stage.scrollTop });
    },
    onPageRendered: () => {
      // A lazy-loaded page just got its text-layer — re-apply the
      // search-match highlights and note pips on it.
      ann?.renderNotePips?.();
      search?.redecorate?.();
    },
  });
  spread.root.style.display = 'none';
  strip.root.style.display = 'none';
  stage.append(bar.root, empty, spread.root, strip.root);

  // ── Search controller (find-bar lives inside the stage so it
  //    sits above the page area and dismisses with Esc).
  const search = createSearchController({
    stage, pdfStore,
    getPdfDoc: () => pdfDoc,
    getDocId: () => docId,
    getCurrentPage: () => currentPage,
    onJumpToPage: (n) => goToPage(n),
    onToast,
  });
  stage.appendChild(search.bar.root);

  const info = buildInfoPanel({
    onClearTodays: () => { sel.setQuotes([]); renderInfo(); },
    onJumpToQuote: (q) => q.page && goToPage(q.page),
  });

  // Late-bound: the selMenu's callbacks call into `sel` which is
  // constructed below; closure sees it once defined.
  let sel;
  const selMenu = buildSelectionMenu({
    onCopy:        () => sel.copy(),
    onSendToNotes: () => sel.sendToNotes(),
    onCalc:        () => sel.evalCalc(),
    onCite:        () => sel.copyCitation(),
    onBookmark:    () => sel.bookmark(),
    onHighlight:   () => sel.highlight(),
  });

  root.append(side.root, stage, info.root, selMenu.root);

  sel = createSelectionController({
    stage, selMenu,
    onAddBookmark: (b) => { onAddBookmark?.(b); renderRail(); },
    onAddHighlight,
    onSendToNotes,
    onToast,
    getDocId: () => docId,
    getDocTitle: () => docTitle,
    getCurrentPage: () => currentPage,
    getHighlightsOnPage,
    onChangeQuotes: (q) => { todaysQuotes = q; },
    onChangeCalc: (c) => { calcResult = c; },
    onRefreshInfo: () => renderInfo(),
  });

  // PDF-aware right-click + multi-color highlights + sticky notes.
  const ann = createAnnotationsController({
    stage, pdfStore,
    getDocId: () => docId,
    getDocTitle: () => docTitle,
    getCurrentPage: () => currentPage,
    getSelectionRect: () => {
      const s = sel.getLastSelection();
      return s.text ? { text: s.text, page: s.page, rect: s.rect } : null;
    },
    getHighlightsOnPage,
    onAddBookmark: (b) => { onAddBookmark?.(b); renderRail(); },
    onAddHighlight, onRemoveHighlight,
    onJumpToPage: (n) => goToPage(n),
    onCopyClipboard: (t) => { try { navigator.clipboard.writeText(t); } catch { /* best-effort */ } },
    onSendToNotesText: ({ text, page }) => {
      // Reuse the existing selection-controller's sendToNotes path so
      // quote vault behavior stays consistent.
      sel.sendToNotes();
    },
    onToast,
    onRotatePage: (dir) => { rotation = (rotation + (dir > 0 ? 90 : -90) + 360) % 360; renderStage(); },
    onFitWidth: () => setZoom('fit-width'),
    onFitPage:  () => setZoom('fit-page'),
    onSearchOpen: (q) => search.open?.(q),
  });

  // ── Mode helpers ──

  function isSpreadMode() { return viewMode === 'spread' || viewMode === 'book'; }
  function pageStep() { return isSpreadMode() ? 2 : 1; }
  function clampPage(n) {
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(totalPages, Math.floor(n)));
  }
  async function goToPage(n) {
    const next = clampPage(n);
    if (!pdfDoc) return;
    currentPage = next;
    selMenu.hide();
    if (viewMode === 'continuous') strip.scrollToPage(next, stage);
    else await renderStage();
    renderRail(); renderBar();
    memory?.save(docId, { page: currentPage });
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
      const zoomNumber = await resolveZoom();
      await strip.render({ pdfDoc, scrollHost: stage, zoom: zoomNumber, docId });
    } else {
      spread.root.style.display = '';
      strip.root.style.display = 'none';
      stage.classList.remove('is-continuous');
      const stageWidth = stage.clientWidth || 800;
      const stageHeight = stage.clientHeight || 600;
      const useSpread = isSpreadMode();
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
      sel.applyHighlightsToVisiblePages();
    }
    // Place sticky-note pips after pages render.
    ann?.renderNotePips?.();
    search?.redecorate?.();
  }

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
      return clampZoom(innerW / vp.width);
    } catch { return 1.0; }
  }

  async function setZoom(level) {
    if (typeof level === 'string' && level !== 'fit-width' && level !== 'fit-page') return;
    userZoom = typeof level === 'number' ? clampZoom(level) : level;
    await renderStage(); renderBar();
    memory?.save(docId, { zoom: userZoom });
  }
  async function zoomStep(dir) { await setZoom(stepZoom(await resolveZoom(), dir)); }
  async function setMode(mode) {
    if (!['single', 'continuous', 'spread', 'book'].includes(mode) || mode === viewMode) return;
    viewMode = mode;
    await renderStage(); renderBar();
    memory?.save(docId, { mode: viewMode });
  }
  async function rotateRight() {
    rotation = (rotation + 90) % 360;
    await renderStage(); memory?.save(docId, { rotation });
  }
  function toggleFullscreen() {
    if (isFullscreen || document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
    root.requestFullscreen?.().catch(() => {});
  }
  function toggleDarkPages() {
    darkPages = !darkPages;
    root.classList.toggle('is-dark-pages', darkPages);
    memory?.save(docId, { darkPages });
  }
  function getProperties() {
    return { title: docTitle, pages: totalPages, docId, mode: viewMode,
      zoom: typeof userZoom === 'number' ? `${Math.round(userZoom * 100)}%` : userZoom,
      rotation: `${rotation}°` };
  }
  document.addEventListener('fullscreenchange', () => {
    isFullscreen = document.fullscreenElement === root;
    root.classList.toggle('is-fullscreen', isFullscreen);
  });

  function renderRail() {
    side.update({ outline, bookmarks: getBookmarks?.(docId) || [], currentPage, totalPages,
      streak: getStreakStrip?.() || [], streakDays: getStreakDays?.() || 0,
      quotes: ann?.getDocQuotes?.() || [] });
  }
  function renderBar() {
    bar.update({ docTitle, sectionLabel: activeOutlineLabel(),
      page: currentPage, totalPages, zoomLevel: userZoom, mode: viewMode });
  }
  function activeOutlineLabel() {
    let best = '';
    for (const e of outline) if (Number.isFinite(e.page) && e.page <= currentPage) best = e.title;
    return best;
  }
  function renderInfo() {
    info.update({ selectionText: sel.getLastSelection().text, calc: calcResult, todaysQuotes: sel.getQuotes() });
  }
  function renderAll() { renderRail(); renderBar(); renderInfo(); }

  // ── Hand tool (grab-to-pan) ──
  let handMode = false;
  let grabState = null;
  function setHandMode(on) {
    handMode = on;
    root.classList.toggle('hand-mode', on);
    bar.setToolMode?.(on ? 'hand' : 'text');
  }
  function endGrab() { grabState = null; root.classList.remove('is-grabbing'); }
  stage.addEventListener('pointerdown', (e) => {
    if (!handMode || !pdfDoc || e.target.closest('.cx-reader-bar') || e.button !== 0) return;
    e.preventDefault();
    root.classList.add('is-grabbing');
    grabState = { x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!grabState) return;
    stage.scrollLeft = grabState.sl - (e.clientX - grabState.x);
    stage.scrollTop  = grabState.st - (e.clientY - grabState.y);
  });
  stage.addEventListener('pointerup', () => { if (grabState) endGrab(); });
  stage.addEventListener('pointercancel', () => { if (grabState) endGrab(); });

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
    if (e.target.closest('.cx-text-layer')) return;
    if (typeof userZoom === 'number') setZoom('fit-width');
    else setZoom(1.0);
  });

  // ── Resume pill (transient overlay shown on auto-resume) ──

  function showResumePill(page) {
    if (resumePill) resumePill.remove();
    resumePill = el('div', { class: 'cx-resume-pill', onclick: () => resumePill?.remove() }, `Resumed on page ${page}`);
    root.appendChild(resumePill);
    setTimeout(() => { resumePill?.classList.add('is-fading'); setTimeout(() => { resumePill?.remove(); resumePill = null; }, 500); }, 2500);
  }

  // ── Loading ──

  async function load({ source, name, id }) {
    const pdfjs = await loadPdfJs();
    // If id and name are both falsy, name is unconditionally falsy in the
    // fallback — collapse to a literal default.
    docId = id || name || 'recent:doc.pdf';
    docTitle = name || 'document.pdf';

    pdfDoc = await pdfjs.getDocument({ ...source, isEvalSupported: false }).promise;
    totalPages = pdfDoc.numPages;
    currentPage = 1;

    outline = await resolveOutline(pdfDoc);

    // Restore saved view state if present.
    const stateRef = { viewMode, userZoom, rotation, currentPage };
    const resumed = await restoreViewState({ memory, docId, state: stateRef, clampPage });
    viewMode = stateRef.viewMode;
    userZoom = stateRef.userZoom;
    rotation = stateRef.rotation;
    currentPage = stateRef.currentPage;
    if (!resumed) await ensureDefaultMode({ pdfDoc, stage, state: stateRef });
    viewMode = stateRef.viewMode;

    onRecordOpen?.();
    await ann?.refreshNotes?.();   // pull notes from IDB before first render
    await renderStage();

    // After the strip is built, scroll to the resumed page.
    if (viewMode === 'continuous' && currentPage > 1) {
      requestAnimationFrame(() => strip.scrollToPage(currentPage, stage));
    }
    renderAll();

    if (resumed) showResumePill(resumed);
    onToast?.({ message: `Opened "${docTitle}"`, type: 'success' });
  }

  function close() {
    memory?.flush(docId);
    search.close();
    search.reset();
    ann?.reset?.();
    pdfDoc = null;
    docId = null;
    docTitle = '';
    outline = [];
    currentPage = 1;
    totalPages = 0;
    todaysQuotes = [];
    sel.setQuotes([]);
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
    memory?.flushAll();
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
    setZoom, zoomStep, setMode, rotateRight, toggleFullscreen,
    toggleSearch: () => search.toggle(),
    toggleDarkPages, setHandMode,
    isDarkPages: () => darkPages,
    getProperties,
    getZoomLabel: () => fmtZoom(userZoom),
  };
}
