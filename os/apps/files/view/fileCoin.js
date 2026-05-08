/**
 * files/view/fileCoin.js — single hex coin for a file.
 *
 * Smaller than a folder cell; shows category-styled body + extension
 * pip + truncated display name. Draggable for coin-to-cell file move.
 */

import { el } from '../../../utils/dom.js';

export function buildFileCoin(item, { onSelect, isSelected } = {}) {
  const cls = ['fv-coin', isSelected ? 'is-selected' : '',
    `fv-coin-${item.category || 'other'}`].filter(Boolean).join(' ');
  const root = el('div', {
    class: cls,
    'data-file-path': item.path,
    title: item.name,
    role: 'button',
    tabindex: '0',
    draggable: 'true',
  });

  const ext = item.ext ? '.' + item.ext : '·';
  root.append(
    el('span', { class: 'fv-coin-ext' }, ext),
    el('span', { class: 'fv-coin-nm' }, item.displayName || item.name || 'file'),
  );

  if (item.x != null && item.y != null) {
    root.style.left = `${item.x}px`;
    root.style.top = `${item.y}px`;
  }

  const trigger = () => onSelect?.(item);
  root.addEventListener('click', trigger);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      trigger();
    }
  });

  // Drag source for coin-to-cell file move (PR-3 wires the drop side).
  root.addEventListener('dragstart', (e) => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/yancotab-fs-path', item.path);
      e.dataTransfer.setData('text/plain', item.path);
    }
    root.classList.add('is-dragging');
  });
  root.addEventListener('dragend', () => root.classList.remove('is-dragging'));

  return root;
}
