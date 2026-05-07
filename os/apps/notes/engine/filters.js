/**
 * notes/engine/filters.js — smart, tag, status, and search filters.
 *
 * A `filter` is a plain object describing the active filter state.
 * `applyFilter(notes, filter, now)` returns the matching subset.
 *
 * Notes are objects with at least `{path, title, body, meta}`
 * where `meta` is normalized (see notes/engine/meta.js).
 *
 * Pure module — no DOM, no kernel.
 */

import { todayKey, daysAgo } from './filterTime.js';

export const SMART_FILTERS = ['pinned', 'recent', 'today', 'done'];

/** Default empty filter — passes everything except archived. */
export function emptyFilter() {
  return { smart: null, tag: null, status: null, search: '' };
}

/**
 * applyFilter(notes, filter, now) → filtered array preserving input order.
 *
 * Filtering rules (all conjunctive):
 *   • smart='pinned'  → meta.pinned === true
 *   • smart='recent'  → updated within last 24h
 *   • smart='today'   → updated today (calendar day)
 *   • smart='done'    → meta.status === 'done'
 *   • tag=foo         → meta.tags includes 'foo'
 *   • status=anchor   → meta.status === 'anchor' (also matches when
 *                       the user picked 'anchor' from the Mood chip
 *                       row)
 *   • search='phrase' → case-insensitive match in title or body
 *   • archived notes  → excluded by default UNLESS status === 'archived'
 *                       was explicitly requested.
 */
export function applyFilter(notes, filter = {}, now = Date.now()) {
  if (!Array.isArray(notes)) return [];
  const f = { ...emptyFilter(), ...filter };
  const search = typeof f.search === 'string' ? f.search.trim().toLowerCase() : '';

  return notes.filter((n) => {
    const meta = n?.meta || {};
    // Archived hidden by default.
    if (meta.status === 'archived' && f.status !== 'archived') return false;

    if (f.smart === 'pinned' && !meta.pinned) return false;
    if (f.smart === 'recent') {
      const u = Number.isFinite(meta.updated) ? meta.updated : 0;
      if (now - u > 24 * 60 * 60_000) return false;
    }
    if (f.smart === 'today') {
      const u = Number.isFinite(meta.updated) ? meta.updated : 0;
      if (todayKey(u) !== todayKey(now)) return false;
    }
    if (f.smart === 'done' && meta.status !== 'done') return false;

    if (f.tag) {
      const tags = Array.isArray(meta.tags) ? meta.tags : [];
      if (!tags.includes(String(f.tag).toLowerCase())) return false;
    }
    if (f.status && meta.status !== f.status) return false;

    if (search) {
      const inTitle = typeof n?.title === 'string' && n.title.toLowerCase().includes(search);
      const inBody = typeof n?.body === 'string' && n.body.toLowerCase().includes(search);
      if (!inTitle && !inBody) return false;
    }
    return true;
  });
}

/**
 * tagCounts(notes) → array of {tag, count} sorted desc by count
 * then asc by name. Excludes archived notes.
 */
export function tagCounts(notes) {
  if (!Array.isArray(notes)) return [];
  const counts = new Map();
  for (const n of notes) {
    const meta = n?.meta || {};
    if (meta.status === 'archived') continue;
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    for (const t of tags) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return Array.from(counts, ([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * smartCounts(notes, now) → object with counts for each smart filter.
 * Used to render the sidebar pill badges.
 */
export function smartCounts(notes, now = Date.now()) {
  const out = { pinned: 0, recent: 0, today: 0, done: 0, total: 0 };
  if (!Array.isArray(notes)) return out;
  for (const n of notes) {
    const meta = n?.meta || {};
    if (meta.status === 'archived') continue;
    out.total++;
    if (meta.pinned) out.pinned++;
    const u = Number.isFinite(meta.updated) ? meta.updated : 0;
    if (now - u <= 24 * 60 * 60_000) out.recent++;
    if (todayKey(u) === todayKey(now)) out.today++;
    if (meta.status === 'done') out.done++;
  }
  return out;
}

export { daysAgo };
