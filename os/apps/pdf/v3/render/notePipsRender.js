/**
 * pdf/v3/render/notePipsRender.js — render sticky-note pips inside a
 * .pdf-page element.
 *
 * Pips are positioned with percentage left/top from each note's
 * fractional (x, y). They're regular HTML buttons appended to the page
 * (not the SVG annotation layer) so clicks route cleanly.
 *
 * Each call strips any previous `.pdf-note-pip` children and appends a
 * fresh set. onPipClick is invoked with the note record + the pip's
 * bounding rect so the popover can anchor against it.
 *
 * Target size: ≤ 80 lines.
 */

import { el } from '../../../../utils/dom.js';

export function renderNotePips(pageEl, notes, { onPipClick } = {}) {
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
      title: 'Edit note',
      'aria-label': `Edit note on page ${n.page}`,
      style: { left: `${x * 100}%`, top: `${y * 100}%` },
    });
    pip.textContent = '✎';
    pip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = pip.getBoundingClientRect();
      onPipClick?.(n, rect);
    });
    // Also stop pointerdown so the note tool doesn't try to place
    // a new note at the same spot when the user clicks an existing pip.
    pip.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    pageEl.appendChild(pip);
  }
}

export function clearNotePips(pageEl) {
  if (!pageEl) return;
  for (const old of pageEl.querySelectorAll(':scope > .pdf-note-pip')) old.remove();
}
