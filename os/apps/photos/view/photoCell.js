/**
 * photos/view/photoCell.js — single hex-clipped photo tile.
 *
 * Stateless renderer. Caller passes the photo + click callback.
 * `isActive` highlights the current selection in the grid.
 */

import { el } from '../../../utils/dom.js';

export function buildPhotoCell(photo, { onSelect, isActive } = {}) {
  const cell = el('div', {
    class: `lb-cell${isActive ? ' is-active' : ''}`,
    'data-path': photo.path,
    role: 'button',
    tabindex: '0',
    title: photo.displayName || photo.name,
  });

  // Use thumbnail when available — cheaper to render multiple tiles
  // off the same source list than rasterizing full data URLs each time.
  const src = photo.thumbnail || photo.dataUrl;
  if (src) {
    cell.style.backgroundImage = `url("${escapeAttr(src)}")`;
  }

  if (photo.favorite) {
    cell.appendChild(el('span', { class: 'lb-cell-fav', title: 'Favorite' }, '♥'));
  }

  const trigger = () => onSelect?.(photo.path);
  cell.addEventListener('click', trigger);
  cell.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      trigger();
    }
  });

  return cell;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '\\"');
}
