/**
 * pdf/v3/tools/inkTool.js — freehand ink drawing tool.
 *
 * Pointer-event lifecycle:
 *   pointerdown   → start new stroke; capture pointer
 *   pointermove   → append sample to live buffer; update preview path
 *   pointerup     → commit stroke as 'ink' annotation; clear preview
 *   pointercancel → discard the in-progress stroke (no commit)
 *
 * Sample storage is fractional coordinates (0..1 of the page's
 * intrinsic dimensions) so strokes stay anchored across zoom and
 * rotation.
 *
 * Target size: ≤ 300 lines.
 */

import { buildPathFromFractional, decimateFractional } from '../render/inkRender.js';
import { svgNS } from '../render/annotationLayer.js';

const NS = svgNS();

export function createInkTool({
  getStripRoot,           // returns the stage's strip root for delegation scope
  getPageLayer,           // (pageEl) → annotation layer api
  getActiveColor,         // () → 'red' | 'orange' | …
  getActiveWidth,         // () → number (page-px stroke width)
  onCommit,               // ({page, points, color, width}) → Promise<void>
} = {}) {
  let active = false;
  let strokeState = null;   // { pageEl, layerApi, samples: [[fx,fy]], pointerId }

  function setActive(on) {
    active = !!on;
    if (!active) cancelStroke();
  }

  function isActive() { return active; }

  function onPointerDown(e) {
    if (!active || e.button !== 0) return;
    const pageEl = pageElFromEvent(e);
    if (!pageEl) return;
    const layerApi = getPageLayer?.(pageEl);
    if (!layerApi) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.target.setPointerCapture?.(e.pointerId); } catch { /* best-effort */ }
    strokeState = {
      pageEl,
      layerApi,
      samples: [pointerToFractional(e, pageEl)],
      pointerId: e.pointerId,
      color: getActiveColor?.() || 'red',
      width: getActiveWidth?.() || 2,
    };
    drawPreview();
  }

  function onPointerMove(e) {
    if (!strokeState || e.pointerId !== strokeState.pointerId) return;
    const next = pointerToFractional(e, strokeState.pageEl);
    strokeState.samples.push(next);
    drawPreview();
  }

  async function onPointerUp(e) {
    if (!strokeState || e.pointerId !== strokeState.pointerId) return;
    const state = strokeState;
    strokeState = null;
    state.layerApi.clearPreview();
    // Decimate before commit to keep storage compact.
    const points = decimateFractional(state.samples, 0.002);
    if (points.length < 2) return;     // ignore tap-no-drag
    const pageEl = state.pageEl;
    const pageNum = Number(pageEl.dataset?.page) || pageNumberFromEl(pageEl);
    if (!Number.isFinite(pageNum)) return;
    try {
      await onCommit?.({
        page: pageNum,
        points,
        color: state.color,
        width: state.width,
      });
    } catch (err) {
      console.warn('[pdf-v3 ink] commit failed:', err);
    }
  }

  function onPointerCancel(e) {
    if (!strokeState || (e && e.pointerId !== strokeState.pointerId)) return;
    cancelStroke();
  }

  function cancelStroke() {
    if (!strokeState) return;
    strokeState.layerApi?.clearPreview?.();
    strokeState = null;
  }

  function drawPreview() {
    if (!strokeState || !strokeState.layerApi) return;
    const vb = strokeState.layerApi.getViewBox();
    const d = buildPathFromFractional(strokeState.samples, vb.w, vb.h);
    if (!d) return;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', `pdf-ann-ink pdf-ann-color-${strokeState.color}`);
    path.setAttribute('stroke-width', String(strokeState.width));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    strokeState.layerApi.setPreview(path);
  }

  // ── Helpers ──

  function pointerToFractional(e, pageEl) {
    const r = pageEl.getBoundingClientRect();
    const fx = clamp01((e.clientX - r.left) / r.width);
    const fy = clamp01((e.clientY - r.top) / r.height);
    return [fx, fy];
  }

  function pageElFromEvent(e) {
    let n = e.target;
    while (n && n !== document) {
      if (n.nodeType === 1 && n.classList?.contains('pdf-page')) return n;
      n = n.parentNode;
    }
    return null;
  }

  function pageNumberFromEl(pageEl) {
    const ds = pageEl?.dataset?.page;
    return ds ? Number(ds) : null;
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  return {
    setActive,
    isActive,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    cancelStroke,
  };
}
