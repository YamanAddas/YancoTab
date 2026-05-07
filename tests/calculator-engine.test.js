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
  isValidBitWidth, maskUnsigned,
  applyBigIntOp, applyBigIntNot,
  parseBigIntInBase, formatBigIntInBase,
  sanitizeProgrammerValue, MAX_PROGRAMMER_LENGTH,
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

// ─── Op-table extensions (PR-1) ─────────────────────────────────

test('applyBinaryOp: power (^)', () => {
  assert.equal(applyBinaryOp('^', 2, 10), 1024);
  assert.equal(applyBinaryOp('^', 7, 0), 1);
  assert.equal(applyBinaryOp('^', 4, 0.5), 2);
});

test('applyBinaryOp: y-th root', () => {
  // Math.pow(x, 1/y) has float drift, so check closeness rather than ==.
  assert.ok(Math.abs(applyBinaryOp('yroot', 64, 3) - 4) < 1e-9);
  assert.ok(Math.abs(applyBinaryOp('yroot', 81, 4) - 3) < 1e-9);
  assert.equal(applyBinaryOp('yroot', 1024, 10), 2);
  assert.ok(Number.isNaN(applyBinaryOp('yroot', 5, 0)));
});

test('applyBinaryOp: mathematical mod (sign of divisor)', () => {
  assert.equal(applyBinaryOp('mod', 10, 3), 1);
  assert.equal(applyBinaryOp('mod', -1, 3), 2);   // ≠ JS % which gives -1
  assert.equal(applyBinaryOp('mod', 10, -3), -2); // ≠ JS % which gives 1
  assert.ok(Number.isNaN(applyBinaryOp('mod', 5, 0)));
});

test('applyBinaryOp: bitwise ops are NOT routed here', () => {
  // The shell must route these through applyBigIntOp() in
  // programmer mode. applyBinaryOp returns NaN for unknown ops so
  // a misroute is loud, not silent.
  assert.ok(Number.isNaN(applyBinaryOp('and', 1, 1)));
  assert.ok(Number.isNaN(applyBinaryOp('or', 1, 1)));
  assert.ok(Number.isNaN(applyBinaryOp('xor', 1, 1)));
  assert.ok(Number.isNaN(applyBinaryOp('lsh', 1, 1)));
  assert.ok(Number.isNaN(applyBinaryOp('rsh', 1, 1)));
});

test('OP_SYMBOLS: new ops have display strings', () => {
  assert.equal(OP_SYMBOLS['^'], '^');
  assert.equal(OP_SYMBOLS.yroot, 'ʸ√');
  assert.equal(OP_SYMBOLS.mod, 'mod');
  assert.equal(OP_SYMBOLS.and, 'AND');
  assert.equal(OP_SYMBOLS.lsh, '≪');
});

// ─── BigInt programmer scaffolding (PR-1) ───────────────────────

test('isValidBitWidth: only 8/16/32/64', () => {
  for (const w of [8, 16, 32, 64]) assert.equal(isValidBitWidth(w), true);
  for (const w of [0, 1, 7, 12, 33, 128, -8, NaN, null, '32']) {
    assert.equal(isValidBitWidth(w), false);
  }
});

test('maskUnsigned: positive values pass through under cap', () => {
  assert.equal(maskUnsigned(0n, 8), 0n);
  assert.equal(maskUnsigned(255n, 8), 255n);
  assert.equal(maskUnsigned(1n, 64), 1n);
});

test('maskUnsigned: -1 becomes all-bits-set unsigned', () => {
  assert.equal(maskUnsigned(-1n, 8),  0xFFn);
  assert.equal(maskUnsigned(-1n, 16), 0xFFFFn);
  assert.equal(maskUnsigned(-1n, 32), 0xFFFFFFFFn);
  assert.equal(maskUnsigned(-1n, 64), 0xFFFFFFFFFFFFFFFFn);
});

test('maskUnsigned: invalid width returns input unchanged', () => {
  assert.equal(maskUnsigned(42n, 7), 42n);
});

test('applyBigIntOp: bitwise AND/OR/XOR at width 8', () => {
  assert.equal(applyBigIntOp('and', 0xF0n, 0x0Fn, 8), 0x00n);
  assert.equal(applyBigIntOp('or',  0xF0n, 0x0Fn, 8), 0xFFn);
  assert.equal(applyBigIntOp('xor', 0xFFn, 0x0Fn, 8), 0xF0n);
});

test('applyBigIntOp: shifts mask to width', () => {
  // 1 << 8 at width 8 == 0 (top bit shifted out)
  assert.equal(applyBigIntOp('lsh', 1n, 8n, 8), 0n);
  assert.equal(applyBigIntOp('lsh', 1n, 7n, 8), 0x80n);
  assert.equal(applyBigIntOp('rsh', 0xFFn, 4n, 8), 0x0Fn);
});

test('applyBigIntOp: arithmetic + carries through mask', () => {
  // 0xFF + 1 at width 8 wraps to 0
  assert.equal(applyBigIntOp('+', 0xFFn, 1n, 8), 0n);
  assert.equal(applyBigIntOp('-', 0n, 1n, 8), 0xFFn);
  assert.equal(applyBigIntOp('*', 16n, 16n, 8), 0n); // 256 → 0
});

test('applyBigIntOp: divide by zero / mod by zero → null', () => {
  assert.equal(applyBigIntOp('/', 10n, 0n, 32), null);
  assert.equal(applyBigIntOp('mod', 10n, 0n, 32), null);
});

test('applyBigIntOp: invalid input → null', () => {
  assert.equal(applyBigIntOp('and', 1, 1n, 32), null);   // not bigint
  assert.equal(applyBigIntOp('and', 1n, 1n, 7), null);   // bad width
  assert.equal(applyBigIntOp('zzz', 1n, 1n, 32), null);  // unknown op
});

test('applyBigIntNot: ~0 at each width', () => {
  assert.equal(applyBigIntNot(0n, 8),  0xFFn);
  assert.equal(applyBigIntNot(0n, 16), 0xFFFFn);
  assert.equal(applyBigIntNot(0n, 32), 0xFFFFFFFFn);
  assert.equal(applyBigIntNot(0n, 64), 0xFFFFFFFFFFFFFFFFn);
});

test('applyBigIntNot: ~ self-inverse', () => {
  for (const w of [8, 16, 32, 64]) {
    const x = 0x42n;
    assert.equal(applyBigIntNot(applyBigIntNot(x, w), w), x);
  }
});

// ─── Base parsing / formatting (PR-1) ───────────────────────────

test('parseBigIntInBase: dec', () => {
  assert.equal(parseBigIntInBase('255', 'dec'), 255n);
  assert.equal(parseBigIntInBase('-42', 'dec'), -42n);
  assert.equal(parseBigIntInBase('0', 'dec'), 0n);
});

test('parseBigIntInBase: hex with and without prefix', () => {
  assert.equal(parseBigIntInBase('FF', 'hex'), 0xFFn);
  assert.equal(parseBigIntInBase('0xff', 'hex'), 0xFFn);
  assert.equal(parseBigIntInBase('DEADBEEF', 'hex'), 0xDEADBEEFn);
});

test('parseBigIntInBase: oct + bin', () => {
  assert.equal(parseBigIntInBase('377', 'oct'), 0o377n);
  assert.equal(parseBigIntInBase('0o17', 'oct'), 0o17n);
  assert.equal(parseBigIntInBase('11111111', 'bin'), 0xFFn);
  assert.equal(parseBigIntInBase('0b1010', 'bin'), 10n);
});

test('parseBigIntInBase: rejects invalid digits per base', () => {
  assert.equal(parseBigIntInBase('FG', 'hex'), null);
  assert.equal(parseBigIntInBase('89', 'oct'), null);
  assert.equal(parseBigIntInBase('12', 'bin'), null);
  assert.equal(parseBigIntInBase('1.5', 'dec'), null);
});

test('parseBigIntInBase: caps long input (anti-DoS)', () => {
  const huge = 'F'.repeat(MAX_PROGRAMMER_LENGTH + 1);
  assert.equal(parseBigIntInBase(huge, 'hex'), null);
  // Exactly at cap is accepted
  const atCap = 'F'.repeat(MAX_PROGRAMMER_LENGTH);
  assert.equal(typeof parseBigIntInBase(atCap, 'hex'), 'bigint');
});

test('parseBigIntInBase: rejects empty / non-string', () => {
  assert.equal(parseBigIntInBase('', 'dec'), null);
  assert.equal(parseBigIntInBase(null, 'dec'), null);
  assert.equal(parseBigIntInBase(123, 'dec'), null);
});

test('formatBigIntInBase: dec keeps sign, others mask', () => {
  assert.equal(formatBigIntInBase(-1n, 'dec', 32), '-1');
  assert.equal(formatBigIntInBase(-1n, 'hex', 8), 'FF');
  assert.equal(formatBigIntInBase(-1n, 'bin', 8), '11111111');
  assert.equal(formatBigIntInBase(-1n, 'oct', 8), '377');
});

test('formatBigIntInBase: positive values across widths', () => {
  assert.equal(formatBigIntInBase(255n, 'hex', 32), 'FF');
  assert.equal(formatBigIntInBase(0xDEADBEEFn, 'hex', 32), 'DEADBEEF');
  assert.equal(formatBigIntInBase(10n, 'bin', 32), '1010');
});

test('formatBigIntInBase: invalid input → em dash', () => {
  assert.equal(formatBigIntInBase(null, 'hex', 32), '—');
  assert.equal(formatBigIntInBase(1n, 'hex', 7), '—');
});

test('sanitizeProgrammerValue: caps + rejects junk', () => {
  assert.equal(sanitizeProgrammerValue('255'), '255');
  assert.equal(sanitizeProgrammerValue('-42'), '-42');
  assert.equal(sanitizeProgrammerValue('0'), '0');
  assert.equal(sanitizeProgrammerValue(undefined), '0');
  assert.equal(sanitizeProgrammerValue('hello'), '0');
  assert.equal(sanitizeProgrammerValue('1.5'), '0');
  // Length cap
  assert.equal(sanitizeProgrammerValue('9'.repeat(MAX_PROGRAMMER_LENGTH + 5)).length <= MAX_PROGRAMMER_LENGTH, true);
});
