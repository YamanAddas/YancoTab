/**
 * pomodoro-ticker.test.js — the headless clock.
 *
 * The interaction this exists for: v1.7.0 made every surface route phase
 * advances through `runPomodoro`, and this release lets the user hide the
 * Today-bar widget. The widget was the only per-second driver on the home
 * screen, so without a headless ticker, turning the card off would have
 * silently stopped a running session — trading one "sessions vanish" bug
 * for another.
 *
 * Also pinned here: the ticker must NOT run while idle. A new tab opens
 * dozens of times a day and almost none of them have a cycle in flight.
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { makeStorageKernel } from './_helpers/fakeKernel.js';
import {
    startPomodoroTicker, stopPomodoroTicker, _tickerState,
} from '../os/apps/pomodoro/ticker.js';
import { runPomodoro } from '../os/apps/pomodoro/effects.js';
import { STORAGE_KEYS } from '../os/apps/pomodoro/persistence.js';
import { getPreset } from '../os/apps/pomodoro/engine/presets.js';
import { makeInitialState } from '../os/apps/pomodoro/engine/state.js';
import * as intent from '../os/apps/pomodoro/intents.js';

const CLASSIC = getPreset('classic');

function entriesIn(kernel) {
    const h = kernel.storage.load(STORAGE_KEYS.history);
    return Object.values(h?.days || {}).flat();
}

/** A focus phase whose deadline passed `agoMs` before now. */
function expiredFocus(agoMs = 0) {
    const now = Date.now();
    return {
        ...makeInitialState({ now }),
        phase: 'focus',
        startedAt: now - CLASSIC.focusMs - agoMs,
        sessionIndex: 0,
    };
}

let kernel;
beforeEach(() => { kernel = makeStorageKernel(); });
afterEach(() => { stopPomodoroTicker(); });

describe('arming', () => {
    test('an idle desktop runs no interval at all', () => {
        startPomodoroTicker(kernel);
        assert.equal(_tickerState().armed, true);
        assert.equal(_tickerState().running, false,
            'a new tab with no cycle in flight must not schedule a per-second callback');
    });

    test('a cycle started from any surface arms it', () => {
        startPomodoroTicker(kernel);
        runPomodoro(kernel, intent.start());
        assert.equal(_tickerState().running, true);
    });

    test('returning to idle disarms it', () => {
        startPomodoroTicker(kernel);
        runPomodoro(kernel, intent.start());
        assert.equal(_tickerState().running, true);
        runPomodoro(kernel, intent.endCycle());
        assert.equal(_tickerState().running, false);
    });

    test('starting while a cycle is already live arms immediately', () => {
        // The real case: a tab opened mid-session. Nothing dispatches a
        // state change here, so arming cannot depend on the subscription.
        kernel.storage._seed(STORAGE_KEYS.state, {
            ...makeInitialState({ now: Date.now() }),
            phase: 'focus', startedAt: Date.now() - 60_000,
        });
        startPomodoroTicker(kernel);
        assert.equal(_tickerState().running, true);
    });

    test('a second start is a no-op, so a shell re-init cannot double-tick', () => {
        startPomodoroTicker(kernel);
        runPomodoro(kernel, intent.start());
        const other = makeStorageKernel();
        startPomodoroTicker(other);
        // Still bound to the first kernel; the second call did nothing.
        assert.equal(_tickerState().armed, true);
        assert.equal(entriesIn(other).length, 0);
    });
});

describe('catch-up on load', () => {
    test('a deadline that passed while the tab was closed advances on start', () => {
        // Without the immediate call the session would sit expired for a
        // further second — and on a tab that is opened and closed quickly,
        // possibly forever.
        kernel.storage._seed(STORAGE_KEYS.state, expiredFocus(5_000));
        startPomodoroTicker(kernel);

        const list = entriesIn(kernel);
        assert.equal(list.length, 1, 'the completed focus session must reach history');
        assert.equal(list[0].kind, 'focus');
        assert.equal(list[0].completed, true);
        assert.equal(kernel.storage.load(STORAGE_KEYS.state).phase, 'break');
        assert.equal(_tickerState().running, true, 'and the break must keep ticking');
    });

    test('catch-up on an idle blob writes nothing and stays disarmed', () => {
        const before = kernel.storage.writes;
        startPomodoroTicker(kernel);
        assert.equal(kernel.storage.writes, before, 'an idle start must not touch storage');
        assert.equal(entriesIn(kernel).length, 0);
        assert.equal(kernel._events.length, 0);
    });
});

describe('stop', () => {
    test('stopping releases the interval and the subscription', () => {
        startPomodoroTicker(kernel);
        runPomodoro(kernel, intent.start());
        assert.equal(_tickerState().running, true);

        stopPomodoroTicker();
        assert.deepEqual(_tickerState(), { armed: false, running: false });

        // The subscription is gone: a later state change must not re-arm.
        runPomodoro(kernel, intent.pause());
        assert.equal(_tickerState().running, false);
    });

    test('stopping twice is safe', () => {
        startPomodoroTicker(kernel);
        stopPomodoroTicker();
        stopPomodoroTicker();
        assert.equal(_tickerState().armed, false);
    });

    test('survives a kernel with no storage at all', () => {
        // Boot-order defence: the shell wires this up early, and a storage
        // handle that failed to construct must not take the shell down.
        assert.doesNotThrow(() => startPomodoroTicker({ emit() {} }));
        stopPomodoroTicker();
    });
});
