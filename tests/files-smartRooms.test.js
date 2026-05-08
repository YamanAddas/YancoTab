/**
 * Tests for files/engine/smartRooms.js — applySmart, smartCounts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  applySmart, smartCounts, emptyFilter, SMART_ROOMS,
} from '../os/apps/files/engine/smartRooms.js';

const DAY = 24 * 60 * 60_000;
const T0 = new Date(2026, 4, 8, 12, 0).getTime();

function f(over = {}) {
  return {
    isDir: false,
    path: over.path || '/x',
    size: over.size ?? 1024,
    modified: over.modified ?? (T0 - 2 * DAY),
    pinned: !!over.pinned,
    ...over,
  };
}

function dir(path) {
  return { isDir: true, path, size: 0, modified: T0, pinned: false };
}

describe('emptyFilter', () => {
  test('returns { smart: null }', () => {
    assert.deepEqual(emptyFilter(), { smart: null });
  });
});

describe('applySmart', () => {
  test('null smart returns input', () => {
    const arr = [f({ path: '/a' }), dir('/b')];
    assert.equal(applySmart(arr, null).length, 2);
  });

  test('non-array returns []', () => {
    assert.deepEqual(applySmart(null, 'recent'), []);
  });

  test('recent: files modified within 14d, no dirs', () => {
    const arr = [
      f({ path: '/old', modified: T0 - 30 * DAY }),
      f({ path: '/new', modified: T0 - 1 * DAY }),
      f({ path: '/edge', modified: T0 - 14 * DAY + 1 }),
      dir('/d'), // dropped
    ];
    const out = applySmart(arr, 'recent', { now: T0 });
    assert.deepEqual(out.map((x) => x.path).sort(), ['/edge', '/new']);
  });

  test('pinned: only items with pinned flag', () => {
    const arr = [f({ path: '/a', pinned: true }), f({ path: '/b' }),
      { isDir: true, path: '/d', pinned: true, size: 0 }];
    const out = applySmart(arr, 'pinned', { now: T0 });
    assert.deepEqual(out.map((x) => x.path).sort(), ['/a', '/d']);
  });

  test('forgotten: > 90 days unmodified, not pinned', () => {
    const arr = [
      f({ path: '/recent', modified: T0 - 5 * DAY }),
      f({ path: '/forgotten', modified: T0 - 100 * DAY }),
      f({ path: '/pinned-old', modified: T0 - 100 * DAY, pinned: true }),
      f({ path: '/no-mod', modified: 0 }),
      dir('/d'),
    ];
    const out = applySmart(arr, 'forgotten', { now: T0 });
    assert.deepEqual(out.map((x) => x.path).sort(), ['/forgotten']);
  });

  test('heavy: top 10% by size, with 1MB floor', () => {
    // Mix of small files; even the biggest is under 1MB → empty heavy
    const arr = [
      f({ path: '/a', size: 100 }),
      f({ path: '/b', size: 200 }),
      f({ path: '/c', size: 300 }),
    ];
    assert.equal(applySmart(arr, 'heavy', { now: T0 }).length, 0);

    // With one 5MB file + many small → just the 5MB is heavy
    const arr2 = [
      f({ path: '/big', size: 5 * 1024 * 1024 }),
      ...Array.from({ length: 20 }, (_, i) => f({ path: `/s${i}`, size: 1024 })),
    ];
    const heavy = applySmart(arr2, 'heavy', { now: T0 });
    assert.equal(heavy.length, 1);
    assert.equal(heavy[0].path, '/big');

    // Heavy still drops directories
    const arr3 = [...arr2, dir('/lots')];
    const heavy3 = applySmart(arr3, 'heavy', { now: T0 });
    assert.equal(heavy3.length, 1);
    assert.equal(heavy3[0].path, '/big');
  });

  test('unknown smart id returns input unchanged', () => {
    const arr = [f(), dir('/d')];
    assert.equal(applySmart(arr, 'bogus').length, 2);
  });
});

describe('smartCounts', () => {
  test('returns counts for all 4 rooms', () => {
    const arr = [
      f({ path: '/a', modified: T0 - 1 * DAY }),
      f({ path: '/b', modified: T0 - 100 * DAY }),
      f({ path: '/c', pinned: true }),
      f({ path: '/d', size: 5 * 1024 * 1024 }),
    ];
    const c = smartCounts(arr, { now: T0 });
    assert.ok(c.recent >= 1);
    assert.ok(c.forgotten >= 1);
    assert.ok(c.pinned >= 1);
    assert.ok(c.heavy >= 1);
  });
});

describe('SMART_ROOMS', () => {
  test('lists all 4 ids', () => {
    assert.deepEqual([...SMART_ROOMS].sort(), ['forgotten', 'heavy', 'pinned', 'recent']);
  });
});
