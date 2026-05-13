/**
 * pdf/v3/readerColor.js — highlight-color picker wiring.
 *
 * Owns the popover that opens from the toolbar's color-swatch button,
 * persists the choice through kernel.storage, and exposes get/set so
 * the selection pill and other call sites stay in sync.
 *
 * Target size: ≤ 80 lines.
 */

import { buildColorPickerPopover } from './chrome/colorPickerPopover.js';

const STORAGE_KEY = 'yancotab_pdf_highlight_color';
const VALID = ['yellow', 'green', 'blue', 'pink', 'purple'];

export function createColorController({ kernel, toolbar, defaultColor = 'yellow' } = {}) {
  let color = VALID.includes(defaultColor) ? defaultColor : 'yellow';
  try {
    const saved = kernel?.storage?.load?.(STORAGE_KEY);
    if (VALID.includes(saved)) color = saved;
  } catch { /* best-effort */ }

  const popover = buildColorPickerPopover({
    onSelect: (next) => setColor(next),
  });
  popover.setActive(color);
  document.body.appendChild(popover.root);

  toolbar?.setHighlightColor?.(color);

  function setColor(next) {
    if (!VALID.includes(next)) return;
    color = next;
    try { kernel?.storage?.save?.(STORAGE_KEY, next); } catch { /* best-effort */ }
    toolbar?.setHighlightColor?.(next);
    popover.setActive(next);
  }

  return {
    getColor: () => color,
    setColor,
    toggleNear: (anchorBtn) => popover.toggleNear(anchorBtn),
    destroy: () => popover.destroy(),
  };
}
