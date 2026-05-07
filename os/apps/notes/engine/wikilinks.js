/**
 * notes/engine/wikilinks.js — extract [[Title]] refs from note bodies
 * and build a backlink map.
 *
 * Wikilink syntax: `[[Title]]` matches a literal title. The match is
 * case-insensitive. Up to 32 chars per title. Refs to notes that
 * don't exist by exact title are dropped silently — we don't render
 * "broken links" yet.
 *
 * Pure module — no DOM, no kernel.
 */

const WIKILINK_RE = /\[\[([^\]\n]{1,80})\]\]/g;

/**
 * extractWikilinks(body) → array of titles referenced (deduplicated,
 * preserved insertion order, lowercased).
 */
export function extractWikilinks(body) {
  if (typeof body !== 'string' || !body) return [];
  const out = [];
  const seen = new Set();
  let match;
  // RegExp is stateful via /g — make a fresh one per call to avoid
  // cross-call lastIndex leaks.
  const re = new RegExp(WIKILINK_RE.source, 'g');
  while ((match = re.exec(body)) !== null) {
    const t = String(match[1] || '').trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * buildBacklinkMap(notes) → Map<targetPath, Set<sourcePath>>.
 *
 * `notes` is an array of `{path, title, body}`. For each note we
 * extract its wikilinks, resolve them by case-insensitive title,
 * and record the reverse edge (target → source).
 *
 * Notes that link to a non-existent title contribute nothing.
 */
export function buildBacklinkMap(notes) {
  const map = new Map();
  if (!Array.isArray(notes)) return map;

  // Title → path index for cheap lookup. Lowercased.
  const titleIdx = new Map();
  for (const n of notes) {
    const t = typeof n?.title === 'string' ? n.title.trim().toLowerCase() : '';
    if (t && !titleIdx.has(t)) titleIdx.set(t, n.path);
  }

  for (const n of notes) {
    if (!n?.path || typeof n.body !== 'string') continue;
    const refs = extractWikilinks(n.body);
    for (const ref of refs) {
      const targetPath = titleIdx.get(ref);
      if (!targetPath || targetPath === n.path) continue;
      if (!map.has(targetPath)) map.set(targetPath, new Set());
      map.get(targetPath).add(n.path);
    }
  }

  return map;
}

/**
 * forwardLinks(notes, fromPath) → array of paths the given note
 * links to (resolved by title). Used by the cosmos stage to draw
 * threads outward from the selected note.
 */
export function forwardLinks(notes, fromPath) {
  if (!Array.isArray(notes) || !fromPath) return [];
  const source = notes.find((n) => n?.path === fromPath);
  if (!source) return [];
  const refs = extractWikilinks(source.body);
  if (refs.length === 0) return [];
  const titleIdx = new Map();
  for (const n of notes) {
    const t = typeof n?.title === 'string' ? n.title.trim().toLowerCase() : '';
    if (t && !titleIdx.has(t)) titleIdx.set(t, n.path);
  }
  const out = [];
  const seen = new Set();
  for (const ref of refs) {
    const target = titleIdx.get(ref);
    if (!target || target === fromPath || seen.has(target)) continue;
    seen.add(target);
    out.push(target);
  }
  return out;
}

/**
 * allEdges(notes) → array of `{from, to}` path pairs (one per
 * direction). Used by the cosmos stage to draw the dashed thread
 * SVG. Direction is preserved so the renderer can fade ends if
 * desired.
 */
export function allEdges(notes) {
  if (!Array.isArray(notes)) return [];
  const titleIdx = new Map();
  for (const n of notes) {
    const t = typeof n?.title === 'string' ? n.title.trim().toLowerCase() : '';
    if (t && !titleIdx.has(t)) titleIdx.set(t, n.path);
  }
  const out = [];
  const seen = new Set();
  for (const n of notes) {
    if (!n?.path || typeof n.body !== 'string') continue;
    const refs = extractWikilinks(n.body);
    for (const ref of refs) {
      const target = titleIdx.get(ref);
      if (!target || target === n.path) continue;
      const key = `${n.path}|${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from: n.path, to: target });
    }
  }
  return out;
}
