/**
 * pdf/v3/select/textSearch.js — case-insensitive substring search
 * across a page's flat text index.
 *
 * Pure: takes a pageTextIndex and a query, returns the list of
 * {charStart, charEnd} matches.
 *
 * The orchestrator (searchController.js) iterates pages and combines
 * results into a global match list with page numbers attached.
 *
 * Target size: ≤ 100 lines.
 */

/**
 * @param {{flat: string}} index
 * @param {string} query
 * @param {{ caseSensitive?: boolean, wholeWord?: boolean }} [opts]
 * @returns {Array<{charStart: number, charEnd: number}>}
 */
export function searchInIndex(index, query, opts = {}) {
  if (!index || typeof index.flat !== 'string' || !query) return [];
  const q = String(query);
  if (q.length === 0) return [];

  const haystack = opts.caseSensitive ? index.flat : index.flat.toLowerCase();
  const needle = opts.caseSensitive ? q : q.toLowerCase();
  const matches = [];

  let i = 0;
  while (i < haystack.length) {
    const at = haystack.indexOf(needle, i);
    if (at < 0) break;

    if (opts.wholeWord) {
      const before = at === 0 ? '' : haystack.charAt(at - 1);
      const after = at + needle.length >= haystack.length
        ? ''
        : haystack.charAt(at + needle.length);
      if (isWordChar(before) || isWordChar(after)) {
        i = at + 1;
        continue;
      }
    }

    matches.push({ charStart: at, charEnd: at + needle.length });
    // Advance past the match (matches Chrome / Acrobat find behavior:
    // no overlapping matches). The Math.max guards against an empty
    // needle (already returned above; defensive).
    i = at + Math.max(1, needle.length);
  }
  return matches;
}

function isWordChar(c) {
  return /[\p{Letter}\p{Number}_]/u.test(c);
}
