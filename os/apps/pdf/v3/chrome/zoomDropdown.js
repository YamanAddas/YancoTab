/**
 * pdf/v3/chrome/zoomDropdown.js — zoom-level picker popover.
 *
 * Opened by clicking the toolbar's zoom label. Vertical list of preset
 * rows + an editable "Custom" % input at the bottom.
 *
 * onSelect fires with either a number (1.0 = 100%) or a fit-keyword
 * string ('fit-width' | 'fit-page'). 'actual' is normalized to 1.0
 * by the caller via levelFromString.
 *
 * Target size: ≤ 170 lines.
 */

import { el } from '../../../../utils/dom.js';
import { PRESETS, formatLevel, levelFromString } from '../../engine/zoom.js';

const ENTRIES = [
  { value: 'fit-width', label: 'Fit width' },
  { value: 'fit-page',  label: 'Fit page' },
  { value: 1.0,         label: 'Actual size' },
  { separator: true },
  ...PRESETS.map((p) => ({ value: p, label: `${Math.round(p * 100)}%` })),
];

export function buildZoomDropdown({ onSelect } = {}) {
  const root = el('div', {
    class: 'pdf-zoom-dropdown',
    role: 'menu',
    'aria-label': 'Zoom level',
  });
  root.style.display = 'none';

  const rowsByValue = new Map();
  for (const entry of ENTRIES) {
    if (entry.separator) {
      root.appendChild(el('div', { class: 'pdf-zoom-sep' }));
      continue;
    }
    const row = el('button', {
      type: 'button',
      class: 'pdf-zoom-row',
      role: 'menuitem',
      'data-value': String(entry.value),
    });
    row.appendChild(el('span', { class: 'pdf-zoom-row-check' }, '✓'));
    row.appendChild(el('span', { class: 'pdf-zoom-row-label' }, entry.label));
    row.addEventListener('click', () => {
      hide();
      onSelect?.(entry.value);
    });
    rowsByValue.set(String(entry.value), row);
    root.appendChild(row);
  }

  // Custom % input row
  root.appendChild(el('div', { class: 'pdf-zoom-sep' }));
  const customRow = el('div', { class: 'pdf-zoom-custom' });
  customRow.appendChild(el('span', { class: 'pdf-zoom-custom-label' }, 'Custom'));
  const input = el('input', {
    type: 'text',
    class: 'pdf-zoom-custom-input',
    inputmode: 'numeric',
    placeholder: '125%',
    'aria-label': 'Custom zoom percentage',
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const parsed = levelFromString(input.value);
    if (parsed != null) {
      hide();
      onSelect?.(parsed);
    }
    e.preventDefault();
  });
  customRow.appendChild(input);
  root.appendChild(customRow);

  let outsideHandler = null;
  let escHandler = null;
  let isOpen = false;

  function setActive(currentMode) {
    let matchKey = null;
    if (typeof currentMode === 'string') {
      matchKey = currentMode;
    } else if (typeof currentMode === 'number') {
      // Near-match numeric within 0.5% so 1.0000…2 still highlights 100%.
      for (const k of rowsByValue.keys()) {
        const n = Number(k);
        if (Number.isFinite(n) && Math.abs(n - currentMode) < 0.005) { matchKey = k; break; }
      }
    }
    for (const [k, row] of rowsByValue) row.classList.toggle('is-active', k === matchKey);
  }

  function showNear(triggerEl) {
    if (!triggerEl) return;
    root.style.display = 'flex';
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
      input.value = '';
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

/** Format a zoomMode for display on the toolbar label. */
export function labelForMode(mode) {
  return formatLevel(mode);
}
