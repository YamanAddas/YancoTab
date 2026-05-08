/**
 * files/view/gridView.js — uncapped square-tile grid.
 *
 * Used when honeycomb's coin cap (14) would hide files. Renders
 * folders + files as small thumbnail tiles with name + meta.
 */

import { el } from '../../../utils/dom.js';
import { iconOf } from '../engine/fileType.js';
import { formatBytes } from '../engine/state.js';

export function buildGridView({ onSelect } = {}) {
  const root = el('div', { class: 'fv-grid' });
  return {
    root,
    update({ items = [], selectedPath = null }) {
      root.innerHTML = '';
      for (const item of items) {
        const isSelected = selectedPath === item.path;
        const tile = el('button', {
          type: 'button',
          class: `fv-tile${isSelected ? ' is-selected' : ''}`,
          'data-path': item.path || '',
          title: item.label || item.name || '',
        });
        const ic = el('div', { class: 'fv-tile-ic' },
          item.isFolder !== false && (item.id || item.isDir) ? '📂' : iconOf(item.name || item.label || ''));
        const name = el('div', { class: 'fv-tile-name' }, item.label || item.name || 'item');
        const meta = el('div', { class: 'fv-tile-meta' },
          item.meta || (Number.isFinite(item.size) ? formatBytes(item.size) : ''));
        tile.append(ic, name, meta);
        tile.addEventListener('click', () => onSelect?.(item));
        root.appendChild(tile);
      }
    },
  };
}
