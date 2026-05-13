/**
 * pdf/library/LibraryView.js — Library home screen orchestrator.
 *
 * Owns the list of doc-metadata records loaded from pdfStore, the
 * current filter/sort/query state (mirrored to kernel.storage so it
 * persists across launches), drag-drop import, and the "Open" event
 * the parent app listens to.
 *
 * Stays under the 500-line cap by delegating:
 *   - filter/sort math → libraryReducer.js
 *   - per-card DOM    → LibraryCard.js
 *   - filter row      → LibraryFilter.js
 *   - storage gauge   → LibraryStorageGauge.js
 *   - import/export   → importExport.js
 *   - thumbnails      → thumbnail.js
 */

import { el } from '../../../utils/dom.js';
import { buildLibraryCard } from './LibraryCard.js';
import { buildLibraryFilter } from './LibraryFilter.js';
import { buildLibraryStorageGauge } from './LibraryStorageGauge.js';
import { selectVisibleDocs } from './libraryReducer.js';
import {
    pickFileToImport, importBlob, vetImport, PdfImportError,
    listFilesAppPdfs, importFromFilesApp, downloadBlob,
} from './importExport.js';
import { renderThumbnail } from './thumbnail.js';

const LIBRARY_VIEW_KEY = 'yancotab_pdf_library_view_v1';
const RECENTS_KEY = 'yancotab_pdf_recent';
const MAX_RECENTS = 20;

export function buildLibraryView({ kernel, onOpenDoc, onToast } = {}) {
    const root = el('div', { class: 'pdf-lib' });
    const pdfStore = kernel?.getService?.('pdfStore');
    const fs = kernel?.getService?.('fs');

    // ── persistent state ──
    const stored = kernel?.storage?.load?.(LIBRARY_VIEW_KEY) || {};
    let state = {
        filter: stored.filter || 'all',
        sort: stored.sort || 'lastOpened',
        viewMode: stored.viewMode || 'grid',
        query: '',
    };

    let docs = [];
    let viewStateMap = {};
    const persistRequested = { value: false };

    // ── DOM scaffold ──
    const topBar = el('div', { class: 'pdf-lib-topbar' });
    const title = el('div', { class: 'pdf-lib-title' }, [
        el('span', { class: 'pdf-lib-title-icon' }, '📚'),
        el('span', { class: 'pdf-lib-title-text' }, 'PDF Library'),
    ]);
    const topActions = el('div', { class: 'pdf-lib-topbar-actions' });
    const importBtn = el('button', {
        type: 'button',
        class: 'pdf-lib-btn is-primary',
        title: 'Import a PDF from disk',
        onclick: () => triggerImport(),
    }, '+ Import');
    const importFromFilesBtn = el('button', {
        type: 'button',
        class: 'pdf-lib-btn',
        title: 'Import from your /home/documents folder',
        onclick: () => openFilesAppPicker(),
    }, 'From Files');
    topActions.append(importFromFilesBtn, importBtn);
    topBar.append(title, topActions);

    const filterBar = buildLibraryFilter({
        initial: state,
        onChange: (next) => {
            state = { ...state, ...next };
            persistViewState();
            renderGrid();
        },
    });

    const grid = el('div', { class: 'pdf-lib-grid', 'aria-live': 'polite' });
    const empty = el('div', { class: 'pdf-lib-empty' });

    const dropOverlay = el('div', { class: 'pdf-lib-drop-overlay' }, [
        el('div', { class: 'pdf-lib-drop-content' }, [
            el('div', { class: 'pdf-lib-drop-icon' }, '⬇'),
            el('div', { class: 'pdf-lib-drop-text' }, 'Drop PDF to import'),
        ]),
    ]);

    const gauge = buildLibraryStorageGauge({
        pdfStore,
        onManage: () => onManageStorage(),
    });

    root.append(topBar, filterBar.root, grid, empty, gauge.root, dropOverlay);

    bindDragDrop();

    // ── data ──
    async function refresh() {
        if (!pdfStore) return;
        try {
            await pdfStore.open();
            const all = await pdfStore.listDocuments({ sort: 'importedAt' });
            docs = all;
            // Hydrate view-state map so we can show last-page / progress.
            viewStateMap = {};
            await Promise.all(all.map(async (d) => {
                try {
                    const v = await pdfStore.getViewState(d.id);
                    if (v) viewStateMap[d.id] = v;
                } catch { /* ignore */ }
            }));
        } catch (e) {
            console.warn('[Library] refresh failed:', e);
        }
        renderGrid();
        gauge.refresh();
    }

    function renderGrid() {
        const visible = selectVisibleDocs(docs, viewStateMap, state);
        grid.innerHTML = '';
        grid.classList.toggle('is-list', state.viewMode === 'list');

        if (docs.length === 0) {
            renderEmptyState('first-run');
            return;
        }
        if (visible.length === 0) {
            renderEmptyState('no-match');
            return;
        }
        empty.style.display = 'none';
        grid.style.display = '';

        for (const doc of visible) {
            const card = buildLibraryCard({
                doc,
                onOpen: (d) => openDoc(d),
                onContextMenu: (d, e) => showCardMenu(d, e),
                onRequestThumbnail: (d) => generateThumbnail(d),
            });
            grid.appendChild(card.root);
        }
    }

    function renderEmptyState(kind) {
        empty.innerHTML = '';
        grid.style.display = 'none';
        empty.style.display = 'flex';
        if (kind === 'first-run') {
            empty.appendChild(el('div', { class: 'pdf-lib-empty-icon' }, '📕'));
            empty.appendChild(el('div', { class: 'pdf-lib-empty-title' }, 'Your PDF library is empty.'));
            empty.appendChild(el('div', { class: 'pdf-lib-empty-hint' }, 'Drop a PDF here or click Import.'));
            const row = el('div', { class: 'pdf-lib-empty-actions' });
            row.appendChild(el('button', {
                type: 'button',
                class: 'pdf-lib-btn is-primary',
                onclick: () => triggerImport(),
            }, '+ Import PDF'));
            row.appendChild(el('button', {
                type: 'button',
                class: 'pdf-lib-btn',
                onclick: () => openFilesAppPicker(),
            }, 'From Files'));
            empty.appendChild(row);
        } else {
            empty.appendChild(el('div', { class: 'pdf-lib-empty-icon' }, '🔎'));
            empty.appendChild(el('div', { class: 'pdf-lib-empty-title' }, 'No matches.'));
            empty.appendChild(el('div', { class: 'pdf-lib-empty-hint' }, 'Try a different filter or clear the search.'));
        }
    }

    function persistViewState() {
        try {
            kernel?.storage?.save?.(LIBRARY_VIEW_KEY, {
                filter: state.filter,
                sort: state.sort,
                viewMode: state.viewMode,
            });
        } catch { /* ignore */ }
    }

    // ── open / recents ──
    function openDoc(doc) {
        bumpRecent(doc.id);
        onOpenDoc?.(doc);
    }

    function bumpRecent(docId) {
        try {
            const cur = kernel.storage.load(RECENTS_KEY) || [];
            const filtered = cur.filter((r) => r && r.docId !== docId);
            filtered.unshift({ docId, openedAt: Date.now() });
            kernel.storage.save(RECENTS_KEY, filtered.slice(0, MAX_RECENTS));
        } catch { /* ignore */ }
    }

    // ── thumbnails ──
    const thumbnailQueue = new Set();
    async function generateThumbnail(doc) {
        if (!doc?.id || doc.thumbnailDataUrl || thumbnailQueue.has(doc.id)) return;
        thumbnailQueue.add(doc.id);
        try {
            const blob = await pdfStore.readBlob(doc.id);
            if (!blob) return;
            const dataUrl = await renderThumbnail(blob);
            if (!dataUrl) return;
            await pdfStore.updateMeta(doc.id, { thumbnailDataUrl: dataUrl });
            // Update the in-memory record so a re-render uses it.
            const idx = docs.findIndex((d) => d.id === doc.id);
            if (idx >= 0) docs[idx] = { ...docs[idx], thumbnailDataUrl: dataUrl };
            // Patch the existing card image without a full re-render.
            const card = grid.querySelector(`[data-doc-id="${doc.id}"]`);
            if (card) {
                const thumb = card.querySelector('.pdf-lib-card-thumb');
                if (thumb) {
                    thumb.innerHTML = '';
                    const img = document.createElement('img');
                    img.className = 'pdf-lib-card-thumb-img';
                    img.alt = '';
                    img.src = dataUrl;
                    thumb.appendChild(img);
                }
            }
        } catch (e) {
            console.warn('[Library] thumbnail failed:', e);
        } finally {
            thumbnailQueue.delete(doc.id);
        }
    }

    // ── import flows ──
    async function triggerImport() {
        const picked = await pickFileToImport();
        if (!picked) return;
        await importFile(picked.accepted);
    }

    async function importFile(file) {
        try {
            const verdict = await vetImport(file, file.name);
            if (verdict.needsConfirm) {
                if (!window.confirm(`${verdict.reason}\n\nImport anyway?`)) return;
            }
            const meta = await importBlob({
                pdfStore, blob: file, name: file.name, persistRequested,
            });
            await refresh();
            onToast?.({ message: `Imported "${meta.name}"`, type: 'success' });
            // Auto-open immediately after a successful import — that's
            // what every desktop reader does.
            openDoc(meta);
        } catch (e) {
            if (e instanceof PdfImportError) {
                onToast?.({ message: e.message, type: 'error' });
            } else {
                onToast?.({ message: `Couldn't import: ${e.message || e}`, type: 'error' });
            }
        }
    }

    function bindDragDrop() {
        let dragCount = 0;
        root.addEventListener('dragenter', (e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragCount++;
            dropOverlay.classList.add('is-visible');
        });
        root.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dragCount--;
            if (dragCount <= 0) {
                dragCount = 0;
                dropOverlay.classList.remove('is-visible');
            }
        });
        root.addEventListener('dragover', (e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        root.addEventListener('drop', (e) => {
            e.preventDefault();
            dragCount = 0;
            dropOverlay.classList.remove('is-visible');
            const files = [...(e.dataTransfer?.files || [])]
                .filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
            if (files.length === 0) return;
            // Sequential to avoid quota churn.
            (async () => {
                for (const f of files) {
                    await importFile(f);
                }
            })();
        });
    }

    function hasFiles(e) {
        return [...(e.dataTransfer?.types || [])].includes('Files');
    }

    // ── from-Files-app picker ──
    async function openFilesAppPicker() {
        const items = listFilesAppPdfs(fs);
        if (items.length === 0) {
            onToast?.({ message: 'No PDFs in /home/documents', type: 'info' });
            return;
        }
        // Simple modal list — keep small to stay under file cap.
        const overlay = el('div', { class: 'pdf-lib-modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } });
        const modal = el('div', { class: 'pdf-lib-modal' });
        modal.appendChild(el('div', { class: 'pdf-lib-modal-h' }, 'Import from Files'));
        const list = el('div', { class: 'pdf-lib-modal-list' });
        for (const item of items) {
            const btn = el('button', {
                type: 'button', class: 'pdf-lib-modal-item',
                onclick: async () => {
                    try {
                        const meta = await importFromFilesApp({ pdfStore, fs, path: item.path });
                        if (meta) {
                            await refresh();
                            onToast?.({ message: `Imported "${meta.name}"`, type: 'success' });
                            overlay.remove();
                            openDoc(meta);
                        } else {
                            onToast?.({ message: `Couldn't import "${item.name}"`, type: 'error' });
                        }
                    } catch (e) {
                        onToast?.({ message: e.message || 'Import failed', type: 'error' });
                    }
                },
            });
            btn.appendChild(el('span', { class: 'pdf-lib-modal-icon' }, '📕'));
            btn.appendChild(el('span', { class: 'pdf-lib-modal-name' }, item.name));
            list.appendChild(btn);
        }
        modal.appendChild(list);
        modal.appendChild(el('button', {
            type: 'button', class: 'pdf-lib-btn pdf-lib-modal-close',
            onclick: () => overlay.remove(),
        }, 'Close'));
        overlay.appendChild(modal);
        root.appendChild(overlay);
    }

    // ── card right-click menu ──
    function showCardMenu(doc, e) {
        const menu = el('div', { class: 'pdf-lib-cardmenu' });
        const items = [
            { label: 'Resume', fn: () => openDoc(doc) },
            { label: 'Rename…', fn: () => promptRename(doc) },
            { label: 'Download', fn: () => doDownload(doc) },
        ];
        if (doc.sizeBytes <= 5 * 1024 * 1024) {
            items.push({ label: 'Export to Files', fn: () => doExport(doc) });
        }
        items.push({ label: 'Remove from Library', danger: true, fn: () => doRemove(doc) });

        for (const it of items) {
            const b = el('button', {
                type: 'button',
                class: `pdf-lib-cardmenu-item${it.danger ? ' is-danger' : ''}`,
                onclick: () => { menu.remove(); it.fn(); },
            }, it.label);
            menu.appendChild(b);
        }
        menu.style.left = `${Math.min(e.clientX, window.innerWidth - 220)}px`;
        menu.style.top = `${Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 20)}px`;
        const dismiss = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('mousedown', dismiss, true);
                document.removeEventListener('keydown', escDismiss, true);
            }
        };
        const escDismiss = (ev) => {
            if (ev.key === 'Escape') { menu.remove(); document.removeEventListener('keydown', escDismiss, true); document.removeEventListener('mousedown', dismiss, true); }
        };
        document.addEventListener('mousedown', dismiss, true);
        document.addEventListener('keydown', escDismiss, true);
        document.body.appendChild(menu);
    }

    async function promptRename(doc) {
        const nextRaw = window.prompt(`Rename "${doc.name}"`, doc.name);
        if (nextRaw == null) return;
        const next = nextRaw.trim();
        if (!next || next === doc.name) return;
        try {
            await pdfStore.updateMeta(doc.id, { name: next });
            await refresh();
        } catch (e) {
            onToast?.({ message: `Rename failed: ${e.message || e}`, type: 'error' });
        }
    }

    async function doDownload(doc) {
        try {
            const blob = await pdfStore.readBlob(doc.id);
            if (!blob) throw new Error('blob not found');
            downloadBlob(blob, doc.name);
        } catch (e) {
            onToast?.({ message: `Download failed: ${e.message || e}`, type: 'error' });
        }
    }

    async function doExport(doc) {
        try {
            const { path } = await (await import('./importExport.js')).exportToFilesApp({ pdfStore, fs, docId: doc.id });
            onToast?.({ message: `Exported to ${path}`, type: 'success' });
        } catch (e) {
            onToast?.({ message: e.message || 'Export failed', type: 'error' });
        }
    }

    async function doRemove(doc) {
        if (!window.confirm(`Remove "${doc.name}" from your Library? This cannot be undone.`)) return;
        try {
            await pdfStore.deleteDocument(doc.id);
            await refresh();
            onToast?.({ message: `Removed "${doc.name}"`, type: 'success' });
        } catch (e) {
            onToast?.({ message: `Couldn't remove: ${e.message || e}`, type: 'error' });
        }
    }

    function onManageStorage() {
        // Future: dedicated modal listing docs by size with delete buttons.
        // For P1 we just toast + jump to the Size sort.
        filterBar.setFilter('all');
        state = { ...state, sort: 'size', filter: 'all' };
        persistViewState();
        renderGrid();
    }

    return {
        root,
        refresh,
        importFile,        // for drop-from-outside-the-library (the app shell forwards)
        focusSearch: () => filterBar.focusSearch(),
    };
}
