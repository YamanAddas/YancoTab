/**
 * photos/view/infoPanel.js — right column of the Lightbox.
 *
 * Shows the selected photo's title, capture date (if known), the
 * conservative EXIF list, and a row of "Send to" actions (wallpaper,
 * download to Files, open in Browser, edit, delete).
 *
 * Empty state when nothing is selected.
 */

import { el } from '../../../utils/dom.js';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatWhen(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const d = new Date(ts);
  const day = d.getDate();
  const mon = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${year} · ${hh}:${mm}`;
}

export function buildInfoPanel({ onSetWallpaper, onOpenInBrowser, onSendToFiles, onEdit, onDelete } = {}) {
  const root = el('aside', { class: 'lb-info' });

  const empty = el('div', { class: 'lb-info-empty' }, [
    el('div', { class: 'lb-info-empty-title' }, 'No photo selected'),
    el('div', { class: 'lb-info-empty-hint' }, 'Pick a hex on the cosmos to inspect it.'),
  ]);

  const meta = el('div', { class: 'lb-info-meta' });
  const title = el('h3', { class: 'lb-info-title' });
  const when = el('div', { class: 'lb-info-when' });
  meta.append(title, when);

  const exifGrid = el('div', { class: 'lb-info-exif' });

  const actionsHead = el('h4', { class: 'lb-side-h' }, 'SEND TO');
  const actions = el('div', { class: 'lb-info-send' });

  const wallpaperBtn = el('button', { type: 'button', class: 'lb-send-btn lb-send-primary' }, '⌘ Wallpaper');
  const browserBtn = el('button', { type: 'button', class: 'lb-send-btn' }, '→ Browser');
  const filesBtn = el('button', { type: 'button', class: 'lb-send-btn' }, '→ Files');
  const editBtn = el('button', { type: 'button', class: 'lb-send-btn' }, '⇧ Edit');
  const deleteBtn = el('button', { type: 'button', class: 'lb-send-btn lb-send-danger' }, 'Delete');

  let currentPath = null;
  wallpaperBtn.addEventListener('click', () => currentPath && onSetWallpaper?.(currentPath));
  browserBtn.addEventListener('click', () => currentPath && onOpenInBrowser?.(currentPath));
  filesBtn.addEventListener('click', () => currentPath && onSendToFiles?.(currentPath));
  editBtn.addEventListener('click', () => currentPath && onEdit?.(currentPath));
  deleteBtn.addEventListener('click', () => currentPath && onDelete?.(currentPath));

  actions.append(wallpaperBtn, browserBtn, filesBtn, editBtn, deleteBtn);

  const note = el('div', { class: 'lb-info-note' },
    'EXIF shows only verified data. Camera-detail extraction is on the roadmap.');

  root.append(empty, meta, exifGrid, actionsHead, actions, note);

  function showSelected(visible) {
    empty.style.display = visible ? 'none' : 'flex';
    for (const e of [meta, exifGrid, actionsHead, actions, note]) {
      e.style.display = visible ? '' : 'none';
    }
  }

  showSelected(false);

  return {
    root,
    update(photo) {
      currentPath = photo?.path || null;
      if (!photo) {
        showSelected(false);
        return;
      }
      showSelected(true);
      title.textContent = photo.displayName || photo.name || 'Untitled';
      when.textContent = formatWhen(photo.created);

      exifGrid.innerHTML = '';
      const items = Array.isArray(photo.exif) ? photo.exif : [];
      for (const e of items) {
        exifGrid.appendChild(el('div', { class: 'lb-exif-cell' }, [
          el('div', { class: 'lb-exif-k' }, e.k),
          el('div', { class: 'lb-exif-v', title: String(e.v) }, String(e.v)),
        ]));
      }
    },
  };
}
