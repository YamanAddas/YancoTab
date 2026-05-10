/**
 * pdf/codexAnnotations.js — annotation orchestration.
 *
 * Bundles the PDF context menu wiring + multi-color highlight palette
 * + sticky-note CRUD + click-to-edit existing highlights. Extracted
 * from codex.js to keep the orchestrator under the 500-line cap.
 *
 * Persistence:
 *   highlights → kernel.storage map (legacy, still active)
 *   notes      → IDB pdfStore.annotations store with kind:'note'
 *
 * Why split the storage tiers: sticky-note bodies can be 2 KB each
 * and there's no upper bound on count; pushing them through
 * chrome.storage.sync would chunk-explode. Highlights stay in the
 * existing kernel.storage map for now (small, syncable).
 */

import { el } from '../../utils/dom.js';
import { buildContextMenu } from './view/contextMenu.js';
import { applyHighlights } from './view/applyHighlights.js';
import { normalizeNote } from './engine/notes.js';

export function createAnnotationsController({
    stage, pdfStore,
    getDocId, getDocTitle, getCurrentPage,
    getSelectionRect,           // returns { text, page, rect } or null
    getHighlightsOnPage,        // (docId, page) → highlights array
    onAddBookmark, onJumpToPage, onAddHighlight, onRemoveHighlight,
    onCopyClipboard, onSendToNotesText, onToast,
    onRotatePage, onFitWidth, onFitPage, onSearchOpen,
} = {}) {
    let notesByPage = new Map();   // page → notes[]   (in-memory cache)
    let activeNoteEditor = null;

    // ── Context menu controller ──
    const ctx = buildContextMenu({
        stage,
        getSelection: getSelectionRect,
        // Selection actions
        onCopy: (payload) => copySelection(payload),
        onCite: (payload) => copyCitation(payload),
        onHighlight: (payload, color) => addHighlight(payload, color),
        onUnderline: (payload, color) => addHighlight(payload, color, 'underline'),
        onStrike:    (payload, color) => addHighlight(payload, color, 'strike'),
        onAddNote: (payload) => createNoteFromSelection(payload),
        onSendToNotes: (payload) => sendToNotes(payload),
        onCalc: (payload) => calcSelection(payload),
        onBookmark: (payload) => bookmarkSelection(payload),
        onSearchSelection: (payload) => onSearchOpen?.(payload?.text),
        onSearchWeb: (payload) => searchWeb(payload?.text),
        // Annotation actions
        onChangeAnnotationColor: (payload, color) => changeAnnotationColor(payload, color),
        onDeleteAnnotation: (payload) => deleteAnnotation(payload),
        onEditNote: (payload) => editNote(payload),
        // Link actions
        onOpenLink: (payload) => openLink(payload),
        onCopyLink: (payload) => onCopyClipboard?.(payload?.href || ''),
        // Page actions
        onJumpToPage: () => promptJump(),
        onRotatePage: (dir) => onRotatePage?.(dir),
        onFitWidth: () => onFitWidth?.(),
        onFitPage: () => onFitPage?.(),
        onCopyPageText: (payload) => copyPageText(payload),
        onAddNoteAtPoint: (payload) => createNoteAtPoint(payload),
    });

    // Bind right-click on the stage. The data-allow-context attr on the
    // stage tells the global mobileShell capture handler to ignore us.
    stage.addEventListener('contextmenu', (e) => { ctx.show(e); }, false);

    // ── Highlight + underline/strike ────────────────────────

    function addHighlight(payload, color = 'accent', kind = 'highlight') {
        const docId = getDocId();
        if (!docId || !payload?.text || !payload?.page) return;
        onAddHighlight?.({ docId, page: payload.page, text: payload.text, color, kind });
        onToast?.({ message: kind === 'highlight' ? 'Highlight saved' : `${capitalize(kind)} saved`, type: 'success' });
        applyHighlightsToVisiblePages();
    }

    function changeAnnotationColor(payload, color) {
        if (payload?.kind === 'highlight' && payload?.text) {
            const docId = getDocId();
            const page = currentPageFromHighlightEl(payload.element) || getCurrentPage();
            // Easiest path: remove + re-add with new color.
            onRemoveHighlight?.({ docId, page, text: payload.text });
            onAddHighlight?.({ docId, page, text: payload.text, color });
            applyHighlightsToVisiblePages();
            return;
        }
        if (payload?.kind === 'note' && Number.isFinite(payload.id)) {
            updateNote(payload.id, { color });
        }
    }

    function deleteAnnotation(payload) {
        if (payload?.kind === 'highlight' && payload?.text) {
            const docId = getDocId();
            const page = currentPageFromHighlightEl(payload.element) || getCurrentPage();
            onRemoveHighlight?.({ docId, page, text: payload.text });
            applyHighlightsToVisiblePages();
            onToast?.({ message: 'Highlight removed', type: 'success' });
            return;
        }
        if (payload?.kind === 'note' && Number.isFinite(payload.id)) {
            removeNote(payload.id);
        }
    }

    function currentPageFromHighlightEl(el) {
        const wrap = el?.closest?.('[data-page]');
        const p = wrap?.dataset?.page;
        return p ? Number(p) : null;
    }

    function applyHighlightsToVisiblePages() {
        const docId = getDocId();
        if (!docId || !stage) return;
        const pages = stage.querySelectorAll('.cx-page');
        pages.forEach((pageEl) => {
            const dataPage = pageEl.closest('[data-page]')?.dataset?.page;
            const num = dataPage ? Number(dataPage) : null;
            const layer = pageEl.querySelector('.cx-text-layer');
            if (!layer || !num) return;
            const hls = getHighlightsOnPage?.(docId, num) || [];
            applyHighlights(layer, hls);
        });
    }

    // ── Selection actions ──

    function copySelection(payload) {
        const text = payload?.text;
        if (!text) return;
        const cite = `— ${getDocTitle().replace(/\.pdf$/i, '')}, p.${payload.page || '?'}`;
        onCopyClipboard?.(`"${text}"\n${cite}`);
        onToast?.({ message: 'Quote copied', type: 'success' });
    }

    function copyCitation(payload) {
        if (!payload) return;
        onCopyClipboard?.(`— ${getDocTitle().replace(/\.pdf$/i, '')}, p.${payload.page || '?'}`);
        onToast?.({ message: 'Citation copied', type: 'success' });
    }

    function sendToNotes(payload) {
        if (!payload?.text) return;
        onSendToNotesText?.(payload);
    }

    function calcSelection(payload) {
        if (!payload?.text) return;
        // Use a tiny eval; Calc engine is more robust but this is just
        // for context-menu shortcut. The selection floater is the real path.
        try {
            const cleaned = String(payload.text)
                .replace(/[,]/g, '')
                .replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**');
            // Only allow digits and operators.
            if (!/^[\d.\s+\-*/()%*]+$/.test(cleaned)) {
                onToast?.({ message: 'Not a valid expression', type: 'error' });
                return;
            }
            const result = Function(`"use strict"; return (${cleaned});`)();
            if (Number.isFinite(result)) {
                onCopyClipboard?.(String(result));
                onToast?.({ message: `= ${result} (copied)`, type: 'success' });
            }
        } catch {
            onToast?.({ message: 'Calc failed', type: 'error' });
        }
    }

    function bookmarkSelection(payload) {
        if (!Number.isFinite(payload?.page)) return;
        const docId = getDocId();
        const label = payload.text ? payload.text.slice(0, 80) : `Page ${payload.page}`;
        onAddBookmark?.({ docId, page: payload.page, label, color: 'accent' });
        onToast?.({ message: 'Bookmark added', type: 'success' });
    }

    function searchWeb(text) {
        if (!text) return;
        const url = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
        try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* ignore */ }
    }

    function openLink(payload) {
        if (!payload?.href || payload.href === '#') return;
        try { window.open(payload.href, '_blank', 'noopener,noreferrer'); } catch { /* ignore */ }
    }

    function promptJump() {
        const max = stage.querySelector('.cx-page-counter')?.dataset?.max;
        const cur = stage.querySelector('.cx-page-counter')?.dataset?.cur || 1;
        const v = window.prompt(`Jump to page (1–${max || '?'})`, String(cur));
        const n = parseInt(v || '', 10);
        if (Number.isFinite(n)) onJumpToPage?.(n);
    }

    function copyPageText(payload) {
        if (!payload?.pageEl) return;
        const layer = payload.pageEl.querySelector('.cx-text-layer');
        if (!layer) return;
        const text = [...layer.querySelectorAll('span')].map((s) => s.textContent).join(' ');
        onCopyClipboard?.(text);
        onToast?.({ message: 'Page text copied', type: 'success' });
    }

    // ── Notes (sticky notes) ──

    async function refreshNotes() {
        if (!pdfStore) return;
        const docId = getDocId();
        if (!docId) return;
        try {
            const list = await pdfStore.listAnnotationsByKind(docId, 'note');
            notesByPage = new Map();
            for (const n of list) {
                if (!notesByPage.has(n.page)) notesByPage.set(n.page, []);
                notesByPage.get(n.page).push(n);
            }
            renderNotePips();
        } catch (e) {
            console.warn('[pdf] notes refresh failed:', e);
        }
    }

    function renderNotePips() {
        if (!stage) return;
        // Strip existing pips first.
        stage.querySelectorAll('.cx-note-pip').forEach((p) => p.remove());
        const pages = stage.querySelectorAll('.cx-page');
        pages.forEach((pageEl) => {
            const num = Number(pageEl.dataset?.page || pageEl.closest('[data-page]')?.dataset?.page);
            if (!Number.isFinite(num)) return;
            const list = notesByPage.get(num) || [];
            for (const n of list) {
                const pip = el('button', {
                    type: 'button',
                    class: `cx-note-pip cx-note-${n.color || 'warm'}`,
                    'data-note-id': String(n.id),
                    title: 'Click to view note',
                    style: { left: `${n.x * 100}%`, top: `${n.y * 100}%` },
                    onclick: (e) => { e.stopPropagation(); openNotePopover(n, pip); },
                }, '✎');
                pageEl.appendChild(pip);
            }
        });
    }

    async function createNoteAtPoint(payload) {
        if (!pdfStore || !payload?.pageEl || !payload?.pageRect || !Number.isFinite(payload.page)) return;
        const docId = getDocId();
        if (!docId) return;
        const x = (payload.clientX - payload.pageRect.left) / payload.pageRect.width;
        const y = (payload.clientY - payload.pageRect.top) / payload.pageRect.height;
        const body = window.prompt('Note text:');
        if (!body) return;
        const note = normalizeNote({ docId, page: payload.page, x, y, body, color: 'warm' });
        if (!note) return;
        try {
            await pdfStore.addAnnotation(docId, note);
            await refreshNotes();
            onToast?.({ message: 'Note added', type: 'success' });
        } catch (e) {
            onToast?.({ message: `Note failed: ${e?.message || e}`, type: 'error' });
        }
    }

    async function createNoteFromSelection(payload) {
        if (!pdfStore || !payload?.page || !payload?.rect) return;
        const docId = getDocId();
        if (!docId) return;
        const pageEl = stage.querySelector(`[data-page="${payload.page}"]`)
            || stage.querySelectorAll('.cx-page')[0];
        if (!pageEl) return;
        const r = pageEl.getBoundingClientRect();
        const x = (payload.rect.left + payload.rect.width / 2 - r.left) / r.width;
        const y = (payload.rect.top - r.top) / r.height;
        const body = window.prompt('Note text:', payload.text?.slice(0, 80));
        if (!body) return;
        const note = normalizeNote({ docId, page: payload.page, x, y, body, color: 'warm' });
        if (!note) return;
        try {
            await pdfStore.addAnnotation(docId, note);
            await refreshNotes();
            onToast?.({ message: 'Note added', type: 'success' });
        } catch (e) {
            onToast?.({ message: `Note failed: ${e?.message || e}`, type: 'error' });
        }
    }

    function openNotePopover(note, anchor) {
        closeNotePopover();
        const popover = el('div', { class: 'cx-note-popover', role: 'dialog' });
        popover.appendChild(el('div', { class: 'cx-note-popover-h' }, `Page ${note.page}`));
        const ta = el('textarea', { class: 'cx-note-popover-body', maxlength: '2000' });
        ta.value = note.body;
        popover.appendChild(ta);
        const actions = el('div', { class: 'cx-note-popover-actions' });
        actions.appendChild(el('button', {
            type: 'button', class: 'cx-note-btn',
            onclick: async () => {
                await updateNote(note.id, { body: ta.value });
                closeNotePopover();
            },
        }, 'Save'));
        actions.appendChild(el('button', {
            type: 'button', class: 'cx-note-btn is-danger',
            onclick: async () => {
                await removeNote(note.id);
                closeNotePopover();
            },
        }, 'Delete'));
        actions.appendChild(el('button', {
            type: 'button', class: 'cx-note-btn',
            onclick: () => closeNotePopover(),
        }, 'Close'));
        popover.appendChild(actions);

        const r = anchor.getBoundingClientRect();
        popover.style.position = 'fixed';
        popover.style.left = `${Math.round(r.right + 6)}px`;
        popover.style.top  = `${Math.round(r.top)}px`;
        document.body.appendChild(popover);
        requestAnimationFrame(() => {
            const pr = popover.getBoundingClientRect();
            if (pr.right > window.innerWidth - 8) popover.style.left = `${window.innerWidth - pr.width - 8}px`;
            if (pr.bottom > window.innerHeight - 8) popover.style.top  = `${window.innerHeight - pr.height - 8}px`;
        });
        ta.focus();
        activeNoteEditor = popover;
        document.addEventListener('mousedown', onPopoverOutside, true);
        document.addEventListener('keydown', onPopoverEsc, true);
    }

    function closeNotePopover() {
        if (!activeNoteEditor) return;
        activeNoteEditor.remove();
        activeNoteEditor = null;
        document.removeEventListener('mousedown', onPopoverOutside, true);
        document.removeEventListener('keydown', onPopoverEsc, true);
    }
    function onPopoverOutside(e) {
        if (!activeNoteEditor) return;
        if (activeNoteEditor.contains(e.target) || e.target.closest('.cx-note-pip')) return;
        closeNotePopover();
    }
    function onPopoverEsc(e) {
        if (e.key === 'Escape') { e.preventDefault(); closeNotePopover(); }
    }

    function editNote(payload) {
        const list = [...notesByPage.values()].flat();
        const note = list.find((n) => n.id === payload?.id);
        if (!note) return;
        const pip = stage.querySelector(`.cx-note-pip[data-note-id="${note.id}"]`);
        if (pip) openNotePopover(note, pip);
    }

    async function updateNote(id, patch) {
        if (!pdfStore) return;
        try {
            await pdfStore.updateAnnotation(id, patch);
            await refreshNotes();
        } catch (e) {
            onToast?.({ message: `Note update failed: ${e?.message || e}`, type: 'error' });
        }
    }

    async function removeNote(id) {
        if (!pdfStore) return;
        try {
            await pdfStore.deleteAnnotation(id);
            await refreshNotes();
            onToast?.({ message: 'Note deleted', type: 'success' });
        } catch (e) {
            onToast?.({ message: `Note delete failed: ${e?.message || e}`, type: 'error' });
        }
    }

    function reset() {
        notesByPage = new Map();
        closeNotePopover();
        ctx.close();
    }

    function capitalize(s) { return String(s || '').replace(/^./, (c) => c.toUpperCase()); }

    return {
        refreshNotes,
        renderNotePips,
        applyHighlightsToVisiblePages,
        reset,
    };
}
