/**
 * pdf/v3/readerScroll.js — scroll-position → current-page tracker.
 *
 * Watches the stage's scroll event, throttles via requestAnimationFrame,
 * and reports the most-prominent visible page back via setCurrentPage().
 *
 * Extracted from reader.js to keep the orchestrator under the 500-line cap.
 *
 * Target size: ≤ 80 lines.
 */

export function createScrollTracker({
  stage,
  stripRoot,
  getPdfDoc,
  getCurrentPage,
  setCurrentPage,
  getTotalPages,
  getZoom,
  toolbar,
  sidebar,
  saveReading,
}) {
  let raf = 0;

  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!getPdfDoc()) return;
      const stageRect = stage.getBoundingClientRect();
      const midline = stageRect.top + stageRect.height * 0.35;
      const pageEls = stripRoot.querySelectorAll('.pdf-strip-slot[data-page]');
      let best = getCurrentPage();
      let bestDist = Infinity;
      for (const pe of pageEls) {
        const r = pe.getBoundingClientRect();
        if (r.bottom < stageRect.top || r.top > stageRect.bottom) continue;
        const dist = Math.abs(r.top - midline);
        if (dist < bestDist) {
          bestDist = dist;
          const n = Number(pe.dataset.page);
          if (Number.isFinite(n)) best = n;
        }
      }
      if (best !== getCurrentPage()) {
        setCurrentPage(best);
        toolbar.update({ page: best, totalPages: getTotalPages(), zoom: getZoom() });
        sidebar.updateTab('thumbs', { totalPages: getTotalPages(), currentPage: best });
        saveReading?.({ page: best, scrollY: stage.scrollTop });
      }
    });
  }

  stage.addEventListener('scroll', onScroll, { passive: true });

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    stage.removeEventListener('scroll', onScroll);
  }

  return { destroy };
}
