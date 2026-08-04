/**
 * clock-service.test.js — the alarm-ringer storage seam.
 *
 * The bug this pins: ClockApp saves `yancotab_clock_v3` through
 * kernel.storage, which wraps state in an AppStorage envelope
 * {data, version, ts, seq, deviceId}. The background ringer — ClockService,
 * ticked every second by the kernel — read the same key with a raw
 * JSON.parse, received the envelope instead of the state, and
 * normalizeV2State turned it into a state with alarms: []. Result: the
 * Clock UI showed "Next alarm in 2h 14m" for an alarm that could never
 * ring. Two writers, two formats, one key — the exact schema-split class
 * that hit TodoWidget in v1.1.1.
 *
 * ClockService had ZERO test coverage before this file.
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// The service reads localStorage inside methods; give Node a stub before import.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const { ClockService } = await import('../os/services/clockService.js');

const V3_KEY = 'yancotab_clock_v3';

/** A state shaped the way ClockApp actually saves it. */
const appState = () => ({
  use24h: true,
  alarms: [
    { id: 'a1', time: '07:00', label: 'Morning', enabled: true, days: [1, 2, 3, 4, 5] },
    { id: 'a2', time: '21:30', label: 'Wind down', enabled: false, days: [] },
  ],
  worldClocks: [],
});

/** What kernel.storage.save() actually writes to localStorage. */
const envelope = (data) => ({ data, version: 1, ts: 1700000000000, seq: 7, deviceId: 'test' });

/** Minimal AppStorage-handle double: load() unwraps, save() wraps. */
function makeStorageHandle() {
  return {
    load(key) {
      const raw = store.get(key);
      if (raw == null) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
    },
    save(key, value) {
      store.set(key, JSON.stringify(envelope(value)));
    },
  };
}

beforeEach(() => store.clear());

describe('ClockService v3 state seam', () => {
  test('with the kernel storage handle, envelope-wrapped alarms are visible', () => {
    // This is the shipped configuration after the fix: kernel.js passes
    // this.storage into the constructor.
    store.set(V3_KEY, JSON.stringify(envelope(appState())));
    const svc = new ClockService(makeStorageHandle());
    const state = svc.getV2State();
    assert.ok(state, 'state must load');
    assert.equal(state.alarms.length, 2, 'both alarms must survive the read');
    assert.equal(state.alarms[0].time, '07:00');
    assert.equal(state.alarms[0].enabled, true);
    assert.equal(state.use24h, true);
  });

  test('REGRESSION: without a handle, an envelope on disk must still yield its alarms', () => {
    // The exact pre-fix failure: raw JSON.parse returned the envelope, and
    // normalizeV2State flattened it to alarms: []. The envelope-aware raw
    // fallback must unwrap instead.
    store.set(V3_KEY, JSON.stringify(envelope(appState())));
    const svc = new ClockService(); // no kernel — early boot / legacy context
    const state = svc.getV2State();
    assert.ok(state, 'state must load');
    assert.equal(state.alarms.length, 2,
      'envelope must be unwrapped — alarms: [] here is the bug that silenced every alarm');
  });

  test('plain (non-envelope) raw v3 state still reads — pre-envelope installs', () => {
    store.set(V3_KEY, JSON.stringify(appState()));
    const svc = new ClockService();
    const state = svc.getV2State();
    assert.equal(state.alarms.length, 2);
  });

  test('a state that legitimately has data/version/ts fields is not mis-unwrapped', () => {
    // The envelope sniff requires all three marker keys; a clock state
    // cannot collide because normalizeV2State never emits those keys.
    // Guard the sniff against a partial overlap anyway.
    const odd = { ...appState(), data: 'user note', version: 9 }; // no `ts`
    store.set(V3_KEY, JSON.stringify(odd));
    const svc = new ClockService();
    const state = svc.getV2State();
    assert.equal(state.alarms.length, 2, 'partial marker overlap must not trigger unwrapping');
  });

  test('saveV2State writes through the handle so ClockApp can read it back', () => {
    const handle = makeStorageHandle();
    const svc = new ClockService(handle);
    svc.saveV2State(appState());
    const written = JSON.parse(store.get(V3_KEY));
    assert.ok('data' in written && 'ts' in written,
      'service writes must use the same envelope channel as ClockApp');
    assert.equal(written.data.alarms.length, 2);
    // And the round trip holds.
    assert.equal(svc.getV2State().alarms.length, 2);
  });

  test('v2→v3 migration writes v3 through the handle, not raw', () => {
    store.set('yancotab_clock_v2', JSON.stringify(appState()));
    const svc = new ClockService(makeStorageHandle());
    const state = svc.getV2State();
    assert.equal(state.alarms.length, 2);
    const migrated = JSON.parse(store.get(V3_KEY));
    assert.ok('data' in migrated, 'migrated v3 must be envelope-wrapped for ClockApp');
  });

  test('normalizeV2State on a bare envelope yields alarms: [] — the failure this file exists to prevent', () => {
    // Documents the mechanism: if the read path ever regresses to handing
    // the envelope to the normalizer, alarms are silently erased.
    const svc = new ClockService();
    const state = svc.normalizeV2State(envelope(appState()));
    assert.equal(state.alarms.length, 0);
  });
});
