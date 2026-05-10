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

// Lazy-load OCR service — silently skipped if unavailable.
let _ocrSvc = null;
async function getOcrService() {
    if (_ocrSvc !== null) return _ocrSvc;
    try {
        const mod = await import('../../../services/ocrService.js');
        _ocrSvc = mod.ocrService || null;
    } catch { _ocrSvc = false; }
    return _ocrSvc || null;
}

/** Render a pdf.js page to an ImageBitmap for OCR. */
async function renderPageToBitmap(pdfDoc, pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    const vp = page.getViewport({ scale: 1.5 });
    const canvas = new OffscreenCanvas(Math.round(vp.width), Math.round(vp.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    try { page.cleanup?.(); } catch { /* ignore */ }
    return createImageBitmap(canvas);
}

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

            // Auto-OCR: for pages with no extractable text (scanned PDFs),
            // render to canvas and run tesseract. Silently skipped if the
            // OCR service is unavailable or the canvas render fails.
            const emptyIdxs = pages
                .map((t, i) => (t.trim().length < 5 ? i : -1))
                .filter((i) => i >= 0);
            if (emptyIdxs.length > 0) {
                const ocr = await getOcrService();
                if (ocr) {
                    for (const idx of emptyIdxs) {
                        bar.setMatches({ indexing: true, ocrPage: idx + 1 });
                        try {
                            const bmp = await renderPageToBitmap(pdfDoc, idx + 1);
                            const { text } = await ocr.recognize(bmp);
                            pages[idx] = (text || '').toLowerCase();
                            bmp.close?.();
                        } catch { /* non-fatal */ }
                    }
                }
            }

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
        // Decorate immediately so the user sees the highlight pass on all
        // already-rendered pages, then re-decorate after a beat to catch
        // pages that rendered lazily after the page-jump.
        decorateAllMatches();
        setTimeout(() => decorateAllMatches(), 120);
        setTimeout(() => decorateAllMatches(), 400);
        // Scroll the current match into view.
        setTimeout(() => scrollCurrentIntoView(), 160);
    }

    /**
     * Highlight every search match on every rendered page. The current
     * match (matches[cursor]) gets an `is-current` modifier so the user
     * can see "I am here" while stepping through results — Adobe-style.
     *
     * Mapping cursor → DOM span: matches[] is page-ordered, so the
     * cursor-th match on a page corresponds to the cursor-th *matching
     * span* on that page (in text-layer DOM order). For PDFs where
     * pdf.js reorders text-layer items vs reading order this can drift
     * by ±1, but it's stable for the common case.
     */
    function decorateAllMatches() {
        clearMatchHighlights();
        if (!stage || !matches.length) return;
        const q = bar.getQuery();
        if (!q) return;
        const flags = bar.getFlags();
        const re = new RegExp(escapeRe(q), flags.caseSensitive ? 'g' : 'gi');
        const currentMatch = matches[cursor];

        // Index of the current match within its own page's match list.
        const cursorOnPage = currentMatch
            ? matches.slice(0, cursor).filter((m) => m.page === currentMatch.page).length
            : -1;

        const pageEls = stage.querySelectorAll('.cx-page');
        const matchedPages = new Set(matches.map((m) => m.page));

        for (const pageEl of pageEls) {
            const dataPage = pageEl.dataset?.page
                || pageEl.closest?.('[data-page]')?.dataset?.page;
            const num = dataPage ? Number(dataPage) : null;
            if (!num || !matchedPages.has(num)) continue;
            const layer = pageEl.querySelector('.cx-text-layer');
            if (!layer) continue;

            let spanHitIndex = 0;
            for (const span of layer.querySelectorAll('span')) {
                if (!span.textContent) continue;
                re.lastIndex = 0;
                if (!re.test(span.textContent)) continue;
                span.classList.add('cx-find-match');
                if (currentMatch && num === currentMatch.page && spanHitIndex === cursorOnPage) {
                    span.classList.add('is-current');
                }
                spanHitIndex++;
            }
        }
    }

    function scrollCurrentIntoView() {
        const cur = stage?.querySelector('.cx-text-layer span.cx-find-match.is-current');
        if (!cur) return;
        try {
            cur.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } catch { /* ignore — older browsers */ }
    }

    function clearMatchHighlights() {
        if (!stage) return;
        const marks = stage.querySelectorAll('.cx-find-match');
        marks.forEach((m) => m.classList.remove('cx-find-match', 'is-current'));
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
        /** Re-apply highlights — called by codex after lazy page renders. */
        redecorate: () => decorateAllMatches(),
    };
}

function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
