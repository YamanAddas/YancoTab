/**
 * notes/view/listTab.js — sortable table list of notes.
 *
 * Columns: Title · Tags · Mood · Edited.
 * Click a row → select that note (parent re-routes to Cosmos and
 * opens it in the detail panel).
 */

import { el } from '../../../utils/dom.js';
import { formatDate } from '../../../utils/notes-utils.js';

const COLS = [
  { id: 'title',   label: 'Title',  width: '40%' },
  { id: 'tags',    label: 'Tags',   width: '24%' },
  { id: 'status',  label: 'Mood',   width: '14%' },
  { id: 'updated', label: 'Edited', width: '22%' },
];

export function buildListTab({ onSelectPath, onContextNote } = {}) {
  const root = el('div', { class: 'nc-list' });

  let sortBy = 'updated';
  let sortDir = 'desc';
  let cachedNotes = [];
  let cachedSelected = null;

  // Header row
  const head = el('div', { class: 'nc-list-head' });
  const headCells = new Map();
  for (const col of COLS) {
    const cell = el('button', {
      type: 'button',
      class: 'nc-list-head-cell',
      'data-col': col.id,
      style: { width: col.width },
    }, col.label);
    cell.addEventListener('click', () => {
      if (sortBy === col.id) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortBy = col.id;
        sortDir = col.id === 'title' ? 'asc' : 'desc';
      }
      render();
    });
    head.appendChild(cell);
    headCells.set(col.id, cell);
  }

  const body = el('div', { class: 'nc-list-body' });
  const empty = el('div', { class: 'nc-list-empty' }, 'No notes match.');
  empty.style.display = 'none';

  root.append(head, body, empty);

  function compare(a, b) {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'title') {
      return a.title.localeCompare(b.title) * dir;
    }
    if (sortBy === 'tags') {
      const at = (a.meta.tags || [])[0] || '';
      const bt = (b.meta.tags || [])[0] || '';
      return at.localeCompare(bt) * dir;
    }
    if (sortBy === 'status') {
      const as = a.meta.status || '';
      const bs = b.meta.status || '';
      return as.localeCompare(bs) * dir;
    }
    // updated (default)
    const au = Number.isFinite(a.meta.updated) ? a.meta.updated : 0;
    const bu = Number.isFinite(b.meta.updated) ? b.meta.updated : 0;
    return (au - bu) * dir;
  }

  function render() {
    // Update sort indicators on header cells.
    for (const [id, cell] of headCells) {
      cell.classList.toggle('is-active', id === sortBy);
      cell.dataset.dir = (id === sortBy) ? sortDir : '';
    }

    body.innerHTML = '';
    if (!cachedNotes.length) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    const sorted = [...cachedNotes].sort(compare);
    for (const n of sorted) {
      const row = el('div', {
        class: `nc-list-row${n.path === cachedSelected ? ' is-selected' : ''}`,
        'data-note-path': n.path,
      });
      row.appendChild(el('div', { class: 'nc-list-cell nc-list-title', style: { width: COLS[0].width } },
        n.title || 'Untitled'));
      row.appendChild(el('div', { class: 'nc-list-cell', style: { width: COLS[1].width } },
        ((n.meta.tags || []).slice(0, 3).join(', ')) || '—'));
      row.appendChild(el('div', { class: 'nc-list-cell', style: { width: COLS[2].width } },
        n.meta.status || '—'));
      const u = Number.isFinite(n.meta.updated) ? n.meta.updated : 0;
      row.appendChild(el('div', { class: 'nc-list-cell nc-list-updated', style: { width: COLS[3].width } },
        u > 0 ? formatDate(u) : '—'));
      row.addEventListener('click', () => onSelectPath?.(n.path));
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextNote?.(n, e.clientX, e.clientY);
      });
      body.appendChild(row);
    }
  }

  return {
    root,
    update(notes, selectedPath) {
      cachedNotes = notes || [];
      cachedSelected = selectedPath || null;
      render();
    },
  };
}
