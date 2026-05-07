/**
 * notes/view/star.js — single hex-star portal for one note.
 *
 * Variants by status:
 *   anchor    — bright cyan glow, larger core
 *   idea      — violet
 *   draft     — warm/amber
 *   done      — faded
 *   (default) — accent teal
 *
 * Pinned notes get the "anchor" visual class regardless of status.
 */

import { el } from '../../../utils/dom.js';

function variantClass(meta = {}) {
  if (meta.pinned) return 'is-anchor';
  if (meta.status === 'anchor')   return 'is-anchor';
  if (meta.status === 'idea')     return 'is-idea';
  if (meta.status === 'draft')    return 'is-draft';
  if (meta.status === 'done')     return 'is-done';
  return '';
}

export function buildStar(note, { onSelect, isSelected }) {
  const meta = note.meta || {};
  const cls = ['nc-star', variantClass(meta), isSelected ? 'is-selected' : ''].filter(Boolean).join(' ');
  const root = el('div', {
    class: cls,
    'data-note-path': note.path,
    style: { left: `${meta.x}%`, top: `${meta.y}%` },
    title: note.title,
    role: 'button',
    tabindex: '0',
  });

  // Hex core. Anchor notes get a larger core + initials/glyph; smaller
  // notes are just hex shapes (label sits beneath).
  const isAnchor = meta.pinned || meta.status === 'anchor';
  const core = el('div', { class: 'nc-star-core' });
  const initial = (note.title || 'N').trim().slice(0, isAnchor ? 2 : 1);
  if (isAnchor) core.textContent = initial.toLowerCase();
  root.appendChild(core);

  const ttl = el('span', { class: 'nc-star-ttl' }, note.title || 'Untitled');
  root.appendChild(ttl);

  const trigger = () => onSelect?.(note.path);
  root.addEventListener('click', trigger);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      trigger();
    }
  });

  return root;
}
