/**
 * PdfReaderApp — Library + Reader composite.
 *
 * v2 (P1) is a switcher: by default, mounts the Library (IDB-backed
 * grid of imported PDFs); on doc-open, mounts the Reader (existing
 * Codex orchestrator) and tears it down on close. This kills the
 * 50-MB cap because PDFs now live in IndexedDB as Blobs, not as
 * base64 in localStorage.
 *
 * Lifecycle:
 *   init({ filePath })  — opened from FilesApp; import-then-open the FS file
 *   init({ dataUrl })   — opened from a search/share path; import-then-open
 *   init({ docId })     — direct open of a Library doc (e.g. quote-back-link)
 *   init()              — show the Library home
 */

import { App } from '../core/App.js';
import { el, cssLink } from '../utils/dom.js';
import { buildCodex } from './pdf/codex.js';
import {
    recordOpen, loadStreak,
    addBookmark, removeBookmark, listBookmarks,
    addHighlight, listHighlightsOnPage,
} from './pdf/persistence.js';
import { densityStrip, currentStreak } from './pdf/engine/streak.js';
import { buildLibraryView } from './pdf/library/LibraryView.js';
import { migrateIfNeeded } from './pdf/library/migration.js';
import { importFromFilesApp, importBlob, vetImport } from './pdf/library/importExport.js';
import { buildMoreMenu } from './pdf/view/moreMenu.js';
import { printPdf } from './pdf/view/printDoc.js';

export class PdfReaderApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'PDF Reader', id: 'pdf-reader', icon: '📕' };
        this.fs = kernel.getService('fs');
        this.pdfStore = kernel.getService('pdfStore');
        this._streak = loadStreak(this.kernel);
        this._styleLinks = [];
        this._boundKeydown = this._onKeydown.bind(this);

        this._library = null;
        this._reader = null;
        this._currentDocId = null;
        this._currentDoc = null;
        this._readerHost = null;
        this._libraryHost = null;
        this._titleBar = null;
        this._persistRequested = { value: false };
    }

    async init(options = {}) {
        this._styleLinks = [
            cssLink('css/pdf-codex.css'),
            cssLink('css/pdf-library.css'),
        ];
        this._styleLinks.forEach((l) => document.head.appendChild(l));

        this.root = el('div', { class: 'app-window app-pdf', tabindex: '0' });

        this._buildShell();
        document.addEventListener('keydown', this._boundKeydown);

        // Run the v1→v2 migration before anything else mounts.
        await this._runMigration();

        // Decide what to show.
        if (options?.docId) {
            await this._openDocId(options.docId);
        } else if (options?.filePath) {
            await this._openFromFilesApp(options.filePath);
        } else if (options?.dataUrl) {
            await this._openFromDataUrl(options.dataUrl, options.name || 'document.pdf');
        } else {
            this._showLibrary();
        }
    }

    destroy() {
        document.removeEventListener('keydown', this._boundKeydown);
        this._teardownReader();
        if (this._styleLinks) {
            for (const l of this._styleLinks) l.remove();
            this._styleLinks = [];
        }
        super.destroy();
    }

    // ── shell ──────────────────────────────────────────────────

    _buildShell() {
        // Reader-mode title bar (Library button, etc.) — hidden in Library mode.
        this._titleBar = el('div', { class: 'cx-titlebar' });
        this._titleBarLibBtn = el('button', {
            type: 'button', class: 'cx-titlebar-btn',
            title: 'Back to Library',
            onclick: () => this._closeReader(),
        }, '← Library');
        this._titleBarTitle = el('div', { class: 'cx-titlebar-title' });
        this._titleBarActions = el('div', { class: 'cx-titlebar-actions' });
        this._btnDownload = el('button', {
            type: 'button', class: 'cx-titlebar-btn',
            title: 'Download to disk',
            onclick: () => this._downloadCurrent(),
        }, '⇩ Download');
        this._btnExport = el('button', {
            type: 'button', class: 'cx-titlebar-btn',
            title: 'Export a copy to /home/documents',
            onclick: () => this._exportCurrent(),
        }, 'Export to Files');
        this._btnFullscreen = el('button', {
            type: 'button', class: 'cx-titlebar-btn',
            title: 'Fullscreen (F11)',
            onclick: () => this._reader?.toggleFullscreen?.(),
        }, '⛶ Fullscreen');
        this._moreMenu = buildMoreMenu({
            onPrint: () => this._printCurrent(),
            onToggleDark: () => this._reader?.toggleDarkPages?.(),
            getDarkMode: () => this._reader?.isDarkPages?.() || false,
            onShowProperties: () => this._showProperties(),
        });
        this._moreMenu.trigger.classList.add('cx-titlebar-btn');
        this._titleBarActions.append(this._btnDownload, this._btnExport, this._btnFullscreen, this._moreMenu.trigger);
        this._titleBar.append(this._titleBarLibBtn, this._titleBarTitle, this._titleBarActions);

        this._libraryHost = el('div', { class: 'pdf-lib-host' });
        this._readerHost = el('div', { class: 'pdf-reader-host' });

        this.root.append(this._titleBar, this._libraryHost, this._readerHost);
    }

    async _runMigration() {
        try {
            const result = await migrateIfNeeded({
                loadStorage: (k) => this.kernel.storage.load(k),
                saveStorage: (k, v) => this.kernel.storage.save(k, v),
                readFile: (p) => this.fs?.read?.(p),
                fileExists: (p) => Boolean(this.fs?.exists?.(p)),
                addDocument: async (blob, name, meta) => {
                    return this.pdfStore.addDocument(blob, name, meta);
                },
                findDocBySourcePath: async (path) => {
                    return this.pdfStore.findBySourcePath(path);
                },
                warn: (...args) => console.warn('[pdf-migrate]', ...args),
            });
            if (result && !result.alreadyDone && result.migrated > 0) {
                this.kernel?.emit?.('toast', {
                    message: `Imported ${result.migrated} PDF${result.migrated === 1 ? '' : 's'} into your Library`,
                    type: 'success',
                });
            }
        } catch (e) {
            console.warn('[PdfReaderApp] migration failed:', e);
        }
    }

    // ── Library ────────────────────────────────────────────────

    _showLibrary() {
        if (!this._library) {
            this._library = buildLibraryView({
                kernel: this.kernel,
                onOpenDoc: (doc) => this._openDocId(doc.id),
                onToast: (t) => this.kernel?.emit?.('toast', t),
            });
            this._libraryHost.appendChild(this._library.root);
        }
        this._teardownReader();
        this._libraryHost.style.display = '';
        this._readerHost.style.display = 'none';
        this._titleBar.style.display = 'none';
        this._library.refresh();
    }

    // ── Reader ─────────────────────────────────────────────────

    async _openDocId(docId) {
        if (!docId || !this.pdfStore) return;
        try {
            const doc = await this.pdfStore.getDocument(docId);
            if (!doc) {
                this.kernel?.emit?.('toast', { message: 'Document not found', type: 'error' });
                this._showLibrary();
                return;
            }
            this._currentDoc = stripBlob(doc);
            this._currentDocId = doc.id;
            await this._mountReader(doc);
        } catch (e) {
            console.error('[PdfReaderApp] open failed:', e);
            this.kernel?.emit?.('toast', { message: `Couldn't open: ${e.message || e}`, type: 'error' });
        }
    }

    async _openFromFilesApp(path) {
        const meta = await importFromFilesApp({ pdfStore: this.pdfStore, fs: this.fs, path });
        if (meta) {
            await this._openDocId(meta.id);
        } else {
            this.kernel?.emit?.('toast', { message: `Couldn't import "${path}"`, type: 'error' });
            this._showLibrary();
        }
    }

    async _openFromDataUrl(dataUrl, name) {
        try {
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const verdict = await vetImport(blob, name);
            if (verdict.needsConfirm) {
                if (!window.confirm(`${verdict.reason}\n\nImport anyway?`)) {
                    this._showLibrary();
                    return;
                }
            }
            const meta = await importBlob({
                pdfStore: this.pdfStore, blob, name,
                persistRequested: this._persistRequested,
            });
            await this._openDocId(meta.id);
        } catch (e) {
            this.kernel?.emit?.('toast', { message: e.message || 'Import failed', type: 'error' });
            this._showLibrary();
        }
    }

    async _mountReader(doc) {
        this._teardownReader();

        this._titleBarTitle.textContent = doc.name || 'Document';
        this._titleBar.style.display = '';
        this._libraryHost.style.display = 'none';
        this._readerHost.style.display = '';

        this._reader = buildCodex({
            pdfStore: this.pdfStore,
            getStreakStrip: () => densityStrip(this._streak, 14),
            getStreakDays: () => currentStreak(this._streak),
            getBookmarks: (docId) => listBookmarks(this.kernel, docId),
            getHighlightsOnPage: (docId, page) => listHighlightsOnPage(this.kernel, docId, page),
            onAddBookmark: ({ docId, page, label, color }) => {
                addBookmark(this.kernel, docId, { page, label, color });
                this._reader.refreshRail();
            },
            onAddHighlight: ({ docId, page, text, color }) => {
                addHighlight(this.kernel, docId, { page, text, color });
            },
            onRemoveBookmark: (b) => {
                const docId = this._reader.getDocId();
                if (!docId) return;
                removeBookmark(this.kernel, docId, b.page, b.label);
                this._reader.refreshRail();
            },
            onSendToNotes: () => { /* clipboard handled inside codex */ },
            onRecordOpen: () => {
                this._streak = recordOpen(this.kernel);
            },
            onToast: (t) => this.kernel?.emit?.('toast', t),
        });
        this._readerHost.appendChild(this._reader.root);

        // Convert blob → data URL for the existing codex (which calls
        // pdf.js with `getDocument({ url })`). We could feed pdf.js a
        // Uint8Array instead, but the existing codex API takes `source`
        // shaped as `{ url } | { data }` — both work. Pass a blob URL
        // for memory efficiency (no base64 expansion).
        const blob = doc.blob || (await this.pdfStore.readBlob(doc.id));
        const blobUrl = URL.createObjectURL(blob);
        this._currentBlobUrl = blobUrl;

        try {
            await this._reader.load({
                source: { url: blobUrl },
                name: doc.name,
                id: doc.id,
            });
            // Bookkeeping: also bump pdfStore.viewState.lastOpenedAt so the
            // Library knows this is a "reading-now" doc on next render.
            try { await this.pdfStore.saveViewState(doc.id, { docId: doc.id }); } catch { /* ignore */ }
        } catch (e) {
            console.error('[PdfReaderApp] reader.load failed:', e);
            this.kernel?.emit?.('toast', { message: `Couldn't open document`, type: 'error' });
            this._closeReader();
        }
    }

    _teardownReader() {
        if (this._reader) {
            try { this._reader.destroy(); } catch { /* ignore */ }
            this._reader = null;
        }
        if (this._readerHost) {
            this._readerHost.innerHTML = '';
        }
        if (this._currentBlobUrl) {
            URL.revokeObjectURL(this._currentBlobUrl);
            this._currentBlobUrl = null;
        }
    }

    _closeReader() {
        this._teardownReader();
        this._currentDocId = null;
        this._currentDoc = null;
        this._showLibrary();
    }

    // ── per-doc actions ────────────────────────────────────────

    async _downloadCurrent() {
        if (!this._currentDocId) return;
        try {
            const blob = await this.pdfStore.readBlob(this._currentDocId);
            if (!blob) throw new Error('blob unavailable');
            const a = document.createElement('a');
            const url = URL.createObjectURL(blob);
            a.href = url;
            a.download = this._currentDoc?.name || 'document.pdf';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 200);
        } catch (e) {
            this.kernel?.emit?.('toast', { message: `Download failed: ${e.message || e}`, type: 'error' });
        }
    }

    async _printCurrent() {
        if (!this._currentDocId) return;
        try {
            const blob = await this.pdfStore.readBlob(this._currentDocId);
            await printPdf(blob, (msg) => this.kernel?.emit?.('toast', { message: msg, type: 'info' }));
        } catch (e) {
            this.kernel?.emit?.('toast', { message: `Print failed: ${e.message || e}`, type: 'error' });
        }
    }

    _showProperties() {
        const props = this._reader?.getProperties?.();
        if (!props) return;
        const meta = this._currentDoc;
        const sizeMB = meta?.sizeBytes ? (meta.sizeBytes / 1024 / 1024).toFixed(2) : '?';
        const lines = [
            `Title: ${props.title}`,
            `Pages: ${props.pages}`,
            `Size: ${sizeMB} MB`,
            `View: ${props.mode}`,
            `Zoom: ${props.zoom}`,
            `Rotation: ${props.rotation}`,
            meta?.importedAt ? `Imported: ${new Date(meta.importedAt).toLocaleString()}` : null,
        ].filter(Boolean);
        // Use a simple alert for v2; a glass modal can land later.
        window.alert(lines.join('\n'));
    }

    async _exportCurrent() {
        if (!this._currentDocId) return;
        try {
            const { exportToFilesApp } = await import('./pdf/library/importExport.js');
            const { path } = await exportToFilesApp({
                pdfStore: this.pdfStore, fs: this.fs, docId: this._currentDocId,
            });
            this.kernel?.emit?.('toast', { message: `Exported to ${path}`, type: 'success' });
        } catch (e) {
            this.kernel?.emit?.('toast', { message: e.message || 'Export failed', type: 'error' });
        }
    }

    // ── Keyboard ───────────────────────────────────────────────

    _onKeydown(e) {
        const appLayer = this.root?.closest('.m-app-layer');
        if (!appLayer || appLayer.hidden) return;
        const tag = (e.target?.tagName || '').toUpperCase();
        const inFindBar = e.target?.closest?.('.cx-find-bar');
        // Ctrl+F should always trigger search-toggle, even when typing
        // in inputs (overrides browser's native find).
        if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F') && this._reader?.getDocId()) {
            e.preventDefault();
            this._reader.toggleSearch?.();
            return;
        }
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
            // Allow Esc inside the find-bar to fall through to its own handler.
            if (e.key === 'Escape' && inFindBar) return;
            return;
        }

        // Reader-mode arrows / page-jump.
        if (this._reader && this._reader.getDocId()) {
            if (e.key === 'ArrowLeft' || e.key === 'PageUp')         { this._reader.keyMove(-1); e.preventDefault(); }
            else if (e.key === 'ArrowRight' || e.key === 'PageDown') { this._reader.keyMove(1);  e.preventDefault(); }
            else if (e.key === 'Home')                               { this._reader.keyJump('first'); e.preventDefault(); }
            else if (e.key === 'End')                                { this._reader.keyJump('last');  e.preventDefault(); }
            else if (e.key === 'F11')                                { this._reader.toggleFullscreen?.(); e.preventDefault(); }
            else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { this._reader.zoomStep?.(1);  e.preventDefault(); }
            else if ((e.ctrlKey || e.metaKey) && e.key === '-')      { this._reader.zoomStep?.(-1); e.preventDefault(); }
            else if ((e.ctrlKey || e.metaKey) && e.key === '0')      { this._reader.setZoom?.('fit-width'); e.preventDefault(); }
            else if ((e.ctrlKey || e.metaKey) && e.key === '1')      { this._reader.setZoom?.(1.0); e.preventDefault(); }
        }
    }
}

function stripBlob(d) {
    if (!d) return d;
    const { blob: _b, ...rest } = d;
    return rest;
}
