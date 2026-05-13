/**
 * pdf/v3/ops/searchController.js — orchestrates in-doc search across
 * all pages of the open PDF.
 *
 * Owns:
 *   - The per-page pageTextIndex cache (built on demand from
 *     pdfPage.getTextContent()).
 *   - The current query + result list (flat across pages).
 *   - The cursor (current match index).
 *
 * Emits via callbacks: onResults({matches, total}), onCursor({idx, match}).
 * The reader wires UI to these to update the find-bar counter and
 * scroll-into-view the current match.
 *
 * Target size: ≤ 250 lines.
 */

import { buildPageTextIndex } from '../select/pageTextIndex.js';
import { searchInIndex } from '../select/textSearch.js';

export function createSearchController({
  getPdfDoc,
  onResults,
  onCursor,
} = {}) {
  const indexCache = new Map();   // page → pageTextIndex
  let matches = [];                // [{page, charStart, charEnd}]
  let cursor = -1;                 // current match index (-1 = no current)
  let activeQuery = '';
  let opts = { caseSensitive: false, wholeWord: false };
  let inFlight = null;             // promise of the in-flight search

  async function getOrBuildIndex(page) {
    if (indexCache.has(page)) return indexCache.get(page);
    const pdfDoc = await getPdfDoc?.();
    if (!pdfDoc) return null;
    try {
      const pdfPage = await pdfDoc.getPage(page);
      const tc = await pdfPage.getTextContent({ includeMarkedContent: false });
      const idx = buildPageTextIndex(tc);
      indexCache.set(page, idx);
      return idx;
    } catch (e) {
      indexCache.set(page, { flat: '', spans: [] });
      return indexCache.get(page);
    }
  }

  /**
   * Run a search across all pages. Streams partial results: emits
   * onResults() periodically as more pages complete, so the find-bar
   * counter can update incrementally on huge docs.
   */
  async function search(query, searchOpts = {}) {
    activeQuery = String(query || '');
    opts = { caseSensitive: false, wholeWord: false, ...searchOpts };
    if (!activeQuery) {
      matches = [];
      cursor = -1;
      onResults?.({ matches: [], total: 0, done: true });
      onCursor?.({ idx: -1, match: null });
      return;
    }
    const pdfDoc = await getPdfDoc?.();
    if (!pdfDoc) {
      matches = [];
      cursor = -1;
      onResults?.({ matches: [], total: 0, done: true });
      return;
    }
    const total = pdfDoc.numPages;
    matches = [];
    cursor = -1;

    // Cancel any prior search.
    const token = Symbol('search');
    inFlight = token;

    // Iterate pages sequentially. Yield every ~4 pages so the UI
    // stays responsive on large docs.
    const BATCH = 4;
    for (let p = 1; p <= total; p++) {
      if (inFlight !== token) return;
      const idx = await getOrBuildIndex(p);
      if (!idx) continue;
      const pageMatches = searchInIndex(idx, activeQuery, opts);
      for (const m of pageMatches) {
        matches.push({ page: p, charStart: m.charStart, charEnd: m.charEnd });
      }
      if (p % BATCH === 0) {
        onResults?.({ matches: matches.slice(), total: p, done: false });
        // Yield to the event loop.
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    if (inFlight !== token) return;
    onResults?.({ matches: matches.slice(), total, done: true });
    if (matches.length > 0) {
      cursor = 0;
      onCursor?.({ idx: 0, match: matches[0] });
    } else {
      onCursor?.({ idx: -1, match: null });
    }
  }

  function step(delta) {
    if (matches.length === 0) {
      onCursor?.({ idx: -1, match: null });
      return null;
    }
    cursor = (cursor + delta + matches.length) % matches.length;
    const m = matches[cursor];
    onCursor?.({ idx: cursor, match: m });
    return m;
  }

  function clear() {
    activeQuery = '';
    matches = [];
    cursor = -1;
    inFlight = null;
    onResults?.({ matches: [], total: 0, done: true });
    onCursor?.({ idx: -1, match: null });
  }

  function reset() {
    indexCache.clear();
    clear();
  }

  function matchesOnPage(page) {
    return matches.filter((m) => m.page === page);
  }

  function getCurrent() {
    if (cursor < 0 || cursor >= matches.length) return null;
    return matches[cursor];
  }

  function getQuery() { return activeQuery; }

  return {
    search, step, clear, reset,
    matchesOnPage, getCurrent, getQuery,
    getMatchCount: () => matches.length,
    getCursorIdx: () => cursor,
  };
}
