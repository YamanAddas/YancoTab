/**
 * MobileContextMenu.js — v0.7
 *
 * Professional context menus for grid, desktop items, and dock items.
 * v0.7: rich, contextual actions like a real mobile OS.
 */

import { MobileShortcutModal } from './MobileShortcutModal.js';
import { el } from '../../utils/dom.js';

export class MobileContextMenu {
  constructor(grid) {
    this.grid = grid;
    this.active = false;
    this.overlay = null;
    this.shortcutModal = new MobileShortcutModal(grid);

    const saved = localStorage.getItem('yancotab_wallpaper');
    if (saved) this.applySavedWallpaper(saved);
  }

  wallpapers = [
    'assets/wallpaper.webp',
    'assets/wallpapers/deep-blue.webp',
    'assets/wallpapers/black.webp',
    'assets/wallpapers/dark.webp',
    'assets/wallpapers/violet.webp',
    'assets/wallpapers/pink.webp',
    'assets/wallpapers/sky.webp',
    'assets/wallpapers/mint.webp',
  ];

  legacyWallpaperMap = {
    'linear-gradient(135deg, #0a1628 0%, #1a2d4a 50%, #0d1f35 100%)': 'assets/wallpapers/deep-blue.webp',
    '#000000': 'assets/wallpapers/black.webp',
    'linear-gradient(45deg, #121212, #2a2a2a)': 'assets/wallpapers/dark.webp',
    'linear-gradient(135deg, #667eea, #764ba2)': 'assets/wallpapers/violet.webp',
    'linear-gradient(135deg, #f093fb, #f5576c)': 'assets/wallpapers/pink.webp',
    'linear-gradient(135deg, #4facfe, #00f2fe)': 'assets/wallpapers/sky.webp',
    'linear-gradient(135deg, #43e97b, #38f9d7)': 'assets/wallpapers/mint.webp',
  };

  normalizeWallpaper(saved) {
    if (!saved) return this.wallpapers[0];
    if (saved in this.legacyWallpaperMap) return this.legacyWallpaperMap[saved];
    const match = saved.match(/^url\(["']?(.+?)["']?\)$/);
    return match ? match[1] : saved;
  }

  applySavedWallpaper(saved) {
    const shell = document.getElementById('app-shell') || document.querySelector('.mobile-shell') || document.body;
    shell.classList.remove('cosmic-wallpaper');

    if (saved === 'cosmic') {
      shell.classList.add('cosmic-wallpaper');
      return;
    }
    if (saved === 'starfield') {
      shell.style.background = 'transparent';
      shell.style.backgroundSize = '';
      shell.style.backgroundPosition = '';
      return;
    }

    const normalized = this.normalizeWallpaper(saved);
    shell.style.background = '';
    shell.style.backgroundImage = `url("${normalized}")`;
    shell.style.backgroundSize = 'cover';
    shell.style.backgroundPosition = 'center';
    localStorage.setItem('yancotab_wallpaper', `url("${normalized}")`);
  }

  changeWallpaper() {
    const current = this.normalizeWallpaper(localStorage.getItem('yancotab_wallpaper') || '');
    let nextIndex = 0;
    const idx = this.wallpapers.indexOf(current);
    if (idx >= 0) nextIndex = (idx + 1) % this.wallpapers.length;
    const nextUrl = this.wallpapers[nextIndex];
    this.applySavedWallpaper(nextUrl);
  }

  // ─── Show / Hide ────────────────────────────────────────────

  show(item, x, y) {
    if (this.active) this.hide();
    this.active = true;

    this.overlay = el('div', { class: 'mobile-context-overlay' });
    this.overlay.style.opacity = '0';
    this.overlay.style.transition = 'opacity 0.2s';

    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) { e.stopPropagation(); this.hide(); }
    });

    const menu = el('div', { class: 'mobile-context-menu' });
    menu.style.transform = 'scale(0.92)';
    menu.style.transition = 'transform 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

    const actions = this._buildMenu(item, menu);

    for (let i = 0; i < actions.length; i++) {
      const act = actions[i];

      // Separator before destructive actions
      if (act.destructive && i > 0 && !actions[i - 1].destructive) {
        menu.appendChild(el('div', { class: 'ctx-separator' }));
      }

      const btn = el('div', {
        class: `context-item${act.destructive ? ' destructive' : ''}`,
      }, [
        el('span', {}, act.label),
        el('span', { style: { fontSize: '16px', opacity: 0.7 } }, act.icon),
      ]);
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.hide(); act.action(); });
      menu.appendChild(btn);
    }

    this.overlay.appendChild(menu);
    document.body.appendChild(this.overlay);
    requestAnimationFrame(() => { this.overlay.style.opacity = '1'; menu.style.transform = 'scale(1)'; });
  }

  hide() {
    if (!this.active || !this.overlay) return;
    this.active = false;
    this.overlay.style.opacity = '0';
    const ref = this.overlay;
    setTimeout(() => { if (ref?.parentNode) ref.remove(); }, 200);
    this.overlay = null;
  }

  // ─── Menu Builders ──────────────────────────────────────────

  _buildMenu(item, menu) {
    if (item.type === 'grid') return this._gridMenu(menu);
    if (item.type === 'dock') return this._dockMenu(item, menu);
    return this._desktopMenu(item, menu);
  }

  _addIconHeader(menu, icon, title) {
    const header = el('div', { class: 'ctx-header' });
    if (icon) {
      const iconEl = el('div', { class: 'ctx-header-icon' });
      if (typeof icon === 'string' && icon.includes('/')) {
        iconEl.style.backgroundImage = `url(${icon})`;
      } else {
        iconEl.textContent = icon || '📦';
      }
      header.appendChild(iconEl);
    }
    header.appendChild(el('div', { class: 'ctx-header-title' }, title || 'Item'));
    menu.appendChild(header);
  }

  /** Desktop/grid background long-press */
  _gridMenu(menu) {
    this._addIconHeader(menu, '💎', 'YancoTab');
    return [
      { label: 'Change Wallpaper', icon: '🖼️', action: () => this.changeWallpaper() },
      { label: 'Add Web Shortcut', icon: '🔗', action: () => this.shortcutModal.show() },
      { label: 'Edit Home Screen', icon: '✏️', action: () => this.grid.startEditMode() },
      { label: 'Sort Apps by Name', icon: '🔤', action: () => this._sortAppsByName() },
      { label: 'Open Settings', icon: '⚙️', action: () => this.grid.openApp('settings') },
    ];
  }

  /** Dock item long-press */
  _dockMenu(item, menu) {
    this._addIconHeader(menu, item.icon, item.title);

    const actions = [
      { label: 'Open', icon: '↗', action: () => this._openItem(item) },
    ];

    if (item.itemType === 'shortcut') {
      actions.push(
        { label: 'Edit Shortcut', icon: '✏️', action: () => this.shortcutModal.show({ id: item.id, title: item.title, url: item.url, icon: item.icon }) },
      );
    }

    actions.push(
      { label: 'Add to Home Screen', icon: '➕', action: () => window.dispatchEvent(new CustomEvent('shortcut:create', { detail: { origin: 'dock', id: item.id } })) },
      { label: 'Remove from Dock', icon: '✕', destructive: true, action: () => window.dispatchEvent(new CustomEvent('dock:remove-item', { detail: { id: item.id } })) },
    );

    return actions;
  }

  /** Desktop icon long-press */
  _desktopMenu(item, menu) {
    const fullItem = this.grid.state.items.get(item.id) || item;
    const isShortcut = item.id.startsWith('shortcut-');
    const isFolder = fullItem.type === 'folder';
    const isAlias = fullItem.type === 'alias';

    this._addIconHeader(menu, fullItem.icon, fullItem.title || fullItem.name);

    const actions = [];

    // Open
    actions.push({ label: 'Open', icon: '↗', action: () => this.grid.openApp(item.id) });

    // Dock shortcut
    if (!isFolder) {
      actions.push({
        label: 'Add to Dock', icon: '📌',
        action: () => window.dispatchEvent(new CustomEvent('shortcut:create', { detail: { origin: 'desktop', id: item.id } })),
      });
    }

    // Folder-specific
    if (isFolder) {
      actions.push({
        label: 'Rename Folder', icon: '✏️',
        action: () => {
          const name = prompt('Folder name:', fullItem.title);
          if (name && name.trim()) { fullItem.title = name.trim(); this.grid.state._save(); this.grid.render(); }
        },
      });

      actions.push({
        label: 'Delete Folder', icon: '🗑️', destructive: true,
        action: () => {
          if (confirm(`Delete folder "${fullItem.title}"? Apps inside will be moved to the desktop.`)) {
            this.grid.removeApp(fullItem.id);
          }
        },
      });
    }

    // Shortcut edit
    if (isShortcut) {
      actions.push({
        label: 'Edit Shortcut', icon: '✏️',
        action: () => this.shortcutModal.show({ id: fullItem.id, title: fullItem.title, url: fullItem.url, icon: fullItem.icon }),
      });
    }

    // Share (for shortcuts with URLs)
    if (fullItem.url) {
      actions.push({
        label: 'Share Link', icon: '↑',
        action: () => {
          if (navigator.share) {
            navigator.share({ title: fullItem.title, url: fullItem.url }).catch(() => { });
          } else {
            navigator.clipboard?.writeText(fullItem.url);
            this._toast('Link copied!');
          }
        },
      });
    }

    // Delete (shortcuts, aliases) / Remove (native apps just hide)
    if (isShortcut || isAlias) {
      actions.push({
        label: 'Delete', icon: '🗑️', destructive: true,
        action: () => { if (confirm(`Delete "${fullItem.title}"?`)) this.grid.removeApp(item.id); },
      });
    }

    return actions;
  }

  // ─── Helpers ────────────────────────────────────────────────

  _openItem(item) {
    if (item.itemType === 'shortcut') this.grid.openUserApp?.(item);
    else if (item.itemType === 'file') this.grid.openFile?.(item);
    else this.grid.openApp(item.id);
  }

  _sortAppsByName() {
    const state = this.grid.state;
    const visible = Array.from(state.items.values()).filter(it => !it.hidden && !it.parent);
    visible.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    const m = state.layout.metrics;
    const ipp = m.cols * m.rows;
    visible.forEach((item, i) => {
      item.page = Math.floor(i / ipp);
      const local = i % ipp;
      item.row = Math.floor(local / m.cols);
      item.col = local % m.cols;
    });
    state._savePositionsForMode();
    state._save();
    state.notify();
  }

  _toast(msg) {
    const t = el('div', { class: 'toast-pill' });
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', bottom: '140px', left: '50%', transform: 'translateX(-50%)',
      zIndex: '99999', pointerEvents: 'none',
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }
}
