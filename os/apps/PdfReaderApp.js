/**
 * PdfReaderApp — "Codex" cosmic redesign.
 *
 * 3-column layout: outline + bookmarks + reading-streak rail · 2-page
 * spread (single below 1100px) · selection info / inline calc /
 * today's quotes panel.
 *
 * Replaces the previous Chrome-iframe viewer with a pdf.js render +
 * text layer so selection, inline calc, and quote-with-citation
 * actually work. Editor / annotate / cross-ref-PiP land in PR-3.
 */

import { App } from '../core/App.js';
import { el, cssLink } from '../utils/dom.js';
import { buildCodex } from './pdf/codex.js';
import {
  recordOpen, loadStreak,
  loadBookmarks, addBookmark, removeBookmark, listBookmarks,
  addHighlight, listHighlightsOnPage,
} from './pdf/persistence.js';
import { densityStrip, currentStreak } from './pdf/engine/streak.js';

const RECENT_KEY = 'yancotab_pdf_recent';
const MAX_RECENTS = 5;


export class PdfReaderApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'PDF Reader', id: 'pdf-reader', icon: '📕' };
    this.fs = kernel.getService('fs');
    this._currentDataUrl = null;
    this._currentName = null;
    this._currentPath = null;
    this._openedFromFiles = false;
    this._codex = null;
    this._streak = loadStreak(this.kernel);
    this._styleLinks = [];
    this._boundKeydown = this._onKeydown.bind(this);
  }

  async init(options = {}) {
    this._styleLinks = [cssLink('css/pdf-codex.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));

    this.root = el('div', { class: 'app-window app-pdf-codex', tabindex: '0' });

    this._buildUI();
    this._renderEmpty();
    document.addEventListener('keydown', this._boundKeydown);

    if (options?.filePath) {
      this._openedFromFiles = true;
      this._currentPath = options.filePath;
      const file = this.fs?.read(options.filePath);
      if (file && file.content) {
        const name = this._basename(options.filePath);
        await this._loadFromDataUrl(file.content, name, options.filePath);
        this._addToRecents(name, options.filePath);
      }
    } else if (options?.dataUrl) {
      await this._loadFromDataUrl(options.dataUrl, options.name || 'document.pdf', null);
    }
  }

  destroy() {
    document.removeEventListener('keydown', this._boundKeydown);
    if (this._codex) {
      this._codex.destroy();
      this._codex = null;
    }
    if (this._styleLinks) {
      for (const l of this._styleLinks) l.remove();
      this._styleLinks = [];
    }
    super.destroy();
  }

  // ── UI ──

  _buildUI() {
    // Title bar (tabs + actions). Codex shows just one functional
    // tab in PR-2; Annotate/Outline land later.
    this._titlebar = el('div', { class: 'cx-titlebar' });
    const tabs = el('div', { class: 'cx-tabs' }, [
      el('button', { type: 'button', class: 'cx-tab is-active' }, 'Read'),
    ]);
    const actions = el('div', { class: 'cx-titlebar-actions' });
    actions.appendChild(this._btnOpen = el('button', {
      type: 'button', class: 'cx-titlebar-btn', title: 'Open PDF',
      onclick: () => this._triggerOpen(),
    }, '+ Open'));
    actions.appendChild(this._btnSave = el('button', {
      type: 'button', class: 'cx-titlebar-btn', title: 'Save to Files',
      onclick: () => this._saveToFiles(),
    }, '⇩ Save'));
    actions.appendChild(this._btnClose = el('button', {
      type: 'button', class: 'cx-titlebar-btn', title: 'Close PDF',
      onclick: () => this._closeDoc(),
    }, '✕ Close'));
    this._btnSave.style.display = 'none';
    this._btnClose.style.display = 'none';
    this._titlebar.append(tabs, actions);

    this._codex = buildCodex({
      getStreakStrip: () => densityStrip(this._streak, 14),
      getStreakDays: () => currentStreak(this._streak),
      getBookmarks: (docId) => listBookmarks(this.kernel, docId),
      getHighlightsOnPage: (docId, page) => listHighlightsOnPage(this.kernel, docId, page),
      onAddBookmark: ({ docId, page, label, color }) => {
        addBookmark(this.kernel, docId, { page, label, color });
        this._codex.refreshRail();
      },
      onAddHighlight: ({ docId, page, text, color }) => {
        addHighlight(this.kernel, docId, { page, text, color });
      },
      onRemoveBookmark: (b) => {
        const docId = this._codex.getDocId();
        if (!docId) return;
        removeBookmark(this.kernel, docId, b.page, b.label);
        this._codex.refreshRail();
      },
      onSendToNotes: () => { /* clipboard handled inside codex; toast also */ },
      onRecordOpen: () => {
        this._streak = recordOpen(this.kernel);
      },
      onToast: (t) => this.kernel?.emit?.('toast', t),
    });

    // Empty state shown when no doc is loaded — overlays the codex root.
    this._empty = el('div', { class: 'cx-app-empty' }, [
      el('div', { class: 'cx-app-empty-icon' }, '📕'),
      el('div', { class: 'cx-app-empty-title' }, 'PDF Codex'),
      el('div', { class: 'cx-app-empty-hint' }, 'Open a PDF to start reading. Drag & drop also works.'),
      (() => {
        const b = el('button', {
          type: 'button', class: 'cx-app-empty-btn',
          onclick: () => this._triggerOpen(),
        }, '+ Open PDF');
        return b;
      })(),
      this._buildRecentsList(),
    ]);

    this._dropOverlay = el('div', { class: 'cx-drop-overlay' }, [
      el('div', { class: 'cx-drop-content' }, [
        el('div', { class: 'cx-drop-icon' }, '⬇'),
        el('div', {}, 'Drop PDF here'),
      ]),
    ]);

    this._fileInput = el('input', {
      type: 'file',
      accept: 'application/pdf,.pdf',
      hidden: true,
      onchange: (e) => this._handleFileSelect(e),
    });

    this.root.append(this._titlebar, this._codex.root, this._empty, this._dropOverlay, this._fileInput);
    this._bindDragDrop();
  }

  _buildRecentsList() {
    const recents = this._getValidRecents();
    if (!recents.length) return el('div', { class: 'cx-recents-empty' }, '');
    const list = el('div', { class: 'cx-recents' }, [
      el('div', { class: 'cx-recents-h' }, 'Recently opened'),
    ]);
    for (const r of recents) {
      const btn = el('button', {
        type: 'button', class: 'cx-recent-item', title: r.path,
        onclick: () => this._openRecent(r),
      }, [
        el('span', { class: 'cx-recent-icon' }, '📕'),
        el('span', { class: 'cx-recent-name' }, r.name),
        el('span', { class: 'cx-recent-date' }, this._formatDate(r.openedAt)),
      ]);
      list.appendChild(btn);
    }
    return list;
  }

  _renderEmpty() {
    const hasDoc = !!this._codex.getDocId();
    // Keep the codex root visible at all times — pdf.js render
    // hangs when its canvas is in a display:none subtree. The empty
    // overlay floats on top of it instead.
    this._empty.style.display = hasDoc ? 'none' : 'flex';
    this._btnSave.style.display = (hasDoc && !this._openedFromFiles) ? '' : 'none';
    this._btnClose.style.display = hasDoc ? '' : 'none';
  }

  // ── Loading ──

  async _loadFromDataUrl(dataUrl, name, path) {
    this._currentDataUrl = dataUrl;
    this._currentName = name || 'document.pdf';
    this._currentPath = path || null;
    // pdf.js accepts data URLs directly via `getDocument({ url })`.
    await this._codex.load({
      source: { url: dataUrl },
      name: this._currentName,
      id: path || `recent:${name}`,
    });
    this._renderEmpty();
  }

  async _loadFromFile(file) {
    const MAX_BYTES = 50 * 1024 * 1024; // 50 MB hard cap — real PDFs can be large
    if (file.size > MAX_BYTES) {
      this.kernel?.emit?.('toast', {
        message: `PDF too large (max ${MAX_BYTES / 1024 / 1024} MB)`,
        type: 'error',
      });
      return;
    }
    const buffer = await file.arrayBuffer();
    // Verify magic bytes — pdf.js trusts arbitrary bytes and a malicious
    // 'evil.pdf' that doesn't actually start with '%PDF-' can spin the
    // worker. Real PDFs always start with the 5 bytes '%PDF-' (25 50 44
    // 46 2D), per ISO 32000-1 §7.5.2.
    const head = new Uint8Array(buffer, 0, Math.min(5, buffer.byteLength));
    if (head.length < 5
        || head[0] !== 0x25 || head[1] !== 0x50 || head[2] !== 0x44
        || head[3] !== 0x46 || head[4] !== 0x2D) {
      this.kernel?.emit?.('toast', {
        message: `${file.name} is not a valid PDF`,
        type: 'error',
      });
      return;
    }
    this._currentDataUrl = null;
    this._currentName = file.name;
    this._currentPath = null;
    this._openedFromFiles = false;
    await this._codex.load({
      source: { data: new Uint8Array(buffer) },
      name: file.name,
      id: `recent:${file.name}`,
    });
    // Cache the data URL for save-to-files.
    this._currentDataUrl = await blobToDataUrl(file);
    this._renderEmpty();
  }

  _closeDoc() {
    if (!this._codex) return;
    this._codex.close();
    this._currentDataUrl = null;
    this._currentName = null;
    this._currentPath = null;
    this._openedFromFiles = false;
    // Rebuild recents list inside the empty state.
    this._empty.replaceChildren(...this._empty.children);
    this._renderEmpty();
  }

  // ── File ops ──

  _triggerOpen() { this._fileInput.click(); }

  _handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
      this._loadFromFile(file);
    }
    this._fileInput.value = '';
  }

  _saveToFiles() {
    if (!this._currentDataUrl || !this.fs) return;
    const name = this._currentName || 'document.pdf';
    let targetPath = `/home/documents/${name}`;
    if (this.fs.exists(targetPath)) {
      const ext = '.pdf';
      const base = name.toLowerCase().endsWith(ext) ? name.slice(0, -ext.length) : name;
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
    this._currentPath = targetPath;
    this._openedFromFiles = true;
    this._addToRecents(name, targetPath);
    this.kernel?.emit?.('toast', { message: 'Saved to /home/documents', type: 'success' });
    this._renderEmpty();
  }

  // ── Recents ──

  _addToRecents(name, path) {
    if (!name || !path) return;
    try {
      const recents = this.kernel.storage.load(RECENT_KEY) || [];
      const filtered = recents.filter((r) => r.path !== path);
      filtered.unshift({ name, path, openedAt: Date.now() });
      this.kernel.storage.save(RECENT_KEY, filtered.slice(0, MAX_RECENTS));
    } catch { /* ignore */ }
  }

  _getRecents() {
    try { return this.kernel.storage.load(RECENT_KEY) || []; }
    catch { return []; }
  }

  _getValidRecents() {
    return this._getRecents().filter((r) => this.fs?.exists(r.path));
  }

  async _openRecent(recent) {
    const file = this.fs?.read(recent.path);
    if (file && file.content) {
      this._openedFromFiles = true;
      this._currentPath = recent.path;
      await this._loadFromDataUrl(file.content, recent.name, recent.path);
      this._addToRecents(recent.name, recent.path);
    }
  }

  _formatDate(timestamp) {
    const d = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  // ── Keyboard ──

  _onKeydown(e) {
    const appLayer = this.root?.closest('.m-app-layer');
    if (!appLayer || appLayer.hidden) return;
    const tag = (e.target?.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!this._codex || !this._codex.getDocId()) return;

    if (e.key === 'ArrowLeft' || e.key === 'PageUp')        { this._codex.keyMove(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') { this._codex.keyMove(1);  e.preventDefault(); }
    else if (e.key === 'Home')                               { this._codex.keyJump('first'); e.preventDefault(); }
    else if (e.key === 'End')                                { this._codex.keyJump('last');  e.preventDefault(); }
  }

  // ── Drag & drop ──

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
      const file = [...e.dataTransfer.files].find((f) =>
        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      );
      if (file) this._loadFromFile(file);
    });
  }

  _basename(path) { return (path || '').split('/').pop() || ''; }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
