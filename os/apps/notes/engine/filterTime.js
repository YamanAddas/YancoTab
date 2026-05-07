/**
 * notes/engine/filterTime.js — pure date helpers used by filters.
 * Split out so tests can mock cleanly without touching the filter
 * surface.
 */

export function todayKey(t) {
  if (!Number.isFinite(t) || t <= 0) return '';
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysAgo(t, now = Date.now()) {
  if (!Number.isFinite(t) || t <= 0) return Infinity;
  return Math.floor((now - t) / (24 * 60 * 60_000));
}
