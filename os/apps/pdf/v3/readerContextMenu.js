/**
 * pdf/v3/readerContextMenu.js — wires the PDF right-click menu to
 * reader state + actions.
 *
 * Owns the buildPdfContextMenu instance and routes every menu action
 * through callbacks (highlight, note-on-selection, copy, search,
 * place-note, copy-page-text, bookmark-page, go-to-page).
 *
 * Extracted from reader.js to keep the orchestrator under the 500-line
 * cap.
 *
 * Target size: ≤ 150 lines.
 */

import { buildPdfContextMenu } from './chrome/pdfContextMenu.js';
import { addBookmark } from '../persistence.js';

export function createContextMenuController({
  stage, kernel, onToast,
  selectionLayer,
  tools,
  searchBar, search, toolbar,
  sidebar,
  getColor,
  getPdfDoc, getDocId,
  getCurrentPage, goToPage,
  commitHighlight,
} = {}) {
  if (!stage) throw new Error('stage required');

  const menu = buildPdfContextMenu({
    stage,
    getSelection: () => {
      const s = selectionLayer.getLastSelection();
      if (!s || s.multiPage) return null;
      if (!s.text || !s.text.trim()) return null;
      return { text: s.text, page: s.page };
    },
    resolvePage: (ev) => {
      const pageEl = ev.target?.closest?.('.pdf-page');
      if (!pageEl) return null;
      const page = Number(pageEl.dataset.page);
      if (!Number.isFinite(page)) return null;
      const r = pageEl.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      const fx = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      const fy = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
      return {
        page, pageEl,
        clientX: ev.clientX, clientY: ev.clientY,
        fx, fy,
      };
    },
    onHighlight: () => commitHighlight(getColor?.() || 'yellow'),
    onNoteOnSelection: async () => {
      const sr = selectionLayer.getSelectionRect();
      const rect = sr ? {
        left: sr.left, top: sr.top,
        right: sr.right, bottom: sr.bottom,
        width: sr.width, height: sr.height,
      } : null;
      const color = getColor?.() || 'yellow';
      const rec = await commitHighlight(color);
      if (!rec || rec.multiPage || !Number.isFinite(rec.id)) {
        if (rec?.multiPage) {
          onToast?.({ message: 'Notes on multi-page highlights are coming soon', type: 'info' });
        }
        return;
      }
      tools.openNoteForHighlight({ annId: rec.id, page: rec.page, body: '', rect });
    },
    onCopy: (text) => {
      if (!text) return;
      try { navigator.clipboard.writeText(text); } catch { /* best-effort */ }
      onToast?.({ message: 'Copied', type: 'success' });
    },
    onSearchInDoc: (text) => {
      if (!text) return;
      searchBar?.show?.();
      searchBar?.setQuery?.(text);
      toolbar?.setSearchActive?.(true);
      search?.search?.(text);
    },
    onSearchWeb: (text) => {
      if (!text) return;
      const q = encodeURIComponent(text);
      try { window.open(`https://www.google.com/search?q=${q}`, '_blank', 'noopener'); }
      catch { /* best-effort */ }
    },
    onAddNoteAtPoint: (p) => {
      tools.placeNewNote({
        page: p.page, fx: p.fx, fy: p.fy,
        clientX: p.clientX, clientY: p.clientY,
      });
    },
    onCopyPageText: async ({ page }) => {
      const pdfDoc = getPdfDoc?.();
      if (!pdfDoc) return;
      try {
        const pg = await pdfDoc.getPage(page);
        if (!pg) return;
        const content = await pg.getTextContent({ includeMarkedContent: false });
        const text = (content?.items || [])
          .map((it) => it.str || '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text) {
          try { navigator.clipboard.writeText(text); } catch { /* best-effort */ }
          onToast?.({ message: `Copied page ${page}`, type: 'success' });
        }
      } catch (e) {
        onToast?.({ message: `Copy failed: ${e?.message || e}`, type: 'error' });
      }
    },
    onBookmarkPage: ({ page }) => {
      const docId = getDocId?.();
      if (!docId || !Number.isFinite(page)) return;
      addBookmark(kernel, docId, { page, label: `Page ${page}`, color: 'accent' });
      onToast?.({ message: `Bookmarked page ${page}`, type: 'success' });
      sidebar?.updateTab?.('bookmarks', {});
    },
    onGoToPage: () => {
      const ans = window.prompt('Go to page:', String(getCurrentPage?.() || 1));
      const n = Number(ans);
      if (Number.isFinite(n)) goToPage?.(n);
    },
  });

  function onContextMenu(e) { menu.show(e); }
  stage.addEventListener('contextmenu', onContextMenu);

  function destroy() {
    stage.removeEventListener('contextmenu', onContextMenu);
    menu.destroy();
  }

  return { destroy };
}
