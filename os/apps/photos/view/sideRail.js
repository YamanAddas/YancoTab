/**
 * photos/view/sideRail.js — left rail of the Lightbox.
 *
 * Library section: All photos / Favorites / Recently added.
 * Each item shows a count chip on the right.
 *
 * The mock includes Albums / Faces / Places sections; we don't ship
 * those in v1 because:
 *   - Albums require a new fs concept (subdirectories under /home/photos)
 *   - Faces would need on-device ML we don't ship
 *   - Places would need GPS extraction + reverse-geocoding
 * Showing fake clusters would be misleading. They land when the
 * underlying capabilities do.
 */

import { el } from '../../../utils/dom.js';

const LIBRARY_DEFS = [
  { id: 'all',       label: 'All photos',       hue: 'accent' },
  { id: 'favorites', label: 'Favorites',        hue: 'rose' },
  { id: 'recent',    label: 'Recently added',   hue: 'violet' },
];

function hueColor(hue) {
  switch (hue) {
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'cool':   return 'var(--cool, #5aa8ff)';
    default:       return 'var(--accent, #00e5c1)';
  }
}

export function buildSideRail({ onPickSmart } = {}) {
  const root = el('aside', { class: 'lb-side' });

  const libHead = el('h4', { class: 'lb-side-h' }, 'LIBRARY');
  const libList = el('div', { class: 'lb-side-list' });

  root.append(libHead, libList);

  return {
    root,
    update(counts, filter) {
      libList.innerHTML = '';
      const f = filter || {};
      for (const def of LIBRARY_DEFS) {
        const isActive = (f.smart || 'all') === def.id;
        const item = el('button', {
          type: 'button',
          class: `lb-side-item${isActive ? ' is-active' : ''}`,
          'data-smart': def.id,
        }, [
          el('i', { class: 'lb-side-hex', style: { background: hueColor(def.hue) } }),
          el('span', { class: 'lb-side-item-label' }, def.label),
          el('span', { class: 'lb-side-item-count' }, String((counts && counts[def.id]) || 0)),
        ]);
        item.addEventListener('click', () => onPickSmart?.(def.id));
        libList.appendChild(item);
      }
    },
  };
}
