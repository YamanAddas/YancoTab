/**
 * pdf/v3/readerPageOps.js — page-ops controller wiring.
 *
 * Extracted from reader.js to keep the orchestrator under the 500-line
 * cap. Owns the mutate→persist→refresh loop for per-page rotate / delete
 * / restore.
 *
 * Target size: ≤ 100 lines.
 */

import { savePageOps } from './ops/pageOps.js';

export function createPageOpsController({
  pdfStore,
  getDocId,
  getPageOps,
  setPageOps,
  getTotalPages,
  getCurrentPage,
  setCurrentPage,
  strip,
  sidebar,
  stage,
  toolbar,
  getZoom,
}) {
  async function mutate(fn) {
    const docId = getDocId();
    if (!docId) return;
    const prev = getPageOps();
    const next = fn(prev);
    if (next === prev) return;
    setPageOps(next);
    try {
      await savePageOps(pdfStore, docId, {
        pageRotations: next.pageRotations,
        pageOmits: next.pageOmits,
        pageOrder: next.pageOrder,
      });
    } catch { /* best-effort */ }
    try { await strip.rebuildForOpsChange?.(); } catch { /* best-effort */ }
    sidebar.callTab?.('thumbs', 'refreshOps');
    realignCurrentPage(next);
  }

  function realignCurrentPage(state) {
    const totalPages = getTotalPages();
    const currentPage = getCurrentPage();
    const omits = Array.isArray(state.pageOmits) ? state.pageOmits : [];
    if (!omits.includes(currentPage)) return;
    const remaining = [];
    for (let p = 1; p <= totalPages; p++) {
      if (!omits.includes(p)) remaining.push(p);
    }
    if (!remaining.length) return;
    const next = remaining.find((p) => p >= currentPage) || remaining[remaining.length - 1];
    setCurrentPage(next);
    strip.scrollToPage(next, stage);
    toolbar.update({ page: next, totalPages, zoom: getZoom() });
  }

  return { mutate };
}
