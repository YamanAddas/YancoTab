/**
 * pdf/engine/search.js — per-doc text index + match enumeration.
 *
 * Pure logic + a thin builder that drives pdf.js text extraction.
 * The cache layer lives in pdfStore.searchIndex; this module just
 * builds the array, runs queries against it, and returns matches.
 *
 * Match shape: { page, start, end, text }
 *   start/end are character offsets into the page's flat text string.
 *
 * The find-bar in view/searchBar.js consumes these matches; for
 * visual highlighting we let codex/applyHighlights handle DOM
 * decoration of the live text-layer (transient, distinct from
 * persisted highlights).
 */

const MAX_MATCHES = 1000;

/**
 * Extract every page's flat text via pdf.js. Async generator so the
 * UI can show progress on long docs.
 *
 * @param {object} pdfDoc       pdfjsLib doc
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<string[]>} pages[i-1] = lowercased text of page i
 */
export async function extractText(pdfDoc, onProgress) {
    if (!pdfDoc) return [];
    const out = [];
    const total = pdfDoc.numPages;
    for (let i = 1; i <= total; i++) {
        try {
            const p = await pdfDoc.getPage(i);
            const tc = await p.getTextContent();
            const flat = (tc.items || []).map((x) => (x?.str || '')).join(' ');
            out.push(flat.toLowerCase());
            try { p.cleanup?.(); } catch { /* ignore */ }
        } catch {
            out.push('');
        }
        onProgress?.(i / total);
    }
    return out;
}

/**
 * Build a regex from the user's query + flags.
 *   caseSensitive: keep case as typed (otherwise lowercase both)
 *   wholeWord:     wrap in \b ... \b
 *   The query is escaped — never treat user input as regex.
 */
export function buildMatcher({ query, caseSensitive = false, wholeWord = false } = {}) {
    if (typeof query !== 'string' || !query) return null;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
    const flags = caseSensitive ? 'g' : 'gi';
    try { return new RegExp(pattern, flags); } catch { return null; }
}

/**
 * Run a query across an extracted-text index and return all matches.
 *
 * @param {string[]} pages — extracted text per page (already lowercased
 *                           if caseSensitive=false; pass raw text if true)
 * @param {object} args     { query, caseSensitive, wholeWord, limit? }
 * @returns {Array<{page,start,end,text}>}
 */
export function findMatches(pages, args = {}) {
    const matches = [];
    if (!Array.isArray(pages) || !pages.length) return matches;
    const re = buildMatcher(args);
    if (!re) return matches;
    const limit = Math.max(1, Math.min(MAX_MATCHES, args.limit || MAX_MATCHES));
    for (let i = 0; i < pages.length; i++) {
        const text = pages[i] || '';
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null) {
            matches.push({ page: i + 1, start: m.index, end: m.index + m[0].length, text: m[0] });
            if (matches.length >= limit) return matches;
            if (m.index === re.lastIndex) re.lastIndex++;  // zero-width safety
        }
    }
    return matches;
}

/**
 * Find which match index is closest to the current page (and after).
 * Used to start the cursor sensibly when a fresh query lands.
 */
export function startCursorIndex(matches, currentPage) {
    if (!matches.length) return 0;
    for (let i = 0; i < matches.length; i++) {
        if (matches[i].page >= currentPage) return i;
    }
    return 0;
}

/**
 * Step the match cursor forward / backward, wrapping at the ends.
 */
export function stepCursor(idx, matches, dir) {
    if (!matches.length) return 0;
    const n = matches.length;
    return ((idx + (dir > 0 ? 1 : -1)) % n + n) % n;
}

export const __TEST__ = Object.freeze({ MAX_MATCHES });
