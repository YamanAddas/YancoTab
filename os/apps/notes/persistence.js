/**
 * notes/persistence.js — kernel.storage adapter for Constellation meta.
 *
 * Reuses the existing key (`yancotab_notes_meta_v2`) — we don't
 * change the storage shape, we just **add** fields per entry.
 * Existing data round-trips through normalizeMeta on load and
 * gains x/y/status defaults without losing title/created/etc.
 */

import { normalizeMeta, normalizeMetaEntry } from './engine/meta.js';

const KEY = 'yancotab_notes_meta_v2';

export const STORAGE_KEY = KEY;

export function loadMeta(kernel) {
  try {
    const raw = kernel?.storage?.load?.(KEY);
    if (raw && typeof raw === 'object') return normalizeMeta(raw);
  } catch { /* ignore */ }
  return {};
}

export function saveMeta(kernel, meta) {
  try { kernel?.storage?.save?.(KEY, meta); } catch { /* ignore */ }
}

/**
 * setEntry(kernel, path, patch) → updates one note's meta.
 * Loads the full map, normalizes, applies patch, saves.
 */
export function setEntry(kernel, path, patch) {
  if (!path || !patch || typeof patch !== 'object') return;
  const meta = loadMeta(kernel);
  const current = meta[path] || {};
  meta[path] = normalizeMetaEntry({ ...current, ...patch }, { x: current.x ?? 50, y: current.y ?? 50 });
  saveMeta(kernel, meta);
}

export function removeEntry(kernel, path) {
  if (!path) return;
  const meta = loadMeta(kernel);
  if (path in meta) {
    delete meta[path];
    saveMeta(kernel, meta);
  }
}
