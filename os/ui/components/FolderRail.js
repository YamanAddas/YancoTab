import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';

/**
 * FolderRail — a horizontal row of folder pills below the app grid.
 *
 * Mirrors the folders that already live in the AppGrid state — clicking
 * either the rail pill or the in-grid folder hex opens the same folder.
 * The rail is a quick-access affordance, not a replacement.
 *
 * Each pill is small: 18×18 mini hex preview + folder name + child count.
 * Folders with no children are skipped. A "+ New folder" placeholder sits
 * at the end of the rail and dispatches a context-menu request that
 * mobileShell can wire to the existing folder-creation flow (it currently
 * lives in MobileContextMenu).
 *
 * Subscribes to grid state via the listener API so rename / add / delete
 * propagates without a manual refresh.
 */
export class FolderRail {
    constructor(gridState) {
        this.gridState = gridState;
        this.root = null;
        this._unsubscribe = null;
    }

    render() {
        this.root = el('div', { class: 'folder-rail' });
        this._render();
        if (this.gridState?.subscribe) {
            this._unsubscribe = this.gridState.subscribe(() => this._render());
        }
        return this.root;
    }

    _render() {
        if (!this.root) return;
        this.root.innerHTML = '';

        const folders = this._getFolders();
        for (const folder of folders) {
            this.root.appendChild(this._buildPill(folder));
        }

        // "New folder" placeholder — dispatches an event the shell can act on
        this.root.appendChild(this._buildAddPill());
    }

    _getFolders() {
        if (!this.gridState?.items) return [];
        const items = Array.from(this.gridState.items.values());
        return items
            .filter(i => i.type === 'folder' && !i.hidden)
            .filter(i => Array.isArray(i.children) && i.children.length > 0);
    }

    _buildPill(folder) {
        const pill = el('div', {
            class: 'folder-pill',
            'data-folder-id': folder.id,
            tabindex: '0',
            role: 'button',
            'aria-label': `Open folder ${folder.title}`,
        });

        const mini = el('div', { class: 'folder-pill-mini' });
        for (let i = 0; i < 4; i++) mini.appendChild(el('i'));
        pill.appendChild(mini);

        const text = el('span', { class: 'folder-pill-text' }, [
            el('b', {}, folder.title || 'Folder'),
            el('span', { class: 'folder-pill-count' },
                `${folder.children.length} ${folder.children.length === 1 ? 'app' : 'apps'}`),
        ]);
        pill.appendChild(text);

        const open = () => {
            // Reuse the same path the in-grid folder hex uses
            window.dispatchEvent(new CustomEvent('item:open', {
                detail: { id: folder.id, type: 'folder' },
            }));
        };
        pill.addEventListener('click', open);
        pill.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
        });

        return pill;
    }

    _buildAddPill() {
        const pill = el('div', {
            class: 'folder-pill folder-pill-add',
            tabindex: '0',
            role: 'button',
            'aria-label': 'Create a new folder',
        });

        const mini = el('div', { class: 'folder-pill-mini folder-pill-mini-empty' });
        for (let i = 0; i < 4; i++) mini.appendChild(el('i'));
        pill.appendChild(mini);

        pill.appendChild(el('span', { class: 'folder-pill-text' }, '+ New folder'));

        const trigger = () => {
            // The shell's context menu owns folder creation. Emit a request the
            // shell can route to the existing flow without us reaching into it.
            window.dispatchEvent(new CustomEvent('yancotab:new-folder-request'));
            kernel.emit?.('toast', { message: 'Long-press an app on the grid, then "Move to new folder"', type: 'info' });
        };
        pill.addEventListener('click', trigger);
        pill.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                trigger();
            }
        });

        return pill;
    }

    destroy() {
        if (this._unsubscribe) this._unsubscribe();
        this._unsubscribe = null;
        if (this.root) this.root.remove();
    }
}
