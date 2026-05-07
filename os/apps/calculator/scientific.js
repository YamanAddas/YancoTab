/**
 * scientific.js — Scientific extension panel.
 *
 * Single horizontally-scrollable row above the modes pills, mounted
 * inside view.js's `.calc-mode-scientific` slot. Shows the 17 sci
 * functions that don't fit on the base 30-key hex keypad, plus a
 * Rad/Deg toggle and the 2nd-mode toggle.
 *
 * Each sci key carries `data-sci-id` so engine.relabelSciKeys() can
 * swap labels in 2nd-mode (e.g. tan → tan⁻¹).
 *
 * The "tape-action" sci ids are mostly `'sci'` actions routed via
 * dispatch.js. EE input takes a dedicated `'ee'` action because it
 * doesn't compute anything — it just appends an exponent marker.
 */
import { el } from '../../utils/dom.js';
import { labelFor } from './engine.js';

/**
 * Layout of the sci panel.
 *   [Rad/Deg]  — angle-mode toggle (only enabled in scientific)
 *   [2nd]      — re-uses existing toggle wiring
 *   tan x³ ³√ ln eˣ log 10ˣ xʸ ʸ√x x! 1/x |x| EE Rand sinh cosh tanh
 */
export const SCI_PANEL = [
  { id: 'tan',    type: 'sci' },
  { id: 'pow3',   type: 'sci' },   // x³ — already on base keypad via 2nd, exposed here for direct access
  { id: 'cbrt',   type: 'sci' },   // ∛
  { id: 'ln',     type: 'sci' },
  { id: 'exp',    type: 'sci' },   // eˣ
  { id: 'log',    type: 'sci' },
  { id: 'tenx',   type: 'sci' },   // 10ˣ
  { id: 'pow',    type: 'op',  value: '^' },     // xʸ — binary
  { id: 'yroot',  type: 'op',  value: 'yroot' }, // ʸ√x — binary
  { id: 'fact',   type: 'sci' },   // x!
  { id: 'inv',    type: 'sci' },   // 1/x
  { id: 'abs',    type: 'sci' },   // |x|
  { id: 'ee',     type: 'ee' },    // scientific notation entry
  { id: 'rand',   type: 'sci' },
  { id: 'sinh',   type: 'sci' },
  { id: 'cosh',   type: 'sci' },
  { id: 'tanh',   type: 'sci' },
];

const FIXED_LABELS = {
  pow:   'xʸ',
  yroot: 'ʸ√x',
  fact:  'x!',
  inv:   '1/x',
  abs:   '|x|',
  ee:    'EE',
  rand:  'Rand',
};

/**
 * Build the scientific extension panel.
 *
 * @returns { panelEl, sciKeyEls, secondToggle, angleToggle }
 *   sciKeyEls — array of buttons with data-sci-id, for relabel on 2nd
 */
export function buildSciPanel({ handlers, secondMode, angleMode }) {
  const sciKeyEls = [];

  const secondToggle = el('button', {
    class: 'calc-sci-2nd' + (secondMode ? ' is-active' : ''),
    type: 'button',
    title: 'Toggle inverse functions',
    onclick: () => handlers.toggleSecond(),
  }, '2nd');

  const angleToggle = el('button', {
    class: 'calc-sci-angle',
    type: 'button',
    title: 'Toggle radians / degrees',
    onclick: () => handlers.toggleAngle(),
  }, angleMode === 'deg' ? 'DEG' : 'RAD');

  const keys = el('div', { class: 'calc-sci-keys' });
  for (const k of SCI_PANEL) {
    const initialLabel = FIXED_LABELS[k.id] || labelFor(k.id, secondMode);
    const btn = el('button', {
      class: 'calc-sci-key' + (k.type === 'ee' ? ' is-ee' : '')
                            + (k.type === 'op' ? ' is-op' : ''),
      type: 'button',
      'aria-label': initialLabel,
      onclick: () => {
        if (k.type === 'ee')  handlers.appendExponent();
        else if (k.type === 'op') handlers.applyOp(k.value);
        else handlers.applySci(k.id);
      },
    }, initialLabel);
    if (k.type === 'sci') {
      btn.dataset.sciId = k.id;
      sciKeyEls.push(btn);
    }
    keys.appendChild(btn);
  }

  const panelEl = el('div', { class: 'calc-sci-panel' }, [
    el('div', { class: 'calc-sci-toggles' }, [angleToggle, secondToggle]),
    keys,
  ]);

  return { panelEl, sciKeyEls, secondToggle, angleToggle };
}

/**
 * Re-label sci panel keys on 2nd-mode toggle. Skip non-sci keys
 * (pow, yroot, fact, inv, abs, ee, rand have fixed labels).
 */
export function relabelSciPanelKeys(sciKeyEls, secondMode) {
  for (const btn of sciKeyEls) {
    const baseId = btn.dataset.sciId;
    if (!baseId) continue;
    const label = labelFor(baseId, secondMode);
    btn.textContent = label;
    btn.setAttribute('aria-label', label);
  }
}

/**
 * Update the angle toggle label from the current angleMode.
 */
export function setAngleLabel(angleToggleEl, angleMode) {
  if (!angleToggleEl) return;
  angleToggleEl.textContent = angleMode === 'deg' ? 'DEG' : 'RAD';
}

/**
 * Flip 2nd-mode in place. Mutates ctx._secondMode, relabels both
 * sci surfaces (base keypad + sci panel), refreshes the display
 * meta line, and persists.
 *
 * @param {object} ctx — CalculatorApp instance
 * @param {(k: NodeListOf<Element> | Element[], on: boolean) => void} relabelFn
 */
export function toggleSecondMode(ctx, relabelFn) {
  ctx._secondMode = !ctx._secondMode;
  ctx._refs.sciSecondToggle.classList.toggle('is-active', ctx._secondMode);
  relabelFn(ctx._refs.keyEls, ctx._secondMode);
  relabelFn(ctx._refs.sciPanelKeyEls, ctx._secondMode);
  ctx._renderDisplay();
  ctx._persist();
}

/**
 * Flip Rad ↔ Deg. Mutates ctx.state.angleMode, refreshes the
 * angle toggle pill + display meta, persists.
 */
export function toggleAngleMode(ctx) {
  ctx.state.angleMode = ctx.state.angleMode === 'rad' ? 'deg' : 'rad';
  setAngleLabel(ctx._refs.sciAngleToggle, ctx.state.angleMode);
  ctx._renderDisplay();
  ctx._persist();
}

/**
 * Append the EE exponent marker to the current display. Idempotent
 * (already-has-e returns early). On a fresh '0' input, snaps to '1'
 * so the user enters '1e5' without first having to type '1'.
 */
export function appendExponentMarker(ctx) {
  if (ctx.state.current === 'Error') return;
  if (ctx.state.resetNext) { ctx.state.current = '1'; ctx.state.resetNext = false; }
  if (ctx.state.current === '0') ctx.state.current = '1';
  if (ctx.state.current.toLowerCase().includes('e')) return;
  ctx.state.current += 'e';
  ctx._renderDisplay();
}
