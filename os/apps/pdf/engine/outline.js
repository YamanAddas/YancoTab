/**
 * pdf/engine/outline.js — flatten a pdf.js outline tree.
 *
 * pdf.js delivers `getOutline()` as a recursive array:
 *   [{ title, dest, items: [...] }, ...]
 *
 * We flatten to a render-friendly list:
 *   [{ title, depth, dest, page (optional) }, ...]
 *
 * `dest` may be a string name (named destination) or an array of
 * the form `[ref, {name:'XYZ'}, x, y, zoom]`. Resolving to a page
 * number requires async pdf.js calls (`getPageIndex(dest[0])`),
 * which the orchestrator does after flattening — this module only
 * normalizes structure.
 *
 * Pure module — no DOM, no kernel, no pdf.js import.
 */

const MAX_DEPTH = 6;
const MAX_TITLE_LEN = 240;

/**
 * flattenOutline(rawTree) → array of { title, depth, dest, hasChildren }.
 * Entries with no title or non-string title are dropped.
 */
export function flattenOutline(rawTree) {
  if (!Array.isArray(rawTree)) return [];
  const out = [];
  walk(rawTree, 0, out);
  return out;
}

function walk(nodes, depth, out) {
  if (!Array.isArray(nodes)) return;
  if (depth > MAX_DEPTH) return;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const title = typeof node.title === 'string' ? node.title.trim().slice(0, MAX_TITLE_LEN) : '';
    if (!title) {
      // Skip but still descend — some PDFs nest unnamed wrapper nodes.
      if (Array.isArray(node.items) && node.items.length) walk(node.items, depth, out);
      continue;
    }
    const hasChildren = Array.isArray(node.items) && node.items.length > 0;
    out.push({
      title,
      depth,
      dest: node.dest != null ? node.dest : null,
      hasChildren,
    });
    if (hasChildren) walk(node.items, depth + 1, out);
  }
}

/**
 * Layer a `page` field onto outline entries given a Map<destKey, page>.
 * destKey is what `destToKey` returns — used so the orchestrator can
 * resolve named destinations and ref-arrays without this module
 * caring about pdf.js shapes.
 */
export function annotateWithPages(flat, pageByDestKey) {
  if (!Array.isArray(flat)) return [];
  const lookup = pageByDestKey instanceof Map ? pageByDestKey : new Map(Object.entries(pageByDestKey || {}));
  return flat.map((entry) => {
    const k = destToKey(entry.dest);
    const page = k ? lookup.get(k) : null;
    return Number.isFinite(page) && page >= 1 ? { ...entry, page } : { ...entry, page: null };
  });
}

/**
 * destToKey(dest) → stable string key for the dest, or null.
 *
 * Named destinations (strings) round-trip. Array destinations
 * `[ref, {name:'XYZ'}, x, y, zoom]` use the ref's `num` and `gen`
 * fields per pdf.js's Ref shape. Anything else returns null.
 */
export function destToKey(dest) {
  if (typeof dest === 'string' && dest) return `name:${dest}`;
  if (Array.isArray(dest) && dest.length > 0) {
    const ref = dest[0];
    if (ref && typeof ref === 'object' && Number.isFinite(ref.num)) {
      const gen = Number.isFinite(ref.gen) ? ref.gen : 0;
      return `ref:${ref.num}.${gen}`;
    }
  }
  return null;
}
