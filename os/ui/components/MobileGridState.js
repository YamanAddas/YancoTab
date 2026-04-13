/**
 * MobileGridState.js — v0.6.1
 *
 * Single Source of Truth for all grid/dock icon positions.
 *
 * Data model per item:
 *   { id, type, title, icon, url, scheme, parent, children[],
 *     page, row, col, hidden, targetId?, targetType? }
 *
 * Types: 'app' | 'shortcut' | 'folder' | 'alias' | 'file'
 *
 * Persistence: localStorage key 'yancotab_mobile_grid_v8'
 * Orientation stability: positionsByMode { portrait: {}, landscape: {} }
 */

import { MobileLayoutEngine } from './MobileLayoutEngineV2.js';

const STORAGE_KEY = 'yancotab_mobile_grid_v10';

export class MobileGridState {
  constructor() {
    /** @type {Map<string, object>} */
    this.items = new Map();
    this.layout = null;
    this.pageCount = 1;
    this.positionsByMode = { portrait: {}, landscape: {} };

    /** @type {Set<Function>} */
    this._listeners = new Set();
  }

  // ─── Subscriptions ──────────────────────────────────────────

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  notify() {
    const snapshot = {
      items: Array.from(this.items.values()),
      pageCount: this.pageCount,
      layout: this.layout,
    };
    for (const fn of this._listeners) fn(snapshot);
  }

  // ─── Initialization ─────────────────────────────────────────

  /**
   * Bootstrap the state from raw app list + layout metrics.
   * Restores from localStorage if available, otherwise lays out sequentially.
   */
  initialize(rawApps, layout) {
    this.layout = layout;

    const stored = this._loadFromStorage();
    const storedItems = this._extractStoredItems(stored);
    const storedPositions = stored?.positionsByMode ?? null;

    if (storedPositions && typeof storedPositions === 'object') {
      this.positionsByMode = {
        portrait: storedPositions.portrait || {},
        landscape: storedPositions.landscape || {},
      };
    }

    if (storedItems && storedItems.length > 0) {
      this._mergeItems(storedItems, rawApps);
    } else {
      this._layoutSequentially(rawApps);
    }

    this._save();
    this.notify();
  }

  // ─── Layout Updates ─────────────────────────────────────────

  /**
   * Called when viewport/orientation changes.
   * Only reflows if grid dimensions actually changed (cols/rows).
   */
  updateLayout(newLayout) {
    const prev = this.layout?.metrics;
    const next = newLayout.metrics;

    // If cols/rows unchanged, just update the reference (no item movement)
    if (prev && prev.cols === next.cols && prev.rows === next.rows) {
      this.layout = newLayout;
      return;
    }

    this.layout = newLayout;
    const mode = this._getLayoutMode();

    // Try restoring saved positions for this orientation
    if (!this._restorePositionsForMode(mode)) {
      this._reflowItems();
    }

    this._savePositionsForMode();
    this._save();
    this.notify();
  }

  // ─── Item Mutations ─────────────────────────────────────────

  /**
   * Move item to a specific grid cell (swap if occupied).
   */
  moveItemTo(id, page, row, col) {
    const item = this.items.get(id);
    if (!item) return;

    const m = this.layout.metrics;
    const maxCols = MobileLayoutEngine.colsForRow(row, m);
    if (row >= m.rows || col >= maxCols || row < 0 || col < 0 || page < 0) return;

    const occupant = this._findItemAt(page, row, col);
    if (occupant && occupant.id !== id) {
      // Swap
      occupant.page = item.page;
      occupant.row = item.row;
      occupant.col = item.col;
    }

    item.page = page;
    item.row = row;
    item.col = col;

    this.pageCount = Math.max(this.pageCount, page + 1);
    this._savePositionsForMode();
    this._save();
    this.notify();
  }

  addApp(app) {
    if (!app?.id || this.items.has(app.id)) return;
    this.items.set(app.id, {
      id: app.id,
      type: 'shortcut',
      title: app.title,
      icon: app.icon,
      url: app.url,
      scheme: app.scheme,
      parent: app.parent || null,
      children: [],
      page: -1, row: -1, col: -1,
      hidden: false,
    });
    this._placePending();
    this._save();
    this.notify();
  }

  addAlias(alias) {
    if (!alias?.id || !alias.targetId || this.items.has(alias.id)) return;
    this.items.set(alias.id, {
      id: alias.id,
      type: 'alias',
      title: alias.title || alias.id,
      icon: alias.icon || '🔗',
      targetId: alias.targetId,
      targetType: alias.targetType || 'app',
      parent: alias.parent || null,
      children: [],
      page: -1, row: -1, col: -1,
      hidden: !!alias.hidden,
    });
    this._placePending();
    this._save();
    this.notify();
  }

  addFolder(folder) {
    if (!folder?.id || this.items.has(folder.id)) return;
    this.items.set(folder.id, {
      id: folder.id,
      type: 'folder',
      title: folder.title || 'Folder',
      icon: folder.icon || 'folder',
      children: Array.isArray(folder.children) ? folder.children.slice() : [],
      parent: null,
      page: folder.page ?? -1,
      row: folder.row ?? -1,
      col: folder.col ?? -1,
      hidden: false,
    });
    if (folder.page === undefined || folder.page < 0) {
      this._placePending();
    }
    this._save();
    this.notify();
  }

  createFolderFromItems(sourceId, targetId, page, row, col) {
    const source = this.items.get(sourceId);
    const target = this.items.get(targetId);
    if (!source || !target) return null;

    const folderId = `folder-${Date.now()}`;
    this.addFolder({ id: folderId, title: 'New Folder', page, row, col });

    // Add items as children
    this.addChildToFolder(sourceId, folderId);
    this.addChildToFolder(targetId, folderId);

    this._save();
    this.notify();
    return folderId;
  }

  addChildToFolder(childId, folderId) {
    const child = this.items.get(childId);
    const folder = this.items.get(folderId);
    if (!child || !folder || folder.type !== 'folder') return;
    if (folder.children.includes(childId)) return;

    folder.children.push(childId);
    child.parent = folderId;
    child.page = -1;
    child.row = -1;
    child.col = -1;
    this._save();
    this.notify();
  }

  removeChildFromFolder(childId) {
    const child = this.items.get(childId);
    if (!child?.parent) return;

    const folder = this.items.get(child.parent);
    if (folder?.children) {
      folder.children = folder.children.filter(id => id !== childId);

      // Auto-delete empty folder
      if (folder.children.length === 0) {
        this.items.delete(folder.id);
      }
    }
    child.parent = null;
    child.page = -1;
    child.row = -1;
    child.col = -1;

    // If we passed the folder in notify, the grid could try to re-render a deleted folder.
    // So if deleted, we don't need to do specific updates for it.

    this._placePending();
    this._save();
    this.notify();
  }

  removeApp(id) {
    const item = this.items.get(id);
    if (!item) return;

    // If folder: promote children back to top-level
    if (item.type === 'folder' && Array.isArray(item.children)) {
      for (const childId of item.children) {
        const child = this.items.get(childId);
        if (child) {
          child.parent = null;
          child.page = -1;
          child.row = -1;
          child.col = -1;
        }
      }
    }

    // If child: remove from parent's children list
    if (item.parent) {
      const parent = this.items.get(item.parent);
      if (parent?.children) {
        parent.children = parent.children.filter(cid => cid !== id);
      }
    }

    this.items.delete(id);
    this._placePending();
    this._save();
    this.notify();
  }

  hideItem(id) {
    const item = this.items.get(id);
    if (!item) return;
    item.hidden = true;
    this._savePositionsForMode();
    this._save();
    this.notify();
  }

  showItem(id) {
    const item = this.items.get(id);
    if (!item) return;
    item.hidden = false;
    // If the item has no valid position, place it
    if (item.page < 0) this._placePending();
    this._savePositionsForMode();
    this._save();
    this.notify();
  }

  /**
   * Normalize visible top-level items into a stable row-major order.
   * Useful for first-run/default home layout migrations.
   */
  sortTopLevel(orderIds = [], options = {}) {
    if (!this.layout?.metrics) return;

    const { resetSavedModes = false } = options;
    const metrics = this.layout.metrics;
    const orderIndex = new Map(orderIds.map((id, i) => [id, i]));
    const visible = this._getVisibleItems();

    visible.sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      if ((a.page ?? 0) !== (b.page ?? 0)) return (a.page ?? 0) - (b.page ?? 0);
      if ((a.row ?? 0) !== (b.row ?? 0)) return (a.row ?? 0) - (b.row ?? 0);
      if ((a.col ?? 0) !== (b.col ?? 0)) return (a.col ?? 0) - (b.col ?? 0);
      return String(a.title || a.id).localeCompare(String(b.title || b.id));
    });

    const ipp = metrics.itemsPerPage || MobileLayoutEngine.calcItemsPerPage(metrics.cols, metrics.rows);
    visible.forEach((item, index) => {
      item.page = Math.floor(index / ipp);
      const local = index % ipp;
      const pos = MobileLayoutEngine.slotToRowCol(local, metrics) || { row: 0, col: 0 };
      item.row = pos.row;
      item.col = pos.col;
    });

    if (resetSavedModes) {
      this.positionsByMode = { portrait: {}, landscape: {} };
    }

    this._updatePageCount();
    this._savePositionsForMode();
    this._save();
    this.notify();
  }

  /**
   * Stable default sorting for home screen resets.
   * Primary: item type, secondary: title/name, tertiary: id.
   */
  sortTopLevelByTypeAndName(options = {}) {
    if (!this.layout?.metrics) return;

    const { resetSavedModes = false } = options;
    const metrics = this.layout.metrics;
    const visible = this._getVisibleItems();
    const typePriority = new Map([
      ['app', 0],
      ['folder', 1],
      ['shortcut', 2],
      ['alias', 3],
      ['file', 4],
    ]);

    visible.sort((a, b) => {
      const ap = typePriority.has(a.type) ? typePriority.get(a.type) : Number.MAX_SAFE_INTEGER;
      const bp = typePriority.has(b.type) ? typePriority.get(b.type) : Number.MAX_SAFE_INTEGER;
      if (ap !== bp) return ap - bp;

      const at = String(a.title || a.name || a.id || '').toLocaleLowerCase();
      const bt = String(b.title || b.name || b.id || '').toLocaleLowerCase();
      const byTitle = at.localeCompare(bt, undefined, { numeric: true, sensitivity: 'base' });
      if (byTitle !== 0) return byTitle;

      return String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true, sensitivity: 'base' });
    });

    const ipp = metrics.itemsPerPage || MobileLayoutEngine.calcItemsPerPage(metrics.cols, metrics.rows);
    visible.forEach((item, index) => {
      item.page = Math.floor(index / ipp);
      const local = index % ipp;
      const pos = MobileLayoutEngine.slotToRowCol(local, metrics) || { row: 0, col: 0 };
      item.row = pos.row;
      item.col = pos.col;
    });

    if (resetSavedModes) {
      this.positionsByMode = { portrait: {}, landscape: {} };
    }

    this._updatePageCount();
    this._savePositionsForMode();
    this._save();
    this.notify();
  }

  // ─── Queries ────────────────────────────────────────────────

  findItemAt(page, row, col) {
    return this._findItemAt(page, row, col);
  }

  // ─── Private: Layout Algorithms ─────────────────────────────

  _findItemAt(page, row, col) {
    for (const item of this.items.values()) {
      if (item.page === page && item.row === row && item.col === col && !item.hidden && !item.parent) {
        return item;
      }
    }
    return null;
  }

  _getLayoutMode() {
    const m = this.layout?.metrics;
    if (!m) return 'portrait';
    return m.cols >= 6 ? 'landscape' : 'portrait';
  }

  /**
   * Restore saved positions for a given orientation mode.
   * Returns true if enough items were restored to consider it a success.
   */
  _restorePositionsForMode(mode) {
    const map = this.positionsByMode?.[mode];
    if (!map || Object.keys(map).length === 0) return false;

    const m = this.layout.metrics;
    const visible = this._getVisibleItems();

    // Check if we have enough saved positions
    let hits = 0;
    for (const it of visible) {
      if (map[it.id]) hits++;
    }
    if (hits < Math.max(2, Math.floor(visible.length * 0.5))) return false;

    const used = new Set();
    const assigned = new Set();

    // Phase 1: Assign saved positions
    for (const it of visible) {
      const p = map[it.id];
      if (!p) continue;
      const page = Number(p.page), row = Number(p.row), col = Number(p.col);
      if (!Number.isFinite(page) || !Number.isFinite(row) || !Number.isFinite(col)) continue;
      const maxCols = MobileLayoutEngine.colsForRow(row, m);
      if (row < 0 || col < 0 || row >= m.rows || col >= maxCols || page < 0) continue;

      const key = `${page}:${row}:${col}`;
      if (used.has(key)) continue;

      it.page = page;
      it.row = row;
      it.col = col;
      used.add(key);
      assigned.add(it.id);
    }

    // Phase 2: Place any unassigned items into first available slots
    const unassigned = visible.filter(it => !assigned.has(it.id));
    this._fillIntoEmptySlots(unassigned, used, m);

    this._updatePageCount();
    return true;
  }

  _savePositionsForMode() {
    if (!this.layout) return;
    const mode = this._getLayoutMode();
    const map = {};
    for (const it of this.items.values()) {
      if (!it.hidden && it.page >= 0) {
        map[it.id] = { page: it.page, row: it.row, col: it.col };
      }
    }
    this.positionsByMode[mode] = map;
  }

  /**
   * Reflow items when grid dimensions change and no saved positions exist.
   * Preserves relative ordering by sorting items by current position.
   */
  _reflowItems() {
    if (!this.layout) return;
    const m = this.layout.metrics;
    const visible = this._getVisibleItems();

    // Stable sort by current position
    visible.sort((a, b) => {
      if (a.page !== b.page) return (a.page ?? 0) - (b.page ?? 0);
      if (a.row !== b.row) return (a.row ?? 0) - (b.row ?? 0);
      if (a.col !== b.col) return (a.col ?? 0) - (b.col ?? 0);
      return String(a.id).localeCompare(String(b.id));
    });

    const ipp = m.itemsPerPage || MobileLayoutEngine.calcItemsPerPage(m.cols, m.rows);
    visible.forEach((item, index) => {
      item.page = Math.floor(index / ipp);
      const local = index % ipp;
      const pos = MobileLayoutEngine.slotToRowCol(local, m);
      if (pos) {
        item.row = pos.row;
        item.col = pos.col;
      } else {
        item.row = 0;
        item.col = 0;
      }
    });

    this._updatePageCount();
  }

  _layoutSequentially(apps) {
    const m = this.layout.metrics;
    const ipp = m.itemsPerPage || MobileLayoutEngine.calcItemsPerPage(m.cols, m.rows);

    apps.forEach((app, index) => {
      const page = Math.floor(index / ipp);
      const local = index % ipp;
      const pos = MobileLayoutEngine.slotToRowCol(local, m) || { row: 0, col: 0 };

      this.items.set(app.id, {
        id: app.id,
        type: app.type || 'app',
        title: app.name,
        icon: app.icon,
        url: app.url,
        scheme: app.scheme,
        parent: null,
        children: [],
        page,
        row: pos.row,
        col: pos.col,
        hidden: false,
      });
    });

    this.pageCount = Math.max(1, Math.ceil(apps.length / ipp));
  }

  /**
   * Place items with page === -1 (unpositioned) into the next available slots.
   */
  _placePending() {
    const m = this.layout?.metrics;
    if (!m) return;

    const pending = Array.from(this.items.values())
      .filter(it => it.page === -1 && !it.parent && !it.hidden);

    if (pending.length === 0) return;

    // Build occupancy set from currently-placed items
    const used = new Set();
    for (const it of this.items.values()) {
      if (it.page >= 0 && !it.hidden && !it.parent) {
        used.add(`${it.page}:${it.row}:${it.col}`);
      }
    }

    this._fillIntoEmptySlots(pending, used, m);
    this._updatePageCount();
  }

  /**
   * Fill items into the first available grid slots.
   * Mutates both the items and the used set.
   */
  _fillIntoEmptySlots(items, used, metrics) {
    const ipp = metrics.itemsPerPage || MobileLayoutEngine.calcItemsPerPage(metrics.cols, metrics.rows);
    let slotIndex = 0;
    for (const item of items) {
      while (true) {
        const page = Math.floor(slotIndex / ipp);
        const local = slotIndex % ipp;
        const pos = MobileLayoutEngine.slotToRowCol(local, metrics);
        slotIndex++;

        if (!pos) continue; // safety
        const key = `${page}:${pos.row}:${pos.col}`;
        if (!used.has(key)) {
          item.page = page;
          item.row = pos.row;
          item.col = pos.col;
          used.add(key);
          break;
        }
      }
    }
  }

  _getVisibleItems() {
    return Array.from(this.items.values()).filter(it => !it.hidden && !it.parent);
  }

  _updatePageCount() {
    let maxPage = 0;
    for (const it of this.items.values()) {
      if (it.page > maxPage && !it.hidden) maxPage = it.page;
    }
    this.pageCount = Math.max(1, maxPage + 1);
  }

  // ─── Private: Merge & Persistence ───────────────────────────

  _mergeItems(storedItems, currentApps) {
    const storedMap = new Map(storedItems.map(i => [i.id, i]));

    // 1. Native apps (always include, merge positions from storage)
    for (const app of currentApps) {
      const stored = storedMap.get(app.id);
      if (stored) {
        this.items.set(app.id, {
          ...stored,
          id: app.id,
          type: stored.type || 'app',
          title: app.name,
          icon: app.icon,
          url: app.url,
          scheme: app.scheme,
          parent: stored.parent || null,
          children: stored.children || [],
        });
      } else {
        this.items.set(app.id, {
          id: app.id,
          type: 'app',
          title: app.name,
          icon: app.icon,
          url: app.url,
          scheme: app.scheme,
          parent: null,
          children: [],
          page: -1, row: -1, col: -1,
          hidden: false,
        });
      }
    }

    // 2. Custom items from storage (shortcuts, folders, aliases)
    for (const item of storedItems) {
      if (this.items.has(item.id)) continue;

      const type = item.type ||
        (item.id.startsWith('shortcut-') ? 'shortcut' :
          item.id.startsWith('folder-') ? 'folder' :
            item.id.startsWith('alias-') ? 'alias' : 'app');

      this.items.set(item.id, {
        id: item.id,
        type,
        title: item.title || item.id,
        icon: item.icon || '🌍',
        url: item.url,
        scheme: item.scheme,
        parent: item.parent || null,
        children: Array.isArray(item.children) ? item.children.slice() : [],
        targetId: item.targetId,
        targetType: item.targetType,
        page: item.page ?? -1,
        row: item.row ?? -1,
        col: item.col ?? -1,
        hidden: !!item.hidden,
      });
    }

    // 3. Place any unpositioned top-level items
    this._placePending();
  }

  _save() {
    try {
      const items = Array.from(this.items.values()).map(i => ({
        id: i.id, type: i.type, title: i.title, icon: i.icon,
        url: i.url, scheme: i.scheme, hidden: !!i.hidden,
        parent: i.parent, children: i.children,
        targetId: i.targetId, targetType: i.targetType,
        page: i.page, row: i.row, col: i.col,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        items,
        positionsByMode: this.positionsByMode,
      }));
    } catch (e) {
      console.error('[GridState] Save failed:', e);
    }
  }

  _loadFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  _extractStoredItems(stored) {
    if (!stored) return null;
    if (Array.isArray(stored)) return stored;
    if (Array.isArray(stored.items)) return stored.items;
    return null;
  }
}
