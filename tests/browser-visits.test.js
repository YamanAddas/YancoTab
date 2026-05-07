/**
 * Tests for browser/engine/visits.js — pure visit + classification helpers.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyPortal, bumpVisit, recordVisit, recentVisits, formatRelative,
  ANCHOR_THRESHOLD, ANCHOR_WINDOW_MS, RECENT_WINDOW_MS, HISTORY_LIMIT,
} from '../os/apps/browser/engine/visits.js';
import { normalizeBookmark } from '../os/apps/browser/engine/state.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = new Date(2026, 4, 7, 14, 0, 0, 0).getTime();

function bookmark(over = {}) {
  return { ...normalizeBookmark({ url: 'https://example.com' }), ...over };
}

describe('classifyPortal', () => {
  test('no clusterId, no visits → floating', () => {
    assert.equal(classifyPortal(bookmark({ clusterId: null }), T0), 'floating');
  });

  test('clusterId, no visits → standard', () => {
    assert.equal(classifyPortal(bookmark({ clusterId: 'cl_a' }), T0), 'standard');
  });

  test('recent visit (within 5 min) → recent', () => {
    const b = bookmark({ clusterId: 'cl_a', visitCount: 1, lastVisited: T0 - 2 * MIN });
    assert.equal(classifyPortal(b, T0), 'recent');
  });

  test('floating with recent visit still surfaces as recent (recency wins)', () => {
    const b = bookmark({ clusterId: null, visitCount: 1, lastVisited: T0 - 2 * MIN });
    assert.equal(classifyPortal(b, T0), 'recent');
  });

  test('anchor threshold met → anchor (overrides recent)', () => {
    const b = bookmark({
      clusterId: 'cl_a',
      visitCount: ANCHOR_THRESHOLD,
      lastVisited: T0 - 2 * MIN,
    });
    assert.equal(classifyPortal(b, T0), 'anchor');
  });

  test('anchor needs lastVisited within ANCHOR_WINDOW_MS', () => {
    // Visited a lot, but lastVisited 30 days ago → no longer anchor.
    const b = bookmark({
      clusterId: 'cl_a',
      visitCount: 20,
      lastVisited: T0 - 30 * DAY,
    });
    assert.equal(classifyPortal(b, T0), 'standard');
  });

  test('null bookmark → standard (defensive)', () => {
    assert.equal(classifyPortal(null, T0), 'standard');
  });

  test('lastVisited === 0 (migrated) ≠ recent', () => {
    const b = bookmark({ clusterId: 'cl_a', visitCount: 5, lastVisited: 0 });
    assert.equal(classifyPortal(b, T0), 'standard');
  });
});

describe('bumpVisit', () => {
  test('increments visitCount + sets lastVisited', () => {
    const b = bookmark({ visitCount: 2 });
    const next = bumpVisit(b, T0);
    assert.equal(next.visitCount, 3);
    assert.equal(next.lastVisited, T0);
  });

  test('does not mutate input', () => {
    const b = bookmark({ visitCount: 0 });
    const before = { ...b };
    bumpVisit(b, T0);
    assert.deepEqual(b, before);
  });

  test('null → null', () => {
    assert.equal(bumpVisit(null, T0), null);
  });
});

describe('recordVisit', () => {
  test('bumps matching bookmark + prepends history entry', () => {
    const state = {
      bookmarks: [bookmark({ url: 'https://a.com' }), bookmark({ url: 'https://b.com' })],
      history: [],
    };
    const next = recordVisit(state, 'https://a.com', T0);
    assert.equal(next.bookmarks[0].visitCount, 1);
    assert.equal(next.bookmarks[0].lastVisited, T0);
    assert.equal(next.bookmarks[1].visitCount, 0);
    assert.equal(next.history[0].url, 'https://a.com');
    assert.equal(next.history[0].host, 'a.com');
    assert.equal(next.history[0].ts, T0);
  });

  test('navigates to non-bookmark url → history entry only', () => {
    const state = { bookmarks: [bookmark({ url: 'https://bookmarked.com' })], history: [] };
    const next = recordVisit(state, 'https://random.com', T0);
    assert.equal(next.bookmarks[0].visitCount, 0);
    assert.equal(next.history.length, 1);
    assert.equal(next.history[0].url, 'https://random.com');
  });

  test('caps history at HISTORY_LIMIT', () => {
    let state = { bookmarks: [], history: [] };
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      state = recordVisit(state, `https://site${i}.com`, T0 + i * MIN);
    }
    assert.equal(state.history.length, HISTORY_LIMIT);
  });

  test('repeated visit within 1 minute does not duplicate', () => {
    let state = { bookmarks: [], history: [] };
    state = recordVisit(state, 'https://a.com', T0);
    state = recordVisit(state, 'https://a.com', T0 + 30_000);
    // The second call replaces the first (filter drops the older one
    // when ts < now - MIN ... actually no — the filter keeps entries
    // whose ts < now-MIN OR url !== url. So when we re-visit within
    // the minute, the prior entry is REMOVED (url matches AND ts >=
    // now-MIN), leaving just the new one.)
    assert.equal(state.history.length, 1);
    assert.equal(state.history[0].ts, T0 + 30_000);
  });

  test('repeated visit after 1 minute keeps both', () => {
    let state = { bookmarks: [], history: [] };
    state = recordVisit(state, 'https://a.com', T0);
    state = recordVisit(state, 'https://a.com', T0 + 5 * MIN);
    assert.equal(state.history.length, 2);
  });

  test('empty url → state unchanged', () => {
    const state = { bookmarks: [], history: [] };
    assert.equal(recordVisit(state, '', T0), state);
  });
});

describe('recentVisits', () => {
  test('returns top N entries (already latest-first in history)', () => {
    const state = { history: [
      { url: 'https://x.com', host: 'x.com', ts: T0 },
      { url: 'https://y.com', host: 'y.com', ts: T0 - 1 },
      { url: 'https://z.com', host: 'z.com', ts: T0 - 2 },
    ] };
    assert.equal(recentVisits(state, 2).length, 2);
    assert.equal(recentVisits(state, 2)[0].url, 'https://x.com');
  });

  test('null state → empty', () => {
    assert.deepEqual(recentVisits(null), []);
  });
});

describe('formatRelative', () => {
  test('< 1 min → "just now"', () => {
    assert.equal(formatRelative(T0 - 30_000, T0), 'just now');
  });

  test('< 1 hour → "Nm ago"', () => {
    assert.equal(formatRelative(T0 - 17 * MIN, T0), '17m ago');
  });

  test('< 24h → "Nh ago"', () => {
    assert.equal(formatRelative(T0 - 5 * HOUR, T0), '5h ago');
  });

  test('< 48h → "yesterday"', () => {
    assert.equal(formatRelative(T0 - 30 * HOUR, T0), 'yesterday');
  });

  test('> 48h → date label', () => {
    const out = formatRelative(T0 - 4 * DAY, T0);
    // Locale-specific, but at minimum non-empty + not "yesterday"
    assert.ok(out && out !== 'yesterday' && out !== '—');
  });

  test('ts === 0 (migrated) → "—"', () => {
    assert.equal(formatRelative(0, T0), '—');
  });

  test('future ts → "just now"', () => {
    assert.equal(formatRelative(T0 + 1000, T0), 'just now');
  });
});
