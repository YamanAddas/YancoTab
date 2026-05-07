/**
 * browser/engine/visits.js — visit-bumping + portal classification.
 *
 * Pure helpers. Portal classification:
 *   • anchor   — visitCount ≥ 3 in the last 7 days (hot bookmark)
 *   • recent   — lastVisited within 5 minutes (pulsing aura)
 *   • floating — no clusterId (uncategorized, dim)
 *   • standard — bookmarked, in a cluster, no anchor/recent flag
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const ANCHOR_THRESHOLD = 3;          // visits within window
export const ANCHOR_WINDOW_MS = 7 * DAY;
export const RECENT_WINDOW_MS = 5 * MIN;

/**
 * classifyPortal(bookmark, now) → 'anchor' | 'recent' | 'floating' | 'standard'
 *
 * Order matters: anchor takes precedence over recent (a frequently
 * visited site is "anchor", not just "recent"); floating only fires
 * when the bookmark has no cluster.
 */
export function classifyPortal(bookmark, now = Date.now()) {
  if (!bookmark) return 'standard';
  const lastVisited = Number.isFinite(bookmark.lastVisited) ? bookmark.lastVisited : 0;
  const visitCount = Number.isFinite(bookmark.visitCount) ? bookmark.visitCount : 0;
  const recentlyEnough = lastVisited > 0 && (now - lastVisited) <= ANCHOR_WINDOW_MS;
  if (recentlyEnough && visitCount >= ANCHOR_THRESHOLD) return 'anchor';
  if (lastVisited > 0 && (now - lastVisited) <= RECENT_WINDOW_MS) return 'recent';
  if (!bookmark.clusterId) return 'floating';
  return 'standard';
}

/**
 * bumpVisit(bookmark, now) → new bookmark with visitCount++ and
 * lastVisited updated. Pure — never mutates input.
 *
 * Old visits outside ANCHOR_WINDOW_MS still count toward visitCount
 * (we track lifetime); anchor classification uses lastVisited as the
 * "still active" gate.
 */
export function bumpVisit(bookmark, now = Date.now()) {
  if (!bookmark) return null;
  return {
    ...bookmark,
    visitCount: (bookmark.visitCount || 0) + 1,
    lastVisited: now,
  };
}

/**
 * recordVisit(state, url, now) → new state with the matching bookmark
 * bumped (if any) AND a history entry prepended. Pure.
 *
 * History: latest first. Capped at 50 entries — that's enough for the
 * Recent trail (5 visible) plus debug headroom.
 */
export const HISTORY_LIMIT = 50;

export function recordVisit(state, url, now = Date.now()) {
  if (!state || typeof url !== 'string' || !url) return state;
  const next = {
    ...state,
    bookmarks: state.bookmarks.map((b) => (b.url === url ? bumpVisit(b, now) : b)),
    history: [
      { url, host: hostOf(url), ts: now },
      ...state.history.filter((v) => v.url !== url || v.ts < now - MIN),
    ].slice(0, HISTORY_LIMIT),
  };
  return next;
}

/**
 * recentVisits(state, n=5, now) → last N entries from history.
 *
 * History is already latest-first, so this is just a slice. The
 * `now` arg is unused for the basic case but kept symmetric with
 * other helpers in case we want to filter "older than 24h" later.
 */
export function recentVisits(state, n = 5) {
  if (!state || !Array.isArray(state.history)) return [];
  return state.history.slice(0, Math.max(0, n));
}

/**
 * formatRelative(ts, now) → "4m ago", "2h ago", "yesterday".
 */
export function formatRelative(ts, now = Date.now()) {
  if (!Number.isFinite(ts) || ts <= 0) return '—';
  const diff = now - ts;
  if (diff < 0) return 'just now';
  if (diff < 60_000) return 'just now';
  if (diff < HOUR) return `${Math.round(diff / MIN)}m ago`;
  if (diff < 24 * HOUR) return `${Math.round(diff / HOUR)}h ago`;
  if (diff < 48 * HOUR) return 'yesterday';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function hostOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}
