/**
 * pomodoro-effects.test.js — the single write path for the Pomodoro clock.
 *
 * The bug this pins: three surfaces run a 1-second tick (PomodoroApp, the
 * Today-bar widget, Focus Mode) but only PomodoroApp persisted the
 * reducer's `sessionLogged` event. Focus Mode forwarded 'toast' and
 * 'activity' and dropped the rest; the widget didn't use the reducer at
 * all. So a session that completed with the Pomodoro window closed — which
 * is the entire point of a background timer, and unconditionally true
 * inside Focus Mode, which kills the app before mounting — was never
 * written to `yancotab_pomodoro_history_v1`. Stats, the week grid, the
 * season heatmap and both streaks silently undercounted.
 *
 * The naive fix (teach the widget to call appendSession) DOUBLE-logs,
 * because PomodoroApp applied TICK to a cached in-memory state and would
 * expire the same phase a second time. These tests lock both directions:
 * a session must be logged, and must be logged exactly once.
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { makeStorageKernel } from './_helpers/fakeKernel.js';
import { runPomodoro, activePreset } from '../os/apps/pomodoro/effects.js';
import { STORAGE_KEYS } from '../os/apps/pomodoro/persistence.js';
import { getPreset } from '../os/apps/pomodoro/engine/presets.js';
import { makeInitialState } from '../os/apps/pomodoro/engine/state.js';
import * as intent from '../os/apps/pomodoro/intents.js';
import { apply } from '../os/apps/pomodoro/engine/reducer.js';

const CLASSIC = getPreset('classic');           // 25 / 5 · x4
const T0 = 1_800_000_000_000;                   // fixed instant

/** A state mid-focus whose deadline has just passed at `now`. */
function expiringFocus(now = T0) {
    return {
        ...makeInitialState({ now }),
        phase: 'focus',
        startedAt: now - CLASSIC.focusMs,
        sessionIndex: 0,
    };
}

function entriesIn(kernel) {
    const h = kernel.storage.load(STORAGE_KEYS.history);
    return Object.values(h?.days || {}).flat();
}

let kernel;
beforeEach(() => { kernel = makeStorageKernel(); });

describe('runPomodoro — history is written from any surface', () => {
    test('a focus expiry with NO PomodoroApp anywhere writes exactly one entry', () => {
        // This is the bug. Before the fix neither the widget nor Focus Mode
        // wrote history at all, so this ran to zero entries.
        kernel.storage._seed(STORAGE_KEYS.state, expiringFocus());
        const res = runPomodoro(kernel, intent.tick(), T0);

        assert.equal(res.changed, true);
        const list = entriesIn(kernel);
        assert.equal(list.length, 1, 'the completed focus session must reach history');
        assert.equal(list[0].kind, 'focus');
        assert.equal(list[0].completed, true);
        assert.equal(res.state.phase, 'break', 'and the phase must have advanced');
    });

    test('the toast and activity side-effects still fire', () => {
        kernel.storage._seed(STORAGE_KEYS.state, expiringFocus());
        runPomodoro(kernel, intent.tick(), T0);
        const toasts = kernel._events.filter((e) => e.event === 'toast');
        assert.equal(toasts.length, 1, 'exactly one toast — not the widget/reducer pair');
        assert.match(toasts[0].data.message, /focus complete/i);
    });
});

describe('runPomodoro — exactly once', () => {
    test('two surfaces observing the same expiry produce ONE entry and ONE toast', () => {
        // In-tab convergence: the second call loads the already-advanced
        // state, apply() returns the same reference, and it no-ops.
        kernel.storage._seed(STORAGE_KEYS.state, expiringFocus());
        const a = runPomodoro(kernel, intent.tick(), T0);
        const b = runPomodoro(kernel, intent.tick(), T0 + 3);

        assert.equal(a.changed, true);
        assert.equal(b.changed, false, 'second surface must see no change');
        assert.equal(entriesIn(kernel).length, 1);
        assert.equal(kernel._events.filter((e) => e.event === 'toast').length, 1);
    });

    test('CROSS-TAB: a re-observed expiry from a stale blob still yields ONE entry', () => {
        // Simulates two browser tabs: tab B read the pre-advance blob before
        // tab A wrote it. Note the two calls stamp DIFFERENT endedAt — which
        // is exactly why the dedupe key is startedAt, not endedAt.
        const pre = expiringFocus();
        kernel.storage._seed(STORAGE_KEYS.state, pre);
        runPomodoro(kernel, intent.tick(), T0);
        kernel.storage._seed(STORAGE_KEYS.state, pre);      // tab B's stale view
        runPomodoro(kernel, intent.tick(), T0 + 7);

        assert.equal(entriesIn(kernel).length, 1,
            'without the sessionId dedupe this is 2 — the cross-tab double-log');
    });
});

describe('runPomodoro — a no-op writes nothing', () => {
    test('mid-focus TICK does not touch storage', () => {
        // Focus Mode used to save unconditionally. With three surfaces that
        // is 3 writes/second, and AppStorage's sync scheduler is a TRAILING
        // 2s debounce on one shared timer — a per-second write starves it
        // forever and nothing ever syncs while a timer runs.
        kernel.storage._seed(STORAGE_KEYS.state, {
            ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0 - 60_000,
        });
        const before = kernel.storage.writes;
        const res = runPomodoro(kernel, intent.tick(), T0);

        assert.equal(res.changed, false);
        assert.equal(kernel.storage.writes, before, 'a no-op must perform zero writes');
        assert.equal(kernel._events.length, 0, 'and emit nothing');
    });

    test('reducer invariant: same state reference implies no events', () => {
        // runPomodoro's `state === current` early return is only safe while
        // this holds. Locks it against a future reducer edit that pushes an
        // event above a no-op return.
        const states = [
            makeInitialState({ now: T0 }),
            { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0 - 1000 },
            { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0 - 1000, paused: true, pausedRemainingMs: 5000 },
            { ...makeInitialState({ now: T0 }), phase: 'break', startedAt: T0 - 1000 },
            { ...makeInitialState({ now: T0 }), phase: 'longBreak', startedAt: T0 - 1000 },
        ];
        const actions = [
            intent.tick(), intent.start(), intent.pause(), intent.resume(),
            intent.skipBreak(), intent.endCycle(), intent.extend(60_000),
            intent.changePreset('deep'), intent.toggleSky(), intent.clearSkyOverride(),
        ];
        for (const s of states) {
            for (const a of actions) {
                const { state, events } = apply(s, a, CLASSIC, T0);
                if (state === s) {
                    assert.equal(events.length, 0,
                        `${a.type} returned the same state reference but emitted ${events.length} event(s)`);
                }
            }
        }
    });
});

describe('runPomodoro — other logged transitions', () => {
    test('END_CYCLE mid-focus logs an incomplete partial', () => {
        // The widget's right-click reset used to hard-write idle, throwing
        // the in-progress block away entirely.
        kernel.storage._seed(STORAGE_KEYS.state, {
            ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0 - 10 * 60_000,
        });
        runPomodoro(kernel, intent.endCycle(), T0);
        const list = entriesIn(kernel);
        assert.equal(list.length, 1);
        assert.equal(list[0].completed, false, 'an abandoned focus block is a partial');
        assert.equal(list[0].kind, 'focus');
    });

    test('SKIP_BREAK logs its break entry (regression cover for the app path)', () => {
        kernel.storage._seed(STORAGE_KEYS.state, {
            ...makeInitialState({ now: T0 }), phase: 'break', startedAt: T0 - 60_000, sessionIndex: 1,
        });
        runPomodoro(kernel, intent.skipBreak(), T0);
        const list = entriesIn(kernel);
        assert.equal(list.length, 1);
        assert.equal(list[0].kind, 'break');
    });
});

describe('activePreset', () => {
    test('the running cycle\'s presetId wins over settings', () => {
        // The surfaces used to disagree: the app keyed off state, the widget
        // and Focus Mode off settings, so a settings-only sync from another
        // device made the widget expire a phase early.
        assert.equal(activePreset({ presetId: 'deep' }, { activePresetId: 'classic' }).id, 'deep');
    });

    test('falls back to settings, then to classic', () => {
        assert.equal(activePreset({}, { activePresetId: 'sprint' }).id, 'sprint');
        assert.equal(activePreset(null, null).id, 'classic');
        assert.equal(activePreset({ presetId: 'nope' }, { activePresetId: 'alsoNope' }).id, 'classic');
    });
});

describe('legacy dayKey rollover self-heals', () => {
    test('an unpadded widget-written key rolls once, then stops', () => {
        // The old widget wrote '2026-8-4' while the engine writes
        // '2026-08-04', so the two ping-ponged: each rewrote the other's
        // format and zeroed sessionsToday forever.
        kernel.storage._seed(STORAGE_KEYS.state, {
            ...makeInitialState({ now: T0 }), dayKey: '2026-8-4', sessionsToday: 3,
        });
        const first = runPomodoro(kernel, intent.tick(), T0);
        assert.equal(first.changed, true, 'the mismatched key must roll once');
        assert.notEqual(first.state.dayKey, '2026-8-4');

        const writesAfter = kernel.storage.writes;
        const second = runPomodoro(kernel, intent.tick(), T0 + 1000);
        assert.equal(second.changed, false, 'and then settle — no ping-pong');
        assert.equal(kernel.storage.writes, writesAfter);
    });
});
