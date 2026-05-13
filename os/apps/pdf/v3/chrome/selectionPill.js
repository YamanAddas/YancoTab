/**
 * pdf/v3/chrome/selectionPill.js — Adobe-style selection pill.
 *
 * Floats above the selection; 5 color chips for highlight + 3 marker
 * variants (Highlight / Underline / Strike) selectable as the active
 * "tool." Phase B keeps it minimal: 5 color chips that all add
 * highlight annotations, plus a Copy button.
 *
 * Anchored via fixed coords. Flips to below the selection if the
 * selection is near the top of the viewport.
 *
 * Target size: ≤ 250 lines.
 */

import { el } from '../../../utils/dom.js';

const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];
const COLOR_LABELS = {
  yellow: 'Highlight yellow',
  green:  'Highlight green',
  blue:   'Highlight blue',
  pink:   'Highlight pink',
  purple: 'Highlight purple',
};
const MARGIN = 8;

export function buildSelectionPill({ onColor, onCopy, onUnderline, onStrike } = {}) {
  const root = el('div', { class: 'pdf-sel-pill', role: 'toolbar' });
  root.style.display = 'none';

  // Color chips
  const chips = COLORS.map((c) => {
    const chip = el('button', {
      type: 'button',
      class: `pdf-sel-chip pdf-sel-chip-${c}`,
      title: COLOR_LABELS[c],
      'aria-label': COLOR_LABELS[c],
    });
    // Prevent the click from collapsing the selection before the handler runs.
    chip.addEventListener('mousedown', (e) => e.preventDefault());
    chip.addEventListener('click', () => onColor?.(c));
    return chip;
  });

  const divider1 = el('span', { class: 'pdf-sel-div' });

  // Underline / Strike toggles
  const underlineBtn = miniBtn('U', 'Underline (uses last color)', () => onUnderline?.());
  const strikeBtn = miniBtn('S', 'Strikethrough', () => onStrike?.());
  // Phase B: underline/strike are placeholders. Not wired to a real
  // handler unless caller passes one. Hide if no handler.
  if (!onUnderline) underlineBtn.style.display = 'none';
  if (!onStrike) strikeBtn.style.display = 'none';

  const divider2 = el('span', { class: 'pdf-sel-div' });

  const copyBtn = miniBtn('Copy', 'Copy selection', () => onCopy?.());

  root.append(...chips, divider1, underlineBtn, strikeBtn, divider2, copyBtn);

  function miniBtn(label, title, handler) {
    const b = el('button', {
      type: 'button',
      class: 'pdf-sel-btn',
      title,
      'aria-label': title,
    }, label);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', handler);
    return b;
  }

  function show(rect) {
    if (!rect || rect.width === 0) { hide(); return; }
    root.style.display = 'inline-flex';
    // Force a layout to get our own rect.
    const pillRect = root.getBoundingClientRect();
    let left = rect.left + (rect.width / 2) - (pillRect.width / 2);
    let top = rect.top - pillRect.height - MARGIN;
    // Flip below if too close to viewport top.
    if (top < 8) top = rect.bottom + MARGIN;
    // Clamp horizontally.
    const maxLeft = window.innerWidth - pillRect.width - 8;
    if (left < 8) left = 8;
    if (left > maxLeft) left = maxLeft;
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
  }

  function hide() {
    root.style.display = 'none';
  }

  return { root, show, hide };
}
