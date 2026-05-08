/**
 * Tests for files/persistence.js — pinned + view/sort prefs.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  loadPinned, savePinned, togglePin, removePin, renamePin,
  loadViewMode, saveViewMode, loadSortMode, saveSortMode,
  STORAGE_KEYS, VAULT_VIEWS,
} from '../os/apps/files/persistence.js';

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

describe('STORAGE_KEYS', () => {
  test('exposes the canonical keys', () => {
    assert.equal(STORAGE_KEYS.PINNED, 'yancotab_files_pinned_v1');
    assert.equal(STORAGE_KEYS.VIEW, 'yancotab_files_view');
    assert.equal(STORAGE_KEYS.SORT, 'yancotab_files_sort');
  });
});

describe('loadPinned / savePinned', () => {
  test('load returns empty Set when nothing stored', () => {
    const k = fakeKernel();
    const s = loadPinned(k);
    assert.equal(s instanceof Set, true);
    assert.equal(s.size, 0);
  });

  test('load round-trips paths from storage', () => {
    const k = fakeKernel({ yancotab_files_pinned_v1: { paths: ['/a', '/b'] } });
    const s = loadPinned(k);
    assert.equal(s.size, 2);
    assert.equal(s.has('/a'), true);
  });

  test('drops non-string entries', () => {
    const k = fakeKernel({ yancotab_files_pinned_v1: { paths: ['/a', 42, null, '/b'] } });
    assert.equal(loadPinned(k).size, 2);
  });

  test('handles malformed storage gracefully', () => {
    const k = fakeKernel({ yancotab_files_pinned_v1: 'garbage' });
    assert.equal(loadPinned(k).size, 0);
  });

  test('save persists Set as paths array', () => {
    const k = fakeKernel();
    savePinned(k, new Set(['/a', '/b']));
    const stored = k.storage._peek().yancotab_files_pinned_v1;
    assert.deepEqual([...stored.paths].sort(), ['/a', '/b']);
  });

  test('save ignores non-Set input', () => {
    const k = fakeKernel();
    savePinned(k, ['/a']);
    assert.equal(k.storage._peek().yancotab_files_pinned_v1, undefined);
  });

  test('null kernel safe', () => {
    assert.equal(loadPinned(null).size, 0);
  });
});

describe('togglePin', () => {
  test('adds when absent → returns true', () => {
    const k = fakeKernel();
    assert.equal(togglePin(k, '/a'), true);
    assert.deepEqual(k.storage._peek().yancotab_files_pinned_v1.paths, ['/a']);
  });
  test('removes when present → returns false', () => {
    const k = fakeKernel({ yancotab_files_pinned_v1: { paths: ['/a'] } });
    assert.equal(togglePin(k, '/a'), false);
    assert.deepEqual(k.storage._peek().yancotab_files_pinned_v1.paths, []);
  });
  test('rejects empty / non-string path', () => {
    const k = fakeKernel();
    assert.equal(togglePin(k, ''), false);
    assert.equal(togglePin(k, null), false);
    assert.equal(togglePin(k, 42), false);
  });
});

describe('removePin / renamePin', () => {
  test('removePin drops by path', () => {
    const k = fakeKernel({ yancotab_files_pinned_v1: { paths: ['/a', '/b'] } });
    removePin(k, '/a');
    assert.deepEqual(k.storage._peek().yancotab_files_pinned_v1.paths, ['/b']);
  });
  test('renamePin rewrites the stored path', () => {
    const k = fakeKernel({ yancotab_files_pinned_v1: { paths: ['/old', '/keep'] } });
    renamePin(k, '/old', '/new');
    const paths = k.storage._peek().yancotab_files_pinned_v1.paths.sort();
    assert.deepEqual(paths, ['/keep', '/new']);
  });
  test('renamePin no-op for missing oldPath', () => {
    const k = fakeKernel({ yancotab_files_pinned_v1: { paths: ['/keep'] } });
    renamePin(k, '/missing', '/new');
    assert.deepEqual(k.storage._peek().yancotab_files_pinned_v1.paths, ['/keep']);
  });
});

describe('view / sort prefs', () => {
  test('loadViewMode default is honeycomb', () => {
    const k = fakeKernel();
    assert.equal(loadViewMode(k), 'honeycomb');
  });
  test('loadViewMode rejects unknown values', () => {
    const k = fakeKernel({ yancotab_files_view: 'gallery' });
    assert.equal(loadViewMode(k), 'honeycomb');
  });
  test('saveViewMode round-trips for valid views', () => {
    const k = fakeKernel();
    for (const m of VAULT_VIEWS) {
      saveViewMode(k, m);
      assert.equal(loadViewMode(k), m);
    }
  });
  test('saveViewMode ignores unknown values', () => {
    const k = fakeKernel({ yancotab_files_view: 'list' });
    saveViewMode(k, 'gallery');
    assert.equal(loadViewMode(k), 'list');
  });
  test('loadSortMode default is name', () => {
    const k = fakeKernel();
    assert.equal(loadSortMode(k), 'name');
  });
  test('saveSortMode round-trips strings', () => {
    const k = fakeKernel();
    saveSortMode(k, 'date');
    assert.equal(loadSortMode(k), 'date');
  });
  test('saveSortMode rejects empty / non-string', () => {
    const k = fakeKernel({ yancotab_files_sort: 'name' });
    saveSortMode(k, '');
    saveSortMode(k, null);
    assert.equal(loadSortMode(k), 'name');
  });
});

describe('VAULT_VIEWS', () => {
  test('lists 3 views', () => {
    assert.deepEqual([...VAULT_VIEWS].sort(), ['grid', 'honeycomb', 'list']);
  });
});
