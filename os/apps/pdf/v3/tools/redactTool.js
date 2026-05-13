/**
 * pdf/v3/tools/redactTool.js — rect-select for redaction.
 *
 * Drag-select a rectangle. On commit, creates a `kind: 'redact'`
 * annotation with fractional x/y/w/h. The live preview is a
 * semi-transparent black rectangle so the user can see what's being
 * covered; the persisted overlay (rendered by annotationLayer) is
 * opaque white with a yellow dashed border ("not baked yet" badge).
 *
 * Actual binary redaction happens via the More menu's "Bake redactions"
 * action which calls ops/redactBake.js.
 *
 * Target size: ≤ 180 lines.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_PX = 4;

export function createRedactTool({ getPageLayer, onCommit } = {}) {
  let active = false;
  let drag = null;

  function setActive(on) {
    active = !!on;
    if (!active) cancel();
  }

  function onPointerDown(e) {
    if (!active || e.button !== 0) return;
    const pageEl = pageElFromEvent(e);
    if (!pageEl) return;
    const layerApi = getPageLayer?.(pageEl);
    if (!layerApi) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.target.setPointerCapture?.(e.pointerId); } catch { /* best-effort */ }
    const start = pointerToViewBox(e, pageEl, layerApi);
    drag = {
      pageEl, layerApi,
      pointerId: e.pointerId,
      startX: start.x, startY: start.y,
      curX: start.x,   curY: start.y,
    };
    drawPreview();
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const cur = pointerToViewBox(e, drag.pageEl, drag.layerApi);
    drag.curX = cur.x; drag.curY = cur.y;
    drawPreview();
  }

  async function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const state = drag;
    drag = null;
    state.layerApi.clearPreview();
    const vb = state.layerApi.getViewBox();
    const minX = Math.min(state.startX, state.curX);
    const minY = Math.min(state.startY, state.curY);
    const w = Math.abs(state.curX - state.startX);
    const h = Math.abs(state.curY - state.startY);
    // Reject tiny clicks (no real drag).
    if (w < MIN_PX || h < MIN_PX) return;
    const pageNum = Number(state.pageEl?.dataset?.page);
    if (!Number.isFinite(pageNum)) return;
    try {
      await onCommit?.({
        page: pageNum,
        x: minX / vb.w,
        y: minY / vb.h,
        w: w / vb.w,
        h: h / vb.h,
      });
    } catch (err) {
      console.warn('[pdf-v3 redact] commit failed:', err);
    }
  }

  function onPointerCancel(e) {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    cancel();
  }

  function cancel() {
    if (!drag) return;
    drag.layerApi?.clearPreview?.();
    drag = null;
  }

  function drawPreview() {
    if (!drag) return;
    const vb = drag.layerApi.getViewBox();
    const x = Math.min(drag.startX, drag.curX);
    const y = Math.min(drag.startY, drag.curY);
    const w = Math.abs(drag.curX - drag.startX);
    const h = Math.abs(drag.curY - drag.startY);
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('class', 'pdf-redact-preview');
    rect.setAttribute('fill', 'rgba(0,0,0,0.65)');
    rect.setAttribute('stroke', '#ffde59');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('stroke-dasharray', '4 3');
    drag.layerApi.setPreview(rect);
  }

  function pointerToViewBox(e, pageEl, layerApi) {
    const r = pageEl.getBoundingClientRect();
    const vb = layerApi.getViewBox();
    const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    return { x: fx * vb.w, y: fy * vb.h };
  }

  function pageElFromEvent(e) {
    let n = e.target;
    while (n && n !== document) {
      if (n.nodeType === 1 && n.classList?.contains('pdf-page')) return n;
      n = n.parentNode;
    }
    return null;
  }

  return {
    setActive,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
