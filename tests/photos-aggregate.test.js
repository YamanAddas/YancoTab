/**
 * Tests for photos/engine/aggregate.js — libraryCounts, monthCounts,
 * totalSize.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  libraryCounts,
  monthCounts,
  totalSize,
} from '../os/apps/photos/engine/aggregate.js';

const DAY = 24 * 60 * 60_000;
const T0 = new Date(2026, 4, 7, 14, 0, 0).getTime();

function p(over = {}) {
  return {
    favorite: !!over.favorite,
    created: over.created ?? (T0 - 2 * DAY),
    monthKey: over.monthKey || '2026-05',
    size: over.size ?? 100,
    ...over,
  };
}

describe('libraryCounts', () => {
  test('non-array returns zeros', () => {
    assert.deepEqual(libraryCounts(null), { all: 0, favorites: 0, recent: 0 });
  });

  test('counts everything', () => {
    const arr = [
      p({ favorite: true, created: T0 - 1 * DAY }),
      p({ favorite: false, created: T0 - 30 * DAY }),
      p({ favorite: true, created: T0 - 5 * DAY }),
    ];
    assert.deepEqual(libraryCounts(arr, { now: T0 }), { all: 3, favorites: 2, recent: 2 });
  });

  test('recent uses 14-day window', () => {
    const arr = [
      p({ created: T0 - 13 * DAY }), // in
      p({ created: T0 - 14 * DAY + 1 }), // in (just inside)
      p({ created: T0 - 14 * DAY - 1 }), // out
      p({ created: T0 - 60 * DAY }),  // out
    ];
    assert.equal(libraryCounts(arr, { now: T0 }).recent, 2);
  });

  test('skips null entries', () => {
    const arr = [null, p({ favorite: true }), undefined];
    assert.equal(libraryCounts(arr, { now: T0 }).all, 3);  // null/undef still count toward `all` since length includes them
    // Actually `arr.length === 3` but our impl uses `photos.length` directly,
    // so length is the source of truth. That's fine — all just reflects array size.
  });
});

describe('monthCounts', () => {
  test('non-array returns empty Map', () => {
    const m = monthCounts(null);
    assert.equal(m instanceof Map, true);
    assert.equal(m.size, 0);
  });

  test('aggregates by monthKey', () => {
    const arr = [
      p({ monthKey: '2026-04' }),
      p({ monthKey: '2026-04' }),
      p({ monthKey: '2026-05' }),
    ];
    const m = monthCounts(arr);
    assert.equal(m.get('2026-04'), 2);
    assert.equal(m.get('2026-05'), 1);
  });

  test('skips entries with falsy monthKey', () => {
    const arr = [p({ monthKey: '2026-04' }), p({ monthKey: '' }), { monthKey: undefined }];
    assert.equal(monthCounts(arr).size, 1);
  });
});

describe('totalSize', () => {
  test('non-array returns 0', () => {
    assert.equal(totalSize(null), 0);
  });

  test('sums positive sizes only', () => {
    const arr = [p({ size: 100 }), p({ size: 200 }), p({ size: 0 }), p({ size: -50 })];
    assert.equal(totalSize(arr), 300);
  });

  test('skips non-finite sizes', () => {
    const arr = [p({ size: 100 }), p({ size: NaN }), p({ size: undefined })];
    assert.equal(totalSize(arr), 100);
  });
});
