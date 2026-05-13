/**
 * pdf/v3/tools/handTool.js — pan-scroll tool (Adobe's "hand" / grab).
 *
 * On pointerdown, captures the pointer and the starting (clientX/Y,
 * scrollLeft/Top). On pointermove, scrolls the stage so the cursor
 * appears to drag the document. On pointerup/cancel, releases.
 *
 * No commit — purely a viewport gesture. Coexists with text mode in
 * that activating Hand swaps the active tool to 'hand'; T flips back.
 *
 * Target size: ≤ 120 lines.
 */

export function createHandTool({ getStage } = {}) {
  let active = false;
  let dragging = false;
  let startX = 0, startY = 0;
  let startScrollLeft = 0, startScrollTop = 0;
  let pointerId = null;

  function setActive(on) {
    active = !!on;
    if (!active) cancel();
  }

  function onPointerDown(e) {
    if (!active) return;
    const stage = getStage?.();
    if (!stage) return;
    // Only handle primary button (left-click / single-touch / pen tip).
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    pointerId = e.pointerId ?? null;
    startX = e.clientX;
    startY = e.clientY;
    startScrollLeft = stage.scrollLeft;
    startScrollTop = stage.scrollTop;
    try {
      if (pointerId !== null) e.target?.setPointerCapture?.(pointerId);
    } catch { /* best-effort */ }
    stage.classList.add('is-grabbing');
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!active || !dragging) return;
    const stage = getStage?.();
    if (!stage) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    stage.scrollLeft = startScrollLeft - dx;
    stage.scrollTop = startScrollTop - dy;
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (!dragging) return;
    cancel(e);
  }

  function onPointerCancel(e) {
    cancel(e);
  }

  function cancel(e) {
    dragging = false;
    const stage = getStage?.();
    stage?.classList?.remove('is-grabbing');
    if (e && pointerId !== null) {
      try { e.target?.releasePointerCapture?.(pointerId); }
      catch { /* best-effort */ }
    }
    pointerId = null;
  }

  return {
    setActive,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
