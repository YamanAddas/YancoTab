/**
 * files/persistence.js — kernel.storage adapters for the Vault.
 *
 * Reuses two existing keys (yancotab_files_view, yancotab_files_sort)
 * registered by the legacy FilesApp. Adds one new key for the
 * Vault-specific pinned set.
 */

const PINNED_KEY = 'yancotab_files_pinned_v1';
const VIEW_KEY = 'yancotab_files_view';
const SORT_KEY = 'yancotab_files_sort';

export const STORAGE_KEYS = Object.freeze({
  PINNED: PINNED_KEY,
  VIEW: VIEW_KEY,
  SORT: SORT_KEY,
});

// ── Pinned ────────────────────────────────────────────────

export function loadPinned(kernel) {
  try {
    const raw = kernel?.storage?.load?.(PINNED_KEY);
    if (raw && Array.isArray(raw.paths)) {
      return new Set(raw.paths.filter((s) => typeof s === 'string'));
    }
  } catch { /* ignore */ }
  return new Set();
}

export function savePinned(kernel, set) {
  if (!(set instanceof Set)) return;
  try { kernel?.storage?.save?.(PINNED_KEY, { paths: Array.from(set) }); } catch { /* ignore */ }
}

export function togglePin(kernel, path) {
  if (!path || typeof path !== 'string') return false;
  const s = loadPinned(kernel);
  let nowPinned;
  if (s.has(path)) { s.delete(path); nowPinned = false; }
  else { s.add(path); nowPinned = true; }
  savePinned(kernel, s);
  return nowPinned;
}

export function removePin(kernel, path) {
  if (!path) return;
  const s = loadPinned(kernel);
  if (s.delete(path)) savePinned(kernel, s);
}

export function renamePin(kernel, oldPath, newPath) {
  if (!oldPath || !newPath) return;
  const s = loadPinned(kernel);
  if (s.delete(oldPath)) {
    s.add(newPath);
    savePinned(kernel, s);
  }
}

// ── View / sort prefs ─────────────────────────────────────

export const VAULT_VIEWS = Object.freeze(['honeycomb', 'grid', 'list']);

export function loadViewMode(kernel) {
  try {
    const v = kernel?.storage?.load?.(VIEW_KEY);
    if (typeof v === 'string' && VAULT_VIEWS.includes(v)) return v;
  } catch { /* ignore */ }
  return 'honeycomb';
}

export function saveViewMode(kernel, mode) {
  if (!VAULT_VIEWS.includes(mode)) return;
  try { kernel?.storage?.save?.(VIEW_KEY, mode); } catch { /* ignore */ }
}

export function loadSortMode(kernel) {
  try {
    const v = kernel?.storage?.load?.(SORT_KEY);
    if (typeof v === 'string' && v) return v;
  } catch { /* ignore */ }
  return 'name';
}

export function saveSortMode(kernel, mode) {
  if (typeof mode !== 'string' || !mode) return;
  try { kernel?.storage?.save?.(SORT_KEY, mode); } catch { /* ignore */ }
}
