/**
 * PhotosApp — Lightbox + Editor + Wallpaper.
 *
 * Lightbox view (default) shows the new 3-column UI: side rail with
 * Library filters, stage with focus preview + hex grid + month
 * scrubber, info panel with EXIF + send-to actions.
 *
 * Editor and Wallpaper modes are preserved from the previous shell.
 * Drop / paste / import flows still hand off to the editor for
 * single-image edit + save.
 */

import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { showConfirm } from '../ui/components/YancoModal.js';
import { PhotoEditor } from './photos/PhotoEditor.js';
import { WallpaperManager } from './photos/WallpaperManager.js';
import { ocrService } from '../services/ocrService.js';
import { buildLightbox } from './photos/lightbox.js';
import {
  loadFavorites, toggleFavorite, removeFavorite,
} from './photos/persistence.js';
import {
  PHOTOS_DIR,
  loadGallery, savePhoto, deletePhoto, migrateLegacyGallery,
  basename, makeThumbnail,
} from './photos/storage.js';

const TABS = [
  { id: 'lightbox',  label: 'Lightbox' },
  { id: 'editor',    label: 'Editor' },
  { id: 'wallpaper', label: 'Wallpapers' },
];

function css(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  return link;
}

export class PhotosApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Photos', id: 'photos', icon: '🖼️' };

    this.mode = 'lightbox';
    this.sortMode = kernel.storage.load('yancotab_photos_sort') || 'date';
    this.gallery = [];
    this.editor = null;
    this.fs = kernel.getService('fs');
    this._favorites = loadFavorites(kernel);
    this._styleLinks = [];

    this._boundPaste = this._onPaste.bind(this);
    this._boundKeydown = this._onKeydown.bind(this);
  }

  async init(options = {}) {
    this._styleLinks = [css('css/photos-lightbox.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));

    this.root = el('div', { class: 'app-window app-photos-lightbox', tabindex: '0' });

    migrateLegacyGallery(this.fs);
    this.gallery = loadGallery(this.fs);

    this._buildUI();
    this._showMode('lightbox');

    document.addEventListener('paste', this._boundPaste);
    document.addEventListener('keydown', this._boundKeydown);

    if (options?.imageData) {
      this._openEditor(options.imageData, options.imageName);
    } else if (options?.filePath) {
      const file = this.fs.read(options.filePath);
      if (file && file.content) {
        this._openEditor(file.content, basename(options.filePath));
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
    if (this._styleLinks) {
      for (const l of this._styleLinks) l.remove();
      this._styleLinks = [];
    }
    ocrService.destroy();
    super.destroy();
  }

  // ─── UI Build ─────────────────────────────────────────────

  _buildUI() {
    this._tabStrip = el('div', { class: 'lb-titlebar' });
    const tabs = el('div', { class: 'lb-tabs' });
    for (const def of TABS) {
      const btn = el('button', {
        type: 'button',
        class: `lb-tab${this.mode === def.id ? ' is-active' : ''}`,
        'data-mode': def.id,
        onclick: () => this._showMode(def.id),
      }, def.label);
      tabs.appendChild(btn);
    }
    this._tabStrip.appendChild(tabs);
    const importBtn = el('button', {
      type: 'button', class: 'lb-action-btn',
      title: 'Import images',
      onclick: () => this._triggerImport(),
    }, '+ Import');
    const pasteBtn = el('button', {
      type: 'button', class: 'lb-action-btn',
      title: 'Paste from clipboard',
      onclick: () => this._pasteFromClipboard(),
    }, '⌘V Paste');
    this._tabStrip.appendChild(el('div', { class: 'lb-actions' }, [importBtn, pasteBtn]));

    this._lightbox = buildLightbox({
      onEdit: (path) => this._editPath(path),
      onSetWallpaper: (path) => this._setWallpaperByPath(path),
      onOpenInBrowser: (path) => this._openInBrowser(path),
      onSendToFiles: () => this._showInFiles(),
      onDelete: (path) => this._confirmDeleteByPath(path),
      onToggleFavorite: (path) => {
        toggleFavorite(this.kernel, path);
        this._favorites = loadFavorites(this.kernel);
        this._lightbox.setPhotos(this.gallery);
      },
      getFavorites: () => this._favorites,
      getSortMode: () => this.sortMode,
    });

    this._editorView = el('div', { class: 'lb-editor-wrap' });
    this._wallpaperView = el('div', { class: 'lb-wallpaper-wrap' });

    this._dropOverlay = el('div', { class: 'lb-drop-overlay' }, [
      el('div', { class: 'lb-drop-content' }, [
        el('div', { class: 'lb-drop-icon' }, '⬇'),
        el('div', {}, 'Drop images here'),
      ]),
    ]);

    this._fileInput = el('input', {
      type: 'file',
      accept: 'image/*',
      hidden: true,
      onchange: (e) => this._handleFileSelect(e),
    });
    this._fileInput.multiple = true;

    this.root.append(
      this._tabStrip,
      this._lightbox.root,
      this._editorView,
      this._wallpaperView,
      this._dropOverlay,
      this._fileInput,
    );

    this._bindDragDrop();
    this._refreshLightbox();
  }

  _showMode(mode) {
    this.mode = mode;
    this._lightbox.root.style.display = mode === 'lightbox' ? '' : 'none';
    this._editorView.style.display = mode === 'editor' ? '' : 'none';
    this._wallpaperView.style.display = mode === 'wallpaper' ? '' : 'none';

    this._tabStrip.querySelectorAll('.lb-tab').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === mode);
    });

    if (mode === 'lightbox') {
      this.gallery = loadGallery(this.fs);
      this._refreshLightbox();
    } else if (mode === 'wallpaper' && !this._wallpaperMgr) {
      this._wallpaperMgr = new WallpaperManager(this._wallpaperView, this.kernel);
      this._wallpaperMgr.init();
    }
  }

  _refreshLightbox() { this._lightbox.setPhotos(this.gallery); }

  // ─── Editor Integration ───────────────────────────────────

  _editPath(path) {
    const item = this.gallery.find((g) => g.path === path);
    if (item) this._openEditor(item.dataUrl, item.name);
  }

  _openEditor(dataUrl, name) {
    this._showMode('editor');
    this._editorView.innerHTML = '';
    if (this.editor) this.editor.destroy();
    this.editor = new PhotoEditor({
      container: this._editorView,
      onSave: (blob, filename) => this._saveEditedImage(blob, filename),
      onBack: () => this._showMode('lightbox'),
    });
    if (dataUrl) this.editor.loadFromDataUrl(dataUrl, name);
    else this.editor.showEmpty();
  }

  _saveEditedImage(blob, filename) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        const photoId = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const name = filename || `edited_${Date.now()}.png`;
        savePhoto(this.fs, name, dataUrl, {
          mime: 'image/png',
          size: blob.size,
          width: img.width,
          height: img.height,
          thumbnail: makeThumbnail(img),
          photoId,
        });
        this.gallery = loadGallery(this.fs);
        this._showMode('lightbox');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(blob);
  }

  // ─── Send-to actions ──────────────────────────────────────

  _setWallpaperByPath(path) {
    const item = this.gallery.find((g) => g.path === path);
    if (!item) return;
    try {
      this.kernel.storage.save('yancotab_wallpaper_custom', item.dataUrl);
      this.kernel.storage.save('yancotab_wallpaper', 'custom');
      const shell = document.getElementById('app-shell');
      if (shell) {
        shell.style.backgroundImage = `url(${item.dataUrl})`;
        shell.style.backgroundSize = 'cover';
        shell.style.backgroundPosition = 'center';
      }
      window.dispatchEvent(new CustomEvent('yancotab:wallpaper-changed', { detail: { type: 'custom' } }));
      this.kernel?.emit?.('toast', { message: 'Wallpaper updated', type: 'success' });
    } catch (e) {
      console.warn('[Photos] Failed to set wallpaper:', e);
    }
  }

  _openInBrowser(path) {
    const item = this.gallery.find((g) => g.path === path);
    if (!item) return;
    const a = document.createElement('a');
    a.href = item.dataUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  _showInFiles() {
    this.kernel?.emit?.('app:open', 'files', { path: PHOTOS_DIR });
  }

  async _confirmDeleteByPath(path) {
    const item = this.gallery.find((g) => g.path === path);
    if (!item) return;
    const ok = await showConfirm('Delete photo',
      `Move "${item.name || 'photo'}" to trash?`,
      { danger: true });
    if (!ok) return;
    deletePhoto(this.fs, path);
    removeFavorite(this.kernel, path);
    this._favorites = loadFavorites(this.kernel);
    this.gallery = loadGallery(this.fs);
    this._refreshLightbox();
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
      const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
      if (files.length) this._importFiles(files);
    });
  }

  // ─── Clipboard Paste ──────────────────────────────────────

  _onPaste(e) {
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
          reader.onload = () => this._openEditor(reader.result, `pasted_${Date.now()}.png`);
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
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          const reader = new FileReader();
          reader.onload = () => this._openEditor(reader.result, `pasted_${Date.now()}.png`);
          reader.readAsDataURL(blob);
          return;
        }
      }
    } catch {
      this._triggerImport();
    }
  }

  // ─── File Import ──────────────────────────────────────────

  _triggerImport() { this._fileInput.click(); }

  _handleFileSelect(e) {
    const files = [...e.target.files].filter((f) => f.type.startsWith('image/'));
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
          savePhoto(this.fs, file.name, dataUrl, {
            mime: file.type || 'image/png',
            size: file.size,
            width: img.width,
            height: img.height,
            thumbnail: makeThumbnail(img),
            photoId,
          });
          loaded++;
          if (loaded === files.length) {
            this.gallery = loadGallery(this.fs);
            this._refreshLightbox();
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  }

  // ─── Keyboard ─────────────────────────────────────────────

  _onKeydown(e) {
    const appLayer = this.root?.closest('.m-app-layer');
    if (!appLayer || appLayer.hidden) return;
    if (this.mode !== 'lightbox') return;
    const tag = (e.target?.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === 'ArrowLeft')      { this._lightbox.keyMove(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { this._lightbox.keyMove(1);  e.preventDefault(); }
    else if (e.key === 'ArrowUp')    { this._lightbox.keyMoveRow(-1); e.preventDefault(); }
    else if (e.key === 'ArrowDown')  { this._lightbox.keyMoveRow(1);  e.preventDefault(); }
    else if (e.key === 'Home')       { this._lightbox.keyMoveTo('first'); e.preventDefault(); }
    else if (e.key === 'End')        { this._lightbox.keyMoveTo('last');  e.preventDefault(); }
    else if (e.key === 'Enter') {
      const sel = this._lightbox.getSelected();
      if (sel) { this._editPath(sel); e.preventDefault(); }
    } else if (e.key === 'f' || e.key === 'F') {
      const sel = this._lightbox.getSelected();
      if (sel) {
        toggleFavorite(this.kernel, sel);
        this._favorites = loadFavorites(this.kernel);
        this._refreshLightbox();
        e.preventDefault();
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const sel = this._lightbox.getSelected();
      if (sel) { this._confirmDeleteByPath(sel); e.preventDefault(); }
    }
  }
}
