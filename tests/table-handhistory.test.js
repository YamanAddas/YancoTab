/**
 * Tests for the Table salon hand-history module.
 * Run with: node --test tests/table-handhistory.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHandHistory,
  trimToCap,
  isValidTarneebEntry,
  isValidTrixEntry,
  HAND_HISTORY_CAP,
} from '../os/apps/games/table/handHistory.js';

// In-memory storage facade matching kernel.storage's load/save shape.
function makeFakeKernel() {
  const data = new Map();
  return {
    storage: {
      load(key) { return data.get(key) ?? null; },
      save(key, val) { data.set(key, val); },
    },
    _data: data,
  };
}

describe('trimToCap', () => {
  test('returns array unchanged when below cap', () => {
    assert.deepEqual(trimToCap([1, 2, 3], 5), [1, 2, 3]);
  });

  test('keeps the newest (lowest-index) entries when over cap', () => {
    const arr = Array.from({ length: 60 }, (_, i) => ({ idx: i }));
    const trimmed = trimToCap(arr, 50);
    assert.equal(trimmed.length, 50);
    assert.equal(trimmed[0].idx, 0);
    assert.equal(trimmed[49].idx, 49);
  });

  test('handles non-array input safely', () => {
    assert.deepEqual(trimToCap(null), []);
    assert.deepEqual(trimToCap(undefined), []);
    assert.deepEqual(trimToCap('string'), []);
  });

  test('uses default cap of 50', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i);
    assert.equal(trimToCap(arr).length, 50);
    assert.equal(HAND_HISTORY_CAP, 50);
  });
});

describe('isValidTarneebEntry', () => {
  test('accepts a well-formed entry', () => {
    const e = {
      round: 5,
      dealer: 'south',
      trumpSuit: 'spades',
      bids: { south: 8 },
      tricksWon: { south: 7 },
      scoresAfter: { south: 22 },
    };
    assert.equal(isValidTarneebEntry(e), true);
  });

  test('rejects missing required fields', () => {
    assert.equal(isValidTarneebEntry(null), false);
    assert.equal(isValidTarneebEntry({}), false);
    assert.equal(isValidTarneebEntry({ round: 1 }), false);
    assert.equal(isValidTarneebEntry({ round: 1, dealer: 's', trumpSuit: 'spades' }), false);
  });
});

describe('isValidTrixEntry', () => {
  test('accepts well-formed entry', () => {
    const e = {
      kingdom: 2,
      contract: 'queens',
      kingdomOwner: 'south',
    };
    assert.equal(isValidTrixEntry(e), true);
  });

  test('rejects missing required fields', () => {
    assert.equal(isValidTrixEntry(null), false);
    assert.equal(isValidTrixEntry({}), false);
    assert.equal(isValidTrixEntry({ kingdom: 1 }), false);
  });
});

describe('createHandHistory — Tarneeb', () => {
  test('throws on unknown gameId', () => {
    const k = makeFakeKernel();
    assert.throws(() => createHandHistory(k, 'unknown'));
  });

  test('load returns empty array initially', () => {
    const k = makeFakeKernel();
    const h = createHandHistory(k, 'tarneeb');
    assert.deepEqual(h.load(), []);
  });

  test('append + load round-trip preserves entries newest-first', () => {
    const k = makeFakeKernel();
    const h = createHandHistory(k, 'tarneeb');
    h.append({
      round: 1, dealer: 'south', trumpSuit: 'spades',
      bids: { south: 8 }, tricksWon: { south: 7 }, scoresAfter: { south: 22 },
    });
    h.append({
      round: 2, dealer: 'east', trumpSuit: 'hearts',
      bids: { south: 5 }, tricksWon: { south: 4 }, scoresAfter: { south: 17 },
    });
    const loaded = h.load();
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].round, 2, 'newest first');
    assert.equal(loaded[1].round, 1);
  });

  test('append trims to HISTORY_CAP newest entries', () => {
    const k = makeFakeKernel();
    const h = createHandHistory(k, 'tarneeb');
    for (let i = 1; i <= 60; i++) {
      h.append({
        round: i, dealer: 'south', trumpSuit: 'spades',
        bids: {}, tricksWon: {}, scoresAfter: {},
      });
    }
    const loaded = h.load();
    assert.equal(loaded.length, 50);
    assert.equal(loaded[0].round, 60, 'newest survives');
    assert.equal(loaded[49].round, 11, 'oldest within cap window');
  });

  test('append adds a timestamp if not provided', () => {
    const k = makeFakeKernel();
    const h = createHandHistory(k, 'tarneeb');
    h.append({ round: 1, dealer: 's', trumpSuit: 'spades',
      bids: {}, tricksWon: {}, scoresAfter: {} });
    const loaded = h.load();
    assert.ok(loaded[0].ts > 0, 'ts auto-assigned');
  });

  test('append silently ignores non-object entries', () => {
    const k = makeFakeKernel();
    const h = createHandHistory(k, 'tarneeb');
    h.append(null);
    h.append('string');
    h.append(42);
    assert.equal(h.load().length, 0);
  });

  test('clear resets to empty', () => {
    const k = makeFakeKernel();
    const h = createHandHistory(k, 'tarneeb');
    h.append({ round: 1, dealer: 's', trumpSuit: 'spades',
      bids: {}, tricksWon: {}, scoresAfter: {} });
    assert.equal(h.load().length, 1);
    h.clear();
    assert.deepEqual(h.load(), []);
  });

  test('writes to the correct storage key', () => {
    const k = makeFakeKernel();
    const h = createHandHistory(k, 'tarneeb');
    h.append({ round: 1, dealer: 's', trumpSuit: 'spades',
      bids: {}, tricksWon: {}, scoresAfter: {} });
    assert.ok(k._data.has('yancotab_tarneeb_history_v1'));
  });
});

describe('createHandHistory — Trix', () => {
  test('uses the trix storage key', () => {
    const k = makeFakeKernel();
    const h = createHandHistory(k, 'trix');
    h.append({ kingdom: 1, contract: 'queens', kingdomOwner: 'south' });
    assert.ok(k._data.has('yancotab_trix_history_v1'));
    assert.equal(k._data.has('yancotab_tarneeb_history_v1'), false);
  });

  test('Tarneeb and Trix histories are independent', () => {
    const k = makeFakeKernel();
    const t = createHandHistory(k, 'tarneeb');
    const x = createHandHistory(k, 'trix');
    t.append({ round: 1, dealer: 's', trumpSuit: 'spades',
      bids: {}, tricksWon: {}, scoresAfter: {} });
    x.append({ kingdom: 1, contract: 'queens', kingdomOwner: 'south' });
    assert.equal(t.load().length, 1);
    assert.equal(x.load().length, 1);
    assert.equal(t.load()[0].dealer, 's');
    assert.equal(x.load()[0].kingdomOwner, 'south');
  });
});

describe('createHandHistory — resilience', () => {
  test('load returns [] when storage returns null', () => {
    const k = { storage: { load: () => null, save: () => {} } };
    const h = createHandHistory(k, 'tarneeb');
    assert.deepEqual(h.load(), []);
  });

  test('load returns [] when storage throws', () => {
    const k = { storage: { load: () => { throw new Error('boom'); }, save: () => {} } };
    const h = createHandHistory(k, 'tarneeb');
    assert.doesNotThrow(() => h.load());
    assert.deepEqual(h.load(), []);
  });

  test('append swallows storage errors', () => {
    const k = {
      storage: {
        load: () => ({ hands: [] }),
        save: () => { throw new Error('quota'); },
      },
    };
    const h = createHandHistory(k, 'tarneeb');
    assert.doesNotThrow(() => h.append({ round: 1, dealer: 's',
      trumpSuit: 'spades', bids: {}, tricksWon: {}, scoresAfter: {} }));
  });
});
