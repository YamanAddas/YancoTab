import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { WindowChrome } from '../ui/components/WindowChrome.js';
import {
    sanitizeTitle as _sanitizeTitle,
    titleFromPath as _titleFromPath,
    extractTags as _extractTagsFn,
    snippet as _snippetFn,
    formatDate as _formatDateFn,
    wordCount as _wordCountFn,
} from '../utils/notes-utils.js';

/* ── Constants ───────────────────────────────────── */
const META_KEY   = 'yancotab_notes_meta_v2';
const EXT        = '.txt';
const SAVE_DELAY = 400;
const SK         = { VIEW: 'yancotab_notes_view', SORT: 'yancotab_notes_sort' };

const SORT_OPTIONS = [
    { id: 'updated', label: 'Date Modified' },
    { id: 'created', label: 'Date Created' },
    { id: 'name',    label: 'Name' },
];

/* ── NotesApp ────────────────────────────────────── */
export class NotesApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Notes', id: 'notes', icon: '\uD83D\uDCDD' };
        this.fs       = this.kernel.getService('fs');
        this.docsPath = '/home/documents';

        this.viewMode    = localStorage.getItem(SK.VIEW) || 'grid';
        this.sortMode    = localStorage.getItem(SK.SORT) || 'updated';
        this.searchTerm  = '';
        this._ctxMenu    = null;
        this._editorWindows = new Map();
        this._topZ = 400;

        this.notesMeta = this._loadMeta();
        if (this.fs && !this.fs.exists(this.docsPath)) this.fs.mkdir(this.docsPath);
    }

    async init(payload = {}) {
        this.root = el('div', { class: 'app-window app-notes' });

        this._buildBrowser();
        this.root.appendChild(this._browser);

        this._onDocDown = (e) => {
            if (this._ctxMenu && !this._ctxMenu.contains(e.target)) this._hideContextMenu();
        };
        document.addEventListener('pointerdown', this._onDocDown, true);

        if (payload?.path) {
            const raw = this.fs?.read(payload.path);
            const content = typeof payload.content === 'string'
                ? payload.content
                : (typeof raw?.content === 'string' ? raw.content : '');
            this._openNote(this._noteFromPath(payload.path, content, raw));
        } else {
            this._refreshGrid();
        }
    }

    destroy() {
        for (const path of [...this._editorWindows.keys()]) {
            this._closeEditorWindow(path, false);
        }
        document.removeEventListener('pointerdown', this._onDocDown, true);
        this._hideContextMenu();
        super.destroy();
    }

    /* ═══════════════════════════════════════════════
       Browser View
       ═══════════════════════════════════════════════ */

    _buildBrowser() {
        const toolbar = el('div', { class: 'notes-bw-toolbar' });

        this._searchInput = el('input', {
            class: 'notes-bw-search',
            placeholder: 'Search notes...',
            type: 'search',
            oninput: () => { this.searchTerm = this._searchInput.value; this._refreshGrid(); },
        });

        this._sortBtn = el('button', {
            class: 'notes-bw-btn', type: 'button', title: 'Sort',
            onclick: (e) => this._showSortMenu(e),
        }, this._sortLabel());

        const viewGroup = el('div', { class: 'notes-bw-view-group' });
        this._gridBtn = el('button', {
            class: `notes-bw-view-btn ${this.viewMode === 'grid' ? 'is-active' : ''}`,
            type: 'button', title: 'Grid view',
            onclick: () => this._setView('grid'),
        }, '\u25A6');
        this._listBtn = el('button', {
            class: `notes-bw-view-btn ${this.viewMode === 'list' ? 'is-active' : ''}`,
            type: 'button', title: 'List view',
            onclick: () => this._setView('list'),
        }, '\u2630');
        viewGroup.append(this._gridBtn, this._listBtn);

        const newBtn = el('button', {
            class: 'notes-bw-new-btn', type: 'button',
            onclick: () => this._createDocument(),
        }, '+ New');

        toolbar.append(this._searchInput, this._sortBtn, viewGroup, newBtn);

        this._gridContainer = el('div', {
            class: `notes-bw-grid ${this.viewMode === 'list' ? 'notes-bw-grid--list' : ''}`,
        });

        this._browserStatus = el('div', { class: 'notes-bw-status' });

        this._browser = el('div', { class: 'notes-browser' });
        this._browser.append(toolbar, this._gridContainer, this._browserStatus);
    }

    _setView(mode) {
        this.viewMode = mode;
        localStorage.setItem(SK.VIEW, mode);
        this._gridContainer.classList.toggle('notes-bw-grid--list', mode === 'list');
        this._gridBtn.classList.toggle('is-active', mode === 'grid');
        this._listBtn.classList.toggle('is-active', mode === 'list');
    }

    _sortLabel() {
        return (SORT_OPTIONS.find(o => o.id === this.sortMode) || SORT_OPTIONS[0]).label;
    }

    _showSortMenu(e) {
        this._hideContextMenu();
        const rect = e.currentTarget.getBoundingClientRect();
        const rootRect = this.root.getBoundingClientRect();

        const menu = el('div', { class: 'notes-ctx-menu' });
        SORT_OPTIONS.forEach(opt => {
            menu.appendChild(el('button', {
                class: `notes-ctx-item ${opt.id === this.sortMode ? 'is-active' : ''}`,
                type: 'button',
                onclick: () => {
                    this.sortMode = opt.id;
                    localStorage.setItem(SK.SORT, opt.id);
                    this._sortBtn.textContent = opt.label;
                    this._refreshGrid();
                    this._hideContextMenu();
                },
            }, opt.label));
        });

        menu.style.top  = (rect.bottom - rootRect.top + 4) + 'px';
        menu.style.left = (rect.left - rootRect.left) + 'px';
        this._ctxMenu = menu;
        this.root.appendChild(menu);
    }

    _refreshGrid() {
        this._gridContainer.innerHTML = '';
        const notes = this._getNotes();
        const q = this.searchTerm.trim().toLowerCase();

        const filtered = q
            ? notes.filter(n =>
                  n.title.toLowerCase().includes(q)
                  || n.body.toLowerCase().includes(q)
                  || (n.tags || []).some(t => t.includes(q)))
            : notes;

        if (filtered.length === 0) {
            this._gridContainer.appendChild(this._renderEmpty(notes.length > 0));
        } else {
            filtered.forEach(n => this._gridContainer.appendChild(this._renderDocCard(n)));
        }

        this._browserStatus.textContent = `${filtered.length} document${filtered.length !== 1 ? 's' : ''}`;
    }

    _renderDocCard(note) {
        const card = el('button', {
            class: `notes-doc-card ${note.pinned ? 'is-pinned' : ''}`,
            type: 'button',
            onclick: () => this._openNote(note),
            oncontextmenu: (e) => { e.preventDefault(); e.stopPropagation(); this._showNoteCtxMenu(e, note); },
        });

        if (note.pinned) card.appendChild(el('div', { class: 'notes-doc-pin' }, 'Pinned'));

        // Hex icon (like Files app)
        const icon = el('div', { class: 'notes-doc-hex' }, '\uD83D\uDCC4');
        // Preview snippet inside hex area
        const preview = el('div', { class: 'notes-doc-preview' }, this._snippet(note.body, 60));
        icon.appendChild(preview);
        card.appendChild(icon);

        const title = el('div', { class: 'notes-doc-title' }, note.title || 'Untitled');
        const tagStr = note.tags?.length ? ` \u00B7 #${note.tags.slice(0, 2).join(' #')}` : '';
        const meta = el('div', { class: 'notes-doc-meta' }, this._formatDate(note.updated) + tagStr);

        card.append(title, meta);
        return card;
    }

    _renderEmpty(hasNotes) {
        return el('div', { class: 'notes-bw-empty' }, [
            el('div', { class: 'notes-bw-empty-title' }, hasNotes ? 'No matching notes' : 'No documents yet'),
            el('p', {}, hasNotes ? 'Try a different search term.' : 'Create your first document to get started.'),
            el('button', {
                class: 'notes-bw-empty-btn', type: 'button',
                onclick: () => this._createDocument(),
            }, '+ New Document'),
        ]);
    }

    _showNoteCtxMenu(e, note) {
        this._hideContextMenu();
        const rootRect = this.root.getBoundingClientRect();
        const menu = el('div', { class: 'notes-ctx-menu' });

        const items = [
            { label: 'Open',   action: () => this._openNote(note) },
            { label: note.pinned ? 'Unpin' : 'Pin', action: () => { this._togglePin(note); this._refreshGrid(); } },
            { label: 'Duplicate', action: () => this._duplicateNote(note) },
            { label: 'Delete', action: () => this._deleteNote(note), cls: 'notes-ctx-item--danger' },
        ];

        items.forEach(it => {
            menu.appendChild(el('button', {
                class: `notes-ctx-item ${it.cls || ''}`,
                type: 'button',
                onclick: () => { it.action(); this._hideContextMenu(); },
            }, it.label));
        });

        let top  = e.clientY - rootRect.top;
        let left = e.clientX - rootRect.left;
        if (left + 160 > rootRect.width)  left = rootRect.width - 164;
        if (top + 160 > rootRect.height)  top  = rootRect.height - 164;

        menu.style.top  = top + 'px';
        menu.style.left = left + 'px';
        this._ctxMenu = menu;
        this.root.appendChild(menu);
    }

    _hideContextMenu() {
        if (this._ctxMenu) { this._ctxMenu.remove(); this._ctxMenu = null; }
    }

    _createDocument() {
        if (!this.fs) return;
        const title = 'Untitled';
        const path  = this._uniquePath(title);
        const now   = Date.now();
        this.fs.write(path, '', { created: now });
        this._setMeta(path, { title, created: now, updated: now, pinned: false, tags: [] });

        this._openNote({
            path, title, body: '', created: now, updated: now,
            pinned: false, tags: [], isExternal: false,
        });
    }

    _duplicateNote(note) {
        if (!this.fs || !note) return;
        const title = note.title + ' (Copy)';
        const path  = this._uniquePath(title);
        const now   = Date.now();
        this.fs.write(path, note.body || '', { created: now });
        this._setMeta(path, { title, created: now, updated: now, pinned: false, tags: note.tags || [] });
        this._refreshGrid();
    }

    /* ═══════════════════════════════════════════════
       Editor Windows (floating Notepad-style)
       ═══════════════════════════════════════════════ */

    _openNote(note) {
        const existing = this._editorWindows.get(note.path);
        if (existing) {
            existing.wc.chrome.style.zIndex = ++this._topZ;
            return;
        }
        this._createEditorWindow(note);
    }

    _createEditorWindow(note) {
        const ctx = {
            note: {
                ...note,
                body: typeof note.body === 'string' ? note.body : '',
                title: note.title || 'Untitled',
                tags: Array.isArray(note.tags) ? note.tags : this._extractTags(note.body || ''),
            },
            saveTimer: null,
            pendingSave: false,
            findVisible: false,
            destroyed: false,
            wc: null,
            textarea: null,
            saveInd: null,
            findBar: null,
            findInput: null,
            replaceInput: null,
            findInfo: null,
            statusBar: null,
            cleanup: null,
        };

        const edRoot = el('div', { class: 'notes-editor-root' });

        /* ── Menu Bar ── */
        const menubar = el('div', { class: 'notes-menubar' });
        let activeDropdown = null;
        let menuIsOpen = false;

        const closeMenus = () => {
            if (activeDropdown) { activeDropdown.hidden = true; activeDropdown = null; }
            menuIsOpen = false;
            menubar.querySelectorAll('.is-open').forEach(t => t.classList.remove('is-open'));
        };

        const makeMenu = (label, items) => {
            const wrapper = el('div', { class: 'notes-menu-wrapper' });
            const trigger = el('button', { class: 'notes-menu-trigger', type: 'button' }, label);
            const dropdown = el('div', { class: 'notes-menu-dropdown' });
            dropdown.hidden = true;

            items.forEach(item => {
                if (item.sep) {
                    dropdown.appendChild(el('div', { class: 'notes-menu-sep' }));
                } else {
                    const mi = el('button', { class: `notes-menu-item ${item.cls || ''}`, type: 'button' });
                    mi.appendChild(el('span', {}, item.label));
                    if (item.shortcut) mi.appendChild(el('span', { class: 'notes-menu-shortcut' }, item.shortcut));
                    mi.addEventListener('click', () => { closeMenus(); item.action(); });
                    dropdown.appendChild(mi);
                }
            });

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (activeDropdown === dropdown) { closeMenus(); return; }
                closeMenus();
                dropdown.hidden = false;
                activeDropdown = dropdown;
                menuIsOpen = true;
                trigger.classList.add('is-open');
            });

            trigger.addEventListener('mouseenter', () => {
                if (menuIsOpen && activeDropdown !== dropdown) {
                    closeMenus();
                    dropdown.hidden = false;
                    activeDropdown = dropdown;
                    trigger.classList.add('is-open');
                }
            });

            wrapper.append(trigger, dropdown);
            return wrapper;
        };

        ctx.saveInd = el('div', { class: 'notes-ed-save-ind' }, 'Saved');

        menubar.appendChild(makeMenu('File', [
            { label: 'Save', shortcut: 'Ctrl+S', action: () => { flushSave(); saveNote({ renamePath: true }); } },
            { label: 'Save As\u2026', action: () => promptSaveAs() },
            { label: 'Rename\u2026', action: () => promptRename() },
            { sep: true },
            { label: 'Export / Download', action: () => downloadNote() },
            { sep: true },
            { label: ctx.note.pinned ? 'Unpin' : 'Pin', action: () => { this._togglePin(ctx.note); } },
            { label: 'Delete', cls: 'notes-menu-item--danger', action: () => this._deleteNote(ctx.note) },
            { sep: true },
            { label: 'Close', shortcut: 'Ctrl+W', action: () => closeWindow() },
        ]));

        menubar.appendChild(makeMenu('Edit', [
            { label: 'Undo', shortcut: 'Ctrl+Z', action: () => { ctx.textarea.focus(); document.execCommand('undo'); } },
            { label: 'Redo', shortcut: 'Ctrl+Y', action: () => { ctx.textarea.focus(); document.execCommand('redo'); } },
            { sep: true },
            { label: 'Cut', shortcut: 'Ctrl+X', action: () => { ctx.textarea.focus(); document.execCommand('cut'); } },
            { label: 'Copy', shortcut: 'Ctrl+C', action: () => { ctx.textarea.focus(); document.execCommand('copy'); } },
            { label: 'Paste', shortcut: 'Ctrl+V', action: () => { ctx.textarea.focus(); } },
            { sep: true },
            { label: 'Select All', shortcut: 'Ctrl+A', action: () => { ctx.textarea.focus(); ctx.textarea.select(); } },
            { sep: true },
            { label: 'Insert Date / Time', action: () => insertText(new Date().toLocaleString()) },
            { label: 'Insert Divider', action: () => insertText('\n---\n') },
        ]));

        menubar.appendChild(makeMenu('Format', [
            { label: 'Heading', shortcut: '#', action: () => prefixLine('# ') },
            { label: 'Bold', shortcut: 'Ctrl+B', action: () => wrapSelection('**', '**') },
            { label: 'Italic', shortcut: 'Ctrl+I', action: () => wrapSelection('*', '*') },
            { label: 'Strikethrough', shortcut: '~~', action: () => wrapSelection('~~', '~~') },
            { sep: true },
            { label: 'Code', shortcut: '`', action: () => wrapSelection('`', '`') },
            { label: 'Blockquote', shortcut: '>', action: () => prefixLine('> ') },
            { label: 'Bullet List', shortcut: '-', action: () => prefixLine('- ') },
            { label: 'Checklist', shortcut: '[ ]', action: () => prefixLine('- [ ] ') },
        ]));

        menubar.appendChild(makeMenu('Search', [
            { label: 'Find & Replace', shortcut: 'Ctrl+F', action: () => toggleFind() },
            { label: 'Find Next', shortcut: 'F3', action: () => findNext(1) },
            { label: 'Find Previous', shortcut: 'Shift+F3', action: () => findNext(-1) },
        ]));

        menubar.appendChild(ctx.saveInd);

        /* ── Find Bar ── */
        ctx.findBar = el('div', { class: 'notes-ed-find-bar' });
        ctx.findBar.hidden = true;

        ctx.findInput = el('input', {
            class: 'notes-ed-find-input', placeholder: 'Find...',
            oninput: () => updateFindInfo(),
        });
        ctx.findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); findNext(e.shiftKey ? -1 : 1); }
            if (e.key === 'Escape') toggleFind();
        });

        ctx.replaceInput = el('input', {
            class: 'notes-ed-find-input', placeholder: 'Replace...',
        });
        ctx.replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); replaceOne(); }
        });

        ctx.findInfo = el('span', { class: 'notes-ed-find-info' });
        const findActions = el('div', { class: 'notes-ed-find-actions' });
        findActions.append(
            el('button', { class: 'notes-ed-find-btn', type: 'button', onclick: () => findNext(-1), title: 'Previous' }, '\u2191'),
            el('button', { class: 'notes-ed-find-btn', type: 'button', onclick: () => findNext(1),  title: 'Next' }, '\u2193'),
            el('button', { class: 'notes-ed-find-btn', type: 'button', onclick: () => replaceOne() }, 'Replace'),
            el('button', { class: 'notes-ed-find-btn', type: 'button', onclick: () => replaceAll() }, 'All'),
            el('button', { class: 'notes-ed-find-btn', type: 'button', onclick: () => toggleFind() }, '\u2715'),
        );
        ctx.findBar.append(ctx.findInput, ctx.replaceInput, ctx.findInfo, findActions);

        /* ── Textarea ── */
        ctx.textarea = el('textarea', {
            class: 'notes-ed-body',
            placeholder: 'Start writing...',
            spellcheck: 'false',
            oninput: () => {
                ctx.note.body = ctx.textarea.value;
                queueSave();
                updateStatus();
            },
        });
        ctx.textarea.value = ctx.note.body;

        ctx.textarea.addEventListener('keydown', (e) => {
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key === 's') { e.preventDefault(); flushSave(); saveNote({ renamePath: true }); }
            if (mod && e.key === 'f') { e.preventDefault(); toggleFind(); }
            if (mod && e.key === 'b') { e.preventDefault(); wrapSelection('**', '**'); }
            if (mod && e.key === 'i') { e.preventDefault(); wrapSelection('*', '*'); }
            if (mod && e.key === 'w') { e.preventDefault(); closeWindow(); }
            if (e.key === 'Escape' && ctx.findVisible) toggleFind();
            if (e.key === 'F3') { e.preventDefault(); findNext(e.shiftKey ? -1 : 1); }
        });

        ctx.textarea.addEventListener('click', updateStatus);
        ctx.textarea.addEventListener('keyup', updateStatus);

        /* ── Status Bar ── */
        ctx.statusBar = el('div', { class: 'notes-ed-status' });

        /* ── Assemble ── */
        edRoot.append(menubar, ctx.findBar, ctx.textarea, ctx.statusBar);

        /* ── WindowChrome ── */
        const wc = new WindowChrome(ctx.note.title, edRoot, () => {
            this._closeEditorWindow(ctx.note.path);
        });
        ctx.wc = wc;

        document.body.appendChild(wc.chrome);

        // Position offset from cascading windows
        const offset = (this._editorWindows.size % 5) * 22;
        wc.chrome.style.left = `calc(18% + ${offset}px)`;
        wc.chrome.style.top = `calc(12% + ${offset}px)`;
        wc.chrome.style.width = '60%';
        wc.chrome.style.height = '72%';
        wc.chrome.style.zIndex = ++this._topZ;

        // Bring to front on click
        wc.chrome.addEventListener('pointerdown', () => {
            wc.chrome.style.zIndex = ++this._topZ;
        }, true);

        // Close menus on outside click
        const onBodyDown = (e) => {
            if (menuIsOpen && !menubar.contains(e.target)) closeMenus();
        };
        document.addEventListener('pointerdown', onBodyDown, true);

        ctx.cleanup = () => {
            document.removeEventListener('pointerdown', onBodyDown, true);
        };

        this._editorWindows.set(ctx.note.path, ctx);
        updateStatus();
        requestAnimationFrame(() => ctx.textarea.focus());

        /* ── Local helpers (closures over ctx) ── */

        function queueSave() {
            setSaveState('saving');
            ctx.pendingSave = true;
            if (ctx.saveTimer) clearTimeout(ctx.saveTimer);
            ctx.saveTimer = setTimeout(() => {
                ctx.saveTimer = null;
                if (ctx.pendingSave) { ctx.pendingSave = false; saveNote({ renamePath: false }); }
            }, SAVE_DELAY);
        }

        function flushSave() {
            if (ctx.saveTimer) { clearTimeout(ctx.saveTimer); ctx.saveTimer = null; }
            if (ctx.pendingSave) { ctx.pendingSave = false; saveNote({ renamePath: false }); }
        }

        const saveNote = ({ renamePath = false } = {}) => {
            if (!this.fs || !ctx.note) return;
            const n = ctx.note;
            const now = Date.now();
            const cleanTitle = this._sanitizeTitle(n.title || this._titleFromPath(n.path) || 'Untitled');
            const body = typeof n.body === 'string' ? n.body : '';

            const oldPath = n.path || null;
            const oldMeta = oldPath ? this._getMeta(oldPath) : null;
            const oldFile = oldPath ? this.fs.read(oldPath) : null;
            const created = oldMeta?.created || oldFile?.meta?.created || now;

            let nextPath = oldPath;
            if (!nextPath) {
                nextPath = this._uniquePath(cleanTitle);
            } else if (renamePath && !n.isExternal) {
                nextPath = this._uniquePath(cleanTitle, EXT, oldPath);
            }

            if (oldPath && nextPath !== oldPath && this.fs.exists(oldPath)) {
                this.fs.rename(oldPath, nextPath);
                this._deleteMeta(oldPath);
                this._editorWindows.delete(oldPath);
                this._editorWindows.set(nextPath, ctx);
            }

            this.fs.write(nextPath, body, { created });

            n.path    = nextPath;
            n.title   = cleanTitle;
            n.body    = body;
            n.updated = now;
            n.created = created;
            n.tags    = this._extractTags(body);

            this._setMeta(nextPath, {
                title: n.title, updated: now, created, pinned: Boolean(n.pinned), tags: n.tags,
            });

            setSaveState('saved');
            const titleEl = wc.chrome?.querySelector('.window-chrome__title');
            if (titleEl) titleEl.textContent = n.title;
        };

        function setSaveState(state) {
            if (!ctx.saveInd) return;
            ctx.saveInd.textContent = state === 'saving' ? 'Saving\u2026' : 'Saved';
            ctx.saveInd.classList.toggle('is-saving', state === 'saving');
        }

        function updateStatus() {
            if (!ctx.statusBar || !ctx.note) return;
            const body = ctx.note.body || '';
            const words = body.trim() ? body.trim().split(/\s+/).length : 0;
            const chars = body.length;
            const lines = body ? body.split('\n').length : 0;
            const pos = ctx.textarea.selectionStart || 0;
            const textBefore = body.slice(0, pos);
            const ln = textBefore.split('\n').length;
            const col = pos - textBefore.lastIndexOf('\n');
            ctx.statusBar.textContent = `Ln ${ln}, Col ${col}  \u00B7  ${words} words  \u00B7  ${chars} chars  \u00B7  ${lines} lines`;
        }

        function wrapSelection(before, after) {
            const ta = ctx.textarea;
            ta.focus();
            const s = ta.selectionStart;
            const e = ta.selectionEnd;
            const sel = ta.value.slice(s, e);
            ta.setRangeText(before + sel + after, s, e, 'end');
            if (!sel) { const c = s + before.length; ta.setSelectionRange(c, c); }
            ctx.note.body = ta.value;
            queueSave();
            updateStatus();
        }

        function prefixLine(prefix) {
            const ta = ctx.textarea;
            ta.focus();
            const lineStart = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
            ta.setRangeText(prefix, lineStart, lineStart, 'end');
            ctx.note.body = ta.value;
            queueSave();
            updateStatus();
        }

        function insertText(text) {
            const ta = ctx.textarea;
            ta.focus();
            ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
            ctx.note.body = ta.value;
            queueSave();
            updateStatus();
        }

        function toggleFind() {
            ctx.findVisible = !ctx.findVisible;
            ctx.findBar.hidden = !ctx.findVisible;
            if (ctx.findVisible) {
                ctx.findInput.focus();
                const sel = ctx.textarea.value.slice(ctx.textarea.selectionStart, ctx.textarea.selectionEnd);
                if (sel) { ctx.findInput.value = sel; updateFindInfo(); }
            }
        }

        function findNext(dir = 1) {
            const query = ctx.findInput.value;
            if (!query) return;
            const ta = ctx.textarea;
            const text = ta.value;
            let idx;
            if (dir === 1) {
                idx = text.indexOf(query, ta.selectionEnd);
                if (idx === -1) idx = text.indexOf(query);
            } else {
                idx = text.lastIndexOf(query, ta.selectionStart - 1);
                if (idx === -1) idx = text.lastIndexOf(query);
            }
            if (idx !== -1) { ta.focus(); ta.setSelectionRange(idx, idx + query.length); }
            updateFindInfo();
        }

        function replaceOne() {
            const ta = ctx.textarea;
            const query = ctx.findInput.value;
            const repl = ctx.replaceInput.value;
            if (!query) return;
            if (ta.value.slice(ta.selectionStart, ta.selectionEnd) === query) {
                ta.setRangeText(repl, ta.selectionStart, ta.selectionEnd, 'end');
                ctx.note.body = ta.value;
                queueSave();
            }
            findNext(1);
        }

        function replaceAll() {
            const query = ctx.findInput.value;
            const repl = ctx.replaceInput.value;
            if (!query) return;
            ctx.textarea.value = ctx.textarea.value.split(query).join(repl);
            ctx.note.body = ctx.textarea.value;
            queueSave();
            updateFindInfo();
            updateStatus();
        }

        function updateFindInfo() {
            const query = ctx.findInput.value;
            if (!query) { ctx.findInfo.textContent = ''; return; }
            const matches = ctx.textarea.value.split(query).length - 1;
            ctx.findInfo.textContent = `${matches} match${matches !== 1 ? 'es' : ''}`;
        }

        function promptRename() {
            const newName = prompt('Rename document:', ctx.note.title);
            if (!newName || newName === ctx.note.title) return;
            ctx.note.title = newName;
            flushSave();
            saveNote({ renamePath: true });
        }

        const promptSaveAs = () => {
            const suggested = ctx.note.path || `${this.docsPath}/${this._sanitizeTitle(ctx.note.title || 'Untitled')}${EXT}`;
            const nextPath = prompt('Save As (full path):', suggested);
            if (!nextPath || nextPath === ctx.note.path) return;

            if (this.fs.exists(nextPath)) {
                if (!confirm(`"${nextPath}" exists. Replace it?`)) return;
                this.fs.delete(nextPath);
                this._deleteMeta(nextPath);
            }

            const prev = ctx.note.path;
            if (prev && this.fs.exists(prev)) {
                this.fs.rename(prev, nextPath);
                this._deleteMeta(prev);
            }

            this._editorWindows.delete(ctx.note.path);
            ctx.note.path  = nextPath;
            ctx.note.title = this._titleFromPath(nextPath);
            ctx.note.isExternal = !nextPath.startsWith(this.docsPath);
            this._editorWindows.set(nextPath, ctx);
            saveNote({ renamePath: false });
        };

        function downloadNote() {
            const blob = new Blob([ctx.note.body || ''], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${ctx.note.title || 'Untitled'}.txt`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }

        const closeWindow = () => {
            this._closeEditorWindow(ctx.note.path);
        };
    }

    _closeEditorWindow(path, refresh = true) {
        const ctx = this._editorWindows.get(path);
        if (!ctx || ctx.destroyed) return;
        ctx.destroyed = true;

        if (ctx.saveTimer) clearTimeout(ctx.saveTimer);
        if (ctx.pendingSave) {
            ctx.pendingSave = false;
            if (this.fs && ctx.note) {
                const now = Date.now();
                this.fs.write(ctx.note.path, ctx.note.body || '', { created: ctx.note.created || now });
                this._setMeta(ctx.note.path, {
                    title: ctx.note.title, updated: now, created: ctx.note.created || now,
                    pinned: Boolean(ctx.note.pinned), tags: ctx.note.tags || [],
                });
            }
        }

        ctx.cleanup?.();
        ctx.wc.destroy();
        this._editorWindows.delete(path);
        if (refresh) this._refreshGrid();
    }

    /* ═══════════════════════════════════════════════
       Data Operations
       ═══════════════════════════════════════════════ */

    _getNotes() {
        if (!this.fs) return [];
        const files = this.fs.list(this.docsPath)
            .filter(f => f.type !== 'directory' && /\.(txt|md|json)$/i.test(f.path));

        const livePaths = new Set(files.map(f => f.path));
        this._pruneMeta(livePaths);

        const notes = files.map(file => {
            const meta = this._getMeta(file.path);
            const body = typeof file.content === 'string' ? file.content : '';
            const updated = meta?.updated || file.meta?.modified || file.meta?.created || Date.now();
            const created = meta?.created || file.meta?.created || updated;
            return {
                path: file.path,
                title: meta?.title || this._titleFromPath(file.path),
                body, created, updated,
                pinned: Boolean(meta?.pinned),
                tags: Array.isArray(meta?.tags) && meta.tags.length ? meta.tags : this._extractTags(body),
                isExternal: false,
            };
        });

        notes.sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            switch (this.sortMode) {
                case 'name':    return a.title.localeCompare(b.title);
                case 'created': return b.created - a.created;
                default:        return b.updated - a.updated;
            }
        });

        return notes;
    }

    _noteFromPath(path, content, raw) {
        const meta = this._getMeta(path);
        return {
            path,
            title: meta?.title || this._titleFromPath(path),
            body: content || '',
            created: meta?.created || raw?.meta?.created || Date.now(),
            updated: meta?.updated || raw?.meta?.modified || Date.now(),
            pinned: Boolean(meta?.pinned),
            tags: Array.isArray(meta?.tags) && meta.tags.length ? meta.tags : this._extractTags(content || ''),
            isExternal: !path.startsWith(this.docsPath),
        };
    }

    _deleteNote(note) {
        if (!note) return;
        if (!confirm(`Delete "${note.title || 'Untitled'}"?`)) return;

        if (this._editorWindows.has(note.path)) {
            const ctx = this._editorWindows.get(note.path);
            if (ctx.saveTimer) clearTimeout(ctx.saveTimer);
            ctx.pendingSave = false;
            ctx.destroyed = true;
            ctx.cleanup?.();
            ctx.wc.destroy();
            this._editorWindows.delete(note.path);
        }

        if (note.path && this.fs?.exists(note.path)) {
            this.fs.delete(note.path);
            this._deleteMeta(note.path);
        }
        this._refreshGrid();
    }

    _togglePin(note) {
        if (!note) return;
        note.pinned = !note.pinned;
        if (note.path) {
            this._setMeta(note.path, {
                title: note.title, pinned: note.pinned, tags: note.tags,
                updated: note.updated || Date.now(), created: note.created || Date.now(),
            });
        }
    }

    /* ═══════════════════════════════════════════════
       Meta Persistence
       ═══════════════════════════════════════════════ */

    _loadMeta() {
        try {
            const d = this.kernel.storage?.load(META_KEY);
            return d && typeof d === 'object' ? d : {};
        } catch { return {}; }
    }
    _persistMeta() { this.kernel.storage?.save(META_KEY, this.notesMeta); }
    _getMeta(p) { return p ? this.notesMeta[p] || null : null; }
    _setMeta(p, patch = {}) {
        if (!p) return;
        this.notesMeta[p] = { ...(this.notesMeta[p] || {}), ...patch };
        this._persistMeta();
    }
    _deleteMeta(p) { if (p && this.notesMeta[p]) { delete this.notesMeta[p]; this._persistMeta(); } }
    _pruneMeta(valid) {
        let changed = false;
        Object.keys(this.notesMeta).forEach(p => {
            if (p.startsWith(this.docsPath + '/') && !valid.has(p)) { delete this.notesMeta[p]; changed = true; }
        });
        if (changed) this._persistMeta();
    }

    /* ═══════════════════════════════════════════════
       Utilities
       ═══════════════════════════════════════════════ */

    _titleFromPath(p) { return _titleFromPath(p); }

    _sanitizeTitle(v) { return _sanitizeTitle(v); }

    _uniquePath(base, ext = EXT, current = null) {
        const title = this._sanitizeTitle(base);
        let candidate = `${this.docsPath}/${title}${ext}`;
        if (current && candidate === current) return candidate;
        let i = 2;
        while (this.fs.exists(candidate) && candidate !== current) {
            candidate = `${this.docsPath}/${title} (${i++})${ext}`;
        }
        return candidate;
    }

    _extractTags(body = '') { return _extractTagsFn(body); }

    _snippet(body = '', max = 120) { return _snippetFn(body, max); }

    _formatDate(ts) { return _formatDateFn(ts); }
}
