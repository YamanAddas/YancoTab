/**
 * pdf/engine/bookmarks.js — per-document bookmarks.
 *
 * Storage shape (per kernel.storage key):
 *   {
 *     [docId]: [
 *       { page: number, label: string, color: 'accent'|'warm'|'violet'|'rose'|'cool', addedTs: number },
 *       ...
 *     ]
 *   }
 *
 * `docId` is the canonical fs path (when opened from Files), or
 * `recent:<sanitized name>` for ad-hoc imports.
 *
 * Pure module — no DOM, no kernel.
 */

export const COLORS = Object.freeze(['accent', 'warm', 'violet', 'rose', 'cool']);

export function emptyMap() { return {}; }

export function listForDoc(map, docId) {
  if (!map || typeof map !== 'object') return [];
  const arr = map[docId];
  if (!Array.isArray(arr)) return [];
  return arr.map(normalize).filter(Boolean);
}

export function add(map, docId, entry) {
  if (!docId) return map;
  const m = clone(map);
  const list = Array.isArray(m[docId]) ? m[docId].map(normalize).filter(Boolean) : [];
  const next = normalize({ ...entry, addedTs: entry?.addedTs || Date.now() });
  if (!next) return m;
  // Idempotent on (page, label) — replace duplicates instead of stacking.
  const existing = list.findIndex((b) => b.page === next.page && b.label === next.label);
  if (existing >= 0) list[existing] = next;
  else list.push(next);
  list.sort((a, b) => a.page - b.page);
  m[docId] = list;
  return m;
}

export function remove(map, docId, page, label = null) {
  if (!docId) return map;
  const m = clone(map);
  const list = Array.isArray(m[docId]) ? m[docId].map(normalize).filter(Boolean) : [];
  const next = list.filter((b) => !(b.page === page && (label === null || b.label === label)));
  if (next.length === 0) delete m[docId];
  else m[docId] = next;
  return m;
}

/** Drop all bookmarks for a doc (used on doc delete). */
export function clearDoc(map, docId) {
  if (!docId || !map || !(docId in map)) return map;
  const m = clone(map);
  delete m[docId];
  return m;
}

export function isBookmarked(map, docId, page, label = null) {
  return listForDoc(map, docId).some((b) =>
    b.page === page && (label === null || b.label === label));
}

function normalize(b) {
  if (!b || typeof b !== 'object') return null;
  if (!Number.isFinite(b.page) || b.page < 1) return null;
  const page = Math.floor(b.page);
  const label = typeof b.label === 'string' ? b.label.slice(0, 200) : `Page ${page}`;
  const color = COLORS.includes(b.color) ? b.color : 'accent';
  const addedTs = Number.isFinite(b.addedTs) && b.addedTs >= 0 ? b.addedTs : 0;
  return { page, label, color, addedTs };
}

function clone(m) {
  // Shallow-clone outer object; arrays are replaced wholesale on
  // mutation so callers can't mutate ours by reference.
  const out = {};
  if (!m || typeof m !== 'object') return out;
  for (const [k, v] of Object.entries(m)) out[k] = Array.isArray(v) ? [...v] : v;
  return out;
}
