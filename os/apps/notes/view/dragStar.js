/**
 * notes/view/dragStar.js — pointer-drag handler for hex stars.
 *
 * Attaches pointerdown / move / up listeners that translate the
 * star while dragging and commit the new % coords through `onMove`
 * on release. Keeps clicks intact: a tap that doesn't cross the
 * 4px movement threshold falls through to the star's click handler.
 *
 * Deliberately does NOT call setPointerCapture — that swallows the
 * synthesized click event in Chrome when the listener is attached
 * via event delegation on a parent (we hit this in the Browser app).
 */

const DRAG_THRESHOLD_PX = 4;

export function attachStarDrag(starEl, note, stageEl, { onMove } = {}) {
  let startClientX = 0;
  let startClientY = 0;
  let stageRect = null;
  let isDragging = false;
  let didDrag = false;
  let suppressNextClick = false;

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    didDrag = false;
    startClientX = e.clientX;
    startClientY = e.clientY;
    stageRect = stageEl.getBoundingClientRect();
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
    document.addEventListener('pointercancel', onPointerCancel, { once: true });
  };

  const onPointerMove = (e) => {
    if (!isDragging || !stageRect) return;
    const dx = e.clientX - startClientX;
    const dy = e.clientY - startClientY;
    if (!didDrag && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!didDrag) {
      didDrag = true;
      starEl.classList.add('is-dragging');
    }
    // Compute new % coords from current pointer pos within the stage.
    const px = clampPct(((e.clientX - stageRect.left) / stageRect.width) * 100);
    const py = clampPct(((e.clientY - stageRect.top) / stageRect.height) * 100);
    starEl.style.left = `${px}%`;
    starEl.style.top = `${py}%`;
  };

  const onPointerUp = (e) => {
    document.removeEventListener('pointermove', onPointerMove);
    if (!didDrag) {
      cleanupAfterRelease();
      return;
    }
    starEl.classList.remove('is-dragging');
    suppressNextClick = true;
    // Suppress the click that follows a drag-up.
    starEl.addEventListener('click', killOnce, { once: true, capture: true });
    if (stageRect) {
      const px = clampPct(((e.clientX - stageRect.left) / stageRect.width) * 100);
      const py = clampPct(((e.clientY - stageRect.top) / stageRect.height) * 100);
      onMove?.(note.path, px, py);
    }
    cleanupAfterRelease();
  };

  const onPointerCancel = () => {
    document.removeEventListener('pointermove', onPointerMove);
    starEl.classList.remove('is-dragging');
    // Snap visual back to original position (NotesApp will re-render
    // on the next dispatch anyway, but be explicit so users see it).
    starEl.style.left = `${note.meta.x}%`;
    starEl.style.top = `${note.meta.y}%`;
    cleanupAfterRelease();
  };

  function killOnce(e) {
    if (!suppressNextClick) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    suppressNextClick = false;
  }

  function cleanupAfterRelease() {
    isDragging = false;
    stageRect = null;
  }

  starEl.addEventListener('pointerdown', onPointerDown);

  return () => {
    starEl.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
  };
}

function clampPct(n) {
  if (!Number.isFinite(n)) return 50;
  if (n < 4) return 4;
  if (n > 96) return 96;
  return n;
}
