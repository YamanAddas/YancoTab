/**
 * todo/persistence.js — kernel.storage adapter for Mission Control.
 *
 * Single key: yancotab_todo_v2.
 *
 * On load: prefer v2; if v2 missing, try v1 + migrate; if both miss,
 * return the default state. The migrate path writes v2 back so the v1
 * key becomes unused going forward (we don't delete it — leaving it
 * means a downgrade still finds something).
 */

import { makeInitialState, normalizeState } from './engine/state.js';
import { isV1Shape, migrateV1ToV2 } from './engine/migrate.js';

const KEY_V2 = 'yancotab_todo_v2';
const KEY_V1 = 'yancotab_todo_v1';

export const STORAGE_KEYS = Object.freeze({
  v2: KEY_V2,
  v1: KEY_V1,
});

export function loadState(kernel) {
  // Try v2 first.
  try {
    const v2 = kernel?.storage?.load?.(KEY_V2);
    if (v2 && typeof v2 === 'object' && Array.isArray(v2.missions)) {
      return normalizeState(v2);
    }
  } catch { /* ignore */ }

  // Fall back to v1 + migrate.
  try {
    const v1 = kernel?.storage?.load?.(KEY_V1);
    if (isV1Shape(v1)) {
      const migrated = migrateV1ToV2(v1);
      const norm = normalizeState(migrated);
      // Persist the migrated v2 so subsequent loads skip the migration.
      try { kernel?.storage?.save?.(KEY_V2, norm); } catch { /* ignore */ }
      return norm;
    }
  } catch { /* ignore */ }

  return makeInitialState();
}

export function saveState(kernel, state) {
  try { kernel?.storage?.save?.(KEY_V2, state); } catch { /* ignore */ }
}

export function subscribe(kernel, handler) {
  if (!kernel?.storage?.subscribe) return () => {};
  return kernel.storage.subscribe(KEY_V2, (e) => {
    if (e?.source === 'remote' && e.newValue) {
      handler(normalizeState(e.newValue));
    }
  });
}
