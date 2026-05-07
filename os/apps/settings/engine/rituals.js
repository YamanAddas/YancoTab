/**
 * settings/engine/rituals.js — pure quick-ritual definitions + atomic apply.
 *
 * A ritual is a named bundle of (storageKey → newValue) writes that
 * the user can apply in one tap (or via a keyboard shortcut). Apply
 * is **atomic**: snapshot every target key first, write all, and on
 * any failure, restore from the snapshot.
 *
 * Pure module — no DOM, no kernel side-effects beyond the storage
 * facade we accept as `storage`. The shell wires storage + toast.
 *
 * Red-team note: NEVER mutate a running app's in-memory state from a
 * ritual. Write to storage and emit `app:settings-changed` so each
 * app can reconcile on its own terms.
 */

export const RITUAL_KEY = 'yancotab_settings_console_v1';

/**
 * Ritual definitions. Each `writes` is an array of {key, value} so we
 * can iterate deterministically (Object.entries' order is stable for
 * string keys but explicit array makes intent clearer + tests easier).
 *
 * Targets only registered AppStorage keys. `value` is the literal
 * payload to save — not a function — so the engine stays pure.
 */
export const RITUALS = Object.freeze({
  night: Object.freeze({
    id: 'night',
    name: 'Night mode',
    shortcut: '⌘ + 1',
    blurb: 'Dim shell, mute notifications',
    color: 'violet',
    writes: [
      { key: 'yancotab_theme_mode', value: 'dark' },
      // Pomodoro ambient.autoMute lives inside the pomodoro-settings shape;
      // engine touches the registered key wholesale.
      { key: 'yancotab_pomodoro_settings_v1', mergeAmbient: { autoMute: true, nightShell: true } },
    ],
  }),
  focus: Object.freeze({
    id: 'focus',
    name: 'Focus mode',
    shortcut: '⌘ + 2',
    blurb: 'Solo Pomodoro, classic preset',
    color: 'accent',
    writes: [
      { key: 'yancotab_pomodoro_settings_v1', mergeRoot: { activePresetId: 'classic' } },
      // The shell will additionally `kernel.emit('app:open', 'pomodoro')` —
      // that's a side-effect, not a write, so it lives outside the engine.
    ],
    sideEffects: [{ type: 'open', appId: 'pomodoro' }],
  }),
  weekend: Object.freeze({
    id: 'weekend',
    name: 'Weekend',
    shortcut: '⌘ + 3',
    blurb: 'Games-first dock, lighter shell',
    color: 'warm',
    writes: [
      { key: 'yancotab_theme_mode', value: 'auto' },
      // Dock reordering deferred until PR-2: needs to read current dock
      // order, swap games to the front. Recorded as a side-effect for
      // the shell to handle (it has access to the dock state).
    ],
    sideEffects: [{ type: 'reorderDockGamesFirst' }],
  }),
});

export function listRituals() {
  return Object.values(RITUALS);
}

export function getRitual(id) {
  return RITUALS[id] || null;
}

/**
 * apply(ritual, storage) → { ok: true } | { ok: false, error, restored: bool }
 *
 * Two-phase commit:
 *   1. Snapshot every target key via storage.load().
 *   2. Apply each write inside a try; on failure, rollback by writing
 *      the snapshot values back, then return { ok: false, restored: true }.
 *
 * The shell passes a storage object with `{load, save}`. Tests pass a
 * fake storage that can throw on a chosen key.
 */
export function apply(ritual, storage) {
  if (!ritual || !Array.isArray(ritual.writes)) {
    return { ok: false, error: 'invalid ritual' };
  }
  if (!storage || typeof storage.load !== 'function' || typeof storage.save !== 'function') {
    return { ok: false, error: 'invalid storage' };
  }

  // Phase 1: snapshot.
  const snapshot = new Map();
  for (const w of ritual.writes) {
    try {
      snapshot.set(w.key, storage.load(w.key));
    } catch (e) {
      return { ok: false, error: `snapshot failed for ${w.key}: ${e?.message || e}` };
    }
  }

  // Phase 2: apply. Track which keys we successfully wrote so we
  // know the rollback set on any later failure.
  const applied = [];
  try {
    for (const w of ritual.writes) {
      const next = computeNextValue(w, snapshot.get(w.key));
      storage.save(w.key, next);
      applied.push(w.key);
    }
    return { ok: true, applied: applied.slice(), changedKeys: applied.slice() };
  } catch (e) {
    // Rollback in reverse order.
    let restored = true;
    for (let i = applied.length - 1; i >= 0; i--) {
      const key = applied[i];
      try { storage.save(key, snapshot.get(key)); }
      catch { restored = false; }
    }
    return { ok: false, error: e?.message || String(e), restored };
  }
}

/**
 * computeNextValue(write, current) — derive the new value for one write.
 *   - If `value` is set, use it directly (override).
 *   - If `mergeRoot` is set, shallow-merge into the current object.
 *   - If `mergeAmbient` is set, merge into current.ambient (specifically
 *     for the pomodoro settings shape).
 */
export function computeNextValue(write, current) {
  if (!write) return current;
  if ('value' in write) return write.value;
  if (write.mergeRoot && typeof write.mergeRoot === 'object') {
    return { ...(current || {}), ...write.mergeRoot };
  }
  if (write.mergeAmbient && typeof write.mergeAmbient === 'object') {
    const cur = (current && typeof current === 'object') ? current : {};
    return {
      ...cur,
      ambient: { ...(cur.ambient || {}), ...write.mergeAmbient },
    };
  }
  return current;
}
