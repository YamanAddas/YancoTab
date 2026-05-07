/**
 * Tests for Calculator Date mode helpers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveDate, toIsoDate,
  addDays, addWeeks, addMonths, addYears,
  applyDateDelta, diffDays,
} from '../os/apps/calculator/date.js';

// ─── Parsing / formatting ───────────────────────────────────────

test('resolveDate: ISO string parses at UTC midnight', () => {
  const d = resolveDate('2026-05-07');
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 4);
  assert.equal(d.getUTCDate(), 7);
  assert.equal(d.getUTCHours(), 0);
});

test('resolveDate: today sentinel uses now', () => {
  const ref = new Date('2026-05-07T12:34:56Z');
  const d = resolveDate('today', ref);
  assert.equal(d.getUTCDate(), 7);
  assert.equal(d.getUTCHours(), 0);  // start of UTC day
});

test('resolveDate: invalid input → null', () => {
  assert.equal(resolveDate('not-a-date'), null);
  assert.equal(resolveDate('2026/05/07'), null);
  assert.equal(resolveDate(null), null);
});

test('toIsoDate: roundtrip with resolveDate', () => {
  const d = resolveDate('2026-08-05');
  assert.equal(toIsoDate(d), '2026-08-05');
});

test('toIsoDate: invalid → empty string', () => {
  assert.equal(toIsoDate(null), '');
  assert.equal(toIsoDate(new Date('not-a-date')), '');
});

// ─── addDays / addWeeks ─────────────────────────────────────────

test('addDays: positive + negative', () => {
  const d = resolveDate('2026-05-07');
  assert.equal(toIsoDate(addDays(d, 1)),  '2026-05-08');
  assert.equal(toIsoDate(addDays(d, 90)), '2026-08-05');
  assert.equal(toIsoDate(addDays(d, -7)), '2026-04-30');
});

test('addWeeks: 1 week = 7 days', () => {
  const d = resolveDate('2026-05-07');
  assert.equal(toIsoDate(addWeeks(d, 1)), '2026-05-14');
  assert.equal(toIsoDate(addWeeks(d, 4)), '2026-06-04');
});

test('addDays: across DST boundary stays UTC-clean', () => {
  // US DST 2026: starts Mar 8, ends Nov 1
  const d = resolveDate('2026-03-07');
  assert.equal(toIsoDate(addDays(d, 1)), '2026-03-08');
  assert.equal(toIsoDate(addDays(d, 2)), '2026-03-09');
});

// ─── addMonths (clamp-to-month-end) ─────────────────────────────

test('addMonths: simple cases', () => {
  assert.equal(toIsoDate(addMonths(resolveDate('2026-05-07'), 1)), '2026-06-07');
  assert.equal(toIsoDate(addMonths(resolveDate('2026-12-15'), 1)), '2027-01-15');
  assert.equal(toIsoDate(addMonths(resolveDate('2026-01-15'), -1)), '2025-12-15');
});

test('addMonths: Jan 31 + 1mo → Feb 28 (non-leap)', () => {
  // 2026 is non-leap
  assert.equal(toIsoDate(addMonths(resolveDate('2026-01-31'), 1)), '2026-02-28');
});

test('addMonths: Jan 31 + 1mo → Feb 29 (leap year 2024)', () => {
  assert.equal(toIsoDate(addMonths(resolveDate('2024-01-31'), 1)), '2024-02-29');
});

test('addMonths: Jan 31 + 13 mo → Feb 28 of next-next year', () => {
  // 2026-01-31 + 13mo = 2027-02-28
  assert.equal(toIsoDate(addMonths(resolveDate('2026-01-31'), 13)), '2027-02-28');
});

test('addMonths: Mar 31 + 1mo → Apr 30 (clamp-to-month-end)', () => {
  assert.equal(toIsoDate(addMonths(resolveDate('2026-03-31'), 1)), '2026-04-30');
});

test('addMonths: 0-month no-op', () => {
  assert.equal(toIsoDate(addMonths(resolveDate('2026-05-07'), 0)), '2026-05-07');
});

// ─── addYears (year-end leap clamp) ─────────────────────────────

test('addYears: simple', () => {
  assert.equal(toIsoDate(addYears(resolveDate('2026-05-07'), 1)),  '2027-05-07');
  assert.equal(toIsoDate(addYears(resolveDate('2026-05-07'), -1)), '2025-05-07');
});

test('addYears: Feb 29 2024 + 1y → Feb 28 2025 (clamp)', () => {
  assert.equal(toIsoDate(addYears(resolveDate('2024-02-29'), 1)), '2025-02-28');
});

test('addYears: Feb 29 2024 + 4y → Feb 29 2028 (leap)', () => {
  assert.equal(toIsoDate(addYears(resolveDate('2024-02-29'), 4)), '2028-02-29');
});

// ─── applyDateDelta dispatcher ──────────────────────────────────

test('applyDateDelta: routes by unit', () => {
  const d = resolveDate('2026-05-07');
  assert.equal(toIsoDate(applyDateDelta(d, 1, 'd')),  '2026-05-08');
  assert.equal(toIsoDate(applyDateDelta(d, 1, 'w')),  '2026-05-14');
  assert.equal(toIsoDate(applyDateDelta(d, 1, 'mo')), '2026-06-07');
  assert.equal(toIsoDate(applyDateDelta(d, 1, 'y')),  '2027-05-07');
});

test('applyDateDelta: invalid unit → null', () => {
  assert.equal(applyDateDelta(resolveDate('2026-05-07'), 1, 'bogus'), null);
});

// ─── diffDays ───────────────────────────────────────────────────

test('diffDays: same day = 0', () => {
  const d = resolveDate('2026-05-07');
  assert.equal(diffDays(d, d), 0);
});

test('diffDays: positive (to later than from)', () => {
  const from = resolveDate('2026-05-07');
  const to   = resolveDate('2026-08-05');
  assert.equal(diffDays(from, to), 90);
});

test('diffDays: negative (to before from)', () => {
  const from = resolveDate('2026-08-05');
  const to   = resolveDate('2026-05-07');
  assert.equal(diffDays(from, to), -90);
});

test('diffDays: leap year crossing — 2024-02-28 → 2024-03-01 = 2 days', () => {
  assert.equal(diffDays(resolveDate('2024-02-28'), resolveDate('2024-03-01')), 2);
});

test('diffDays: non-leap year crossing — 2026-02-28 → 2026-03-01 = 1 day', () => {
  assert.equal(diffDays(resolveDate('2026-02-28'), resolveDate('2026-03-01')), 1);
});

test('diffDays: invalid input → NaN', () => {
  assert.ok(Number.isNaN(diffDays(null, resolveDate('2026-05-07'))));
  assert.ok(Number.isNaN(diffDays(resolveDate('2026-05-07'), null)));
});
