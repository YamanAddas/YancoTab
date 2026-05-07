/**
 * photos/engine/filters.js — Library smart filters + sort + search
 * for the Lightbox view.
 *
 * Smart filters:
 *   all       — every photo
 *   favorites — favorite === true
 *   recent    — added in the last 14 days
 *
 * Search: case-insensitive substring match on `displayName` and `name`.
 * Month filter: `monthKey === filter.month`.
 *
 * Sort modes mirror the existing PhotosApp toolbar:
 *   date     — newest first  (created desc)
 *   date-old — oldest first  (created asc)
 *   name     — by displayName, asc, locale-aware
 *   size     — biggest first (size desc)
 *
 * Pure module — no DOM, no kernel, no fs.
 */

const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export const SMART_FILTERS = Object.freeze(['all', 'favorites', 'recent']);

export function emptyFilter() {
  return { smart: 'all', search: '', month: null };
}

/**
 * applyFilter(photos, filter, opts?) → filtered array.
 *
 * `photos` is an array of decorated records. `filter` is the shape
 * returned by emptyFilter(). `opts.now` defaults to Date.now() and
 * exists for tests.
 */
export function applyFilter(photos, filter, opts = {}) {
  if (!Array.isArray(photos)) return [];
  const f = normalizeFilter(filter);
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const recentCutoff = now - RECENT_WINDOW_MS;

  return photos.filter((p) => {
    if (!p) return false;
    if (f.smart === 'favorites' && !p.favorite) return false;
    if (f.smart === 'recent' && (!Number.isFinite(p.created) || p.created < recentCutoff)) return false;
    if (f.month && p.monthKey !== f.month) return false;
    if (f.search) {
      const hay = ((p.displayName || '') + ' ' + (p.name || '')).toLowerCase();
      if (!hay.includes(f.search)) return false;
    }
    return true;
  });
}

/**
 * applySort(photos, mode) → new array sorted in place. Unknown mode
 * defaults to 'date'.
 */
export function applySort(photos, mode = 'date') {
  if (!Array.isArray(photos)) return [];
  const out = [...photos];
  const cmp = SORT_COMPARATORS[mode] || SORT_COMPARATORS.date;
  out.sort(cmp);
  return out;
}

const SORT_COMPARATORS = {
  date:     (a, b) => (b.created || 0) - (a.created || 0),
  'date-old': (a, b) => (a.created || 0) - (b.created || 0),
  name:     (a, b) => (a.displayName || '').localeCompare(b.displayName || ''),
  size:     (a, b) => (b.size || 0) - (a.size || 0),
};

export function normalizeFilter(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  return {
    smart: SMART_FILTERS.includes(r.smart) ? r.smart : 'all',
    search: typeof r.search === 'string' ? r.search.trim().toLowerCase() : '',
    month: validMonthKey(r.month) ? r.month : null,
  };
}

function validMonthKey(s) {
  if (typeof s !== 'string') return false;
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return false;
  const mm = parseInt(m[2], 10);
  return mm >= 1 && mm <= 12;
}

export function isFilterActive(raw) {
  const f = normalizeFilter(raw);
  return f.smart !== 'all' || !!f.search || !!f.month;
}
