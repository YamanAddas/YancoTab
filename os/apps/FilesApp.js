import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

const HOME_PATH = '/home';
const TRASH_PATH = '/home/trash';
const LONG_PRESS_MS = 430;
const MOVE_CANCEL_PX = 10;
const DRAG_START_PX = 12;
const SCROLL_CANCEL_PX = 14;
const FILES_ORDER_KEY = 'yancotab_files_order_v1';
const FILES_SORT_KEY = 'yancotab_files_sort';
const FILES_VIEW_KEY = 'yancotab_files_view';
const FILES_FAVS_KEY = 'yancotab_files_favs';

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'json', 'csv', 'log', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'js', 'ts', 'css', 'html', 'htm']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

const SORT_OPTIONS = [
    { key: 'name', label: 'Name A→Z' },
    { key: 'name-desc', label: 'Name Z→A' },
    { key: 'date', label: 'Newest first' },
    { key: 'date-old', label: 'Oldest first' },
    { key: 'size', label: 'Largest first' },
    { key: 'type', label: 'By type' },
];

export class FilesApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Files', id: 'files', icon: '📁' };

        this.fs = this.kernel.getService('fs');

        this.history = [HOME_PATH];
        this.historyIndex = 0;
        this.currentPath = HOME_PATH;
        this.clipboard = null;

        this.activeMenu = null;
        this.storageSummary = null;
        this.orderMap = this._loadOrderMap();

        this.sortMode = localStorage.getItem(FILES_SORT_KEY) || 'name';
        this.viewMode = localStorage.getItem(FILES_VIEW_KEY) || 'grid';
        this.searchOpen = false;
        this.searchQuery = '';
        this.favorites = this._loadFavorites();

        this.pendingItemPress = null;
        this.pendingSurfacePress = null;
        this.dragState = null;
        this.suppressClickUntil = 0;

        this._onDocPointerDown = null;
        this._onGlobalPointerMove = null;
        this._onGlobalPointerUp = null;
        this._onGlobalPointerCancel = null;
        this._onGlobalTouchMove = null;
        this._onGlobalTouchEnd = null;
        this._onGlobalTouchCancel = null;
    }

    async init(options = {}) {
        const requestedPath = this._normalizePath(options?.path || HOME_PATH);
        this.currentPath = this._isDirectory(requestedPath) ? requestedPath : HOME_PATH;
        this.history = [this.currentPath];
        this.historyIndex = 0;

        this.root = el('div', { class: 'app-window app-files-v5' });

        this.uploadInput = el('input', {
            type: 'file',
            hidden: true,
            onchange: (event) => this.handleUploadChange(event),
        });

        // ── Toolbar Row 1: Nav + Breadcrumb/PathInput + Search ──
        this.navBack = this._makeNavBtn('◀', () => this.goBack(), 'Back');
        this.navFwd = this._makeNavBtn('▶', () => this.goForward(), 'Forward');
        this.navUp = this._makeNavBtn('⬆', () => this.goUp(), 'Up');

        this.breadcrumb = el('div', { class: 'yf-breadcrumb' });
        this.breadcrumb.addEventListener('click', (e) => {
            if (e.target === this.breadcrumb) this.enterPathEditMode();
        });

        this.pathInput = el('input', {
            class: 'yf-path-input',
            type: 'text',
            spellcheck: 'false',
            autocomplete: 'off',
            value: this.currentPath,
            onkeydown: (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.navigateToTypedPath(); this.exitPathEditMode(); }
                if (e.key === 'Escape') { e.preventDefault(); this.exitPathEditMode(); }
            },
            onblur: () => setTimeout(() => this.exitPathEditMode(), 80),
        });
        this.pathInput.style.display = 'none';

        this.pathArea = el('div', { class: 'yf-path-area' }, [this.breadcrumb, this.pathInput]);

        this.searchInput = el('input', {
            class: 'yf-search-input',
            type: 'text',
            placeholder: 'Search files…',
            oninput: () => this.onSearchInput(),
            onkeydown: (e) => { if (e.key === 'Escape') this.toggleSearch(); },
        });
        const searchCloseBtn = this._makeNavBtn('✕', () => this.toggleSearch(), 'Close search');
        this.searchWrap = el('div', { class: 'yf-search-wrap' }, [this.searchInput, searchCloseBtn]);
        this.searchBtn = this._makeNavBtn('🔍', () => this.toggleSearch(), 'Search');

        const row1 = el('div', { class: 'yf-toolbar-row' }, [
            el('div', { class: 'yf-nav-group' }, [this.navBack, this.navFwd, this.navUp]),
            this.pathArea,
            this.searchWrap,
            this.searchBtn,
        ]);

        // ── Toolbar Row 2: New + Sort + View + Paste ──
        this.newBtn = el('button', {
            class: 'yf-btn',
            type: 'button',
            onclick: (e) => this.showNewMenu(e),
        }, '+ New');

        this.sortBtn = el('button', {
            class: 'yf-btn',
            type: 'button',
            onclick: (e) => this.showSortMenu(e),
        }, `Sort: ${this._sortLabel()}`);

        this.viewGridBtn = el('button', {
            class: `yf-view-btn ${this.viewMode === 'grid' ? 'is-active' : ''}`,
            type: 'button',
            'aria-label': 'Grid view',
            onclick: () => this.setView('grid'),
        }, '⊞');

        this.viewListBtn = el('button', {
            class: `yf-view-btn ${this.viewMode === 'list' ? 'is-active' : ''}`,
            type: 'button',
            'aria-label': 'List view',
            onclick: () => this.setView('list'),
        }, '☰');

        this.viewGroup = el('div', { class: 'yf-view-group' }, [this.viewGridBtn, this.viewListBtn]);

        this.pasteButton = el('button', {
            class: 'yf-btn',
            type: 'button',
            onclick: () => this.pasteClipboard(),
            title: 'Paste',
        }, 'Paste');

        const row2 = el('div', { class: 'yf-toolbar-row' }, [
            this.newBtn,
            this.sortBtn,
            this.viewGroup,
            this.pasteButton,
        ]);

        this.toolbar = el('div', { class: 'yf-toolbar' }, [row1, row2]);

        // ── Grid ──
        this.grid = el('div', { class: `yf-grid${this.viewMode === 'list' ? ' yf-grid--list' : ''}` });
        this.grid.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            this.showContextMenu(event.clientX, event.clientY, null);
        });
        this.grid.addEventListener('pointerdown', (event) => this.onGridPointerDown(event));

        // ── Status Bar ──
        this.status = el('div', {
            class: 'yf-status',
            onclick: () => this.showStorageInfo(),
        }, '');

        // ── Sidebar ──
        this.sidebar = el('aside', { class: 'yf-sidebar' });

        // ── Assembly ──
        this.main = el('main', { class: 'yf-main' }, [this.toolbar, this.grid, this.status]);
        this.body = el('div', { class: 'yf-body' }, [this.sidebar, this.main]);
        this.root.append(this.body, this.uploadInput);

        // ── Global listeners ──
        this._onDocPointerDown = (event) => {
            if (!this.activeMenu) return;
            if (this.activeMenu.contains(event.target)) return;
            this.closeContextMenu();
        };
        document.addEventListener('pointerdown', this._onDocPointerDown, true);

        this._onGlobalPointerMove = (event) => this.onGlobalPointerMove(event);
        this._onGlobalPointerUp = (event) => this.onGlobalPointerUp(event);
        this._onGlobalPointerCancel = (event) => this.onGlobalPointerCancel(event);
        window.addEventListener('pointermove', this._onGlobalPointerMove, true);
        window.addEventListener('pointerup', this._onGlobalPointerUp, true);
        window.addEventListener('pointercancel', this._onGlobalPointerCancel, true);

        this._onGlobalTouchMove = (event) => this.onGlobalTouchMove(event);
        this._onGlobalTouchEnd = (event) => this.onGlobalTouchEnd(event);
        this._onGlobalTouchCancel = (event) => this.onGlobalTouchCancel(event);
        window.addEventListener('touchmove', this._onGlobalTouchMove, { capture: true, passive: false });
        window.addEventListener('touchend', this._onGlobalTouchEnd, true);
        window.addEventListener('touchcancel', this._onGlobalTouchCancel, true);

        this.refresh();
        this.updateStorageBadge();
    }

    destroy() {
        this.clearPendingItemPress();
        this.clearPendingSurfacePress();
        this.cancelDrag();

        if (this._onDocPointerDown) {
            document.removeEventListener('pointerdown', this._onDocPointerDown, true);
            this._onDocPointerDown = null;
        }
        if (this._onGlobalPointerMove) {
            window.removeEventListener('pointermove', this._onGlobalPointerMove, true);
            this._onGlobalPointerMove = null;
        }
        if (this._onGlobalPointerUp) {
            window.removeEventListener('pointerup', this._onGlobalPointerUp, true);
            this._onGlobalPointerUp = null;
        }
        if (this._onGlobalPointerCancel) {
            window.removeEventListener('pointercancel', this._onGlobalPointerCancel, true);
            this._onGlobalPointerCancel = null;
        }
        if (this._onGlobalTouchMove) {
            window.removeEventListener('touchmove', this._onGlobalTouchMove, true);
            this._onGlobalTouchMove = null;
        }
        if (this._onGlobalTouchEnd) {
            window.removeEventListener('touchend', this._onGlobalTouchEnd, true);
            this._onGlobalTouchEnd = null;
        }
        if (this._onGlobalTouchCancel) {
            window.removeEventListener('touchcancel', this._onGlobalTouchCancel, true);
            this._onGlobalTouchCancel = null;
        }

        this.closeContextMenu();
        super.destroy();
    }

    // ── Helpers ──────────────────────────────────────────────────

    _makeNavBtn(label, onClick, title = '') {
        return el('button', {
            class: 'yf-nav-btn',
            type: 'button',
            title,
            onclick: (e) => { e.stopPropagation(); onClick(); },
        }, label);
    }

    _makeButton(label, onClick, title = '', isDisabled = null) {
        const button = el('button', {
            class: 'yf-btn',
            type: 'button',
            title,
            onclick: (event) => {
                event.stopPropagation();
                if (button.disabled) return;
                onClick();
            },
        }, label);

        if (typeof isDisabled === 'function') {
            button.dataset.dynamicDisabled = '1';
            button._isDisabled = isDisabled;
        }

        return button;
    }

    // ── Refresh & Render ─────────────────────────────────────────

    refresh() {
        if (!this._isDirectory(this.currentPath)) {
            this.currentPath = HOME_PATH;
            this.history = [HOME_PATH];
            this.historyIndex = 0;
        }

        this.renderSidebar();
        this.renderBreadcrumb();
        this.renderGrid();
        this.renderToolbarState();
        this.closeContextMenu();
    }

    renderToolbarState() {
        this.navBack.disabled = this.historyIndex === 0;
        this.navFwd.disabled = this.historyIndex >= this.history.length - 1;
        this.navUp.disabled = this.currentPath === HOME_PATH;
        this.pasteButton.disabled = !this.clipboard;
        this.pasteButton.classList.toggle('is-active', Boolean(this.clipboard));
        this.sortBtn.textContent = `Sort: ${this._sortLabel()}`;
    }

    renderBreadcrumb() {
        this.breadcrumb.innerHTML = '';
        const parts = this.currentPath.split('/').filter(Boolean);

        parts.forEach((part, i) => {
            if (i > 0) {
                this.breadcrumb.appendChild(el('span', { class: 'yf-breadcrumb-sep' }, '›'));
            }

            const path = '/' + parts.slice(0, i + 1).join('/');
            const isLast = i === parts.length - 1;
            const label = i === 0 && part === 'home' ? 'Home' : part;

            const seg = el('button', {
                class: 'yf-breadcrumb-seg',
                type: 'button',
                onclick: isLast ? null : (e) => { e.stopPropagation(); this.navigateTo(path); },
            }, label);
            if (isLast) seg.disabled = true;

            this.breadcrumb.appendChild(seg);
        });

        requestAnimationFrame(() => {
            this.breadcrumb.scrollLeft = this.breadcrumb.scrollWidth;
        });
    }

    renderSidebar() {
        this.sidebar.innerHTML = '';

        // Quick Access
        this.sidebar.appendChild(el('div', { class: 'yf-sidebar-label' }, 'Quick Access'));

        const quickItems = [
            { label: 'Home', path: HOME_PATH, icon: '🏠' },
            { label: 'Documents', path: '/home/documents', icon: '📄' },
            { label: 'Downloads', path: '/home/downloads', icon: '⬇️' },
            { label: 'Trash', path: TRASH_PATH, icon: '🗑️' },
        ];

        quickItems.forEach((item) => {
            const button = el('button', {
                class: `yf-sidebar-item ${this.currentPath === item.path ? 'is-active' : ''}`,
                type: 'button',
                'data-path': item.path,
                onclick: () => this.navigateTo(item.path),
            }, [
                el('span', { class: 'yf-side-icon' }, item.icon),
                el('span', { class: 'yf-side-label' }, item.label),
            ]);
            this.sidebar.appendChild(button);
        });

        // Favorites
        const validFavs = [...this.favorites].filter((p) => this._isDirectory(p));
        if (validFavs.length > 0) {
            this.sidebar.appendChild(el('div', { class: 'yf-sidebar-label' }, 'Favorites'));

            validFavs.forEach((path) => {
                const label = this._basename(path);
                const button = el('button', {
                    class: `yf-sidebar-item ${this.currentPath === path ? 'is-active' : ''}`,
                    type: 'button',
                    'data-path': path,
                    onclick: () => this.navigateTo(path),
                }, [
                    el('span', { class: 'yf-side-icon' }, '⭐'),
                    el('span', { class: 'yf-side-label' }, label),
                ]);
                this.sidebar.appendChild(button);
            });
        }
    }

    renderGrid() {
        this.grid.innerHTML = '';
        this.grid.classList.toggle('yf-grid--list', this.viewMode === 'list');

        let items = this._sortedItems(this.fs.list(this.currentPath), this.currentPath);

        if (this.searchQuery) {
            const q = this.searchQuery;
            items = items.filter((i) => this._basename(i.path).toLowerCase().includes(q));
        }

        if (items.length === 0) {
            const children = [
                el('p', {}, this.searchQuery ? 'No matching files.' : 'This folder is empty.'),
                el('p', { class: 'yf-empty-hint' }, this.searchQuery ? 'Try a different search.' : 'Long press for actions.'),
            ];
            if (!this.searchQuery) {
                children.push(el('button', {
                    class: 'yf-btn',
                    type: 'button',
                    onclick: () => this.promptNewFolder(),
                }, 'Create Folder'));
            }
            this.grid.appendChild(el('div', { class: 'yf-empty' }, children));
            this._updateStatus(0);
            return;
        }

        items.forEach((item, index) => this.grid.appendChild(this.buildItemTile(item, index)));
        this._updateStatus(items.length);
    }

    buildItemTile(item, tileIndex = 0) {
        const isDirectory = item.type === 'directory';
        const name = this._basename(item.path);
        const icon = this._iconForItem(item);
        const fileType = this._typeForItem(item);

        const subtitle = isDirectory
            ? `Folder${item.path === TRASH_PATH ? ' · Trash' : ''}`
            : `${this._extension(name)?.toUpperCase() || 'FILE'}${item.meta?.size ? ` · ${this._formatBytes(item.meta.size)}` : ''}`;

        const modifiedStr = item.meta?.modified ? this._formatDate(item.meta.modified) : (item.meta?.created ? this._formatDate(item.meta.created) : '');
        const sizeStr = item.meta?.size ? this._formatBytes(item.meta.size) : '';

        const tile = el('div', {
            class: `yf-card ${isDirectory ? 'is-directory' : 'is-file'} ${this.clipboard?.action === 'cut' && this.clipboard.path === item.path ? 'is-cut-source' : ''}`,
            'data-path': item.path,
            style: { '--yf-index': String(tileIndex) },
        });

        const mainButton = el('button', {
            class: 'yf-card-main',
            type: 'button',
            oncontextmenu: (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.showContextMenu(event.clientX, event.clientY, item);
            },
        }, [
            el('div', { class: 'yf-card-icon', 'data-type': fileType }, icon),
            el('div', { class: 'yf-card-name', title: name }, name),
            el('div', { class: 'yf-card-sub', title: subtitle }, subtitle),
            el('div', { class: 'yf-card-meta' }, [
                el('span', { class: 'yf-card-date' }, modifiedStr),
                el('span', { class: 'yf-card-size' }, sizeStr),
            ]),
        ]);

        this.bindItemInteractions(mainButton, tile, item);
        tile.appendChild(mainButton);
        return tile;
    }

    _updateStatus(count) {
        if (!this.status) return;
        const parts = [`${count} item${count === 1 ? '' : 's'}`, this.currentPath];
        if (this.storageSummary) parts.push(this._formatBytes(this.storageSummary.fsBytes));
        this.status.textContent = parts.join('  ·  ');
    }

    // ── Search ──────────────────────────────────────────────────

    toggleSearch() {
        this.searchOpen = !this.searchOpen;
        this.root.classList.toggle('is-searching', this.searchOpen);
        if (this.searchOpen) {
            this.searchInput.value = '';
            this.searchQuery = '';
            requestAnimationFrame(() => this.searchInput.focus());
        } else {
            this.searchQuery = '';
            this.renderGrid();
        }
    }

    onSearchInput() {
        this.searchQuery = this.searchInput.value.trim().toLowerCase();
        this.renderGrid();
    }

    // ── View Toggle ─────────────────────────────────────────────

    setView(mode) {
        this.viewMode = mode;
        localStorage.setItem(FILES_VIEW_KEY, mode);
        this.viewGridBtn.classList.toggle('is-active', mode === 'grid');
        this.viewListBtn.classList.toggle('is-active', mode === 'list');
        this.renderGrid();
    }

    // ── Path Edit Mode ──────────────────────────────────────────

    enterPathEditMode() {
        this.pathInput.value = this.currentPath;
        this.breadcrumb.style.display = 'none';
        this.pathInput.style.display = '';
        requestAnimationFrame(() => {
            this.pathInput.focus();
            this.pathInput.select();
        });
    }

    exitPathEditMode() {
        this.pathInput.style.display = 'none';
        this.breadcrumb.style.display = '';
    }

    // ── New / Sort Dropdown Menus ────────────────────────────────

    showNewMenu(e) {
        e.stopPropagation();
        const rect = this.newBtn.getBoundingClientRect();
        this.showDropdownMenu(rect.left, rect.bottom + 4, [
            { label: '📁  New Folder', action: () => this.promptNewFolder() },
            { label: '📝  New Note', action: () => this.promptNewNote() },
            { divider: true },
            { label: '📤  Upload File', action: () => this.uploadInput.click() },
        ]);
    }

    showSortMenu(e) {
        e.stopPropagation();
        const rect = this.sortBtn.getBoundingClientRect();
        this.showDropdownMenu(rect.left, rect.bottom + 4, SORT_OPTIONS.map((opt) => ({
            label: opt.label,
            checked: this.sortMode === opt.key,
            action: () => {
                this.sortMode = opt.key;
                localStorage.setItem(FILES_SORT_KEY, opt.key);
                this.sortBtn.textContent = `Sort: ${this._sortLabel()}`;
                this.renderGrid();
            },
        })));
    }

    showDropdownMenu(x, y, entries) {
        this.closeContextMenu();

        const menu = el('div', { class: 'yf-menu' });
        entries.forEach((entry) => {
            if (entry.divider) {
                menu.appendChild(el('div', { class: 'yf-menu-sep' }));
                return;
            }
            menu.appendChild(el('button', {
                class: `yf-menu-item ${entry.checked ? 'is-checked' : ''}`,
                type: 'button',
                onclick: (ev) => {
                    ev.stopPropagation();
                    this.closeContextMenu();
                    entry.action();
                },
            }, entry.label));
        });

        this.root.appendChild(menu);

        requestAnimationFrame(() => {
            const w = menu.offsetWidth || 200;
            const h = menu.offsetHeight || 200;
            const safeX = Math.max(8, Math.min(x, window.innerWidth - w - 8));
            const safeY = Math.max(8, Math.min(y, window.innerHeight - h - 8));
            menu.style.left = `${safeX}px`;
            menu.style.top = `${safeY}px`;
            menu.classList.add('is-visible');
        });

        this.activeMenu = menu;
    }

    // ── Favorites ───────────────────────────────────────────────

    addFavorite(path) {
        this.favorites.add(this._normalizePath(path));
        this._saveFavorites();
        this.renderSidebar();
    }

    removeFavorite(path) {
        this.favorites.delete(this._normalizePath(path));
        this._saveFavorites();
        this.renderSidebar();
    }

    _loadFavorites() {
        try {
            const raw = localStorage.getItem(FILES_FAVS_KEY);
            return raw ? new Set(JSON.parse(raw)) : new Set();
        } catch { return new Set(); }
    }

    _saveFavorites() {
        try {
            localStorage.setItem(FILES_FAVS_KEY, JSON.stringify([...this.favorites]));
        } catch { /* ignore */ }
    }

    // ── Item Interactions ────────────────────────────────────────

    bindItemInteractions(button, row, item) {
        button.addEventListener('pointerdown', (event) => this.onItemPointerDown(event, item, row, button));
        button.addEventListener('click', (event) => {
            if (Date.now() < this.suppressClickUntil) {
                event.preventDefault();
                event.stopPropagation();
            }
        });
    }

    onItemPointerDown(event, item, row, button) {
        if (this.dragState) return;
        if (event.button === 2) {
            this.showContextMenu(event.clientX, event.clientY, item);
            return;
        }
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        this.clearPendingSurfacePress();
        this.clearPendingItemPress();
        this.closeContextMenu();

        const press = {
            pointerId: event.pointerId,
            pointerType: event.pointerType || 'touch',
            startX: event.clientX,
            startY: event.clientY,
            startAt: Date.now(),
            item,
            row,
            button,
            moved: false,
            menuArmed: false,
            timer: setTimeout(() => {
                if (!this.pendingItemPress || this.pendingItemPress.pointerId !== press.pointerId) return;
                this.pendingItemPress.menuArmed = true;
                press.row?.classList.add('is-context-armed');
            }, LONG_PRESS_MS),
        };

        this.pendingItemPress = press;
        row.classList.add('is-pressed');
        if (button?.setPointerCapture) {
            try { button.setPointerCapture(event.pointerId); } catch { }
        }
    }

    onGridPointerDown(event) {
        if (this.dragState) return;
        if (event.button === 2) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (event.target.closest('.yf-card') || event.target.closest('.yf-btn') || event.target.closest('.yf-path-input') || event.target.closest('.yf-nav-btn') || event.target.closest('.yf-search-input')) return;

        this.clearPendingItemPress();
        this.clearPendingSurfacePress();

        const press = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            consumed: false,
            timer: setTimeout(() => {
                if (!this.pendingSurfacePress || this.pendingSurfacePress.pointerId !== press.pointerId) return;
                this.pendingSurfacePress.consumed = true;
                this.suppressClickUntil = Date.now() + 550;
                this.showContextMenu(press.startX, press.startY, null);
            }, LONG_PRESS_MS),
        };

        this.pendingSurfacePress = press;
        if (this.grid?.setPointerCapture) {
            try { this.grid.setPointerCapture(event.pointerId); } catch { }
        }
    }

    onGlobalPointerMove(event) {
        if (this.dragState && event.pointerId === this.dragState.pointerId) {
            event.preventDefault();
            this.updateDrag(event.clientX, event.clientY);
            return;
        }

        if (this.pendingItemPress && event.pointerId === this.pendingItemPress.pointerId) {
            const dx = event.clientX - this.pendingItemPress.startX;
            const dy = event.clientY - this.pendingItemPress.startY;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            const distance = Math.hypot(dx, dy);
            const elapsed = Date.now() - this.pendingItemPress.startAt;

            const likelyScroll = absDy > absDx * 1.2 && absDy > SCROLL_CANCEL_PX && elapsed < 250;
            if (likelyScroll) {
                this.clearPendingItemPress();
                return;
            }

            if (
                this.pendingItemPress.pointerType !== 'mouse'
                && !this.pendingItemPress.menuArmed
                && distance > DRAG_START_PX
                && elapsed > 120
                && absDx >= absDy * 0.75
            ) {
                const press = this.clearPendingItemPress();
                if (!press) return;
                this.startDrag(press.item, press.row, event.clientX, event.clientY, press.pointerId, press.pointerType);
                return;
            }

            if (this.pendingItemPress.menuArmed && distance > 4) {
                const press = this.clearPendingItemPress();
                if (!press) return;
                this.startDrag(press.item, press.row, event.clientX, event.clientY, press.pointerId, press.pointerType);
                return;
            }

            if (this.pendingItemPress.pointerType === 'mouse' && distance > DRAG_START_PX) {
                const press = this.clearPendingItemPress();
                if (!press) return;
                this.startDrag(press.item, press.row, event.clientX, event.clientY, press.pointerId, press.pointerType);
                return;
            }

            if (distance > MOVE_CANCEL_PX) {
                this.pendingItemPress.moved = true;
                if (this.pendingItemPress.timer) {
                    clearTimeout(this.pendingItemPress.timer);
                    this.pendingItemPress.timer = null;
                }
            }
        }

        if (this.pendingSurfacePress && event.pointerId === this.pendingSurfacePress.pointerId) {
            const dx = event.clientX - this.pendingSurfacePress.startX;
            const dy = event.clientY - this.pendingSurfacePress.startY;
            if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
                this.pendingSurfacePress.moved = true;
                if (this.pendingSurfacePress.timer) {
                    clearTimeout(this.pendingSurfacePress.timer);
                    this.pendingSurfacePress.timer = null;
                }
            }
        }
    }

    onGlobalPointerUp(event) {
        if (this.dragState && event.pointerId === this.dragState.pointerId) {
            this.finishDrag();
            return;
        }

        if (this.pendingItemPress && event.pointerId === this.pendingItemPress.pointerId) {
            const press = this.clearPendingItemPress();
            if (!press) return;

            if (press.menuArmed && !press.moved) {
                this.suppressClickUntil = Date.now() + 550;
                this.showContextMenu(press.startX, press.startY, press.item);
                return;
            }

            if (press.moved) {
                this.suppressClickUntil = Date.now() + 420;
                return;
            }

            this.suppressClickUntil = Date.now() + 220;
            this.openItem(press.item);
            return;
        }

        if (this.pendingSurfacePress && event.pointerId === this.pendingSurfacePress.pointerId) {
            const press = this.clearPendingSurfacePress();
            if (!press) return;
            if (press.consumed || press.moved) {
                this.suppressClickUntil = Date.now() + 420;
            }
        }
    }

    onGlobalPointerCancel(event) {
        if (this.dragState && event.pointerId === this.dragState.pointerId) {
            this.cancelDrag();
            return;
        }

        if (this.pendingItemPress && event.pointerId === this.pendingItemPress.pointerId) {
            this.clearPendingItemPress();
        }
        if (this.pendingSurfacePress && event.pointerId === this.pendingSurfacePress.pointerId) {
            this.clearPendingSurfacePress();
        }
    }

    onGlobalTouchMove(event) {
        if (!this.dragState || this.dragState.pointerType === 'mouse') return;
        const touch = event.touches?.[0];
        if (!touch) return;

        event.preventDefault();
        this.updateDrag(touch.clientX, touch.clientY);
    }

    onGlobalTouchEnd(event) {
        if (!this.dragState || this.dragState.pointerType === 'mouse') return;
        if (event.touches?.length) return;
        this.finishDrag();
    }

    onGlobalTouchCancel() {
        if (!this.dragState || this.dragState.pointerType === 'mouse') return;
        this.cancelDrag();
    }

    clearPendingItemPress() {
        if (!this.pendingItemPress) return null;
        if (this.pendingItemPress.timer) clearTimeout(this.pendingItemPress.timer);

        const snapshot = this.pendingItemPress;
        this.pendingItemPress = null;
        snapshot.row?.classList.remove('is-pressed', 'is-context-armed');

        if (snapshot.button?.releasePointerCapture) {
            try { snapshot.button.releasePointerCapture(snapshot.pointerId); } catch { }
        }

        return snapshot;
    }

    clearPendingSurfacePress() {
        if (!this.pendingSurfacePress) return null;
        if (this.pendingSurfacePress.timer) clearTimeout(this.pendingSurfacePress.timer);

        const snapshot = this.pendingSurfacePress;
        this.pendingSurfacePress = null;

        if (this.grid?.releasePointerCapture) {
            try { this.grid.releasePointerCapture(snapshot.pointerId); } catch { }
        }

        return snapshot;
    }

    // ── Drag & Drop ─────────────────────────────────────────────

    startDrag(item, row, x, y, pointerId, pointerType = 'touch') {
        const source = this.fs.read(item.path);
        if (!source) return;

        const rowRect = row.getBoundingClientRect();
        const ghost = row.cloneNode(true);
        ghost.classList.add('yf-drag-ghost');
        ghost.classList.remove('is-dragging-source', 'is-drop-target', 'is-drop-before', 'is-drop-after', 'is-drop-into', 'is-drop-append', 'is-pressed', 'is-context-armed');
        ghost.removeAttribute('data-path');
        ghost.style.width = `${Math.round(rowRect.width)}px`;
        ghost.style.height = `${Math.round(rowRect.height)}px`;

        const ghostButton = ghost.querySelector('.yf-card-main');
        if (ghostButton) {
            ghostButton.disabled = true;
            ghostButton.tabIndex = -1;
            ghostButton.removeAttribute('title');
        }

        this.root.appendChild(ghost);

        const localGrabX = Math.max(10, Math.min(x - rowRect.left, rowRect.width - 10));
        const localGrabY = Math.max(10, Math.min(y - rowRect.top, rowRect.height - 10));
        const touchYOffset = pointerType === 'mouse' ? 8 : 26;
        const touchXOffset = pointerType === 'mouse' ? 8 : 6;

        this.dragState = {
            pointerId,
            pointerType: pointerType || 'touch',
            sourcePath: source.path,
            sourceType: source.type,
            sourceRow: row,
            targetPath: null,
            targetRow: null,
            dropMode: null,
            ghost,
            grabOffsetX: localGrabX - touchXOffset,
            grabOffsetY: localGrabY - touchYOffset,
        };

        row.classList.add('is-dragging-source');
        this.root.classList.add('is-dragging');
        this.suppressClickUntil = Date.now() + 900;
        this.updateDrag(x, y);
    }

    updateDrag(x, y) {
        if (!this.dragState) return;

        const ghostX = Math.round(x - this.dragState.grabOffsetX);
        const ghostY = Math.round(y - this.dragState.grabOffsetY);
        this.dragState.ghost.style.transform = `translate3d(${ghostX}px, ${ghostY}px, 0)`;

        const hit = document.elementFromPoint(x, y);
        const sourcePath = this.dragState.sourcePath;
        const sourceParent = this._dirname(sourcePath);

        let targetPath = null;
        let targetRow = null;
        let dropMode = null;

        const row = hit?.closest('.yf-card[data-path]');
        if (row) {
            const path = this._normalizePath(row.getAttribute('data-path') || '');
            if (path && path !== sourcePath) {
                const node = this.fs.read(path);
                if (node?.type === 'directory') {
                    if (!(this.dragState.sourceType === 'directory' && this._isSubPath(path, sourcePath))) {
                        targetPath = path;
                        targetRow = row;
                        dropMode = 'into';
                    }
                } else if (this._dirname(path) === sourceParent) {
                    const rect = row.getBoundingClientRect();
                    targetPath = path;
                    targetRow = row;
                    dropMode = y < rect.top + rect.height / 2 ? 'before' : 'after';
                }
            }
        } else {
            const sidebarItem = hit?.closest('.yf-sidebar-item[data-path]');
            if (sidebarItem) {
                const path = this._normalizePath(sidebarItem.getAttribute('data-path') || '');
                if (this._isDirectory(path) && path !== sourcePath) {
                    if (!(this.dragState.sourceType === 'directory' && this._isSubPath(path, sourcePath))) {
                        targetPath = path;
                        targetRow = sidebarItem;
                        dropMode = 'into';
                    }
                }
            } else if (hit?.closest('.yf-grid')) {
                targetPath = this.currentPath;
                targetRow = this.grid;
                dropMode = this.currentPath === sourceParent ? 'append' : 'into';
            }
        }

        this._autoScrollGrid(y);
        this.setDropTarget(targetPath, targetRow, dropMode);
    }

    _autoScrollGrid(pointerY) {
        if (!this.grid || !this.dragState) return;
        const rect = this.grid.getBoundingClientRect();
        if (rect.height <= 0) return;

        const EDGE_ZONE = 56;
        const MAX_STEP = 20;

        if (pointerY < rect.top + EDGE_ZONE) {
            const intensity = (rect.top + EDGE_ZONE - pointerY) / EDGE_ZONE;
            this.grid.scrollTop -= Math.ceil(MAX_STEP * Math.min(1, intensity));
        } else if (pointerY > rect.bottom - EDGE_ZONE) {
            const intensity = (pointerY - (rect.bottom - EDGE_ZONE)) / EDGE_ZONE;
            this.grid.scrollTop += Math.ceil(MAX_STEP * Math.min(1, intensity));
        }
    }

    setDropTarget(targetPath, targetRow, dropMode) {
        if (!this.dragState) return;

        if (this.dragState.targetRow && this.dragState.targetRow !== targetRow) {
            this.clearDropClasses(this.dragState.targetRow);
        }

        this.dragState.targetPath = targetPath || null;
        this.dragState.targetRow = targetRow || null;
        this.dragState.dropMode = dropMode || null;

        if (this.dragState.targetRow) {
            this.dragState.targetRow.classList.add('is-drop-target');
            if (dropMode === 'before') this.dragState.targetRow.classList.add('is-drop-before');
            if (dropMode === 'after') this.dragState.targetRow.classList.add('is-drop-after');
            if (dropMode === 'into') this.dragState.targetRow.classList.add('is-drop-into');
            if (dropMode === 'append') this.dragState.targetRow.classList.add('is-drop-append');
        }
    }

    finishDrag() {
        if (!this.dragState) return;

        const { sourcePath, sourceType, targetPath, dropMode } = this.dragState;
        this.cancelDrag();

        if (!targetPath || !dropMode) {
            this.refresh();
            return;
        }

        if (dropMode === 'before' || dropMode === 'after' || dropMode === 'append') {
            const sourceParent = this._dirname(sourcePath);
            if (sourceParent !== this.currentPath) {
                this.refresh();
                return;
            }
            this.reorderWithinCurrentFolder(sourcePath, targetPath, dropMode);
            this.refresh();
            return;
        }

        if (dropMode === 'into') {
            const sourceParent = this._dirname(sourcePath);
            if (targetPath === sourceParent) {
                this.refresh();
                return;
            }

            const candidate = this._joinPath(targetPath, this._basename(sourcePath));
            const destination = this._resolveCollisionPath(candidate, sourceType === 'directory');
            if (destination === sourcePath) {
                this.refresh();
                return;
            }
            if (sourceType === 'directory' && this._isSubPath(destination, sourcePath)) {
                this.refresh();
                return;
            }

            try {
                this.fs.rename(sourcePath, destination);
                this._syncPathReferences(sourcePath, destination);
                this._updateOrderAfterMove(sourcePath, destination);
                if (this.clipboard?.path === sourcePath) this.clipboard.path = destination;
            } catch (error) {
                alert(`Move failed: ${error?.message || error}`);
            }

            this.refresh();
        }
    }

    cancelDrag() {
        if (!this.dragState) return;

        if (this.dragState.sourceRow) this.dragState.sourceRow.classList.remove('is-dragging-source');
        if (this.dragState.targetRow) this.clearDropClasses(this.dragState.targetRow);
        if (this.dragState.ghost?.parentNode) this.dragState.ghost.parentNode.removeChild(this.dragState.ghost);
        this.root.classList.remove('is-dragging');
        this.dragState = null;
    }

    clearDropClasses(node) {
        if (!node?.classList) return;
        node.classList.remove('is-drop-target', 'is-drop-before', 'is-drop-after', 'is-drop-into', 'is-drop-append');
    }

    reorderWithinCurrentFolder(sourcePath, targetPath, mode) {
        const dir = this.currentPath;
        const orderedPaths = this._getOrderedPathList(this.fs.list(dir), dir);
        const fromIndex = orderedPaths.indexOf(sourcePath);
        if (fromIndex < 0) return;

        orderedPaths.splice(fromIndex, 1);
        if (mode === 'append') {
            orderedPaths.push(sourcePath);
        } else {
            const targetIndex = orderedPaths.indexOf(targetPath);
            if (targetIndex < 0) {
                orderedPaths.push(sourcePath);
            } else if (mode === 'before') {
                orderedPaths.splice(targetIndex, 0, sourcePath);
            } else {
                orderedPaths.splice(targetIndex + 1, 0, sourcePath);
            }
        }

        this.orderMap[this._normalizePath(dir)] = orderedPaths;
        this._saveOrderMap();
    }

    // ── Navigation ──────────────────────────────────────────────

    navigateTo(path) {
        const target = this._normalizePath(path);
        if (!this._isDirectory(target)) {
            alert(`Folder not found: ${target}`);
            return;
        }
        if (target === this.currentPath) return;

        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        this.history.push(target);
        this.historyIndex += 1;
        this.currentPath = target;
        this.refresh();
    }

    navigateToTypedPath() {
        const raw = this.pathInput.value.trim();
        if (!raw) {
            this.pathInput.value = this.currentPath;
            return;
        }
        this.navigateTo(raw);
    }

    goBack() {
        if (this.historyIndex <= 0) return;
        this.historyIndex -= 1;
        this.currentPath = this.history[this.historyIndex];
        this.refresh();
    }

    goForward() {
        if (this.historyIndex >= this.history.length - 1) return;
        this.historyIndex += 1;
        this.currentPath = this.history[this.historyIndex];
        this.refresh();
    }

    goUp() {
        if (this.currentPath === HOME_PATH) return;
        this.navigateTo(this._dirname(this.currentPath));
    }

    // ── File Operations ─────────────────────────────────────────

    openItem(item) {
        if (!item) return;
        if (item.type === 'directory') {
            this.navigateTo(item.path);
            return;
        }
        this.openFile(item.path);
    }

    async openFile(path) {
        const file = this.fs.read(path);
        if (!file || file.type !== 'file') return;

        const ext = this._extension(path);
        const content = typeof file.content === 'string' ? file.content : '';

        if (TEXT_EXTENSIONS.has(ext)) {
            await this.openInNotes(path, content);
            return;
        }

        if (IMAGE_EXTENSIONS.has(ext) && content.startsWith('data:')) {
            const popup = window.open(content, '_blank', 'noopener');
            if (!popup) alert('Image preview blocked by browser popup settings.');
            return;
        }

        if (/^https?:\/\//i.test(content)) {
            const popup = window.open(content, '_blank', 'noopener');
            if (!popup) alert('Could not open link in a new tab.');
            return;
        }

        this.downloadFile(path);
    }

    async openInNotes(path, content) {
        if (!this.kernel?.processManager?.spawn) {
            alert('Notes app is not available right now.');
            return;
        }

        await this.kernel.processManager.spawn('notes', { path, content });
    }

    promptNewFolder() {
        const requested = prompt('Folder name:');
        const clean = this._cleanName(requested);
        if (!clean) return;

        const nextPath = this._resolveCollisionPath(this._joinPath(this.currentPath, clean), true);
        this.fs.mkdir(nextPath);
        this._registerNewPath(nextPath);
        this.refresh();
    }

    promptNewNote() {
        const suggested = `Note ${new Date().toLocaleDateString().replace(/\//g, '-')}.txt`;
        const requested = prompt('Note file name:', suggested);
        const clean = this._cleanName(requested);
        if (!clean) return;

        const filename = clean.includes('.') ? clean : `${clean}.txt`;
        const nextPath = this._resolveCollisionPath(this._joinPath(this.currentPath, filename));
        this.fs.write(nextPath, '', {
            mime: 'text/plain',
            source: 'notes',
            created: Date.now(),
        });
        this._registerNewPath(nextPath);

        this.refresh();
        this.openFile(nextPath);
    }

    promptRename(item) {
        if (!item || item.path === HOME_PATH) {
            alert('This item cannot be renamed.');
            return;
        }

        const currentName = this._basename(item.path);
        const requested = prompt('Rename item:', currentName);
        const clean = this._cleanName(requested);
        if (!clean || clean === currentName) return;

        const parent = this._dirname(item.path);
        const target = this._resolveCollisionPath(this._joinPath(parent, clean), item.type === 'directory');

        if (item.type === 'directory' && this._isSubPath(target, item.path)) {
            alert('Cannot move a folder inside itself.');
            return;
        }

        try {
            this.fs.rename(item.path, target);
            this._syncPathReferences(item.path, target);
            this._updateOrderAfterMove(item.path, target);
            this.refresh();
        } catch (error) {
            alert(`Rename failed: ${error?.message || error}`);
        }
    }

    promptMove(item) {
        if (!item?.path || item.path === HOME_PATH) {
            alert('This item cannot be moved.');
            return;
        }

        const sourcePath = this._normalizePath(item.path);
        const source = this.fs.read(sourcePath);
        if (!source) {
            alert('Item no longer exists.');
            this.refresh();
            return;
        }

        const currentParent = this._dirname(sourcePath);
        const candidateFolders = this._listMoveTargets(sourcePath, source.type)
            .filter((path) => path !== currentParent)
            .sort((a, b) => {
                if (a === this.currentPath) return -1;
                if (b === this.currentPath) return 1;
                if (a === HOME_PATH) return -1;
                if (b === HOME_PATH) return 1;
                return a.localeCompare(b, undefined, { sensitivity: 'base' });
            });

        if (candidateFolders.length === 0) {
            alert('No valid destination folders found.');
            return;
        }

        const folderChoices = candidateFolders.map((path, index) => {
            const label = path === HOME_PATH ? 'Home' : path.replace('/home/', '');
            return `${index + 1}. ${label}`;
        });

        const movePrompt = [
            `Move "${this._basename(sourcePath)}" to:`,
            '',
            ...folderChoices,
            '',
            'Enter choice number:',
        ].join('\n');

        const rawChoice = prompt(movePrompt, '1');
        if (!rawChoice) return;

        const choiceIndex = Number(rawChoice.trim()) - 1;
        if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= candidateFolders.length) {
            alert('Invalid choice.');
            return;
        }

        const targetDir = candidateFolders[choiceIndex];
        if (!this._isDirectory(targetDir)) {
            alert(`Target folder not found: ${targetDir}`);
            return;
        }

        if (source.type === 'directory' && this._isSubPath(targetDir, sourcePath)) {
            alert('Cannot move a folder inside itself.');
            return;
        }

        const desired = this._joinPath(targetDir, this._basename(sourcePath));
        const destination = this._resolveCollisionPath(desired, source.type === 'directory');
        if (destination === sourcePath) {
            this.refresh();
            return;
        }

        try {
            this.fs.rename(sourcePath, destination);
            this._syncPathReferences(sourcePath, destination);
            this._updateOrderAfterMove(sourcePath, destination);
            if (this.clipboard?.path === sourcePath) this.clipboard.path = destination;
            this.refresh();
        } catch (error) {
            alert(`Move failed: ${error?.message || error}`);
        }
    }

    deleteItem(item) {
        if (!item || item.path === HOME_PATH) {
            alert('This item cannot be deleted.');
            return;
        }

        const name = this._basename(item.path);
        const inTrash = item.path === TRASH_PATH || item.path.startsWith(TRASH_PATH + '/');

        if (inTrash) {
            if (!confirm(`Delete "${name}" permanently?`)) return;
            this.fs.delete(item.path);
            this._removeFromOrder(item.path);
            this.refresh();
            return;
        }

        const trashTarget = this._resolveCollisionPath(this._joinPath(TRASH_PATH, name), item.type === 'directory');
        try {
            this.fs.rename(item.path, trashTarget);
            this._updateOrderAfterMove(item.path, trashTarget);
            this.refresh();
        } catch (error) {
            alert(`Move to Trash failed: ${error?.message || error}`);
        }
    }

    setClipboard(action, item) {
        if (!item?.path) return;
        this.clipboard = { action, path: item.path };
        this.refresh();
    }

    async pasteClipboard() {
        if (!this.clipboard) return;

        const sourcePath = this.clipboard.path;
        const source = this.fs.read(sourcePath);
        if (!source) {
            this.clipboard = null;
            this.refresh();
            return;
        }

        const candidate = this._joinPath(this.currentPath, this._basename(sourcePath));
        const target = this._resolveCollisionPath(candidate, source.type === 'directory');

        if (source.type === 'directory' && this._isSubPath(target, sourcePath)) {
            alert('Cannot paste a folder inside itself.');
            return;
        }

        try {
            if (this.clipboard.action === 'cut') {
                this.fs.rename(sourcePath, target);
                this._syncPathReferences(sourcePath, target);
                this._updateOrderAfterMove(sourcePath, target);
                this.clipboard = null;
            } else {
                this.copyRecursive(sourcePath, target);
                this._registerNewPath(target);
            }
            this.refresh();
        } catch (error) {
            alert(`Paste failed: ${error?.message || error}`);
        }
    }

    copyRecursive(sourcePath, targetPath) {
        const source = this.fs.read(sourcePath);
        if (!source) throw new Error(`Source not found: ${sourcePath}`);

        if (source.type === 'directory') {
            this.fs.mkdir(targetPath);
            const children = this.fs.list(sourcePath);
            children.forEach((child) => {
                const childTarget = this._joinPath(targetPath, this._basename(child.path));
                this.copyRecursive(child.path, childTarget);
            });
            return;
        }

        this.fs.write(targetPath, source.content, {
            ...(source.meta || {}),
            created: Date.now(),
        });
    }

    downloadFile(path) {
        const file = this.fs.read(path);
        if (!file || file.type !== 'file') return;

        const name = this._basename(path);
        const raw = typeof file.content === 'string' ? file.content : String(file.content ?? '');

        const anchor = document.createElement('a');
        anchor.download = name;

        let objectUrl = null;
        if (raw.startsWith('data:')) {
            anchor.href = raw;
        } else {
            const mime = file.meta?.mime || (TEXT_EXTENSIONS.has(this._extension(path)) ? 'text/plain;charset=utf-8' : 'application/octet-stream');
            const blob = new Blob([raw], { type: mime });
            objectUrl = URL.createObjectURL(blob);
            anchor.href = objectUrl;
        }

        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }

    async handleUploadChange(event) {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;

        for (const file of files) {
            try {
                const stored = await this.readFileForStorage(file);
                const nextPath = this._resolveCollisionPath(this._joinPath(this.currentPath, this._cleanName(file.name) || `upload-${Date.now()}`));

                this.fs.write(nextPath, stored, {
                    mime: file.type || 'application/octet-stream',
                    size: file.size || 0,
                    source: 'upload',
                    uploadedAt: Date.now(),
                });
            } catch (error) {
                alert(`Upload failed for ${file.name}: ${error?.message || error}`);
            }
        }

        event.target.value = '';
        this.refresh();
    }

    readFileForStorage(file) {
        const shouldReadAsText = this.isLikelyTextFile(file);

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');

            if (shouldReadAsText) reader.readAsText(file);
            else reader.readAsDataURL(file);
        });
    }

    isLikelyTextFile(file) {
        const type = String(file.type || '').toLowerCase();
        if (type.startsWith('text/')) return true;
        if (type.includes('json') || type.includes('xml') || type.includes('javascript')) return true;

        const ext = this._extension(file.name || '');
        return TEXT_EXTENSIONS.has(ext);
    }

    // ── Context Menu ────────────────────────────────────────────

    showContextMenu(x, y, item = null) {
        this.closeContextMenu();

        const menu = el('div', { class: 'yf-menu' });
        const entries = [];

        if (item) {
            entries.push({ label: 'Open', action: () => this.openItem(item) });
            entries.push({ label: 'Move To…', action: () => this.promptMove(item) });
            entries.push({ divider: true });
            entries.push({ label: 'Copy', action: () => this.setClipboard('copy', item) });
            entries.push({ label: 'Cut', action: () => this.setClipboard('cut', item) });
            entries.push({ label: 'Rename', action: () => this.promptRename(item) });
            if (item.type !== 'directory') {
                entries.push({ label: 'Download', action: () => this.downloadFile(item.path) });
            }
            if (item.type === 'directory' && item.path !== HOME_PATH && item.path !== TRASH_PATH) {
                entries.push({ divider: true });
                if (this.favorites.has(item.path)) {
                    entries.push({ label: '★ Remove Favorite', action: () => this.removeFavorite(item.path) });
                } else {
                    entries.push({ label: '☆ Add to Favorites', action: () => this.addFavorite(item.path) });
                }
            }
            entries.push({ divider: true });
            entries.push({ label: 'Delete', action: () => this.deleteItem(item), danger: true });
        } else {
            entries.push({ label: 'New Folder', action: () => this.promptNewFolder() });
            entries.push({ label: 'New Note', action: () => this.promptNewNote() });
            entries.push({ label: 'Upload', action: () => this.uploadInput.click() });
            if (this.clipboard) {
                entries.push({ divider: true });
                entries.push({ label: `Paste (${this.clipboard.action})`, action: () => this.pasteClipboard() });
            }
            entries.push({ divider: true });
            entries.push({ label: 'Refresh', action: () => this.refresh() });
        }

        entries.forEach((entry) => {
            if (entry.divider) {
                menu.appendChild(el('div', { class: 'yf-menu-sep' }));
                return;
            }
            menu.appendChild(el('button', {
                class: `yf-menu-item ${entry.danger ? 'is-danger' : ''}`,
                type: 'button',
                onclick: (event) => {
                    event.stopPropagation();
                    this.closeContextMenu();
                    entry.action();
                },
            }, entry.label));
        });

        this.root.appendChild(menu);

        requestAnimationFrame(() => {
            const width = menu.offsetWidth || 220;
            const height = menu.offsetHeight || 200;
            const maxX = window.innerWidth - width - 8;
            const maxY = window.innerHeight - height - 8;

            const safeX = Math.max(8, Math.min(x || 8, maxX));
            const safeY = Math.max(8, Math.min(y || 8, maxY));
            menu.style.left = `${safeX}px`;
            menu.style.top = `${safeY}px`;
            menu.classList.add('is-visible');
        });

        this.activeMenu = menu;
    }

    closeContextMenu() {
        if (!this.activeMenu) return;
        this.activeMenu.remove();
        this.activeMenu = null;
    }

    // ── Storage ─────────────────────────────────────────────────

    async updateStorageBadge() {
        const info = await this.getStorageInfo();
        this.storageSummary = info;
        this._updateStatus(this.fs.list(this.currentPath).length);
    }

    async showStorageInfo() {
        const info = await this.getStorageInfo();

        const lines = [
            'YancoTab Files Storage',
            '',
            `Saved location: browser localStorage (${this.fs?.prefix || 'yancotab:fs:'}*)`,
            `Files + folders tracked: ${info.itemCount}`,
            `YancoTab Files usage: ${this._formatBytes(info.fsBytes)}`,
            `Total localStorage usage (origin): ${this._formatBytes(info.localStorageBytes)}`,
        ];

        if (info.estimateQuotaBytes > 0) {
            lines.push(`Estimated browser quota (origin): ${this._formatBytes(info.estimateQuotaBytes)}`);
            lines.push(`Estimated origin usage (all storage): ${this._formatBytes(info.estimateUsageBytes)}`);
        }

        lines.push('');
        lines.push('Notes:');
        lines.push('- Text-like files are stored as UTF-8 strings.');
        lines.push('- Binary uploads are stored as Data URLs (base64), which uses more space.');
        lines.push('- Browser storage can be cleared by site-data reset or private mode policies.');

        alert(lines.join('\n'));
    }

    async getStorageInfo() {
        const fsPrefix = this.fs?.prefix || 'yancotab:fs:';

        let localStorageBytes = 0;
        let fsBytes = 0;
        let itemCount = 0;

        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index) || '';
            const value = localStorage.getItem(key) || '';
            const bytes = (key.length + value.length) * 2;
            localStorageBytes += bytes;

            if (key.startsWith(fsPrefix)) {
                fsBytes += bytes;
                itemCount += 1;
            }
        }

        let estimateUsageBytes = 0;
        let estimateQuotaBytes = 0;
        if (navigator.storage?.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                estimateUsageBytes = Number(estimate?.usage || 0);
                estimateQuotaBytes = Number(estimate?.quota || 0);
            } catch {
                // ignore estimate errors
            }
        }

        return {
            fsBytes,
            localStorageBytes,
            itemCount,
            estimateUsageBytes,
            estimateQuotaBytes,
        };
    }

    // ── Sorting ─────────────────────────────────────────────────

    _sortedItems(items, dirPath = this.currentPath) {
        const dirs = items.filter((i) => i.type === 'directory');
        const files = items.filter((i) => i.type !== 'directory');

        const cmp = (a, b) => {
            switch (this.sortMode) {
                case 'name-desc':
                    return this._basename(b.path).localeCompare(this._basename(a.path), undefined, { sensitivity: 'base' });
                case 'date':
                    return (b.meta?.modified || b.meta?.created || 0) - (a.meta?.modified || a.meta?.created || 0);
                case 'date-old':
                    return (a.meta?.modified || a.meta?.created || 0) - (b.meta?.modified || b.meta?.created || 0);
                case 'size':
                    return (b.meta?.size || 0) - (a.meta?.size || 0);
                case 'type': {
                    const ea = this._extension(a.path);
                    const eb = this._extension(b.path);
                    return ea !== eb
                        ? ea.localeCompare(eb)
                        : this._basename(a.path).localeCompare(this._basename(b.path), undefined, { sensitivity: 'base' });
                }
                default:
                    return this._basename(a.path).localeCompare(this._basename(b.path), undefined, { sensitivity: 'base' });
            }
        };

        dirs.sort(cmp);
        files.sort(cmp);
        const all = [...dirs, ...files];

        // Custom drag-reorder only applies in default name sort
        if (this.sortMode === 'name') {
            const orderedPaths = this._getOrderedPathList(all, dirPath);
            const ranked = new Map(orderedPaths.map((path, index) => [path, index]));
            return all.sort((a, b) => {
                const ra = ranked.has(a.path) ? ranked.get(a.path) : Number.MAX_SAFE_INTEGER;
                const rb = ranked.has(b.path) ? ranked.get(b.path) : Number.MAX_SAFE_INTEGER;
                return ra - rb;
            });
        }

        return all;
    }

    _sortLabel() {
        const opt = SORT_OPTIONS.find((o) => o.key === this.sortMode);
        return opt ? opt.label : 'Name A→Z';
    }

    // ── Type & Icon ─────────────────────────────────────────────

    _typeForItem(item) {
        if (item.type === 'directory') return 'folder';
        const ext = this._extension(item.path);
        if (IMAGE_EXTENSIONS.has(ext)) return 'image';
        if (['js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'html', 'htm', 'json', 'xml', 'yaml', 'yml', 'py', 'rb', 'go', 'rs', 'c', 'cpp', 'h', 'java', 'php', 'sh', 'bash', 'ini', 'cfg'].includes(ext)) return 'code';
        if (['txt', 'md', 'log', 'csv'].includes(ext)) return 'text';
        if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'archive';
        if (['mp3', 'wav', 'aac', 'flac', 'mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return 'media';
        if (ext === 'pdf') return 'text';
        return 'unknown';
    }

    _iconForItem(item) {
        if (item.type === 'directory') {
            if (item.path.startsWith(TRASH_PATH)) return '🗑️';
            if (item.path === '/home/downloads') return '⬇️';
            return '📁';
        }

        const ext = this._extension(item.path);
        if (IMAGE_EXTENSIONS.has(ext)) return '🖼️';
        if (TEXT_EXTENSIONS.has(ext)) return '📝';
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
        if (['mp3', 'wav', 'aac', 'flac'].includes(ext)) return '🎵';
        if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return '🎬';
        if (['pdf'].includes(ext)) return '📕';
        return '📄';
    }

    // ── Formatting ──────────────────────────────────────────────

    _formatDate(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    _formatBytes(bytes) {
        const value = Number(bytes || 0);
        if (value < 1024) return `${value} B`;

        const units = ['KB', 'MB', 'GB'];
        let unitIndex = -1;
        let next = value;

        while (next >= 1024 && unitIndex < units.length - 1) {
            next /= 1024;
            unitIndex += 1;
        }

        return `${next.toFixed(next >= 10 ? 1 : 2)} ${units[unitIndex]}`;
    }

    // ── Path Utilities ──────────────────────────────────────────

    _normalizePath(path) {
        const value = String(path || HOME_PATH).trim();
        if (!value) return HOME_PATH;

        let normalized = value.replace(/\\+/g, '/');
        if (!normalized.startsWith('/')) normalized = `/${normalized}`;
        normalized = normalized.replace(/\/+/g, '/');

        if (normalized.length > 1 && normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1);
        }

        return normalized || HOME_PATH;
    }

    _isDirectory(path) {
        const node = this.fs.read(this._normalizePath(path));
        return Boolean(node && node.type === 'directory');
    }

    _joinPath(base, name) {
        const cleanBase = this._normalizePath(base);
        const cleanName = String(name || '').replace(/^\/+/, '');
        return this._normalizePath(`${cleanBase}/${cleanName}`);
    }

    _basename(path) {
        const normalized = this._normalizePath(path);
        const parts = normalized.split('/').filter(Boolean);
        return parts[parts.length - 1] || '';
    }

    _dirname(path) {
        const normalized = this._normalizePath(path);
        if (normalized === HOME_PATH) return HOME_PATH;

        const parts = normalized.split('/').filter(Boolean);
        parts.pop();
        return parts.length ? `/${parts.join('/')}` : HOME_PATH;
    }

    _extension(path) {
        const name = this._basename(path);
        const index = name.lastIndexOf('.');
        if (index <= 0 || index === name.length - 1) return '';
        return name.slice(index + 1).toLowerCase();
    }

    _cleanName(value) {
        return String(value || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ');
    }

    _resolveCollisionPath(path, isDirectory = false) {
        const normalized = this._normalizePath(path);
        if (!this.fs.exists(normalized)) return normalized;

        const dir = this._dirname(normalized);
        const name = this._basename(normalized);

        if (isDirectory) {
            let index = 2;
            while (true) {
                const candidate = this._joinPath(dir, `${name} (${index})`);
                if (!this.fs.exists(candidate)) return candidate;
                index += 1;
            }
        }

        const dotIndex = name.lastIndexOf('.');
        const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
        const ext = dotIndex > 0 ? name.slice(dotIndex) : '';

        let index = 2;
        while (true) {
            const candidate = this._joinPath(dir, `${stem} (${index})${ext}`);
            if (!this.fs.exists(candidate)) return candidate;
            index += 1;
        }
    }

    _isSubPath(path, possibleParentPath) {
        const target = this._normalizePath(path);
        const parent = this._normalizePath(possibleParentPath);
        return target.startsWith(parent + '/');
    }

    _syncPathReferences(oldPath, newPath) {
        this.currentPath = this.currentPath === oldPath
            ? newPath
            : this.currentPath.startsWith(oldPath + '/')
                ? this.currentPath.replace(oldPath, newPath)
                : this.currentPath;

        this.history = this.history.map((entry) => {
            if (entry === oldPath) return newPath;
            if (entry.startsWith(oldPath + '/')) return entry.replace(oldPath, newPath);
            return entry;
        });
    }

    // ── Order Map ───────────────────────────────────────────────

    _loadOrderMap() {
        try {
            const raw = localStorage.getItem(FILES_ORDER_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    _saveOrderMap() {
        try {
            localStorage.setItem(FILES_ORDER_KEY, JSON.stringify(this.orderMap));
        } catch {
            // ignore persistence errors
        }
    }

    _getOrderedPathList(items, dirPath) {
        const dir = this._normalizePath(dirPath);
        const currentPaths = items.map((item) => this._normalizePath(item.path));
        const currentSet = new Set(currentPaths);

        const storedRaw = Array.isArray(this.orderMap[dir]) ? this.orderMap[dir] : [];
        const stored = storedRaw
            .map((path) => this._normalizePath(path))
            .filter((path) => currentSet.has(path));
        const missing = currentPaths.filter((path) => !stored.includes(path));
        const merged = [...stored, ...missing];

        const needsWrite = !Array.isArray(this.orderMap[dir])
            || merged.length !== this.orderMap[dir].length
            || merged.some((path, index) => path !== this.orderMap[dir][index]);

        if (needsWrite) {
            this.orderMap[dir] = merged;
            this._saveOrderMap();
        }

        return merged;
    }

    _registerNewPath(path) {
        const normalized = this._normalizePath(path);
        const dir = this._dirname(normalized);
        const list = Array.isArray(this.orderMap[dir]) ? [...this.orderMap[dir]] : [];
        if (!list.includes(normalized)) {
            list.push(normalized);
            this.orderMap[dir] = list;
            this._saveOrderMap();
        }
    }

    _removeFromOrder(path) {
        const normalized = this._normalizePath(path);
        const dir = this._dirname(normalized);
        const list = Array.isArray(this.orderMap[dir]) ? [...this.orderMap[dir]] : [];
        const next = list.filter((entry) => entry !== normalized);
        this.orderMap[dir] = next;

        Object.keys(this.orderMap).forEach((key) => {
            if (key === normalized || key.startsWith(normalized + '/')) {
                delete this.orderMap[key];
            }
        });

        this._saveOrderMap();
    }

    _updateOrderAfterMove(oldPath, newPath) {
        const oldNorm = this._normalizePath(oldPath);
        const newNorm = this._normalizePath(newPath);
        const oldDir = this._dirname(oldNorm);
        const newDir = this._dirname(newNorm);

        if (oldDir === newDir) {
            const list = Array.isArray(this.orderMap[oldDir]) ? [...this.orderMap[oldDir]] : [];
            const index = list.indexOf(oldNorm);
            if (index >= 0) list[index] = newNorm;
            else list.push(newNorm);
            this.orderMap[oldDir] = list;
        } else {
            const oldList = Array.isArray(this.orderMap[oldDir]) ? this.orderMap[oldDir].filter((entry) => entry !== oldNorm) : [];
            const newList = Array.isArray(this.orderMap[newDir]) ? [...this.orderMap[newDir]] : [];
            if (!newList.includes(newNorm)) newList.push(newNorm);
            this.orderMap[oldDir] = oldList;
            this.orderMap[newDir] = newList;
        }

        if (this.orderMap[oldNorm]) {
            this.orderMap[newNorm] = this.orderMap[oldNorm].map((entry) => entry.replace(oldNorm, newNorm));
            delete this.orderMap[oldNorm];
        }

        Object.keys(this.orderMap).forEach((key) => {
            if (key.startsWith(oldNorm + '/')) {
                const movedKey = key.replace(oldNorm, newNorm);
                this.orderMap[movedKey] = this.orderMap[key].map((entry) => entry.replace(oldNorm, newNorm));
                delete this.orderMap[key];
            }
        });

        this._saveOrderMap();
    }

    _listMoveTargets(sourcePath, sourceType) {
        const normalizedSource = this._normalizePath(sourcePath);
        const folders = new Set([HOME_PATH]);
        const queue = [HOME_PATH];
        const seen = new Set();

        while (queue.length > 0) {
            const dir = queue.shift();
            if (seen.has(dir)) continue;
            seen.add(dir);

            const children = this.fs.list(dir);
            children.forEach((child) => {
                if (child.type !== 'directory') return;
                const childPath = this._normalizePath(child.path);
                if (childPath === normalizedSource) return;
                if (sourceType === 'directory' && this._isSubPath(childPath, normalizedSource)) return;
                if (!folders.has(childPath)) {
                    folders.add(childPath);
                    queue.push(childPath);
                }
            });
        }

        return Array.from(folders);
    }
}
