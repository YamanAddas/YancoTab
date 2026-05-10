/**
 * pdf/codexSearch.js — wires the find-bar to the search engine and
 * the live text-layer.
 *
 * Owns:
 *   - searchBar UI lifecycle (open / close)
 *   - per-doc text-index building (lazy on first search; cached in
 *     pdfStore.searchIndex if a store is provided)
 *   - match cursor + page navigation
 *   - transient match-highlighting in the live text layer
 *
 * Caller wires this into the reader bar's "Search" button and the
 * Ctrl/Cmd+F keyboard shortcut.
 */

import { buildSearchBar } from './view/searchBar.js';
import {
    findMatches, startCursorIndex, stepCursor, extractText,
} from './engine/search.js';

export function createSearchController({
    stage, pdfStore,
    getPdfDoc, getDocId, getCurrentPage,
    onJumpToPage, onToast,
} = {}) {
    let pages = [];               // lower-cased flat text per page
    let pagesIndexedFor = null;   // docId we built `pages` for
    let matches = [];
    let cursor = 0;
    let lastQuery = '';
    let isIndexing = false;

    const bar = buildSearchBar({
        onChange: (q) => onQueryChange(q),
        onPrev: () => stepMatch(-1),
        onNext: () => stepMatch(1),
        onClose: () => close(),
        onCaseToggle: () => recomputeMatches(),
        onWholeToggle: () => recomputeMatches(),
    });

    async function ensureIndex() {
        const docId = getDocId();
        const pdfDoc = getPdfDoc();
        if (!docId || !pdfDoc) return false;
        if (pagesIndexedFor === docId && pages.length) return true;

        // Try cache first.
        if (pdfStore?.getSearchIndex) {
            try {
                const cached = await pdfStore.getSearchIndex(docId);
                if (cached?.pages?.length === pdfDoc.numPages) {
                    pages = cached.pages;
                    pagesIndexedFor = docId;
                    return true;
                }
            } catch { /* ignore */ }
        }

        // Build.
        isIndexing = true;
        bar.setMatches({ indexing: true });
        try {
            pages = await extractText(pdfDoc);
            pagesIndexedFor = docId;
            if (pdfStore?.saveSearchIndex) {
                try { await pdfStore.saveSearchIndex(docId, pages); }
                catch { /* ignore */ }
            }
            return true;
        } catch {
            return false;
        } finally {
            isIndexing = false;
        }
    }

    async function open(initialQuery) {
        const ok = await ensureIndex();
        bar.open(initialQuery || lastQuery);
        if (!ok) {
            onToast?.({ message: 'Could not index this PDF for search', type: 'error' });
            return;
        }
        if (initialQuery || lastQuery) recomputeMatches();
    }

    function close() {
        bar.close();
        clearMatchHighlights();
    }

    function isOpen() {
        return bar.root.style.display !== 'none';
    }

    function onQueryChange(q) {
        lastQuery = q || '';
        recomputeMatches();
    }

    function recomputeMatches() {
        const q = bar.getQuery();
        if (!q || isIndexing) {
            matches = [];
            cursor = 0;
            bar.setMatches({ total: 0, current: 0 });
            clearMatchHighlights();
            return;
        }
        const flags = bar.getFlags();
        // For case-sensitive search the cached pages are lowercased,
        // so we need the original text. For now we redo the search
        // case-insensitively if pages were lowercased; honor flag
        // best-effort.
        const opts = { query: flags.caseSensitive ? q : q.toLowerCase(), wholeWord: flags.wholeWord };
        matches = findMatches(pages, opts);
        cursor = startCursorIndex(matches, getCurrentPage());
        bar.setMatches({ total: matches.length, current: cursor });
        if (matches.length) jumpToMatch(cursor);
        else clearMatchHighlights();
    }

    function stepMatch(dir) {
        if (!matches.length) return;
        cursor = stepCursor(cursor, matches, dir);
        bar.setMatches({ total: matches.length, current: cursor });
        jumpToMatch(cursor);
    }

    function jumpToMatch(idx) {
        const m = matches[idx];
        if (!m) return;
        if (m.page !== getCurrentPage()) onJumpToPage?.(m.page);
        // Highlight after a short delay so the page render finishes.
        setTimeout(() => decorateCurrent(m), 80);
    }

    /** Wrap matching tokens in <mark class="cx-find-match"> for the current page. */
    function decorateCurrent(match) {
        clearMatchHighlights();
        if (!match || !stage) return;
        const pageEls = stage.querySelectorAll('.cx-page');
        for (const pageEl of pageEls) {
            const dataPage = pageEl.closest?.('[data-page]')?.dataset?.page;
            const num = dataPage ? Number(dataPage) : null;
            if (num !== match.page) continue;
            const layer = pageEl.querySelector('.cx-text-layer');
            if (!layer) continue;
            const q = bar.getQuery();
            if (!q) return;
            const flags = bar.getFlags();
            const re = new RegExp(escapeRe(q), flags.caseSensitive ? 'g' : 'gi');
            for (const span of layer.querySelectorAll('span')) {
                if (!span.textContent) continue;
                if (re.test(span.textContent)) {
                    span.classList.add('cx-find-match');
                }
                re.lastIndex = 0;
            }
            return;
        }
    }

    function clearMatchHighlights() {
        if (!stage) return;
        const marks = stage.querySelectorAll('.cx-find-match');
        marks.forEach((m) => m.classList.remove('cx-find-match'));
    }

    /** Reset the cached index after a doc change. */
    function reset() {
        pages = [];
        pagesIndexedFor = null;
        matches = [];
        cursor = 0;
        lastQuery = '';
    }

    return {
        bar,
        open, close, isOpen,
        toggle: (q) => isOpen() ? close() : open(q),
        reset,
        recompute: () => recomputeMatches(),
    };
}

function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
