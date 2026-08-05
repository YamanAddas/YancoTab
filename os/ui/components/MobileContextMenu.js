/**
 * MobileContextMenu.js — v0.7
 *
 * Professional context menus for grid, desktop items, and dock items.
 * v0.7: rich, contextual actions like a real mobile OS.
 */

import { MobileShortcutModal } from './MobileShortcutModal.js';
import { el } from '../../utils/dom.js';
import {
  readMarker, resolveWallpaper, applyStoredWallpaper, SPECIAL_MARKERS,
} from '../../theme/wallpaper.js';

export class MobileContextMenu {
  constructor(grid) {
    this.grid = grid;
    this.active = false;
    this.overlay = null;
    this.shortcutModal = new MobileShortcutModal(grid);

    // Restore, but do not rewrite. The old constructor ran every saved
    // marker through a path normaliser and SAVED THE RESULT — so 'custom'
    // became url("custom") and a Photos preset id became url("g1"),
    // destroying the real choice on the very first load after it was made.
    applyStoredWallpaper();
  }

  // Source of truth: the 8 theme wallpapers shipped under assets/wallpapers/.
  // Mirrors the keys in os/theme/themes.js THEMES.
  wallpapers = [
    'assets/wallpapers/emerald.webp',
    'assets/wallpapers/obsidian.webp',
    'assets/wallpapers/sapphire.webp',
    'assets/wallpapers/amethyst.webp',
    'assets/wallpapers/rose.webp',
    'assets/wallpapers/arctic.webp',
    'assets/wallpapers/sunset.webp',
    'assets/wallpapers/crimson.webp',
  ];

  /**
   * Advance to the next themed wallpaper.
   *
   * Only this path writes. Legacy-marker migration now lives in
   * theme/wallpaper.js, where it runs wherever a wallpaper is resolved
   * rather than only when a context menu happens to be constructed.
   */
  changeWallpaper() {
    const marker = readMarker();
    // A special mode (cosmic / starfield / custom) has no place in the
    // themed ring, so cycling out of one starts at the beginning rather
    // than trying to locate it in a list it was never in.
    let nextIndex = 0;
    if (!SPECIAL_MARKERS.has(marker)) {
      const desc = resolveWallpaper(marker);
      const idx = desc.kind === 'image' ? this.wallpapers.indexOf(desc.value) : -1;
      if (idx >= 0) nextIndex = (idx + 1) % this.wallpapers.length;
    }
    this.setWallpaper(this.wallpapers[nextIndex]);
  }

  /** Persist a wallpaper marker and repaint from storage. */
  setWallpaper(value) {
    const k = this.grid?.kernel || (typeof window !== 'undefined' ? window.kernel : null);
    if (k?.storage?.save) {
      try { k.storage.save('yancotab_wallpaper', value); }
      catch { try { localStorage.setItem('yancotab_wallpaper', value); } catch { /* ignore */ } }
    } else {
      try { localStorage.setItem('yancotab_wallpaper', value); } catch { /* ignore */ }
    }
    applyStoredWallpaper();
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
        iconEl.textContent = icon;
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
