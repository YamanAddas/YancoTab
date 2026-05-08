/**
 * pdf/engine/highlights.js — per-document highlight passages.
 *
 * Each highlight stores the selected TEXT plus the page it lives on.
 * On re-open, the orchestrator finds the first occurrence of that
 * text in the rendered text layer and wraps it in a <mark>. This is
 * resilient to pdf.js text-item-ordering changes that would break
 * a more precise span+offset scheme, at the cost of always
 * highlighting the first match if a passage repeats on a page.
 *
 * Storage shape:
 *   {
 *     [docId]: [
 *       { page: number, text: string, color: 'accent'|'warm'|'rose'|'violet'|'cool',
 *         addedTs: number },
 *       ...
 *     ]
 *   }
 *
 * Pure module — no DOM, no kernel.
 */

export const COLORS = Object.freeze(['accent', 'warm', 'rose', 'violet', 'cool']);

const MIN_LEN = 2;
const MAX_LEN = 1200;

export function emptyMap() { return {}; }

export function listForDoc(map, docId) {
  if (!map || typeof map !== 'object' || !docId) return [];
  const arr = map[docId];
  return Array.isArray(arr) ? arr.map(normalize).filter(Boolean) : [];
}

export function listForDocPage(map, docId, page) {
  return listForDoc(map, docId).filter((h) => h.page === page);
}

export function add(map, docId, entry) {
  if (!docId) return map;
  const next = clone(map);
  const list = (Array.isArray(next[docId]) ? next[docId] : []).map(normalize).filter(Boolean);
  const norm = normalize({ ...entry, addedTs: entry?.addedTs || Date.now() });
  if (!norm) return map;
  // Idempotent: same (page, text) → no-op
  const dup = list.findIndex((h) => h.page === norm.page && h.text === norm.text);
  if (dup >= 0) {
    list[dup] = norm; // refresh color/ts
  } else {
    list.push(norm);
  }
  next[docId] = list;
  return next;
}

export function remove(map, docId, page, text) {
  if (!docId) return map;
  const next = clone(map);
  const list = (Array.isArray(next[docId]) ? next[docId] : []).map(normalize).filter(Boolean);
  const filtered = list.filter((h) => !(h.page === page && h.text === text));
  if (filtered.length === 0) delete next[docId];
  else next[docId] = filtered;
  return next;
}

export function clearDoc(map, docId) {
  if (!docId || !map || !(docId in map)) return map;
  const next = clone(map);
  delete next[docId];
  return next;
}

function normalize(h) {
  if (!h || typeof h !== 'object') return null;
  if (!Number.isFinite(h.page) || h.page < 1) return null;
  const text = typeof h.text === 'string' ? h.text.trim() : '';
  if (text.length < MIN_LEN) return null;
  const trimmed = text.length > MAX_LEN ? text.slice(0, MAX_LEN) : text;
  const color = COLORS.includes(h.color) ? h.color : 'accent';
  const addedTs = Number.isFinite(h.addedTs) && h.addedTs >= 0 ? h.addedTs : 0;
  return { page: Math.floor(h.page), text: trimmed, color, addedTs };
}

function clone(m) {
  const out = {};
  if (!m || typeof m !== 'object') return out;
  for (const [k, v] of Object.entries(m)) out[k] = Array.isArray(v) ? [...v] : v;
  return out;
}
