/**
 * focus-mode.test.js — Focus Mode's pure core.
 *
 * Focus Mode reads two blobs it does not own (`yancotab_todo_v2` via the
 * todo helpers, `yancotab_pomodoro_v1` via the pomodoro reducer) and one
 * it does (`yancotab_focus_v1`). All three are sync-replicated and
 * reachable by JSON import, so all three can arrive malformed — hence the
 * hostile-input coverage on normalizeFocusState and pickFocusTask.
 *
 * The task-selection rules matter beyond tidiness: a stale pin that
 * survives completion leaves the user staring at a finished task, which
 * is the one thing a focus screen must never do.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeFocusState,
  pickFocusTask,
  cycleFocusTask,
  formatMMSS,
  formatElapsed,
  focusPhaseLabel,
  ringProgress,
  isRunning,
} from '../os/ui/components/focus/focusSession.js';
import { getPreset } from '../os/apps/pomodoro/engine/presets.js';

const CLASSIC = getPreset('classic');   // 25 / 5 · ×4
const task = (id, text = id) => ({ id, text, done: false, position: 0 });

describe('normalizeFocusState', () => {
  test('returns the inert default for junk input', () => {
    for (const junk of [null, undefined, 0, 'nope', [], true, NaN]) {
      assert.deepEqual(normalizeFocusState(junk), { active: false, taskId: null, enteredAt: null });
    }
  });

  test('keeps a well-formed blob', () => {
    assert.deepEqual(
      normalizeFocusState({ active: true, taskId: 't-1', enteredAt: 1000 }),
      { active: true, taskId: 't-1', enteredAt: 1000 },
    );
  });

  test('coerces active to a real boolean', () => {
    assert.equal(normalizeFocusState({ active: 'yes' }).active, true);
    assert.equal(normalizeFocusState({ active: 0 }).active, false);
  });

  test('rejects non-string and empty task ids', () => {
    // A `0` or `{}` id would never match a real task but would still be
    // truthy enough to suppress the "first open task" fallback.
    for (const bad of [0, 1, '', {}, [], null, false]) {
      assert.equal(normalizeFocusState({ taskId: bad }).taskId, null, `taskId: ${JSON.stringify(bad)}`);
    }
  });

  test('rejects a non-finite enteredAt', () => {
    for (const bad of [NaN, Infinity, '1000', null]) {
      assert.equal(normalizeFocusState({ enteredAt: bad }).enteredAt, null);
    }
  });

  test('does not mutate its input', () => {
    const input = { active: true, taskId: 't-1', enteredAt: 5, extra: 'keep' };
    const copy = JSON.parse(JSON.stringify(input));
    normalizeFocusState(input);
    assert.deepEqual(input, copy);
  });

  test('drops unknown keys rather than passing them through', () => {
    const out = normalizeFocusState({ active: true, evil: '<script>', __proto__: { x: 1 } });
    assert.deepEqual(Object.keys(out).sort(), ['active', 'enteredAt', 'taskId']);
  });
});

describe('pickFocusTask', () => {
  const tasks = [task('a'), task('b'), task('c')];

  test('returns null when there is nothing open', () => {
    assert.equal(pickFocusTask([], 'a'), null);
    assert.equal(pickFocusTask(null, 'a'), null);
    assert.equal(pickFocusTask(undefined, null), null);
  });

  test('honours a live pin over first-open', () => {
    assert.equal(pickFocusTask(tasks, 'c').id, 'c');
  });

  test('falls back to first-open when no pin is set', () => {
    assert.equal(pickFocusTask(tasks, null).id, 'a');
  });

  test('falls back when the pin no longer matches an open task', () => {
    // The pinned task was completed in the Todo app while Focus Mode was
    // showing it. Staring at a finished task is the failure we are
    // guarding against.
    assert.equal(pickFocusTask(tasks, 'deleted-id').id, 'a');
  });

  test('survives holes and malformed entries in the list', () => {
    const messy = [null, undefined, { noId: true }, task('real')];
    assert.equal(pickFocusTask(messy, 'real').id, 'real');
  });
});

describe('cycleFocusTask', () => {
  const tasks = [task('a'), task('b'), task('c')];

  test('steps forward and wraps at the end', () => {
    assert.equal(cycleFocusTask(tasks, 'a', 1), 'b');
    assert.equal(cycleFocusTask(tasks, 'c', 1), 'a');
  });

  test('steps backward and wraps at the start', () => {
    assert.equal(cycleFocusTask(tasks, 'b', -1), 'a');
    assert.equal(cycleFocusTask(tasks, 'a', -1), 'c');
  });

  test('starts from the top when the current id is unknown', () => {
    // Explicitly asserted for BOTH directions: `idx === -1` plus a naive
    // `idx + step` would land on 'c' for dir=-1, silently jumping to the
    // end of the list instead of the top.
    assert.equal(cycleFocusTask(tasks, 'gone', 1), 'a');
    assert.equal(cycleFocusTask(tasks, 'gone', -1), 'a');
  });

  test('a single task cycles to itself in both directions', () => {
    const one = [task('solo')];
    assert.equal(cycleFocusTask(one, 'solo', 1), 'solo');
    assert.equal(cycleFocusTask(one, 'solo', -1), 'solo');
  });

  test('returns null for an empty or invalid list', () => {
    assert.equal(cycleFocusTask([], 'a', 1), null);
    assert.equal(cycleFocusTask(null, 'a', 1), null);
  });

  test('treats any non-negative dir as forward', () => {
    assert.equal(cycleFocusTask(tasks, 'a', 0), 'b');
    assert.equal(cycleFocusTask(tasks, 'a'), 'b');
  });
});

describe('formatMMSS', () => {
  test('formats whole minutes and seconds', () => {
    assert.equal(formatMMSS(25 * 60 * 1000), '25:00');
    assert.equal(formatMMSS(61 * 1000), '01:01');
    assert.equal(formatMMSS(0), '00:00');
  });

  test('clamps negatives to zero rather than rendering "-1:-1"', () => {
    assert.equal(formatMMSS(-5000), '00:00');
  });

  test('rounds up so the last second reads 00:01, not 00:00', () => {
    assert.equal(formatMMSS(1), '00:01');
    assert.equal(formatMMSS(999), '00:01');
  });

  test('survives non-numeric input', () => {
    for (const bad of [NaN, undefined, null, 'abc']) {
      assert.equal(formatMMSS(bad), '00:00');
    }
  });

  test('does not wrap past 60 minutes', () => {
    // A long-break preset can exceed an hour; MM must keep counting.
    assert.equal(formatMMSS(90 * 60 * 1000), '90:00');
  });
});

describe('formatElapsed', () => {
  const T0 = 1_000_000_000_000;

  test('reads "just started" under a minute', () => {
    assert.equal(formatElapsed(T0, T0 + 30_000), 'just started');
  });

  test('reads minutes under an hour', () => {
    assert.equal(formatElapsed(T0, T0 + 18 * 60_000), '18m in');
  });

  test('reads hours and zero-padded minutes past an hour', () => {
    assert.equal(formatElapsed(T0, T0 + 64 * 60_000), '1h 04m in');
  });

  test('returns empty for junk or a future timestamp', () => {
    assert.equal(formatElapsed(null, T0), '');
    assert.equal(formatElapsed(NaN, T0), '');
    // Clock skew / a synced blob from a device ahead of this one.
    assert.equal(formatElapsed(T0 + 60_000, T0), '');
  });
});

describe('focusPhaseLabel', () => {
  test('idle invites a start', () => {
    assert.equal(focusPhaseLabel({ phase: 'idle' }, CLASSIC), 'Tap the ring to start');
    assert.equal(focusPhaseLabel(null, CLASSIC), 'Tap the ring to start');
  });

  test('counts sessions from 1, not 0', () => {
    assert.equal(focusPhaseLabel({ phase: 'focus', sessionIndex: 0 }, CLASSIC), 'Session 1 of 4');
    assert.equal(focusPhaseLabel({ phase: 'focus', sessionIndex: 2 }, CLASSIC), 'Session 3 of 4');
  });

  test('clamps the session number to the preset length', () => {
    // Guards an off-by-one reading "Session 5 of 4" on the last session.
    assert.equal(focusPhaseLabel({ phase: 'focus', sessionIndex: 9 }, CLASSIC), 'Session 4 of 4');
  });

  test('paused wins over the running label', () => {
    assert.equal(focusPhaseLabel({ phase: 'focus', sessionIndex: 1, paused: true }, CLASSIC), 'Paused');
  });

  test('distinguishes short and long breaks', () => {
    assert.equal(focusPhaseLabel({ phase: 'break' }, CLASSIC), 'Take a break');
    assert.equal(focusPhaseLabel({ phase: 'longBreak' }, CLASSIC), 'Long break');
  });
});

describe('ringProgress', () => {
  const T0 = 1_000_000_000_000;

  test('idle reads empty, not full', () => {
    // A full ring at idle implies a completed session that never happened.
    assert.equal(ringProgress({ phase: 'idle' }, CLASSIC, T0), 0);
    assert.equal(ringProgress(null, CLASSIC, T0), 0);
  });

  test('is 0 at the start and 1 at the deadline', () => {
    const s = { phase: 'focus', startedAt: T0, paused: false };
    assert.equal(ringProgress(s, CLASSIC, T0), 0);
    assert.equal(ringProgress(s, CLASSIC, T0 + CLASSIC.focusMs), 1);
  });

  test('is 0.5 at the halfway point', () => {
    const s = { phase: 'focus', startedAt: T0, paused: false };
    assert.equal(ringProgress(s, CLASSIC, T0 + CLASSIC.focusMs / 2), 0.5);
  });

  test('clamps past the deadline instead of exceeding 1', () => {
    // A backgrounded tab can tick long after the deadline; a >1 progress
    // would invert the SVG dash offset and draw the ring backwards.
    const s = { phase: 'focus', startedAt: T0, paused: false };
    assert.equal(ringProgress(s, CLASSIC, T0 + CLASSIC.focusMs * 3), 1);
  });

  test('uses the break duration during a break', () => {
    const s = { phase: 'break', startedAt: T0, paused: false };
    assert.equal(ringProgress(s, CLASSIC, T0 + CLASSIC.breakMs / 2), 0.5);
  });

  test('reads the frozen remainder while paused', () => {
    const s = { phase: 'focus', startedAt: T0, paused: true, pausedRemainingMs: CLASSIC.focusMs / 4 };
    // Paused with a quarter left ⇒ three quarters done, and it must not
    // drift as wall-clock time advances.
    assert.equal(ringProgress(s, CLASSIC, T0 + 999_999), 0.75);
  });
});

describe('isRunning', () => {
  test('true only while actively counting down', () => {
    assert.equal(isRunning({ phase: 'focus', paused: false }), true);
    assert.equal(isRunning({ phase: 'break', paused: false }), true);
  });

  test('false when idle, paused, or absent', () => {
    assert.equal(isRunning({ phase: 'idle', paused: false }), false);
    assert.equal(isRunning({ phase: 'focus', paused: true }), false);
    assert.equal(isRunning(null), false);
  });
});
