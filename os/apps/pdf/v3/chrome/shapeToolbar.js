/**
 * pdf/v3/chrome/shapeToolbar.js — sub-toolbar shown when the Shape
 * tool is active. Lets the user pick a shape (rect / ellipse / arrow /
 * line), color, stroke width, fill, and dash style.
 *
 * Target size: ≤ 250 lines.
 */

import { el } from '../../../utils/dom.js';

const SHAPES = [
  { id: 'rect',    label: 'Rectangle', svg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>' },
  { id: 'ellipse', label: 'Ellipse',   svg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="8" ry="5"/></svg>' },
  { id: 'arrow',   label: 'Arrow',     svg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="20" x2="18" y2="6"/><polygon points="20,4 14,6 18,10" fill="currentColor"/></svg>' },
  { id: 'line',    label: 'Line',      svg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="20" x2="20" y2="4"/></svg>' },
];

const COLORS = [
  { id: 'red', hex: '#ff453a' },
  { id: 'orange', hex: '#ff9500' },
  { id: 'yellow', hex: '#ffde59' },
  { id: 'green', hex: '#34c759' },
  { id: 'blue', hex: '#007aff' },
  { id: 'purple', hex: '#af52de' },
  { id: 'black', hex: '#111111' },
];

const WIDTHS = [1.5, 3, 6];
const DASHES = ['solid', 'dashed', 'dotted'];

export function buildShapeToolbar({ onCancel } = {}) {
  let activeShape = 'rect';
  let activeColor = 'red';
  let activeWidth = 3;
  let activeFill = 'none';
  let activeDash = 'solid';

  const root = el('div', { class: 'pdf-shape-toolbar', role: 'toolbar' });
  root.style.display = 'none';

  const label = el('span', { class: 'pdf-ink-tb-label' }, 'Shape');

  // Shape picker
  const shapeRow = el('div', { class: 'pdf-shape-picker' });
  const shapeBtns = new Map();
  for (const s of SHAPES) {
    const btn = el('button', {
      type: 'button',
      class: 'pdf-shape-btn',
      title: s.label,
      'aria-label': s.label,
    });
    btn.innerHTML = s.svg;
    btn.addEventListener('click', () => { activeShape = s.id; refresh(); });
    shapeBtns.set(s.id, btn);
    shapeRow.appendChild(btn);
  }

  // Color
  const colorRow = el('div', { class: 'pdf-ink-tb-colors' });
  const colorBtns = new Map();
  for (const c of COLORS) {
    const btn = el('button', {
      type: 'button',
      class: 'pdf-ink-chip',
      title: c.id,
      'aria-label': c.id,
      style: { background: c.hex },
    });
    btn.addEventListener('click', () => { activeColor = c.id; refresh(); });
    colorBtns.set(c.id, btn);
    colorRow.appendChild(btn);
  }

  // Width
  const widthRow = el('div', { class: 'pdf-ink-tb-widths' });
  const widthBtns = new Map();
  for (const px of WIDTHS) {
    const btn = el('button', {
      type: 'button',
      class: 'pdf-ink-width-btn',
      title: `${px}pt`,
      'aria-label': `${px} point`,
    });
    btn.appendChild(el('span', {
      class: 'pdf-ink-width-dot',
      style: { width: `${px * 1.6}px`, height: `${px * 1.6}px` },
    }));
    btn.addEventListener('click', () => { activeWidth = px; refresh(); });
    widthBtns.set(px, btn);
    widthRow.appendChild(btn);
  }

  // Fill toggle
  const fillToggle = el('button', {
    type: 'button',
    class: 'pdf-shape-fill-btn',
    title: 'Toggle fill',
    'aria-label': 'Toggle shape fill',
    onclick: () => { activeFill = activeFill === 'none' ? 'match' : 'none'; refresh(); },
  }, 'Fill');

  // Dash picker
  const dashRow = el('div', { class: 'pdf-shape-dash-picker' });
  const dashBtns = new Map();
  for (const d of DASHES) {
    const btn = el('button', {
      type: 'button',
      class: 'pdf-shape-dash-btn',
      title: d,
      'aria-label': d,
    }, d === 'solid' ? '—' : d === 'dashed' ? '- -' : '· ·');
    btn.addEventListener('click', () => { activeDash = d; refresh(); });
    dashBtns.set(d, btn);
    dashRow.appendChild(btn);
  }

  const closeBtn = el('button', {
    type: 'button',
    class: 'pdf-ink-tb-close',
    title: 'Exit shape tool',
    onclick: () => onCancel?.(),
  }, 'Done');

  root.append(label, shapeRow, colorRow, widthRow, fillToggle, dashRow, closeBtn);

  function refresh() {
    for (const [id, btn] of shapeBtns) btn.classList.toggle('is-active', id === activeShape);
    for (const [id, btn] of colorBtns) btn.classList.toggle('is-active', id === activeColor);
    for (const [px, btn] of widthBtns) btn.classList.toggle('is-active', px === activeWidth);
    for (const [d, btn] of dashBtns) btn.classList.toggle('is-active', d === activeDash);
    fillToggle.classList.toggle('is-active', activeFill !== 'none');
  }
  refresh();

  function show() { root.style.display = 'flex'; }
  function hide() { root.style.display = 'none'; }

  // Map 'match' to the current color hex when reading the fill value;
  // pdf-lib / SVG renderers expect a real color string.
  function resolvedFill() {
    if (activeFill === 'none') return 'none';
    const c = COLORS.find((x) => x.id === activeColor);
    return c ? c.hex : '#ff453a';
  }

  return {
    root, show, hide,
    getShape: () => activeShape,
    getColor: () => activeColor,
    getWidth: () => activeWidth,
    getFill:  resolvedFill,
    getDash:  () => activeDash,
  };
}
