/**
 * pdf/v3/tools/shapeTool.js — rectangle / ellipse / arrow / line tool.
 *
 * Pointer lifecycle:
 *   down → record start point on the page
 *   move → update live-preview shape from start → current
 *   up   → commit annotation with the final geometry
 *   cancel → discard
 *
 * Shape choice + style come from the shape sub-toolbar's getters.
 *
 * Shift modifier: snaps line/arrow to 15° increments, rect/ellipse to
 * 1:1 aspect ratio.
 *
 * Target size: ≤ 250 lines.
 */

import { buildShapePreview } from '../render/shapeRender.js';

export function createShapeTool({
  getStripRoot,
  getPageLayer,
  getActiveShape,    // () → 'rect' | 'ellipse' | 'arrow' | 'line'
  getActiveColor,
  getActiveWidth,
  getActiveFill,     // () → 'none' | '<color>'
  getActiveDash,     // () → 'solid' | 'dashed' | 'dotted'
  onCommit,
} = {}) {
  let active = false;
  let drag = null;

  function setActive(on) {
    active = !!on;
    if (!active) cancel();
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
    const start = pointerToViewBox(e, pageEl, layerApi);
    drag = {
      pageEl, layerApi,
      pointerId: e.pointerId,
      shape: getActiveShape?.() || 'rect',
      color: getActiveColor?.() || 'red',
      width: getActiveWidth?.() || 2,
      fill: getActiveFill?.() || 'none',
      dash: getActiveDash?.() || 'solid',
      startX: start.x,
      startY: start.y,
      curX: start.x,
      curY: start.y,
      shiftDown: !!e.shiftKey,
    };
    drawPreview();
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const cur = pointerToViewBox(e, drag.pageEl, drag.layerApi);
    drag.curX = cur.x;
    drag.curY = cur.y;
    drag.shiftDown = !!e.shiftKey;
    drawPreview();
  }

  async function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const state = drag;
    drag = null;
    state.layerApi.clearPreview();
    const vb = state.layerApi.getViewBox();
    // Apply shift snap one last time before commit.
    const final = applyShiftSnap(state);
    const w = (final.curX - state.startX) / vb.w;
    const h = (final.curY - state.startY) / vb.h;
    // Reject tiny drags (single-tap with no real drag).
    if (Math.abs(w) * vb.w < 4 && Math.abs(h) * vb.h < 4) return;
    const pageNum = Number(state.pageEl?.dataset?.page);
    if (!Number.isFinite(pageNum)) return;
    try {
      await onCommit?.({
        page: pageNum,
        shape: state.shape,
        x: state.startX / vb.w,
        y: state.startY / vb.h,
        w, h,
        color: state.color,
        width: state.width,
        fill: state.fill,
        dash: state.dash,
      });
    } catch (err) {
      console.warn('[pdf-v3 shape] commit failed:', err);
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
    const final = applyShiftSnap(drag);
    const node = buildShapePreview({
      shape: drag.shape,
      startX: drag.startX,
      startY: drag.startY,
      curX: final.curX,
      curY: final.curY,
      color: drag.color,
      width: drag.width,
      fill: drag.fill,
      dash: drag.dash,
    }, vb.w, vb.h);
    drag.layerApi.setPreview(node);
  }

  /** Apply shift-snap rules. Mutates a copy and returns it. */
  function applyShiftSnap(state) {
    if (!state.shiftDown) return state;
    const dx = state.curX - state.startX;
    const dy = state.curY - state.startY;
    if (state.shape === 'line' || state.shape === 'arrow') {
      // Snap angle to 15°.
      const angle = Math.atan2(dy, dx);
      const step = Math.PI / 12; // 15°
      const snapped = Math.round(angle / step) * step;
      const len = Math.sqrt(dx * dx + dy * dy);
      return {
        ...state,
        curX: state.startX + Math.cos(snapped) * len,
        curY: state.startY + Math.sin(snapped) * len,
      };
    }
    // Rect / ellipse: 1:1 aspect.
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      ...state,
      curX: state.startX + Math.sign(dx || 1) * side,
      curY: state.startY + Math.sign(dy || 1) * side,
    };
  }

  // ── Helpers ──

  function pointerToViewBox(e, pageEl, layerApi) {
    const r = pageEl.getBoundingClientRect();
    const vb = layerApi.getViewBox();
    const fx = clamp01((e.clientX - r.left) / r.width);
    const fy = clamp01((e.clientY - r.top) / r.height);
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

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  return {
    setActive,
    isActive,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    cancel,
  };
}
