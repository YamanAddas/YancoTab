/**
 * PhotosApp — 3-in-1: Gallery + Image Editor + Wallpaper Manager
 *
 * Gallery:   View saved images, drag-drop import, paste from clipboard
 * Editor:    Full image editor with crop, adjust, filters, annotate, color tools
 * Wallpaper: Browse curated wallpapers, set rotation schedules
 *
 * Storage:   All photos live in /home/photos via FileSystemService,
 *            making them accessible from the Files app too.
 */
import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { PhotoEditor } from './photos/PhotoEditor.js';
import { WallpaperManager } from './photos/WallpaperManager.js';

const VIEW_KEY = 'yancotab_photos_view';
const SORT_KEY = 'yancotab_photos_sort';
const PHOTOS_DIR = '/home/photos';
const LEGACY_GALLERY_KEY = 'yancotab_photos_gallery';
const MIGRATION_FLAG = 'yancotab_photos_migrated_v1';

export class PhotosApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Photos', id: 'photos', icon: '\uD83D\uDDBC\uFE0F' };

        this.mode = 'gallery'; // gallery | editor | wallpaper
        this.viewMode = localStorage.getItem(VIEW_KEY) || 'grid';
        this.sortMode = localStorage.getItem(SORT_KEY) || 'date';
        this.gallery = [];
        this.selectedIds = new Set();
        this.editor = null;
        this.fs = kernel.getService('fs');

        this._boundPaste = this._onPaste.bind(this);
        this._boundKeydown = this._onKeydown.bind(this);
    }

    async init(options = {}) {
        this.root = el('div', { class: 'app-window app-photos' });

        // Migrate legacy gallery data to filesystem
        this._migrateLegacyGallery();

        // Load gallery from filesystem
        this.gallery = this._loadGalleryFromFS();

        this._buildUI();
        this._showMode('gallery');

        document.addEventListener('paste', this._boundPaste);
        document.addEventListener('keydown', this._boundKeydown);

        // If launched with an image (from Files app)
        if (options?.imageData) {
            this._openEditor(options.imageData, options.imageName);
        } else if (options?.filePath) {
            // Opened from Files app with a filesystem path
            const file = this.fs.read(options.filePath);
            if (file && file.content) {
                this._openEditor(file.content, this._basename(options.filePath));
            }
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

    // ─── Filesystem-backed Storage ───────────────────────────

    _loadGalleryFromFS() {
        if (!this.fs) return [];
        const items = this.fs.list(PHOTOS_DIR);
        return items
            .filter(item => item.type === 'file')
            .map(item => ({
                id: item.meta?.photoId || item.path,
                path: item.path,
                name: this._basename(item.path),
                dataUrl: item.content,
                thumbnail: item.meta?.thumbnail || item.content,
                width: item.meta?.width || 0,
                height: item.meta?.height || 0,
                size: item.meta?.size || 0,
                created: item.meta?.created || Date.now(),
                modified: item.meta?.modified || Date.now(),
            }));
    }

    _savePhotoToFS(name, dataUrl, meta = {}) {
        if (!this.fs) return null;
        const cleanName = this._sanitizeFilename(name);
        let targetPath = `${PHOTOS_DIR}/${cleanName}`;

        // Resolve collision
        if (this.fs.exists(targetPath)) {
            const ext = cleanName.includes('.') ? cleanName.slice(cleanName.lastIndexOf('.')) : '';
            const base = cleanName.includes('.') ? cleanName.slice(0, cleanName.lastIndexOf('.')) : cleanName;
            let counter = 2;
            while (this.fs.exists(targetPath)) {
                targetPath = `${PHOTOS_DIR}/${base} (${counter})${ext}`;
                counter++;
            }
        }

        this.fs.write(targetPath, dataUrl, {
            mime: meta.mime || 'image/png',
            size: meta.size || 0,
            width: meta.width || 0,
            height: meta.height || 0,
            thumbnail: meta.thumbnail || '',
            photoId: meta.photoId || `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            source: 'photos',
            created: meta.created || Date.now(),
        });

        return targetPath;
    }

    _deletePhotoFromFS(photoPath) {
        if (!this.fs || !photoPath) return;
        // Move to trash instead of permanent delete
        const name = this._basename(photoPath);
        const trashPath = `/home/trash/${name}`;
        try {
            this.fs.rename(photoPath, trashPath);
        } catch {
            // If rename fails (e.g. collision in trash), just delete
            this.fs.delete(photoPath);
        }
    }

    _migrateLegacyGallery() {
        if (localStorage.getItem(MIGRATION_FLAG)) return;
        if (!this.fs) return;

        try {
            const raw = localStorage.getItem(LEGACY_GALLERY_KEY);
            if (!raw) {
                localStorage.setItem(MIGRATION_FLAG, '1');
                return;
            }

            const oldGallery = JSON.parse(raw);
            if (!Array.isArray(oldGallery) || oldGallery.length === 0) {
                localStorage.setItem(MIGRATION_FLAG, '1');
                return;
            }

            console.log(`[Photos] Migrating ${oldGallery.length} photos to filesystem...`);
            for (const item of oldGallery) {
                if (!item.dataUrl) continue;
                this._savePhotoToFS(item.name || `photo_${item.id}.png`, item.dataUrl, {
                    mime: 'image/png',
                    size: item.size || 0,
                    width: item.width || 0,
                    height: item.height || 0,
                    thumbnail: item.thumbnail || '',
                    photoId: item.id,
                    created: item.created || Date.now(),
                });
            }

            // Clean up legacy storage
            localStorage.removeItem(LEGACY_GALLERY_KEY);
            localStorage.setItem(MIGRATION_FLAG, '1');
            console.log('[Photos] Migration complete.');
        } catch (e) {
            console.warn('[Photos] Migration failed:', e);
            // Still mark as migrated to avoid retrying
            localStorage.setItem(MIGRATION_FLAG, '1');
        }
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
            this._btnExportPdf = el('button', { class: 'photos-batch-btn photos-batch-btn--pdf', onclick: () => this._exportSelectedToPDF() }, '\uD83D\uDCC4 Export PDF'),
            el('button', { class: 'photos-batch-btn photos-batch-btn--danger', onclick: () => this._batchDelete() }, 'Delete'),
        ]);
        this._batchBar = batchBar;

        return el('div', { class: 'photos-toolbar' }, [sortSelect, viewToggle, batchBar]);
    }

    // ─── Mode Switching ───────────────────────────────────────

    _showMode(mode) {
        this.mode = mode;
        this._galleryView.style.display = mode === 'gallery' ? '' : 'none';
        this._editorView.style.display = mode === 'editor' ? '' : 'none';
        this._wallpaperView.style.display = mode === 'wallpaper' ? '' : 'none';

        // Update nav tabs
        this._navBar.querySelectorAll('.photos-nav__tab').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.mode === mode);
        });

        if (mode === 'gallery') {
            // Reload from filesystem to pick up any external changes
            this.gallery = this._loadGalleryFromFS();
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
        this._emptyState.style.display = items.length > 0 ? 'none' : '';
        this._galleryGrid.style.display = items.length === 0 ? 'none' : '';

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
                onclick: (e) => { e.stopPropagation(); this._deleteItem(item); },
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
        this._batchBar.style.display = count === 0 ? 'none' : '';
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
                const photoId = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const name = filename || `edited_${Date.now()}.png`;
                const thumbnail = this._makeThumbnail(img);

                this._savePhotoToFS(name, dataUrl, {
                    mime: 'image/png',
                    size: blob.size,
                    width: img.width,
                    height: img.height,
                    thumbnail,
                    photoId,
                });

                // Reload and show gallery
                this.gallery = this._loadGalleryFromFS();
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
                    const photoId = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    this._savePhotoToFS(file.name, dataUrl, {
                        mime: file.type || 'image/png',
                        size: file.size,
                        width: img.width,
                        height: img.height,
                        thumbnail: this._makeThumbnail(img),
                        photoId,
                    });

                    loaded++;
                    if (loaded === files.length) {
                        this.gallery = this._loadGalleryFromFS();
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
            const item = this.gallery.find(g => g.id === id);
            if (item) this._deleteItem(item, false);
        }
        this.selectedIds.clear();
        this.gallery = this._loadGalleryFromFS();
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

    // ─── Sorting ──────────────────────────────────────────────

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

    _deleteItem(item, refresh = true) {
        this._deletePhotoFromFS(item.path);
        if (refresh) {
            this.gallery = this._loadGalleryFromFS();
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

    _basename(path) {
        return (path || '').split('/').pop() || '';
    }

    _sanitizeFilename(name) {
        return (name || 'photo.png')
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, ' ')
            .trim() || 'photo.png';
    }

    // ─── Images → PDF Export ──────────────────────────────────

    async _exportSelectedToPDF() {
        const selectedItems = this.gallery.filter(g => this.selectedIds.has(g.id));
        if (!selectedItems.length) return;

        const origText = this._btnExportPdf.textContent;
        this._btnExportPdf.textContent = '\u23F3 Building...';
        this._btnExportPdf.disabled = true;

        try {
            const pages = await Promise.all(selectedItems.map(item => this._imageToJpegPage(item)));
            const validPages = pages.filter(Boolean);
            if (!validPages.length) return;

            const pdfBytes = this._buildImagesPdf(validPages);
            const date = new Date().toISOString().slice(0, 10);
            this._downloadBytes(pdfBytes, `photos_${date}.pdf`, 'application/pdf');
        } finally {
            this._btnExportPdf.textContent = origText;
            this._btnExportPdf.disabled = false;
        }
    }

    _imageToJpegPage(item) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                // Cap at 2× A4 resolution (1190×1684 px) to keep PDF sizes manageable
                const MAX_W = 1190;
                const MAX_H = 1684;
                const scale = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.naturalWidth * scale);
                canvas.height = Math.round(img.naturalHeight * scale);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff'; // white background for PNGs with transparency
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const jpeg = canvas.toDataURL('image/jpeg', 0.88);
                resolve({
                    bytes: this._base64ToBytes(jpeg.split(',')[1]),
                    width: canvas.width,
                    height: canvas.height,
                });
            };
            img.onerror = () => resolve(null);
            img.src = item.dataUrl;
        });
    }

    _buildImagesPdf(pages) {
        // Pure-JS minimal PDF (PDF 1.4) with one JPEG image per page.
        // Object layout:
        //   1: Catalog, 2: Pages
        //   Per page i: (3+i*3)=Page, (4+i*3)=Content stream, (5+i*3)=Image XObject
        const PAGE_W = 595; // A4 in points (1 pt = 1/72 inch)
        const PAGE_H = 842;
        const MARGIN = 20;
        const n = pages.length;
        const totalObjs = 2 + n * 3;

        const parts = [];
        const offsets = {};
        const enc = new TextEncoder();
        const push = (str) => parts.push(enc.encode(str));
        const pushBytes = (b) => parts.push(b);
        const byteLen = () => parts.reduce((s, p) => s + p.length, 0);

        // Header
        push('%PDF-1.4\n');

        // Object 1: Catalog
        offsets[1] = byteLen();
        push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

        // Object 2: Pages
        offsets[2] = byteLen();
        const kids = Array.from({ length: n }, (_, i) => `${3 + i * 3} 0 R`).join(' ');
        push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`);

        for (let i = 0; i < n; i++) {
            const { bytes, width, height } = pages[i];
            const pageObjId = 3 + i * 3;
            const contentObjId = 4 + i * 3;
            const imageObjId = 5 + i * 3;

            // Scale image to fit page with margins (never upscale)
            const availW = PAGE_W - MARGIN * 2;
            const availH = PAGE_H - MARGIN * 2;
            const scale = Math.min(availW / width, availH / height, 1);
            const imgW = Math.round(width * scale);
            const imgH = Math.round(height * scale);
            const x = Math.round(MARGIN + (availW - imgW) / 2);
            const y = Math.round(MARGIN + (availH - imgH) / 2);

            const content = `q ${imgW} 0 0 ${imgH} ${x} ${y} cm /Im1 Do Q\n`;

            // Page object
            offsets[pageObjId] = byteLen();
            push(`${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentObjId} 0 R /Resources << /XObject << /Im1 ${imageObjId} 0 R >> >> >>\nendobj\n`);

            // Content stream
            offsets[contentObjId] = byteLen();
            push(`${contentObjId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

            // Image XObject (raw JPEG bytes via DCTDecode)
            offsets[imageObjId] = byteLen();
            push(`${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
            pushBytes(bytes);
            push('\nendstream\nendobj\n');
        }

        // Cross-reference table
        const xrefOffset = byteLen();
        push(`xref\n0 ${totalObjs + 1}\n`);
        push('0000000000 65535 f \n'); // free entry for obj 0
        for (let i = 1; i <= totalObjs; i++) {
            push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
        }

        // Trailer
        push(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

        // Concatenate all parts into one Uint8Array
        const totalLen = parts.reduce((s, p) => s + p.length, 0);
        const out = new Uint8Array(totalLen);
        let pos = 0;
        for (const p of parts) { out.set(p, pos); pos += p.length; }
        return out;
    }

    _base64ToBytes(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    _downloadBytes(bytes, filename, mime) {
        const blob = new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
}
