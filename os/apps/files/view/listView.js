/**
 * files/view/listView.js — sortable list rows.
 */

import { el } from '../../../utils/dom.js';
import { iconOf } from '../engine/fileType.js';
import { formatBytes } from '../engine/state.js';

function formatDate(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return '—';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString();
}

export function buildListView({ onSelect } = {}) {
  const root = el('div', { class: 'fv-list' });
  const head = el('div', { class: 'fv-list-head' }, [
    el('div', { class: 'fv-list-h fv-list-h-name' }, 'Name'),
    el('div', { class: 'fv-list-h fv-list-h-cat' }, 'Type'),
    el('div', { class: 'fv-list-h fv-list-h-size' }, 'Size'),
    el('div', { class: 'fv-list-h fv-list-h-mod' }, 'Modified'),
  ]);
  const body = el('div', { class: 'fv-list-body' });
  root.append(head, body);
  return {
    root,
    update({ items = [], selectedPath = null }) {
      body.innerHTML = '';
      for (const item of items) {
        const isSelected = selectedPath === item.path;
        const isDir = item.isFolder !== false && (item.id || item.isDir);
        const row = el('button', {
          type: 'button',
          class: `fv-list-row${isSelected ? ' is-selected' : ''}`,
          'data-path': item.path || '',
        });
        row.append(
          el('div', { class: 'fv-list-c fv-list-c-name' }, [
            el('span', { class: 'fv-list-ic' }, isDir ? '📂' : iconOf(item.name || item.label || '')),
            el('span', { class: 'fv-list-nm' }, item.label || item.name || 'item'),
          ]),
          el('div', { class: 'fv-list-c fv-list-c-cat' }, isDir ? 'folder' : (item.category || 'other')),
          el('div', { class: 'fv-list-c fv-list-c-size' }, isDir ? '—' : formatBytes(item.size || 0)),
          el('div', { class: 'fv-list-c fv-list-c-mod' }, formatDate(item.modified)),
        );
        row.addEventListener('click', () => onSelect?.(item));
        body.appendChild(row);
      }
    },
  };
}
