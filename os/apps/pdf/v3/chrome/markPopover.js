/**
 * pdf/v3/chrome/markPopover.js — popover that appears when the user
 * clicks an existing highlight mark.
 *
 * Shows the 5 color chips (click to change color in place) + a delete
 * button. Anchored near the clicked mark's bounding rect.
 *
 * Dismisses on outside click or Escape.
 *
 * Target size: ≤ 200 lines.
 */

import { el } from '../../../../utils/dom.js';

const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];

export function buildMarkPopover({ onChangeColor, onDelete } = {}) {
  const root = el('div', { class: 'pdf-mark-popover', role: 'dialog' });
  root.style.display = 'none';

  const chipsRow = el('div', { class: 'pdf-mark-chips' });
  for (const c of COLORS) {
    const chip = el('button', {
      type: 'button',
      class: `pdf-mark-chip pdf-sel-chip-${c}`,
      title: `Change color to ${c}`,
      'aria-label': `Change color to ${c}`,
    });
    chip.addEventListener('click', () => {
      if (activeId) onChangeColor?.(activeId, c);
      hide();
    });
    chipsRow.appendChild(chip);
  }
  const divider = el('span', { class: 'pdf-sel-div' });
  const delBtn = el('button', {
    type: 'button',
    class: 'pdf-mark-del-btn',
    title: 'Delete highlight',
    'aria-label': 'Delete highlight',
  }, 'Delete');
  delBtn.addEventListener('click', () => {
    if (activeId) onDelete?.(activeId);
    hide();
  });
  root.append(chipsRow, divider, delBtn);

  let activeId = null;
  let outsideHandler = null;
  let escHandler = null;

  function show(annId, anchorRect) {
    activeId = annId;
    root.style.display = 'inline-flex';
    // Position above the rect, clamped to viewport.
    const pr = root.getBoundingClientRect();
    let left = anchorRect.left + (anchorRect.width / 2) - (pr.width / 2);
    let top = anchorRect.top - pr.height - 8;
    if (top < 8) top = anchorRect.bottom + 8;
    const maxLeft = window.innerWidth - pr.width - 8;
    if (left < 8) left = 8;
    if (left > maxLeft) left = maxLeft;
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
    bindDismiss();
  }

  function hide() {
    root.style.display = 'none';
    activeId = null;
    unbindDismiss();
  }

  function bindDismiss() {
    unbindDismiss();
    outsideHandler = (e) => {
      if (root.contains(e.target)) return;
      // Don't dismiss when clicking another mark — let the new click open
      // the popover for that mark instead. The caller handles that flow.
      if (e.target?.closest?.('mark.pdf-hl')) return;
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

  function destroy() {
    unbindDismiss();
    root.remove();
  }

  return { root, show, hide, destroy };
}
