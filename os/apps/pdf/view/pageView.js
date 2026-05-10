/**
 * pdf/view/pageView.js — render a single PDF page to canvas + a
 * selectable text-layer overlay.
 *
 * Caller passes a `pdfPage` (from pdfjsLib.getDocument) and a target
 * width in CSS pixels. We compute the right viewport, render the
 * canvas, and inject absolutely-positioned transparent <span>s for
 * each text item — that's what enables real text selection on the
 * page.
 *
 * Holds no app state. Returns `{ root, destroy }`.
 */

import { el } from '../../../utils/dom.js';
import { applyLinkLayer } from './linkLayer.js';

let pdfjsLib = null;

/** Lazy import pdf.js once. The orchestrator calls this before us. */
export function setPdfJsModule(mod) { pdfjsLib = mod; }

const DPR_CAP = 2; // never render past 2× CSS pixels — keeps memory sane

export function buildPageView({ onLinkInternal, onLinkExternal } = {}) {
  const root = el('div', { class: 'cx-page' });
  const canvas = document.createElement('canvas');
  canvas.className = 'cx-page-canvas';
  const textLayerDiv = el('div', { class: 'cx-text-layer' });
  const pageNum = el('div', { class: 'cx-page-num' });
  const empty = el('div', { class: 'cx-page-empty' }, '—');

  root.append(canvas, textLayerDiv, pageNum, empty);

  let renderTask = null;
  let lastRenderedKey = null;

  function showEmpty(visible) {
    canvas.style.display = visible ? 'none' : '';
    textLayerDiv.style.display = visible ? 'none' : '';
    pageNum.style.display = visible ? 'none' : '';
    empty.style.display = visible ? 'flex' : 'none';
  }

  showEmpty(true);

  async function render(pdfPage, { cssWidth, label, rotation = 0 } = {}) {
    if (!pdfPage || !cssWidth || cssWidth <= 0) {
      showEmpty(true);
      return;
    }
    if (!pdfjsLib) throw new Error('pdfjs module not set — call setPdfJsModule first');

    // Cancel any in-flight render. pdf.js holds an internal lock on
    // the canvas, so we must await the cancellation before kicking
    // off a new render — otherwise pdf.js throws
    // "Cannot use the same canvas during multiple render() operations."
    if (renderTask) {
      const old = renderTask;
      renderTask = null;
      try { old.cancel(); } catch { /* ignore */ }
      try { await old.promise; } catch { /* ignore — cancellation rejects */ }
    }

    // Rotation is normalized: 0 / 90 / 180 / 270 plus pdf.js's intrinsic
    // page rotation. pdf.js's getViewport({ rotation }) handles the math.
    const rot = ((Number(rotation) || 0) + 360) % 360;
    const baseViewport = pdfPage.getViewport({ scale: 1, rotation: rot });
    const scale = cssWidth / baseViewport.width;
    const viewport = pdfPage.getViewport({ scale, rotation: rot });

    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

    // Avoid double-render of the same page at the same width + rotation.
    const key = `${pdfPage.pageNumber}@${cssWidth.toFixed(1)}@${dpr}@r${rot}`;
    if (key === lastRenderedKey) return;
    lastRenderedKey = key;

    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;
    root.style.width = `${viewport.width}px`;
    root.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d');

    showEmpty(false);
    pageNum.textContent = label || `— ${pdfPage.pageNumber} —`;

    // Pass DPR via the `transform` param rather than pre-transforming
    // the context — pdf.js v4 expects an untouched context and applies
    // its own viewport transform internally. Pre-transforming caused
    // render() to hang silently.
    const renderTransform = dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0];
    renderTask = pdfPage.render({
      canvasContext: ctx,
      viewport,
      ...(renderTransform ? { transform: renderTransform } : {}),
    });
    try {
      await renderTask.promise;
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') {
        console.error('[Codex] page render failed:', e);
        throw e;
      }
      renderTask = null;
      return;
    }
    renderTask = null;

    // Build text layer.
    textLayerDiv.innerHTML = '';
    const textContent = await pdfPage.getTextContent();
    const frag = document.createDocumentFragment();
    for (const item of textContent.items) {
      if (!item || typeof item.str !== 'string' || !item.str) continue;
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      // tx is [a,b,c,d,e,f]: e,f = x,y; sqrt(c² + d²) ≈ font size
      const fontSize = Math.hypot(tx[2], tx[3]);
      if (fontSize <= 0) continue;
      const span = document.createElement('span');
      span.textContent = item.str;
      span.style.position = 'absolute';
      span.style.left = `${tx[4]}px`;
      span.style.top = `${tx[5] - fontSize}px`;
      span.style.fontSize = `${fontSize}px`;
      span.style.fontFamily = item.fontName || 'sans-serif';
      // Slight scale-x correction to match canvas glyph widths so the
      // text-layer spans line up with what the user sees on the canvas.
      if (item.width && fontSize > 0) {
        const ctxScale = (item.width * scale) / span.getBoundingClientRect().width || 1;
        if (Number.isFinite(ctxScale) && ctxScale > 0 && ctxScale !== 1) {
          // Skip in fragment build — getBoundingClientRect requires DOM
          // attachment. We accept slight drift; better than n DOM thrashes.
        }
      }
      frag.appendChild(span);
    }
    textLayerDiv.appendChild(frag);

    // Link annotations (clickable cross-refs + URI links).
    if (onLinkInternal || onLinkExternal) {
      try {
        const annotations = await pdfPage.getAnnotations();
        applyLinkLayer({
          pageEl: root, viewport, annotations,
          onInternal: onLinkInternal, onExternal: onLinkExternal,
        });
      } catch { /* ignore link-layer failures — pages still render */ }
    }
  }

  function destroy() {
    if (renderTask) {
      try { renderTask.cancel(); } catch { /* ignore */ }
      renderTask = null;
    }
    canvas.width = 0;
    canvas.height = 0;
    textLayerDiv.innerHTML = '';
  }

  return { root, render, destroy };
}
