/**
 * pdf/v3/chrome/pdfContextMenu.js — PDF-aware right-click menu.
 *
 * Two flavors:
 *   - 'selection' — text is selected → Copy, Highlight, Add note,
 *                   Search inside doc, Search web.
 *   - 'page'      — clicked on blank page area → Add note here,
 *                   Copy page text, Go to page, Rotate, Bookmark.
 *
 * Caller provides:
 *   - getSelection()  → { text, page } | null
 *   - resolvePage(ev) → { page, pageEl, clientX, clientY, fx, fy } | null
 *     (fx, fy are 0..1 fractional coords inside the page)
 *
 * Action callbacks (any may be omitted; missing items are skipped):
 *   onHighlight(selection)
 *   onNoteOnSelection(selection)
 *   onCopy(text)
 *   onSearchInDoc(text)
 *   onSearchWeb(text)
 *   onAddNoteAtPoint({ page, fx, fy, clientX, clientY })
 *   onCopyPageText({ page })
 *   onBookmarkPage({ page })
 *   onGoToPage()
 *
 * Mounts on document.body. Carries its own theme rules.
 *
 * Target size: ≤ 200 lines.
 */

import { el } from '../../../../utils/dom.js';

export function buildPdfContextMenu({
  stage,
  getSelection,
  resolvePage,
  onHighlight, onNoteOnSelection,
  onCopy, onSearchInDoc, onSearchWeb,
  onAddNoteAtPoint, onCopyPageText,
  onBookmarkPage, onGoToPage,
} = {}) {
  if (!stage) throw new Error('stage required');

  let menuEl = null;

  function show(event) {
    close();
    const sel = getSelection?.();
    let kind = 'page';
    let payload = null;
    if (sel && sel.text && sel.text.trim().length > 0) {
      kind = 'selection';
      payload = sel;
    } else {
      const p = resolvePage?.(event);
      if (!p) return false;
      payload = p;
    }
    event.preventDefault();
    event.stopPropagation();

    menuEl = buildMenu(kind, payload);
    document.body.appendChild(menuEl);
    positionAt(menuEl, event.clientX, event.clientY);
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onEsc, true);
    stage.addEventListener('scroll', close, true);
    return true;
  }

  function close() {
    if (!menuEl) return;
    menuEl.remove();
    menuEl = null;
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onEsc, true);
    stage.removeEventListener('scroll', close, true);
  }
  function onOutside(e) { if (menuEl && !menuEl.contains(e.target)) close(); }
  function onEsc(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }

  function positionAt(menu, x, y) {
    menu.style.position = 'fixed';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      const maxX = window.innerWidth - r.width - 8;
      const maxY = window.innerHeight - r.height - 8;
      if (r.right > window.innerWidth - 8) menu.style.left = `${Math.max(8, maxX)}px`;
      if (r.bottom > window.innerHeight - 8) menu.style.top = `${Math.max(8, maxY)}px`;
    });
  }

  function buildMenu(kind, payload) {
    const root = el('div', { class: 'pdf-ctx-menu', role: 'menu' });
    if (kind === 'selection') buildSelectionMenu(root, payload);
    else buildPageMenu(root, payload);
    return root;
  }

  function buildSelectionMenu(root, sel) {
    addItem(root, 'Copy', onCopy ? () => onCopy(sel.text) : null);
    addSep(root);
    addItem(root, 'Highlight', onHighlight ? () => onHighlight(sel) : null, { primary: true });
    addItem(root, 'Add note to selection', onNoteOnSelection ? () => onNoteOnSelection(sel) : null);
    addSep(root);
    addItem(root, 'Search inside document', onSearchInDoc ? () => onSearchInDoc(sel.text) : null);
    addItem(root, 'Search the web', onSearchWeb ? () => onSearchWeb(sel.text) : null);
  }

  function buildPageMenu(root, payload) {
    addItem(root, 'Add note here', onAddNoteAtPoint ? () => onAddNoteAtPoint(payload) : null, { primary: true });
    addSep(root);
    addItem(root, 'Bookmark this page', onBookmarkPage ? () => onBookmarkPage({ page: payload.page }) : null);
    addItem(root, 'Go to page…', onGoToPage ? () => onGoToPage() : null);
    addSep(root);
    addItem(root, 'Copy page text', onCopyPageText ? () => onCopyPageText({ page: payload.page }) : null);
  }

  function addItem(root, label, fn, opts = {}) {
    if (!fn) return;
    const cls = ['pdf-ctx-item'];
    if (opts.primary) cls.push('is-primary');
    if (opts.danger) cls.push('is-danger');
    const it = el('button', {
      type: 'button',
      class: cls.join(' '),
      role: 'menuitem',
    }, label);
    it.addEventListener('click', () => { close(); fn(); });
    root.appendChild(it);
  }
  function addSep(root) {
    root.appendChild(el('div', { class: 'pdf-ctx-sep' }));
  }

  function destroy() {
    close();
  }

  return { show, close, destroy };
}
