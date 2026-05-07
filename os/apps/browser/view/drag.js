/**
 * browser/view/drag.js — pointer-event drag for portals.
 *
 *   • Drag threshold: 6px movement OR 150ms hold (so click-to-open
 *     still works).
 *   • While dragging: position the portal absolutely via inline
 *     style so it follows the cursor without a state round-trip.
 *   • On drop:
 *       — if cursor is over another portal's hex (≤ 70px center
 *         distance), call onMerge(draggedId, targetId)
 *       — otherwise, snap to a percent coord and call onMove(id, x%, y%)
 *   • On cancel: revert to the original transform.
 */

const DRAG_THRESHOLD_PX = 6;
const DRAG_THRESHOLD_MS = 150;
const MERGE_RADIUS_PX = 70;

export function attachDragHandlers(root, { getBookmarks, onMove, onMerge }) {
  let active = null;

  function pointerDown(e) {
    if (e.button !== 0) return;
    const portal = e.target.closest('.wh-portal');
    if (!portal) return;
    const id = portal.dataset.bookmarkId;
    if (!id) return;
    active = {
      id,
      portal,
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      moved: false,
      origLeft: portal.style.left,
      origTop: portal.style.top,
      pointerId: e.pointerId,
    };
    try { portal.setPointerCapture?.(e.pointerId); } catch { /* synthetic events can't capture */ }
  }

  function pointerMove(e) {
    if (!active || e.pointerId !== active.pointerId) return;
    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;
    const distance = Math.hypot(dx, dy);
    const elapsed = Date.now() - active.startTime;
    if (!active.moved) {
      if (distance < DRAG_THRESHOLD_PX && elapsed < DRAG_THRESHOLD_MS) return;
      active.moved = true;
      active.portal.classList.add('is-dragging');
    }
    // Position by cursor (relative to root).
    const rect = root.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    active.portal.style.left = `${clamp01(px)}%`;
    active.portal.style.top = `${clamp01(py)}%`;
    // Highlight a potential merge target.
    const target = findPortalAt(e.clientX, e.clientY, root, active.id);
    root.querySelectorAll('.wh-portal.is-merge-target').forEach((p) => p.classList.remove('is-merge-target'));
    if (target) target.classList.add('is-merge-target');
  }

  function pointerUp(e) {
    if (!active || e.pointerId !== active.pointerId) return;
    const a = active;
    active = null;
    a.portal.classList.remove('is-dragging');
    root.querySelectorAll('.wh-portal.is-merge-target').forEach((p) => p.classList.remove('is-merge-target'));
    try { a.portal.releasePointerCapture?.(e.pointerId); } catch { /* synthetic events can't capture */ }

    if (!a.moved) return; // Plain click — let onclick fire.
    e.preventDefault();
    e.stopPropagation();

    const target = findPortalAt(e.clientX, e.clientY, root, a.id);
    if (target) {
      const targetId = target.dataset.bookmarkId;
      if (typeof onMerge === 'function' && targetId) {
        onMerge(a.id, targetId);
        return;
      }
    }
    const rect = root.getBoundingClientRect();
    const px = clamp01(((e.clientX - rect.left) / rect.width) * 100);
    const py = clamp01(((e.clientY - rect.top) / rect.height) * 100);
    if (typeof onMove === 'function') onMove(a.id, px, py);
  }

  function pointerCancel(e) {
    if (!active || e.pointerId !== active.pointerId) return;
    const a = active;
    active = null;
    a.portal.classList.remove('is-dragging');
    a.portal.style.left = a.origLeft;
    a.portal.style.top = a.origTop;
    root.querySelectorAll('.wh-portal.is-merge-target').forEach((p) => p.classList.remove('is-merge-target'));
  }

  // Wire on the root so we don't have to re-bind on every render.
  root.addEventListener('pointerdown', pointerDown);
  root.addEventListener('pointermove', pointerMove);
  root.addEventListener('pointerup', pointerUp);
  root.addEventListener('pointercancel', pointerCancel);

  void getBookmarks; // reserved — could be used for finer hit-testing later
  return () => {
    root.removeEventListener('pointerdown', pointerDown);
    root.removeEventListener('pointermove', pointerMove);
    root.removeEventListener('pointerup', pointerUp);
    root.removeEventListener('pointercancel', pointerCancel);
  };
}

function findPortalAt(clientX, clientY, root, excludeId) {
  // Find the closest portal hex within MERGE_RADIUS_PX.
  let best = null;
  let bestDist = Infinity;
  for (const portal of root.querySelectorAll('.wh-portal')) {
    if (portal.dataset.bookmarkId === excludeId) continue;
    const hex = portal.querySelector('.wh-portal-hex');
    if (!hex) continue;
    const r = hex.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = Math.hypot(cx - clientX, cy - clientY);
    if (d < bestDist && d <= MERGE_RADIUS_PX) {
      bestDist = d;
      best = portal;
    }
  }
  return best;
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 50;
  if (n < 2) return 2;
  if (n > 98) return 98;
  return n;
}
