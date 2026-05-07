/**
 * Tests for photos/engine/filters.js — applyFilter, applySort,
 * normalizeFilter, isFilterActive.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyFilter,
  applySort,
  emptyFilter,
  normalizeFilter,
  isFilterActive,
  SMART_FILTERS,
} from '../os/apps/photos/engine/filters.js';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const T0 = new Date(2026, 4, 7, 14, 0, 0).getTime();

function p(over = {}) {
  return {
    path: over.path || '/home/photos/' + Math.random() + '.png',
    name: over.name || 'photo.png',
    displayName: over.displayName || 'photo',
    favorite: !!over.favorite,
    created: over.created ?? (T0 - DAY),
    monthKey: over.monthKey || '2026-05',
    size: over.size ?? 100_000,
    ...over,
  };
}

describe('emptyFilter', () => {
  test('produces neutral filter', () => {
    assert.deepEqual(emptyFilter(), { smart: 'all', search: '', month: null });
  });
});

describe('normalizeFilter', () => {
  test('non-object returns defaults', () => {
    assert.deepEqual(normalizeFilter(null), { smart: 'all', search: '', month: null });
    assert.deepEqual(normalizeFilter(42), { smart: 'all', search: '', month: null });
  });

  test('unknown smart value falls back to all', () => {
    assert.equal(normalizeFilter({ smart: 'bogus' }).smart, 'all');
  });

  test('rejects malformed month strings', () => {
    assert.equal(normalizeFilter({ month: '2026-13' }).month, null);
    assert.equal(normalizeFilter({ month: 'apr' }).month, null);
    assert.equal(normalizeFilter({ month: '2026-04' }).month, '2026-04');
  });

  test('lowercases and trims search', () => {
    assert.equal(normalizeFilter({ search: '  Sunset ' }).search, 'sunset');
  });
});

describe('isFilterActive', () => {
  test('default is inactive', () => {
    assert.equal(isFilterActive(emptyFilter()), false);
  });
  test('any non-default field flips it on', () => {
    assert.equal(isFilterActive({ smart: 'favorites' }), true);
    assert.equal(isFilterActive({ search: 'q' }), true);
    assert.equal(isFilterActive({ month: '2026-04' }), true);
  });
});

describe('applyFilter', () => {
  test('non-array input returns []', () => {
    assert.deepEqual(applyFilter(null, emptyFilter()), []);
    assert.deepEqual(applyFilter(undefined, emptyFilter()), []);
  });

  test('default filter passes everything', () => {
    const arr = [p(), p({ favorite: true }), p({ created: T0 - 30 * DAY })];
    assert.equal(applyFilter(arr, emptyFilter(), { now: T0 }).length, 3);
  });

  test('favorites filter keeps only favorited', () => {
    const arr = [p({ favorite: true, path: '/a' }), p({ favorite: false, path: '/b' })];
    const out = applyFilter(arr, { smart: 'favorites' }, { now: T0 });
    assert.equal(out.length, 1);
    assert.equal(out[0].path, '/a');
  });

  test('recent filter keeps photos within 14 days', () => {
    const arr = [
      p({ path: '/today', created: T0 - 1 * DAY }),
      p({ path: '/twoWeeks', created: T0 - 13 * DAY }),
      p({ path: '/old', created: T0 - 30 * DAY }),
      p({ path: '/edge', created: T0 - 14 * DAY + HOUR }), // just inside
    ];
    const out = applyFilter(arr, { smart: 'recent' }, { now: T0 });
    const paths = out.map((x) => x.path).sort();
    assert.deepEqual(paths, ['/edge', '/today', '/twoWeeks']);
  });

  test('recent filter rejects entries with non-finite created', () => {
    const out = applyFilter([p({ created: undefined })], { smart: 'recent' }, { now: T0 });
    assert.equal(out.length, 0);
  });

  test('month filter narrows by monthKey', () => {
    const arr = [
      p({ path: '/a', monthKey: '2026-04' }),
      p({ path: '/b', monthKey: '2026-05' }),
      p({ path: '/c', monthKey: '2026-04' }),
    ];
    const out = applyFilter(arr, { month: '2026-04' }, { now: T0 });
    assert.equal(out.length, 2);
  });

  test('search matches displayName and name case-insensitively', () => {
    const arr = [
      p({ path: '/a', displayName: 'Sunset over Qasioun', name: 'IMG_0001.png' }),
      p({ path: '/b', displayName: 'Coffee', name: 'coffee.jpg' }),
      p({ path: '/c', displayName: 'Random', name: 'sunset_alt.heic' }),
    ];
    const out = applyFilter(arr, { search: 'sunset' }, { now: T0 });
    const paths = out.map((x) => x.path).sort();
    assert.deepEqual(paths, ['/a', '/c']);
  });

  test('combined filter is conjunctive', () => {
    const arr = [
      p({ path: '/a', favorite: true, monthKey: '2026-04', displayName: 'fav-april' }),
      p({ path: '/b', favorite: false, monthKey: '2026-04' }),
      p({ path: '/c', favorite: true, monthKey: '2026-05' }),
    ];
    const out = applyFilter(arr, { smart: 'favorites', month: '2026-04' }, { now: T0 });
    assert.equal(out.length, 1);
    assert.equal(out[0].path, '/a');
  });

  test('drops null entries silently', () => {
    const arr = [null, p(), undefined, p()];
    assert.equal(applyFilter(arr, emptyFilter(), { now: T0 }).length, 2);
  });
});

describe('applySort', () => {
  test('non-array returns []', () => {
    assert.deepEqual(applySort(null), []);
  });

  test('date (default) sorts newest first', () => {
    const arr = [p({ path: '/old', created: 100 }), p({ path: '/new', created: 500 })];
    const out = applySort(arr);
    assert.equal(out[0].path, '/new');
    assert.equal(out[1].path, '/old');
  });

  test('date-old sorts oldest first', () => {
    const arr = [p({ path: '/new', created: 500 }), p({ path: '/old', created: 100 })];
    const out = applySort(arr, 'date-old');
    assert.equal(out[0].path, '/old');
  });

  test('name sort is locale-aware ascending', () => {
    const arr = [p({ displayName: 'B' }), p({ displayName: 'A' }), p({ displayName: 'a' })];
    const out = applySort(arr, 'name');
    // localeCompare puts 'A' and 'a' adjacent (depends on locale, but A/a < B)
    assert.equal(out[2].displayName, 'B');
  });

  test('size sorts biggest first', () => {
    const arr = [p({ size: 100 }), p({ size: 999 }), p({ size: 50 })];
    const out = applySort(arr, 'size');
    assert.equal(out[0].size, 999);
    assert.equal(out[2].size, 50);
  });

  test('unknown mode falls back to date', () => {
    const arr = [p({ path: '/old', created: 100 }), p({ path: '/new', created: 500 })];
    const out = applySort(arr, 'bogus');
    assert.equal(out[0].path, '/new');
  });

  test('does not mutate input array', () => {
    const arr = [p({ created: 100 }), p({ created: 500 })];
    const before = arr.map((x) => x.created).join(',');
    applySort(arr);
    assert.equal(arr.map((x) => x.created).join(','), before);
  });
});

describe('SMART_FILTERS export', () => {
  test('contains expected ids', () => {
    assert.deepEqual([...SMART_FILTERS].sort(), ['all', 'favorites', 'recent']);
  });
});
