/**
 * pdf/v3/chrome/signToolbar.js — sub-toolbar shown when the Sign tool
 * is active. Lists the user's saved signatures (max 3) and lets them
 * select one (arming it for click-to-drop) or create a new one.
 *
 * Target size: ≤ 250 lines.
 */

import { el } from '../../../../utils/dom.js';

export function buildSignToolbar({
  getSavedSignatures,    // () → [{id, name, imageDataUrl, createdAt}]
  onAddNew,              // () → caller opens the modal
  onDelete,              // (id) → caller removes from storage + refreshes
  onCancel,
} = {}) {
  let activeId = null;
  let cachedList = [];

  const root = el('div', { class: 'pdf-sign-toolbar', role: 'toolbar' });
  root.style.display = 'none';

  const label = el('span', { class: 'pdf-ink-tb-label' }, 'Sign');
  const list = el('div', { class: 'pdf-sign-list' });
  const addBtn = el('button', {
    type: 'button',
    class: 'pdf-sign-add-btn',
    title: 'Create a new signature',
    onclick: () => onAddNew?.(),
  }, '+ Add signature');
  const closeBtn = el('button', {
    type: 'button',
    class: 'pdf-ink-tb-close',
    title: 'Exit sign tool',
    onclick: () => onCancel?.(),
  }, 'Done');

  root.append(label, list, addBtn, closeBtn);

  function refresh() {
    cachedList = getSavedSignatures?.() || [];
    list.innerHTML = '';
    if (cachedList.length === 0) {
      list.appendChild(el('span', {
        class: 'pdf-sign-empty',
      }, 'No signatures yet — click + Add to draw one.'));
      activeId = null;
      return;
    }
    // Auto-arm the first signature if nothing is active.
    if (!activeId || !cachedList.find((s) => s.id === activeId)) {
      activeId = cachedList[0].id;
    }
    for (const sig of cachedList) {
      const item = el('div', { class: 'pdf-sign-item', 'data-id': sig.id });
      const btn = el('button', {
        type: 'button',
        class: 'pdf-sign-pick-btn',
        title: `${sig.name} — click to arm, click a page to drop`,
        'aria-label': sig.name,
        onclick: () => { activeId = sig.id; refresh(); },
      });
      const img = el('img', { class: 'pdf-sign-thumb', src: sig.imageDataUrl, alt: sig.name });
      const name = el('span', { class: 'pdf-sign-name' }, sig.name);
      btn.append(img, name);
      const del = el('button', {
        type: 'button',
        class: 'pdf-sign-del',
        title: 'Delete signature',
        'aria-label': `Delete ${sig.name}`,
        onclick: (e) => { e.stopPropagation(); onDelete?.(sig.id); },
      }, '×');
      item.append(btn, del);
      if (sig.id === activeId) item.classList.add('is-active');
      list.appendChild(item);
    }
    // Hide the Add button when at the cap.
    addBtn.style.display = cachedList.length >= 3 ? 'none' : '';
  }

  function show() {
    refresh();
    root.style.display = 'flex';
  }
  function hide() { root.style.display = 'none'; }
  function getActive() {
    return cachedList.find((s) => s.id === activeId) || null;
  }
  function setActiveId(id) {
    if (cachedList.find((s) => s.id === id)) {
      activeId = id;
      refresh();
    }
  }

  return { root, show, hide, refresh, getActive, setActiveId };
}
