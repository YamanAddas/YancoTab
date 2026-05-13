/**
 * pdf/v3/chrome/morePopover.js — vertical "More" menu shown when the
 * toolbar's ⋯ button is clicked.
 *
 * Each entry is `{ id, label, hint?, danger?, disabled?, separator? }`.
 * `disabled: true` greys the row out and adds a "Soon" badge.
 *
 * Dismisses on outside click, Escape, or any row click. Anchored under
 * the trigger button.
 *
 * Target size: ≤ 150 lines.
 */

import { el } from '../../../../utils/dom.js';

export function buildMorePopover({ items = [], onSelect } = {}) {
  const root = el('div', { class: 'pdf-more-popover', role: 'menu' });
  root.style.display = 'none';

  const rowsById = new Map();

  for (const item of items) {
    if (item.separator) {
      root.appendChild(el('div', { class: 'pdf-more-sep' }));
      continue;
    }
    const row = el('button', {
      type: 'button',
      class: 'pdf-more-row',
      role: 'menuitem',
      'data-id': item.id,
      title: item.hint || item.label,
      disabled: !!item.disabled,
    });
    if (item.danger) row.classList.add('is-danger');
    if (item.disabled) row.classList.add('is-disabled');
    const label = el('span', { class: 'pdf-more-label' }, item.label);
    row.appendChild(label);
    if (item.disabled) {
      row.appendChild(el('span', { class: 'pdf-more-soon' }, 'Soon'));
    } else if (item.hint) {
      row.appendChild(el('span', { class: 'pdf-more-hint' }, item.hint));
    }
    row.addEventListener('click', () => {
      if (item.disabled) return;
      hide();
      onSelect?.(item.id);
    });
    rowsById.set(item.id, row);
    root.appendChild(row);
  }

  let outsideHandler = null;
  let escHandler = null;
  let isOpen = false;

  function showNear(triggerEl) {
    if (!triggerEl) return;
    root.style.display = 'block';
    root.style.visibility = 'hidden';
    root.style.position = 'fixed';
    // Render first so we can measure.
    requestAnimationFrame(() => {
      const tr = triggerEl.getBoundingClientRect();
      const pr = root.getBoundingClientRect();
      let left = tr.right - pr.width;
      let top = tr.bottom + 4;
      if (left < 8) left = 8;
      if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - pr.width - 8;
      if (top + pr.height > window.innerHeight - 8) top = tr.top - pr.height - 4;
      root.style.left = `${Math.round(left)}px`;
      root.style.top = `${Math.round(top)}px`;
      root.style.visibility = 'visible';
    });
    isOpen = true;
    bindDismiss();
  }

  function hide() {
    root.style.display = 'none';
    isOpen = false;
    unbindDismiss();
  }

  function toggleNear(triggerEl) {
    if (isOpen) hide();
    else showNear(triggerEl);
  }

  function bindDismiss() {
    unbindDismiss();
    outsideHandler = (e) => {
      if (root.contains(e.target)) return;
      hide();
    };
    escHandler = (e) => { if (e.key === 'Escape') hide(); };
    setTimeout(() => {
      document.addEventListener('pointerdown', outsideHandler, true);
      document.addEventListener('keydown', escHandler, true);
    }, 0);
  }

  function unbindDismiss() {
    if (outsideHandler) document.removeEventListener('pointerdown', outsideHandler, true);
    if (escHandler) document.removeEventListener('keydown', escHandler, true);
    outsideHandler = null;
    escHandler = null;
  }

  function setRowState(id, { disabled, label, checked } = {}) {
    const row = rowsById.get(id);
    if (!row) return;
    if (typeof disabled === 'boolean') {
      row.disabled = disabled;
      row.classList.toggle('is-disabled', disabled);
    }
    if (typeof label === 'string') {
      const labelEl = row.querySelector('.pdf-more-label');
      if (labelEl) labelEl.textContent = label;
    }
    if (typeof checked === 'boolean') {
      row.classList.toggle('is-checked', checked);
    }
  }

  function destroy() {
    unbindDismiss();
    root.remove();
  }

  return { root, showNear, hide, toggleNear, setRowState, destroy };
}
