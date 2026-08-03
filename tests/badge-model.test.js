/**
 * badge-model.test.js — icon badge derivation.
 *
 * The counters read blobs owned by other apps (`yancotab_todo_v2`,
 * `yancotab_clock_v3`, `yancotab_pomodoro_v1`), all of which are
 * user-editable via JSON import and two of which are sync-replicated. A
 * badge that throws takes the whole icon paint down with it, so every
 * counter here has to survive garbage rather than trust its input.
 *
 * The signature helper gets its own coverage because it is load-bearing
 * for correctness, not just speed: the painter re-runs on every grid
 * mutation and writes badge nodes into the tree it is observing. If the
 * signature ever reported "changed" for an unchanged badge, the painter
 * would retrigger its own observer forever.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  countOpenTodos,
  countActiveAlarms,
  isTimerRunning,
  formatBadgeCount,
  computeBadges,
  badgeSignature,
  COUNT_CAP,
} from '../os/ui/badges/badgeModel.js';

const mission = (tasks) => ({ id: 'm', name: 'M', tasks });
const task = (done) => ({ id: 't' + Math.random(), text: 'x', done });

describe('countOpenTodos', () => {
  test('counts undone tasks in a single mission', () => {
    assert.equal(countOpenTodos({ missions: [mission([task(false), task(true), task(false)])] }), 2);
  });

  test('counts across EVERY mission, not just the active one', () => {
    // The icon speaks for the whole app; scoping to activeMissionId would
    // hide work sitting in another list.
    const state = {
      activeMissionId: 'm1',
      missions: [
        { id: 'm1', tasks: [task(false)] },
        { id: 'm2', tasks: [task(false), task(false)] },
      ],
    };
    assert.equal(countOpenTodos(state), 3);
  });

  test('returns 0 when everything is done', () => {
    assert.equal(countOpenTodos({ missions: [mission([task(true), task(true)])] }), 0);
  });

  test('survives garbage without throwing', () => {
    for (const junk of [null, undefined, 0, 'nope', [], true, {}, { missions: 'no' }]) {
      assert.equal(countOpenTodos(junk), 0, `input: ${JSON.stringify(junk)}`);
    }
  });

  test('skips holes and malformed missions/tasks', () => {
    const state = { missions: [null, { tasks: null }, { tasks: [null, task(false), undefined] }] };
    assert.equal(countOpenTodos(state), 1);
  });

  test('treats a missing done flag as undone', () => {
    // Matches the reducer, where absent `done` normalizes to false.
    assert.equal(countOpenTodos({ missions: [mission([{ id: 'a', text: 'x' }])] }), 1);
  });
});

describe('countActiveAlarms', () => {
  test('counts only enabled alarms', () => {
    const state = { alarms: [{ enabled: true }, { enabled: false }, { enabled: true }] };
    assert.equal(countActiveAlarms(state), 2);
  });

  test('returns 0 for garbage or an absent list', () => {
    for (const junk of [null, undefined, {}, { alarms: null }, 'x', []]) {
      assert.equal(countActiveAlarms(junk), 0);
    }
  });

  test('skips null entries', () => {
    assert.equal(countActiveAlarms({ alarms: [null, { enabled: true }, undefined] }), 1);
  });
});

describe('isTimerRunning', () => {
  test('true while counting down, in focus or break', () => {
    assert.equal(isTimerRunning({ phase: 'focus', paused: false }), true);
    assert.equal(isTimerRunning({ phase: 'break', paused: false }), true);
    assert.equal(isTimerRunning({ phase: 'longBreak', paused: false }), true);
  });

  test('false when paused — a pulsing dot through a pause would lie', () => {
    assert.equal(isTimerRunning({ phase: 'focus', paused: true }), false);
  });

  test('false when idle or malformed', () => {
    assert.equal(isTimerRunning({ phase: 'idle', paused: false }), false);
    for (const junk of [null, undefined, 'focus', 0, []]) {
      assert.equal(isTimerRunning(junk), false);
    }
  });

  test('false when phase is missing entirely', () => {
    // An empty object must not read as running just because it isn't 'idle'.
    assert.equal(isTimerRunning({}), false);
    assert.equal(isTimerRunning({ paused: false }), false);
  });
});

describe('formatBadgeCount', () => {
  test('renders positive counts', () => {
    assert.equal(formatBadgeCount(1), '1');
    assert.equal(formatBadgeCount(42), '42');
    assert.equal(formatBadgeCount(COUNT_CAP), '99');
  });

  test('caps above the limit so the pill cannot overflow', () => {
    assert.equal(formatBadgeCount(COUNT_CAP + 1), '99+');
    assert.equal(formatBadgeCount(5000), '99+');
  });

  test('returns empty for zero, negatives and junk', () => {
    for (const junk of [0, -1, NaN, Infinity, null, undefined, 'seven', {}]) {
      assert.equal(formatBadgeCount(junk), '', `input: ${JSON.stringify(junk)}`);
    }
  });

  test('floors fractional counts rather than printing a decimal', () => {
    assert.equal(formatBadgeCount(3.7), '3');
  });
});

describe('computeBadges', () => {
  test('omits apps with nothing to say, so absent means "clear it"', () => {
    assert.deepEqual(computeBadges({}), {});
    assert.deepEqual(computeBadges(), {});
    assert.deepEqual(
      computeBadges({ todo: { missions: [mission([task(true)])] }, pomodoro: { phase: 'idle' }, clock: { alarms: [] } }),
      {},
    );
  });

  test('emits a count for todo and dots for the others', () => {
    const out = computeBadges({
      todo: { missions: [mission([task(false), task(false)])] },
      pomodoro: { phase: 'focus', paused: false },
      clock: { alarms: [{ enabled: true }] },
    });
    assert.deepEqual(out.todo, { kind: 'count', text: '2', tone: 'alert' });
    assert.deepEqual(out.pomodoro, { kind: 'dot', tone: 'active' });
    assert.deepEqual(out.clock, { kind: 'dot', tone: 'warn' });
  });

  test('each source is independent — one garbage blob cannot suppress the others', () => {
    const out = computeBadges({
      todo: 'corrupt',
      pomodoro: { phase: 'focus', paused: false },
      clock: null,
    });
    assert.deepEqual(Object.keys(out), ['pomodoro']);
  });

  test('never returns keys for apps that have no badge concept', () => {
    const out = computeBadges({ todo: { missions: [mission([task(false)])] } });
    assert.deepEqual(Object.keys(out), ['todo']);
  });
});

describe('badgeSignature', () => {
  test('is stable for equal descriptors', () => {
    // This is what stops the painter rewriting nodes it just wrote and
    // retriggering its own MutationObserver.
    assert.equal(
      badgeSignature({ kind: 'count', text: '3', tone: 'alert' }),
      badgeSignature({ kind: 'count', text: '3', tone: 'alert' }),
    );
  });

  test('differs when the count changes', () => {
    assert.notEqual(
      badgeSignature({ kind: 'count', text: '3', tone: 'alert' }),
      badgeSignature({ kind: 'count', text: '4', tone: 'alert' }),
    );
  });

  test('differs when the tone changes', () => {
    assert.notEqual(
      badgeSignature({ kind: 'dot', tone: 'active' }),
      badgeSignature({ kind: 'dot', tone: 'warn' }),
    );
  });

  test('distinguishes a dot from a count', () => {
    assert.notEqual(badgeSignature({ kind: 'dot', tone: 'alert' }), badgeSignature({ kind: 'count', text: '1', tone: 'alert' }));
  });

  test('empty for no badge, so "cleared" compares equal to "never had one"', () => {
    assert.equal(badgeSignature(null), '');
    assert.equal(badgeSignature(undefined), '');
  });
});
