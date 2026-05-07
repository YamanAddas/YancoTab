/**
 * Tests for todo/engine/streaks.js — pure stats helpers.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  weekConstellation, currentStreak, missionStats, weekSummary, bumpStreak,
} from '../os/apps/todo/engine/streaks.js';
import { makeMission, makeTask, todayKey } from '../os/apps/todo/engine/state.js';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const T0 = new Date(2026, 4, 7, 14, 0, 0, 0).getTime();

describe('weekConstellation', () => {
  test('returns 7 entries with mon week-start', () => {
    const out = weekConstellation({}, T0, 'mon');
    assert.equal(out.length, 7);
    assert.deepEqual(out.map((d) => d.label), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });

  test('today flag matches current weekday', () => {
    // T0 is Thursday → 4th index (0=Mon)
    const out = weekConstellation({}, T0, 'mon');
    const today = out.find((d) => d.isToday);
    assert.equal(out.indexOf(today), 3);
  });

  test('future days flagged', () => {
    const out = weekConstellation({}, T0, 'mon');
    const future = out.filter((d) => d.isFuture);
    assert.equal(future.length, 3); // F, S, S
  });

  test('stars capped at 5', () => {
    const log = { [todayKey(T0)]: 12 };
    const out = weekConstellation(log, T0, 'mon');
    const today = out.find((d) => d.isToday);
    assert.equal(today.count, 12);
    assert.equal(today.stars, 5);
  });

  test('garbage log → all zeros', () => {
    const out = weekConstellation('not an object', T0, 'mon');
    for (const d of out) assert.equal(d.count, 0);
  });

  test('sun week-start labels', () => {
    const out = weekConstellation({}, T0, 'sun');
    assert.deepEqual(out.map((d) => d.label), ['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });
});

describe('currentStreak', () => {
  test('empty log → 0', () => {
    assert.equal(currentStreak({}, T0), 0);
  });

  test('only today counted → 1', () => {
    const log = { [todayKey(T0)]: 1 };
    assert.equal(currentStreak(log, T0), 1);
  });

  test('today + yesterday + day-before → 3', () => {
    const log = {
      [todayKey(T0)]: 2,
      [todayKey(T0 - DAY)]: 1,
      [todayKey(T0 - 2 * DAY)]: 4,
    };
    assert.equal(currentStreak(log, T0), 3);
  });

  test('today empty but yesterday + day-before → 2 (streak hasn’t broken yet)', () => {
    const log = {
      [todayKey(T0 - DAY)]: 3,
      [todayKey(T0 - 2 * DAY)]: 2,
    };
    assert.equal(currentStreak(log, T0), 2);
  });

  test('gap before today’s run → ends', () => {
    const log = {
      [todayKey(T0)]: 1,
      [todayKey(T0 - DAY)]: 1,
      // day-2 ago is empty
      [todayKey(T0 - 3 * DAY)]: 1,
    };
    assert.equal(currentStreak(log, T0), 2);
  });
});

describe('missionStats', () => {
  test('empty mission → zeros', () => {
    assert.deepEqual(missionStats(makeMission(), T0),
      { total: 0, done: 0, doing: 0, queued: 0, overdue: 0, percent: 0 });
  });

  test('mixed mission classified correctly', () => {
    const m = makeMission();
    m.tasks = [
      { ...makeTask({ text: 'A' }), done: true,  completedAt: new Date(T0 - HOUR).toISOString() },
      { ...makeTask({ text: 'B' }), dueAt: new Date(T0 + 2 * HOUR).toISOString() },     // launching → doing
      { ...makeTask({ text: 'C' }), dueAt: new Date(T0 + 8 * HOUR).toISOString() },     // today → doing
      { ...makeTask({ text: 'D' }), dueAt: new Date(T0 + DAY).toISOString() },          // queue → queued
      { ...makeTask({ text: 'E' }), dueAt: null },                                       // hangar → queued
      { ...makeTask({ text: 'F' }), dueAt: new Date(T0 - DAY).toISOString() },           // overdue → doing
    ];
    const s = missionStats(m, T0);
    assert.equal(s.total, 6);
    assert.equal(s.done, 1);
    assert.equal(s.doing, 3);
    assert.equal(s.queued, 2);
    assert.equal(s.overdue, 1);
    assert.equal(s.percent, Math.round((1 / 6) * 100));
  });

  test('all done → percent 100', () => {
    const m = makeMission();
    m.tasks = [
      { ...makeTask({ text: 'A' }), done: true, completedAt: new Date(T0).toISOString() },
      { ...makeTask({ text: 'B' }), done: true, completedAt: new Date(T0).toISOString() },
    ];
    assert.equal(missionStats(m, T0).percent, 100);
  });
});

describe('weekSummary', () => {
  test('empty state → defaults', () => {
    const s = weekSummary({ missions: [], streakLog: {} }, T0);
    assert.equal(s.completed, 0);
    assert.equal(s.onTimePercent, 100);
    assert.equal(s.streak, 0);
    assert.equal(s.bestDay, null);
  });

  test('best day across week', () => {
    const log = {
      [todayKey(T0 - 3 * DAY)]: 6,
      [todayKey(T0 - 2 * DAY)]: 2,
      [todayKey(T0)]: 4,
    };
    const s = weekSummary({ missions: [], streakLog: log }, T0, 'mon');
    assert.equal(s.completed, 12);
    assert.equal(s.bestDay.count, 6);
  });

  test('on-time % counts late completions correctly', () => {
    const m = makeMission();
    m.tasks = [
      // On-time: completed before due
      { ...makeTask({ text: 'A' }), done: true, dueAt: new Date(T0 + DAY).toISOString(),
        completedAt: new Date(T0).toISOString() },
      // Late: completed after due
      { ...makeTask({ text: 'B' }), done: true, dueAt: new Date(T0 - DAY).toISOString(),
        completedAt: new Date(T0).toISOString() },
      // No due → on-time by default
      { ...makeTask({ text: 'C' }), done: true, completedAt: new Date(T0).toISOString() },
    ];
    const s = weekSummary({ missions: [m], streakLog: {} }, T0);
    assert.equal(s.onTimePercent, 67); // 2 of 3
  });
});

describe('bumpStreak', () => {
  test('first bump on empty log → 1', () => {
    const next = bumpStreak({}, T0);
    assert.equal(next[todayKey(T0)], 1);
  });

  test('subsequent bumps increment', () => {
    let log = bumpStreak({}, T0);
    log = bumpStreak(log, T0);
    log = bumpStreak(log, T0);
    assert.equal(log[todayKey(T0)], 3);
  });

  test('bump returns a new object (does not mutate)', () => {
    const before = { [todayKey(T0)]: 1 };
    const after = bumpStreak(before, T0);
    assert.notStrictEqual(before, after);
    assert.equal(before[todayKey(T0)], 1);
    assert.equal(after[todayKey(T0)], 2);
  });

  test('handles null log', () => {
    const next = bumpStreak(null, T0);
    assert.equal(next[todayKey(T0)], 1);
  });
});
