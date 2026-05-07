/**
 * notes/engine/meta.js — note metadata + migration to Constellation shape.
 *
 * Existing meta (from the old NotesApp) keys notes by their fs path
 * and stores `{title, created, updated, pinned, tags}`. The
 * Constellation redesign **adds** two fields per entry:
 *
 *   x, y     — 0..100 percent stage coords
 *   status   — 'anchor' | 'idea' | 'draft' | 'done' | 'archived' | null
 *
 * Migration is **additive + non-destructive**: existing fields are
 * preserved, missing fields default in. Notes without x/y get a
 * grid position keyed off their alphabetical-by-path order.
 *
 * Pure module — no DOM, no kernel.
 */

import { gridPosition } from './layout.js';

export const STATUSES = Object.freeze(['anchor', 'idea', 'draft', 'done', 'archived']);

/**
 * normalizeMetaEntry(raw, fallbackPos) → normalized entry.
 *   - title:    string, trimmed, falls back to 'Untitled'
 *   - created:  finite ms epoch, falls back to 0
 *   - updated:  finite ms epoch, falls back to created
 *   - pinned:   boolean
 *   - tags:     array of lowercase strings, ≤ 6, dedup
 *   - x, y:     finite 4..96, fall back to fallbackPos
 *   - status:   one of STATUSES or null
 *
 * Returns null if `raw` is non-object.
 */
export function normalizeMetaEntry(raw, fallbackPos = { x: 50, y: 50 }) {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' && raw.title.trim()
    ? raw.title.trim().slice(0, 200)
    : 'Untitled';
  const created = Number.isFinite(raw.created) ? raw.created : 0;
  const updated = Number.isFinite(raw.updated) ? raw.updated : created;
  const tags = Array.isArray(raw.tags)
    ? Array.from(new Set(raw.tags
        .filter((t) => typeof t === 'string' && t.trim())
        .map((t) => t.toLowerCase().trim())))
        .slice(0, 6)
    : [];
  const x = clamp(Number.isFinite(raw.x) ? raw.x : fallbackPos.x);
  const y = clamp(Number.isFinite(raw.y) ? raw.y : fallbackPos.y);
  const status = STATUSES.includes(raw.status) ? raw.status : null;
  return {
    title, created, updated,
    pinned: !!raw.pinned,
    tags,
    x, y, status,
  };
}

/**
 * normalizeMeta(rawMap) → { [path]: entry } with all entries normalized.
 * Notes without x/y get a deterministic grid position (sorted by
 * path so the assignment is stable across loads).
 */
export function normalizeMeta(rawMap) {
  if (!rawMap || typeof rawMap !== 'object') return {};
  const paths = Object.keys(rawMap).sort();
  const out = {};
  paths.forEach((path, i) => {
    const grid = gridPosition(i);
    const entry = normalizeMetaEntry(rawMap[path], grid);
    if (entry) out[path] = entry;
  });
  return out;
}

/**
 * Default status inference for a note that's missing one. Used on
 * first migration so existing notes don't all show as null/normal.
 *
 *   pinned                            → 'anchor'
 *   tags include 'idea' or 'todo'     → 'idea'
 *   updated < 7d ago + has body       → 'draft'
 *   updated > 30d                     → 'done'
 *   else                              → null
 */
export function inferStatus(entry, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.pinned) return 'anchor';
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  if (tags.includes('idea') || tags.includes('todo')) return 'idea';
  const updated = Number.isFinite(entry.updated) ? entry.updated : 0;
  if (updated > 0) {
    const ageMs = now - updated;
    if (ageMs < 7 * 24 * 60 * 60_000) return 'draft';
    if (ageMs > 30 * 24 * 60 * 60_000) return 'done';
  }
  return null;
}

function clamp(n) {
  if (!Number.isFinite(n)) return 50;
  if (n < 4) return 4;
  if (n > 96) return 96;
  return n;
}
