/**
 * os/utils/safeSave.js — wrapper around kernel.storage.save that
 * surfaces failures via a toast instead of swallowing them silently.
 *
 * The shipped pattern across game persistence (solitaire/spider/mines/
 * tarneeb/trix/mahjong) was:
 *
 *   try { kernel?.storage?.save(KEY, x); } catch (_e) { return false; }
 *
 * If localStorage is full mid-game, the user lost progress with no
 * toast, no console signal — pure silent data loss. This helper
 * preserves the same call shape (no throw on failure) but logs a
 * console.warn once and emits a single toast per (label) per session
 * so the user actually finds out when their save died.
 *
 * Returns true on success, false on failure — callers can act on it
 * if needed (most don't; the autosave is fire-and-forget).
 */

const _toastedLabels = new Set();

export function safeSave(kernel, key, value, label = 'data') {
  if (!kernel?.storage?.save) return false;
  try {
    kernel.storage.save(key, value);
    return true;
  } catch (e) {
    const msg = `[storage] save failed for ${key}: ${e?.message || e}`;
    try { console.warn(msg); } catch { /* console may be unavailable */ }
    // Dedupe: one toast per label per page session — autosave loops
    // would otherwise queue dozens of "storage full" toasts in seconds.
    if (!_toastedLabels.has(label)) {
      _toastedLabels.add(label);
      try {
        kernel.emit?.('toast', {
          message: `Couldn't save ${label} — storage full?`,
          type: 'error',
        });
      } catch { /* emit may fail in tests without a bus */ }
    }
    return false;
  }
}

/** Reset the toast-once dedup. Useful for tests; not used by the app. */
export function _resetSafeSaveToastDedup() {
  _toastedLabels.clear();
}
