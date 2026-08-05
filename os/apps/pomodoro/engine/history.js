/**
 * pomodoro/engine/history.js — per-day session log helpers, pure.
 *
 * Storage shape (yancotab_pomodoro_history_v1):
 *   { days: { 'YYYY-MM-DD': [SessionEntry, ...], ... } }
 *
 * SessionEntry:
 *   { kind, presetId, startedAt, endedAt, durationMs, completed }
 *
 * Trim policy:
 *   - keep last 30 calendar days
 *   - cap each day at 20 entries (drop oldest within the day)
 */

import { todayKey } from './state.js';

export const MAX_DAYS = 30;
export const MAX_PER_DAY = 20;

export function emptyHistory() {
  return { days: {} };
}

/**
 * Deterministic identity for a session, used to dedupe.
 *
 * Keyed on the phase START, not the end: three surfaces (app, widget,
 * Focus Mode) can each observe the same expiry, and two browser tabs can
 * race across a non-atomic localStorage read. `startedAt` comes from the
 * shared state blob so every observer agrees on it; `endedAt` is each
 * observer's own `Date.now()` and differs by milliseconds.
 *
 * Derivable from entries written before this existed, so old data
 * participates in dedupe with no migration.
 */
export function sessionId(entry) {
  if (!entry || !Number.isFinite(entry.startedAt) || !entry.kind) return null;
  return `${entry.kind}@${entry.startedAt}`;
}

export function appendSession(history, entry) {
  if (!entry || !Number.isFinite(entry.endedAt) || !entry.kind) return history;
  const key = todayKey(entry.endedAt);
  const days = { ...(history?.days || {}) };
  const list = Array.isArray(days[key]) ? days[key].slice() : [];

  // Returning the INPUT REFERENCE on a duplicate is load-bearing: callers
  // compare identity to decide whether to write, so a no-op append costs
  // no storage write and no sync-debounce reset.
  const id = sessionId(entry);
  if (id && list.some((e) => (e && e.id) === id || sessionId(e) === id)) return history;

  list.push({
    id: id || null,
    kind: String(entry.kind),
    presetId: entry.presetId || null,
    startedAt: Number.isFinite(entry.startedAt) ? entry.startedAt : null,
    endedAt: entry.endedAt,
    durationMs: Number.isFinite(entry.durationMs) ? entry.durationMs : 0,
    completed: !!entry.completed,
  });
  if (list.length > MAX_PER_DAY) list.splice(0, list.length - MAX_PER_DAY);
  days[key] = list;

  // Trim old days. Sort keys lexicographically (YYYY-MM-DD sorts naturally).
  const sortedKeys = Object.keys(days).sort();
  while (sortedKeys.length > MAX_DAYS) {
    const oldest = sortedKeys.shift();
    delete days[oldest];
  }
  return { days };
}

export function sessionsForDay(history, dayKey) {
  const list = history?.days?.[dayKey];
  return Array.isArray(list) ? list : [];
}

/** Sessions started today (so the "Today's cycle" pip row shows real data). */
export function todaysSessions(history, now = Date.now()) {
  return sessionsForDay(history, todayKey(now));
}

/** Count of completed focus sessions on a given day. */
export function focusCountForDay(history, dayKey) {
  const list = sessionsForDay(history, dayKey);
  let n = 0;
  for (const e of list) {
    if (e.kind === 'focus' && e.completed) n++;
  }
  return n;
}

/**
 * weekSummary(history, now, target=4) — returns 7 entries Mon..Sun
 * (or Sun..Sat — see weekStart) describing each day's progress.
 *
 * Each entry: { dayKey, label, count, target, ratio }
 * ratio is clamped 0..1 for the conic-gradient ring.
 */
export function weekSummary(history, now = Date.now(), target = 4, weekStart = 'mon') {
  const labels = weekStart === 'sun'
    ? ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); // 0=Sun..6=Sat
  const offsetFromStart = weekStart === 'sun' ? dow : (dow + 6) % 7;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - offsetFromStart);

  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const dayKey = todayKey(d.getTime());
    const count = focusCountForDay(history, dayKey);
    const isFuture = d.getTime() > today.getTime();
    const isToday = dayKey === todayKey(now);
    out.push({
      dayKey,
      label: labels[i],
      count,
      target,
      ratio: target > 0 ? Math.min(1, count / target) : 0,
      isFuture,
      isToday,
    });
  }
  return out;
}

/**
 * lifetimeStats(history) — totals across all kept days.
 * Returns { totalFocus, totalFocusMs, completedFocus, days, currentStreak, longestStreak }.
 */
export function lifetimeStats(history, now = Date.now()) {
  const days = history?.days || {};
  let totalFocus = 0;
  let totalFocusMs = 0;
  let completedFocus = 0;
  let dayCount = 0;
  for (const list of Object.values(days)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    let dayHadFocus = false;
    for (const e of list) {
      if (e.kind === 'focus') {
        totalFocus++;
        totalFocusMs += Number.isFinite(e.durationMs) ? e.durationMs : 0;
        if (e.completed) completedFocus++;
        dayHadFocus = true;
      }
    }
    if (dayHadFocus) dayCount++;
  }

  // Streaks: walk backwards day by day from today.
  // currentStreak counts consecutive days ending today; once we hit a
  // gap from today's run, it's locked. longestStreak is the max across
  // any run in the kept window.
  const todayDate = new Date(now);
  todayDate.setHours(0, 0, 0, 0);
  let currentStreak = 0;
  let longestStreak = 0;
  let runStreak = 0;
  let currentStreakLocked = false;
  for (let i = 0; i < 60; i++) {
    const d = new Date(todayDate);
    d.setDate(todayDate.getDate() - i);
    const k = todayKey(d.getTime());
    const has = (days[k] || []).some((e) => e.kind === 'focus' && e.completed);
    if (has) {
      runStreak++;
      if (runStreak > longestStreak) longestStreak = runStreak;
      if (!currentStreakLocked) currentStreak = runStreak;
    } else {
      // First gap from today's run locks currentStreak; later runs only feed longestStreak.
      currentStreakLocked = true;
      runStreak = 0;
    }
  }

  return { totalFocus, totalFocusMs, completedFocus, days: dayCount, currentStreak, longestStreak };
}
