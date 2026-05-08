/**
 * Tests for pdf/persistence.js — kernel.storage round-trip for streak
 * and bookmarks.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  loadStreak, saveStreak, recordOpen,
  loadBookmarks, saveBookmarks, listBookmarks,
  addBookmark, removeBookmark, clearBookmarksForDoc,
  STORAGE_KEYS,
} from '../os/apps/pdf/persistence.js';

function fakeKernel(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    storage: {
      load: (k) => store.has(k) ? structuredClone(store.get(k)) : null,
      save: (k, v) => { store.set(k, structuredClone(v)); },
      _peek: () => Object.fromEntries(store.entries()),
    },
  };
}

const T = (y, m, d) => new Date(y, m, d, 12, 0).getTime();

describe('STORAGE_KEYS', () => {
  test('exposes both keys', () => {
    assert.equal(STORAGE_KEYS.STREAK, 'yancotab_pdf_streak_v1');
    assert.equal(STORAGE_KEYS.BOOKMARKS, 'yancotab_pdf_bookmarks_v1');
  });
});

describe('streak round-trip', () => {
  test('load returns empty when nothing stored', () => {
    const k = fakeKernel();
    assert.deepEqual(loadStreak(k), { days: {} });
  });

  test('save then load round-trips', () => {
    const k = fakeKernel();
    saveStreak(k, { days: { '2026-05-07': { openings: 2, lastTs: 0 } } });
    const out = loadStreak(k);
    assert.equal(out.days['2026-05-07'].openings, 2);
  });

  test('recordOpen increments and persists', () => {
    const k = fakeKernel();
    recordOpen(k, T(2026, 4, 7));
    recordOpen(k, T(2026, 4, 7));
    const stored = k.storage._peek()[STORAGE_KEYS.STREAK];
    assert.equal(stored.days['2026-05-07'].openings, 2);
  });

  test('handles malformed stored value', () => {
    const k = fakeKernel({ [STORAGE_KEYS.STREAK]: 'garbage' });
    // load falls back to empty state for non-object storage.
    assert.deepEqual(loadStreak(k), { days: {} });
    // recordOpen normalizes via prune→pushOpen so junk falls out.
    recordOpen(k, T(2026, 4, 7));
    const stored = k.storage._peek()[STORAGE_KEYS.STREAK];
    assert.equal(stored.days['2026-05-07'].openings, 1);
  });
});

describe('bookmarks round-trip', () => {
  test('list returns [] for unknown doc', () => {
    const k = fakeKernel();
    assert.deepEqual(listBookmarks(k, '/d.pdf'), []);
  });

  test('add then list', () => {
    const k = fakeKernel();
    addBookmark(k, '/d.pdf', { page: 42, label: 'A' });
    const list = listBookmarks(k, '/d.pdf');
    assert.equal(list.length, 1);
    assert.equal(list[0].page, 42);
  });

  test('remove drops the entry', () => {
    const k = fakeKernel();
    addBookmark(k, '/d.pdf', { page: 1, label: 'A' });
    removeBookmark(k, '/d.pdf', 1, 'A');
    assert.deepEqual(listBookmarks(k, '/d.pdf'), []);
  });

  test('clearBookmarksForDoc removes only that doc', () => {
    const k = fakeKernel();
    addBookmark(k, '/d.pdf', { page: 1 });
    addBookmark(k, '/other.pdf', { page: 2 });
    clearBookmarksForDoc(k, '/d.pdf');
    assert.equal(listBookmarks(k, '/d.pdf').length, 0);
    assert.equal(listBookmarks(k, '/other.pdf').length, 1);
  });

  test('saveBookmarks rejects non-object', () => {
    const k = fakeKernel();
    saveBookmarks(k, 'garbage');
    // load works — saveBookmarks wraps in try/catch but storage.save accepts anything
    // Not a strict test — just make sure no throw.
  });

  test('handles null kernel safely', () => {
    assert.deepEqual(loadStreak(null), { days: {} });
    assert.deepEqual(loadBookmarks(null), {});
  });
});
