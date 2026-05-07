/**
 * notesExportView.js — list previously saved Calculator-tape notes.
 *
 * Scans /home/documents for files whose name starts with
 * "Calculator tape — " and renders them as a clickable list. Click
 * opens the file in the Notes app.
 */
import { el } from '../../utils/dom.js';

const TAPE_PREFIX = 'Calculator tape';

/**
 * Find saved tape files via the kernel filesystem service.
 * Returns newest-first, by mtime.
 */
function listSavedTapes(kernel) {
  const fs = kernel.getService?.('fs');
  if (!fs?.list) return [];
  let items;
  try { items = fs.list('/home/documents') || []; }
  catch { return []; }
  const tapes = [];
  for (const it of items) {
    if (!it || it.type !== 'file') continue;
    const name = it.path.split('/').pop() || '';
    if (!name.startsWith(TAPE_PREFIX)) continue;
    const meta = (() => {
      try { return fs.read(it.path)?.meta || {}; } catch { return {}; }
    })();
    tapes.push({
      path: it.path,
      name,
      modified: meta.modified || meta.created || 0,
    });
  }
  tapes.sort((a, b) => b.modified - a.modified);
  return tapes;
}

function fmtSavedDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function renderNotesExport(containerEl, kernel) {
  containerEl.textContent = '';
  const tapes = listSavedTapes(kernel);
  if (tapes.length === 0) {
    containerEl.appendChild(el('div', { class: 'calc-tape-empty' },
      '— no exports yet — use “Save tape → Notes” to add one —'));
    return;
  }
  for (const t of tapes) {
    containerEl.appendChild(el('div', {
      class: 'calc-export-item',
      title: 'Open in Notes',
      onclick: () => {
        // Notes app accepts a path via spawn config; fall back to plain open.
        kernel.emit('app:open', 'notes', { path: t.path });
      },
    }, [
      el('span', { class: 'calc-export-name' }, t.name.replace(/\.md$/, '')),
      el('span', { class: 'calc-export-date' }, fmtSavedDate(t.modified)),
    ]));
  }
}
