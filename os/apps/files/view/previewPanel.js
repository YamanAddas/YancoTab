/**
 * files/view/previewPanel.js — right column preview + send-to.
 *
 * Shows: thumbnail/icon + name + path + stats grid + send-to row.
 * Lineage section uses real timestamps (created + modified) — no
 * synthetic Figma history.
 */

import { el, cssUrlEscape } from '../../../utils/dom.js';
import { formatBytes } from '../engine/state.js';
import { iconOf } from '../engine/fileType.js';

function formatTime(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return '—';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60_000) return 'just now';
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (d.toDateString() === now.toDateString()) {
    return `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} today`;
  }
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function buildPreviewPanel({
  onPin, onSendNotes, onSendBrowser, onSendPhotos, onSendWallpaper, onCopyPath, onDelete, onRename,
} = {}) {
  const root = el('aside', { class: 'fv-prev' });

  const empty = el('div', { class: 'fv-prev-empty' }, [
    el('div', { class: 'fv-prev-empty-title' }, 'No file selected'),
    el('div', { class: 'fv-prev-empty-hint' }, 'Pick a coin in the honeycomb to inspect it.'),
  ]);

  const card = el('div', { class: 'fv-prev-card' });
  const img = el('div', { class: 'fv-prev-img' });
  const meta = el('div', { class: 'fv-prev-meta' });
  const title = el('h4', { class: 'fv-prev-title' });
  const path = el('div', { class: 'fv-prev-path' });
  const stats = el('div', { class: 'fv-prev-stats' });
  meta.append(title, path, stats);
  card.append(img, meta);

  const sendHead = el('h4', { class: 'fv-side-h' }, 'SEND TO');
  const sendRow = el('div', { class: 'fv-send-row' });

  const lineageHead = el('h4', { class: 'fv-side-h' }, 'LINEAGE');
  const lineage = el('div', { class: 'fv-lineage' });

  const actionsRow = el('div', { class: 'fv-prev-actions' });

  const hint = el('div', { class: 'fv-prev-hint' },
    'Drag a coin onto a folder cell to file it · Esc to close');

  root.append(empty, card, actionsRow, sendHead, sendRow, lineageHead, lineage, hint);

  function showSelected(visible) {
    empty.style.display = visible ? 'none' : 'flex';
    for (const e of [card, sendHead, sendRow, lineageHead, lineage, actionsRow]) {
      e.style.display = visible ? '' : 'none';
    }
  }
  showSelected(false);

  let currentPath = null;
  let currentItem = null;

  // Action buttons (built once; updated based on current item).
  const pinBtn = el('button', { type: 'button', class: 'fv-prev-act' }, '☆ Pin');
  const renameBtn = el('button', { type: 'button', class: 'fv-prev-act' }, 'Rename');
  const deleteBtn = el('button', { type: 'button', class: 'fv-prev-act fv-prev-act-danger' }, 'Delete');
  pinBtn.addEventListener('click', () => currentItem && onPin?.(currentItem));
  renameBtn.addEventListener('click', () => currentItem && onRename?.(currentItem));
  deleteBtn.addEventListener('click', () => currentItem && onDelete?.(currentItem));
  actionsRow.append(pinBtn, renameBtn, deleteBtn);

  // Send-to row (built once).
  const sendDef = (label, color, fire) => {
    const b = el('button', { type: 'button', class: 'fv-send-btn' }, [
      el('i', { class: 'fv-send-pip', style: { background: color } }),
      label,
    ]);
    b.addEventListener('click', () => currentItem && fire?.(currentItem));
    return b;
  };
  const notesBtn = sendDef('Notes', 'var(--accent, #00e5c1)', onSendNotes);
  const browserBtn = sendDef('Browser', 'var(--cool, #5aa8ff)', onSendBrowser);
  const photosBtn = sendDef('Photos', 'var(--violet, #9b7bff)', onSendPhotos);
  const wallpaperBtn = sendDef('Wallpaper', 'var(--warm, #ffb84a)', onSendWallpaper);
  const copyPathBtn = el('button', { type: 'button', class: 'fv-send-btn' }, 'Copy path');
  copyPathBtn.addEventListener('click', () => currentItem && onCopyPath?.(currentItem));
  sendRow.append(notesBtn, browserBtn, photosBtn, wallpaperBtn, copyPathBtn);

  return {
    root,
    update(item) {
      currentItem = item;
      currentPath = item?.path || null;
      if (!item) {
        showSelected(false);
        return;
      }
      showSelected(true);

      // Image preview
      img.innerHTML = '';
      img.classList.toggle('is-image', item.category === 'img');
      if (item.category === 'img' && typeof item.content === 'string' && item.content.startsWith('data:')) {
        img.style.backgroundImage = `url("${cssUrlEscape(item.content)}")`;
        img.style.backgroundSize = 'cover';
        img.style.backgroundPosition = 'center';
      } else {
        img.style.backgroundImage = '';
        img.appendChild(el('span', { class: 'fv-prev-icon' }, item.isDir ? '📂' : iconOf(item.name || '')));
      }

      title.textContent = item.name || 'item';
      path.textContent = item.path;

      stats.innerHTML = '';
      stats.appendChild(stat('Size', formatBytes(item.size || 0), item.isDir ? 'dim' : ''));
      stats.appendChild(stat('Type', item.isDir ? 'folder' : (item.category || 'other')));
      stats.appendChild(stat('Modified', formatTime(item.modified), 'accent'));
      stats.appendChild(stat('Created', formatTime(item.created)));

      // Lineage — real timestamps, no synthetic figma history.
      lineage.innerHTML = '';
      if (Number.isFinite(item.modified) && item.modified > 0) {
        lineage.appendChild(lineageItem(`${formatTime(item.modified)} → modified`, ''));
      }
      if (Number.isFinite(item.created) && item.created > 0 && item.created !== item.modified) {
        lineage.appendChild(lineageItem(`${formatTime(item.created)} → created`, 'dim'));
      }
      if (lineage.children.length === 0) {
        lineage.appendChild(el('div', { class: 'fv-lineage-empty' }, 'No timestamps recorded.'));
      }

      // Pin button label.
      pinBtn.textContent = item.pinned ? '★ Unpin' : '☆ Pin';

      // Hide non-applicable send-to buttons.
      photosBtn.style.display = item.category === 'img' ? '' : 'none';
      wallpaperBtn.style.display = item.category === 'img' ? '' : 'none';
      browserBtn.style.display = (item.category === 'img' || item.category === 'docs' || item.ext === 'pdf') ? '' : 'none';
    },
  };
}

function stat(k, v, mod = '') {
  return el('div', { class: 'fv-stat' }, [
    el('div', { class: 'fv-stat-k' }, k),
    el('div', { class: `fv-stat-v${mod ? ' fv-stat-' + mod : ''}` }, v),
  ]);
}

function lineageItem(text, mod = '') {
  return el('div', { class: `fv-lineage-row${mod ? ' fv-lineage-' + mod : ''}` }, text);
}
