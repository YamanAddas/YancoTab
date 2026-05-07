/**
 * NotesApp — "Constellation" redesign.
 *
 * 3-column layout: Smart/tags/mood sidebar + cosmic stage + detail
 * panel. Notes from /home/documents/*.txt are loaded once on init,
 * combined with metadata from kernel.storage[yancotab_notes_meta_v2],
 * and rendered as positioned hex-stars. SVG threads connect notes
 * that link to each other via [[Title]] wikilinks.
 *
 * PR-3: drag-to-move stars, inline body editing, List/Calendar/
 * Timeline tabs.
 */

import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { showConfirm } from '../ui/components/YancoModal.js';
import {
  sanitizeTitle, titleFromPath, extractTags,
} from '../utils/notes-utils.js';

import { loadMeta, setEntry, removeEntry } from './notes/persistence.js';
import { normalizeMetaEntry, inferStatus } from './notes/engine/meta.js';
import { gridPosition } from './notes/engine/layout.js';
import { applyFilter, emptyFilter } from './notes/engine/filters.js';

import { buildSideRail } from './notes/view/sideRail.js';
import { buildCosmosStage } from './notes/view/cosmosStage.js';
import { buildDetailPanel } from './notes/view/detailPanel.js';
import { buildListTab } from './notes/view/listTab.js';
import { buildCalendarTab } from './notes/view/calendarTab.js';
import { buildTimelineTab } from './notes/view/timelineTab.js';

const TABS = ['Cosmos', 'List', 'Calendar', 'Timeline'];
const DOCS_PATH = '/home/documents';
const EXT = '.txt';

function css(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  return link;
}

export class NotesApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Notes', id: 'notes', icon: '📝' };
    this.fs = this.kernel.getService('fs');
    this._notes = [];
    this._filter = emptyFilter();
    this._selectedPath = null;
    this._activeTab = 'Cosmos';
    this._views = {};
    this._styleLinks = [];
  }

  async init(payload = {}) {
    this._styleLinks = [css('css/notes.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));

    if (this.fs && !this.fs.exists(DOCS_PATH)) this.fs.mkdir(DOCS_PATH);

    this._notes = this._loadNotes();

    this.root = el('div', { class: 'app-window app-notes-constellation', tabindex: '0' });
    this.root.appendChild(this._buildFrame());

    if (payload?.path && this._notes.find((n) => n.path === payload.path)) {
      this._selectedPath = payload.path;
    } else {
      const sorted = [...this._notes].sort((a, b) => (b.meta.updated || 0) - (a.meta.updated || 0));
      this._selectedPath = sorted[0]?.path || null;
    }

    this._renderAll();

    // ⌘/ to focus the search beam.
    this.root.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        this._views.stage?.setSearch('');
        requestAnimationFrame(() => this.root.querySelector('.nc-search-input')?.focus());
      }
    });
  }

  destroy() {
    // Make sure any pending body edit lands before we tear down.
    try { this._views.detail?.flushPendingSave?.(); } catch { /* ignore */ }
    if (this._styleLinks) {
      for (const l of this._styleLinks) l.remove();
      this._styleLinks = [];
    }
    super.destroy();
  }

  // ── Frame ──────────────────────────────────────────────────────

  _buildFrame() {
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
    titlebar.appendChild(tabs);

    this._views.side = buildSideRail({
      onPickSmart: (id) => this._setFilter({ smart: this._filter.smart === id ? null : id }),
      onPickTag:   (tag) => this._setFilter({ tag: this._filter.tag === tag ? null : tag }),
      onPickMood:  (status) => this._setFilter({ status: this._filter.status === status ? null : status }),
      onClearFilters: () => this._setFilter(emptyFilter(), true),
    });

    this._views.stage = buildCosmosStage({
      onSelectStar: (path) => this._select(path),
      onSearch: (q) => this._setFilter({ search: q }),
      onMoveStar: (path, x, y) => this._patchMeta(path, { x, y }),
    });

    this._views.detail = buildDetailPanel({
      onPin: (path, pinned) => this._patchMeta(path, { pinned }),
      onSetStatus: (path, status) => this._patchMeta(path, { status }),
      onDelete: (path) => this._deleteNote(path),
      onCreate: () => this._createNote(),
      onSelectPath: (path) => this._selectFromAnywhere(path),
      onSaveBody: (path, content) => this._saveBody(path, content),
    });

    this._views.list = buildListTab({
      onSelectPath: (path) => this._selectFromAnywhere(path),
    });
    this._views.calendar = buildCalendarTab({
      onSelectPath: (path) => this._selectFromAnywhere(path),
    });
    this._views.timeline = buildTimelineTab({
      onSelectPath: (path) => this._selectFromAnywhere(path),
    });

    // Hide non-Cosmos panels by default.
    this._views.list.root.style.display = 'none';
    this._views.calendar.root.style.display = 'none';
    this._views.timeline.root.style.display = 'none';

    const center = el('div', { class: 'nc-center' }, [
      this._views.stage.root,
      this._views.list.root,
      this._views.calendar.root,
      this._views.timeline.root,
    ]);

    const layout = el('div', { class: 'nc-layout' }, [
      this._views.side.root,
      center,
      this._views.detail.root,
    ]);

    return el('div', { class: 'nc-frame' }, [titlebar, layout]);
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

    const notes = files.map((path, i) => {
      const raw = this.fs.read(path);
      const body = typeof raw?.content === 'string' ? raw.content : '';
      const fallbackTitle = sanitizeTitle(titleFromPath(path));
      const fallbackTags = extractTags(body);
      const rawCreated = raw?.meta?.created || raw?.created || Date.now();
      const rawModified = raw?.meta?.modified || raw?.modified || rawCreated;
      const baseEntry = meta[path] || {
        title: fallbackTitle,
        created: rawCreated,
        updated: rawModified,
        pinned: false,
        tags: fallbackTags,
      };
      const grid = gridPosition(i);
      const norm = normalizeMetaEntry({ ...baseEntry, x: baseEntry.x ?? grid.x, y: baseEntry.y ?? grid.y }, grid);
      if (norm.status === null) norm.status = inferStatus(norm);
      return { path, title: norm.title, body, meta: norm };
    });

    return notes;
  }

  _patchMeta(path, patch) {
    if (!path || !patch) return;
    this._notes = this._notes.map((n) => {
      if (n.path !== path) return n;
      const merged = normalizeMetaEntry({ ...n.meta, ...patch }, { x: n.meta.x, y: n.meta.y });
      return { ...n, meta: merged, title: merged.title };
    });
    setEntry(this.kernel, path, patch);
    this._renderAll();
  }

  /**
   * Save body content for a note. Updates internal model + tags +
   * updated timestamp, persists to fs + meta. Does a partial render
   * (side rail + active tab) but skips the detail panel so the user's
   * textarea cursor isn't disturbed.
   */
  _saveBody(path, content) {
    if (!path) return;
    const now = Date.now();
    const newTags = extractTags(content);
    this._notes = this._notes.map((n) => {
      if (n.path !== path) return n;
      const merged = normalizeMetaEntry(
        { ...n.meta, tags: newTags, updated: now },
        { x: n.meta.x, y: n.meta.y },
      );
      return { ...n, body: content, meta: merged };
    });
    try { this.fs?.write?.(path, content, { modified: now }); } catch { /* ignore */ }
    setEntry(this.kernel, path, { tags: newTags, updated: now });

    // Partial re-render: side rail counts may have shifted; threads in
    // the cosmos stage may need redrawing. Skip detail panel.
    this._views.side.update(this._notes, this._filter);
    const visible = applyFilter(this._notes, this._filter);
    this._views.stage.update(visible, this._notes, this._selectedPath);
    if (this._activeTab === 'List')     this._views.list.update(visible, this._selectedPath);
    if (this._activeTab === 'Calendar') this._views.calendar.update(visible, this._selectedPath);
    if (this._activeTab === 'Timeline') this._views.timeline.update(visible, this._selectedPath);
  }

  async _createNote() {
    if (!this.fs) return;
    const title = sanitizeTitle(`Untitled ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    const path = this._uniquePath(title);
    const now = Date.now();
    this.fs.write(path, '', { created: now });
    setEntry(this.kernel, path, {
      title, created: now, updated: now, pinned: false, tags: [],
      x: gridPosition(this._notes.length).x,
      y: gridPosition(this._notes.length).y,
      status: 'draft',
    });
    this._notes = this._loadNotes();
    this._selectedPath = path;
    this._renderAll();
    this.kernel?.emit?.('toast', { message: 'New note created', type: 'success' });
  }

  async _deleteNote(path) {
    const note = this._notes.find((n) => n.path === path);
    if (!note) return;
    const ok = await showConfirm('Delete note',
      `Delete "${note.title || 'Untitled'}"? This can't be undone.`,
      { danger: true });
    if (!ok) return;
    try { this.fs?.remove?.(path); } catch { /* ignore */ }
    removeEntry(this.kernel, path);
    this._notes = this._notes.filter((n) => n.path !== path);
    if (this._selectedPath === path) this._selectedPath = this._notes[0]?.path || null;
    this._renderAll();
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

  _select(path) {
    if (!this._notes.find((n) => n.path === path)) return;
    this._selectedPath = path;
    this._renderAll();
  }

  /** Select a note from a non-Cosmos tab — also flips back to Cosmos. */
  _selectFromAnywhere(path) {
    if (!this._notes.find((n) => n.path === path)) return;
    this._selectedPath = path;
    if (this._activeTab !== 'Cosmos') this._activeTab = 'Cosmos';
    this._renderAll();
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

  // ── Render ─────────────────────────────────────────────────────

  _renderAll() {
    if (!this.root) return;

    this._views.side.update(this._notes, this._filter);

    const visible = applyFilter(this._notes, this._filter);
    this._views.stage.update(visible, this._notes, this._selectedPath);
    this._views.list.update(visible, this._selectedPath);
    this._views.calendar.update(visible, this._selectedPath);
    this._views.timeline.update(visible, this._selectedPath);

    const selected = this._notes.find((n) => n.path === this._selectedPath) || null;
    this._views.detail.update(selected, this._notes);

    this._renderTabState();
  }

  _renderTabState() {
    for (const t of this.root.querySelectorAll('[data-tab]')) {
      t.classList.toggle('is-active', t.dataset.tab === this._activeTab);
    }
    const stage = this._views.stage.root;
    const list = this._views.list.root;
    const cal = this._views.calendar.root;
    const tl = this._views.timeline.root;

    stage.style.display = this._activeTab === 'Cosmos'   ? '' : 'none';
    list.style.display  = this._activeTab === 'List'     ? '' : 'none';
    cal.style.display   = this._activeTab === 'Calendar' ? '' : 'none';
    tl.style.display    = this._activeTab === 'Timeline' ? '' : 'none';
  }
}
