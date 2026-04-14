/**
 * PhotosApp — 3-in-1: Gallery + Image Editor + Wallpaper Manager
 *
 * Gallery:   View saved images, drag-drop import, paste from clipboard
 * Editor:    Full image editor with crop, adjust, filters, annotate, color tools
 * Wallpaper: Browse curated wallpapers, set rotation schedules
 */
import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { PhotoEditor } from './photos/PhotoEditor.js';
import { WallpaperManager } from './photos/WallpaperManager.js';

const STORE_KEY = 'yancotab_photos_v1';
const VIEW_KEY = 'yancotab_photos_view';
const SORT_KEY = 'yancotab_photos_sort';
const GALLERY_KEY = 'yancotab_photos_gallery';

export class PhotosApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Photos', id: 'photos', icon: '\uD83D\uDDBC\uFE0F' };

        this.mode = 'gallery'; // gallery | editor | wallpaper
        this.viewMode = localStorage.getItem(VIEW_KEY) || 'grid';
        this.sortMode = localStorage.getItem(SORT_KEY) || 'date';
        this.gallery = this._loadGallery();
        this.selectedIds = new Set();
        this.editor = null;

        this._boundPaste = this._onPaste.bind(this);
        this._boundKeydown = this._onKeydown.bind(this);
    }

    async init(options = {}) {
        this.root = el('div', { class: 'app-window app-photos' });

        this._buildUI();
        this._showMode('gallery');

        document.addEventListener('paste', this._boundPaste);
        document.addEventListener('keydown', this._boundKeydown);

        // If launched with an image
        if (options?.imageData) {
            this._openEditor(options.imageData);
        }
    }

    destroy() {
        document.removeEventListener('paste', this._boundPaste);
        document.removeEventListener('keydown', this._boundKeydown);
        if (this.editor) {
            this.editor.destroy();
            this.editor = null;
        }
        super.destroy();
    }

    // ─── UI Build ─────────────────────────────────────────────

    _buildUI() {
        // Top nav bar
        this._navBar = el('div', { class: 'photos-nav' }, [
            el('div', { class: 'photos-nav__tabs' }, [
                this._navBtn('gallery', 'Gallery', '\uD83D\uDDBC'),
                this._navBtn('editor', 'Editor', '\u270F\uFE0F'),
                this._navBtn('wallpaper', 'Wallpapers', '\uD83C\uDF05'),
            ]),
            el('div', { class: 'photos-nav__actions' }, [
                this._actionBtn('Import', '\uD83D\uDCC2', () => this._triggerImport()),
                this._actionBtn('Paste', '\uD83D\uDCCB', () => this._pasteFromClipboard()),
            ]),
        ]);

        // Gallery view
        this._galleryView = el('div', { class: 'photos-gallery' });
        this._galleryToolbar = this._buildGalleryToolbar();
        this._galleryGrid = el('div', { class: 'photos-gallery__grid' });
        this._emptyState = el('div', { class: 'photos-empty' }, [
            el('div', { class: 'photos-empty__icon' }, '\uD83D\uDDBC\uFE0F'),
            el('div', { class: 'photos-empty__title' }, 'No Photos Yet'),
            el('div', { class: 'photos-empty__hint' }, 'Paste an image (Ctrl+V), drag & drop, or click Import'),
        ]);
        this._galleryView.append(this._galleryToolbar, this._galleryGrid, this._emptyState);

        // Editor view
        this._editorView = el('div', { class: 'photos-editor-wrap' });

        // Wallpaper view
        this._wallpaperView = el('div', { class: 'photos-wallpaper-wrap' });

        // Drop overlay
        this._dropOverlay = el('div', { class: 'photos-drop-overlay' }, [
            el('div', { class: 'photos-drop-overlay__content' }, [
                el('div', { class: 'photos-drop-overlay__icon' }, '\u2B07\uFE0F'),
                el('div', {}, 'Drop images here'),
            ]),
        ]);

        // Hidden file input
        this._fileInput = el('input', {
            type: 'file',
            accept: 'image/*',
            hidden: true,
            onchange: (e) => this._handleFileSelect(e),
        });
        this._fileInput.multiple = true;

        this.root.append(
            this._navBar,
            this._galleryView,
            this._editorView,
            this._wallpaperView,
            this._dropOverlay,
            this._fileInput,
        );

        this._bindDragDrop();
        this._refreshGallery();
    }

    _navBtn(mode, label, icon) {
        const btn = el('button', {
            class: `photos-nav__tab${this.mode === mode ? ' is-active' : ''}`,
            'data-mode': mode,
            onclick: () => this._showMode(mode),
        }, [
            el('span', { class: 'photos-nav__tab-icon' }, icon),
            el('span', { class: 'photos-nav__tab-label' }, label),
        ]);
        return btn;
    }

    _actionBtn(label, icon, onClick) {
        return el('button', {
            class: 'photos-action-btn',
            title: label,
            onclick: onClick,
        }, [el('span', {}, icon), el('span', { class: 'photos-action-btn__label' }, label)]);
    }

    _buildGalleryToolbar() {
        const sortSelect = el('select', {
            class: 'photos-toolbar__select',
            onchange: (e) => { this.sortMode = e.target.value; localStorage.setItem(SORT_KEY, this.sortMode); this._refreshGallery(); },
        }, [
            el('option', { value: 'date' }, 'Newest First'),
            el('option', { value: 'date-old' }, 'Oldest First'),
            el('option', { value: 'name' }, 'By Name'),
            el('option', { value: 'size' }, 'By Size'),
        ]);
        sortSelect.value = this.sortMode;

        const viewToggle = el('div', { class: 'photos-toolbar__view-toggle' }, [
            el('button', {
                class: `photos-toolbar__view-btn${this.viewMode === 'grid' ? ' is-active' : ''}`,
                onclick: () => { this.viewMode = 'grid'; localStorage.setItem(VIEW_KEY, 'grid'); this._refreshGallery(); },
                title: 'Grid view',
            }, '\u25A6'),
            el('button', {
                class: `photos-toolbar__view-btn${this.viewMode === 'list' ? ' is-active' : ''}`,
                onclick: () => { this.viewMode = 'list'; localStorage.setItem(VIEW_KEY, 'list'); this._refreshGallery(); },
                title: 'List view',
            }, '\u2630'),
        ]);

        const batchBar = el('div', { class: 'photos-toolbar__batch', hidden: true }, [
            el('span', { class: 'photos-toolbar__batch-count' }, '0 selected'),
            el('button', { class: 'photos-batch-btn', onclick: () => this._batchEdit() }, 'Edit'),
            el('button', { class: 'photos-batch-btn', onclick: () => this._batchDownload() }, 'Download'),
            el('button', { class: 'photos-batch-btn photos-batch-btn--danger', onclick: () => this._batchDelete() }, 'Delete'),
        ]);
        this._batchBar = batchBar;

        return el('div', { class: 'photos-toolbar' }, [sortSelect, viewToggle, batchBar]);
    }

    // ─── Mode Switching ───────────────────────────────────────

    _showMode(mode) {
        this.mode = mode;
        this._galleryView.hidden = mode !== 'gallery';
        this._editorView.hidden = mode !== 'editor';
        this._wallpaperView.hidden = mode !== 'wallpaper';

        // Update nav tabs
        this._navBar.querySelectorAll('.photos-nav__tab').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.mode === mode);
        });

        if (mode === 'gallery') {
            this._refreshGallery();
        } else if (mode === 'wallpaper' && !this._wallpaperMgr) {
            this._wallpaperMgr = new WallpaperManager(this._wallpaperView, this.kernel);
            this._wallpaperMgr.init();
        }
    }

    // ─── Gallery ──────────────────────────────────────────────

    _refreshGallery() {
        const items = this._getSortedGallery();
        this._galleryGrid.innerHTML = '';
        this._emptyState.hidden = items.length > 0;
        this._galleryGrid.hidden = items.length === 0;

        this._galleryGrid.classList.toggle('photos-gallery__grid--list', this.viewMode === 'list');

        // Update view toggle buttons
        const viewBtns = this._galleryToolbar?.querySelectorAll('.photos-toolbar__view-btn');
        viewBtns?.forEach(btn => {
            const isGrid = btn.textContent === '\u25A6';
            btn.classList.toggle('is-active', (isGrid && this.viewMode === 'grid') || (!isGrid && this.viewMode === 'list'));
        });

        for (const item of items) {
            const thumb = this._createThumbnail(item);
            this._galleryGrid.appendChild(thumb);
        }
    }

    _createThumbnail(item) {
        const isSelected = this.selectedIds.has(item.id);
        const card = el('div', {
            class: `photos-thumb${isSelected ? ' is-selected' : ''}`,
            'data-id': item.id,
        });

        const img = el('img', {
            class: 'photos-thumb__img',
            src: item.thumbnail || item.dataUrl,
            alt: item.name,
            loading: 'lazy',
            draggable: 'false',
        });

        const info = el('div', { class: 'photos-thumb__info' }, [
            el('div', { class: 'photos-thumb__name' }, item.name),
            el('div', { class: 'photos-thumb__meta' }, `${item.width}\u00D7${item.height} \u00B7 ${this._formatSize(item.size)}`),
        ]);

        const overlay = el('div', { class: 'photos-thumb__overlay' }, [
            el('button', {
                class: 'photos-thumb__btn',
                title: 'Edit',
                onclick: (e) => { e.stopPropagation(); this._openEditorForItem(item); },
            }, '\u270F\uFE0F'),
            el('button', {
                class: 'photos-thumb__btn',
                title: 'Set as wallpaper',
                onclick: (e) => { e.stopPropagation(); this._setAsWallpaper(item); },
            }, '\uD83C\uDF05'),
            el('button', {
                class: 'photos-thumb__btn',
                title: 'Download',
                onclick: (e) => { e.stopPropagation(); this._downloadItem(item); },
            }, '\u2B07\uFE0F'),
            el('button', {
                class: 'photos-thumb__btn photos-thumb__btn--danger',
                title: 'Delete',
                onclick: (e) => { e.stopPropagation(); this._deleteItem(item.id); },
            }, '\uD83D\uDDD1'),
        ]);

        const checkbox = el('div', {
            class: `photos-thumb__check${isSelected ? ' is-checked' : ''}`,
            onclick: (e) => {
                e.stopPropagation();
                this._toggleSelect(item.id);
            },
        }, isSelected ? '\u2713' : '');

        card.append(img, info, overlay, checkbox);
        card.addEventListener('click', () => this._openEditorForItem(item));
        card.addEventListener('dblclick', () => this._openEditorForItem(item));

        return card;
    }

    _toggleSelect(id) {
        if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
        } else {
            this.selectedIds.add(id);
        }
        this._refreshGallery();
        this._updateBatchBar();
    }

    _updateBatchBar() {
        const count = this.selectedIds.size;
        this._batchBar.hidden = count === 0;
        const countEl = this._batchBar.querySelector('.photos-toolbar__batch-count');
        if (countEl) countEl.textContent = `${count} selected`;
    }

    // ─── Editor Integration ───────────────────────────────────

    _openEditorForItem(item) {
        this._openEditor(item.dataUrl, item.name);
    }

    _openEditor(dataUrl, name) {
        this._showMode('editor');
        this._editorView.innerHTML = '';

        if (this.editor) this.editor.destroy();

        this.editor = new PhotoEditor({
            container: this._editorView,
            onSave: (blob, filename) => this._saveEditedImage(blob, filename),
            onBack: () => this._showMode('gallery'),
        });

        if (dataUrl) {
            this.editor.loadFromDataUrl(dataUrl, name);
        } else {
            this.editor.showEmpty();
        }
    }

    _saveEditedImage(blob, filename) {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            const img = new Image();
            img.onload = () => {
                const id = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const item = {
                    id,
                    name: filename || `edited_${Date.now()}.png`,
                    dataUrl,
                    thumbnail: this._makeThumbnail(img),
                    width: img.width,
                    height: img.height,
                    size: blob.size,
                    created: Date.now(),
                    modified: Date.now(),
                };
                this.gallery.unshift(item);
                this._saveGallery();
                this._showMode('gallery');
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(blob);
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
            const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
            if (files.length) this._importFiles(files);
        });
    }

    // ─── Clipboard Paste ──────────────────────────────────────

    _onPaste(e) {
        // Only handle if Photos app is active
        const appLayer = this.root?.closest('.m-app-layer');
        if (!appLayer || appLayer.hidden) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = () => {
                        this._openEditor(reader.result, `pasted_${Date.now()}.png`);
                    };
                    reader.readAsDataURL(blob);
                }
                return;
            }
        }
    }

    async _pasteFromClipboard() {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imgType = item.types.find(t => t.startsWith('image/'));
                if (imgType) {
                    const blob = await item.getType(imgType);
                    const reader = new FileReader();
                    reader.onload = () => {
                        this._openEditor(reader.result, `pasted_${Date.now()}.png`);
                    };
                    reader.readAsDataURL(blob);
                    return;
                }
            }
        } catch {
            // Fallback: show file picker
            this._triggerImport();
        }
    }

    // ─── File Import ──────────────────────────────────────────

    _triggerImport() {
        this._fileInput.click();
    }

    _handleFileSelect(e) {
        const files = [...e.target.files].filter(f => f.type.startsWith('image/'));
        if (files.length) this._importFiles(files);
        this._fileInput.value = '';
    }

    _importFiles(files) {
        let loaded = 0;
        for (const file of files) {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result;
                const img = new Image();
                img.onload = () => {
                    const id = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    this.gallery.push({
                        id,
                        name: file.name,
                        dataUrl,
                        thumbnail: this._makeThumbnail(img),
                        width: img.width,
                        height: img.height,
                        size: file.size,
                        created: Date.now(),
                        modified: Date.now(),
                    });
                    loaded++;
                    if (loaded === files.length) {
                        this._saveGallery();
                        this._refreshGallery();
                    }
                };
                img.src = dataUrl;
            };
            reader.readAsDataURL(file);
        }
    }

    // ─── Wallpaper Integration ────────────────────────────────

    _setAsWallpaper(item) {
        try {
            localStorage.setItem('yancotab_wallpaper_custom', item.dataUrl);
            localStorage.setItem('yancotab_wallpaper', 'custom');
            const shell = document.getElementById('app-shell');
            if (shell) {
                shell.style.backgroundImage = `url(${item.dataUrl})`;
                shell.style.backgroundSize = 'cover';
                shell.style.backgroundPosition = 'center';
            }
            window.dispatchEvent(new CustomEvent('yancotab:wallpaper-changed', { detail: { type: 'custom' } }));
        } catch (e) {
            console.warn('[Photos] Failed to set wallpaper:', e);
        }
    }

    // ─── Batch Operations ─────────────────────────────────────

    _batchEdit() {
        const firstId = [...this.selectedIds][0];
        const item = this.gallery.find(g => g.id === firstId);
        if (item) this._openEditorForItem(item);
    }

    _batchDownload() {
        for (const id of this.selectedIds) {
            const item = this.gallery.find(g => g.id === id);
            if (item) this._downloadItem(item);
        }
        this.selectedIds.clear();
        this._updateBatchBar();
    }

    _batchDelete() {
        for (const id of this.selectedIds) {
            this._deleteItem(id, false);
        }
        this.selectedIds.clear();
        this._saveGallery();
        this._refreshGallery();
        this._updateBatchBar();
    }

    // ─── Keyboard ─────────────────────────────────────────────

    _onKeydown(e) {
        const appLayer = this.root?.closest('.m-app-layer');
        if (!appLayer || appLayer.hidden) return;

        if (e.key === 'Delete' && this.selectedIds.size > 0 && this.mode === 'gallery') {
            this._batchDelete();
        }
    }

    // ─── Storage ──────────────────────────────────────────────

    _loadGallery() {
        try {
            const raw = localStorage.getItem(GALLERY_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch { return []; }
    }

    _saveGallery() {
        try {
            localStorage.setItem(GALLERY_KEY, JSON.stringify(this.gallery));
        } catch (e) {
            console.warn('[Photos] Storage full, clearing old items');
            // Remove oldest items if storage is full
            while (this.gallery.length > 5) {
                this.gallery.pop();
            }
            try { localStorage.setItem(GALLERY_KEY, JSON.stringify(this.gallery)); } catch {}
        }
    }

    _getSortedGallery() {
        const items = [...this.gallery];
        switch (this.sortMode) {
            case 'date': return items.sort((a, b) => b.created - a.created);
            case 'date-old': return items.sort((a, b) => a.created - b.created);
            case 'name': return items.sort((a, b) => a.name.localeCompare(b.name));
            case 'size': return items.sort((a, b) => b.size - a.size);
            default: return items;
        }
    }

    // ─── Helpers ──────────────────────────────────────────────

    _makeThumbnail(img, size = 200) {
        const canvas = document.createElement('canvas');
        const scale = Math.min(size / img.width, size / img.height);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.7);
    }

    _downloadItem(item) {
        const a = document.createElement('a');
        a.href = item.dataUrl;
        a.download = item.name;
        a.click();
    }

    _deleteItem(id, save = true) {
        this.gallery = this.gallery.filter(g => g.id !== id);
        if (save) {
            this._saveGallery();
            this._refreshGallery();
        }
    }

    _formatSize(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let size = bytes;
        while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
        return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
    }
}
