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

// ── Per-note undo history persistence ───────────────────────────────
const HISTORY_KEY = 'yancotab_notes_history_v1';

function loadAllHistory(kernel) {
  try {
    const raw = kernel?.storage?.load?.(HISTORY_KEY);
    if (raw && typeof raw === 'object') return raw;
  } catch { /* ignore */ }
  return {};
}
function saveAllHistory(kernel, all) {
  try { kernel?.storage?.save?.(HISTORY_KEY, all); } catch { /* ignore */ }
}

export function loadHistoryFor(kernel, path) {
  if (!path) return null;
  const all = loadAllHistory(kernel);
  return all[path] || null;
}

export function saveHistoryFor(kernel, path, snapshot) {
  if (!path || !snapshot) return;
  const all = loadAllHistory(kernel);
  all[path] = snapshot;
  saveAllHistory(kernel, all);
}

export function clearHistoryFor(kernel, path) {
  if (!path) return;
  const all = loadAllHistory(kernel);
  if (path in all) {
    delete all[path];
    saveAllHistory(kernel, all);
  }
}
