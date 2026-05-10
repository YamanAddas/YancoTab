/**
 * pdf/view/spread.js — single page or two-page spread.
 *
 * Wraps two pageView instances. Mode is controlled by the
 * orchestrator:
 *   single — left only, full-width
 *   spread — both pages, side by side (left + right)
 *   book   — like spread, but page 1 alone (cover offset)
 *
 * Zoom level is passed in by the orchestrator. A numeric zoom (e.g.
 * 1.5) overrides fit-width. A string ('fit-width' / 'fit-page') falls
 * back to the legacy fit-to-stage behavior.
 */

import { el } from '../../../utils/dom.js';
import { buildPageView } from './pageView.js';
import { pageCssWidth } from '../engine/viewport.js';
import { zoomToFit } from '../engine/zoom.js';

const SPREAD_MIN_PX = 920; // for the legacy auto-mode

export function buildSpread() {
  const root = el('div', { class: 'cx-spread' });
  const left = buildPageView();
  const right = buildPageView();
  root.append(left.root, right.root);

  let lastDocId = null;

  function isSpread(stageWidth) { return stageWidth >= SPREAD_MIN_PX; }

  async function render({
    pdfDoc, leftPage, rightPage,
    stageWidth, stageHeight,
    gapPx = 14, paddingPx = 24, docId,
    mode = 'auto',          // 'single' | 'spread' | 'book' | 'auto'
    zoom = 'fit-width',     // number | 'fit-width' | 'fit-page'
    rotation = 0,           // 0 | 90 | 180 | 270 — applied to both pages
  }) {
    if (lastDocId && lastDocId !== docId) {
      left.destroy();
      right.destroy();
    }
    lastDocId = docId || lastDocId;

    if (!pdfDoc) {
      left.render(null);
      right.render(null);
      return;
    }

    const useSpread = mode === 'spread' || mode === 'book' || (mode === 'auto' && isSpread(stageWidth));
    root.classList.toggle('is-spread', useSpread);
    root.classList.toggle('is-book', mode === 'book');
    right.root.style.display = useSpread ? '' : 'none';

    // Resolve zoom against the first page's intrinsic viewport.
    let cssPerPage = 0;
    if (Number.isFinite(leftPage) && leftPage >= 1 && leftPage <= pdfDoc.numPages) {
      const firstPage = await pdfDoc.getPage(leftPage);
      const baseViewport = firstPage.getViewport({ scale: 1, rotation });
      const stage = { width: stageWidth, height: stageHeight || 800 };
      const numericZoom = typeof zoom === 'number'
        ? zoom
        : zoomToFit({
            mode: zoom,
            pageBaseViewport: baseViewport,
            stage, gap: gapPx, padding: paddingPx, spread: useSpread,
          });
      cssPerPage = pageCssWidth({
        pageBaseViewport: baseViewport,
        stage, zoom: numericZoom, mode: useSpread ? 'spread' : 'single',
        gap: gapPx, padding: paddingPx,
      });
      if (cssPerPage <= 40) {
        left.render(null);
        right.render(null);
        return;
      }
      await left.render(firstPage, { cssWidth: cssPerPage, label: `— ${leftPage} —`, rotation });
    } else {
      left.render(null);
    }

    if (useSpread && Number.isFinite(rightPage) && rightPage >= 1 && rightPage <= pdfDoc.numPages && cssPerPage > 0) {
      const p = await pdfDoc.getPage(rightPage);
      await right.render(p, { cssWidth: cssPerPage, label: `— ${rightPage} —`, rotation });
    } else {
      right.render(null);
    }
  }

  function destroy() { left.destroy(); right.destroy(); }

  return { root, render, destroy, isSpread };
}
