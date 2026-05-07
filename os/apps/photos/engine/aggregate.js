/**
 * photos/engine/aggregate.js — counts for the side rail.
 *
 * Library counts: { all, favorites, recent }.
 * `recent` uses the same 14-day window as the smart filter.
 *
 * Pure module — no DOM, no kernel.
 */

const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function libraryCounts(photos, opts = {}) {
  if (!Array.isArray(photos)) return { all: 0, favorites: 0, recent: 0 };
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const recentCutoff = now - RECENT_WINDOW_MS;
  let favorites = 0;
  let recent = 0;
  for (const p of photos) {
    if (!p) continue;
    if (p.favorite) favorites++;
    if (Number.isFinite(p.created) && p.created >= recentCutoff) recent++;
  }
  return { all: photos.length, favorites, recent };
}

/**
 * monthCounts(photos) → Map<monthKey, count>. Lighter-weight than
 * scrubber.monthBuckets when callers only want the lookup.
 */
export function monthCounts(photos) {
  const out = new Map();
  if (!Array.isArray(photos)) return out;
  for (const p of photos) {
    if (!p || !p.monthKey) continue;
    out.set(p.monthKey, (out.get(p.monthKey) || 0) + 1);
  }
  return out;
}

/**
 * totalSize(photos) → number of bytes across all photos. Skips entries
 * with non-finite size.
 */
export function totalSize(photos) {
  if (!Array.isArray(photos)) return 0;
  let n = 0;
  for (const p of photos) {
    if (p && Number.isFinite(p.size) && p.size > 0) n += p.size;
  }
  return n;
}
