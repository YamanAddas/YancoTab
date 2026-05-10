/**
 * pdf/codexSelection.js — selection-handling helpers for codex.js.
 *
 * Owns the floating selection-menu rect resolution + clipboard +
 * quote/citation/calc/highlight/bookmark actions. Pure factory:
 * codex.js wires it once at construction and gets a `bind()` API
 * that takes the current state by closure.
 *
 * Extracted from codex.js to keep the orchestrator under the 500-line
 * cap.
 */

import { evaluate, looksNumeric, format as formatCalc } from './engine/inlineCalc.js';
import { formatQuote, formatQuoteMarkdown } from './engine/quote.js';
import { applyHighlights } from './view/applyHighlights.js';

export function createSelectionController({
    stage, selMenu,
    onAddBookmark, onAddHighlight, onSendToNotes, onToast,
    getDocId, getDocTitle, getCurrentPage, getHighlightsOnPage,
    onChangeQuotes, onChangeCalc, onRefreshInfo,
} = {}) {
    let lastSelection = { text: '', rect: null, page: null };
    let calcResult = null;
    let todaysQuotes = [];

    function getRectInsideStage() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
        const range = sel.getRangeAt(0);
        if (!range || range.collapsed) return null;
        const ancestor = range.commonAncestorContainer;
        const node = ancestor.nodeType === 1 ? ancestor : ancestor.parentElement;
        if (!node || !stage.contains(node)) return null;
        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) return null;
        return { rect, text: sel.toString(), node };
    }

    function pageElementOf(node) {
        let p = node;
        while (p && p !== stage) {
            if (p.classList?.contains('cx-page')) return p;
            p = p.parentElement;
        }
        return null;
    }

    function pageNumberFromElement(pageEl) {
        if (!pageEl) return null;
        const dataPage = pageEl.closest?.('[data-page]')?.dataset?.page;
        if (dataPage) return Number(dataPage);
        const idx = [...stage.querySelectorAll('.cx-page')].indexOf(pageEl);
        if (idx < 0) return null;
        return idx === 0 ? getCurrentPage() : getCurrentPage() + 1;
    }

    function refreshSelection() {
        const s = getRectInsideStage();
        if (!s) {
            lastSelection = { text: '', rect: null, page: null };
            calcResult = null;
            selMenu.hide();
            onRefreshInfo?.();
            return;
        }
        lastSelection = {
            text: s.text, rect: s.rect,
            page: pageNumberFromElement(pageElementOf(s.node)),
        };
        selMenu.setCalcAvailable(looksNumeric(s.text));
        selMenu.show(s.rect);
        calcResult = null;
        onChangeCalc?.(null);
        onRefreshInfo?.();
    }

    async function copyToClipboard(text) {
        try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    }

    function copy() {
        if (!lastSelection.text) return;
        copyToClipboard(formatQuote({
            text: lastSelection.text, docTitle: getDocTitle(), page: lastSelection.page,
        }));
        onToast?.({ message: 'Quote copied', type: 'success' });
    }

    function copyCitation() {
        if (!lastSelection.text) return;
        copyToClipboard(`— ${getDocTitle().replace(/\.pdf$/i, '')}, p.${lastSelection.page || '?'}`);
        onToast?.({ message: 'Citation copied', type: 'success' });
    }

    function sendToNotes() {
        if (!lastSelection.text) return;
        const md = formatQuoteMarkdown({
            text: lastSelection.text, docTitle: getDocTitle(), page: lastSelection.page,
        });
        copyToClipboard(md);
        todaysQuotes.unshift({
            text: lastSelection.text.slice(0, 240),
            docTitle: getDocTitle(), page: lastSelection.page, ts: Date.now(),
        });
        todaysQuotes = todaysQuotes.slice(0, 32);
        onChangeQuotes?.(todaysQuotes);
        onSendToNotes?.(md);
        onRefreshInfo?.();
        onToast?.({ message: 'Quote copied — paste into Notes', type: 'success' });
    }

    function evalCalc() {
        if (!lastSelection.text) return;
        const r = evaluate(lastSelection.text);
        if (!r.ok) {
            onToast?.({ message: r.reason || 'Not a valid expression', type: 'error' });
            calcResult = null;
        } else {
            calcResult = { ...r, formattedValue: formatCalc(r.value) };
        }
        onChangeCalc?.(calcResult);
        onRefreshInfo?.();
    }

    function bookmark() {
        const docId = getDocId();
        if (!docId || !Number.isFinite(lastSelection.page)) return;
        const label = lastSelection.text
            ? lastSelection.text.slice(0, 80)
            : `Page ${lastSelection.page}`;
        onAddBookmark?.({ docId, page: lastSelection.page, label, color: 'accent' });
        onToast?.({ message: 'Bookmark added', type: 'success' });
    }

    function highlight() {
        const docId = getDocId();
        if (!docId || !Number.isFinite(lastSelection.page) || !lastSelection.text) return;
        onAddHighlight?.({ docId, page: lastSelection.page, text: lastSelection.text, color: 'accent' });
        onToast?.({ message: 'Highlight saved', type: 'success' });
        applyHighlightsToVisiblePages();
    }

    function applyHighlightsToVisiblePages() {
        const docId = getDocId();
        if (!docId) return;
        const pages = stage.querySelectorAll('.cx-page');
        pages.forEach((pageEl) => {
            const dataPage = pageEl.closest('[data-page]')?.dataset?.page;
            const pageNum = dataPage ? Number(dataPage) : pageNumberFromElement(pageEl);
            const textLayer = pageEl.querySelector('.cx-text-layer');
            if (!textLayer || !pageNum) return;
            const highlights = getHighlightsOnPage?.(docId, pageNum) || [];
            applyHighlights(textLayer, highlights);
        });
    }

    function setQuotes(arr) { todaysQuotes = arr || []; onChangeQuotes?.(todaysQuotes); }
    function getQuotes() { return todaysQuotes; }
    function getLastSelection() { return lastSelection; }
    function getCalc() { return calcResult; }

    document.addEventListener('selectionchange', () => {
        requestAnimationFrame(refreshSelection);
    });

    return {
        refreshSelection,
        copy, copyCitation, sendToNotes, evalCalc, bookmark, highlight,
        applyHighlightsToVisiblePages,
        setQuotes, getQuotes,
        getLastSelection, getCalc,
    };
}
