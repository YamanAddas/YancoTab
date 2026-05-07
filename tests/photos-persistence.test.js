/**
 * Tests for photos/persistence.js — kernel.storage round-trip for
 * favorites Set.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  loadFavorites,
  saveFavorites,
  toggleFavorite,
  removeFavorite,
  renameFavorite,
  STORAGE_KEY,
} from '../os/apps/photos/persistence.js';

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

describe('STORAGE_KEY', () => {
  test('exports the canonical key', () => {
    assert.equal(STORAGE_KEY, 'yancotab_photos_meta_v1');
  });
});

describe('loadFavorites', () => {
  test('returns empty Set when nothing stored', () => {
    const k = fakeKernel();
    const s = loadFavorites(k);
    assert.equal(s instanceof Set, true);
    assert.equal(s.size, 0);
  });

  test('loads existing favorites', () => {
    const k = fakeKernel({
      yancotab_photos_meta_v1: { favorites: ['/a.png', '/b.png'] },
    });
    const s = loadFavorites(k);
    assert.equal(s.size, 2);
    assert.equal(s.has('/a.png'), true);
  });

  test('drops non-string entries', () => {
    const k = fakeKernel({
      yancotab_photos_meta_v1: { favorites: ['/a.png', 42, null, '/b.png'] },
    });
    const s = loadFavorites(k);
    assert.equal(s.size, 2);
  });

  test('handles malformed storage gracefully', () => {
    const k = fakeKernel({ yancotab_photos_meta_v1: 'garbage' });
    const s = loadFavorites(k);
    assert.equal(s.size, 0);
  });

  test('handles null kernel', () => {
    assert.equal(loadFavorites(null).size, 0);
    assert.equal(loadFavorites(undefined).size, 0);
  });
});

describe('saveFavorites', () => {
  test('persists Set as array', () => {
    const k = fakeKernel();
    saveFavorites(k, new Set(['/a.png', '/b.png']));
    const stored = k.storage._peek().yancotab_photos_meta_v1;
    assert.deepEqual([...stored.favorites].sort(), ['/a.png', '/b.png']);
  });

  test('ignores non-Set input', () => {
    const k = fakeKernel();
    saveFavorites(k, ['/a.png']);
    assert.equal(k.storage._peek().yancotab_photos_meta_v1, undefined);
  });
});

describe('toggleFavorite', () => {
  test('adds if absent, returns true', () => {
    const k = fakeKernel();
    assert.equal(toggleFavorite(k, '/a.png'), true);
    assert.deepEqual(k.storage._peek().yancotab_photos_meta_v1.favorites, ['/a.png']);
  });

  test('removes if present, returns false', () => {
    const k = fakeKernel({ yancotab_photos_meta_v1: { favorites: ['/a.png'] } });
    assert.equal(toggleFavorite(k, '/a.png'), false);
    assert.deepEqual(k.storage._peek().yancotab_photos_meta_v1.favorites, []);
  });

  test('rejects empty / non-string path', () => {
    const k = fakeKernel();
    assert.equal(toggleFavorite(k, ''), false);
    assert.equal(toggleFavorite(k, null), false);
    assert.equal(toggleFavorite(k, 42), false);
  });
});

describe('removeFavorite', () => {
  test('drops a stored path', () => {
    const k = fakeKernel({ yancotab_photos_meta_v1: { favorites: ['/a.png', '/b.png'] } });
    removeFavorite(k, '/a.png');
    assert.deepEqual(k.storage._peek().yancotab_photos_meta_v1.favorites, ['/b.png']);
  });

  test('no-op when path not present', () => {
    const k = fakeKernel({ yancotab_photos_meta_v1: { favorites: ['/a.png'] } });
    const beforeCalls = k.storage._peek().yancotab_photos_meta_v1.favorites.length;
    removeFavorite(k, '/nope.png');
    // Storage unchanged
    assert.equal(k.storage._peek().yancotab_photos_meta_v1.favorites.length, beforeCalls);
  });
});

describe('renameFavorite', () => {
  test('rewrites the path key', () => {
    const k = fakeKernel({ yancotab_photos_meta_v1: { favorites: ['/old.png', '/keep.png'] } });
    renameFavorite(k, '/old.png', '/new.png');
    const favs = k.storage._peek().yancotab_photos_meta_v1.favorites.sort();
    assert.deepEqual(favs, ['/keep.png', '/new.png']);
  });

  test('no-op when old path is not in the set', () => {
    const k = fakeKernel({ yancotab_photos_meta_v1: { favorites: ['/keep.png'] } });
    renameFavorite(k, '/missing.png', '/new.png');
    assert.deepEqual(k.storage._peek().yancotab_photos_meta_v1.favorites, ['/keep.png']);
  });
});
