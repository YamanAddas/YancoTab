/**
 * pdf/view/spread.js — single page or two-page spread.
 *
 * Wraps two pageView instances; the second is hidden when the
 * stage is narrower than the spread breakpoint. The orchestrator
 * tells us which page numbers to render and how wide each page
 * should be in CSS pixels.
 */

import { el } from '../../../utils/dom.js';
import { buildPageView } from './pageView.js';

const SPREAD_MIN_PX = 920; // stage width ≥ this → 2-up

export function buildSpread() {
  const root = el('div', { class: 'cx-spread' });
  const left = buildPageView();
  const right = buildPageView();
  root.append(left.root, right.root);

  let lastDocId = null;

  function isSpread(stageWidth) { return stageWidth >= SPREAD_MIN_PX; }

  async function render({ pdfDoc, leftPage, rightPage, stageWidth, gapPx = 14, paddingPx = 24, docId }) {
    if (lastDocId && lastDocId !== docId) {
      // New document — clear out the previous canvases so we don't
      // briefly show stale page contents while the new doc renders.
      left.destroy();
      right.destroy();
    }
    lastDocId = docId || lastDocId;

    if (!pdfDoc) {
      left.render(null);
      right.render(null);
      return;
    }

    const spread = isSpread(stageWidth);
    root.classList.toggle('is-spread', spread);
    right.root.style.display = spread ? '' : 'none';

    const innerWidth = Math.max(0, stageWidth - paddingPx * 2);
    const cssPerPage = spread
      ? (innerWidth - gapPx) / 2
      : innerWidth;

    if (cssPerPage <= 40) {
      left.render(null);
      right.render(null);
      return;
    }

    if (Number.isFinite(leftPage) && leftPage >= 1 && leftPage <= pdfDoc.numPages) {
      const p = await pdfDoc.getPage(leftPage);
      await left.render(p, { cssWidth: cssPerPage, label: `— ${leftPage} —` });
    } else {
      left.render(null);
    }

    if (spread && Number.isFinite(rightPage) && rightPage >= 1 && rightPage <= pdfDoc.numPages) {
      const p = await pdfDoc.getPage(rightPage);
      await right.render(p, { cssWidth: cssPerPage, label: `— ${rightPage} —` });
    } else {
      right.render(null);
    }
  }

  function destroy() { left.destroy(); right.destroy(); }

  return { root, render, destroy, isSpread };
}
