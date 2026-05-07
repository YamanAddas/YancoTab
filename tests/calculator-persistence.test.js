/**
 * Tests for Calculator persistence v4 + migration chain.
 *
 * Uses an in-memory kernel.storage stub so the tests are pure.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  loadCalculatorState, saveCalculatorState,
  STORAGE_KEY, LEGACY_KEY_V3, LEGACY_KEY_V2, LEGACY_KEY_V1,
} from '../os/apps/calculator/persistence.js';

function makeKernel(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    storage: {
      load: (k) => store.get(k) ?? null,
      save: (k, v) => { store.set(k, v); },
    },
    _store: store,
  };
}

// ─── Defaults ───────────────────────────────────────────────────

test('loadCalculatorState: empty store → defaults', () => {
  const k = makeKernel();
  const s = loadCalculatorState(k);
  assert.equal(s.angleMode, 'rad');
  assert.equal(s.mode, 'standard');
  assert.deepEqual(s.tape, []);
  assert.deepEqual(s.vars, {});
  assert.equal(s.bitWidth, 32);
  assert.equal(s.programmerValue, '0');
  assert.equal(s.dateFrom, 'today');
  assert.equal(s.dateDeltaUnit, 'd');
});

// ─── v4 round-trip ──────────────────────────────────────────────

test('save/load v4: round-trip preserves all fields', () => {
  const k = makeKernel();
  saveCalculatorState(k, {
    angleMode: 'deg',
    tape: [{ ts: 1, expr: '1+1', result: '2' }],
    vars: { tax: 0.16 },
    mode: 'programmer',
    secondMode: true,
    programmerBase: 'hex',
    bitWidth: 64,
    programmerValue: '255',
    dateFrom: '2026-05-07',
    dateTo: '2026-08-05',
    dateDelta: 90,
    dateDeltaUnit: 'd',
    dateOp: '+',
  });
  const s = loadCalculatorState(k);
  assert.equal(s.angleMode, 'deg');
  assert.equal(s.tape.length, 1);
  assert.deepEqual(s.vars, { tax: 0.16 });
  assert.equal(s.mode, 'programmer');
  assert.equal(s.secondMode, true);
  assert.equal(s.programmerBase, 'hex');
  assert.equal(s.bitWidth, 64);
  assert.equal(s.programmerValue, '255');
  assert.equal(s.dateFrom, '2026-05-07');
  assert.equal(s.dateTo, '2026-08-05');
  assert.equal(s.dateDelta, 90);
});

// ─── v3 → v4 migration ──────────────────────────────────────────

test('migrate v3 → v4: preserves v3 fields, fills v4 defaults', () => {
  const k = makeKernel({
    [LEGACY_KEY_V3]: {
      angleMode: 'deg',
      tape: [{ ts: 9, expr: 'sin(0)', result: '0' }],
      vars: { rent: 850 },
      mode: 'scientific',
      secondMode: true,
      programmerBase: 'hex',
    },
  });
  const s = loadCalculatorState(k);
  // v3 fields preserved
  assert.equal(s.angleMode, 'deg');
  assert.equal(s.tape.length, 1);
  assert.deepEqual(s.vars, { rent: 850 });
  assert.equal(s.mode, 'scientific');
  assert.equal(s.secondMode, true);
  assert.equal(s.programmerBase, 'hex');
  // v4 fields default
  assert.equal(s.bitWidth, 32);
  assert.equal(s.programmerValue, '0');
  assert.equal(s.dateFrom, 'today');
  assert.equal(s.dateDeltaUnit, 'd');
  // Migration write should have occurred
  assert.ok(k._store.has(STORAGE_KEY));
});

// ─── v2 → v4 migration ──────────────────────────────────────────

test('migrate v2 → v4: preserves angleMode + tape', () => {
  const k = makeKernel({
    [LEGACY_KEY_V2]: {
      angleMode: 'deg',
      tape: [{ ts: 9, expr: '12+30', result: '42' }],
    },
  });
  const s = loadCalculatorState(k);
  assert.equal(s.angleMode, 'deg');
  assert.equal(s.tape.length, 1);
  assert.equal(s.tape[0].result, '42');
  assert.deepEqual(s.vars, {});
  assert.equal(s.mode, 'standard');
  assert.ok(k._store.has(STORAGE_KEY));
});

// ─── v1 → v4 migration ──────────────────────────────────────────

test('migrate v1 → v4: history rows become tape entries with ts:0', () => {
  const k = makeKernel({
    [LEGACY_KEY_V1]: {
      angleMode: 'rad',
      history: [
        { expression: '7+3', result: '10' },
        { expression: '2*3', result: '6' },
      ],
    },
  });
  const s = loadCalculatorState(k);
  assert.equal(s.tape.length, 2);
  assert.equal(s.tape[0].ts, 0);
  assert.equal(s.tape[0].expr, '7+3');
  assert.equal(s.tape[0].result, '10');
});

// ─── Sanitization ───────────────────────────────────────────────

test('load: invalid mode → standard', () => {
  const k = makeKernel({ [STORAGE_KEY]: { mode: 'wat', programmerBase: 'lol' } });
  const s = loadCalculatorState(k);
  assert.equal(s.mode, 'standard');
  assert.equal(s.programmerBase, 'dec');
});

test('load: invalid bitWidth → 32', () => {
  const k = makeKernel({ [STORAGE_KEY]: { bitWidth: 7 } });
  const s = loadCalculatorState(k);
  assert.equal(s.bitWidth, 32);
});

test('load: malicious long programmerValue is rejected', () => {
  const k = makeKernel({ [STORAGE_KEY]: { programmerValue: '9'.repeat(10000) } });
  const s = loadCalculatorState(k);
  // Sanitize cuts to MAX_PROGRAMMER_LENGTH then tries to parse;
  // anything not a clean dec BigInt string falls back to '0'.
  assert.equal(s.programmerValue.length <= 80, true);
});

test('load: invalid date strings → today sentinel', () => {
  const k = makeKernel({
    [STORAGE_KEY]: { dateFrom: 'not-a-date', dateTo: '2026/05/07' },
  });
  const s = loadCalculatorState(k);
  assert.equal(s.dateFrom, 'today');
  assert.equal(s.dateTo, 'today');
});

test('load: ISO date strings preserved', () => {
  const k = makeKernel({
    [STORAGE_KEY]: { dateFrom: '2026-05-07', dateTo: '2026-12-31' },
  });
  const s = loadCalculatorState(k);
  assert.equal(s.dateFrom, '2026-05-07');
  assert.equal(s.dateTo, '2026-12-31');
});

test('load: negative dateDelta clamped to 0', () => {
  const k = makeKernel({ [STORAGE_KEY]: { dateDelta: -5 } });
  const s = loadCalculatorState(k);
  assert.equal(s.dateDelta, 0);
});

test('load: invalid dateOp → "+"', () => {
  const k = makeKernel({ [STORAGE_KEY]: { dateOp: 'bogus' } });
  const s = loadCalculatorState(k);
  assert.equal(s.dateOp, '+');
});

test('load: invalid dateDeltaUnit → "d"', () => {
  const k = makeKernel({ [STORAGE_KEY]: { dateDeltaUnit: 'centuries' } });
  const s = loadCalculatorState(k);
  assert.equal(s.dateDeltaUnit, 'd');
});

// ─── v4 wins over legacy when both present ──────────────────────

test('v4 takes precedence over v3 when both present', () => {
  const k = makeKernel({
    [STORAGE_KEY]: { angleMode: 'rad', mode: 'date' },
    [LEGACY_KEY_V3]: { angleMode: 'deg', mode: 'scientific' },
  });
  const s = loadCalculatorState(k);
  assert.equal(s.angleMode, 'rad');
  assert.equal(s.mode, 'date');
});
