/**
 * browser/engine/layout.js — default portal positioning + auto-clustering.
 *
 * For migrating users: place existing bookmarks on a deterministic
 * 4-column grid in the upper-left and middle of the star-map area,
 * each card 22% wide and 18% tall, with 4% gutters. The grid lives
 * inside the 4..96 percent box so portals don't get clipped at edges.
 *
 * For brand-new users: same layout starting from the seed defaults.
 */

const COL_X = [16, 38, 60, 82];
const ROW_Y = [22, 42, 62, 82];

/**
 * gridPosition(index) → { x, y } in percent (0..100).
 * Wraps every COL_X.length entries. Beyond ROW_Y.length rows it
 * keeps stepping the y down by ~10% until 95, then re-uses the last
 * row (the user can drag overlaps apart).
 */
export function gridPosition(index) {
  if (!Number.isFinite(index) || index < 0) return { x: 16, y: 22 };
  const col = index % COL_X.length;
  const row = Math.floor(index / COL_X.length);
  let y;
  if (row < ROW_Y.length) y = ROW_Y[row];
  else y = Math.min(95, ROW_Y[ROW_Y.length - 1] + (row - ROW_Y.length + 1) * 6);
  return { x: COL_X[col], y };
}

/**
 * autoClusterByHost(bookmarks) → groups bookmarks that share the
 * same registrable host (e.g. `github.com` and `docs.github.com`
 * both map to "github"). Returns Map<groupKey, bookmarkIds>.
 *
 * Used for migration to seed initial cluster groupings; not run on
 * every render. The shell can call this once and create clusters
 * for groups with ≥2 members.
 */
export function autoClusterByHost(bookmarks) {
  const groups = new Map();
  if (!Array.isArray(bookmarks)) return groups;
  for (const b of bookmarks) {
    const key = registrableKey(b.url || '');
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b.id);
  }
  return groups;
}

/**
 * Heuristic "registrable" key — second-level domain.
 * `docs.github.com` → 'github'
 * `www.example.co.uk` → 'example' (good enough — perfect TLD parsing
 * isn't worth the bytes here)
 */
export function registrableKey(url) {
  try {
    const host = new URL(String(url)).hostname.replace(/^www\./i, '');
    const parts = host.split('.');
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    // Skip the TLD; take whatever's just before it.
    return parts[parts.length - 2] || parts[0];
  } catch {
    return '';
  }
}

export const STARMAP_COLS = COL_X.length;
export const STARMAP_ROWS = ROW_Y.length;
