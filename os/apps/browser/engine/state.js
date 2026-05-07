/**
 * browser/engine/state.js — Wormholes data shape + factory.
 *
 * v2 storage shape (yancotab_browser_v2):
 *   {
 *     bookmarks: [Bookmark],
 *     clusters:  [Cluster],
 *     history:   [VisitEntry],
 *     currentUrl: string,
 *     version: 2,
 *   }
 *
 * Bookmark:
 *   { id, label, url, x, y, clusterId|null, visitCount, lastVisited|null }
 *   x, y are in 0..100 (percent of star-map area) so the layout
 *   scales with the viewport.
 *
 * Cluster:
 *   { id, name, color, position }
 *
 * VisitEntry:
 *   { url, host, ts } — ts is ms epoch
 */

export const CLUSTER_COLORS = ['accent', 'cool', 'warm', 'violet', 'rose', 'green'];

export function newId(prefix = 'b') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function hostFromUrl(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export function makeBookmark({ label = '', url = '', x = 50, y = 50, clusterId = null } = {}) {
  return {
    id: newId('bm'),
    label: String(label).trim().slice(0, 40) || hostFromUrl(url) || 'Saved',
    url: String(url).trim(),
    x: clamp01(x),
    y: clamp01(y),
    clusterId: typeof clusterId === 'string' ? clusterId : null,
    visitCount: 0,
    lastVisited: null,
  };
}

export function makeCluster({ name = 'Cluster', color = 'accent', position = 1000 } = {}) {
  return {
    id: newId('cl'),
    name: String(name).trim().slice(0, 30) || 'Cluster',
    color: CLUSTER_COLORS.includes(color) ? color : 'accent',
    position: Number.isFinite(position) ? position : 1000,
  };
}

export function makeInitialState() {
  return {
    bookmarks: [],
    clusters: [],
    history: [],
    currentUrl: '',
    version: 2,
  };
}

export function clamp01(n) {
  if (!Number.isFinite(n)) return 50;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

export function normalizeBookmark(b) {
  if (!b || typeof b !== 'object') return null;
  const url = typeof b.url === 'string' ? b.url.trim() : '';
  if (!url) return null;
  return {
    id: typeof b.id === 'string' && b.id ? b.id : newId('bm'),
    label: (typeof b.label === 'string' && b.label.trim() ? b.label.trim() : hostFromUrl(url) || 'Saved').slice(0, 40),
    url: url.slice(0, 2000),
    x: clamp01(b.x),
    y: clamp01(b.y),
    clusterId: typeof b.clusterId === 'string' && b.clusterId ? b.clusterId : null,
    visitCount: Number.isFinite(b.visitCount) && b.visitCount >= 0 ? Math.floor(b.visitCount) : 0,
    lastVisited: Number.isFinite(b.lastVisited) ? b.lastVisited : null,
  };
}

export function normalizeCluster(c, fallbackPos = 1000) {
  if (!c || typeof c !== 'object') return null;
  const name = (typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'Cluster').slice(0, 30);
  return {
    id: typeof c.id === 'string' && c.id ? c.id : newId('cl'),
    name,
    color: CLUSTER_COLORS.includes(c.color) ? c.color : 'accent',
    position: Number.isFinite(c.position) ? c.position : fallbackPos,
  };
}

export function normalizeVisit(v) {
  if (!v || typeof v !== 'object') return null;
  const url = typeof v.url === 'string' ? v.url.trim() : '';
  if (!url) return null;
  return {
    url: url.slice(0, 2000),
    host: typeof v.host === 'string' && v.host ? v.host : hostFromUrl(url),
    ts: Number.isFinite(v.ts) && v.ts > 0 ? v.ts : 0,
  };
}

export function normalizeState(s) {
  if (!s || typeof s !== 'object') return makeInitialState();
  const bookmarks = Array.isArray(s.bookmarks)
    ? s.bookmarks.map(normalizeBookmark).filter(Boolean)
    : [];
  const clusters = Array.isArray(s.clusters)
    ? s.clusters.map((c, i) => normalizeCluster(c, (i + 1) * 1000)).filter(Boolean)
    : [];
  // Drop bookmark cluster references that point to nonexistent clusters.
  const validClusterIds = new Set(clusters.map((c) => c.id));
  for (const b of bookmarks) {
    if (b.clusterId && !validClusterIds.has(b.clusterId)) b.clusterId = null;
  }
  const history = Array.isArray(s.history)
    ? s.history.map(normalizeVisit).filter(Boolean)
    : [];
  const currentUrl = typeof s.currentUrl === 'string' ? s.currentUrl.slice(0, 2000) : '';
  return { bookmarks, clusters, history, currentUrl, version: 2 };
}
