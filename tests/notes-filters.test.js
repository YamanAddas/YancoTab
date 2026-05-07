/**
 * Tests for notes/engine/filters.js — smart, tag, status, search filters.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyFilter, emptyFilter, tagCounts, smartCounts, SMART_FILTERS,
} from '../os/apps/notes/engine/filters.js';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const T0 = new Date(2026, 4, 7, 14, 0, 0).getTime();

function note(over = {}) {
  return {
    path: over.path || `/n_${Math.random()}.txt`,
    title: over.title || 'Note',
    body: over.body || '',
    meta: { tags: [], pinned: false, status: null, updated: T0 - DAY, ...over.meta },
  };
}

describe('applyFilter', () => {
  test('null filter passes everything except archived', () => {
    const a = note({ path: '/a.txt' });
    const b = note({ path: '/b.txt', meta: { status: 'archived' } });
    const out = applyFilter([a, b]);
    assert.equal(out.length, 1);
    assert.equal(out[0].path, '/a.txt');
  });

  test('non-array → empty', () => {
    assert.deepEqual(applyFilter(null), []);
  });

  test('smart=pinned only matches pinned', () => {
    const notes = [
      note({ path: '/a.txt', meta: { pinned: true } }),
      note({ path: '/b.txt' }),
    ];
    const out = applyFilter(notes, { smart: 'pinned' });
    assert.equal(out.length, 1);
    assert.equal(out[0].path, '/a.txt');
  });

  test('smart=recent matches notes updated within 24h', () => {
    const notes = [
      note({ path: '/a.txt', meta: { updated: T0 - 2 * HOUR } }),
      note({ path: '/b.txt', meta: { updated: T0 - 2 * DAY } }),
    ];
    const out = applyFilter(notes, { smart: 'recent' }, T0);
    assert.equal(out.length, 1);
    assert.equal(out[0].path, '/a.txt');
  });

  test('smart=today matches calendar-day, not last-24h', () => {
    // 25 hours ago is yesterday by calendar but not within 24h window.
    // Today filter is calendar-day-strict.
    const notes = [
      note({ path: '/a.txt', meta: { updated: T0 - 1 * HOUR } }),
      note({ path: '/b.txt', meta: { updated: T0 - 25 * HOUR } }),
      note({ path: '/c.txt', meta: { updated: T0 - 6 * HOUR } }),
    ];
    const out = applyFilter(notes, { smart: 'today' }, T0);
    const paths = out.map((n) => n.path).sort();
    assert.deepEqual(paths, ['/a.txt', '/c.txt']);
  });

  test('smart=done matches status:done', () => {
    const notes = [
      note({ path: '/a.txt', meta: { status: 'done' } }),
      note({ path: '/b.txt', meta: { status: 'idea' } }),
    ];
    const out = applyFilter(notes, { smart: 'done' });
    assert.equal(out.length, 1);
    assert.equal(out[0].path, '/a.txt');
  });

  test('tag filter is case-insensitive substring of tags array', () => {
    const notes = [
      note({ path: '/a.txt', meta: { tags: ['v2.0', 'launch'] } }),
      note({ path: '/b.txt', meta: { tags: ['research'] } }),
    ];
    const out = applyFilter(notes, { tag: 'V2.0' });
    assert.equal(out.length, 1);
    assert.equal(out[0].path, '/a.txt');
  });

  test('status filter matches exactly', () => {
    const notes = [
      note({ path: '/a.txt', meta: { status: 'idea' } }),
      note({ path: '/b.txt', meta: { status: 'draft' } }),
      note({ path: '/c.txt', meta: { status: 'archived' } }),
    ];
    // Explicitly asking for archived should include archived.
    const out = applyFilter(notes, { status: 'archived' });
    assert.equal(out.length, 1);
    assert.equal(out[0].path, '/c.txt');
  });

  test('search matches title or body case-insensitive', () => {
    const notes = [
      note({ path: '/a.txt', title: 'Hex polish', body: 'polish the hex frame' }),
      note({ path: '/b.txt', title: 'Other', body: 'mentions hex elsewhere' }),
      note({ path: '/c.txt', title: 'Done',  body: 'no match' }),
    ];
    const out = applyFilter(notes, { search: 'HEX' });
    assert.equal(out.length, 2);
  });

  test('combined smart + tag + search are conjunctive', () => {
    const notes = [
      note({ path: '/a.txt', body: 'matches', meta: { pinned: true,  tags: ['v2'], updated: T0 - HOUR } }),
      note({ path: '/b.txt', body: 'matches', meta: { pinned: false, tags: ['v2'] } }),
      note({ path: '/c.txt', body: 'no',      meta: { pinned: true,  tags: ['v2'] } }),
    ];
    const out = applyFilter(notes, { smart: 'pinned', tag: 'v2', search: 'matches' }, T0);
    assert.equal(out.length, 1);
    assert.equal(out[0].path, '/a.txt');
  });

  test('archived hidden by default even with other filters active', () => {
    const notes = [
      note({ path: '/a.txt', meta: { pinned: true, status: 'archived' } }),
    ];
    assert.equal(applyFilter(notes, { smart: 'pinned' }).length, 0);
  });

  test('SMART_FILTERS export contains expected list', () => {
    assert.ok(SMART_FILTERS.includes('pinned'));
    assert.ok(SMART_FILTERS.includes('recent'));
    assert.ok(SMART_FILTERS.includes('today'));
    assert.ok(SMART_FILTERS.includes('done'));
  });

  test('emptyFilter is safe to spread', () => {
    const f = emptyFilter();
    assert.equal(f.smart, null);
    assert.equal(f.tag, null);
    assert.equal(f.status, null);
    assert.equal(f.search, '');
  });
});

describe('tagCounts', () => {
  test('groups + sorts by count desc, name asc', () => {
    const notes = [
      note({ meta: { tags: ['a', 'b'] } }),
      note({ meta: { tags: ['a', 'c'] } }),
      note({ meta: { tags: ['a'] } }),
      note({ meta: { tags: ['b'] } }),
    ];
    const out = tagCounts(notes);
    assert.deepEqual(out, [
      { tag: 'a', count: 3 },
      { tag: 'b', count: 2 },
      { tag: 'c', count: 1 },
    ]);
  });

  test('skips archived notes', () => {
    const notes = [
      note({ meta: { tags: ['real'] } }),
      note({ meta: { tags: ['ghost'], status: 'archived' } }),
    ];
    const out = tagCounts(notes);
    assert.deepEqual(out, [{ tag: 'real', count: 1 }]);
  });

  test('non-array → empty', () => {
    assert.deepEqual(tagCounts(null), []);
  });
});

describe('smartCounts', () => {
  test('counts each smart filter category', () => {
    const notes = [
      note({ meta: { pinned: true, updated: T0 - HOUR } }),
      note({ meta: { updated: T0 - 2 * HOUR } }),
      note({ meta: { status: 'done', updated: T0 - 5 * DAY } }), // outside recent window
      note({ meta: { status: 'archived' } }),                     // excluded from totals
    ];
    const out = smartCounts(notes, T0);
    assert.equal(out.pinned, 1);
    assert.equal(out.recent, 2);
    assert.equal(out.done, 1);
    assert.equal(out.total, 3); // archived excluded
  });

  test('non-array → zero counts', () => {
    const out = smartCounts(null);
    assert.equal(out.total, 0);
    assert.equal(out.pinned, 0);
  });
});
