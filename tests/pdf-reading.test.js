/**
 * Tests for os/apps/pdf/engine/reading.js — reading-position memory.
 * IO is injected, so we can drive the debounce + flush behavior without
 * a real IDB.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    createReadingMemory,
    resolveViewState,
    isResumable,
    __TEST__,
} from '../os/apps/pdf/engine/reading.js';

function makeIO() {
    const persisted = new Map();
    const saveCalls = [];
    return {
        persisted, saveCalls,
        loadViewState: async (id) => persisted.get(id) || null,
        saveViewState: async (id, patch) => {
            const cur = persisted.get(id) || {};
            persisted.set(id, { ...cur, ...patch });
            saveCalls.push({ id, patch });
        },
    };
}

describe('createReadingMemory — basic flush', () => {
    test('save then flush writes to IO', async () => {
        const io = makeIO();
        const mem = createReadingMemory({
            ...io,
            scheduleSave: (fn) => fn,           // never actually fires
            cancelSave: () => {},
        });
        mem.save('d1', { page: 5, zoom: 1.5 });
        await mem.flush('d1');
        assert.equal(io.saveCalls.length, 1);
        assert.deepEqual(io.persisted.get('d1'), { page: 5, zoom: 1.5 });
    });

    test('save merges patches before flushing', async () => {
        const io = makeIO();
        const mem = createReadingMemory({
            ...io, scheduleSave: () => 0, cancelSave: () => {},
        });
        mem.save('d1', { page: 3 });
        mem.save('d1', { zoom: 2.0 });
        mem.save('d1', { mode: 'continuous' });
        assert.deepEqual(mem.pendingPatch('d1'), { page: 3, zoom: 2.0, mode: 'continuous' });
        await mem.flush('d1');
        assert.equal(io.saveCalls.length, 1);
        assert.deepEqual(io.saveCalls[0].patch, { page: 3, zoom: 2.0, mode: 'continuous' });
    });

    test('flush clears pending state', async () => {
        const io = makeIO();
        const mem = createReadingMemory({
            ...io, scheduleSave: () => 0, cancelSave: () => {},
        });
        mem.save('d1', { page: 3 });
        await mem.flush('d1');
        assert.equal(mem.pendingPatch('d1'), null);
    });
});

describe('createReadingMemory — debounced scheduling', () => {
    test('schedules a timer and the timer flushes', async () => {
        const io = makeIO();
        const tasks = [];
        const mem = createReadingMemory({
            ...io,
            scheduleSave: (fn, ms) => { tasks.push({ fn, ms }); return tasks.length - 1; },
            cancelSave: (h) => { tasks[h] = null; },
        });
        mem.save('d1', { page: 7 });
        assert.equal(tasks.length, 1);
        assert.equal(tasks[0].ms, __TEST__.SAVE_DEBOUNCE_MS);
        await tasks[0].fn();
        assert.equal(io.saveCalls.length, 1);
    });

    test('a second save cancels the first timer', async () => {
        const io = makeIO();
        const tasks = [];
        const cancelled = [];
        const mem = createReadingMemory({
            ...io,
            scheduleSave: (fn, ms) => { tasks.push({ fn, ms, cancelled: false }); return tasks.length - 1; },
            cancelSave: (h) => { cancelled.push(h); tasks[h].cancelled = true; },
        });
        mem.save('d1', { page: 7 });
        mem.save('d1', { page: 8 });
        assert.equal(tasks.length, 2);
        assert.deepEqual(cancelled, [0]);
        // Only the second timer fires
        await tasks[1].fn();
        assert.equal(io.saveCalls.length, 1);
        assert.deepEqual(io.saveCalls[0].patch, { page: 8 });
    });
});

describe('createReadingMemory — flushAll', () => {
    test('flushes every pending doc', async () => {
        const io = makeIO();
        const mem = createReadingMemory({
            ...io, scheduleSave: () => 0, cancelSave: () => {},
        });
        mem.save('d1', { page: 1 });
        mem.save('d2', { page: 2 });
        mem.save('d3', { page: 3 });
        await mem.flushAll();
        assert.equal(io.saveCalls.length, 3);
        const ids = io.saveCalls.map((c) => c.id).sort();
        assert.deepEqual(ids, ['d1', 'd2', 'd3']);
    });
});

describe('createReadingMemory — load', () => {
    test('returns persisted state', async () => {
        const io = makeIO();
        io.persisted.set('d1', { page: 9, zoom: 1.25 });
        const mem = createReadingMemory({ ...io, scheduleSave: () => 0, cancelSave: () => {} });
        const v = await mem.load('d1');
        assert.deepEqual(v, { page: 9, zoom: 1.25 });
    });

    test('returns null for unknown doc', async () => {
        const io = makeIO();
        const mem = createReadingMemory({ ...io, scheduleSave: () => 0, cancelSave: () => {} });
        const v = await mem.load('unknown');
        assert.equal(v, null);
    });
});

describe('resolveViewState', () => {
    test('returns null for null', () => assert.equal(resolveViewState(null), null));

    test('clamps page to ≥ 1', () => {
        assert.equal(resolveViewState({ page: 0 }).page, 1);
        assert.equal(resolveViewState({ page: -3 }).page, 1);
    });

    test('floors fractional page', () => {
        assert.equal(resolveViewState({ page: 5.7 }).page, 5);
    });

    test('passes through valid zoom number', () => {
        assert.equal(resolveViewState({ zoom: 1.5 }).zoom, 1.5);
    });

    test('passes through fit keywords', () => {
        assert.equal(resolveViewState({ zoom: 'fit-width' }).zoom, 'fit-width');
        assert.equal(resolveViewState({ zoom: 'fit-page' }).zoom, 'fit-page');
    });

    test('falls back to fit-width on bad zoom', () => {
        assert.equal(resolveViewState({ zoom: 'wat' }).zoom, 'fit-width');
        assert.equal(resolveViewState({ zoom: -2 }).zoom, 'fit-width');
    });

    test('passes valid mode through, null otherwise', () => {
        assert.equal(resolveViewState({ mode: 'continuous' }).mode, 'continuous');
        assert.equal(resolveViewState({ mode: 'unknown' }).mode, null);
    });

    test('passes valid rotation, 0 otherwise', () => {
        assert.equal(resolveViewState({ rotation: 90 }).rotation, 90);
        assert.equal(resolveViewState({ rotation: 45 }).rotation, 0);
    });
});

describe('isResumable', () => {
    test('false on null', () => assert.equal(isResumable(null), false));
    test('false on page 1', () => assert.equal(isResumable({ page: 1 }), false));
    test('true on page > 1', () => assert.equal(isResumable({ page: 2 }), true));
});
