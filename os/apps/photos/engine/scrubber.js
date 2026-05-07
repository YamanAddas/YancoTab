/**
 * photos/engine/scrubber.js — month density buckets for the timeline
 * scrubber at the bottom of the Lightbox stage.
 *
 * Given a list of decorated photos, returns an ORDERED array of month
 * buckets covering every month from the OLDEST photo to the newest
 * (gap-filled — months with no photos still get a 0-count entry so
 * the timeline doesn't visually lie about gaps).
 *
 * Each bucket: { key, year, month, label, shortLabel, count }
 *   key        — `YYYY-MM`
 *   year       — full year number (1980+)
 *   month      — 0..11
 *   label      — long form ("April 2026")
 *   shortLabel — terse form for the scrubber UI ("Apr 26" or "Apr"
 *                if same year as the most recent bucket)
 *   count      — photos created that month
 *
 * Pure module — no DOM, no kernel.
 */

import { toMonthKey, fromMonthKey } from './state.js';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * monthBuckets(photos) → ordered array of month buckets covering every
 * month from the oldest photo's month through the newest. Missing
 * months get `count: 0`. Returns [] if no photos have a valid `created`.
 */
export function monthBuckets(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return [];
  const valid = photos.filter((p) => p && Number.isFinite(p.created) && p.created > 0);
  if (valid.length === 0) return [];

  // Per-bucket counts.
  const counts = new Map();
  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const p of valid) {
    const key = toMonthKey(p.created);
    counts.set(key, (counts.get(key) || 0) + 1);
    if (p.created < minTs) minTs = p.created;
    if (p.created > maxTs) maxTs = p.created;
  }

  // Walk month-by-month from oldest to newest, gap-filling.
  const startKey = toMonthKey(minTs);
  const endKey = toMonthKey(maxTs);
  const start = fromMonthKey(startKey);
  const end = fromMonthKey(endKey);
  if (!start || !end) return [];

  const out = [];
  let { year, month } = start;
  const lastYear = end.year;
  // Pre-compute latest year for shortLabel decision.
  while (year < end.year || (year === end.year && month <= end.month)) {
    const monthStr = String(month + 1).padStart(2, '0');
    const key = `${year}-${monthStr}`;
    const sameYearAsLast = year === lastYear;
    out.push({
      key,
      year,
      month,
      label: `${MONTHS_LONG[month]} ${year}`,
      shortLabel: sameYearAsLast ? MONTHS_SHORT[month] : `${MONTHS_SHORT[month]} ${String(year).slice(-2)}`,
      count: counts.get(key) || 0,
    });
    // advance by one month
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return out;
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * cappedBuckets(buckets, maxStars) → bucket array with `stars` clamped
 * to `maxStars` for the visual hex-stack column. Defaults to 5.
 *
 * The mock shows up to 5 hexes stacked vertically per month. This
 * helper computes how many hexes to render for each bucket so the
 * scrubber row has a consistent visual ceiling.
 */
export function cappedBuckets(buckets, maxStars = 5) {
  if (!Array.isArray(buckets)) return [];
  return buckets.map((b) => ({
    ...b,
    stars: Math.min(maxStars, Math.max(0, Number.isFinite(b.count) ? b.count : 0)),
  }));
}
