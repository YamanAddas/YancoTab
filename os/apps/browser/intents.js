/**
 * browser/intents.js — pure mutation helpers for Wormholes.
 * Each returns a new state; never mutates input.
 */

import { newId, normalizeBookmark, hostFromUrl, clamp01 } from './engine/state.js';
import { recordVisit } from './engine/visits.js';
import { gridPosition } from './engine/layout.js';

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
