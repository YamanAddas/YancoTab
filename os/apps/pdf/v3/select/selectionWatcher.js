/**
 * pdf/v3/select/selectionWatcher.js — selectionchange handler.
 *
 * Listens to document.selectionchange events; on each fire (debounced
 * to an rAF), it asks the caller's resolver to identify which page
 * the selection lives in, fetches that page's pageTextIndex via the
 * resolver, computes flat offsets, and emits an update.
 *
 * Doesn't own the index — the orchestrator does. We just call back
 * for the index per page touched.
 *
 * Cross-page selections: emit ONE update with `multiPage: true` and
 * an array of {page, charStart, charEnd, text}. The caller decides
 * how to surface this (split into N annotations sharing groupId).
 *
 * Target size: ≤ 200 lines.
 */

import { offsetsFromRange } from './offsetRanges.js';

export function createSelectionWatcher({
  stage,
  getPageIndexForElement,   // (pageEl) → PageTextIndex | null
  getPageNumberForElement,  // (pageEl) → number | null
  onChange,                 // (update) called on every meaningful change
  onCleared,                // () called when selection becomes empty
} = {}) {
  if (!stage) throw new Error('stage required');

  let raf = 0;
  let lastEmittedKey = '';   // dedupe: same selection emits once

  function rectInsideStage() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!range || range.collapsed) return null;
    const a = range.commonAncestorContainer;
    const node = a.nodeType === 1 ? a : a.parentElement;
    if (!node || !stage.contains(node)) return null;
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return { range, rect, text: sel.toString() };
  }

  function pageElOf(node) {
    let p = node;
    while (p && p !== stage) {
      if (p.nodeType === 1 && p.classList?.contains('pdf-page')) return p;
      p = p.parentElement || p.parentNode;
    }
    return null;
  }

  function poll() {
    raf = 0;
    const s = rectInsideStage();
    if (!s) {
      if (lastEmittedKey) {
        lastEmittedKey = '';
        onCleared?.();
      }
      return;
    }
    // Resolve start and end pages.
    const startNode = s.range.startContainer.nodeType === 1
      ? s.range.startContainer : s.range.startContainer.parentElement;
    const endNode = s.range.endContainer.nodeType === 1
      ? s.range.endContainer : s.range.endContainer.parentElement;
    const startPageEl = pageElOf(startNode);
    const endPageEl = pageElOf(endNode);
    if (!startPageEl || !endPageEl) {
      if (lastEmittedKey) { lastEmittedKey = ''; onCleared?.(); }
      return;
    }

    // Single-page selection (vast majority).
    if (startPageEl === endPageEl) {
      const index = getPageIndexForElement?.(startPageEl);
      const page = getPageNumberForElement?.(startPageEl);
      if (!index || !Number.isFinite(page)) return;
      const layerEl = startPageEl.querySelector('.pdf-textlayer');
      if (!layerEl) return;
      const offsets = offsetsFromRange(index, layerEl, s.range);
      if (!offsets) return;
      const key = `${page}:${offsets.charStart}:${offsets.charEnd}`;
      if (key === lastEmittedKey) return;
      lastEmittedKey = key;
      onChange?.({
        multiPage: false,
        page,
        charStart: offsets.charStart,
        charEnd: offsets.charEnd,
        text: s.text,
        rect: s.rect,
      });
      return;
    }

    // Cross-page selection. Walk pages in document order between start
    // and end (inclusive) and produce per-page offsets.
    // We collect page elements via document order.
    const allPages = stage.querySelectorAll('.pdf-page');
    let inRange = false;
    const segments = [];
    for (let i = 0; i < allPages.length; i++) {
      const pe = allPages[i];
      if (pe === startPageEl) inRange = true;
      if (inRange) {
        const index = getPageIndexForElement?.(pe);
        const page = getPageNumberForElement?.(pe);
        const layerEl = pe.querySelector('.pdf-textlayer');
        if (index && Number.isFinite(page) && layerEl) {
          // For middle pages, the range encompasses the entire page's
          // text. For the first/last pages, we clip to the selection.
          // offsetsFromRange handles clipping via the live Range.
          const offsets = offsetsFromRange(index, layerEl, s.range);
          if (offsets) {
            segments.push({
              page,
              charStart: offsets.charStart,
              charEnd: offsets.charEnd,
              text: '',  // Phase B leaves per-segment text empty for cross-page
            });
          }
        }
      }
      if (pe === endPageEl) break;
    }
    if (segments.length === 0) return;
    const key = segments.map((s) => `${s.page}:${s.charStart}:${s.charEnd}`).join(',');
    if (key === lastEmittedKey) return;
    lastEmittedKey = key;
    onChange?.({
      multiPage: true,
      segments,
      text: s.text,
      rect: s.rect,
    });
  }

  function handler() {
    if (raf) return;
    raf = requestAnimationFrame(poll);
  }

  document.addEventListener('selectionchange', handler);

  return {
    destroy() {
      document.removeEventListener('selectionchange', handler);
      if (raf) cancelAnimationFrame(raf);
    },
    forceCheck: poll,
  };
}
