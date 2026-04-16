/**
 * PdfReaderApp — Native PDF viewer for YancoTab
 *
 * Renders PDFs using Chrome's built-in PDF viewer via blob URLs.
 * Supports:
 *  - Opening PDFs from the Files app (filesystem path)
 *  - Importing PDFs via file picker or drag-and-drop
 *  - Saving imported PDFs to /home/documents in the filesystem
 *  - Recent PDFs list in empty state
 *  - Print (open in new tab) and Fullscreen
 */
import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

const RECENT_KEY = 'yancotab_pdf_recent';
const MAX_RECENTS = 5;

export class PdfReaderApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'PDF Reader', id: 'pdf-reader', icon: '\uD83D\uDCD5' };
        this.fs = kernel.getService('fs');
        this._currentBlobUrl = null;
        this._currentName = null;
        this._currentDataUrl = null;
        this._currentPath = null;
        this._openedFromFiles = false;
        this._fullscreenHandler = null;
    }

    async init(options = {}) {
        this.root = el('div', { class: 'app-window app-pdf-reader' });
        this._buildUI();

        // Opened from Files app with a filesystem path
        if (options?.filePath) {
            this._openedFromFiles = true;
            this._currentPath = options.filePath;
            const file = this.fs?.read(options.filePath);
            if (file && file.content) {
                const name = this._basename(options.filePath);
                this._loadFromDataUrl(file.content, name);
                this._addToRecents(name, options.filePath);
            }
        }
        // Opened with raw data URL
        else if (options?.dataUrl) {
            this._loadFromDataUrl(options.dataUrl, options.name || 'document.pdf');
        }
    }

    destroy() {
        if (this._fullscreenHandler) {
            document.removeEventListener('fullscreenchange', this._fullscreenHandler);
        }
        this._revokeBlobUrl();
        super.destroy();
    }

    // ─── UI ───────────────────────────────────────────────────

    _buildUI() {
        // Toolbar
        this._toolbar = el('div', { class: 'pdf-toolbar' }, [
            el('div', { class: 'pdf-toolbar__left' }, [
                this._fileNameEl = el('span', { class: 'pdf-toolbar__name' }, 'No PDF loaded'),
            ]),
            el('div', { class: 'pdf-toolbar__actions' }, [
                this._btnOpen = el('button', {
                    class: 'pdf-btn',
                    title: 'Open PDF',
                    onclick: () => this._triggerOpen(),
                }, '\uD83D\uDCC2 Open'),
                this._btnSave = el('button', {
                    class: 'pdf-btn',
                    title: 'Save to Files',
                    onclick: () => this._saveToFiles(),
                    style: 'display:none',
                }, '\uD83D\uDCBE Save to Files'),
                this._btnDownload = el('button', {
                    class: 'pdf-btn',
                    title: 'Download',
                    onclick: () => this._download(),
                    style: 'display:none',
                }, '\u2B07\uFE0F Download'),
                this._btnPrint = el('button', {
                    class: 'pdf-btn',
                    title: 'Open in new tab to print (Ctrl+P)',
                    onclick: () => this._print(),
                    style: 'display:none',
                }, '\uD83D\uDDA8\uFE0F Print'),
                this._btnFullscreen = el('button', {
                    class: 'pdf-btn',
                    title: 'Fullscreen',
                    onclick: () => this._toggleFullscreen(),
                    style: 'display:none',
                }, '\u26F6 Fullscreen'),
            ]),
        ]);

        // PDF viewer container (hidden until a PDF is loaded)
        this._viewerWrap = el('div', { class: 'pdf-viewer-wrap', style: 'display:none' });

        // Empty state (built with current recents)
        this._emptyState = this._buildEmptyStateEl();

        // Drop overlay
        this._dropOverlay = el('div', { class: 'pdf-drop-overlay' }, [
            el('div', { class: 'pdf-drop-overlay__content' }, [
                el('div', { class: 'pdf-drop-overlay__icon' }, '\u2B07\uFE0F'),
                el('div', {}, 'Drop PDF here'),
            ]),
        ]);

        // Hidden file input
        this._fileInput = el('input', {
            type: 'file',
            accept: 'application/pdf,.pdf',
            hidden: true,
            onchange: (e) => this._handleFileSelect(e),
        });

        this.root.append(
            this._toolbar,
            this._viewerWrap,
            this._emptyState,
            this._dropOverlay,
            this._fileInput,
        );

        // Fullscreen change handler — updates button label when user presses Esc
        this._fullscreenHandler = () => {
            const isFs = !!document.fullscreenElement;
            this._btnFullscreen.textContent = isFs ? '\u26F6 Exit Full' : '\u26F6 Fullscreen';
        };
        document.addEventListener('fullscreenchange', this._fullscreenHandler);

        this._bindDragDrop();
    }

    // ─── Empty State ──────────────────────────────────────────

    _buildEmptyStateEl() {
        const recents = this._getValidRecents();
        const children = [
            el('div', { class: 'pdf-empty__icon' }, '\uD83D\uDCD5'),
            el('div', { class: 'pdf-empty__title' }, 'PDF Reader'),
            el('div', { class: 'pdf-empty__hint' }, 'Open a PDF file or drag & drop one here'),
            el('button', {
                class: 'pdf-btn pdf-btn--primary',
                onclick: () => this._triggerOpen(),
            }, '\uD83D\uDCC2 Open PDF'),
        ];

        if (recents.length > 0) {
            const recentEls = recents.map(r =>
                el('button', {
                    class: 'pdf-recent-item',
                    title: r.path,
                    onclick: () => this._openRecent(r),
                }, [
                    el('span', { class: 'pdf-recent-item__icon' }, '\uD83D\uDCD5'),
                    el('span', { class: 'pdf-recent-item__name' }, r.name),
                    el('span', { class: 'pdf-recent-item__date' }, this._formatDate(r.openedAt)),
                ])
            );

            children.push(
                el('div', { class: 'pdf-recents' }, [
                    el('div', { class: 'pdf-recents__title' }, 'Recently Opened'),
                    el('div', { class: 'pdf-recents__list' }, recentEls),
                ])
            );
        }

        return el('div', { class: 'pdf-empty' }, children);
    }

    // ─── PDF Loading ──────────────────────────────────────────

    _loadFromDataUrl(dataUrl, name) {
        this._currentDataUrl = dataUrl;
        this._currentName = name || 'document.pdf';
        this._fileNameEl.textContent = this._currentName;

        // Convert data URL to blob URL for the embed
        const blob = this._dataUrlToBlob(dataUrl);
        this._revokeBlobUrl();
        this._currentBlobUrl = URL.createObjectURL(blob);

        // Show viewer, hide empty state
        this._emptyState.style.display = 'none';
        this._viewerWrap.style.display = '';

        // Show/hide toolbar buttons
        this._btnSave.style.display = this._openedFromFiles ? 'none' : '';
        this._btnDownload.style.display = '';
        this._btnPrint.style.display = '';
        this._btnFullscreen.style.display = '';

        // Render the PDF using embed
        this._viewerWrap.innerHTML = '';
        const embed = el('embed', {
            class: 'pdf-embed',
            src: this._currentBlobUrl,
            type: 'application/pdf',
        });
        this._viewerWrap.appendChild(embed);
    }

    _loadFromFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            this._loadFromDataUrl(reader.result, file.name);
        };
        reader.readAsDataURL(file);
    }

    // ─── File Operations ──────────────────────────────────────

    _triggerOpen() {
        this._fileInput.click();
    }

    _handleFileSelect(e) {
        const file = e.target.files?.[0];
        if (file && (file.type === 'application/pdf' || file.name.endsWith('.pdf'))) {
            this._loadFromFile(file);
        }
        this._fileInput.value = '';
    }

    _saveToFiles() {
        if (!this._currentDataUrl || !this.fs) return;

        const name = this._currentName || 'document.pdf';
        let targetPath = `/home/documents/${name}`;

        // Resolve collision
        if (this.fs.exists(targetPath)) {
            const ext = '.pdf';
            const base = name.endsWith(ext) ? name.slice(0, -ext.length) : name;
            let counter = 2;
            while (this.fs.exists(targetPath)) {
                targetPath = `/home/documents/${base} (${counter})${ext}`;
                counter++;
            }
        }

        this.fs.write(targetPath, this._currentDataUrl, {
            mime: 'application/pdf',
            size: this._currentDataUrl.length,
            source: 'pdf-reader',
        });

        // Track in recents
        this._currentPath = targetPath;
        this._addToRecents(name, targetPath);

        // Brief visual feedback
        const origText = this._btnSave.textContent;
        this._btnSave.textContent = '\u2705 Saved!';
        setTimeout(() => { this._btnSave.textContent = origText; }, 1500);
    }

    _download() {
        if (!this._currentDataUrl) return;
        const a = document.createElement('a');
        a.href = this._currentDataUrl;
        a.download = this._currentName || 'document.pdf';
        a.click();
    }

    _print() {
        if (!this._currentBlobUrl) return;
        // Open the PDF blob URL in a new tab — user can Ctrl+P from there
        window.open(this._currentBlobUrl, '_blank');
    }

    _toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.root.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    }

    // ─── Recent PDFs ──────────────────────────────────────────

    _addToRecents(name, path) {
        if (!name || !path) return;
        try {
            const raw = localStorage.getItem(RECENT_KEY);
            const recents = raw ? JSON.parse(raw) : [];
            const filtered = recents.filter(r => r.path !== path);
            filtered.unshift({ name, path, openedAt: Date.now() });
            localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENTS)));
        } catch { /* ignore */ }
    }

    _getRecents() {
        try {
            return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        } catch { return []; }
    }

    _getValidRecents() {
        // Only include recents whose file still exists in the filesystem
        return this._getRecents().filter(r => this.fs?.exists(r.path));
    }

    _openRecent(recent) {
        const file = this.fs?.read(recent.path);
        if (file && file.content) {
            this._openedFromFiles = true;
            this._currentPath = recent.path;
            this._loadFromDataUrl(file.content, recent.name);
            this._addToRecents(recent.name, recent.path); // bump to top
        }
    }

    _formatDate(timestamp) {
        const d = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor((now - d) / 86400000);
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return d.toLocaleDateString();
    }

    // ─── Drag & Drop ──────────────────────────────────────────

    _bindDragDrop() {
        let dragCounter = 0;
        this.root.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dragCounter++;
            this._dropOverlay.classList.add('is-visible');
        });
        this.root.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter <= 0) {
                dragCounter = 0;
                this._dropOverlay.classList.remove('is-visible');
            }
        });
        this.root.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        this.root.addEventListener('drop', (e) => {
            e.preventDefault();
            dragCounter = 0;
            this._dropOverlay.classList.remove('is-visible');
            const file = [...e.dataTransfer.files].find(f =>
                f.type === 'application/pdf' || f.name.endsWith('.pdf')
            );
            if (file) this._loadFromFile(file);
        });
    }

    // ─── Helpers ──────────────────────────────────────────────

    _dataUrlToBlob(dataUrl) {
        const [header, base64] = dataUrl.split(',');
        const mime = header.match(/:(.*?);/)?.[1] || 'application/pdf';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mime });
    }

    _revokeBlobUrl() {
        if (this._currentBlobUrl) {
            URL.revokeObjectURL(this._currentBlobUrl);
            this._currentBlobUrl = null;
        }
    }

    _basename(path) {
        return (path || '').split('/').pop() || '';
    }
}
