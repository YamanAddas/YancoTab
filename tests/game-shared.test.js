/**
 * Tests for shared game modules: rng, fsm, store
 * Run with: node --test tests/game-shared.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randInt, shuffleInPlace } from '../os/apps/games/shared/rng.js';
import { FSMError, assertPhase } from '../os/apps/games/shared/fsm.js';
import { createStore } from '../os/apps/games/shared/store.js';

// ─────────────────────────────────────────────
// randInt
// ─────────────────────────────────────────────
describe('randInt', () => {
    test('returns 0 for maxExclusive ≤ 1', () => {
        assert.equal(randInt(0), 0);
        assert.equal(randInt(1), 0);
        assert.equal(randInt(-5), 0);
    });

    test('returns values in range [0, max)', () => {
        for (let i = 0; i < 100; i++) {
            const val = randInt(10);
            assert.ok(val >= 0, `${val} should be >= 0`);
            assert.ok(val < 10, `${val} should be < 10`);
        }
    });

    test('returns integer', () => {
        for (let i = 0; i < 50; i++) {
            const val = randInt(100);
            assert.equal(val, Math.floor(val));
        }
    });

    test('covers full range over many iterations', () => {
        const seen = new Set();
        for (let i = 0; i < 1000; i++) {
            seen.add(randInt(5));
        }
        // Should have hit all 5 values: 0, 1, 2, 3, 4
        assert.equal(seen.size, 5);
    });
});

// ─────────────────────────────────────────────
// shuffleInPlace
// ─────────────────────────────────────────────
describe('shuffleInPlace', () => {
    test('preserves all elements', () => {
        const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        shuffleInPlace(arr);
        assert.equal(arr.length, 10);
        assert.deepEqual(arr.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    test('returns same array reference', () => {
        const arr = [1, 2, 3];
        const result = shuffleInPlace(arr);
        assert.equal(result, arr);
    });

    test('handles empty array', () => {
        const arr = [];
        shuffleInPlace(arr);
        assert.deepEqual(arr, []);
    });

    test('handles single element', () => {
        const arr = [42];
        shuffleInPlace(arr);
        assert.deepEqual(arr, [42]);
    });

    test('actually shuffles (not always identical order)', () => {
        const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let allSame = true;
        for (let attempt = 0; attempt < 10; attempt++) {
            const arr = [...original];
            shuffleInPlace(arr);
            if (arr.some((v, i) => v !== original[i])) {
                allSame = false;
                break;
            }
        }
        assert.equal(allSame, false, 'shuffle should change order');
    });
});

// ─────────────────────────────────────────────
// FSM (assertPhase)
// ─────────────────────────────────────────────
describe('assertPhase', () => {
    test('does not throw when phase is allowed', () => {
        const state = { phase: 'playing' };
        assert.doesNotThrow(() => assertPhase(state, ['playing', 'waiting']));
    });

    test('throws FSMError when phase is not allowed', () => {
        const state = { phase: 'ended' };
        assert.throws(
            () => assertPhase(state, ['playing', 'waiting']),
            (err) => err instanceof FSMError
        );
    });

    test('error message includes phase and action type', () => {
        const state = { phase: 'idle' };
        assert.throws(
            () => assertPhase(state, ['playing'], 'PLAY_CARD'),
            (err) => err.message.includes('idle') && err.message.includes('PLAY_CARD')
        );
    });
});

// ─────────────────────────────────────────────
// createStore
// ─────────────────────────────────────────────
describe('createStore', () => {
    function reducer(state, action) {
        switch (action.type) {
            case 'INCREMENT':
                return { state: { count: state.count + 1 }, events: ['incremented'] };
            case 'SET':
                return { state: { count: action.value }, events: [] };
            default:
                return { state, events: [] };
        }
    }

    test('getState returns initial state', () => {
        const store = createStore(reducer, { count: 0 });
        assert.deepEqual(store.getState(), { count: 0 });
    });

    test('dispatch updates state', () => {
        const store = createStore(reducer, { count: 0 });
        store.dispatch({ type: 'INCREMENT' });
        assert.deepEqual(store.getState(), { count: 1 });
    });

    test('dispatch returns reducer output', () => {
        const store = createStore(reducer, { count: 0 });
        const result = store.dispatch({ type: 'INCREMENT' });
        assert.deepEqual(result.state, { count: 1 });
        assert.deepEqual(result.events, ['incremented']);
    });

    test('subscribe notifies on dispatch', () => {
        const store = createStore(reducer, { count: 0 });
        const calls = [];
        store.subscribe((state, events) => calls.push({ state, events }));
        store.dispatch({ type: 'INCREMENT' });
        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].state, { count: 1 });
        assert.deepEqual(calls[0].events, ['incremented']);
    });

    test('unsubscribe stops notifications', () => {
        const store = createStore(reducer, { count: 0 });
        const calls = [];
        const unsub = store.subscribe((state) => calls.push(state));
        store.dispatch({ type: 'INCREMENT' });
        unsub();
        store.dispatch({ type: 'INCREMENT' });
        assert.equal(calls.length, 1);
    });

    test('multiple dispatches accumulate', () => {
        const store = createStore(reducer, { count: 0 });
        store.dispatch({ type: 'INCREMENT' });
        store.dispatch({ type: 'INCREMENT' });
        store.dispatch({ type: 'INCREMENT' });
        assert.deepEqual(store.getState(), { count: 3 });
    });

    test('multiple subscribers all notified', () => {
        const store = createStore(reducer, { count: 0 });
        let a = 0, b = 0;
        store.subscribe(() => a++);
        store.subscribe(() => b++);
        store.dispatch({ type: 'INCREMENT' });
        assert.equal(a, 1);
        assert.equal(b, 1);
    });
});
