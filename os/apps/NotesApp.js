/**
 * NotesApp — dual-mode notes app.
 *
 *   mode: 'library' (default) — list / cosmos / calendar / timeline.
 *                                Right-click row → open / pin / delete.
 *                                Click a note → opens a separate
 *                                editor window for that note.
 *   mode: 'editor'             — single-note floating window: title +
 *                                tags + body. No library chrome.
 *
 * Multiple editor windows can be open at once, but only ONE per note —
 * an editor owns its path (see notes/engine/resourceKey.js), and
 * ProcessManager focuses the open one instead of spawning a second that
 * would autosave over it. Library and editors sync via the kernel
 * `notes:changed` event.
 */

import { App } from '../core/App.js';
import { el, cssLink } from '../utils/dom.js';
import { showConfirm, showPrompt } from '../ui/components/YancoModal.js';
import {
  sanitizeTitle, titleFromPath, extractTags,
} from '../utils/notes-utils.js';

import {
  loadMeta, setEntry, removeEntry,
  loadHistoryFor, saveHistoryFor, clearHistoryFor,
} from './notes/persistence.js';
import { normalizeMetaEntry, inferStatus } from './notes/engine/meta.js';
import { notesResourceKey } from './notes/engine/resourceKey.js';
import { gridPosition } from './notes/engine/layout.js';
import { applyFilter, emptyFilter } from './notes/engine/filters.js';

import { buildSideRail } from './notes/view/sideRail.js';
import { buildCosmosStage } from './notes/view/cosmosStage.js';
import { buildListTab } from './notes/view/listTab.js';
import { buildCalendarTab } from './notes/view/calendarTab.js';
import { buildTimelineTab } from './notes/view/timelineTab.js';
import { buildEditorFrame } from './notes/view/editorFrame.js';
import { buildNotesContextMenu } from './notes/view/notesContextMenu.js';
import { exportAsMarkdown, printNote } from './notes/engine/exportPrint.js';
import { renderMarkdown } from './notes/engine/markdown.js';

const TABS = ['List', 'Cosmos', 'Calendar', 'Timeline'];
const DOCS_PATH = '/home/documents';
const EXT = '.txt';

export class NotesApp extends App {
  /**
   * An editor window owns its note path; a library window owns nothing.
   * ProcessManager reads this to focus an open editor instead of
   * spawning a duplicate that would overwrite it.
   */
  static resourceKey(config) { return notesResourceKey(config); }

  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Notes', id: 'notes', icon: '📝' };
    this.fs = this.kernel.getService('fs');
    this._notes = [];
    this._filter = emptyFilter();
    this._selectedPath = null;
    this._activeTab = 'List';
    this._views = {};
    this._styleLinks = [];
    this._mode = 'library';
    this._editorPath = null;
    this._changeUnsub = null;
  }

  async init(payload = {}) {
    this._styleLinks = [cssLink('css/notes.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));
    if (this.fs && !this.fs.exists(DOCS_PATH)) this.fs.mkdir(DOCS_PATH);
    this._mode = payload?.mode === 'editor' ? 'editor' : 'library';
    if (this._mode === 'editor') return this._initEditor(payload);
    return this._initLibrary(payload);
  }

  destroy() {
    try { this._views.editor?.flushAll?.(); } catch { /* ignore */ }
    if (this._changeUnsub) {
      try { this._changeUnsub(); } catch { /* ignore */ }
      this._changeUnsub = null;
    }
    try { this._ctxMenu?.destroy?.(); } catch { /* ignore */ }
    if (this._styleLinks) {
      for (const l of this._styleLinks) l.remove();
      this._styleLinks = [];
    }
    super.destroy();
  }

  // ── Library mode ───────────────────────────────────────────────

  _initLibrary(payload) {
    this._notes = this._loadNotes();
    this.root = el('div', {
      class: 'app-window app-notes-constellation is-library',
      tabindex: '0',
      'data-allow-context': 'true',
    });
    this.root.appendChild(this._buildLibraryFrame());

    if (payload?.path && this._notes.find((n) => n.path === payload.path)) {
      this._selectedPath = payload.path;
    } else {
      const sorted = [...this._notes].sort((a, b) => (b.meta.updated || 0) - (a.meta.updated || 0));
      this._selectedPath = sorted[0]?.path || null;
    }

    this._renderAll();

    this._changeUnsub = this.kernel.on?.('notes:changed', ({ path } = {}) => this._onExternalChange(path));

    this.root.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        this._views.stage?.setSearch?.('');
        requestAnimationFrame(() => this.root.querySelector('.nc-search-input')?.focus());
      }
    });
  }

  _buildLibraryFrame() {
    const titlebar = el('div', { class: 'nc-titlebar' });
    const tabs = el('div', { class: 'nc-tabs' });
    for (const name of TABS) {
      const t = el('button', {
        type: 'button',
        class: `nc-tab${name === this._activeTab ? ' is-active' : ''}`,
        'data-tab': name,
      }, name);
      t.addEventListener('click', () => this._setTab(name));
      tabs.appendChild(t);
    }
    const newBtn = el('button', { type: 'button', class: 'nc-titlebar-new' }, '+ New note');
    newBtn.addEventListener('click', () => this._createNote());
    titlebar.append(tabs, newBtn);

    this._views.side = buildSideRail({
      onPickSmart: (id) => this._setFilter({ smart: this._filter.smart === id ? null : id }),
      onPickTag:   (tag) => this._setFilter({ tag: this._filter.tag === tag ? null : tag }),
      onPickMood:  (status) => this._setFilter({ status: this._filter.status === status ? null : status }),
      onClearFilters: () => this._setFilter(emptyFilter(), true),
    });
    this._views.stage = buildCosmosStage({
      onSelectStar: (path) => this._openEditor(path),
      onContextStar: (note, x, y) => this._ctxMenu.showForNote(note, x, y),
      onSearch: (q) => this._setFilter({ search: q }),
      onMoveStar: (path, x, y) => this._patchMeta(path, { x, y }),
    });
    this._views.list = buildListTab({
      onSelectPath: (path) => this._openEditor(path),
      onContextNote: (note, x, y) => this._ctxMenu.showForNote(note, x, y),
    });
    this._views.calendar = buildCalendarTab({ onSelectPath: (path) => this._openEditor(path) });
    this._views.timeline = buildTimelineTab({ onSelectPath: (path) => this._openEditor(path) });
    this._views.calendar.root.style.display = 'none';
    this._views.timeline.root.style.display = 'none';
    this._views.stage.root.style.display = 'none';

    this._ctxMenu = buildNotesContextMenu({
      onOpen: (n) => this._openEditor(n.path),
      onOpenInNewWindow: (n) => this._openEditor(n.path),
      onTogglePin: (n) => this._patchMeta(n.path, { pinned: !n.meta?.pinned }),
      onRename: (n) => this._renameNote(n),
      onCopyTitle: (n) => {
        try { navigator.clipboard.writeText(n.title || ''); } catch { /* ignore */ }
        this.kernel?.emit?.('toast', { message: 'Title copied', type: 'success' });
      },
      onDelete: (n) => this._deleteNote(n.path),
      onRestore: (n) => this._restoreNote(n.path),
      onPurge: (n) => this._purgeNote(n.path),
      onExport: (n) => this._exportAsMarkdown(n),
      onCreate: () => this._createNote(),
    });

    const center = el('div', { class: 'nc-center' }, [
      this._views.stage.root, this._views.list.root,
      this._views.calendar.root, this._views.timeline.root,
    ]);
    center.addEventListener('contextmenu', (e) => {
      // Only fire the canvas menu when the right-click DIDN'T hit a row
      // (rows preventDefault + stopPropagation in their own handler).
      e.preventDefault();
      this._ctxMenu.showForCanvas(e.clientX, e.clientY);
    });

    const layout = el('div', { class: 'nc-layout is-library' }, [
      this._views.side.root, center,
    ]);
    return el('div', { class: 'nc-frame' }, [titlebar, layout]);
  }

  // ── Editor mode ────────────────────────────────────────────────

  _initEditor(payload) {
    this._editorPath = payload?.path || null;
    this.root = el('div', {
      class: 'app-window app-notes-constellation is-editor',
      tabindex: '0',
      'data-allow-context': 'true',
    });
    const note = this._loadOneNote(this._editorPath);
    if (!note) {
      this.root.appendChild(el('div', { class: 'nc-editor-missing' }, [
        el('h3', {}, 'Note not found'),
        el('p', {}, 'It may have been deleted.'),
      ]));
      return;
    }
    this._views.editor = buildEditorFrame({
      onSaveBody:  (path, body) => this._saveBody(path, body, /*notify*/ true),
      onSaveTitle: (path, title) => this._saveTitle(path, title),
      onSaveTags:  (path, tags) => this._saveTags(path, tags),
      onTogglePin: (path, pinned) => this._patchMeta(path, { pinned }),
      onSetStatus: (path, status) => this._patchMeta(path, { status }),
      onDelete:    (path) => this._deleteAndClose(path),
      onExportMd:  (note) => this._exportAsMarkdown(note),
      onPrint:     (note) => this._printNote(note),
      onClose:     () => { try { this.close?.(); } catch { /* ignore */ } },
      loadHistory: (path) => loadHistoryFor(this.kernel, path),
      saveHistory: (path, snap) => saveHistoryFor(this.kernel, path, snap),
    });
    this.root.appendChild(this._views.editor.root);
    this._views.editor.update(note);
    this._updateWindowTitle(note.title || 'Untitled');

    this._changeUnsub = this.kernel.on?.('notes:changed', ({ path } = {}) => {
      if (path !== this._editorPath) return;
      const fresh = this._loadOneNote(this._editorPath);
      if (!fresh) {
        // Note was deleted from elsewhere — close this editor window.
        try { this.close?.(); } catch { /* ignore */ }
        return;
      }
      this._views.editor.update(fresh);
      this._updateWindowTitle(fresh.title || 'Untitled');
    });

    if (payload?.autofocus === 'title') {
      requestAnimationFrame(() => this._views.editor.focusTitle());
    } else {
      requestAnimationFrame(() => this._views.editor.focusBody());
    }
  }

  _updateWindowTitle(title) {
    // The window chrome was rendered before we knew the note title.
    // Patch the DOM title node directly — it's set at mount time and
    // has no programmatic setter on WindowChrome.
    try {
      const titleEl = this.root?.closest?.('.window-chrome')
        ?.querySelector?.('.window-chrome__title');
      if (titleEl) titleEl.textContent = title;
    } catch { /* ignore */ }
  }

  _loadOneNote(path) {
    if (!path || !this.fs) return null;
    const raw = this.fs.read(path);
    if (!raw) return null;
    const body = typeof raw?.content === 'string' ? raw.content : '';
    const meta = loadMeta(this.kernel);
    const fallbackTitle = sanitizeTitle(titleFromPath(path));
    const baseEntry = meta[path] || {
      title: fallbackTitle, created: raw?.created || Date.now(),
      updated: raw?.modified || Date.now(), pinned: false, tags: extractTags(body),
    };
    const norm = normalizeMetaEntry({ ...baseEntry }, { x: baseEntry.x, y: baseEntry.y });
    if (norm.status === null) norm.status = inferStatus(norm);
    return { path, title: norm.title, body, meta: norm };
  }

  // ── State ──────────────────────────────────────────────────────

  _loadNotes() {
    if (!this.fs) return [];
    const meta = loadMeta(this.kernel);
    const entries = this.fs.list(DOCS_PATH) || [];
    const files = entries
      .filter((e) => e && e.type === 'file' && typeof e.path === 'string'
        && e.path.toLowerCase().endsWith(EXT))
      .map((e) => e.path);
    return files.map((path, i) => {
      const raw = this.fs.read(path);
      const body = typeof raw?.content === 'string' ? raw.content : '';
      const fallbackTitle = sanitizeTitle(titleFromPath(path));
      const fallbackTags = extractTags(body);
      const rawCreated = raw?.meta?.created || raw?.created || Date.now();
      const rawModified = raw?.meta?.modified || raw?.modified || rawCreated;
      const baseEntry = meta[path] || {
        title: fallbackTitle, created: rawCreated, updated: rawModified,
        pinned: false, tags: fallbackTags,
      };
      const grid = gridPosition(i);
      const norm = normalizeMetaEntry({ ...baseEntry, x: baseEntry.x ?? grid.x, y: baseEntry.y ?? grid.y }, grid);
      if (norm.status === null) norm.status = inferStatus(norm);
      return { path, title: norm.title, body, meta: norm };
    });
  }

  _patchMeta(path, patch) {
    if (!path || !patch) return;
    setEntry(this.kernel, path, patch);
    this.kernel.emit?.('notes:changed', { path });
    if (this._mode === 'library') {
      this._notes = this._loadNotes();
      this._renderAll();
    }
  }

  _saveBody(path, content, notify = true) {
    if (!path) return;
    const now = Date.now();
    const newTags = extractTags(content);
    try { this.fs?.write?.(path, content, { modified: now }); } catch { /* ignore */ }
    setEntry(this.kernel, path, { tags: newTags, updated: now });
    if (notify) this.kernel.emit?.('notes:changed', { path });
  }

  _saveTitle(path, title) {
    if (!path) return;
    const clean = String(title || 'Untitled').trim() || 'Untitled';
    setEntry(this.kernel, path, { title: clean, updated: Date.now() });
    this.kernel.emit?.('notes:changed', { path });
  }

  _saveTags(path, tags) {
    if (!path) return;
    setEntry(this.kernel, path, { tags: Array.isArray(tags) ? tags : [], updated: Date.now() });
    this.kernel.emit?.('notes:changed', { path });
  }

  async _renameNote(note) {
    if (!note) return;
    const ans = await showPrompt('Rename note', 'New title:', note.title || '');
    if (typeof ans !== 'string') return;
    const clean = sanitizeTitle(ans.trim());
    if (!clean || clean === note.title) return;
    this._saveTitle(note.path, clean);
  }

  async _createNote() {
    if (!this.fs) return;
    const path = this._uniquePath('Untitled');
    const now = Date.now();
    this.fs.write(path, '', { created: now });
    setEntry(this.kernel, path, {
      title: 'Untitled', created: now, updated: now, pinned: false, tags: [],
      x: gridPosition((this._notes || []).length).x,
      y: gridPosition((this._notes || []).length).y,
      status: 'draft',
    });
    this.kernel.emit?.('notes:changed', { path });
    try {
      await this.kernel.processManager?.spawn?.('notes', { mode: 'editor', path, autofocus: 'title' });
    } catch (e) {
      this.kernel?.emit?.('toast', { message: `Couldn't open editor: ${e?.message || e}`, type: 'error' });
    }
  }

  _openEditor(path) {
    if (!path) return;
    this._selectedPath = path;
    if (this._mode === 'library') {
      // Visual feedback before the window opens.
      this._renderAll();
      // kernel.emit's CustomEvent only carries a single `detail` so a
      // third arg would be dropped. Spawn through processManager
      // directly — that's how FilesApp opens specific paths too.
      try {
        this.kernel.processManager?.spawn?.('notes', { mode: 'editor', path });
      } catch (e) {
        this.kernel?.emit?.('toast', { message: `Couldn't open: ${e?.message || e}`, type: 'error' });
      }
    }
  }

  /**
   * "Delete" = move to trash. The file stays on disk and the meta
   * gains a `trashed: timestamp` marker so the note can be restored
   * from the Trash filter. Permanent delete happens via
   * _purgeNote (called only from the trash menu).
   */
  async _deleteNote(path) {
    const note = this._notes.find((n) => n.path === path) || this._loadOneNote(path);
    if (!note) return false;
    if (note.meta?.trashed) {
      // Already in trash → user wants permanent delete.
      return this._purgeNote(path);
    }
    setEntry(this.kernel, path, { trashed: Date.now() });
    this.kernel.emit?.('notes:changed', { path });
    this.kernel.emit?.('toast', { message: 'Moved to trash', type: 'success' });
    if (this._mode === 'library') {
      this._notes = this._loadNotes();
      if (this._selectedPath === path) this._selectedPath = null;
      this._renderAll();
    }
    return true;
  }

  async _purgeNote(path) {
    const note = this._notes.find((n) => n.path === path) || this._loadOneNote(path);
    if (!note) return false;
    const ok = await showConfirm('Permanently delete',
      `Permanently delete "${note.title || 'Untitled'}"? This can't be undone.`,
      { danger: true });
    if (!ok) return false;
    try { this.fs?.remove?.(path); } catch { /* ignore */ }
    removeEntry(this.kernel, path);
    clearHistoryFor(this.kernel, path);
    this.kernel.emit?.('notes:changed', { path });
    if (this._mode === 'library') {
      this._notes = this._notes.filter((n) => n.path !== path);
      if (this._selectedPath === path) this._selectedPath = this._notes[0]?.path || null;
      this._renderAll();
    }
    return true;
  }

  _restoreNote(path) {
    if (!path) return;
    setEntry(this.kernel, path, { trashed: null });
    this.kernel.emit?.('notes:changed', { path });
    this.kernel.emit?.('toast', { message: 'Restored from trash', type: 'success' });
  }

  async _deleteAndClose(path) {
    const ok = await this._deleteNote(path);
    if (ok) {
      try { this.close?.(); } catch { /* ignore */ }
    }
  }

  _exportAsMarkdown(note) {
    exportAsMarkdown(note, {
      onToast: (t) => this.kernel?.emit?.('toast', t),
    });
  }
  _printNote(note) {
    printNote(note, {
      onToast: (t) => this.kernel?.emit?.('toast', t),
      renderMarkdown,
    });
  }

  _uniquePath(title) {
    let candidate = `${DOCS_PATH}/${sanitizeTitle(title)}${EXT}`;
    let n = 2;
    while (this.fs?.exists?.(candidate)) {
      candidate = `${DOCS_PATH}/${sanitizeTitle(title)} (${n})${EXT}`;
      n++;
    }
    return candidate;
  }

  _setFilter(patch, replace = false) {
    this._filter = replace ? patch : { ...this._filter, ...patch };
    this._renderAll();
  }
  _setTab(name) {
    if (this._activeTab === name) return;
    this._activeTab = name;
    this._renderAll();
  }

  _onExternalChange(_path) {
    if (this._mode !== 'library') return;
    this._notes = this._loadNotes();
    this._renderAll();
  }

  _renderAll() {
    if (!this.root || this._mode !== 'library') return;
    this._views.side.update(this._notes, this._filter);
    const visible = applyFilter(this._notes, this._filter);
    this._views.stage.update(visible, this._notes, this._selectedPath);
    this._views.list.update(visible, this._selectedPath);
    this._views.calendar.update(visible, this._selectedPath);
    this._views.timeline.update(visible, this._selectedPath);
    this._renderTabState();
  }
  _renderTabState() {
    for (const t of this.root.querySelectorAll('[data-tab]')) {
      t.classList.toggle('is-active', t.dataset.tab === this._activeTab);
    }
    this._views.stage.root.style.display    = this._activeTab === 'Cosmos'   ? '' : 'none';
    this._views.list.root.style.display     = this._activeTab === 'List'     ? '' : 'none';
    this._views.calendar.root.style.display = this._activeTab === 'Calendar' ? '' : 'none';
    this._views.timeline.root.style.display = this._activeTab === 'Timeline' ? '' : 'none';
  }
}
