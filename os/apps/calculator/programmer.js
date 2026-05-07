/**
 * programmer.js — Programmer extension panel + state helpers.
 *
 * Mounts inside the existing .calc-mode-programmer slot (the multi-
 * base panel from PR-1 / PR-2 stays in place above this row). Adds:
 *
 *   • A row of hex digits A B C D E F (active only when base = HEX)
 *   • A row of bitwise ops: AND OR XOR NOT ≪ ≫ MOD
 *   • Word-size pills 8 / 16 / 32 / 64 bit
 *
 * State model: programmer mode stores a single BigInt per side of
 * the pending op (prevValue + currentValue), masked to the active
 * bit width. The shell drives this via the helpers below; the
 * helpers stay pure (return new state) so testing is straightforward.
 */
import { el } from '../../utils/dom.js';
import {
  applyBigIntOp, applyBigIntNot, maskUnsigned, isValidBitWidth,
} from './engine.js';

/** Numeric radix per base id. */
export const BASE_RADIX = { dec: 10, hex: 16, oct: 8, bin: 2 };

export const HEX_DIGITS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Bitwise op key set. NOT is unary; the rest are binary and route
 * through applyBigIntOp.
 */
export const BITWISE_KEYS = [
  { id: 'and', label: 'AND', kind: 'binary', op: 'and' },
  { id: 'or',  label: 'OR',  kind: 'binary', op: 'or'  },
  { id: 'xor', label: 'XOR', kind: 'binary', op: 'xor' },
  { id: 'not', label: 'NOT', kind: 'unary' },
  { id: 'lsh', label: '≪',  kind: 'binary', op: 'lsh' },
  { id: 'rsh', label: '≫',  kind: 'binary', op: 'rsh' },
  { id: 'mod', label: 'MOD', kind: 'binary', op: 'mod' },
];

export const WIDTHS = [8, 16, 32, 64];

const BITOP_SYMBOLS = {
  and: 'AND', or: 'OR', xor: 'XOR', mod: 'MOD',
  lsh: '≪',   rsh: '≫',
  '+': '+',   '-': '−', '*': '×', '/': '÷',
};

export function fmtBitOp(op) { return BITOP_SYMBOLS[op] || op; }

/**
 * Build the programmer extension panel.
 * @returns { panelEl, hexKeys, bitOpKeys, widthPills }
 */
export function buildProgPanel({ handlers, bitWidth, base }) {
  const hexKeys = el('div', { class: 'calc-prog-hex' });
  const hexButtons = {};
  for (const d of HEX_DIGITS) {
    const btn = el('button', {
      class: 'calc-prog-key calc-prog-hex-key',
      type: 'button',
      'data-hex': d,
      onclick: () => handlers.appendHex(d),
    }, d);
    hexButtons[d] = btn;
    hexKeys.appendChild(btn);
  }

  const bitOps = el('div', { class: 'calc-prog-bitops' });
  const bitOpEls = {};
  for (const k of BITWISE_KEYS) {
    const btn = el('button', {
      class: 'calc-prog-key calc-prog-bitop',
      type: 'button',
      title: k.label,
      onclick: () => k.kind === 'unary' ? handlers.applyNot() : handlers.applyBitop(k.op),
    }, k.label);
    bitOpEls[k.id] = btn;
    bitOps.appendChild(btn);
  }

  const widthRow = el('div', { class: 'calc-prog-widths' });
  const widthPills = {};
  for (const w of WIDTHS) {
    const pill = el('button', {
      class: 'calc-prog-width' + (w === bitWidth ? ' is-active' : ''),
      type: 'button',
      onclick: () => handlers.setWidth(w),
    }, `${w}-bit`);
    widthPills[w] = pill;
    widthRow.appendChild(pill);
  }

  // Single horizontally-scrollable row combining hex digits +
  // bitwise ops, with the width pills as a tight second row.
  const opsRow = el('div', { class: 'calc-prog-ops' }, [hexKeys, bitOps]);
  const panelEl = el('div', { class: 'calc-prog-panel' }, [opsRow, widthRow]);
  setHexKeysActive(hexButtons, base);

  return { panelEl, hexKeys: hexButtons, bitOpEls, widthPills };
}

/**
 * Toggle the .is-disabled class on hex digit keys based on whether
 * the active base accepts hex letters. Called when base changes.
 */
export function setHexKeysActive(hexButtons, base) {
  const active = base === 'hex';
  for (const btn of Object.values(hexButtons)) {
    btn.classList.toggle('is-disabled', !active);
  }
}

/**
 * Update which width pill is highlighted.
 */
export function setActiveWidth(widthPills, width) {
  for (const [w, pill] of Object.entries(widthPills)) {
    pill.classList.toggle('is-active', Number(w) === Number(width));
  }
}

// ─── State helpers (pure) ───────────────────────────────────────

/** Initial / cleared state. */
export function makeProgState() {
  return { value: 0n, prevValue: null, op: null, resetNext: false };
}

/**
 * Append a digit (0-9 or A-F) to the current value, treating the
 * existing value × radix + digit as the new value (bounded by the
 * width mask). Returns the same state object if the digit is
 * invalid for the current base (caller should toast).
 *
 * @param {{value, prevValue, op, resetNext}} prog
 * @param {string} digitChar — '0'..'9' or 'A'..'F'
 * @param {'dec'|'hex'|'oct'|'bin'} base
 * @param {number} bitWidth
 * @returns new prog state, or prog (unchanged) if invalid digit
 */
export function progAppendDigit(prog, digitChar, base, bitWidth) {
  const radix = BASE_RADIX[base];
  if (!radix || !isValidBitWidth(bitWidth)) return prog;
  const d = parseInt(digitChar, 16);
  if (Number.isNaN(d) || d < 0 || d >= radix) return prog;
  const start = prog.resetNext ? 0n : prog.value;
  const next = maskUnsigned(start * BigInt(radix) + BigInt(d), bitWidth);
  return { ...prog, value: next, resetNext: false };
}

/**
 * Backspace: integer-divide value by radix to drop the last digit.
 */
export function progBackspace(prog, base, bitWidth) {
  if (prog.resetNext) return prog;
  const radix = BASE_RADIX[base];
  if (!radix || !isValidBitWidth(bitWidth)) return prog;
  return { ...prog, value: prog.value / BigInt(radix) };
}

/**
 * Set the pending binary op. Commits the current value as
 * prevValue, leaving an empty input for the next operand.
 *
 * If there's already a prevValue + op pending and the user has
 * started entering a new operand, fold the previous op first
 * (chained calculations like `5 + 3 + 4 =`).
 */
export function progSetOp(prog, op, bitWidth) {
  if (prog.op != null && prog.prevValue != null && !prog.resetNext) {
    const folded = applyBigIntOp(prog.op, prog.prevValue, prog.value, bitWidth);
    if (folded == null) return prog;  // caller treats as Error
    return { value: 0n, prevValue: folded, op, resetNext: true };
  }
  return { value: 0n, prevValue: prog.value, op, resetNext: true };
}

/**
 * Apply the pending op. Returns { prog, expr, error } where expr is
 * a tape-friendly description (or null if there was nothing to do).
 */
export function progEval(prog, bitWidth) {
  if (prog.op == null || prog.prevValue == null) {
    return { prog, expr: null, error: false };
  }
  const r = applyBigIntOp(prog.op, prog.prevValue, prog.value, bitWidth);
  if (r == null) return { prog, expr: null, error: true };
  return {
    prog: { value: r, prevValue: null, op: null, resetNext: true },
    expr: { prev: prog.prevValue, op: prog.op, curr: prog.value, result: r },
    error: false,
  };
}

/** Bitwise NOT — unary, masks to width. */
export function progNot(prog, bitWidth) {
  return { ...prog, value: applyBigIntNot(prog.value, bitWidth), resetNext: true };
}

/**
 * Negate the value's signed interpretation. Only meaningful in DEC
 * mode — caller toasts for HEX/OCT/BIN.
 */
export function progNegate(prog, bitWidth) {
  if (!isValidBitWidth(bitWidth)) return prog;
  const signed = BigInt.asIntN(bitWidth, prog.value);
  return { ...prog, value: maskUnsigned(-signed, bitWidth) };
}

/**
 * Replace value (e.g. when a var pill is clicked or width changes).
 * Always re-masks to width.
 */
export function progSetValue(prog, value, bitWidth) {
  return { ...prog, value: maskUnsigned(value, bitWidth), resetNext: true };
}

// ─── Shell action helpers (close over ctx) ──────────────────────
//
// These are the calculator-shell entry points for the programmer
// mode. Each mutates ctx._prog via the pure helpers above and then
// triggers a render. Keeping them here (rather than as methods on
// CalculatorApp) keeps the shell file under the 500-line cap.

import { formatBigIntInBase } from './engine.js';

function _render(ctx) {
  if (ctx._mode !== 'programmer') return;
  ctx.state.current = formatBigIntInBase(ctx._prog.value, ctx._programmerBase, ctx._bitWidth);
  for (const b of ['dec','hex','oct','bin']) {
    const ref = ctx._refs.baseRefs[b];
    if (!ref) continue;
    ref.value.textContent = formatBigIntInBase(ctx._prog.value, b, ctx._bitWidth);
    ref.row.classList.toggle('is-active', b === ctx._programmerBase);
  }
  ctx._renderDisplay();
}

export function actRender(ctx)              { _render(ctx); }
export function actAppendDigit(ctx, d)      { ctx._prog = progAppendDigit(ctx._prog, d, ctx._programmerBase, ctx._bitWidth); _render(ctx); }
export function actAppendHex(ctx, letter)   {
  if (ctx._programmerBase !== 'hex') return;
  ctx._prog = progAppendDigit(ctx._prog, letter, 'hex', ctx._bitWidth);
  _render(ctx);
}
export function actSetOp(ctx, op)           { ctx._prog = progSetOp(ctx._prog, op, ctx._bitWidth); _render(ctx); }
export function actNot(ctx)                 { ctx._prog = progNot(ctx._prog, ctx._bitWidth); _render(ctx); }
export function actClear(ctx)               { ctx._prog = makeProgState(); _render(ctx); }
export function actBackspace(ctx)           { ctx._prog = progBackspace(ctx._prog, ctx._programmerBase, ctx._bitWidth); _render(ctx); }
export function actNegate(ctx) {
  if (ctx._programmerBase !== 'dec') {
    ctx.kernel.emit('toast', { message: 'Sign requires DEC', type: 'info' });
    return;
  }
  ctx._prog = progNegate(ctx._prog, ctx._bitWidth);
  _render(ctx);
}
export function actEval(ctx) {
  const r = progEval(ctx._prog, ctx._bitWidth);
  if (r.error) { ctx.setError(); return; }
  ctx._prog = r.prog;
  if (r.expr) {
    const tag = ctx._programmerBase.toUpperCase();
    const fmt = (b) => formatBigIntInBase(b, ctx._programmerBase, ctx._bitWidth);
    const expr = `${fmt(r.expr.prev)} ${fmtBitOp(r.expr.op)} ${fmt(r.expr.curr)}`;
    ctx._appendTape({ ts: Date.now(), expr, result: `${fmt(r.expr.result)} (${tag})` });
  }
  _render(ctx);
  ctx._renderTape();
}
export function actSetBase(ctx, base) {
  if (ctx._programmerBase === base) return;
  ctx._programmerBase = base;
  setHexKeysActive(ctx._refs.progHexKeys, base);
  _render(ctx);
  ctx._persist();
}
export function actSetWidth(ctx, w) {
  if (ctx._bitWidth === w) return;
  ctx._bitWidth = w;
  ctx._prog = progSetValue(ctx._prog, ctx._prog.value, w);
  setActiveWidth(ctx._refs.progWidthPills, w);
  _render(ctx);
  ctx._persist();
}
export function actInsertVar(ctx, value) {
  ctx._prog = progSetValue(ctx._prog, BigInt(Math.trunc(value)), ctx._bitWidth);
  _render(ctx);
}
