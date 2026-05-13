/**
 * pdf/v3/chrome/colorPickerPopover.js — small 5-chip palette popover.
 *
 * Anchored under the toolbar's highlight-color button. Clicking a chip
 * fires onSelect(colorId), persists state, and dismisses.
 *
 * Target size: ≤ 110 lines.
 */

import { el } from '../../../../utils/dom.js';

const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];

export function buildColorPickerPopover({ onSelect } = {}) {
  const root = el('div', {
    class: 'pdf-color-picker-popover',
    role: 'menu',
    'aria-label': 'Highlight color',
  });
  root.style.display = 'none';

  const chipsById = new Map();
  for (const c of COLORS) {
    const chip = el('button', {
      type: 'button',
      class: `pdf-color-chip pdf-sel-chip-${c}`,
      'data-color': c,
      title: c.charAt(0).toUpperCase() + c.slice(1),
      'aria-label': `Highlight color ${c}`,
    });
    chip.addEventListener('click', () => {
      hide();
      onSelect?.(c);
    });
    chipsById.set(c, chip);
    root.appendChild(chip);
  }

  let outsideHandler = null;
  let escHandler = null;
  let isOpen = false;

  function setActive(color) {
    for (const [id, chip] of chipsById) chip.classList.toggle('is-active', id === color);
  }

  function showNear(triggerEl) {
    if (!triggerEl) return;
    root.style.display = 'inline-flex';
    root.style.position = 'fixed';
    root.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      const tr = triggerEl.getBoundingClientRect();
      const pr = root.getBoundingClientRect();
      let left = tr.left + (tr.width / 2) - (pr.width / 2);
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

  function toggleNear(triggerEl) {
    if (isOpen) hide();
    else showNear(triggerEl);
  }

  function hide() {
    root.style.display = 'none';
    isOpen = false;
    unbindDismiss();
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

  function destroy() {
    unbindDismiss();
    root.remove();
  }

  return { root, showNear, toggleNear, hide, setActive, destroy };
}
