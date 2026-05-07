/**
 * todo/engine/streaks.js — pure stats over the streak log + missions.
 *
 * streakLog is a flat { 'YYYY-MM-DD': count } map persisted across
 * sessions. Bumped each time a task is marked done (by the reducer
 * the app shell will run). The view reads the log to render the
 * 7-day constellation in the side rail.
 */

import { todayKey } from './state.js';
import { classify } from './buckets.js';

const DAY_MS = 24 * 60 * 60_000;

/**
 * weekConstellation(streakLog, now, weekStart='mon')
 * Returns 7 days [{ dayKey, label, stars, isToday, isFuture }].
 *   stars = number to render (capped at 5 so we don't over-pack)
 */
export function weekConstellation(streakLog, now = Date.now(), weekStart = 'mon') {
  const labels = weekStart === 'sun'
    ? ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const offsetFromStart = weekStart === 'sun' ? dow : (dow + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - offsetFromStart);

  const log = (streakLog && typeof streakLog === 'object') ? streakLog : {};
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = todayKey(d.getTime());
    const count = Number.isFinite(log[key]) ? log[key] : 0;
    const isFuture = d.getTime() > today.getTime();
    const isToday = key === todayKey(now);
    out.push({
      dayKey: key,
      label: labels[i],
      count,
      stars: Math.max(0, Math.min(5, count)),
      isFuture,
      isToday,
    });
  }
  return out;
}

/** Walk back from today; consecutive days with count>0 = current streak. */
export function currentStreak(streakLog, now = Date.now()) {
  const log = (streakLog && typeof streakLog === 'object') ? streakLog : {};
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const key = todayKey(d.getTime());
    if ((log[key] || 0) > 0) streak++;
    else if (i === 0) {
      // No completion today yet — keep walking; the streak hasn't
      // ended until *yesterday* was also empty.
      continue;
    } else break;
  }
  // If today has zero completions but yesterday had some, the streak
  // shows yesterday's count. The above loop counts that correctly
  // because the `continue` on i===0 lets us keep going.
  return streak;
}

/**
 * missionStats(mission, now) → { total, done, doing, queued, overdue, percent }
 *
 *   doing   = launching + today (active work)
 *   queued  = queue + hangar
 *   overdue = open with dueAt < now
 *   percent = done / (done + open) — 0..100
 */
export function missionStats(mission, now = Date.now()) {
  const out = { total: 0, done: 0, doing: 0, queued: 0, overdue: 0, percent: 0 };
  if (!mission || !Array.isArray(mission.tasks)) return out;
  for (const t of mission.tasks) {
    out.total++;
    if (t.done) {
      out.done++;
      continue;
    }
    const b = classify(t, now);
    if (b === 'launching' || b === 'today') out.doing++;
    else out.queued++;
    if (t.dueAt) {
      const dueMs = Date.parse(t.dueAt);
      if (Number.isFinite(dueMs) && dueMs < now) out.overdue++;
    }
  }
  out.percent = out.total === 0 ? 0 : Math.round((out.done / out.total) * 100);
  return out;
}

/**
 * weekSummary(state, now) → { completed, onTimePercent, streak, bestDay }
 * Used by the right-side review rail.
 */
export function weekSummary(state, now = Date.now(), weekStart = 'mon') {
  const days = weekConstellation(state?.streakLog, now, weekStart);
  let completed = 0;
  let bestDay = null;
  for (const d of days) {
    if (d.isFuture) continue;
    completed += d.count;
    if (!bestDay || d.count > bestDay.count) bestDay = d;
  }
  // On-time %: of all done tasks across all missions whose dueAt was
  // on or after their completedAt. Tasks without dueAt are counted as
  // on-time (no deadline missed).
  let totalDone = 0;
  let onTime = 0;
  if (state && Array.isArray(state.missions)) {
    for (const m of state.missions) {
      for (const t of m.tasks) {
        if (!t.done) continue;
        totalDone++;
        if (!t.dueAt || !t.completedAt) { onTime++; continue; }
        const due = Date.parse(t.dueAt);
        const comp = Date.parse(t.completedAt);
        if (!Number.isFinite(due) || !Number.isFinite(comp) || comp <= due) onTime++;
      }
    }
  }
  const onTimePercent = totalDone === 0 ? 100 : Math.round((onTime / totalDone) * 100);
  return {
    completed,
    onTimePercent,
    streak: currentStreak(state?.streakLog, now),
    bestDay: bestDay && bestDay.count > 0 ? bestDay : null,
  };
}

/**
 * bumpStreak(streakLog, now) → new log with today's count incremented.
 * Pure — returns a new object.
 */
export function bumpStreak(streakLog, now = Date.now()) {
  const key = todayKey(now);
  const cur = (streakLog && Number.isFinite(streakLog[key])) ? streakLog[key] : 0;
  return { ...(streakLog || {}), [key]: cur + 1 };
}
