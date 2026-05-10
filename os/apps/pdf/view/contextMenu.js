/**
 * pdf/view/contextMenu.js — PDF-aware right-click menu.
 *
 * Five menu kinds are emitted by `classifyTarget`:
 *   - 'selection' — text was selected before right-clicking
 *   - 'annotation' — right-click on an existing highlight / note
 *   - 'link'       — right-click on a pdf.js link annotation
 *   - 'page'       — right-click on blank page area
 *   - 'shell'      — outside the stage (caller decides)
 *
 * Each menu kind dispatches via callbacks; the menu module itself
 * doesn't know about pdf.js or storage.
 */

import { el } from '../../../utils/dom.js';
import { NOTE_COLORS } from '../engine/notes.js';

const COLOR_LABELS = {
    accent: 'Teal', warm: 'Amber', rose: 'Rose',
    violet: 'Violet', cool: 'Blue',
};

/**
 * Classify a contextmenu event target inside the PDF stage.
 *
 * @param {object} args
 * @param {Event} args.event
 * @param {HTMLElement} args.stage
 * @param {() => {text:string, page:number}|null} args.getSelection
 * @returns {{kind: string, payload?: object}}
 */
export function classifyTarget({ event, stage, getSelection } = {}) {
    if (!event || !stage) return { kind: 'shell' };
    const target = event.target;

    // Selection wins over anything else when there's selected text.
    const sel = getSelection?.();
    if (sel?.text && sel.text.trim().length > 0) {
        return { kind: 'selection', payload: sel };
    }

    // Existing annotation? walk up to find a marker.
    const note = target.closest?.('.cx-note-pip');
    if (note) {
        const id = Number(note.dataset.noteId);
        return { kind: 'annotation', payload: { kind: 'note', id } };
    }
    const hl = target.closest?.('.cx-text-layer span.cx-hl, .cx-text-layer span.cx-hl-warm, .cx-text-layer span.cx-hl-rose, .cx-text-layer span.cx-hl-violet, .cx-text-layer span.cx-hl-cool');
    if (hl) {
        return { kind: 'annotation', payload: { kind: 'highlight', element: hl, text: hl.textContent } };
    }

    // Link annotation?
    const link = target.closest?.('.cx-link-rect');
    if (link) {
        return {
            kind: 'link',
            payload: {
                href: link.getAttribute('href'),
                title: link.getAttribute('title') || '',
            },
        };
    }

    // Blank page area inside the stage.
    if (stage.contains(target)) {
        const pageEl = target.closest?.('.cx-page');
        const pageNum = pageEl?.closest?.('[data-page]')?.dataset?.page
            || pageEl?.dataset?.page;
        const rect = pageEl?.getBoundingClientRect();
        return {
            kind: 'page',
            payload: {
                page: pageNum ? Number(pageNum) : null,
                pageEl,
                clientX: event.clientX,
                clientY: event.clientY,
                pageRect: rect,
            },
        };
    }
    return { kind: 'shell' };
}

/**
 * Build the menu controller. `show(event)` opens; menu auto-dismisses
 * on outside click + Escape. Caller wires action callbacks.
 */
export function buildContextMenu({
    stage, getSelection,
    onCopy, onCopyLink, onOpenLink, onSearchSelection, onSearchWeb,
    onHighlight, onUnderline, onStrike, onAddNote, onSendToNotes,
    onCalc, onCite, onBookmark,
    onChangeAnnotationColor, onDeleteAnnotation, onEditNote,
    onJumpToPage, onRotatePage, onFitWidth, onFitPage, onCopyPageText,
    onAddNoteAtPoint,
} = {}) {
    let menuEl = null;

    function show(event) {
        const { kind, payload } = classifyTarget({ event, stage, getSelection });
        if (kind === 'shell') return false;
        event.preventDefault();
        event.stopPropagation();
        close();

        menuEl = buildMenu(kind, payload);
        positionAt(menuEl, event.clientX, event.clientY);
        document.body.appendChild(menuEl);
        document.addEventListener('mousedown', onOutside, true);
        document.addEventListener('keydown', onEsc, true);
        document.addEventListener('scroll', onScroll, true);
        return true;
    }

    function close() {
        if (!menuEl) return;
        menuEl.remove();
        menuEl = null;
        document.removeEventListener('mousedown', onOutside, true);
        document.removeEventListener('keydown', onEsc, true);
        document.removeEventListener('scroll', onScroll, true);
    }

    function onOutside(e) { if (menuEl && !menuEl.contains(e.target)) close(); }
    function onEsc(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    function onScroll() { close(); }

    function positionAt(menu, x, y) {
        menu.style.position = 'fixed';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        // Defer measurement until DOM-attached for clamp.
        requestAnimationFrame(() => {
            const r = menu.getBoundingClientRect();
            const maxX = window.innerWidth - r.width - 8;
            const maxY = window.innerHeight - r.height - 8;
            if (r.right > window.innerWidth - 8) menu.style.left = `${Math.max(8, maxX)}px`;
            if (r.bottom > window.innerHeight - 8) menu.style.top = `${Math.max(8, maxY)}px`;
        });
    }

    // ── Menu builders ─────────────────────────────────────────

    function buildMenu(kind, payload) {
        const root = el('div', { class: 'cx-ctx-menu', role: 'menu' });
        if (kind === 'selection') buildSelectionMenu(root, payload);
        else if (kind === 'annotation') buildAnnotationMenu(root, payload);
        else if (kind === 'link') buildLinkMenu(root, payload);
        else if (kind === 'page') buildPageMenu(root, payload);
        return root;
    }

    function buildSelectionMenu(root, payload) {
        addItem(root, 'Copy', () => onCopy?.(payload));
        addItem(root, 'Copy citation', () => onCite?.(payload));
        addSep(root);
        addColorPicker(root, 'Highlight', (c) => onHighlight?.(payload, c));
        addItem(root, 'Add note here', () => onAddNote?.(payload));
        addSep(root);
        addItem(root, 'Send to Notes', () => onSendToNotes?.(payload), { primary: true });
        const numeric = /^[\s\d.,+\-*/()×÷^%]+$/.test(payload?.text || '');
        if (numeric) addItem(root, 'Calc', () => onCalc?.(payload));
        addItem(root, 'Bookmark page', () => onBookmark?.(payload));
        addSep(root);
        addItem(root, 'Search inside doc', () => onSearchSelection?.(payload));
        addItem(root, 'Search web', () => onSearchWeb?.(payload));
    }

    function buildAnnotationMenu(root, payload) {
        if (payload?.kind === 'highlight') {
            addItem(root, 'Copy text', () => onCopy?.({ text: payload.text }));
            addColorPicker(root, 'Change color', (c) => onChangeAnnotationColor?.(payload, c));
            addItem(root, 'Delete highlight', () => onDeleteAnnotation?.(payload), { danger: true });
        } else if (payload?.kind === 'note') {
            addItem(root, 'Edit note', () => onEditNote?.(payload));
            addColorPicker(root, 'Change color', (c) => onChangeAnnotationColor?.(payload, c));
            addItem(root, 'Delete note', () => onDeleteAnnotation?.(payload), { danger: true });
        }
    }

    function buildLinkMenu(root, payload) {
        const label = payload?.title || payload?.href || 'Link';
        const truncated = label.length > 50 ? label.slice(0, 50) + '…' : label;
        addItem(root, 'Open link', () => onOpenLink?.(payload));
        addItem(root, 'Copy link', () => onCopyLink?.(payload));
        addSep(root);
        addItem(root, truncated, null, { disabled: true, dim: true });
    }

    function buildPageMenu(root, payload) {
        addItem(root, 'Add note here', () => onAddNoteAtPoint?.(payload));
        addItem(root, 'Bookmark this page', () => onBookmark?.({ page: payload?.page }));
        addItem(root, 'Go to page…', () => onJumpToPage?.(null));
        addSep(root);
        addItem(root, 'Rotate page right', () => onRotatePage?.(1));
        addItem(root, 'Rotate page left', () => onRotatePage?.(-1));
        addSep(root);
        addItem(root, 'Fit width', () => onFitWidth?.());
        addItem(root, 'Fit page', () => onFitPage?.());
        addSep(root);
        addItem(root, 'Copy page text', () => onCopyPageText?.(payload));
    }

    function addItem(root, label, fn, opts = {}) {
        const cls = ['cx-ctx-item'];
        if (opts.primary) cls.push('is-primary');
        if (opts.danger) cls.push('is-danger');
        if (opts.dim) cls.push('is-dim');
        if (opts.disabled) cls.push('is-disabled');
        const it = el('button', {
            type: 'button',
            class: cls.join(' '),
            role: 'menuitem',
            ...(opts.disabled ? { disabled: 'true' } : {}),
        }, label);
        if (!opts.disabled && fn) {
            it.addEventListener('click', () => { close(); fn(); });
        }
        root.appendChild(it);
    }

    function addSep(root) {
        root.appendChild(el('div', { class: 'cx-ctx-sep' }));
    }

    function addColorPicker(root, label, onPick) {
        const wrap = el('div', { class: 'cx-ctx-color-row' });
        wrap.appendChild(el('span', { class: 'cx-ctx-color-label' }, label));
        const swatches = el('div', { class: 'cx-ctx-color-swatches' });
        for (const c of NOTE_COLORS) {
            const s = el('button', {
                type: 'button',
                class: `cx-ctx-color-swatch cx-ctx-swatch-${c}`,
                title: COLOR_LABELS[c] || c,
                'aria-label': `${label} in ${COLOR_LABELS[c] || c}`,
                onclick: () => { close(); onPick?.(c); },
            });
            swatches.appendChild(s);
        }
        wrap.appendChild(swatches);
        root.appendChild(wrap);
    }

    return { show, close };
}
