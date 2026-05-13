/**
 * pdf/v3/render/notePipsRender.js — render sticky-note pips inside a
 * .pdf-page element.
 *
 * Pips are positioned with percentage left/top from each note's
 * fractional (x, y). They're regular HTML buttons appended to the page
 * (not the SVG annotation layer) so clicks route cleanly.
 *
 * Each call strips any previous `.pdf-note-pip` children and appends a
 * fresh set.
 *
 * Interaction model:
 *   - Click (no movement) → onPipClick(note, pipRect) — opens editor.
 *   - Pointer-drag        → re-positions the pip in real time; on
 *                           release the new fractional coords are
 *                           passed to onPipDragEnd(note, fx, fy).
 *   A 5-px movement threshold separates click from drag, so a
 *   slightly-jittery click still opens the editor.
 *
 * Target size: ≤ 140 lines.
 */

import { el } from '../../../../utils/dom.js';

const DRAG_THRESHOLD = 5;   // px

export function renderNotePips(pageEl, notes, { onPipClick, onPipDragEnd } = {}) {
  if (!pageEl) return;
  // Remove any pre-existing pips so we always render a fresh set.
  for (const old of pageEl.querySelectorAll(':scope > .pdf-note-pip')) old.remove();
  if (!Array.isArray(notes) || !notes.length) return;
  for (const n of notes) {
    const x = Math.max(0, Math.min(1, Number(n.x) || 0));
    const y = Math.max(0, Math.min(1, Number(n.y) || 0));
    const pip = el('button', {
      type: 'button',
      class: `pdf-note-pip pdf-note-${n.color || 'warm'}`,
      'data-note-id': String(n.id),
      title: 'Click to edit · drag to move',
      'aria-label': `Note on page ${n.page}`,
      style: { left: `${x * 100}%`, top: `${y * 100}%` },
    });
    pip.textContent = '✎';
    attachPipInteraction(pip, pageEl, n, { onPipClick, onPipDragEnd });
    pageEl.appendChild(pip);
  }
}

function attachPipInteraction(pip, pageEl, note, { onPipClick, onPipDragEnd } = {}) {
  pip.addEventListener('pointerdown', (ev) => {
    // Left-button only for mouse; touch and pen have no button to gate on.
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();

    const startClientX = ev.clientX;
    const startClientY = ev.clientY;

    // Preserve the grab offset so the pip doesn't snap-jump under the
    // cursor — the cursor stays at the same relative point on the pip
    // throughout the drag.
    const pipRectAtDown = pip.getBoundingClientRect();
    const pipCenterX = pipRectAtDown.left + pipRectAtDown.width / 2;
    const pipCenterY = pipRectAtDown.top + pipRectAtDown.height / 2;
    const grabOffsetX = startClientX - pipCenterX;
    const grabOffsetY = startClientY - pipCenterY;

    let dragging = false;
    let lastFx = (Number(note.x) || 0);
    let lastFy = (Number(note.y) || 0);

    try { pip.setPointerCapture(ev.pointerId); } catch { /* best-effort */ }

    function onMove(e) {
      if (e.pointerId !== ev.pointerId) return;
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      if (!dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        dragging = true;
        pip.classList.add('is-dragging');
      }
      if (!dragging) return;
      // Recompute the page rect each move — the user might scroll the
      // stage mid-drag, shifting the page on screen.
      const pageRect = pageEl.getBoundingClientRect();
      if (pageRect.width <= 0 || pageRect.height <= 0) return;
      const desiredCenterX = e.clientX - grabOffsetX;
      const desiredCenterY = e.clientY - grabOffsetY;
      lastFx = Math.max(0, Math.min(1, (desiredCenterX - pageRect.left) / pageRect.width));
      lastFy = Math.max(0, Math.min(1, (desiredCenterY - pageRect.top) / pageRect.height));
      pip.style.left = `${lastFx * 100}%`;
      pip.style.top = `${lastFy * 100}%`;
    }

    function cleanup() {
      pip.removeEventListener('pointermove', onMove);
      pip.removeEventListener('pointerup', onUp);
      pip.removeEventListener('pointercancel', onCancel);
      try { pip.releasePointerCapture(ev.pointerId); } catch { /* best-effort */ }
    }
    function onUp(e) {
      if (e.pointerId !== ev.pointerId) return;
      cleanup();
      if (dragging) {
        pip.classList.remove('is-dragging');
        onPipDragEnd?.(note, lastFx, lastFy);
      } else {
        const rect = pip.getBoundingClientRect();
        onPipClick?.(note, rect);
      }
    }
    function onCancel(e) {
      if (e.pointerId !== ev.pointerId) return;
      cleanup();
      if (dragging) {
        pip.classList.remove('is-dragging');
        // Revert the inline position to the note's stored coords.
        const fx = Math.max(0, Math.min(1, Number(note.x) || 0));
        const fy = Math.max(0, Math.min(1, Number(note.y) || 0));
        pip.style.left = `${fx * 100}%`;
        pip.style.top = `${fy * 100}%`;
      }
    }

    pip.addEventListener('pointermove', onMove);
    pip.addEventListener('pointerup', onUp);
    pip.addEventListener('pointercancel', onCancel);
  });
}

export function clearNotePips(pageEl) {
  if (!pageEl) return;
  for (const old of pageEl.querySelectorAll(':scope > .pdf-note-pip')) old.remove();
}
