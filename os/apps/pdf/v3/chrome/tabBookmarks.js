/**
 * pdf/v3/chrome/tabBookmarks.js — Bookmarks tab.
 *
 * Lists per-doc bookmarks from kernel.storage (yancotab_pdf_bookmarks_v1).
 * Each row: page badge + label + delete button. Add-bookmark button
 * at the top adds the current page with a generated label.
 *
 * Target size: ≤ 250 lines.
 */

import { el } from '../../../../utils/dom.js';
import { listBookmarks, addBookmark, removeBookmark } from '../../persistence.js';

export function buildBookmarksTab({
  kernel, getDocId, getCurrentPage, onJumpToPage, onToast,
} = {}) {
  let host = null;
  let listEl = null;

  function mount(hostEl) {
    host = hostEl;
    host.classList.add('pdf-bookmarks');
    const header = el('div', { class: 'pdf-tab-header' });
    const addBtn = el('button', {
      type: 'button',
      class: 'pdf-tab-add-btn',
      title: 'Bookmark current page',
      onclick: addCurrent,
    }, '+ Bookmark page');
    header.appendChild(addBtn);
    host.appendChild(header);
    listEl = el('div', { class: 'pdf-bookmark-list' });
    host.appendChild(listEl);
    render();
    return { update, destroy };
  }

  function update() {
    render();
  }

  function addCurrent() {
    const docId = getDocId?.();
    const page = getCurrentPage?.();
    if (!docId || !Number.isFinite(page)) return;
    addBookmark(kernel, docId, {
      page,
      label: `Page ${page}`,
      color: 'accent',
    });
    onToast?.({ message: `Bookmarked page ${page}`, type: 'success' });
    render();
  }

  function removeOne(page, label) {
    const docId = getDocId?.();
    if (!docId) return;
    removeBookmark(kernel, docId, page, label);
    render();
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = '';
    const docId = getDocId?.();
    if (!docId) {
      listEl.appendChild(el('div', { class: 'pdf-tab-empty' }, 'No document open'));
      return;
    }
    const items = listBookmarks(kernel, docId);
    if (items.length === 0) {
      listEl.appendChild(el('div', { class: 'pdf-tab-empty' }, 'No bookmarks yet'));
      return;
    }
    for (const bm of items) {
      const row = el('div', { class: 'pdf-bookmark-row' });
      const pageBadge = el('span', { class: 'pdf-bookmark-page' }, String(bm.page));
      const label = el('button', {
        type: 'button',
        class: 'pdf-bookmark-label',
        title: bm.label,
        onclick: () => onJumpToPage?.(bm.page),
      }, bm.label);
      const del = el('button', {
        type: 'button',
        class: 'pdf-bookmark-del',
        title: 'Remove bookmark',
        'aria-label': 'Remove bookmark',
        onclick: () => removeOne(bm.page, bm.label),
      }, '×');
      row.append(pageBadge, label, del);
      listEl.appendChild(row);
    }
  }

  function destroy() {
    if (host) host.innerHTML = '';
    host = null;
    listEl = null;
  }

  return { mount };
}
