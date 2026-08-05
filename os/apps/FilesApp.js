/**
 * FilesApp — "Vault" cosmic redesign.
 *
 * 3-column layout: smart-rooms + folders + fuel gauge sidebar /
 * honeycomb stage with hex folder cells + floating file coins /
 * preview panel with metadata + send-to.
 *
 * Replaces the previous 2018-LOC implementation. The shell here
 * owns fs IO and the kernel hooks; pure engine + view modules under
 * os/apps/files/ do the actual work.
 *
 * Preserves the public API surface that other apps rely on:
 *   - init({ path }) navigates to that directory
 *   - opens text files in Notes, images in Photos, PDFs in Codex
 */

import { App } from '../core/App.js';
import { el, cssLink } from '../utils/dom.js';
import { safeSave } from '../utils/safeSave.js';
import { applyStoredWallpaper, isWallpaperImage } from '../theme/wallpaper.js';
import { showConfirm, showPrompt } from '../ui/components/YancoModal.js';
import { buildVault } from './files/vault.js';
import {
  loadPinned, togglePin, removePin, renamePin,
  loadViewMode, saveViewMode,
} from './files/persistence.js';

const HOME_PATH = '/home';
const TRASH_PATH = '/home/trash';

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'json', 'csv', 'log', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'js', 'ts', 'css', 'html', 'htm']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);


export class FilesApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Files', id: 'files', icon: '📁' };
    this.fs = this.kernel.getService('fs');
    this._pinned = loadPinned(this.kernel);
    this._viewMode = loadViewMode(this.kernel);
    this._styleLinks = [];
    this._boundKeydown = this._onKeydown.bind(this);
  }

  async init(options = {}) {
    this._styleLinks = [cssLink('css/files-vault.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));

    this.root = el('div', { class: 'app-window app-files-vault', tabindex: '0' });

    // Ensure /home exists (FileSystemService usually does this on boot).
    if (this.fs && !this.fs.exists(HOME_PATH)) this.fs.mkdir(HOME_PATH);

    // Build title bar (tabs are placeholder per the mock).
    const titlebar = el('div', { class: 'fv-titlebar' });
    const tabs = el('div', { class: 'fv-tabs' });
    for (const label of ['Vault']) {
      tabs.appendChild(el('button', {
        type: 'button', class: 'fv-tab is-active', disabled: 'disabled',
      }, label));
    }
    titlebar.appendChild(tabs);

    const importBtn = el('button', {
      type: 'button', class: 'fv-titlebar-btn',
      title: 'Import file', onclick: () => this._triggerImport(),
    }, '+ Import');
    const newFolderBtn = el('button', {
      type: 'button', class: 'fv-titlebar-btn',
      title: 'New folder', onclick: () => this._promptNewFolder(),
    }, '+ Folder');
    titlebar.appendChild(el('div', { class: 'fv-titlebar-actions' }, [newFolderBtn, importBtn]));

    // Build vault.
    this._vault = buildVault({
      listDir: (path) => this.fs?.list(path) || [],
      listAllFiles: () => this._listAllFiles(),
      getPinnedSet: () => this._pinned,
      getViewMode: () => this._viewMode,
      setViewMode: (m) => {
        this._viewMode = m;
        saveViewMode(this.kernel, m);
      },
      onOpenItem: (item) => this._openItem(item),
      onTogglePin: (item) => this._togglePin(item),
      onRename: (item) => this._renameItem(item),
      onDelete: (item) => this._deleteItem(item),
      onSendNotes: (item) => this._sendToNotes(item),
      onSendBrowser: (item) => this._sendToBrowser(item),
      onSendPhotos: (item) => this._sendToPhotos(item),
      onSendWallpaper: (item) => this._sendToWallpaper(item),
      onCopyPath: (item) => this._copyPath(item),
      onMoveFile: (sourcePath, targetDir) => this._moveFile(sourcePath, targetDir),
    });

    this._dropOverlay = el('div', { class: 'fv-drop-overlay' }, [
      el('div', { class: 'fv-drop-content' }, [
        el('div', { class: 'fv-drop-icon' }, '⬇'),
        el('div', {}, 'Drop file here'),
      ]),
    ]);

    this._fileInput = el('input', {
      type: 'file', hidden: true,
      onchange: (e) => this._handleFileSelect(e),
    });
    this._fileInput.multiple = true;

    this.root.append(titlebar, this._vault.root, this._dropOverlay, this._fileInput);

    // Honor payload.path: open at that directory if it exists.
    const requestedPath = (options?.path && this._isDirectory(options.path)) ? options.path : HOME_PATH;
    this._vault.setRoom({ kind: 'folder', path: requestedPath });

    document.addEventListener('keydown', this._boundKeydown);
    this._bindDragDrop();
    this._vault.render();
  }

  destroy() {
    document.removeEventListener('keydown', this._boundKeydown);
    if (this._vault) {
      this._vault.destroy();
      this._vault = null;
    }
    if (this._styleLinks) {
      for (const l of this._styleLinks) l.remove();
      this._styleLinks = [];
    }
    super.destroy();
  }

  // ── fs helpers ──

  _listAllFiles() {
    if (!this.fs) return [];
    const out = [];
    const stack = [HOME_PATH];
    const seen = new Set();
    let safety = 0;
    while (stack.length && safety < 4096) {
      safety++;
      const dir = stack.shift();
      if (seen.has(dir)) continue;
      seen.add(dir);
      const items = this.fs.list(dir) || [];
      for (const item of items) {
        if (!item || typeof item.path !== 'string') continue;
        out.push(item);
        if (item.type === 'directory') stack.push(item.path);
      }
    }
    return out;
  }

  _isDirectory(path) {
    try {
      const item = this.fs?.read(path);
      return !!(item && item.type === 'directory');
    } catch { return false; }
  }

  _basename(path) { return (path || '').split('/').pop() || ''; }
  _extension(path) {
    const name = this._basename(path);
    const dot = name.lastIndexOf('.');
    return dot < 0 || dot === 0 ? '' : name.slice(dot + 1).toLowerCase();
  }

  _resolveCollision(targetPath) {
    if (!this.fs?.exists(targetPath)) return targetPath;
    const dir = targetPath.slice(0, targetPath.lastIndexOf('/'));
    const name = this._basename(targetPath);
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let n = 2;
    while (n < 1000) {
      const candidate = `${dir}/${base} (${n})${ext}`;
      if (!this.fs.exists(candidate)) return candidate;
      n++;
    }
    return `${dir}/${base} (${Date.now()})${ext}`;
  }

  // ── Open routing (preserved from old FilesApp) ──

  _openItem(item) {
    if (!item) return;
    if (item.isDir) {
      this._vault.setRoom({ kind: 'folder', path: item.path });
      return;
    }
    this._openFile(item);
  }

  async _openFile(item) {
    if (!this.kernel?.processManager?.spawn) return;
    const ext = item.ext || this._extension(item.path);
    const content = typeof item.content === 'string' ? item.content : (this.fs?.read(item.path)?.content || '');

    if (TEXT_EXTENSIONS.has(ext)) {
      await this.kernel.processManager.spawn('notes', { path: item.path });
      return;
    }
    if (IMAGE_EXTENSIONS.has(ext) && content.startsWith('data:')) {
      await this.kernel.processManager.spawn('photos', { filePath: item.path });
      return;
    }
    if (ext === 'pdf' && content.startsWith('data:')) {
      await this.kernel.processManager.spawn('pdf-reader', { filePath: item.path });
      return;
    }
    // Fallback: trigger a download.
    if (content.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = content;
      a.download = item.name || 'file';
      a.click();
    } else {
      this.kernel?.emit?.('toast', { message: `No app registered for .${ext}`, type: 'info' });
    }
  }

  // ── Send-to actions ──

  _sendToNotes(item) {
    if (item.isDir) return;
    this.kernel?.processManager?.spawn?.('notes', { path: item.path });
  }
  _sendToBrowser(item) {
    if (item.isDir) return;
    const content = typeof item.content === 'string' ? item.content : (this.fs?.read(item.path)?.content || '');
    if (!content) return;
    // Only http(s) URLs are valid "send to browser" targets. The previous
    // implementation also passed-through `data:` content (including
    // data:text/html), which is a phishing vector — a malicious .txt file
    // imported into the FS could redirect to a fake login page in a new
    // tab. Plain text files now wrap in `data:text/plain,...` which is
    // viewable but not script-executable.
    let href;
    if (/^https?:\/\//i.test(content.trim())) {
      href = content.trim();
    } else {
      href = `data:text/plain,${encodeURIComponent(content)}`;
    }
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  _sendToPhotos(item) {
    if (item.isDir) return;
    this.kernel?.processManager?.spawn?.('photos', { filePath: item.path });
  }
  _sendToWallpaper(item) {
    if (item.isDir || item.category !== 'img') return;
    const content = typeof item.content === 'string' ? item.content : (this.fs?.read(item.path)?.content || '');
    // Vet before storing, not just before painting: the value ends up
    // inside a CSS `url("…")`, and a marker pointing at something the
    // resolver will refuse is a wallpaper that silently does not appear.
    if (!isWallpaperImage(content)) {
      this.kernel?.emit?.('toast', { message: 'That image can\'t be used as a wallpaper', type: 'error' });
      return;
    }
    // Custom-image data URL stays in raw localStorage (it can be MB-scale;
    // chrome.storage.sync's 8KB/item cap would reject it). The 'wallpaper
    // = custom' marker syncs via kernel.storage.
    let savedDataUrl = false;
    try {
      localStorage.setItem('yancotab_wallpaper_custom', content);
      savedDataUrl = true;
    } catch {
      this.kernel?.emit?.('toast', { message: 'Storage full — could not save wallpaper', type: 'error' });
    }
    if (!savedDataUrl) return;
    safeSave(this.kernel, 'yancotab_wallpaper', 'custom', 'Wallpaper');
    applyStoredWallpaper();
    window.dispatchEvent(new CustomEvent('yancotab:wallpaper-changed', { detail: { type: 'custom' } }));
    this.kernel?.emit?.('toast', { message: 'Wallpaper updated', type: 'success' });
  }
  async _copyPath(item) {
    try { await navigator.clipboard?.writeText(item.path); } catch { /* ignore */ }
    this.kernel?.emit?.('toast', { message: 'Path copied', type: 'success' });
  }

  // ── Mutations ──

  _togglePin(item) {
    togglePin(this.kernel, item.path);
    this._pinned = loadPinned(this.kernel);
    this._vault.render();
  }

  async _renameItem(item) {
    const newName = await showPrompt('Rename', `New name for "${item.name}"`, item.name || '');
    if (!newName || newName === item.name) return;
    const dir = item.path.slice(0, item.path.lastIndexOf('/'));
    const target = this._resolveCollision(`${dir}/${newName}`);
    try {
      this.fs?.rename?.(item.path, target);
      renamePin(this.kernel, item.path, target);
      this._pinned = loadPinned(this.kernel);
    } catch (e) {
      this.kernel?.emit?.('toast', { message: `Rename failed: ${e?.message || e}`, type: 'error' });
      return;
    }
    this._vault.setSelected(target);
  }

  async _deleteItem(item) {
    const ok = await showConfirm('Delete?',
      `Move "${item.name}" to trash?`, { danger: true });
    if (!ok) return;
    if (this.fs && !this.fs.exists(TRASH_PATH)) this.fs.mkdir(TRASH_PATH);
    const target = this._resolveCollision(`${TRASH_PATH}/${item.name}`);
    try {
      this.fs?.rename?.(item.path, target);
    } catch {
      try { this.fs?.delete?.(item.path); } catch { /* ignore */ }
    }
    removePin(this.kernel, item.path);
    this._pinned = loadPinned(this.kernel);
    this._vault.setSelected(null);
  }

  _moveFile(sourcePath, targetDir) {
    if (!sourcePath || !targetDir) return;
    if (sourcePath.startsWith(targetDir + '/')) return; // already there
    const name = this._basename(sourcePath);
    const target = this._resolveCollision(`${targetDir}/${name}`);
    try {
      this.fs?.rename?.(sourcePath, target);
      renamePin(this.kernel, sourcePath, target);
      this._pinned = loadPinned(this.kernel);
      this.kernel?.emit?.('toast', { message: `Moved to ${this._basename(targetDir)}`, type: 'success' });
    } catch (e) {
      this.kernel?.emit?.('toast', { message: `Move failed: ${e?.message || e}`, type: 'error' });
    }
    this._vault.render();
  }

  async _promptNewFolder() {
    const name = await showPrompt('New folder', 'Folder name');
    if (!name) return;
    // Determine parent: current room (folder room) or /home.
    const room = this._currentFolder() || HOME_PATH;
    const target = this._resolveCollision(`${room}/${name}`);
    try { this.fs?.mkdir?.(target); }
    catch (e) {
      this.kernel?.emit?.('toast', { message: `Could not create folder: ${e?.message || e}`, type: 'error' });
      return;
    }
    this._vault.render();
  }

  _currentFolder() {
    const room = this._vault?.getRoom?.();
    if (room && room.kind === 'folder' && room.path) return room.path;
    return null;
  }

  // ── Drag/drop import + paste ──

  _bindDragDrop() {
    let dragCounter = 0;
    this.root.addEventListener('dragenter', (e) => {
      // Only show overlay for files coming from the OS — not for our
      // internal coin-to-cell drag.
      if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      dragCounter++;
      this._dropOverlay.classList.add('is-visible');
    });
    this.root.addEventListener('dragleave', () => {
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        this._dropOverlay.classList.remove('is-visible');
      }
    });
    this.root.addEventListener('dragover', (e) => {
      if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    this.root.addEventListener('drop', (e) => {
      if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      dragCounter = 0;
      this._dropOverlay.classList.remove('is-visible');
      const files = [...e.dataTransfer.files];
      if (files.length) this._importFiles(files);
    });
  }

  _triggerImport() { this._fileInput.click(); }
  _handleFileSelect(e) {
    const files = [...e.target.files];
    if (files.length) this._importFiles(files);
    this._fileInput.value = '';
  }

  _importFiles(files) {
    if (!this.fs) return;
    const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file — covers most uses
    const oversize = [...files].filter((f) => f.size > MAX_BYTES);
    const accepted = [...files].filter((f) => f.size <= MAX_BYTES);
    if (oversize.length) {
      this.kernel?.emit?.('toast', {
        message: oversize.length === 1
          ? `Skipped ${oversize[0].name} — too large (max 10 MB)`
          : `Skipped ${oversize.length} files larger than 10 MB`,
        type: 'error',
      });
    }
    if (!accepted.length) return;
    let written = 0;
    for (const file of accepted) {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result;
        const targetDir = HOME_PATH; // import to /home for now
        const target = this._resolveCollision(`${targetDir}/${file.name}`);
        try {
          this.fs.write(target, content, {
            mime: file.type || 'application/octet-stream',
            size: file.size,
          });
        } catch (e) {
          this.kernel?.emit?.('toast', { message: `Import failed: ${e?.message || e}`, type: 'error' });
          return;
        }
        written++;
        if (written === accepted.length) {
          this._vault.render();
          this.kernel?.emit?.('toast',
            { message: `Imported ${written} file${written === 1 ? '' : 's'}`, type: 'success' });
        }
      };
      // Choose readAs based on type — text vs binary.
      if (file.type.startsWith('text/') || /\.(txt|md|json|csv|js|ts|css|html|xml)$/i.test(file.name)) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    }
  }

  // ── Keyboard ──

  _onKeydown(e) {
    const appLayer = this.root?.closest('.m-app-layer');
    if (!appLayer || appLayer.hidden) return;
    const tag = (e.target?.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!this._vault) return;

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        this._vault.keyMove(-1);
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        this._vault.keyMove(1);
        e.preventDefault();
        break;
      case 'Enter': {
        const sel = this._vault.getSelected();
        if (sel) { this._openItem(sel); e.preventDefault(); }
        break;
      }
      case 'Escape':
        this._vault.clearSelection();
        e.preventDefault();
        break;
      case 'Delete':
      case 'Backspace': {
        const sel = this._vault.getSelected();
        if (sel) { this._deleteItem(sel); e.preventDefault(); }
        break;
      }
      case 'F2': {
        const sel = this._vault.getSelected();
        if (sel) { this._renameItem(sel); e.preventDefault(); }
        break;
      }
      default:
        break;
    }
  }
}
