/**
 * browser/persistence.js — kernel.storage adapter for Wormholes.
 *
 * Key: yancotab_browser_v2 (registered in appStorage REGISTRY).
 *
 * On load: try v2; fall back to v1 + migrate (and write v2 back so
 * subsequent loads skip the migration). Default to a seeded set of
 * popular bookmarks for brand-new users.
 */

import { normalizeState, makeInitialState, hostFromUrl } from './engine/state.js';
import { ensureV2 } from './engine/migrate.js';
import { gridPosition } from './engine/layout.js';

const KEY_V2 = 'yancotab_browser_v2';
const KEY_V1 = 'yancotab_browser_v1';

export const STORAGE_KEYS = Object.freeze({ v2: KEY_V2, v1: KEY_V1 });

const SEED = [
  { label: 'Google',    url: 'https://www.google.com' },
  { label: 'YouTube',   url: 'https://www.youtube.com' },
  { label: 'GitHub',    url: 'https://github.com' },
  { label: 'Wikipedia', url: 'https://www.wikipedia.org' },
  { label: 'Reddit',    url: 'https://www.reddit.com' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com' },
];

function seedState() {
  const bookmarks = SEED.map((b, i) => {
    const { x, y } = gridPosition(i);
    return {
      id: `bm_seed_${i}`,
      label: b.label,
      url: b.url,
      x, y,
      clusterId: null,
      visitCount: 0,
      lastVisited: null,
    };
  });
  return { bookmarks, clusters: [], history: [], currentUrl: '', version: 2 };
}

export function loadState(kernel) {
  // Try v2 first.
  try {
    const v2 = kernel?.storage?.load?.(KEY_V2);
    if (v2 && typeof v2 === 'object' && Array.isArray(v2.bookmarks) && v2.bookmarks.length > 0) {
      return normalizeState(v2);
    }
  } catch { /* ignore */ }

  // Fall back to v1 + migrate.
  try {
    const v1 = kernel?.storage?.load?.(KEY_V1);
    if (v1 && Array.isArray(v1.bookmarks) && v1.bookmarks.length > 0) {
      const migrated = normalizeState(ensureV2(v1));
      // Persist v2 so future loads skip migration.
      try { kernel?.storage?.save?.(KEY_V2, migrated); } catch { /* ignore */ }
      return migrated;
    }
  } catch { /* ignore */ }

  return seedState();
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

export { hostFromUrl };
export { makeInitialState };
