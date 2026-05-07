/**
 * Tests for the Pomodoro pure reducer + state helpers.
 *
 * Run with: node --test tests/pomodoro-engine.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { apply } from '../os/apps/pomodoro/engine/reducer.js';
import {
  makeInitialState, normalizeState, todayKey,
  remainingMs, phaseDurationMs, effectiveSky, skyForPhase,
} from '../os/apps/pomodoro/engine/state.js';
import {
  PRESETS, getPreset, listPresets, isValidPreset, DEFAULT_PRESET_ID,
} from '../os/apps/pomodoro/engine/presets.js';

const M = 60_000;
const T0 = Date.UTC(2026, 4, 7, 13, 42, 0); // 2026-05-07 13:42 UTC, the user's "today"

// Convenience: get the preset for a state.
function pre(state) { return getPreset(state.presetId); }

// ─── presets ──────────────────────────────────────────────────────

describe('presets', () => {
  test('classic / deep / sprint / afternoon all defined', () => {
    assert.equal(PRESETS.classic.name, 'Classic');
    assert.equal(PRESETS.deep.focusMs, 50 * M);
    assert.equal(PRESETS.sprint.sessions, 6);
    assert.equal(PRESETS.afternoon.breakMs, 20 * M);
  });

  test('listPresets returns 4 entries', () => {
    assert.equal(listPresets().length, 4);
  });

  test('getPreset falls back to default for unknown id', () => {
    assert.equal(getPreset('lol').id, DEFAULT_PRESET_ID);
    assert.equal(getPreset(undefined).id, DEFAULT_PRESET_ID);
  });

  test('isValidPreset rejects junk', () => {
    assert.equal(isValidPreset(null), false);
    assert.equal(isValidPreset({}), false);
    assert.equal(isValidPreset({ focusMs: 0, breakMs: 1, longBreakMs: 1, sessions: 1 }), false);
    assert.equal(isValidPreset({ focusMs: 1000, breakMs: 1000, longBreakMs: 1000, sessions: 50 }), false);
    assert.equal(isValidPreset({ focusMs: 1000, breakMs: 1000, longBreakMs: 1000, sessions: 4 }), true);
  });
});

// ─── state helpers ────────────────────────────────────────────────

describe('state helpers', () => {
  test('makeInitialState defaults', () => {
    const s = makeInitialState({ now: T0 });
    assert.equal(s.phase, 'idle');
    assert.equal(s.presetId, 'classic');
    assert.equal(s.sessionIndex, 0);
    assert.equal(s.startedAt, null);
    assert.equal(s.dayKey, todayKey(T0));
    assert.equal(s.manualSkyOverride, null);
  });

  test('normalizeState fills missing fields', () => {
    const s = normalizeState({ phase: 'focus' }, T0);
    assert.equal(s.phase, 'focus');
    assert.equal(s.presetId, 'classic');
    assert.equal(s.sessionsToday, 0);
  });

  test('normalizeState rejects junk overrides', () => {
    const s = normalizeState({ phase: 'focus', manualSkyOverride: 'rainbow' }, T0);
    assert.equal(s.manualSkyOverride, null);
  });

  test('phaseDurationMs maps each phase', () => {
    const p = PRESETS.classic;
    assert.equal(phaseDurationMs('focus', p), p.focusMs);
    assert.equal(phaseDurationMs('break', p), p.breakMs);
    assert.equal(phaseDurationMs('longBreak', p), p.longBreakMs);
  });

  test('remainingMs idle returns full focus duration', () => {
    const s = makeInitialState({ now: T0 });
    assert.equal(remainingMs(s, PRESETS.classic, T0), PRESETS.classic.focusMs);
  });

  test('remainingMs running counts down', () => {
    const s = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0 };
    assert.equal(remainingMs(s, PRESETS.classic, T0 + 5 * M), 20 * M);
  });

  test('remainingMs paused returns frozen value', () => {
    const s = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0,
      paused: true, pausedRemainingMs: 10 * M };
    assert.equal(remainingMs(s, PRESETS.classic, T0 + 60 * M), 10 * M);
  });

  test('skyForPhase + effectiveSky', () => {
    assert.equal(skyForPhase('focus'), 'day');
    assert.equal(skyForPhase('break'), 'night');
    assert.equal(skyForPhase('longBreak'), 'night');
    assert.equal(skyForPhase('idle'), 'day');
    const s = { ...makeInitialState({ now: T0 }), phase: 'focus', manualSkyOverride: 'night' };
    assert.equal(effectiveSky(s), 'night');
  });
});

// ─── reducer: START / PAUSE / RESUME ──────────────────────────────

describe('reducer: START', () => {
  test('idle → focus, anchors cycleStartedAt', () => {
    const s0 = makeInitialState({ now: T0 });
    const { state, events } = apply(s0, { type: 'START' }, pre(s0), T0);
    assert.equal(state.phase, 'focus');
    assert.equal(state.sessionIndex, 0);
    assert.equal(state.startedAt, T0);
    assert.equal(state.cycleStartedAt, T0);
    assert.ok(events.find((e) => e.type === 'phase' && e.to === 'focus'));
    assert.ok(events.find((e) => e.type === 'activity'));
  });

  test('start while already running is a no-op', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0 };
    const { state, events } = apply(s0, { type: 'START' }, pre(s0), T0 + 1 * M);
    assert.equal(state, s0);
    assert.equal(events.length, 0);
  });
});

describe('reducer: PAUSE / RESUME', () => {
  test('pause captures remaining, resume restores', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0, cycleStartedAt: T0 };
    const { state: paused } = apply(s0, { type: 'PAUSE' }, pre(s0), T0 + 5 * M);
    assert.equal(paused.paused, true);
    assert.equal(paused.pausedRemainingMs, 20 * M);

    // Resume 10 minutes later — startedAt re-anchored so remaining stays at 20m.
    const tResume = T0 + 15 * M;
    const { state: resumed } = apply(paused, { type: 'RESUME' }, pre(paused), tResume);
    assert.equal(resumed.paused, false);
    assert.equal(resumed.pausedRemainingMs, 0);
    assert.equal(remainingMs(resumed, pre(resumed), tResume), 20 * M);
  });

  test('pause while idle is a no-op', () => {
    const s0 = makeInitialState({ now: T0 });
    const { state, events } = apply(s0, { type: 'PAUSE' }, pre(s0), T0);
    assert.equal(state, s0);
    assert.equal(events.length, 0);
  });

  test('resume when not paused is a no-op', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0 };
    const { state } = apply(s0, { type: 'RESUME' }, pre(s0), T0 + 1 * M);
    assert.equal(state, s0);
  });
});

// ─── reducer: TICK phase advance ──────────────────────────────────

describe('reducer: TICK', () => {
  test('focus → break after focusMs elapses', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0,
      cycleStartedAt: T0 };
    const tEnd = T0 + 25 * M;
    const { state, events } = apply(s0, { type: 'TICK' }, pre(s0), tEnd);
    assert.equal(state.phase, 'break');
    assert.equal(state.sessionIndex, 1);
    assert.equal(state.sessionsToday, 1);
    assert.equal(state.startedAt, tEnd);
    assert.ok(events.find((e) => e.type === 'sessionLogged' && e.entry.completed === true));
    assert.ok(events.find((e) => e.type === 'phase' && e.from === 'focus' && e.to === 'break'));
  });

  test('break → next focus', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'break', sessionIndex: 1,
      startedAt: T0, cycleStartedAt: T0 };
    const tEnd = T0 + 5 * M;
    const { state } = apply(s0, { type: 'TICK' }, pre(s0), tEnd);
    assert.equal(state.phase, 'focus');
    assert.equal(state.sessionIndex, 1); // unchanged — incremented when focus completes
    assert.equal(state.startedAt, tEnd);
  });

  test('last focus session → longBreak (not break)', () => {
    const preset = pre({ presetId: 'classic' });
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', sessionIndex: preset.sessions - 1,
      startedAt: T0, cycleStartedAt: T0 };
    const { state, events } = apply(s0, { type: 'TICK' }, preset, T0 + preset.focusMs);
    assert.equal(state.phase, 'longBreak');
    assert.equal(state.sessionIndex, preset.sessions);
    assert.ok(events.find((e) => e.type === 'phase' && e.to === 'longBreak'));
  });

  test('longBreak → idle (cycle complete)', () => {
    const preset = pre({ presetId: 'classic' });
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'longBreak',
      sessionIndex: preset.sessions, startedAt: T0, cycleStartedAt: T0 };
    const { state, events } = apply(s0, { type: 'TICK' }, preset, T0 + preset.longBreakMs);
    assert.equal(state.phase, 'idle');
    assert.equal(state.sessionIndex, 0);
    assert.equal(state.startedAt, null);
    assert.equal(state.cycleStartedAt, null);
    assert.ok(events.find((e) => e.type === 'phase' && e.to === 'idle'));
  });

  test('TICK during focus before duration elapses is a no-op', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0 };
    const { state, events } = apply(s0, { type: 'TICK' }, pre(s0), T0 + 5 * M);
    assert.equal(state, s0);
    assert.equal(events.length, 0);
  });

  test('TICK while paused is a no-op', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0,
      paused: true, pausedRemainingMs: 10 * M };
    const { state } = apply(s0, { type: 'TICK' }, pre(s0), T0 + 60 * M);
    assert.equal(state, s0);
  });
});

// ─── reducer: EXTEND ──────────────────────────────────────────────

describe('reducer: EXTEND', () => {
  test('focus +5min pushes deadline', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0 };
    const { state, events } = apply(s0, { type: 'EXTEND', ms: 5 * M }, pre(s0), T0 + 10 * M);
    assert.equal(state.startedAt, T0 + 5 * M);
    assert.equal(remainingMs(state, pre(state), T0 + 10 * M), 20 * M);
    assert.ok(events.find((e) => e.type === 'toast'));
  });

  test('extend on break is a no-op', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'break', startedAt: T0 };
    const { state } = apply(s0, { type: 'EXTEND', ms: 5 * M }, pre(s0), T0);
    assert.equal(state, s0);
  });

  test('extend while paused adds to pausedRemainingMs', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0,
      paused: true, pausedRemainingMs: 10 * M };
    const { state } = apply(s0, { type: 'EXTEND', ms: 5 * M }, pre(s0), T0);
    assert.equal(state.pausedRemainingMs, 15 * M);
  });

  test('extend with zero or negative ms is a no-op', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0 };
    assert.equal(apply(s0, { type: 'EXTEND', ms: 0 }, pre(s0), T0).state, s0);
    assert.equal(apply(s0, { type: 'EXTEND', ms: -1000 }, pre(s0), T0).state, s0);
  });
});

// ─── reducer: SKIP_BREAK / END_CYCLE ──────────────────────────────

describe('reducer: SKIP_BREAK', () => {
  test('break → next focus, logs partial', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'break', sessionIndex: 1,
      startedAt: T0 };
    const { state, events } = apply(s0, { type: 'SKIP_BREAK' }, pre(s0), T0 + 1 * M);
    assert.equal(state.phase, 'focus');
    const logged = events.find((e) => e.type === 'sessionLogged');
    assert.ok(logged);
    assert.equal(logged.entry.completed, false);
    assert.equal(logged.entry.kind, 'break');
  });

  test('longBreak → idle (skips end of cycle)', () => {
    const preset = pre({ presetId: 'classic' });
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'longBreak',
      sessionIndex: preset.sessions, startedAt: T0 };
    const { state } = apply(s0, { type: 'SKIP_BREAK' }, preset, T0 + 1 * M);
    assert.equal(state.phase, 'idle');
  });

  test('skip during focus is a no-op', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0 };
    const { state } = apply(s0, { type: 'SKIP_BREAK' }, pre(s0), T0);
    assert.equal(state, s0);
  });
});

describe('reducer: END_CYCLE', () => {
  test('mid-focus end logs partial', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0,
      cycleStartedAt: T0 };
    const { state, events } = apply(s0, { type: 'END_CYCLE' }, pre(s0), T0 + 7 * M);
    assert.equal(state.phase, 'idle');
    assert.equal(state.sessionIndex, 0);
    assert.equal(state.startedAt, null);
    const logged = events.find((e) => e.type === 'sessionLogged');
    assert.ok(logged);
    assert.equal(logged.entry.completed, false);
    assert.equal(logged.entry.durationMs, 7 * M);
  });

  test('end during break does not log a focus partial', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'break', sessionIndex: 1,
      startedAt: T0 };
    const { state, events } = apply(s0, { type: 'END_CYCLE' }, pre(s0), T0 + 1 * M);
    assert.equal(state.phase, 'idle');
    assert.equal(events.filter((e) => e.type === 'sessionLogged').length, 0);
  });

  test('end while idle is a no-op', () => {
    const s0 = makeInitialState({ now: T0 });
    const { state, events } = apply(s0, { type: 'END_CYCLE' }, pre(s0), T0);
    assert.equal(state, s0);
    assert.equal(events.length, 0);
  });
});

// ─── reducer: CHANGE_PRESET ──────────────────────────────────────

describe('reducer: CHANGE_PRESET', () => {
  test('idle → preset change accepted', () => {
    const s0 = makeInitialState({ now: T0 });
    const { state } = apply(s0, { type: 'CHANGE_PRESET', presetId: 'sprint' }, pre(s0), T0);
    assert.equal(state.presetId, 'sprint');
  });

  test('running → preset change rejected', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0 };
    const { state } = apply(s0, { type: 'CHANGE_PRESET', presetId: 'sprint' }, pre(s0), T0);
    assert.equal(state, s0);
  });

  test('change to current preset is a no-op', () => {
    const s0 = makeInitialState({ now: T0 });
    const { state } = apply(s0, { type: 'CHANGE_PRESET', presetId: 'classic' }, pre(s0), T0);
    assert.equal(state, s0);
  });

  test('garbage presetId rejected', () => {
    const s0 = makeInitialState({ now: T0 });
    assert.equal(apply(s0, { type: 'CHANGE_PRESET' }, pre(s0), T0).state, s0);
    assert.equal(apply(s0, { type: 'CHANGE_PRESET', presetId: 42 }, pre(s0), T0).state, s0);
  });
});

// ─── reducer: sky override ────────────────────────────────────────

describe('reducer: sky override', () => {
  test('TOGGLE_SKY_OVERRIDE cycles null → night → day → null', () => {
    const s0 = makeInitialState({ now: T0 });
    let r = apply(s0, { type: 'TOGGLE_SKY_OVERRIDE' }, pre(s0), T0);
    assert.equal(r.state.manualSkyOverride, 'night');
    r = apply(r.state, { type: 'TOGGLE_SKY_OVERRIDE' }, pre(r.state), T0);
    assert.equal(r.state.manualSkyOverride, 'day');
    r = apply(r.state, { type: 'TOGGLE_SKY_OVERRIDE' }, pre(r.state), T0);
    assert.equal(r.state.manualSkyOverride, null);
  });

  test('phase transition clears the override', () => {
    const s0 = { ...makeInitialState({ now: T0 }), phase: 'focus', startedAt: T0,
      manualSkyOverride: 'night', cycleStartedAt: T0 };
    const { state } = apply(s0, { type: 'TICK' }, pre(s0), T0 + 25 * M);
    assert.equal(state.phase, 'break');
    assert.equal(state.manualSkyOverride, null);
  });

  test('CLEAR_SKY_OVERRIDE no-op when already null', () => {
    const s0 = makeInitialState({ now: T0 });
    const { state } = apply(s0, { type: 'CLEAR_SKY_OVERRIDE' }, pre(s0), T0);
    assert.equal(state, s0);
  });
});

// ─── day rollover ─────────────────────────────────────────────────

describe('day rollover', () => {
  test('TICK across midnight resets sessionsToday', () => {
    // Stale dayKey from yesterday, but the timer was started recently (5 min ago)
    // so TICK should NOT advance the phase — only roll the day.
    const yesterday = T0 - 24 * 60 * M;
    const s0 = { ...makeInitialState({ now: yesterday }),
      phase: 'focus', startedAt: T0 - 5 * M, sessionsToday: 3,
      dayKey: todayKey(yesterday) };
    assert.notEqual(todayKey(yesterday), todayKey(T0)); // sanity: keys differ
    const { state } = apply(s0, { type: 'TICK' }, pre(s0), T0);
    assert.equal(state.dayKey, todayKey(T0));
    assert.equal(state.sessionsToday, 0);
    assert.equal(state.phase, 'focus'); // still running
  });

  test('rollover does not reset sessionIndex within the cycle', () => {
    const yesterday = T0 - 24 * 60 * M;
    const s0 = { ...makeInitialState({ now: yesterday }),
      phase: 'break', sessionIndex: 2, startedAt: yesterday, cycleStartedAt: yesterday,
      dayKey: todayKey(yesterday), sessionsToday: 2 };
    const { state } = apply(s0, { type: 'PAUSE' }, pre(s0), T0);
    assert.equal(state.sessionIndex, 2);
    assert.equal(state.dayKey, todayKey(T0));
    assert.equal(state.sessionsToday, 0);
  });
});

// ─── unknown action / null state ──────────────────────────────────

describe('reducer: edge cases', () => {
  test('unknown action returns state unchanged', () => {
    const s0 = makeInitialState({ now: T0 });
    const { state, events } = apply(s0, { type: 'NONSENSE' }, pre(s0), T0);
    assert.equal(state.phase, 'idle');
    assert.equal(events.length, 0);
  });

  test('null action returns state', () => {
    const s0 = makeInitialState({ now: T0 });
    const { state } = apply(s0, null, pre(s0), T0);
    assert.equal(state, s0);
  });

  test('null state stays null', () => {
    const { state } = apply(null, { type: 'START' }, PRESETS.classic, T0);
    assert.equal(state, null);
  });
});
