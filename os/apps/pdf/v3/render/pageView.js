/**
 * pdf/v3/render/pageView.js — render a single PDF page + build the
 * pageTextIndex used for offset-range highlighting.
 *
 * Differences from v2's pageView:
 *   - Builds (and caches per-page) a flat-text index alongside the
 *     pdf.js TextLayer render.
 *   - Exposes the index via getIndex() so the orchestrator can
 *     translate selections → flat offsets and translate stored
 *     highlights → DOM Ranges.
 *   - DOM classes use the `pdf-` prefix instead of `cx-` so v2 and v3
 *     CSS don't collide.
 *
 * Target size: ≤ 350 lines.
 */

import { el } from '../../../../utils/dom.js';
import { buildPageTextIndex } from '../select/pageTextIndex.js';
import { buildAnnotationLayer } from './annotationLayer.js';

let pdfjsLib = null;
export function setPdfJsModule(mod) { pdfjsLib = mod; }

const DPR_CAP = 2;

export function buildPageView() {
  const root = el('div', { class: 'pdf-page' });
  const canvas = document.createElement('canvas');
  canvas.className = 'pdf-page-canvas';
  const textLayerDiv = el('div', { class: 'pdf-textlayer' });
  const pageNum = el('div', { class: 'pdf-page-num' });
  const empty = el('div', { class: 'pdf-page-empty' }, '—');

  // The annotation layer is created lazily on first render, when we
  // know the page's intrinsic dimensions.
  let annLayerApi = null;

  root.append(canvas, textLayerDiv, pageNum, empty);

  let renderTask = null;
  let textLayerTask = null;
  let lastRenderedKey = null;
  let pageTextIndex = null;

  function showEmpty(v) {
    canvas.style.display = v ? 'none' : '';
    textLayerDiv.style.display = v ? 'none' : '';
    pageNum.style.display = v ? 'none' : '';
    empty.style.display = v ? 'flex' : 'none';
  }
  showEmpty(true);

  async function render(pdfPage, { cssWidth, label, rotation = 0, pageNum: pageNumOverride } = {}) {
    if (!pdfPage || !cssWidth || cssWidth <= 0) { showEmpty(true); return; }
    if (!pdfjsLib) throw new Error('pdfjs module not set');

    if (renderTask) {
      const old = renderTask;
      renderTask = null;
      try { old.cancel(); } catch { /* best-effort */ }
      try { await old.promise; } catch { /* best-effort cancellation */ }
    }
    if (textLayerTask) { try { textLayerTask.cancel(); } catch { /* best-effort */ } textLayerTask = null; }

    const rot = ((Number(rotation) || 0) + 360) % 360;
    const baseVp = pdfPage.getViewport({ scale: 1, rotation: rot });
    const scale = cssWidth / baseVp.width;
    const viewport = pdfPage.getViewport({ scale, rotation: rot });

    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const key = `${pdfPage.pageNumber}@${cssWidth.toFixed(1)}@${dpr}@r${rot}`;
    if (key === lastRenderedKey) return;
    lastRenderedKey = key;

    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;
    root.style.width = `${viewport.width}px`;
    root.style.height = `${viewport.height}px`;

    showEmpty(false);
    const num = Number.isFinite(pageNumOverride) ? pageNumOverride : pdfPage.pageNumber;
    if (Number.isFinite(num)) root.dataset.page = String(num);
    pageNum.textContent = label || `— ${num} —`;

    // Build / refresh the annotation layer at the page's INTRINSIC
    // viewport (zoom 1.0) so stored fractional coords are stable.
    const intrinsicVp = pdfPage.getViewport({ scale: 1, rotation: rot });
    if (!annLayerApi) {
      annLayerApi = buildAnnotationLayer({
        viewBoxWidth: intrinsicVp.width,
        viewBoxHeight: intrinsicVp.height,
      });
      root.appendChild(annLayerApi.root);
    }

    const ctx = canvas.getContext('2d');
    const renderTransform = dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0];
    renderTask = pdfPage.render({
      canvasContext: ctx, viewport,
      ...(renderTransform ? { transform: renderTransform } : {}),
    });
    try {
      await renderTask.promise;
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') {
        console.error('[pdf-v3] page render failed:', e);
        throw e;
      }
      renderTask = null;
      return;
    }
    renderTask = null;

    // Text layer. We need both the rendered <span>s AND the pageTextIndex.
    // The cheapest way: call pdfPage.getTextContent() ourselves to build
    // the index, and pass the SAME content into pdfjsLib.TextLayer via
    // textContentSource. pdf.js v4 accepts either a stream or a literal
    // content object — passing the object form keeps our index and the
    // DOM spans byte-identical (no re-extraction).
    textLayerDiv.innerHTML = '';
    let textContent = null;
    try {
      textContent = await pdfPage.getTextContent({ includeMarkedContent: false });
    } catch (e) {
      console.warn('[pdf-v3] getTextContent failed:', e);
    }

    if (textContent) {
      pageTextIndex = buildPageTextIndex(textContent);
    } else {
      pageTextIndex = { flat: '', spans: [] };
    }

    if (textContent && typeof pdfjsLib.TextLayer === 'function') {
      const task = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
      });
      textLayerTask = task;
      try {
        await task.render();
      } catch (e) {
        if (e?.name !== 'AbortException') console.warn('[pdf-v3] text layer:', e);
      } finally {
        if (textLayerTask === task) textLayerTask = null;
      }
    }
  }

  function destroy() {
    if (renderTask) { try { renderTask.cancel(); } catch { /* best-effort */ } renderTask = null; }
    if (textLayerTask) { try { textLayerTask.cancel(); } catch { /* best-effort */ } textLayerTask = null; }
    canvas.width = 0;
    canvas.height = 0;
    textLayerDiv.innerHTML = '';
    if (annLayerApi) {
      annLayerApi.root.remove();
      annLayerApi = null;
    }
    pageTextIndex = null;
  }

  function getIndex() { return pageTextIndex; }
  function getTextLayer() { return textLayerDiv; }
  function getAnnotationLayer() { return annLayerApi; }

  return { root, render, destroy, getIndex, getTextLayer, getAnnotationLayer };
}
