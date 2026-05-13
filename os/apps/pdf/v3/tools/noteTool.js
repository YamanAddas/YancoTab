/**
 * pdf/v3/tools/noteTool.js — click-to-place sticky note.
 *
 * On pointerup inside a .pdf-page, computes fractional (x, y) coords
 * from the click position vs the page bounding rect, then fires
 * onPlace({page, x, y, clientX, clientY}). The reader then opens the
 * note popover at that screen position to capture the body text.
 *
 * Pointermove / pointerdown are accepted but pointerup is the trigger
 * — this matches Adobe's behavior where a click (not a drag) places.
 *
 * Target size: ≤ 90 lines.
 */

const DRAG_THRESHOLD = 6;  // px — beyond this, treat as drag, not place

export function createNoteTool({ onPlace } = {}) {
  let active = false;
  let down = null;   // { x, y, page, pageEl } at pointerdown

  function setActive(on) {
    active = !!on;
    if (!active) down = null;
  }

  function findPage(target) {
    if (!target?.closest) return null;
    return target.closest('.pdf-page');
  }

  function pageNumber(pageEl) {
    const n = Number(pageEl?.dataset?.page);
    return Number.isFinite(n) ? n : null;
  }

  function onPointerDown(e) {
    if (!active) return;
    if (e.button !== undefined && e.button !== 0) return;
    const pageEl = findPage(e.target);
    if (!pageEl) return;
    const page = pageNumber(pageEl);
    if (page == null) return;
    down = {
      x: e.clientX, y: e.clientY,
      pageEl, page,
    };
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!active || !down) return;
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (!active || !down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    const wasDrag = Math.hypot(dx, dy) > DRAG_THRESHOLD;
    const local = down;
    down = null;
    if (wasDrag) return;   // ignore drag attempts; require a clean click
    const r = local.pageEl.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
    onPlace?.({
      page: local.page,
      x: fx, y: fy,
      clientX: e.clientX, clientY: e.clientY,
    });
  }

  function onPointerCancel() {
    down = null;
  }

  return {
    setActive,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
