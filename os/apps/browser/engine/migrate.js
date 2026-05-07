/**
 * browser/engine/migrate.js — v1 → v2 migration for Wormholes.
 *
 * v1 (yancotab_browser_v1):
 *   {
 *     currentUrl: string,
 *     bookmarks: [{ label, url }],
 *     history:   [url, ...],   // flat strings, no timestamps
 *     searchEngine?, activeFolderId?
 *   }
 *
 * v2 (see state.js): bookmarks gain x/y/clusterId/visitCount/
 * lastVisited; history entries gain {host, ts}.
 *
 * Strategy:
 *   • Each existing bookmark → v2 entry on a deterministic grid
 *     (4 cols × N rows).
 *   • visitCount = 0, lastVisited = null — they'll earn "anchor"
 *     status as the user navigates.
 *   • History strings → entries with host + ts: 0 (pre-migration
 *     visits don't count toward "recent" pulse).
 */

import { hostFromUrl, normalizeBookmark, makeInitialState } from './state.js';
import { gridPosition } from './layout.js';

export function isV1Shape(obj) {
  return !!(obj && typeof obj === 'object' && Array.isArray(obj.bookmarks)
    && obj.bookmarks.length > 0
    && obj.bookmarks[0]
    && typeof obj.bookmarks[0] === 'object'
    // v1 lacked x/y; v2 always has them. So a bookmark with no x/y is v1.
    && (typeof obj.bookmarks[0].x !== 'number' || typeof obj.bookmarks[0].y !== 'number'));
}

export function isV2Shape(obj) {
  return !!(obj && typeof obj === 'object' && obj.version === 2 && Array.isArray(obj.bookmarks));
}

export function migrateV1ToV2(v1) {
  if (!v1 || typeof v1 !== 'object') return null;

  const bookmarks = (Array.isArray(v1.bookmarks) ? v1.bookmarks : []).map((b, i) => {
    const url = typeof b?.url === 'string' ? b.url.trim() : '';
    if (!url) return null;
    const { x, y } = gridPosition(i);
    return normalizeBookmark({
      id: typeof b?.id === 'string' && b.id ? b.id : null,
      label: typeof b?.label === 'string' ? b.label : hostFromUrl(url),
      url,
      x, y,
      clusterId: null,
      visitCount: 0,
      lastVisited: null,
    });
  }).filter(Boolean);

  const history = (Array.isArray(v1.history) ? v1.history : []).map((entry) => {
    if (typeof entry === 'string') {
      const url = entry.trim();
      if (!url) return null;
      return { url, host: hostFromUrl(url), ts: 0 };
    }
    if (entry && typeof entry === 'object' && typeof entry.url === 'string') {
      return { url: entry.url, host: entry.host || hostFromUrl(entry.url), ts: Number.isFinite(entry.ts) ? entry.ts : 0 };
    }
    return null;
  }).filter(Boolean);

  return {
    bookmarks,
    clusters: [],
    history: history.slice(0, 50),
    currentUrl: typeof v1.currentUrl === 'string' ? v1.currentUrl : '',
    version: 2,
  };
}

/**
 * Migrate or seed: returns v2 state from whatever raw input we got.
 * Always returns a usable state (never null).
 */
export function ensureV2(raw) {
  if (isV2Shape(raw)) return raw;
  if (isV1Shape(raw)) return migrateV1ToV2(raw);
  // Empty or garbage — start fresh.
  return makeInitialState();
}
