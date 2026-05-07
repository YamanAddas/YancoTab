/**
 * Tests for todo/engine/aggregate.js — cross-mission helpers.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  todaysActionable, todayTimeline, weekBuckets, missionProgress, reviewSummary,
} from '../os/apps/todo/engine/aggregate.js';
import { makeMission, makeTask, todayKey } from '../os/apps/todo/engine/state.js';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const T0 = new Date(2026, 4, 7, 14, 0, 0, 0).getTime();

function task(over = {}) {
  return { ...makeTask({ text: 'sample' }), ...over };
}

function stateOf(missions, streakLog = {}) {
  return { missions, activeMissionId: missions[0]?.id || null, streakLog, version: 2 };
}

// ─── todaysActionable ────────────────────────────────────────────

describe('todaysActionable', () => {
  test('aggregates across all missions', () => {
    const m1 = makeMission({ name: 'Work' });
    const m2 = makeMission({ name: 'Home' });
    m1.tasks = [
      task({ text: 'A', dueAt: new Date(T0 + 2 * HOUR).toISOString() }),         // launching
      task({ text: 'B', dueAt: new Date(T0 + 14 * DAY).toISOString() }),         // queue (excluded)
    ];
    m2.tasks = [
      task({ text: 'C', dueAt: new Date(T0 + 8 * HOUR).toISOString() }),          // today
    ];
    const out = todaysActionable(stateOf([m1, m2]), T0);
    const texts = out.map((e) => e.task.text);
    assert.deepEqual(texts, ['A', 'C']);
  });

  test('open before done; overdue first', () => {
    const m = makeMission({ name: 'Mix' });
    m.tasks = [
      task({ text: 'open',     dueAt: new Date(T0 + HOUR).toISOString() }),
      task({ text: 'done-today', done: true, completedAt: new Date(T0 - HOUR).toISOString() }),
      task({ text: 'overdue',  dueAt: new Date(T0 - 2 * HOUR).toISOString() }),
    ];
    const out = todaysActionable(stateOf([m]), T0);
    const texts = out.map((e) => e.task.text);
    assert.deepEqual(texts, ['overdue', 'open', 'done-today']);
  });

  test('null state → empty', () => {
    assert.deepEqual(todaysActionable(null, T0), []);
  });
});

// ─── todayTimeline ───────────────────────────────────────────────

describe('todayTimeline', () => {
  test('positions tasks by due time', () => {
    const m = makeMission();
    m.tasks = [
      task({ text: '6am-edge', dueAt: new Date(2026, 4, 7, 6, 0).toISOString() }),
      task({ text: 'noon',      dueAt: new Date(2026, 4, 7, 12, 0).toISOString() }),
      task({ text: 'midnight-edge', dueAt: new Date(2026, 4, 7, 23, 59).toISOString() }),
    ];
    const tl = todayTimeline(stateOf([m]), T0);
    assert.equal(tl.items.length, 3);
    // 6am should be near 0%, noon near 33%, 23:59 near 100%
    assert.ok(tl.items[0].pct < 10);
    const noon = tl.items.find((it) => it.task.text === 'noon');
    assert.ok(noon.pct > 30 && noon.pct < 40);
  });

  test('nowPct reflects current time', () => {
    const tl = todayTimeline(stateOf([makeMission()]), T0);
    // T0 = 14:00, window is 6→24 (18h). 14-6=8 of 18 ≈ 44%
    assert.ok(tl.nowPct >= 40 && tl.nowPct <= 50);
  });

  test('skips done tasks + tasks without dueAt', () => {
    const m = makeMission();
    m.tasks = [
      task({ text: 'no-due' }),
      task({ text: 'done-today', done: true, completedAt: new Date(T0 - HOUR).toISOString() }),
      task({ text: 'real',  dueAt: new Date(T0 + HOUR).toISOString() }),
    ];
    const tl = todayTimeline(stateOf([m]), T0);
    assert.equal(tl.items.length, 1);
    assert.equal(tl.items[0].task.text, 'real');
  });
});

// ─── weekBuckets ─────────────────────────────────────────────────

describe('weekBuckets', () => {
  test('returns 7 days with mon week-start', () => {
    const out = weekBuckets(stateOf([makeMission()]), T0, 'mon');
    assert.equal(out.days.length, 7);
    assert.deepEqual(out.days.map((d) => d.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  test('today flag matches', () => {
    const out = weekBuckets(stateOf([makeMission()]), T0, 'mon');
    const today = out.days.find((d) => d.isToday);
    assert.equal(today.label, 'Thu');
  });

  test('groups tasks by their dueAt day', () => {
    const m = makeMission();
    m.tasks = [
      task({ text: 'today',    dueAt: new Date(T0 + 4 * HOUR).toISOString() }),
      task({ text: 'tomorrow', dueAt: new Date(T0 + DAY + 4 * HOUR).toISOString() }),
      task({ text: 'no-due' }),
      task({ text: 'next-week', dueAt: new Date(T0 + 10 * DAY).toISOString() }),
    ];
    const out = weekBuckets(stateOf([m]), T0, 'mon');
    const today = out.days.find((d) => d.isToday);
    const tomorrow = out.days[out.days.indexOf(today) + 1];
    assert.equal(today.tasks.length, 1);
    assert.equal(today.tasks[0].task.text, 'today');
    assert.equal(tomorrow.tasks.length, 1);
    assert.equal(tomorrow.tasks[0].task.text, 'tomorrow');
    // Tasks outside the week are dropped
    const totalInWeek = out.days.reduce((n, d) => n + d.tasks.length, 0);
    assert.equal(totalInWeek, 2);
  });

  test('sun week-start labels', () => {
    const out = weekBuckets(stateOf([makeMission()]), T0, 'sun');
    assert.deepEqual(out.days.map((d) => d.label), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });
});

// ─── missionProgress ────────────────────────────────────────────

describe('missionProgress', () => {
  test('computes percent + counts per mission', () => {
    const m = makeMission({ name: 'Work' });
    m.tasks = [
      task({ done: true, completedAt: new Date(T0 - HOUR).toISOString() }),
      task({ done: true, completedAt: new Date(T0 - HOUR).toISOString() }),
      task(),
      task(),
    ];
    const out = missionProgress(stateOf([m]), T0);
    assert.equal(out.length, 1);
    assert.equal(out[0].total, 4);
    assert.equal(out[0].done, 2);
    assert.equal(out[0].open, 2);
    assert.equal(out[0].percent, 50);
  });

  test('overdue counts open tasks past due', () => {
    const m = makeMission();
    m.tasks = [
      task({ dueAt: new Date(T0 - DAY).toISOString() }),
      task({ dueAt: new Date(T0 + DAY).toISOString() }),
    ];
    const out = missionProgress(stateOf([m]), T0);
    assert.equal(out[0].overdue, 1);
  });

  test('sorts by percent descending', () => {
    const m1 = makeMission({ name: 'A' });
    m1.tasks = [task({ done: true, completedAt: new Date(T0).toISOString() })]; // 100%
    const m2 = makeMission({ name: 'B' });
    m2.tasks = [task(), task()]; // 0%
    const m3 = makeMission({ name: 'C' });
    m3.tasks = [
      task({ done: true, completedAt: new Date(T0).toISOString() }),
      task(),
    ]; // 50%
    const out = missionProgress(stateOf([m1, m2, m3]), T0);
    assert.deepEqual(out.map((x) => x.name), ['A', 'C', 'B']);
  });
});

// ─── reviewSummary ──────────────────────────────────────────────

describe('reviewSummary', () => {
  test('empty state', () => {
    const s = reviewSummary(stateOf([makeMission()]), T0);
    assert.equal(s.totalDone, 0);
    assert.equal(s.totalOpen, 0);
    assert.equal(s.totalOverdue, 0);
    assert.equal(s.weekTotal, 0);
    assert.equal(s.bestDay, null);
  });

  test('counts open / done / overdue across missions', () => {
    const m1 = makeMission();
    m1.tasks = [
      task({ done: true, completedAt: new Date(T0).toISOString() }),
      task({ dueAt: new Date(T0 - DAY).toISOString() }),
      task(),
    ];
    const m2 = makeMission();
    m2.tasks = [task({ dueAt: new Date(T0 - 2 * DAY).toISOString() })];
    const s = reviewSummary(stateOf([m1, m2], { [todayKey(T0 - DAY)]: 5, [todayKey(T0)]: 2 }), T0);
    assert.equal(s.totalDone, 1);
    assert.equal(s.totalOpen, 3);
    assert.equal(s.totalOverdue, 2);
    assert.equal(s.weekTotal, 7);
    assert.equal(s.bestDay.count, 5);
  });
});
