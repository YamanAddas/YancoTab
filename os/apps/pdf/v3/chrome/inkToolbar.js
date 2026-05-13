/**
 * pdf/v3/chrome/inkToolbar.js — sub-toolbar shown when the Ink tool
 * is active. Lets the user pick a color (6 swatches) and a stroke
 * width (3 presets: thin / medium / thick).
 *
 * Sits below the main toolbar; full-width strip.
 *
 * Target size: ≤ 200 lines.
 */

import { el } from '../../../../utils/dom.js';

const COLORS = [
  { id: 'red',    hex: '#ff453a' },
  { id: 'orange', hex: '#ff9500' },
  { id: 'yellow', hex: '#ffde59' },
  { id: 'green',  hex: '#34c759' },
  { id: 'blue',   hex: '#007aff' },
  { id: 'purple', hex: '#af52de' },
  { id: 'black',  hex: '#111111' },
];

const WIDTHS = [
  { id: 'thin',   px: 1.5, label: '•',  title: 'Thin (1pt)' },
  { id: 'medium', px: 3,   label: '••', title: 'Medium (3pt)' },
  { id: 'thick',  px: 6,   label: '●',  title: 'Thick (6pt)' },
];

export function buildInkToolbar({
  initialColor = 'red',
  initialWidth = 3,
  onChange,
  onCancel,
} = {}) {
  let activeColor = initialColor;
  let activeWidth = initialWidth;

  const root = el('div', { class: 'pdf-ink-toolbar', role: 'toolbar' });
  root.style.display = 'none';

  const label = el('span', { class: 'pdf-ink-tb-label' }, 'Ink');

  const colorRow = el('div', { class: 'pdf-ink-tb-colors' });
  const colorBtns = new Map();
  for (const c of COLORS) {
    const btn = el('button', {
      type: 'button',
      class: 'pdf-ink-chip',
      title: `${c.id.charAt(0).toUpperCase() + c.id.slice(1)}`,
      'aria-label': c.id,
      style: { background: c.hex },
    });
    btn.addEventListener('click', () => setColor(c.id));
    colorBtns.set(c.id, btn);
    colorRow.appendChild(btn);
  }

  const widthRow = el('div', { class: 'pdf-ink-tb-widths' });
  const widthBtns = new Map();
  for (const w of WIDTHS) {
    const btn = el('button', {
      type: 'button',
      class: 'pdf-ink-width-btn',
      title: w.title,
      'aria-label': w.title,
    });
    const dot = el('span', {
      class: 'pdf-ink-width-dot',
      style: {
        width: `${w.px * 1.6}px`,
        height: `${w.px * 1.6}px`,
      },
    });
    btn.appendChild(dot);
    btn.addEventListener('click', () => setWidth(w.px));
    widthBtns.set(w.id, btn);
    widthRow.appendChild(btn);
  }

  const closeBtn = el('button', {
    type: 'button',
    class: 'pdf-ink-tb-close',
    title: 'Exit ink tool',
    onclick: () => onCancel?.(),
  }, 'Done');

  root.append(label, colorRow, widthRow, closeBtn);

  function setColor(id) {
    activeColor = id;
    refreshActive();
    onChange?.({ color: activeColor, width: activeWidth });
  }
  function setWidth(px) {
    activeWidth = px;
    refreshActive();
    onChange?.({ color: activeColor, width: activeWidth });
  }
  function refreshActive() {
    for (const [id, btn] of colorBtns) btn.classList.toggle('is-active', id === activeColor);
    for (const w of WIDTHS) widthBtns.get(w.id).classList.toggle('is-active', w.px === activeWidth);
  }
  refreshActive();

  function show() { root.style.display = 'flex'; }
  function hide() { root.style.display = 'none'; }
  function getColor() { return activeColor; }
  function getWidth() { return activeWidth; }

  return { root, show, hide, getColor, getWidth };
}
