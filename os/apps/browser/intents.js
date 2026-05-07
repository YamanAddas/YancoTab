/**
 * browser/intents.js — pure mutation helpers for Wormholes.
 * Each returns a new state; never mutates input.
 */

import { newId, normalizeBookmark, hostFromUrl, clamp01, CLUSTER_COLORS } from './engine/state.js';
import { recordVisit } from './engine/visits.js';
import { gridPosition, registrableKey } from './engine/layout.js';

function clone(s) {
  return {
    ...s,
    bookmarks: s.bookmarks.map((b) => ({ ...b })),
    clusters: s.clusters.map((c) => ({ ...c })),
    history: s.history.slice(),
  };
}

export function addBookmark(state, { label, url }) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return state;
  const next = clone(state);
  const { x, y } = gridPosition(next.bookmarks.length);
  const b = normalizeBookmark({
    id: newId('bm'),
    label: label || hostFromUrl(trimmed) || 'Saved',
    url: trimmed,
    x, y,
    clusterId: null,
    visitCount: 0,
    lastVisited: null,
  });
  if (!b) return state;
  next.bookmarks.push(b);
  return next;
}

export function removeBookmark(state, id) {
  const next = clone(state);
  next.bookmarks = next.bookmarks.filter((b) => b.id !== id);
  return next;
}

export function updateBookmark(state, id, patch) {
  const next = clone(state);
  const b = next.bookmarks.find((x) => x.id === id);
  if (!b) return state;
  if (typeof patch.label === 'string') b.label = patch.label.trim().slice(0, 40) || b.label;
  if (typeof patch.url === 'string') b.url = patch.url.trim() || b.url;
  if (Number.isFinite(patch.x)) b.x = clamp01(patch.x);
  if (Number.isFinite(patch.y)) b.y = clamp01(patch.y);
  if (typeof patch.clusterId === 'string' || patch.clusterId === null) b.clusterId = patch.clusterId;
  return next;
}

export function navigated(state, url, now = Date.now()) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return state;
  return { ...recordVisit(state, trimmed, now), currentUrl: trimmed };
}

export function clearHistory(state) {
  return { ...clone(state), history: [] };
}

/**
 * mergeIntoCluster(state, draggedId, targetId) — drop a portal onto
 * another to form / join a cluster.
 *
 *   • both already in the same cluster → no-op
 *   • target has a cluster → dragged joins it
 *   • dragged has a cluster, target doesn't → target joins dragged's
 *   • neither has a cluster → create a new cluster (named from the
 *     shared registrable host or "Cluster N") with both as members
 */
export function mergeIntoCluster(state, draggedId, targetId) {
  if (draggedId === targetId) return state;
  const next = clone(state);
  const dragged = next.bookmarks.find((b) => b.id === draggedId);
  const target = next.bookmarks.find((b) => b.id === targetId);
  if (!dragged || !target) return state;

  if (dragged.clusterId && dragged.clusterId === target.clusterId) {
    return state;
  }

  if (target.clusterId) {
    dragged.clusterId = target.clusterId;
  } else if (dragged.clusterId) {
    target.clusterId = dragged.clusterId;
  } else {
    // Form a new cluster.
    const sharedKey = registrableKey(target.url) || registrableKey(dragged.url) || '';
    const name = sharedKey ? capitalize(sharedKey) : `Cluster ${next.clusters.length + 1}`;
    const usedColors = new Set(next.clusters.map((c) => c.color));
    const color = CLUSTER_COLORS.find((c) => !usedColors.has(c)) || CLUSTER_COLORS[next.clusters.length % CLUSTER_COLORS.length];
    const cluster = {
      id: newId('cl'),
      name,
      color,
      position: (next.clusters.length + 1) * 1000,
    };
    next.clusters.push(cluster);
    dragged.clusterId = cluster.id;
    target.clusterId = cluster.id;
  }
  return next;
}

/**
 * removeFromCluster(state, id) — drop the bookmark out of its cluster
 * (becomes "floating" again). If the cluster ends up with <2 members,
 * delete it entirely.
 */
export function removeFromCluster(state, id) {
  const next = clone(state);
  const b = next.bookmarks.find((x) => x.id === id);
  if (!b || !b.clusterId) return state;
  const oldClusterId = b.clusterId;
  b.clusterId = null;
  const remaining = next.bookmarks.filter((x) => x.clusterId === oldClusterId).length;
  if (remaining < 2) {
    // Dissolve the cluster.
    next.clusters = next.clusters.filter((c) => c.id !== oldClusterId);
    for (const x of next.bookmarks) {
      if (x.clusterId === oldClusterId) x.clusterId = null;
    }
  }
  return next;
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
