/**
 * todo/engine/aggregate.js — pure cross-mission helpers used by
 * the Today / Week / Review tabs.
 *
 * Today tab: actionable tasks for today, across every mission.
 * Week tab: 7 days × tasks-due-that-day grouping.
 * Review tab: per-mission progress + roll-ups.
 */

import { todayKey } from './state.js';
import { classify } from './buckets.js';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Today's actionable list across all missions. Sorted by:
 *   1. open before done
 *   2. overdue first (most overdue on top)
 *   3. then by due time ascending
 *   4. then by mission name for stable ordering.
 *
 * Each entry: { task, mission }
 */
export function todaysActionable(state, now = Date.now()) {
  if (!state || !Array.isArray(state.missions)) return [];
  const out = [];
  for (const mission of state.missions) {
    for (const task of mission.tasks) {
      const b = classify(task, now);
      if (b === 'launching' || b === 'today') {
        out.push({ task, mission });
      }
    }
  }
  out.sort((a, b) => {
    // Done sinks below open
    if (a.task.done !== b.task.done) return a.task.done ? 1 : -1;
    const aMs = a.task.dueAt ? Date.parse(a.task.dueAt) : Infinity;
    const bMs = b.task.dueAt ? Date.parse(b.task.dueAt) : Infinity;
    if (aMs !== bMs) return aMs - bMs;
    return a.mission.name.localeCompare(b.mission.name);
  });
  return out;
}

/**
 * Intraday timeline data for today (open tasks only).
 * Returns sorted entries with `pct` = 0..100 horizontal position
 * (anchored to a 6:00 → 24:00 window — earliest hours roll into 6).
 */
export function todayTimeline(state, now = Date.now()) {
  const items = todaysActionable(state, now)
    .filter((e) => !e.task.done && e.task.dueAt);
  const todayStart = startOfDay(now);

  const dayStartHour = 6;
  const dayEndHour = 24;
  const range = (dayEndHour - dayStartHour) * HOUR;
  const windowStart = todayStart + dayStartHour * HOUR;

  const out = [];
  for (const { task, mission } of items) {
    const dueMs = Date.parse(task.dueAt);
    if (!Number.isFinite(dueMs)) continue;
    let pct;
    if (dueMs < windowStart) {
      // Earlier than 6am or yesterday → pin to left edge.
      pct = 2;
    } else if (dueMs >= windowStart + range) {
      pct = 98;
    } else {
      pct = Math.round(((dueMs - windowStart) / range) * 100);
    }
    out.push({ task, mission, pct, dueMs });
  }
  // "Now" marker pct.
  let nowPct = null;
  if (now >= windowStart && now <= windowStart + range) {
    nowPct = Math.round(((now - windowStart) / range) * 100);
  } else if (now < windowStart) nowPct = 0;
  else nowPct = 100;
  return { items: out, nowPct, dayStartHour, dayEndHour };
}

/**
 * Week view: 7 day buckets, each containing tasks due that day across
 * all missions.
 *
 *   Returns { days: [{ dayKey, label, isToday, isFuture, tasks: [{task, mission}] }] }
 */
export function weekBuckets(state, now = Date.now(), weekStart = 'mon') {
  const labels = weekStart === 'sun'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const offsetFromStart = weekStart === 'sun' ? dow : (dow + 6) % 7;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - offsetFromStart);

  const buckets = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dKey = todayKey(d.getTime());
    buckets.push({
      dayKey: dKey,
      label: labels[i],
      dayStart: d.getTime(),
      isToday: dKey === todayKey(now),
      isFuture: d.getTime() > today.getTime(),
      tasks: [],
    });
  }

  if (state && Array.isArray(state.missions)) {
    for (const mission of state.missions) {
      for (const task of mission.tasks) {
        if (!task.dueAt) continue;
        const dueMs = Date.parse(task.dueAt);
        if (!Number.isFinite(dueMs)) continue;
        const dKey = todayKey(dueMs);
        const bucket = buckets.find((b) => b.dayKey === dKey);
        if (bucket) bucket.tasks.push({ task, mission });
      }
    }
  }

  // Sort each bucket by due time ascending.
  for (const b of buckets) {
    b.tasks.sort((a, c) => Date.parse(a.task.dueAt) - Date.parse(c.task.dueAt));
  }

  return { days: buckets, weekStart };
}

/**
 * Per-mission progress for the Review tab.
 * Returns array sorted by percent descending (most-done first).
 */
export function missionProgress(state, now = Date.now()) {
  if (!state || !Array.isArray(state.missions)) return [];
  const out = [];
  for (const m of state.missions) {
    let total = 0; let done = 0; let overdue = 0;
    for (const t of m.tasks) {
      total++;
      if (t.done) done++;
      else if (t.dueAt) {
        const due = Date.parse(t.dueAt);
        if (Number.isFinite(due) && due < now) overdue++;
      }
    }
    out.push({
      id: m.id,
      name: m.name,
      color: m.color,
      total,
      done,
      open: total - done,
      overdue,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
    });
  }
  out.sort((a, b) => b.percent - a.percent);
  return out;
}

/**
 * Lifetime-ish roll-up for the Review header cards.
 * Looks at streakLog for the week + cross-mission totals.
 */
export function reviewSummary(state, now = Date.now(), weekStart = 'mon') {
  const log = state?.streakLog || {};
  let weekTotal = 0;
  let bestDay = null;
  let totalDone = 0;
  let totalOpen = 0;
  let totalOverdue = 0;

  if (Array.isArray(state?.missions)) {
    for (const m of state.missions) {
      for (const t of m.tasks) {
        if (t.done) {
          totalDone++;
        } else {
          totalOpen++;
          if (t.dueAt) {
            const due = Date.parse(t.dueAt);
            if (Number.isFinite(due) && due < now) totalOverdue++;
          }
        }
      }
    }
  }

  // Week totals
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const offsetFromStart = weekStart === 'sun' ? dow : (dow + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - offsetFromStart);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getTime() > today.getTime()) break;
    const k = todayKey(d.getTime());
    const c = log[k] || 0;
    weekTotal += c;
    if (!bestDay || c > bestDay.count) bestDay = { dayKey: k, count: c };
  }

  return {
    totalDone,
    totalOpen,
    totalOverdue,
    weekTotal,
    bestDay: bestDay && bestDay.count > 0 ? bestDay : null,
  };
}

// Used by tests; export for callers that want the constant.
export const TIMELINE_RANGE_MS = 18 * HOUR;
