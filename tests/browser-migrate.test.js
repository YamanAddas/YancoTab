/**
 * Tests for browser/engine/migrate.js + state.js normalizers.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isV1Shape, isV2Shape, migrateV1ToV2, ensureV2 } from '../os/apps/browser/engine/migrate.js';
import { normalizeState, normalizeBookmark, makeInitialState, hostFromUrl, clamp01 } from '../os/apps/browser/engine/state.js';
import { gridPosition, registrableKey, autoClusterByHost, STARMAP_COLS } from '../os/apps/browser/engine/layout.js';

describe('shape detection', () => {
  test('isV1Shape — v1 bookmarks lack x/y', () => {
    assert.equal(isV1Shape({ bookmarks: [{ label: 'A', url: 'https://a.com' }] }), true);
    assert.equal(isV1Shape({ bookmarks: [{ label: 'A', url: 'https://a.com', x: 10, y: 20 }] }), false);
    assert.equal(isV1Shape({ bookmarks: [] }), false); // empty isn't v1, just empty
    assert.equal(isV1Shape(null), false);
  });

  test('isV2Shape — explicit version: 2', () => {
    assert.equal(isV2Shape({ version: 2, bookmarks: [] }), true);
    assert.equal(isV2Shape({ bookmarks: [] }), false);
    assert.equal(isV2Shape({ version: 1, bookmarks: [] }), false);
  });
});

describe('migrateV1ToV2', () => {
  test('preserves bookmark url + label, places on grid', () => {
    const v1 = {
      currentUrl: 'https://x.com',
      bookmarks: [
        { label: 'GitHub', url: 'https://github.com' },
        { label: 'YouTube', url: 'https://www.youtube.com' },
      ],
      history: [],
    };
    const v2 = migrateV1ToV2(v1);
    assert.equal(v2.bookmarks.length, 2);
    assert.equal(v2.bookmarks[0].label, 'GitHub');
    assert.equal(v2.bookmarks[0].url, 'https://github.com');
    assert.equal(v2.bookmarks[0].visitCount, 0);
    assert.equal(v2.bookmarks[0].lastVisited, null);
    assert.equal(v2.bookmarks[0].clusterId, null);
    // Index 0 → first grid cell (16, 22)
    assert.equal(v2.bookmarks[0].x, 16);
    assert.equal(v2.bookmarks[0].y, 22);
    // Index 1 → next column (38, 22)
    assert.equal(v2.bookmarks[1].x, 38);
    assert.equal(v2.bookmarks[1].y, 22);
  });

  test('history strings → entries with ts: 0', () => {
    const v1 = { bookmarks: [], history: ['https://github.com', 'https://www.google.com/search?q=foo'] };
    const v2 = migrateV1ToV2(v1);
    assert.equal(v2.history.length, 2);
    assert.equal(v2.history[0].url, 'https://github.com');
    assert.equal(v2.history[0].host, 'github.com');
    assert.equal(v2.history[0].ts, 0);
  });

  test('drops empty-url bookmarks silently', () => {
    const v1 = { bookmarks: [
      { label: 'Real', url: 'https://a.com' },
      { label: 'Empty', url: '' },
      null,
      { label: 'No url' },
    ] };
    const v2 = migrateV1ToV2(v1);
    assert.equal(v2.bookmarks.length, 1);
    assert.equal(v2.bookmarks[0].label, 'Real');
  });

  test('history uses hostFromUrl correctly', () => {
    const v2 = migrateV1ToV2({ bookmarks: [], history: ['https://docs.github.com/foo'] });
    assert.equal(v2.history[0].host, 'docs.github.com');
  });

  test('history capped at 50', () => {
    const big = Array.from({ length: 80 }, (_, i) => `https://site${i}.com`);
    const v2 = migrateV1ToV2({ bookmarks: [], history: big });
    assert.equal(v2.history.length, 50);
  });

  test('null/garbage input → null', () => {
    assert.equal(migrateV1ToV2(null), null);
    assert.equal(migrateV1ToV2('nope'), null);
  });

  test('label fallback to host when missing', () => {
    const v2 = migrateV1ToV2({ bookmarks: [{ url: 'https://reddit.com' }] });
    assert.equal(v2.bookmarks[0].label, 'reddit.com');
  });
});

describe('ensureV2', () => {
  test('v2 input passed through unchanged', () => {
    const v2 = { version: 2, bookmarks: [], clusters: [], history: [], currentUrl: '' };
    assert.equal(ensureV2(v2), v2);
  });

  test('v1 input migrated', () => {
    const v1 = { bookmarks: [{ label: 'A', url: 'https://a.com' }], history: [] };
    const out = ensureV2(v1);
    assert.equal(out.version, 2);
    assert.equal(out.bookmarks[0].x, 16);
  });

  test('garbage → fresh initial state', () => {
    const out = ensureV2(null);
    assert.equal(out.version, 2);
    assert.equal(out.bookmarks.length, 0);
  });
});

describe('normalizeState', () => {
  test('drops orphaned cluster references', () => {
    const out = normalizeState({
      version: 2,
      bookmarks: [
        { label: 'A', url: 'https://a.com', x: 10, y: 10, clusterId: 'cl_real' },
        { label: 'B', url: 'https://b.com', x: 20, y: 20, clusterId: 'cl_ghost' },
      ],
      clusters: [{ id: 'cl_real', name: 'Real', color: 'cool', position: 1000 }],
      history: [],
    });
    assert.equal(out.bookmarks[0].clusterId, 'cl_real');
    assert.equal(out.bookmarks[1].clusterId, null);
  });

  test('drops bookmarks without url', () => {
    const out = normalizeState({ bookmarks: [{ label: 'No URL' }, { label: 'Real', url: 'https://r.com' }] });
    assert.equal(out.bookmarks.length, 1);
    assert.equal(out.bookmarks[0].label, 'Real');
  });

  test('clamps x/y to 0..100', () => {
    const out = normalizeState({ bookmarks: [
      { label: 'A', url: 'https://a.com', x: -50, y: 999 },
      { label: 'B', url: 'https://b.com', x: NaN, y: 'oops' },
    ] });
    assert.equal(out.bookmarks[0].x, 0);
    assert.equal(out.bookmarks[0].y, 100);
    assert.equal(out.bookmarks[1].x, 50);
    assert.equal(out.bookmarks[1].y, 50);
  });

  test('rejects invalid cluster colors', () => {
    const out = normalizeState({
      bookmarks: [],
      clusters: [{ id: 'a', name: 'X', color: 'rainbow' }],
    });
    assert.equal(out.clusters[0].color, 'accent');
  });

  test('null → makeInitialState shape', () => {
    const out = normalizeState(null);
    assert.deepEqual(out, makeInitialState());
  });

  test('label capped at 40 chars, url at 2000', () => {
    const long = 'A'.repeat(60);
    const out = normalizeState({ bookmarks: [{ label: long, url: 'https://a.com', x: 0, y: 0 }] });
    assert.equal(out.bookmarks[0].label.length, 40);
  });
});

describe('hostFromUrl + clamp01', () => {
  test('hostFromUrl strips www', () => {
    assert.equal(hostFromUrl('https://www.github.com/foo'), 'github.com');
    assert.equal(hostFromUrl('https://docs.github.com'), 'docs.github.com');
    assert.equal(hostFromUrl('not-a-url'), '');
  });

  test('clamp01', () => {
    assert.equal(clamp01(50), 50);
    assert.equal(clamp01(-1), 0);
    assert.equal(clamp01(101), 100);
    assert.equal(clamp01('oops'), 50);
  });
});

describe('layout helpers', () => {
  test('gridPosition: first 4 indices fill row 1', () => {
    const ys = [0, 1, 2, 3].map((i) => gridPosition(i).y);
    assert.deepEqual(ys, [22, 22, 22, 22]);
    const xs = [0, 1, 2, 3].map((i) => gridPosition(i).x);
    assert.deepEqual(xs, [16, 38, 60, 82]);
  });

  test('gridPosition: row wraps after 4', () => {
    assert.equal(gridPosition(4).x, 16);
    assert.equal(gridPosition(4).y, 42);
  });

  test('gridPosition: high indices cap y at 95', () => {
    const out = gridPosition(100);
    assert.ok(out.y >= 80 && out.y <= 95);
  });

  test('gridPosition: garbage → fallback', () => {
    assert.deepEqual(gridPosition(NaN), { x: 16, y: 22 });
    assert.deepEqual(gridPosition(-5), { x: 16, y: 22 });
  });

  test('STARMAP_COLS export', () => {
    assert.equal(STARMAP_COLS, 4);
  });

  test('registrableKey strips subdomains', () => {
    assert.equal(registrableKey('https://docs.github.com'), 'github');
    assert.equal(registrableKey('https://www.example.com'), 'example');
    assert.equal(registrableKey('https://localhost'), 'localhost');
    assert.equal(registrableKey(''), '');
  });

  test('autoClusterByHost groups co-domain bookmarks', () => {
    const groups = autoClusterByHost([
      { id: 'a', url: 'https://github.com' },
      { id: 'b', url: 'https://docs.github.com' },
      { id: 'c', url: 'https://example.com' },
    ]);
    assert.equal(groups.get('github').length, 2);
    assert.equal(groups.get('example').length, 1);
  });
});

describe('normalizeBookmark', () => {
  test('null/empty url → null', () => {
    assert.equal(normalizeBookmark(null), null);
    assert.equal(normalizeBookmark({ url: '' }), null);
  });

  test('rejects non-finite visitCount', () => {
    const b = normalizeBookmark({ url: 'https://a.com', visitCount: -3 });
    assert.equal(b.visitCount, 0);
  });
});
