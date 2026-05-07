/**
 * Tests for the Pomodoro history helpers + persistence normalizers.
 *
 * Run with: node --test tests/pomodoro-history.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyHistory, appendSession, sessionsForDay, todaysSessions,
  focusCountForDay, weekSummary, lifetimeStats,
  MAX_DAYS, MAX_PER_DAY,
} from '../os/apps/pomodoro/engine/history.js';
import { todayKey } from '../os/apps/pomodoro/engine/state.js';
import {
  normalizeSettings, normalizeHistory, defaultSettings, STORAGE_KEYS,
} from '../os/apps/pomodoro/persistence.js';

const M = 60_000;
const DAY = 24 * 60 * M;
const T0 = Date.UTC(2026, 4, 7, 13, 42, 0); // 2026-05-07 13:42 UTC, Thursday

function focusEntry(endedAt, completed = true, durationMs = 25 * M) {
  return {
    kind: 'focus', presetId: 'classic',
    startedAt: endedAt - durationMs, endedAt, durationMs, completed,
  };
}

// ─── appendSession ────────────────────────────────────────────────

describe('appendSession', () => {
  test('empty history → 1 entry on today', () => {
    const h = appendSession(emptyHistory(), focusEntry(T0));
    assert.equal(sessionsForDay(h, todayKey(T0)).length, 1);
  });

  test('multiple sessions same day accumulate', () => {
    let h = emptyHistory();
    h = appendSession(h, focusEntry(T0));
    h = appendSession(h, focusEntry(T0 + 30 * M));
    h = appendSession(h, focusEntry(T0 + 60 * M));
    assert.equal(sessionsForDay(h, todayKey(T0)).length, 3);
  });

  test('rejects entry without endedAt', () => {
    const h = appendSession(emptyHistory(), { kind: 'focus' });
    assert.equal(Object.keys(h.days).length, 0);
  });

  test('per-day cap drops oldest', () => {
    let h = emptyHistory();
    for (let i = 0; i < MAX_PER_DAY + 5; i++) {
      h = appendSession(h, focusEntry(T0 + i * M));
    }
    const list = sessionsForDay(h, todayKey(T0));
    assert.equal(list.length, MAX_PER_DAY);
    // Oldest 5 dropped — first remaining is i=5.
    assert.equal(list[0].endedAt, T0 + 5 * M);
  });

  test('sanitizes stored entry shape', () => {
    const h = appendSession(emptyHistory(), {
      kind: 'focus', presetId: 'classic', startedAt: 'oops',
      endedAt: T0, durationMs: 'nope', completed: 1,
    });
    const e = sessionsForDay(h, todayKey(T0))[0];
    assert.equal(e.startedAt, null);
    assert.equal(e.durationMs, 0);
    assert.equal(e.completed, true);
  });

  test('30-day window: oldest day dropped on overflow', () => {
    let h = emptyHistory();
    // Add 35 days, one entry each.
    for (let i = 0; i < MAX_DAYS + 5; i++) {
      const ts = T0 - (MAX_DAYS + 5 - 1 - i) * DAY;
      h = appendSession(h, focusEntry(ts));
    }
    const keys = Object.keys(h.days).sort();
    assert.equal(keys.length, MAX_DAYS);
    // The oldest 5 days should have been dropped.
    const oldestKept = keys[0];
    const droppedOldestTs = T0 - (MAX_DAYS + 5 - 1) * DAY;
    assert.notEqual(oldestKept, todayKey(droppedOldestTs));
  });
});

// ─── focusCountForDay ─────────────────────────────────────────────

describe('focusCountForDay', () => {
  test('counts only completed focus entries', () => {
    let h = emptyHistory();
    h = appendSession(h, focusEntry(T0, true));
    h = appendSession(h, focusEntry(T0 + M, true));
    h = appendSession(h, focusEntry(T0 + 2 * M, false)); // partial
    h = appendSession(h, { kind: 'break', endedAt: T0 + 3 * M, durationMs: 5 * M, completed: true });
    assert.equal(focusCountForDay(h, todayKey(T0)), 2);
  });

  test('missing day returns 0', () => {
    assert.equal(focusCountForDay(emptyHistory(), '2026-01-01'), 0);
  });
});

// ─── todaysSessions ───────────────────────────────────────────────

describe('todaysSessions', () => {
  test('returns only today’s entries', () => {
    let h = emptyHistory();
    h = appendSession(h, focusEntry(T0));
    h = appendSession(h, focusEntry(T0 - DAY)); // yesterday
    const list = todaysSessions(h, T0);
    assert.equal(list.length, 1);
    assert.equal(list[0].endedAt, T0);
  });
});

// ─── weekSummary ──────────────────────────────────────────────────

describe('weekSummary', () => {
  test('returns 7 entries with mon week-start', () => {
    let h = emptyHistory();
    // T0 = Thursday 2026-05-07. Add 4 focus on Mon, 3 on Tue, 4 on Wed, 3 today.
    const monday = T0 - 3 * DAY;
    for (let i = 0; i < 4; i++) h = appendSession(h, focusEntry(monday + i * M));
    for (let i = 0; i < 3; i++) h = appendSession(h, focusEntry(monday + DAY + i * M));
    for (let i = 0; i < 4; i++) h = appendSession(h, focusEntry(monday + 2 * DAY + i * M));
    for (let i = 0; i < 3; i++) h = appendSession(h, focusEntry(T0 + i * M));

    const w = weekSummary(h, T0, 4, 'mon');
    assert.equal(w.length, 7);
    assert.deepEqual(w.map((d) => d.label), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    assert.equal(w[0].count, 4);
    assert.equal(w[1].count, 3);
    assert.equal(w[2].count, 4);
    assert.equal(w[3].count, 3); // today
    assert.equal(w[3].isToday, true);
    assert.equal(w[4].count, 0);
    assert.equal(w[4].isFuture, true);
  });

  test('ratio clamps to 1', () => {
    let h = emptyHistory();
    for (let i = 0; i < 8; i++) h = appendSession(h, focusEntry(T0 + i * M));
    const w = weekSummary(h, T0, 4, 'mon');
    const today = w.find((d) => d.isToday);
    assert.equal(today.ratio, 1);
  });

  test('sun week-start labels', () => {
    const w = weekSummary(emptyHistory(), T0, 4, 'sun');
    assert.deepEqual(w.map((d) => d.label), ['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });

  test('isFuture flag honors today', () => {
    const w = weekSummary(emptyHistory(), T0, 4, 'mon');
    const future = w.filter((d) => d.isFuture).length;
    assert.equal(future, 3); // Fri, Sat, Sun (T0 = Thu)
  });
});

// ─── lifetimeStats ────────────────────────────────────────────────

describe('lifetimeStats', () => {
  test('empty history → zeroes', () => {
    const s = lifetimeStats(emptyHistory(), T0);
    assert.deepEqual(s, { totalFocus: 0, totalFocusMs: 0, completedFocus: 0,
      days: 0, currentStreak: 0, longestStreak: 0 });
  });

  test('counts totals correctly', () => {
    let h = emptyHistory();
    h = appendSession(h, focusEntry(T0, true));
    h = appendSession(h, focusEntry(T0 + M, true));
    h = appendSession(h, focusEntry(T0 + 2 * M, false));
    h = appendSession(h, focusEntry(T0 - DAY, true));
    const s = lifetimeStats(h, T0);
    assert.equal(s.totalFocus, 4);
    assert.equal(s.completedFocus, 3);
    assert.equal(s.days, 2);
    assert.equal(s.totalFocusMs, 4 * 25 * M);
  });

  test('current streak = consecutive days ending today', () => {
    let h = emptyHistory();
    // Today + yesterday + day-before all have completed focus → streak 3.
    h = appendSession(h, focusEntry(T0, true));
    h = appendSession(h, focusEntry(T0 - DAY, true));
    h = appendSession(h, focusEntry(T0 - 2 * DAY, true));
    // 4 days ago had a focus too — but day-3 ago is empty, so streak stays 3.
    h = appendSession(h, focusEntry(T0 - 4 * DAY, true));
    const s = lifetimeStats(h, T0);
    assert.equal(s.currentStreak, 3);
    assert.equal(s.longestStreak, 3);
  });

  test('streak ignores partial focus', () => {
    let h = emptyHistory();
    h = appendSession(h, focusEntry(T0, false));
    h = appendSession(h, focusEntry(T0 - DAY, true));
    const s = lifetimeStats(h, T0);
    assert.equal(s.currentStreak, 0); // today not completed → broken
    assert.equal(s.longestStreak, 1);
  });

  test('longestStreak reflects historical max', () => {
    let h = emptyHistory();
    // Old run of 5: days 10-14 ago all completed.
    for (let d = 10; d <= 14; d++) h = appendSession(h, focusEntry(T0 - d * DAY, true));
    // Recent run of 2: today + yesterday.
    h = appendSession(h, focusEntry(T0, true));
    h = appendSession(h, focusEntry(T0 - DAY, true));
    const s = lifetimeStats(h, T0);
    assert.equal(s.currentStreak, 2);
    assert.equal(s.longestStreak, 5);
  });
});

// ─── persistence normalizers ──────────────────────────────────────

describe('persistence normalizers', () => {
  test('normalizeSettings fills missing fields', () => {
    const s = normalizeSettings({});
    assert.deepEqual(s, defaultSettings());
  });

  test('normalizeSettings preserves valid ambient overrides', () => {
    const s = normalizeSettings({ ambient: { drone: true, autoMute: false } });
    assert.equal(s.ambient.drone, true);
    assert.equal(s.ambient.autoMute, false);
    // Untouched defaults retained
    assert.equal(s.ambient.nightShell, true);
  });

  test('normalizeSettings rejects invalid customPreset', () => {
    const s = normalizeSettings({ customPreset: { focusMs: 0, breakMs: 0, longBreakMs: 0, sessions: 0 } });
    assert.equal(s.customPreset, null);
  });

  test('normalizeSettings keeps weekStart "sun"', () => {
    assert.equal(normalizeSettings({ weekStart: 'sun' }).weekStart, 'sun');
    assert.equal(normalizeSettings({ weekStart: 'lol' }).weekStart, 'mon');
  });

  test('normalizeHistory drops malformed days', () => {
    const h = normalizeHistory({ days: { '2026-05-07': [{ endedAt: 1, kind: 'focus' }, 'junk', null] } });
    assert.equal(h.days['2026-05-07'].length, 1);
  });

  test('normalizeHistory fills missing on garbage', () => {
    assert.deepEqual(normalizeHistory(null), emptyHistory());
    assert.deepEqual(normalizeHistory({ days: 'oops' }), emptyHistory());
  });

  test('STORAGE_KEYS exposes the three keys', () => {
    assert.equal(STORAGE_KEYS.state, 'yancotab_pomodoro_v1');
    assert.equal(STORAGE_KEYS.history, 'yancotab_pomodoro_history_v1');
    assert.equal(STORAGE_KEYS.settings, 'yancotab_pomodoro_settings_v1');
  });
});
