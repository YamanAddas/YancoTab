/**
 * Tests for Calculator programmer-mode state helpers.
 *
 * The helpers in calculator/programmer.js are pure, so we can drive
 * them directly without spinning up a DOM.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeProgState,
  progAppendDigit, progBackspace, progSetOp, progEval,
  progNot, progNegate, progSetValue,
  fmtBitOp, BASE_RADIX, HEX_DIGITS, WIDTHS,
} from '../os/apps/calculator/programmer.js';
import { formatBigIntInBase } from '../os/apps/calculator/engine.js';

// ─── Initial state ──────────────────────────────────────────────

test('makeProgState: initial value is 0n / no pending op', () => {
  const s = makeProgState();
  assert.equal(s.value, 0n);
  assert.equal(s.prevValue, null);
  assert.equal(s.op, null);
  assert.equal(s.resetNext, false);
});

// ─── Digit input ────────────────────────────────────────────────

test('progAppendDigit: dec input "255" stores 255n', () => {
  let s = makeProgState();
  s = progAppendDigit(s, '2', 'dec', 32);
  s = progAppendDigit(s, '5', 'dec', 32);
  s = progAppendDigit(s, '5', 'dec', 32);
  assert.equal(s.value, 255n);
});

test('progAppendDigit: hex input "FF" stores 255n', () => {
  let s = makeProgState();
  s = progAppendDigit(s, 'F', 'hex', 32);
  s = progAppendDigit(s, 'F', 'hex', 32);
  assert.equal(s.value, 255n);
});

test('progAppendDigit: oct input "777" stores 511n', () => {
  let s = makeProgState();
  s = progAppendDigit(s, '7', 'oct', 32);
  s = progAppendDigit(s, '7', 'oct', 32);
  s = progAppendDigit(s, '7', 'oct', 32);
  assert.equal(s.value, 0o777n);
});

test('progAppendDigit: bin input "1011" stores 11n', () => {
  let s = makeProgState();
  for (const d of ['1','0','1','1']) s = progAppendDigit(s, d, 'bin', 32);
  assert.equal(s.value, 11n);
});

test('progAppendDigit: invalid digit for base is ignored', () => {
  let s = makeProgState();
  s = progAppendDigit(s, '9', 'bin', 32);   // 9 not in BIN
  assert.equal(s.value, 0n);
  s = progAppendDigit(s, '8', 'oct', 32);   // 8 not in OCT
  assert.equal(s.value, 0n);
  s = progAppendDigit(s, 'F', 'dec', 32);   // F not in DEC
  assert.equal(s.value, 0n);
});

test('progAppendDigit: at width boundary, masks correctly', () => {
  // Type FF in 8-bit → 255 (max). Add another F via append: (255*16+15) masked 8 = (4095) & 0xFF = 0xFF = 255
  let s = makeProgState();
  s = progAppendDigit(s, 'F', 'hex', 8);  // 15
  s = progAppendDigit(s, 'F', 'hex', 8);  // 255
  s = progAppendDigit(s, 'F', 'hex', 8);  // would be 0xFFF = 4095; masked = 0xFF = 255
  assert.equal(s.value, 0xFFn);
});

test('progAppendDigit: resetNext flag triggers fresh start', () => {
  let s = { value: 99n, prevValue: null, op: null, resetNext: true };
  s = progAppendDigit(s, '5', 'dec', 32);
  assert.equal(s.value, 5n);  // not 99*10+5
  assert.equal(s.resetNext, false);
});

// ─── Backspace ──────────────────────────────────────────────────

test('progBackspace: dec divides by 10', () => {
  const r = progBackspace({ value: 1234n, prevValue: null, op: null, resetNext: false }, 'dec', 32);
  assert.equal(r.value, 123n);
});

test('progBackspace: hex divides by 16', () => {
  const r = progBackspace({ value: 0xDEADn, prevValue: null, op: null, resetNext: false }, 'hex', 32);
  assert.equal(r.value, 0xDEAn);
});

test('progBackspace: bin divides by 2', () => {
  const r = progBackspace({ value: 0b1011n, prevValue: null, op: null, resetNext: false }, 'bin', 32);
  assert.equal(r.value, 0b101n);
});

test('progBackspace: resetNext skips operation', () => {
  const s = { value: 99n, prevValue: null, op: null, resetNext: true };
  const r = progBackspace(s, 'dec', 32);
  assert.equal(r, s);  // unchanged
});

// ─── Binary ops ─────────────────────────────────────────────────

test('progSetOp + progEval: 5 AND 3 at 32-bit = 1', () => {
  let s = makeProgState();
  s = progAppendDigit(s, '5', 'dec', 32);
  s = progSetOp(s, 'and', 32);
  s = progAppendDigit(s, '3', 'dec', 32);
  const r = progEval(s, 32);
  assert.equal(r.error, false);
  assert.equal(r.prog.value, 1n);
});

test('progEval: 0xFF OR 0x0F = 0xFF', () => {
  let s = makeProgState();
  s = progAppendDigit(s, 'F', 'hex', 32);
  s = progAppendDigit(s, 'F', 'hex', 32);
  s = progSetOp(s, 'or', 32);
  s = progAppendDigit(s, 'F', 'hex', 32);
  const r = progEval(s, 32);
  assert.equal(r.prog.value, 0xFFn);
});

test('progEval: 0xFF XOR 0xAA at 8-bit = 0x55', () => {
  let s = makeProgState();
  s.value = 0xFFn;
  s = progSetOp(s, 'xor', 8);
  s.value = 0xAAn;
  const r = progEval(s, 8);
  assert.equal(r.prog.value, 0x55n);
});

test('progEval: shift left at 8-bit boundary clamps', () => {
  let s = makeProgState();
  s.value = 1n;
  s = progSetOp(s, 'lsh', 8);
  s.value = 8n;  // shift by 8
  const r = progEval(s, 8);
  assert.equal(r.prog.value, 0n);  // 1 << 8 in 8-bit = 0
});

test('progEval: divide by zero → error', () => {
  let s = makeProgState();
  s.value = 10n;
  s = progSetOp(s, '/', 32);
  // s.value now 0n via reset
  const r = progEval(s, 32);
  assert.equal(r.error, true);
});

test('progEval: chained ops fold previous (5+3+4 → 12)', () => {
  let s = makeProgState();
  s = progAppendDigit(s, '5', 'dec', 32);  // 5
  s = progSetOp(s, '+', 32);                // prev=5, op=+
  s = progAppendDigit(s, '3', 'dec', 32);  // 3
  s = progSetOp(s, '+', 32);                // folds: prev=8, op=+
  s = progAppendDigit(s, '4', 'dec', 32);  // 4
  const r = progEval(s, 32);
  assert.equal(r.prog.value, 12n);
});

test('progEval: with no pending op is a no-op', () => {
  const s = { value: 5n, prevValue: null, op: null, resetNext: false };
  const r = progEval(s, 32);
  assert.equal(r.prog, s);
  assert.equal(r.expr, null);
});

// ─── NOT (unary) ────────────────────────────────────────────────

test('progNot: ~0 at 8-bit = 0xFF', () => {
  const r = progNot({ value: 0n, prevValue: null, op: null, resetNext: false }, 8);
  assert.equal(r.value, 0xFFn);
});

test('progNot: ~0xFF at 8-bit = 0', () => {
  const r = progNot({ value: 0xFFn, prevValue: null, op: null, resetNext: false }, 8);
  assert.equal(r.value, 0n);
});

test('progNot: ~0xAA at 32-bit', () => {
  const r = progNot({ value: 0xAAn, prevValue: null, op: null, resetNext: false }, 32);
  assert.equal(r.value, 0xFFFFFF55n);
});

// ─── Negate (DEC sign flip) ─────────────────────────────────────

test('progNegate: 5 → -5 at 8-bit (stored as 0xFB unsigned)', () => {
  const r = progNegate({ value: 5n, prevValue: null, op: null, resetNext: false }, 8);
  assert.equal(r.value, 0xFBn);
  // Round-trip check via formatBigIntInBase
  assert.equal(formatBigIntInBase(r.value, 'dec', 8), '-5');
  assert.equal(formatBigIntInBase(r.value, 'hex', 8), 'FB');
});

test('progNegate: -5 → 5 (round-trip)', () => {
  let r = progNegate({ value: 5n, prevValue: null, op: null, resetNext: false }, 8);
  r = progNegate(r, 8);
  assert.equal(r.value, 5n);
});

test('progNegate: 0 → 0', () => {
  const r = progNegate({ value: 0n, prevValue: null, op: null, resetNext: false }, 32);
  assert.equal(r.value, 0n);
});

// ─── Width round-trip via formatter ─────────────────────────────

test('format: -1 displayed as -1 (DEC) and FF/377/11111111 (others) at 8-bit', () => {
  const minus1 = 0xFFn;  // -1 unsigned at 8-bit
  assert.equal(formatBigIntInBase(minus1, 'dec', 8), '-1');
  assert.equal(formatBigIntInBase(minus1, 'hex', 8), 'FF');
  assert.equal(formatBigIntInBase(minus1, 'oct', 8), '377');
  assert.equal(formatBigIntInBase(minus1, 'bin', 8), '11111111');
});

test('format: 255 at 8-bit DEC → -1 (signed interpretation)', () => {
  assert.equal(formatBigIntInBase(255n, 'dec', 8), '-1');
  assert.equal(formatBigIntInBase(255n, 'dec', 16), '255');
  assert.equal(formatBigIntInBase(255n, 'dec', 32), '255');
});

test('format: 0x80000000 at 32-bit → INT_MIN signed', () => {
  assert.equal(formatBigIntInBase(0x80000000n, 'dec', 32), '-2147483648');
  assert.equal(formatBigIntInBase(0x80000000n, 'hex', 32), '80000000');
});

// ─── progSetValue (var-pill insert) ─────────────────────────────

test('progSetValue: masks to width, sets resetNext', () => {
  const r = progSetValue(makeProgState(), 0xFFFFn, 8);
  assert.equal(r.value, 0xFFn);  // masked
  assert.equal(r.resetNext, true);
});

// ─── fmtBitOp ───────────────────────────────────────────────────

test('fmtBitOp: bitwise + arithmetic symbols', () => {
  assert.equal(fmtBitOp('and'), 'AND');
  assert.equal(fmtBitOp('or'),  'OR');
  assert.equal(fmtBitOp('xor'), 'XOR');
  assert.equal(fmtBitOp('mod'), 'MOD');
  assert.equal(fmtBitOp('lsh'), '≪');
  assert.equal(fmtBitOp('rsh'), '≫');
  assert.equal(fmtBitOp('+'),   '+');
  assert.equal(fmtBitOp('*'),   '×');
});

// ─── Constants ──────────────────────────────────────────────────

test('BASE_RADIX: each base has correct radix', () => {
  assert.equal(BASE_RADIX.dec, 10);
  assert.equal(BASE_RADIX.hex, 16);
  assert.equal(BASE_RADIX.oct, 8);
  assert.equal(BASE_RADIX.bin, 2);
});

test('HEX_DIGITS: A through F', () => {
  assert.deepEqual(HEX_DIGITS, ['A','B','C','D','E','F']);
});

test('WIDTHS: 8, 16, 32, 64', () => {
  assert.deepEqual(WIDTHS, [8, 16, 32, 64]);
});
