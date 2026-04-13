import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

const NOTES_META_KEY = 'yancotab_notes_meta_v2';
const NOTES_EXT = '.txt';
const AUTOSAVE_MS = 260;

export class NotesApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Notes', id: 'notes', icon: '📝' };
        this.fs = this.kernel.getService('fs');
        this.docsPath = '/home/documents';
        this.viewState = 'list';
        this.searchTerm = '';
        this.currentNote = null;
        this._pendingSave = null;
        this._saveTimer = null;
        this.notesMeta = this._loadMeta();
        this.activeEditor = null;

        if (this.fs && !this.fs.exists(this.docsPath)) {
            this.fs.mkdir(this.docsPath);
        }
    }

    async init(payload = {}) {
        this.root = el('div', { class: 'app-window app-notes' });
        this.root.dataset.view = 'list';
        this.buildLayout();

        if (payload?.path) {
            const raw = this.fs ? this.fs.read(payload.path) : null;
            const content = typeof payload.content === 'string'
                ? payload.content
                : (typeof raw?.content === 'string' ? raw.content : '');

            const note = {
                path: payload.path,
                title: this._titleFromPath(payload.path),
                body: content,
                created: raw?.meta?.created || Date.now(),
                updated: raw?.meta?.modified || Date.now(),
                pinned: false,
                tags: this._extractTags(content),
                isExternal: !payload.path.startsWith(this.docsPath),
            };

            const meta = this._getMeta(payload.path);
            if (meta) {
                note.title = meta.title || note.title;
                note.pinned = Boolean(meta.pinned);
                note.updated = meta.updated || note.updated;
                note.created = meta.created || note.created;
                note.tags = Array.isArray(meta.tags) && meta.tags.length ? meta.tags : note.tags;
            }

            this.openNote(note, { focusBody: true });
        } else {
            this.refreshList();
            this.renderEmptyEditor();
        }
    }

    destroy() {
        this.flushPendingSave();
        this.activeEditor = null;
        super.destroy();
    }

    buildLayout() {
        this.header = el('div', { class: 'notes-header' }, [
            el('div', { class: 'win-title' }, 'Notes'),
            el('div', { class: 'notes-win-controls' }, [
                el('button', { class: 'n-win-btn n-min', type: 'button', 'aria-hidden': 'true', tabindex: '-1' }),
                el('button', { class: 'n-win-btn n-max', type: 'button', 'aria-hidden': 'true', tabindex: '-1' }),
                el('button', { class: 'n-win-btn n-close', type: 'button', onclick: () => this.close(), 'aria-label': 'Close Notes' }),
                el('button', { class: 'n-close-mobile', type: 'button', onclick: () => this.close(), 'aria-label': 'Close Notes' }, '✕'),
            ]),
        ]);

        const body = el('div', { class: 'notes-body' });

        this.sidebar = el('div', { class: 'notes-sidebar' }, [
            el('div', { class: 'notes-sb-header' }, [
                el('div', { class: 'notes-sb-title' }, 'Documents'),
                el('button', { class: 'notes-add-btn', type: 'button', onclick: () => this.createNote(), 'aria-label': 'Create note' }, '+'),
            ]),
            el('div', { class: 'notes-search-container' }, [
                this.searchInput = el('input', {
                    class: 'notes-search',
                    placeholder: 'Search title, body, #tags',
                    oninput: (e) => this.filterList(e.target.value),
                }),
            ]),
            this.listContainer = el('div', { class: 'notes-list' }),
        ]);

        this.editorContainer = el('div', { class: 'notes-editor-container' });

        body.append(this.sidebar, this.editorContainer);
        this.root.append(this.header, body);
    }

    setView(mode) {
        if (mode === 'list') {
            this.flushPendingSave();
        }
        this.viewState = mode;
        this.root.dataset.view = mode;
    }

    filterList(term = '') {
        this.searchTerm = term;
        this.refreshList(term);
    }

    refreshList(filterTerm = this.searchTerm) {
        this.listContainer.innerHTML = '';

        const allNotes = this.getNotes();
        const query = String(filterTerm || '').trim().toLowerCase();
        const filtered = query
            ? allNotes.filter((note) => {
                const inTags = (note.tags || []).some((tag) => tag.toLowerCase().includes(query));
                return note.title.toLowerCase().includes(query)
                    || note.body.toLowerCase().includes(query)
                    || inTags;
            })
            : allNotes;

        if (filtered.length === 0) {
            this.listContainer.appendChild(this._renderListEmpty(allNotes.length > 0));
            return;
        }

        filtered.forEach((note) => {
            const isActive = this.currentNote && this.currentNote.path === note.path;
            const tagText = note.tags?.length ? `#${note.tags.slice(0, 2).join(' #')}` : 'No tags';

            const card = el('button', {
                class: `notes-card ${isActive ? 'active' : ''}`,
                type: 'button',
                onclick: () => this.openNote(note),
            }, [
                el('div', { class: 'notes-card-head' }, [
                    el('div', { class: 'notes-card-title' }, note.title || 'Untitled'),
                    el('span', { class: `notes-card-pin ${note.pinned ? 'is-on' : ''}` }, note.pinned ? 'Pinned' : ''),
                ]),
                el('div', { class: 'notes-card-snippet' }, this._snippet(note.body)),
                el('div', { class: 'notes-card-meta' }, `${this._formatWhen(note.updated)} • ${tagText}`),
            ]);

            this.listContainer.appendChild(card);
        });
    }

    getNotes() {
        if (!this.fs) return [];

        const files = this.fs.list(this.docsPath)
            .filter((item) => item.type !== 'directory' && /\.(txt|md|json)$/i.test(item.path));

        const livePaths = new Set(files.map((item) => item.path));
        this._pruneMeta(livePaths);

        const notes = files.map((file) => {
            const meta = this._getMeta(file.path);
            const body = typeof file.content === 'string' ? file.content : '';
            const updated = meta?.updated || file.meta?.modified || file.meta?.created || Date.now();
            const created = meta?.created || file.meta?.created || updated;
            const tags = Array.isArray(meta?.tags) && meta.tags.length
                ? meta.tags
                : this._extractTags(body);

            return {
                path: file.path,
                title: meta?.title || this._titleFromPath(file.path),
                body,
                created,
                updated,
                pinned: Boolean(meta?.pinned),
                tags,
                isExternal: false,
            };
        });

        notes.sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            if (a.updated !== b.updated) return b.updated - a.updated;
            return a.title.localeCompare(b.title);
        });

        return notes;
    }

    createNote() {
        if (!this.fs) return;
        const title = 'Untitled';
        const path = this._uniquePath(title);
        const now = Date.now();

        this.fs.write(path, '', { created: now });
        this._setMeta(path, {
            title,
            created: now,
            updated: now,
            pinned: false,
            tags: [],
        });

        const note = {
            path,
            title,
            body: '',
            created: now,
            updated: now,
            pinned: false,
            tags: [],
            isExternal: false,
        };

        this.openNote(note, { focusTitle: true });
    }

    openNote(note, options = {}) {
        this.flushPendingSave();
        this.currentNote = {
            ...note,
            body: typeof note.body === 'string' ? note.body : '',
            title: note.title || 'Untitled',
            tags: Array.isArray(note.tags) ? note.tags : this._extractTags(note.body || ''),
        };

        this.renderEditor(this.currentNote);
        this.setView('editor');
        this.refreshList(this.searchTerm);

        if (options.focusTitle) {
            this.activeEditor?.titleInput?.focus();
            this.activeEditor?.titleInput?.select?.();
        } else if (options.focusBody) {
            this.activeEditor?.bodyInput?.focus();
        }
    }

    deleteNote(note) {
        if (!note) return;
        if (!confirm(`Delete "${note.title || 'Untitled'}"?`)) return;

        this.flushPendingSave();
        if (note.path && this.fs?.exists(note.path)) {
            this.fs.delete(note.path);
            this._deleteMeta(note.path);
        }

        this.currentNote = null;
        this.setView('list');
        this.renderEmptyEditor();
        this.refreshList(this.searchTerm);
    }

    togglePin(note) {
        if (!note) return;
        note.pinned = !note.pinned;
        if (note.path) {
            this._setMeta(note.path, {
                title: note.title || this._titleFromPath(note.path),
                pinned: note.pinned,
                tags: this._extractTags(note.body),
                updated: note.updated || Date.now(),
                created: note.created || Date.now(),
            });
        }
        this.refreshList(this.searchTerm);
        this.renderEditor(note);
    }

    promptSaveAs(note) {
        if (!note || !this.fs) return;
        const suggested = note.path || `${this.docsPath}/${this._sanitizeTitle(note.title || 'Untitled')}${NOTES_EXT}`;
        const nextPath = prompt('Save As (full path):', suggested);
        if (!nextPath || nextPath === note.path) return;

        if (this.fs.exists(nextPath)) {
            const replace = confirm(`"${nextPath}" exists. Replace it?`);
            if (!replace) return;
            this.fs.delete(nextPath);
            this._deleteMeta(nextPath);
        }

        const previousPath = note.path;
        if (previousPath && this.fs.exists(previousPath)) {
            this.fs.rename(previousPath, nextPath);
            this._deleteMeta(previousPath);
        }

        note.path = nextPath;
        note.title = this._titleFromPath(nextPath);
        note.isExternal = !nextPath.startsWith(this.docsPath);

        this._saveNote(note, { renamePath: false });
        this.renderEditor(note);
    }

    async handleToolbarAction(action, note) {
        const textarea = this.activeEditor?.bodyInput;
        if (!textarea || !note) return;

        const { start, end } = this._getSelectionRange(textarea);
        const text = textarea.value;
        const selected = text.slice(start, end);

        textarea.focus();

        const replaceSelection = (replacement, placeAfter = replacement.length) => {
            textarea.value = text.slice(0, start) + replacement + text.slice(end);
            const cursor = start + placeAfter;
            textarea.selectionStart = cursor;
            textarea.selectionEnd = cursor;
            this._rememberSelection(textarea);
            note.body = textarea.value;
            this._queueSave(note, { renamePath: false });
            this._updateEditorStatus(note);
        };

        switch (action) {
            case 'list': {
                const lineStart = text.lastIndexOf('\n', start - 1) + 1;
                textarea.value = text.slice(0, lineStart) + '- ' + text.slice(lineStart);
                textarea.selectionStart = textarea.selectionEnd = start + 2;
                this._rememberSelection(textarea);
                note.body = textarea.value;
                this._queueSave(note, { renamePath: false });
                this._updateEditorStatus(note);
                break;
            }
            case 'copy': {
                const payload = selected || note.body || '';
                await this._writeClipboard(payload);
                break;
            }
            case 'cut': {
                if (!selected) return;
                const ok = await this._writeClipboard(selected);
                if (!ok) return;
                replaceSelection('', 0);
                break;
            }
            default:
                break;
        }
    }

    renderEmptyEditor() {
        this.editorContainer.innerHTML = '';
        this.editorContainer.appendChild(
            el('div', { class: 'notes-editor-empty' }, [
                el('h3', {}, 'Start a Note'),
                el('p', {}, 'Create a note, pin important ones, and use #tags to organize quickly.'),
                el('button', {
                    class: 'notes-empty-btn',
                    type: 'button',
                    onclick: () => this.createNote(),
                }, 'New Note'),
            ]),
        );
    }

    renderEditor(note) {
        this.editorContainer.innerHTML = '';
        const navActionButton = (label, action, title) => el('button', {
            class: 'n-icon-btn',
            type: 'button',
            title,
            onmousedown: (event) => event.preventDefault(),
            onclick: () => this.handleToolbarAction(action, note),
        }, label);

        const navBar = el('div', { class: 'notes-nav-bar' }, [
            el('button', {
                class: 'n-nav-btn back n-nav-btn-primary',
                type: 'button',
                onmousedown: (event) => event.preventDefault(),
                onclick: () => this.setView('list'),
            }, 'Back'),
            this._pinButton = el('button', {
                class: `n-nav-btn pin ${note.pinned ? 'is-on' : ''}`,
                type: 'button',
                onmousedown: (event) => event.preventDefault(),
                onclick: () => this.togglePin(note),
                title: note.pinned ? 'Unpin note' : 'Pin note',
            }, note.pinned ? 'Unpin' : 'Pin'),
            el('button', {
                class: 'n-nav-btn danger',
                type: 'button',
                onmousedown: (event) => event.preventDefault(),
                onclick: () => this.deleteNote(note),
                title: 'Delete note',
            }, 'Delete'),
            navActionButton('List', 'list', 'Bullet list'),
            navActionButton('Cut', 'cut', 'Cut selection'),
            navActionButton('Copy', 'copy', 'Copy selection'),
            el('button', {
                class: 'n-icon-btn',
                type: 'button',
                onmousedown: (event) => event.preventDefault(),
                onclick: () => {
                    this.flushPendingSave();
                    this._saveNote(note, { renamePath: true });
                },
                title: 'Save',
            }, 'Save'),
            el('button', {
                class: 'n-icon-btn',
                type: 'button',
                onmousedown: (event) => event.preventDefault(),
                onclick: () => this.promptSaveAs(note),
                title: 'Save As',
            }, 'Save As'),
        ]);

        const paper = el('div', { class: 'notes-paper' });

        const titleInput = el('input', {
            class: 'notes-title-input',
            value: note.title || '',
            placeholder: 'Title',
            oninput: (e) => {
                note.title = e.target.value;
                this._queueSave(note, { renamePath: false });
            },
            onblur: () => {
                this.flushPendingSave();
                this._saveNote(note, { renamePath: true });
            },
        });

        const bodyInput = el('textarea', {
            class: 'notes-body-input',
            value: note.body || '',
            placeholder: 'Start writing...',
            spellcheck: 'false',
            oninput: (e) => {
                note.body = e.target.value;
                this._queueSave(note, { renamePath: false });
                this._updateEditorStatus(note);
            },
        });

        bodyInput.addEventListener('keydown', (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                this.flushPendingSave();
                this._saveNote(note, { renamePath: true });
            }
            if (event.key === 'Escape' && window.innerWidth <= 920) {
                this.setView('list');
            }
        });
        ['select', 'keyup', 'mouseup', 'touchend', 'click', 'input'].forEach((name) => {
            bodyInput.addEventListener(name, () => this._rememberSelection(bodyInput));
        });

        const status = this._statusText = el('div', { class: 'notes-status' }, '');

        paper.append(titleInput, bodyInput);
        this.editorContainer.append(navBar, paper, status);

        this.activeEditor = {
            note,
            titleInput,
            bodyInput,
            status,
            lastSelection: { start: 0, end: 0 },
        };
        this._rememberSelection(bodyInput);

        this._updateEditorStatus(note);
    }

    flushPendingSave() {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        if (this._pendingSave) {
            const { note, options } = this._pendingSave;
            this._pendingSave = null;
            this._saveNote(note, options);
        }
    }

    _queueSave(note, options = {}) {
        if (!note) return;
        this._pendingSave = { note, options };
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            const pending = this._pendingSave;
            this._pendingSave = null;
            this._saveTimer = null;
            if (pending) this._saveNote(pending.note, pending.options);
        }, AUTOSAVE_MS);
    }

    _saveNote(note, { renamePath = true } = {}) {
        if (!this.fs || !note) return null;

        const now = Date.now();
        const cleanTitle = this._sanitizeTitle(note.title || this._titleFromPath(note.path) || 'Untitled');
        const body = typeof note.body === 'string' ? note.body : '';
        const oldPath = note.path || null;
        const oldMeta = oldPath ? this._getMeta(oldPath) : null;
        const oldFile = oldPath ? this.fs.read(oldPath) : null;
        const created = oldMeta?.created || oldFile?.meta?.created || now;

        let nextPath = oldPath;
        if (!nextPath) {
            nextPath = this._uniquePath(cleanTitle);
        } else if (renamePath && !note.isExternal) {
            nextPath = this._uniquePath(cleanTitle, NOTES_EXT, oldPath);
        }

        if (oldPath && nextPath !== oldPath && this.fs.exists(oldPath)) {
            this.fs.rename(oldPath, nextPath);
            this._deleteMeta(oldPath);
        }

        this.fs.write(nextPath, body, { created });

        note.path = nextPath;
        note.title = cleanTitle;
        note.body = body;
        note.updated = now;
        note.created = created;
        note.tags = this._extractTags(body);

        this._setMeta(nextPath, {
            title: note.title,
            updated: note.updated,
            created: note.created,
            pinned: Boolean(note.pinned),
            tags: note.tags,
        });

        if (this._pinButton) {
            this._pinButton.textContent = note.pinned ? 'Unpin' : 'Pin';
            this._pinButton.classList.toggle('is-on', note.pinned);
        }

        this._updateEditorStatus(note);
        this.refreshList(this.searchTerm);
        return note;
    }

    _renderListEmpty(hasAnyNotes) {
        return el('div', { class: 'notes-empty-state' }, [
            el('h4', {}, hasAnyNotes ? 'No matching notes' : 'No notes yet'),
            el('p', {}, hasAnyNotes ? 'Try another search keyword.' : 'Create your first note to get started.'),
            el('button', { class: 'notes-empty-btn', type: 'button', onclick: () => this.createNote() }, 'New Note'),
        ]);
    }

    _updateEditorStatus(note) {
        if (!this.activeEditor?.status || !note) return;
        const body = typeof note.body === 'string' ? note.body : '';
        const words = body.trim() ? body.trim().split(/\s+/).length : 0;
        const chars = body.length;
        this.activeEditor.status.textContent = `${words} words • ${chars} chars • ${this._formatWhen(note.updated || Date.now())}`;
    }

    _formatWhen(timestamp) {
        const value = Number(timestamp) || Date.now();
        const delta = Date.now() - value;
        if (delta < 60_000) return 'Saved just now';
        if (delta < 3_600_000) return `Saved ${Math.max(1, Math.floor(delta / 60_000))}m ago`;
        if (delta < 86_400_000) return `Saved ${Math.floor(delta / 3_600_000)}h ago`;
        return `Saved ${new Date(value).toLocaleDateString()}`;
    }

    _snippet(body = '') {
        const clean = String(body).replace(/\s+/g, ' ').trim();
        if (!clean) return 'Empty note';
        return clean.length > 86 ? `${clean.slice(0, 86)}…` : clean;
    }

    _extractTags(body = '') {
        const found = new Set();
        const matches = String(body).match(/(^|\s)#([a-zA-Z0-9_-]{2,32})/g) || [];
        matches.forEach((entry) => {
            const tag = entry.trim().replace(/^#/, '').toLowerCase();
            if (tag) found.add(tag);
        });
        return Array.from(found).slice(0, 6);
    }

    _titleFromPath(path) {
        const file = String(path || '').split('/').pop() || 'Untitled';
        return file.replace(/\.(txt|md|json)$/i, '') || 'Untitled';
    }

    _sanitizeTitle(value) {
        const raw = String(value || '').trim();
        const normalized = raw.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
        return normalized || 'Untitled';
    }

    _uniquePath(baseTitle, extension = NOTES_EXT, currentPath = null) {
        const title = this._sanitizeTitle(baseTitle);
        let candidate = `${this.docsPath}/${title}${extension}`;
        if (currentPath && candidate === currentPath) return candidate;

        let index = 2;
        while (this.fs.exists(candidate) && candidate !== currentPath) {
            candidate = `${this.docsPath}/${title} (${index})${extension}`;
            index += 1;
        }
        return candidate;
    }

    _loadMeta() {
        try {
            const data = this.kernel.storage?.load(NOTES_META_KEY);
            return data && typeof data === 'object' ? data : {};
        } catch {
            return {};
        }
    }

    _persistMeta() {
        this.kernel.storage?.save(NOTES_META_KEY, this.notesMeta);
    }

    _getMeta(path) {
        if (!path) return null;
        return this.notesMeta[path] || null;
    }

    _setMeta(path, patch = {}) {
        if (!path) return;
        const prev = this.notesMeta[path] || {};
        this.notesMeta[path] = { ...prev, ...patch };
        this._persistMeta();
    }

    _deleteMeta(path) {
        if (!path || !this.notesMeta[path]) return;
        delete this.notesMeta[path];
        this._persistMeta();
    }

    _pruneMeta(validPaths) {
        let changed = false;
        Object.keys(this.notesMeta).forEach((path) => {
            if (!path.startsWith(this.docsPath + '/')) return;
            if (!validPaths.has(path)) {
                delete this.notesMeta[path];
                changed = true;
            }
        });
        if (changed) this._persistMeta();
    }

    _rememberSelection(textarea) {
        if (!textarea || !this.activeEditor || this.activeEditor.bodyInput !== textarea) return;
        const start = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : 0;
        const end = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : start;
        this.activeEditor.lastSelection = { start, end };
    }

    _getSelectionRange(textarea) {
        let start = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : 0;
        let end = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : start;
        const fallback = this.activeEditor?.lastSelection;

        if (document.activeElement !== textarea && fallback) {
            start = fallback.start;
            end = fallback.end;
        }

        if (start > end) {
            const swapped = start;
            start = end;
            end = swapped;
        }

        return { start, end };
    }

    _legacyClipboardWrite(text) {
        let probe = null;
        try {
            probe = document.createElement('textarea');
            probe.value = text || '';
            probe.setAttribute('readonly', 'readonly');
            probe.style.position = 'fixed';
            probe.style.opacity = '0';
            probe.style.left = '-9999px';
            document.body.appendChild(probe);
            probe.select();
            return document.execCommand('copy');
        } catch {
            return false;
        } finally {
            if (probe && probe.parentNode) {
                probe.parentNode.removeChild(probe);
            }
        }
    }

    async _writeClipboard(text) {
        const payload = text || '';
        if (!payload) return true;

        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(payload);
                return true;
            } catch {
                // fall through to legacy
            }
        }

        return this._legacyClipboardWrite(payload);
    }

}
