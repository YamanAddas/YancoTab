/**
 * files/engine/smartRooms.js — derived "smart room" filters.
 *
 *   Recent     — files modified in the last 14 days
 *   Pinned     — items in the user's pinned set
 *   Heavy      — files in the top 10% by size, with a floor of 1 MB
 *                so a tiny vault doesn't list 5 KB notes as "heavy"
 *   Forgotten  — files NOT modified in the last 90 days, that are
 *                also NOT pinned (we keep pinned files visible)
 *
 * Operates on decorated items from engine/state.js. Folders are
 * dropped from Recent/Heavy/Forgotten (those are file-only views)
 * but kept for Pinned (so pinning a folder works).
 *
 * Pure module — no DOM, no kernel.
 */

const DAY = 24 * 60 * 60_000;
const RECENT_WINDOW_MS = 14 * DAY;
const FORGOTTEN_WINDOW_MS = 90 * DAY;
const HEAVY_FLOOR_BYTES = 1024 * 1024;

export const SMART_ROOMS = Object.freeze(['recent', 'pinned', 'heavy', 'forgotten']);

export function emptyFilter() {
  return { smart: null };
}

/**
 * applySmart(items, smartId, opts?) → filtered subset.
 * Unknown smartId → returns items unchanged.
 */
export function applySmart(items, smartId, opts = {}) {
  if (!Array.isArray(items)) return [];
  if (!smartId) return items;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  switch (smartId) {
    case 'recent':    return filterRecent(items, now);
    case 'pinned':    return items.filter((it) => it && it.pinned);
    case 'heavy':     return filterHeavy(items);
    case 'forgotten': return filterForgotten(items, now);
    default:          return items;
  }
}

function filterRecent(items, now) {
  const cutoff = now - RECENT_WINDOW_MS;
  return items.filter((it) => it && !it.isDir
    && Number.isFinite(it.modified) && it.modified >= cutoff);
}

function filterForgotten(items, now) {
  const cutoff = now - FORGOTTEN_WINDOW_MS;
  return items.filter((it) => it && !it.isDir && !it.pinned
    && Number.isFinite(it.modified) && it.modified > 0 && it.modified < cutoff);
}

function filterHeavy(items) {
  const files = items.filter((it) => it && !it.isDir
    && Number.isFinite(it.size) && it.size > 0);
  if (files.length === 0) return [];
  const sorted = [...files].sort((a, b) => b.size - a.size);
  const topCount = Math.max(1, Math.ceil(sorted.length * 0.10));
  // The 10th-percentile cutoff; or HEAVY_FLOOR_BYTES, whichever is larger.
  const cutoff = Math.max(HEAVY_FLOOR_BYTES, sorted[topCount - 1].size);
  return files.filter((it) => it.size >= cutoff);
}

/**
 * smartCounts(items, opts?) → { recent, pinned, heavy, forgotten }
 */
export function smartCounts(items, opts = {}) {
  return {
    recent:    applySmart(items, 'recent', opts).length,
    pinned:    applySmart(items, 'pinned', opts).length,
    heavy:     applySmart(items, 'heavy', opts).length,
    forgotten: applySmart(items, 'forgotten', opts).length,
  };
}
