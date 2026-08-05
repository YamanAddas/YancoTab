/**
 * appStorage-sync-chunks.test.js — the cloud write path.
 *
 * The bug: a value over chrome.storage.sync's 8KB per-item cap was split
 * across `key__chunk_0..n` with a `{__chunked}` manifest at `key`, and no
 * device could ever read it back. Three independent reasons:
 *
 *   1. hydration asks for REGISTRY keys only, so the chunk items were
 *      never fetched;
 *   2. `_handleRemoteChange` drops anything that is not an envelope, and
 *      a manifest is not one;
 *   3. the reassembler read chunks from localStorage — where nothing has
 *      ever written one — and bailed outright for remote reads.
 *
 * Meanwhile it consumed the quota that makes everything else work:
 * chrome.storage.sync allows 8KB per item but only 100KB TOTAL, so one
 * chunked value could exhaust the budget for all ~40 keys and take every
 * other key's sync down with it.
 *
 * These tests pin: nothing is chunked, oversized values stay local and
 * say so, and the artefacts of older versions are cleaned out.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ── Environment doubles ─────────────────────────────────────── */

if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
        key: (i) => Array.from(store.keys())[i] ?? null,
        get length() { return store.size; },
    };
}
if (typeof globalThis.window === 'undefined') {
    globalThis.window = { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} };
}
if (typeof globalThis.CustomEvent === 'undefined') {
    globalThis.CustomEvent = class CustomEvent {
        constructor(type, init) { this.type = type; this.detail = init?.detail; }
    };
}
// AppStorage measures payloads with `new Blob([s]).size`.
if (typeof globalThis.Blob === 'undefined') {
    globalThis.Blob = class Blob {
        constructor(parts) { this.size = Buffer.byteLength(parts.join(''), 'utf8'); }
    };
}

/** Minimal chrome.storage.sync: a Map plus a call log. */
function fakeChrome() {
    const cloud = new Map();
    const calls = { set: 0, remove: 0, get: 0 };
    return {
        cloud,
        calls,
        runtime: { id: 'test-extension-id' },
        storage: {
            sync: {
                async get(keys) {
                    calls.get++;
                    if (keys === null || keys === undefined) return Object.fromEntries(cloud);
                    const list = Array.isArray(keys) ? keys : [keys];
                    const out = {};
                    for (const k of list) if (cloud.has(k)) out[k] = cloud.get(k);
                    return out;
                },
                async set(obj) {
                    calls.set++;
                    for (const [k, v] of Object.entries(obj)) cloud.set(k, v);
                },
                async remove(keys) {
                    calls.remove++;
                    for (const k of (Array.isArray(keys) ? keys : [keys])) cloud.delete(k);
                },
            },
            onChanged: { addListener() {} },
        },
    };
}

const { AppStorage } = await import('../os/services/appStorage.js');

// A user-data key with a permissive validator, so a big payload survives
// normalize() and actually reaches the sync path.
const KEY = 'yancotab_activity_v1';
const big = (n) => ({ events: Array.from({ length: n }, (_, i) => ({ id: i, label: `event number ${i} with padding to make it long` })) });

let chrome;
let store;
beforeEach(() => {
    globalThis.localStorage.clear();
    chrome = fakeChrome();
    globalThis.chrome = chrome;
    store = new AppStorage();
    store._deviceId = 'device-a';
});

describe('oversized values', () => {
    test('are NOT chunked', async () => {
        store.save(KEY, big(400));
        await store.flush();

        const chunkKeys = [...chrome.cloud.keys()].filter((k) => k.includes('__chunk_'));
        assert.deepEqual(chunkKeys, [], 'chunk items must never be written again');
        assert.equal(chrome.cloud.has(KEY), false, 'and no manifest is left in its place');
    });

    test('are reported instead of failing silently', async () => {
        store.save(KEY, big(400));
        await store.flush();

        const { oversizedKeys } = store.getStatus();
        assert.equal(oversizedKeys.length, 1);
        assert.equal(oversizedKeys[0].key, KEY);
        assert.ok(oversizedKeys[0].bytes > store.getStatus().maxSyncItemBytes);
    });

    test('still persist locally — sync is the only thing skipped', async () => {
        store.save(KEY, big(400));
        await store.flush();
        assert.equal(store.load(KEY).events.length, 400);
    });

    test('shrinking back under the cap resumes syncing and clears the report', async () => {
        store.save(KEY, big(400));
        await store.flush();
        assert.equal(store.getStatus().oversizedKeys.length, 1);

        store.save(KEY, big(2));
        await store.flush();
        assert.deepEqual(store.getStatus().oversizedKeys, []);
        assert.ok(chrome.cloud.has(KEY), 'the small value must reach the cloud');
    });
});

describe('values under the cap', () => {
    test('are written whole, as a readable envelope', async () => {
        store.save(KEY, big(2));
        await store.flush();

        const written = chrome.cloud.get(KEY);
        assert.ok(written, 'key must be present in the cloud');
        // The envelope shape is what _handleRemoteChange requires on the
        // far side; a manifest is exactly what it rejects.
        for (const field of ['data', 'version', 'ts', 'seq', 'deviceId']) {
            assert.ok(field in written, `envelope must carry ${field}`);
        }
        assert.equal(written.__chunked, undefined);
        assert.equal(written.data.events.length, 2);
    });
});

describe('cleaning up what older versions wrote', () => {
    test('a legacy manifest and its chunks are purged at hydration', async () => {
        chrome.cloud.set(KEY, { __chunked: true, count: 3, totalBytes: 21504, deviceId: 'old' });
        chrome.cloud.set(`${KEY}__chunk_0`, 'aaa');
        chrome.cloud.set(`${KEY}__chunk_1`, 'bbb');
        chrome.cloud.set(`${KEY}__chunk_2`, 'ccc');
        chrome.cloud.set('yancotab_user_name', { data: 'Yaman', version: 1, ts: 1, seq: 1, deviceId: 'old' });

        const removed = await store._purgeLegacyChunks();

        assert.equal(removed.length, 4, 'the manifest and all three chunks');
        assert.equal(chrome.cloud.has(KEY), false);
        assert.equal([...chrome.cloud.keys()].some((k) => k.includes('__chunk_')), false);
        assert.ok(chrome.cloud.has('yancotab_user_name'), 'ordinary envelopes must survive the sweep');
    });

    test('the sweep issues no write when there is nothing to clean', async () => {
        chrome.cloud.set('yancotab_user_name', { data: 'Yaman', version: 1, ts: 1, seq: 1, deviceId: 'old' });
        const before = chrome.calls.remove;
        const removed = await store._purgeLegacyChunks();
        assert.deepEqual(removed, []);
        assert.equal(chrome.calls.remove, before, 'a clean cloud must cost zero writes');
    });

    test('a stale but VALID envelope is left alone when a key goes oversized', async () => {
        // Deleting it would throw away a real (if old) copy. Being behind
        // is ordinary sync behaviour; an unreadable manifest is not.
        store.save(KEY, big(2));
        await store.flush();
        const stale = chrome.cloud.get(KEY);

        store.save(KEY, big(400));
        await store.flush();

        assert.deepEqual(chrome.cloud.get(KEY), stale, 'the previous good envelope must survive');
    });

    test('but a manifest at that key IS removed when the key goes oversized', async () => {
        chrome.cloud.set(KEY, { __chunked: true, count: 2 });
        chrome.cloud.set(`${KEY}__chunk_0`, 'aa');
        chrome.cloud.set(`${KEY}__chunk_1`, 'bb');

        store.save(KEY, big(400));
        await store.flush();

        assert.equal(chrome.cloud.size, 0, 'nothing unreadable may be left holding quota');
    });
});

describe('reading a manifest that somehow reaches us', () => {
    test('normalize refuses it and falls back to the default', () => {
        // A device still running the old code can write one at any time.
        const clean = store.normalize(KEY, { __chunked: true, count: 3, totalBytes: 999 }, 'remote');
        assert.deepEqual(clean, { events: [] }, 'a manifest carries no data of its own');
    });

    test('and does not mistake ordinary data for one', () => {
        const clean = store.normalize(KEY, { events: [{ id: 1 }] }, 'local');
        assert.equal(clean.events.length, 1);
        // `__chunked: false` is not a manifest either — the check is on the
        // literal true, not on the key being present.
        const clean2 = store.normalize(KEY, { events: [], __chunked: false }, 'local');
        assert.ok(Array.isArray(clean2.events));
    });
});
