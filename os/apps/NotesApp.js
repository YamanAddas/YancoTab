/**
 * NotesApp — "Constellation" redesign.
 *
 * 3-column layout: Smart/tags/mood sidebar + cosmic stage + detail
 * panel. Notes from /home/documents/*.txt are loaded once on init,
 * combined with metadata from kernel.storage[yancotab_notes_meta_v2],
 * and rendered as positioned hex-stars. SVG threads connect notes
 * that link to each other via [[Title]] wikilinks.
 *
 * PR-2: read-only detail panel. Editing lands in PR-3.
 */

import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { showConfirm, showPrompt } from '../ui/components/YancoModal.js';
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
    this._notes = [];                  // { path, title, body, meta }[]
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

    // Honor a payload.path opening directive (from FilesApp etc).
    if (payload?.path && this._notes.find((n) => n.path === payload.path)) {
      this._selectedPath = payload.path;
    } else {
      // Pre-select the most recently updated note for an inviting first frame.
      const sorted = [...this._notes].sort((a, b) => (b.meta.updated || 0) - (a.meta.updated || 0));
      this._selectedPath = sorted[0]?.path || null;
    }

    this._renderAll();

    // ⌘/ to focus the search beam.
    this.root.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        this._views.stage?.setSearch('');
        // Focus next frame so the input exists in the layout flow.
        requestAnimationFrame(() => this.root.querySelector('.nc-search-input')?.focus());
      }
    });
  }

  destroy() {
    if (this._styleLinks) {
      for (const l of this._styleLinks) l.remove();
      this._styleLinks = [];
    }
    super.destroy();
  }

  // ── Frame ──────────────────────────────────────────────────────

  _buildFrame() {
    // Title bar (tabs only).
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

    // Side rail
    this._views.side = buildSideRail({
      onPickSmart: (id) => this._setFilter({ smart: this._filter.smart === id ? null : id }),
      onPickTag:   (tag) => this._setFilter({ tag: this._filter.tag === tag ? null : tag }),
      onPickMood:  (status) => this._setFilter({ status: this._filter.status === status ? null : status }),
      onClearFilters: () => this._setFilter(emptyFilter(), true),
    });

    // Cosmic stage
    this._views.stage = buildCosmosStage({
      onSelectStar: (path) => this._select(path),
      onSearch: (q) => this._setFilter({ search: q }),
    });

    // Detail panel
    this._views.detail = buildDetailPanel({
      onPin: (path, pinned) => this._patchMeta(path, { pinned }),
      onSetStatus: (path, status) => this._patchMeta(path, { status }),
      onDelete: (path) => this._deleteNote(path),
      onCreate: () => this._createNote(),
      onSelectPath: (path) => this._select(path),
    });

    // Tab placeholders for List/Calendar/Timeline (Cosmos is the
    // primary view — the others render a "coming soon" card).
    this._views.placeholder = el('div', { class: 'nc-tab-placeholder' });
    this._views.placeholder.style.display = 'none';

    const center = el('div', { class: 'nc-center' }, [
      this._views.stage.root,
      this._views.placeholder,
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
    // FileSystemService returns items with `.path` (full path) and
    // `.type`. There's no `.name` field — derive it from the path.
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
      // Fill x/y from the grid for any note still missing them.
      const grid = gridPosition(i);
      const norm = normalizeMetaEntry({ ...baseEntry, x: baseEntry.x ?? grid.x, y: baseEntry.y ?? grid.y }, grid);
      // Auto-status if none set, so existing notes get a Mood tint.
      if (norm.status === null) norm.status = inferStatus(norm);
      return {
        path,
        title: norm.title,
        body,
        meta: norm,
      };
    });

    return notes;
  }

  _commit() {
    // Persist meta for any note whose live meta differs from storage.
    // Cheap to rewrite the whole map since it's <100 entries.
    const fullMap = {};
    for (const n of this._notes) fullMap[n.path] = n.meta;
    try { this.kernel?.storage?.save?.('yancotab_notes_meta_v2', fullMap); } catch { /* ignore */ }
    this._renderAll();
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

  _setFilter(patch, replace = false) {
    this._filter = replace ? patch : { ...this._filter, ...patch };
    this._renderAll();
  }

  _setTab(name) {
    if (this._activeTab === name) return;
    this._activeTab = name;
    this._renderTabState();
  }

  // ── Render ─────────────────────────────────────────────────────

  _renderAll() {
    if (!this.root) return;

    // Sidebar reads from the FULL note list (counts include hidden).
    this._views.side.update(this._notes, this._filter);

    // Stage shows filtered notes; threads use the full list so cross-
    // edges still appear when both endpoints are visible.
    const visible = applyFilter(this._notes, this._filter);
    this._views.stage.update(visible, this._notes, this._selectedPath);

    // Detail panel
    const selected = this._notes.find((n) => n.path === this._selectedPath) || null;
    this._views.detail.update(selected, this._notes);

    this._renderTabState();
  }

  _renderTabState() {
    for (const t of this.root.querySelectorAll('[data-tab]')) {
      t.classList.toggle('is-active', t.dataset.tab === this._activeTab);
    }
    const stage = this._views.stage.root;
    const ph = this._views.placeholder;
    if (this._activeTab === 'Cosmos') {
      stage.style.display = '';
      ph.style.display = 'none';
      ph.textContent = '';
      return;
    }
    stage.style.display = 'none';
    ph.style.display = 'block';
    const blurbs = {
      List: 'List view — landing in the next update.',
      Calendar: 'Calendar view — landing in the next update.',
      Timeline: 'Timeline view — landing in the next update.',
    };
    ph.textContent = blurbs[this._activeTab] || '';
  }
}
