import { el, setLiteralHtml } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';

/**
 * PagePanes — content panes for Files / Notes / Web tabs.
 *
 * The Apps and Today tabs reuse existing components (the AppGrid and the
 * WidgetBar). This module owns the three remaining tab panes, each a simple
 * list view that surfaces real data:
 *
 *   • Files — recent files from the virtual filesystem (FileSystemService),
 *             scoped to /home and one level deep so we don't dump every
 *             nested document into the home page.
 *   • Notes — files under /home/documents/ rendered as note cards (first
 *             line as preview, click opens in Notes via item:open).
 *   • Web   — quick links from yancotab_quick_links storage (favicons +
 *             titles, click opens the URL in a new tab).
 *
 * Each pane is wrapped in a `.page-pane[data-tab="..."]` block. CSS shows
 * the pane that matches `body.tab-<id>` and hides the others.
 *
 * Re-renders on `page:tab-change` so the lists are fresh when the user
 * actually navigates to that tab (cheaper than ticking on home load).
 */

const SAFE_SCHEMES = ['https:', 'http:'];

function isSafeUrl(url) {
    try { return SAFE_SCHEMES.includes(new URL(url).protocol); } catch { return false; }
}

function faviconUrl(href) {
    try {
        const u = new URL(href);
        return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
    } catch { return null; }
}

export class PagePanes {
    constructor() {
        this.root = null;
        this._tabHandler = null;
    }

    render() {
        this.root = el('div', { class: 'page-panes' });

        this.root.append(
            this._buildFilesPane(),
            this._buildNotesPane(),
            this._buildWebPane(),
        );

        this._tabHandler = (e) => {
            const tab = e?.detail?.tab;
            if (tab === 'files') this._renderFiles();
            else if (tab === 'notes') this._renderNotes();
            else if (tab === 'web')   this._renderWeb();
        };
        window.addEventListener('page:tab-change', this._tabHandler);

        // Initial render — populate all three so a saved active tab is ready
        this._renderFiles();
        this._renderNotes();
        this._renderWeb();

        return this.root;
    }

    // ── Files ────────────────────────────────────────────────────

    _buildFilesPane() {
        const pane = el('section', { class: 'page-pane', 'data-tab': 'files' }, [
            el('div', { class: 'page-pane-head' }, [
                el('h2', { class: 'page-pane-title' }, 'Files'),
                el('span', { class: 'page-pane-meta', id: 'pp-files-meta' }, ''),
            ]),
            el('div', { class: 'page-pane-grid', id: 'pp-files-grid' }),
        ]);
        return pane;
    }

    _renderFiles() {
        const grid = this.root?.querySelector('#pp-files-grid');
        const meta = this.root?.querySelector('#pp-files-meta');
        if (!grid) return;
        grid.innerHTML = '';

        const fs = kernel.getService?.('fs');
        if (!fs) {
            grid.appendChild(this._emptyState('Filesystem not available'));
            if (meta) meta.textContent = '';
            return;
        }

        const items = this._collectFiles(fs);
        if (meta) meta.textContent = items.length ? `${items.length} ${items.length === 1 ? 'file' : 'files'}` : '';

        if (items.length === 0) {
            grid.appendChild(this._emptyState('No files yet — open the Files app to add some'));
            return;
        }

        for (const item of items) {
            grid.appendChild(this._buildFileCard(item));
        }
    }

    _collectFiles(fs) {
        const seen = new Set();
        const out = [];
        // Skip these directories — trash is not "recent files", and we don't
        // want to dump caches / system folders into the home page either.
        const SKIP_DIRS = new Set(['/home/trash']);
        const visit = (dir, depth) => {
            if (depth > 1) return;
            if (SKIP_DIRS.has(dir)) return;
            let listing = [];
            try { listing = fs.list(dir) || []; } catch { return; }
            for (const item of listing) {
                if (!item || !item.path) continue;
                if (seen.has(item.path)) continue;
                if (SKIP_DIRS.has(item.path) || item.path.startsWith('/home/trash/')) continue;
                seen.add(item.path);
                if (item.type === 'file' || (item.type !== 'folder' && item.type !== 'directory')) {
                    out.push(item);
                } else if (depth < 1) {
                    visit(item.path, depth + 1);
                }
                if (out.length >= 24) return;
            }
        };
        visit('/home', 0);
        // Order newest-first if items have a timestamp
        out.sort((a, b) => (b.modified || b.created || 0) - (a.modified || a.created || 0));
        return out.slice(0, 24);
    }

    _buildFileCard(item) {
        const card = el('button', {
            type: 'button',
            class: 'page-card page-card-file',
            'data-path': item.path,
        });
        const ext = (item.name || item.path.split('/').pop() || '').split('.').pop();
        card.append(
            el('span', { class: 'page-card-icon' }, [
                el('span', { class: 'page-card-ext' }, (ext || '').slice(0, 4).toUpperCase() || 'FILE'),
            ]),
            el('span', { class: 'page-card-title' }, item.name || item.path.split('/').pop()),
            el('span', { class: 'page-card-meta' }, item.path.replace(/^\/home\//, '').replace(/\/[^/]+$/, '/')),
        );
        card.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('yancotab:open-file', {
                detail: { filePath: item.path, content: item.content, fileType: item.type },
            }));
        });
        return card;
    }

    // ── Notes ────────────────────────────────────────────────────

    _buildNotesPane() {
        return el('section', { class: 'page-pane', 'data-tab': 'notes' }, [
            el('div', { class: 'page-pane-head' }, [
                el('h2', { class: 'page-pane-title' }, 'Notes'),
                el('span', { class: 'page-pane-meta', id: 'pp-notes-meta' }, ''),
            ]),
            el('div', { class: 'page-pane-grid', id: 'pp-notes-grid' }),
        ]);
    }

    _renderNotes() {
        const grid = this.root?.querySelector('#pp-notes-grid');
        const meta = this.root?.querySelector('#pp-notes-meta');
        if (!grid) return;
        grid.innerHTML = '';

        const fs = kernel.getService?.('fs');
        const notes = [];
        if (fs?.list) {
            try {
                for (const item of fs.list('/home/documents') || []) {
                    if (item?.type === 'file' || !item?.type) notes.push(item);
                }
            } catch { /* ignore */ }
        }

        if (meta) meta.textContent = notes.length ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` : '';

        if (notes.length === 0) {
            grid.appendChild(this._emptyState('No notes yet — open the Notes app to write one'));
            return;
        }

        notes.sort((a, b) => (b.modified || b.created || 0) - (a.modified || a.created || 0));
        for (const note of notes.slice(0, 24)) {
            grid.appendChild(this._buildNoteCard(note));
        }
    }

    _buildNoteCard(note) {
        const card = el('button', {
            type: 'button',
            class: 'page-card page-card-note',
            'data-path': note.path,
        });
        const title = (note.name || note.path.split('/').pop() || 'Untitled').replace(/\.[^.]+$/, '');
        const preview = (note.content || '').split('\n').find(l => l.trim()) || 'Empty note';
        // Notepad glyph matching the file-extension badge so Notes and Files
        // cards feel like a matched pair (same icon slot, same visual weight).
        const icon = el('span', { class: 'page-card-icon' });
        setLiteralHtml(icon, `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`);
        card.append(
            icon,
            el('span', { class: 'page-card-title' }, title),
            el('span', { class: 'page-card-preview' }, preview.slice(0, 120)),
        );
        card.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('yancotab:open-file', {
                detail: { filePath: note.path, content: note.content, fileType: 'file' },
            }));
        });
        return card;
    }

    // ── Web ──────────────────────────────────────────────────────

    _buildWebPane() {
        return el('section', { class: 'page-pane', 'data-tab': 'web' }, [
            el('div', { class: 'page-pane-head' }, [
                el('h2', { class: 'page-pane-title' }, 'Web'),
                el('span', { class: 'page-pane-meta', id: 'pp-web-meta' }, ''),
            ]),
            el('div', { class: 'page-pane-grid page-pane-grid-web', id: 'pp-web-grid' }),
        ]);
    }

    _renderWeb() {
        const grid = this.root?.querySelector('#pp-web-grid');
        const meta = this.root?.querySelector('#pp-web-meta');
        if (!grid) return;
        grid.innerHTML = '';

        const links = (kernel.storage?.load('yancotab_quick_links') || []).filter(l => l && l.url && isSafeUrl(l.url));
        if (meta) meta.textContent = links.length ? `${links.length} ${links.length === 1 ? 'link' : 'links'}` : '';

        if (links.length === 0) {
            grid.appendChild(this._emptyState('No quick links yet'));
            return;
        }

        for (const link of links) {
            grid.appendChild(this._buildLinkCard(link));
        }
    }

    _buildLinkCard(link) {
        const card = el('a', {
            class: 'web-tile',
            href: link.url,
            target: '_blank',
            rel: 'noopener noreferrer',
            title: this._displayHost(link.url),
        });
        const fav = faviconUrl(link.url);
        const icon = el('span', { class: 'web-tile-favicon' });
        if (fav) {
            const img = el('img', { src: fav, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
            img.onerror = () => {
                icon.classList.add('web-tile-favicon-fallback');
                img.remove();
                icon.textContent = (link.label || link.url[0]).slice(0, 2).toUpperCase();
            };
            icon.appendChild(img);
        } else {
            icon.classList.add('web-tile-favicon-fallback');
            icon.textContent = (link.label || 'L').slice(0, 2).toUpperCase();
        }
        card.append(
            icon,
            el('span', { class: 'web-tile-label' }, link.label || link.url),
        );
        return card;
    }

    _displayHost(url) {
        try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
    }

    // ── Shared ──────────────────────────────────────────────────

    _emptyState(text) {
        return el('div', { class: 'page-pane-empty' }, text);
    }

    destroy() {
        if (this._tabHandler) {
            window.removeEventListener('page:tab-change', this._tabHandler);
        }
        if (this.root) this.root.remove();
    }
}
