/**
 * pdf/engine/streak.js — per-day reading streak heatmap.
 *
 * Records the last open event per day (no per-doc detail — the
 * streak is a global "did you read today?" signal). Storage shape:
 *
 *   { days: { 'YYYY-MM-DD': { openings: number, lastTs: number } } }
 *
 * `pushOpen(state, ts)` returns a new state with today's bucket
 * incremented. `densityStrip(state, days, now)` returns an ORDERED
 * list of `{ key, density }` covering the most recent N days, oldest
 * first. Density is 0..1, computed from each day's openings clamped
 * by an empirical max of 5/day (above that, returns 1).
 *
 * Pure module — no DOM, no kernel, no fs.
 */

const MAX_OPENINGS = 5; // anything beyond reads as full intensity

export function emptyState() {
  return { days: {} };
}

export function dayKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function pushOpen(state, ts = Date.now()) {
  const next = normalizeState(state);
  const key = dayKey(ts);
  const prev = next.days[key] || { openings: 0, lastTs: 0 };
  next.days[key] = {
    openings: prev.openings + 1,
    lastTs: ts,
  };
  return next;
}

/**
 * densityStrip(state, n, now) → array of n buckets ordered oldest →
 * newest. Each bucket is { key, density }.
 */
export function densityStrip(state, n = 14, now = Date.now()) {
  const s = normalizeState(state);
  const out = [];
  // Walk back from `now` (which lands on today's day-key).
  const today = new Date(now);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dayKey(d.getTime());
    const bucket = s.days[k];
    const openings = bucket?.openings || 0;
    const density = Math.min(1, openings / MAX_OPENINGS);
    out.push({ key: k, density });
  }
  return out;
}

/**
 * currentStreak(state, now) → consecutive-day count ending today.
 * Returns 0 if no opening today; counts back through earlier days
 * until it hits a zero-day.
 */
export function currentStreak(state, now = Date.now()) {
  const s = normalizeState(state);
  let count = 0;
  const cursor = new Date(now);
  // Loop with a hard cap so a malformed map can't trap us.
  for (let i = 0; i < 365; i++) {
    const k = dayKey(cursor.getTime());
    if ((s.days[k]?.openings || 0) > 0) {
      count++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return count;
}

/** Drop entries older than `days` to keep storage bounded. */
export function prune(state, days = 90, now = Date.now()) {
  const s = normalizeState(state);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffKey = dayKey(cutoff.getTime());
  const next = { days: {} };
  for (const [k, v] of Object.entries(s.days)) {
    if (k >= cutoffKey) next.days[k] = v;
  }
  return next;
}

function normalizeState(raw) {
  const out = { days: {} };
  if (!raw || typeof raw !== 'object' || !raw.days || typeof raw.days !== 'object') {
    return out;
  }
  for (const [k, v] of Object.entries(raw.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    if (!v || typeof v !== 'object') continue;
    const openings = Number.isFinite(v.openings) && v.openings >= 0 ? Math.floor(v.openings) : 0;
    const lastTs = Number.isFinite(v.lastTs) && v.lastTs >= 0 ? v.lastTs : 0;
    out.days[k] = { openings, lastTs };
  }
  return out;
}
