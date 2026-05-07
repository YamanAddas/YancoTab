/**
 * photos/persistence.js — kernel.storage adapter for Lightbox extras.
 *
 * Storage shape:
 *   yancotab_photos_meta_v1 = { favorites: string[] }
 *
 * `favorites` is an array of fs paths (`/home/photos/foo.png`).
 * Lookup is loaded once into a Set and pushed back as an array on
 * each mutation (cheap — typical user has dozens, not thousands).
 *
 * We deliberately keep this OUT of fileSystem item meta because:
 *   1. fs.write() rewrites the entire file payload (image data + meta)
 *      — flipping a star shouldn't trigger a multi-MB write.
 *   2. The Lightbox needs to render counts before any photo is opened,
 *      and item meta isn't surfaced from list() in a uniform shape.
 */

const KEY = 'yancotab_photos_meta_v1';

export const STORAGE_KEY = KEY;

export function loadFavorites(kernel) {
  try {
    const raw = kernel?.storage?.load?.(KEY);
    if (raw && Array.isArray(raw.favorites)) {
      return new Set(raw.favorites.filter((s) => typeof s === 'string'));
    }
  } catch { /* ignore */ }
  return new Set();
}

export function saveFavorites(kernel, set) {
  if (!(set instanceof Set)) return;
  try {
    kernel?.storage?.save?.(KEY, { favorites: Array.from(set) });
  } catch { /* ignore */ }
}

/** Toggle a path's favorite state. Returns the new boolean. */
export function toggleFavorite(kernel, path) {
  if (!path || typeof path !== 'string') return false;
  const set = loadFavorites(kernel);
  let nowFav;
  if (set.has(path)) { set.delete(path); nowFav = false; }
  else { set.add(path); nowFav = true; }
  saveFavorites(kernel, set);
  return nowFav;
}

/** Drop favorite entry — used when a photo is deleted. */
export function removeFavorite(kernel, path) {
  if (!path) return;
  const set = loadFavorites(kernel);
  if (set.delete(path)) saveFavorites(kernel, set);
}

/** Rewrite a path key — used on rename/move. */
export function renameFavorite(kernel, oldPath, newPath) {
  if (!oldPath || !newPath) return;
  const set = loadFavorites(kernel);
  if (set.delete(oldPath)) {
    set.add(newPath);
    saveFavorites(kernel, set);
  }
}
