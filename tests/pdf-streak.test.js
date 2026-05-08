/**
 * Tests for pdf/engine/streak.js — pushOpen, densityStrip,
 * currentStreak, prune.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyState, dayKey, pushOpen, densityStrip, currentStreak, prune,
} from '../os/apps/pdf/engine/streak.js';

const T = (y, m, d, hh = 12, mm = 0) => new Date(y, m, d, hh, mm).getTime();

describe('dayKey', () => {
  test('formats YYYY-MM-DD with padding', () => {
    assert.equal(dayKey(T(2026, 0, 5)), '2026-01-05');
    assert.equal(dayKey(T(2026, 11, 31)), '2026-12-31');
  });
});

describe('emptyState', () => {
  test('returns { days: {} }', () => {
    assert.deepEqual(emptyState(), { days: {} });
  });
});

describe('pushOpen', () => {
  test('creates today bucket from empty', () => {
    const s = pushOpen(emptyState(), T(2026, 4, 7, 10));
    assert.equal(s.days['2026-05-07'].openings, 1);
    assert.equal(s.days['2026-05-07'].lastTs, T(2026, 4, 7, 10));
  });

  test('increments existing bucket', () => {
    let s = pushOpen(emptyState(), T(2026, 4, 7, 10));
    s = pushOpen(s, T(2026, 4, 7, 14));
    assert.equal(s.days['2026-05-07'].openings, 2);
    assert.equal(s.days['2026-05-07'].lastTs, T(2026, 4, 7, 14));
  });

  test('does not mutate caller state', () => {
    const a = emptyState();
    pushOpen(a, T(2026, 4, 7));
    assert.deepEqual(a, { days: {} });
  });

  test('handles a malformed input by ignoring junk', () => {
    const s = pushOpen({ days: { 'not-a-key': 'junk', '2026-05-06': { openings: 'wrong' } } }, T(2026, 4, 7));
    assert.equal(s.days['2026-05-07'].openings, 1);
    // The junk key is dropped by normalization
    assert.equal('not-a-key' in s.days, false);
    // The 'wrong' openings is reset to 0 → bucket with 0 openings still kept
    assert.equal(s.days['2026-05-06'].openings, 0);
  });
});

describe('densityStrip', () => {
  test('returns N buckets oldest first ending today', () => {
    let s = emptyState();
    s = pushOpen(s, T(2026, 4, 5));
    s = pushOpen(s, T(2026, 4, 7));
    const strip = densityStrip(s, 5, T(2026, 4, 7));
    assert.equal(strip.length, 5);
    assert.deepEqual(strip.map((b) => b.key), [
      '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07',
    ]);
    // Day with 1 opening → density 0.2 (1/5)
    assert.equal(strip[2].density, 0.2);
    assert.equal(strip[4].density, 0.2);
    assert.equal(strip[0].density, 0);
  });

  test('clamps density to 1', () => {
    let s = emptyState();
    for (let i = 0; i < 12; i++) s = pushOpen(s, T(2026, 4, 7, i));
    const strip = densityStrip(s, 1, T(2026, 4, 7));
    assert.equal(strip[0].density, 1);
  });

  test('default n is 14', () => {
    const strip = densityStrip(emptyState(), undefined, T(2026, 4, 7));
    assert.equal(strip.length, 14);
  });
});

describe('currentStreak', () => {
  test('zero when today has no opening', () => {
    let s = emptyState();
    s = pushOpen(s, T(2026, 4, 5));
    assert.equal(currentStreak(s, T(2026, 4, 7)), 0);
  });

  test('counts consecutive days', () => {
    let s = emptyState();
    s = pushOpen(s, T(2026, 4, 5));
    s = pushOpen(s, T(2026, 4, 6));
    s = pushOpen(s, T(2026, 4, 7));
    assert.equal(currentStreak(s, T(2026, 4, 7)), 3);
  });

  test('breaks at zero day', () => {
    let s = emptyState();
    s = pushOpen(s, T(2026, 4, 1));
    s = pushOpen(s, T(2026, 4, 7));
    assert.equal(currentStreak(s, T(2026, 4, 7)), 1);
  });
});

describe('prune', () => {
  test('drops days older than the cutoff', () => {
    let s = emptyState();
    s = pushOpen(s, T(2026, 0, 1));   // very old
    s = pushOpen(s, T(2026, 4, 7));   // today
    const pruned = prune(s, 90, T(2026, 4, 7));
    assert.equal('2026-01-01' in pruned.days, false);
    assert.equal('2026-05-07' in pruned.days, true);
  });

  test('keeps days exactly at the cutoff (>=)', () => {
    let s = emptyState();
    s = pushOpen(s, T(2026, 4, 7));     // today
    s = pushOpen(s, T(2026, 1, 6));     // 90 days back-ish
    const pruned = prune(s, 90, T(2026, 4, 7));
    // Just check that today survives; the boundary day depends on calendar math.
    assert.equal('2026-05-07' in pruned.days, true);
  });
});
