/**
 * Tests for the Calculator pure engine helpers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeNumber,
  toBase, formatBaseRows,
  isValidVarName, isReservedVarName, sanitizeVars,
  addDaysToToday, formatDateLabel,
  groupTapeByDay,
  secondOf, labelFor, actionFor,
  SCI_FNS, applyBinaryOp, fmtOp, OP_SYMBOLS,
} from '../os/apps/calculator/engine.js';

// ─── normalizeNumber ────────────────────────────────────────────

test('normalizeNumber: integer round-trip', () => {
  assert.equal(normalizeNumber(42), '42');
  assert.equal(normalizeNumber(-7), '-7');
  assert.equal(normalizeNumber(0), '0');
});

test('normalizeNumber: tiny values floor to 0', () => {
  assert.equal(normalizeNumber(1e-20), '0');
});

test('normalizeNumber: huge values switch to exponential', () => {
  assert.match(normalizeNumber(1e15), /e15$/);
});

test('normalizeNumber: NaN/Infinity → Error', () => {
  assert.equal(normalizeNumber(NaN), 'Error');
  assert.equal(normalizeNumber(Infinity), 'Error');
  assert.equal(normalizeNumber(-Infinity), 'Error');
});

test('normalizeNumber: floating round to 12 digits', () => {
  assert.equal(normalizeNumber(0.1 + 0.2), '0.3');
});

// ─── toBase / formatBaseRows ────────────────────────────────────

test('toBase: dec passes through', () => {
  assert.equal(toBase('255', 'dec'), '255');
});

test('toBase: HEX/OCT/BIN of 255', () => {
  assert.equal(toBase('255', 'hex'), 'FF');
  assert.equal(toBase('255', 'oct'), '377');
  assert.equal(toBase('255', 'bin'), '11111111');
});

test('toBase: non-integer or negative → em dash', () => {
  assert.equal(toBase('-7', 'hex'), '—');
  assert.equal(toBase('3.14', 'bin'), '—');
});

test('toBase: Error in / em dash out', () => {
  assert.equal(toBase('Error', 'hex'), '—');
});

test('formatBaseRows shape', () => {
  assert.deepEqual(formatBaseRows('10'), { dec: '10', hex: 'A', oct: '12', bin: '1010' });
});

// ─── Variables ──────────────────────────────────────────────────

test('isValidVarName: shape rules', () => {
  assert.equal(isValidVarName('tax'), true);
  assert.equal(isValidVarName('rent'), true);
  assert.equal(isValidVarName('x_1'), true);
  assert.equal(isValidVarName(''), false);
  assert.equal(isValidVarName('1x'), false);
  assert.equal(isValidVarName('hello world'), false);
  assert.equal(isValidVarName('a'.repeat(17)), false);
});

test('isReservedVarName: blocks builtins', () => {
  assert.equal(isReservedVarName('e'), true);
  assert.equal(isReservedVarName('pi'), true);
  assert.equal(isReservedVarName('PI'), true);
  assert.equal(isReservedVarName('today'), true);
  assert.equal(isReservedVarName('tax'), false);
});

test('sanitizeVars: drops invalid + reserved + non-finite', () => {
  const out = sanitizeVars({
    tax: 0.16,
    rent: '85000',
    pi: 3.14,        // reserved
    '1bad': 5,       // invalid name
    nothing: NaN,
    inf: Infinity,
    g: 9.81,
  });
  assert.deepEqual(out, { tax: 0.16, rent: 85000, g: 9.81 });
});

test('sanitizeVars: bad input → empty', () => {
  assert.deepEqual(sanitizeVars(null), {});
  assert.deepEqual(sanitizeVars('string'), {});
  assert.deepEqual(sanitizeVars(undefined), {});
});

// ─── Date math ──────────────────────────────────────────────────

test('addDaysToToday: + 1 day → tomorrow at UTC start', () => {
  const ref = new Date('2026-05-07T15:30:00Z');
  const r = addDaysToToday(1, ref);
  assert.equal(r.label, '08 May 2026');
});

test('addDaysToToday: - 7 days', () => {
  const ref = new Date('2026-05-07T00:00:00Z');
  const r = addDaysToToday(-7, ref);
  assert.equal(r.label, '30 Apr 2026');
});

test('addDaysToToday: large jump 90d', () => {
  const ref = new Date('2026-05-07T00:00:00Z');
  const r = addDaysToToday(90, ref);
  assert.equal(r.label, '05 Aug 2026');
});

test('formatDateLabel: invalid → em dash', () => {
  assert.equal(formatDateLabel(new Date('not-a-date')), '—');
  assert.equal(formatDateLabel(null), '—');
});

// ─── History grouping ───────────────────────────────────────────

test('groupTapeByDay: empty / non-array → empty', () => {
  assert.deepEqual(groupTapeByDay([]), []);
  assert.deepEqual(groupTapeByDay(null), []);
});

test('groupTapeByDay: groups today + yesterday + earlier dates', () => {
  const now = Date.UTC(2026, 4, 7, 12, 0, 0); // 2026-05-07 12:00 UTC
  const dayMs = 86400000;
  const tape = [
    { ts: now - 5 * dayMs, expr: '1+1', result: '2' },     // 02 May
    { ts: now - 1 * dayMs, expr: '2+2', result: '4' },     // 06 May (Yesterday)
    { ts: now,             expr: '3+3', result: '6' },     // 07 May (Today)
    { ts: now + 1000,      expr: '4+4', result: '8' },     // Today
  ];
  const groups = groupTapeByDay(tape, now);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].dayLabel, 'Today');
  assert.equal(groups[0].entries.length, 2);
  // Newest-first within day
  assert.equal(groups[0].entries[0].expr, '4+4');
  assert.equal(groups[1].dayLabel, 'Yesterday');
  assert.equal(groups[2].dayLabel, '02 May 2026');
});

test('groupTapeByDay: ts=0 entries go to "Earlier"', () => {
  const now = Date.UTC(2026, 4, 7);
  const tape = [{ ts: 0, expr: 'legacy', result: '0' }];
  const groups = groupTapeByDay(tape, now);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].dayLabel, 'Earlier');
});

// ─── Scientific 2nd-mode mapping ────────────────────────────────

test('secondOf: bidirectional pairs', () => {
  assert.equal(secondOf('pow2'), 'pow3');
  assert.equal(secondOf('pow3'), 'pow2');
  assert.equal(secondOf('sqrt'), 'cbrt');
  assert.equal(secondOf('sin'), 'asin');
  assert.equal(secondOf('asin'), 'sin');
  assert.equal(secondOf('pi'), 'e');
  assert.equal(secondOf('e'), 'pi');
  assert.equal(secondOf('unknown'), null);
});

test('labelFor / actionFor: respects 2nd-mode', () => {
  assert.equal(labelFor('pow2', false), 'x²');
  assert.equal(labelFor('pow2', true),  'x³');
  assert.equal(labelFor('sqrt', true),  '∛');
  assert.equal(labelFor('sin', true),   'sin⁻¹');
  assert.equal(labelFor('pi', true),    'e');

  assert.equal(actionFor('pow2', false), 'pow2');
  assert.equal(actionFor('pow2', true),  'pow3');
  assert.equal(actionFor('pi', true),    'e');
});

// ─── SCI_FNS evaluator ──────────────────────────────────────────

test('SCI_FNS: pow2 / pow3 / sqrt / cbrt', () => {
  assert.equal(SCI_FNS.pow2(7), 49);
  assert.equal(SCI_FNS.pow3(3), 27);
  assert.equal(SCI_FNS.sqrt(81), 9);
  assert.equal(SCI_FNS.cbrt(27), 3);
});

test('SCI_FNS: trig respects angleMode', () => {
  const radCtx = { angleMode: 'rad' };
  const degCtx = { angleMode: 'deg' };
  assert.ok(Math.abs(SCI_FNS.sin(Math.PI / 2, radCtx) - 1) < 1e-9);
  assert.ok(Math.abs(SCI_FNS.sin(90, degCtx) - 1) < 1e-9);
  assert.ok(Math.abs(SCI_FNS.cos(0, radCtx) - 1) < 1e-9);
  assert.ok(Math.abs(SCI_FNS.cos(0, degCtx) - 1) < 1e-9);
});

test('SCI_FNS: asin/acos return in selected mode', () => {
  const degCtx = { angleMode: 'deg' };
  assert.ok(Math.abs(SCI_FNS.asin(1, degCtx) - 90) < 1e-9);
  assert.ok(Math.abs(SCI_FNS.acos(1, degCtx) - 0) < 1e-9);
});

test('SCI_FNS: constants', () => {
  assert.equal(SCI_FNS.pi(), Math.PI);
  assert.equal(SCI_FNS.e(), Math.E);
});

// ─── Binary ops ─────────────────────────────────────────────────

test('applyBinaryOp: standard arithmetic', () => {
  assert.equal(applyBinaryOp('+', 12, 30), 42);
  assert.equal(applyBinaryOp('-', 50, 8), 42);
  assert.equal(applyBinaryOp('*', 6, 7), 42);
  assert.equal(applyBinaryOp('/', 84, 2), 42);
});

test('applyBinaryOp: divide by zero → NaN', () => {
  assert.ok(Number.isNaN(applyBinaryOp('/', 10, 0)));
});

test('applyBinaryOp: non-finite operand → NaN', () => {
  assert.ok(Number.isNaN(applyBinaryOp('+', NaN, 1)));
  assert.ok(Number.isNaN(applyBinaryOp('+', 1, Infinity)));
});

test('fmtOp / OP_SYMBOLS: math symbols for tape display', () => {
  assert.equal(fmtOp('+'), '+');
  assert.equal(fmtOp('-'), '−');
  assert.equal(fmtOp('*'), '×');
  assert.equal(fmtOp('/'), '÷');
  assert.equal(OP_SYMBOLS['*'], '×');
});
