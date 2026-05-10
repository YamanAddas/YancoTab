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
  let textLayerTask = null;
  let lastRenderedKey = null;

  function showEmpty(visible) {
    canvas.style.display = visible ? 'none' : '';
    textLayerDiv.style.display = visible ? 'none' : '';
    pageNum.style.display = visible ? 'none' : '';
    empty.style.display = visible ? 'flex' : 'none';
  }

  showEmpty(true);

  async function render(pdfPage, { cssWidth, label, rotation = 0, pageNum: pageNumOverride } = {}) {
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
    if (textLayerTask) {
      try { textLayerTask.cancel(); } catch { /* ignore */ }
      textLayerTask = null;
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
    // pdf.js v4 TextLayer needs --scale-factor on the container so its
    // inline `width: round(var(--scale-factor) * 595px, 1px)` and per-span
    // percentage positioning resolve correctly. Without this, spans render
    // at coordinates totally unrelated to where the canvas drew the glyphs,
    // so visible text has no clickable span underneath it.
    textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;
    root.style.width = `${viewport.width}px`;
    root.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d');

    showEmpty(false);
    // Tag the .cx-page root with the page number so context menus and
    // note-pip layers can locate it without depending on stage-relative
    // index. The override prop wins over pdfPage.pageNumber when set
    // (the spread flow passes it explicitly).
    const num = Number.isFinite(pageNumOverride) ? pageNumOverride : pdfPage.pageNumber;
    if (Number.isFinite(num)) root.dataset.page = String(num);
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

    // Build text layer via pdf.js TextLayer — handles scaleX per glyph
    // so span hit-areas match canvas rendering, making drag-selection accurate.
    textLayerDiv.innerHTML = '';
    if (typeof pdfjsLib.TextLayer === 'function') {
      const task = new pdfjsLib.TextLayer({
        textContentSource: pdfPage.streamTextContent(),
        container: textLayerDiv,
        viewport,
      });
      textLayerTask = task;
      try {
        await task.render();
      } catch (e) {
        if (e?.name !== 'AbortException') console.warn('[Codex] text layer:', e);
      } finally {
        if (textLayerTask === task) textLayerTask = null;
      }
    }

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
    if (textLayerTask) {
      try { textLayerTask.cancel(); } catch { /* ignore */ }
      textLayerTask = null;
    }
    canvas.width = 0;
    canvas.height = 0;
    textLayerDiv.innerHTML = '';
  }

  return { root, render, destroy };
}
