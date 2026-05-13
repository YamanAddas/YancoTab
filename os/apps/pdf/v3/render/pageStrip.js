/**
 * pdf/v3/render/pageStrip.js — virtualized continuous page strip.
 *
 * Mounts placeholder slots for every page in the doc at the correct
 * height, then renders pages into them on demand as they scroll into
 * view (IntersectionObserver). This keeps memory bounded for large
 * docs while letting the user scroll smoothly.
 *
 * Each rendered page gets its pageTextIndex attached via a WeakMap so
 * the selection watcher can resolve a page element → text index for
 * offset arithmetic.
 *
 * Target size: ≤ 400 lines.
 */

import { el } from '../../../../utils/dom.js';
import { buildPageView } from './pageView.js';
import {
  applyHighlights,
  applySearchMatches, clearSearchMatches,
} from './highlightRender.js';
import { renderNotePips } from './notePipsRender.js';

export function buildPageStrip({
  getHighlightsForPage,    // async (page) → highlight[]  (offset-shape)
  getNonTextAnnotationsForPage, // async (page) → annotation[]  (ink/shape/sign)
  getNotesForPage,         // async (page) → note[]  (kind='note', fractional coords)
  getSearchMatchesForPage, // (page) → { matches, currentMatch }
  onPageMounted,           // (pageNum, pageEl) called after first render
  onNotePipClick,          // (note, rect) → open note popover in edit mode
  getPageOps,              // () → { pageRotations, pageOmits, pageOrder } | null
} = {}) {
  const root = el('div', { class: 'pdf-strip' });
  const slots = new Map();       // pageNum → { el, view, rendered, observer }
  const pageIndexByEl = new WeakMap();
  let scrollHost = null;
  let observer = null;
  let pdfDoc = null;
  let lastZoom = 1.0;

  function currentOps() {
    try { return getPageOps?.() || null; } catch { return null; }
  }
  function isOmitted(p) {
    const ops = currentOps();
    return !!(ops && Array.isArray(ops.pageOmits) && ops.pageOmits.includes(p));
  }
  function rotationFor(p) {
    const ops = currentOps();
    return (ops && ops.pageRotations && ops.pageRotations[p]) || 0;
  }

  async function prepareSlots(doc, hostEl, { zoom = 1.0 } = {}) {
    pdfDoc = doc;
    scrollHost = hostEl;
    lastZoom = zoom;
    teardown();
    if (!pdfDoc) return;

    // First page sizes the strip. We measure page 1 once, assume same
    // size for all pages, and let later renders correct individual
    // pages if they differ (e.g. landscape inserts).
    const firstPage = await pdfDoc.getPage(1);
    const baseVp = firstPage.getViewport({ scale: zoom });
    const slotW = Math.round(baseVp.width);
    const slotH = Math.round(baseVp.height);

    const total = pdfDoc.numPages;
    for (let p = 1; p <= total; p++) {
      if (isOmitted(p)) continue;  // skip pages the user deleted
      const slotEl = el('div', { class: 'pdf-strip-slot', 'data-pending': '1' });
      slotEl.style.width = `${slotW}px`;
      slotEl.style.height = `${slotH}px`;
      slotEl.dataset.page = String(p);
      root.appendChild(slotEl);
      slots.set(p, { el: slotEl, view: null, rendered: false });
    }

    observer = new IntersectionObserver(onIntersect, {
      root: scrollHost,
      rootMargin: '600px 0px 600px 0px',
      threshold: 0,
    });
    for (const { el: sl } of slots.values()) observer.observe(sl);
  }

  function onIntersect(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const p = Number(entry.target.dataset.page);
      if (!Number.isFinite(p)) continue;
      mountSlot(p);
    }
  }

  async function mountSlot(pageNum) {
    const slot = slots.get(pageNum);
    if (!slot || slot.rendered) return;
    slot.rendered = true;
    try {
      const pdfPage = await pdfDoc.getPage(pageNum);
      const view = buildPageView();
      slot.view = view;
      slot.el.innerHTML = '';
      slot.el.removeAttribute('data-pending');
      slot.el.appendChild(view.root);
      const rotation = rotationFor(pageNum);
      const baseVp = pdfPage.getViewport({ scale: lastZoom, rotation });
      await view.render(pdfPage, {
        cssWidth: baseVp.width,
        pageNum,
        rotation,
      });
      // Correct slot size to actual page size (in case of mixed-size docs).
      slot.el.style.width = `${baseVp.width}px`;
      slot.el.style.height = `${baseVp.height}px`;
      // Register the page's text index against its DOM element.
      const idx = view.getIndex();
      if (idx) pageIndexByEl.set(view.root, idx);
      onPageMounted?.(pageNum, view.root);
      // Apply any pre-existing highlights for this page.
      await refreshHighlightsForPage(pageNum);
      // And any non-text annotations (ink/shape/signature).
      await refreshNonTextAnnotationsForPage(pageNum);
      // And any sticky notes.
      await refreshNotesForPage(pageNum);
    } catch (e) {
      console.warn('[pdf-v3] mount slot failed:', pageNum, e);
      slot.rendered = false;  // allow retry on next intersect
    }
  }

  async function refreshHighlightsForPage(pageNum) {
    const slot = slots.get(pageNum);
    if (!slot || !slot.view) return;
    const layer = slot.view.getTextLayer();
    const idx = slot.view.getIndex();
    if (!layer || !idx) return;
    let highlights = [];
    try {
      highlights = (await getHighlightsForPage?.(pageNum)) || [];
    } catch { /* best-effort */ }
    applyHighlights(layer, idx, highlights);
    // Re-apply search-match decorations too, since applyHighlights cleared
    // them along with the highlights.
    refreshSearchMatchesForPage(pageNum);
  }

  function refreshSearchMatchesForPage(pageNum) {
    const slot = slots.get(pageNum);
    if (!slot || !slot.view) return;
    const layer = slot.view.getTextLayer();
    const idx = slot.view.getIndex();
    if (!layer || !idx) return;
    if (!getSearchMatchesForPage) {
      clearSearchMatches(layer);
      return;
    }
    const { matches, currentMatch } = getSearchMatchesForPage(pageNum) || {};
    applySearchMatches(layer, idx, matches || [], currentMatch);
  }

  function refreshAllSearchMatches() {
    for (const p of slots.keys()) refreshSearchMatchesForPage(p);
  }

  async function refreshAllHighlights() {
    const pending = [];
    for (const p of slots.keys()) pending.push(refreshHighlightsForPage(p));
    await Promise.all(pending);
  }

  async function refreshNonTextAnnotationsForPage(pageNum) {
    const slot = slots.get(pageNum);
    if (!slot || !slot.view) return;
    const annLayer = slot.view.getAnnotationLayer?.();
    if (!annLayer) return;
    let annotations = [];
    try {
      annotations = (await getNonTextAnnotationsForPage?.(pageNum)) || [];
    } catch { /* best-effort */ }
    annLayer.renderAnnotations(annotations);
  }

  async function refreshAllNonTextAnnotations() {
    const pending = [];
    for (const p of slots.keys()) pending.push(refreshNonTextAnnotationsForPage(p));
    await Promise.all(pending);
  }

  async function refreshNotesForPage(pageNum) {
    const slot = slots.get(pageNum);
    if (!slot || !slot.view) return;
    const pageEl = slot.view.root;
    let notes = [];
    try {
      notes = (await getNotesForPage?.(pageNum)) || [];
    } catch { /* best-effort */ }
    renderNotePips(pageEl, notes, { onPipClick: onNotePipClick });
  }

  async function refreshAllNotes() {
    const pending = [];
    for (const p of slots.keys()) pending.push(refreshNotesForPage(p));
    await Promise.all(pending);
  }

  function getAnnotationLayerForPage(pageNum) {
    const slot = slots.get(pageNum);
    return slot?.view?.getAnnotationLayer?.() || null;
  }

  function setAllToolsActive(active) {
    for (const slot of slots.values()) {
      const ann = slot?.view?.getAnnotationLayer?.();
      if (ann) ann.setToolActive(active);
    }
  }

  function scrollToPage(pageNum, host = scrollHost) {
    const slot = slots.get(pageNum);
    if (!slot || !host) return;
    const r = slot.el.getBoundingClientRect();
    const hostR = host.getBoundingClientRect();
    host.scrollTop += r.top - hostR.top - 12;
  }

  function getPageNumberForElement(pageEl) {
    if (!pageEl) return null;
    const ds = pageEl.dataset?.page;
    if (ds) return Number(ds);
    const closest = pageEl.closest?.('.pdf-page');
    if (closest && closest.dataset.page) return Number(closest.dataset.page);
    return null;
  }

  function getPageIndexForElement(pageEl) {
    if (!pageEl) return null;
    const target = pageEl.classList?.contains('pdf-page')
      ? pageEl
      : pageEl.closest?.('.pdf-page');
    if (!target) return null;
    return pageIndexByEl.get(target) || null;
  }

  function teardown() {
    if (observer) { observer.disconnect(); observer = null; }
    for (const slot of slots.values()) {
      try { slot.view?.destroy(); } catch { /* best-effort */ }
    }
    slots.clear();
    root.innerHTML = '';
  }

  /**
   * Rebuild the strip after pageOps changes (rotate/delete/restore).
   * Re-uses the stored pdfDoc + scrollHost + zoom.
   */
  async function rebuildForOpsChange() {
    if (!pdfDoc || !scrollHost) return;
    await prepareSlots(pdfDoc, scrollHost, { zoom: lastZoom });
  }

  return {
    root,
    prepareSlots,
    rebuildForOpsChange,
    refreshHighlightsForPage,
    refreshAllHighlights,
    refreshSearchMatchesForPage,
    refreshAllSearchMatches,
    refreshNonTextAnnotationsForPage,
    refreshAllNonTextAnnotations,
    refreshNotesForPage,
    refreshAllNotes,
    getAnnotationLayerForPage,
    setAllToolsActive,
    scrollToPage,
    getPageNumberForElement,
    getPageIndexForElement,
    destroy: teardown,
  };
}
