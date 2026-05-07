/**
 * todo/engine/buckets.js — pure bucket classifier for tasks.
 *
 * Every open task lives in exactly one of:
 *   • launching — overdue, or priority='high', or due ≤ 3h away
 *   • today     — due today (any time) and not already in launching
 *   • queue     — due in the future (later than today)
 *   • hangar    — no due date
 *
 * Done tasks completed *today* surface at the bottom of `launching`
 * (with their completedAt timestamp). Older done tasks land in
 * `archive` and are hidden from the launchpad until "Clear done".
 */

const HOUR = 60 * 60_000;
const LAUNCH_WINDOW = 3 * HOUR;

export const BUCKETS = ['hangar', 'queue', 'today', 'launching'];

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isToday(ms, nowMs) {
  return startOfDay(ms) === startOfDay(nowMs);
}

/**
 * classify(task, now) → bucket name.
 * @param {Object} task — Task from todo/engine/state.js
 * @param {number} now — ms epoch
 */
export function classify(task, now = Date.now()) {
  if (!task || typeof task !== 'object') return 'hangar';
  if (task.done) {
    if (task.completedAt) {
      const compMs = Date.parse(task.completedAt);
      if (Number.isFinite(compMs) && isToday(compMs, now)) return 'launching';
    }
    return 'archive';
  }
  if (!task.dueAt) {
    return task.priority === 'high' ? 'launching' : 'hangar';
  }
  const dueMs = Date.parse(task.dueAt);
  if (!Number.isFinite(dueMs)) return 'hangar';

  // Overdue or imminent → launching, regardless of priority.
  if (dueMs <= now + LAUNCH_WINDOW) return 'launching';
  if (task.priority === 'high') return 'launching';

  if (isToday(dueMs, now)) return 'today';
  return 'queue';
}

/**
 * splitMission(mission, now) → { hangar, queue, today, launching, archive }
 * Each bucket is sorted: launching by overdue first then due asc;
 * today/queue by due asc; hangar by position asc; archive by
 * completedAt desc.
 */
export function splitMission(mission, now = Date.now()) {
  const out = { hangar: [], queue: [], today: [], launching: [], archive: [] };
  if (!mission || !Array.isArray(mission.tasks)) return out;
  for (const t of mission.tasks) {
    out[classify(t, now)].push(t);
  }
  // Sort each bucket.
  out.hangar.sort((a, b) => a.position - b.position);
  out.queue.sort(byDueAsc);
  out.today.sort(byDueAsc);
  out.launching.sort((a, b) => {
    // Done tasks (with completedAt) sink to bottom; ties by due date.
    if (a.done !== b.done) return a.done ? 1 : -1;
    return byDueAsc(a, b);
  });
  out.archive.sort((a, b) => Date.parse(b.completedAt || 0) - Date.parse(a.completedAt || 0));
  return out;
}

function byDueAsc(a, b) {
  const aMs = a.dueAt ? Date.parse(a.dueAt) : Infinity;
  const bMs = b.dueAt ? Date.parse(b.dueAt) : Infinity;
  return aMs - bMs;
}

/** Format a friendly relative due label (used by the rocket card). */
export function formatDue(task, now = Date.now()) {
  if (!task) return '';
  if (task.done) {
    const c = Date.parse(task.completedAt || '');
    if (!Number.isFinite(c)) return '✓';
    const d = new Date(c);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ✓`;
  }
  if (!task.dueAt) return 'no due';
  const dueMs = Date.parse(task.dueAt);
  if (!Number.isFinite(dueMs)) return 'no due';
  const diff = dueMs - now;
  if (diff < 0) {
    const overMs = -diff;
    if (overMs < 24 * HOUR) {
      const hrs = Math.max(1, Math.ceil(overMs / HOUR));
      return `${hrs}h overdue`;
    }
    const days = Math.ceil(overMs / (24 * HOUR));
    return `${days}d overdue`;
  }
  if (diff < HOUR) {
    const mins = Math.max(1, Math.round(diff / 60_000));
    return `in ${mins}m`;
  }
  if (diff < 6 * HOUR) {
    const hrs = Math.round(diff / HOUR);
    return `in ${hrs}h`;
  }
  if (isToday(dueMs, now)) return 'today';
  // Tomorrow / within 7 days → weekday name
  const todayDay = startOfDay(now);
  const dueDay = startOfDay(dueMs);
  const dayDiff = Math.round((dueDay - todayDay) / (24 * HOUR));
  if (dayDiff === 1) return 'tomorrow';
  if (dayDiff > 1 && dayDiff < 7) {
    return new Date(dueMs).toLocaleDateString(undefined, { weekday: 'short' });
  }
  return new Date(dueMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Severity for due-badge styling: 'over' | 'soon' | 'normal'. */
export function dueSeverity(task, now = Date.now()) {
  if (!task || task.done || !task.dueAt) return 'normal';
  const dueMs = Date.parse(task.dueAt);
  if (!Number.isFinite(dueMs)) return 'normal';
  if (dueMs <= now) return 'over';
  if (dueMs <= now + LAUNCH_WINDOW) return 'soon';
  if (isToday(dueMs, now)) return 'soon';
  return 'normal';
}
