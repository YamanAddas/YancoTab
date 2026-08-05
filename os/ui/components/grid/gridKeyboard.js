/**
 * grid/gridKeyboard.js — the app grid, reachable without a pointer.
 *
 * The grid was built pointer-first: icons are plain `<div class="app-icon">`
 * positioned by transform, with launching handled entirely by
 * MobileInteractionV2's pointer pipeline. Nothing was focusable, nothing
 * announced, and Tab walked straight past all 22 apps to the dock.
 *
 * ── Why a roving tabindex, not `tabindex="0"` on every icon ──
 *
 * 22 tab stops between the search bar and the dock is technically
 * accessible and practically unusable. The grid is a two-dimensional
 * composite widget, so it takes ONE tab stop and the arrows move within it
 * — the same contract as a toolbar or a menubar.
 *
 * ── Why Enter dispatches `item:click` ──
 *
 * Because that is exactly what a tap dispatches. Folders, user shortcuts
 * with their own URL re-validation, and apps all diverge inside
 * AppGrid.openApp; a second launch path is a second place for that to
 * drift out of step.
 *
 * The movement arithmetic lives in gridNav.js so it can be tested without
 * a DOM. This file is the adapter: read state, apply focus.
 */

import { nextFocusId, pageItems, NAV_KEYS, ACTIVATE_KEYS } from './gridNav.js';

export class GridKeyboard {
  constructor(grid) {
    this.grid = grid;
    this.activeId = null;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onFocusIn = this._onFocusIn.bind(this);
  }

  attach() {
    this.grid.root.addEventListener('keydown', this._onKeyDown);
    // A pointer user who clicks an icon and then reaches for the keyboard
    // should continue from there, not from wherever the tab stop was parked.
    this.grid.root.addEventListener('focusin', this._onFocusIn);
    this.grid.root.setAttribute('role', 'group');
    this.grid.root.setAttribute('aria-label', 'Apps');
  }

  destroy() {
    this.grid.root.removeEventListener('keydown', this._onKeyDown);
    this.grid.root.removeEventListener('focusin', this._onFocusIn);
  }

  _page() { return this.grid.interaction?.currentPage | 0; }
  _pageCount() { return Math.max(1, this.grid.state?.pageCount || 1); }
  _items() { return this.grid.state?.items; }

  _nodeFor(id) {
    if (!id) return null;
    const safe = window.CSS?.escape ? CSS.escape(id) : id;
    return this.grid.pagesContainer.querySelector(`.app-icon[data-id="${safe}"]`);
  }

  /**
   * Re-apply focus bookkeeping after a render.
   *
   * Runs on every render because AppGrid reuses nodes but creates new ones
   * freely, and a fresh node with no tabindex is invisible to the keyboard.
   * One attribute write per icon; cheap enough to be unconditional.
   */
  sync() {
    const nodes = this.grid.pagesContainer.querySelectorAll('.app-icon');
    if (!nodes.length) return;

    const items = this._items();
    const here = pageItems(items, this._page());
    if (!here.some((i) => i.id === this.activeId)) {
      this.activeId = here[0]?.id || null;
    }

    for (const node of nodes) {
      node.tabIndex = node.dataset.id === this.activeId ? 0 : -1;
      if (!node.hasAttribute('role')) node.setAttribute('role', 'button');
      const item = items?.get?.(node.dataset.id);
      if (!item) continue;
      // Folders say so: "Games" alone gives no clue that activating it
      // opens a container rather than launching something.
      const label = item.type === 'folder' ? `${item.title}, folder` : item.title;
      if (node.getAttribute('aria-label') !== label) node.setAttribute('aria-label', label);
    }
  }

  /** Move the roving stop to `id`, following it across pages. */
  focusItem(id, { focus = true } = {}) {
    const item = this._items()?.get?.(id);
    if (!item) return false;
    this.activeId = id;
    if ((item.page | 0) !== this._page()) this.grid.setActivePage(item.page | 0);
    this.sync();
    if (focus) this._nodeFor(id)?.focus();
    return true;
  }

  _onFocusIn(e) {
    const node = e.target?.closest?.('.app-icon');
    if (node?.dataset.id && node.dataset.id !== this.activeId) {
      this.activeId = node.dataset.id;
      this.sync();
    }
  }

  _onKeyDown(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    // Only when focus is genuinely on an icon. The grid root also holds the
    // page dots, and a stray Space there must keep doing whatever it did.
    const node = e.target?.closest?.('.app-icon');
    if (!node) return;

    if (ACTIVATE_KEYS.has(e.key)) {
      e.preventDefault();
      this.grid.root.dispatchEvent(new CustomEvent('item:click', {
        detail: node.dataset.id, bubbles: true,
      }));
      return;
    }
    if (!NAV_KEYS.has(e.key)) return;

    const next = nextFocusId({
      items: this._items(),
      page: this._page(),
      pageCount: this._pageCount(),
      activeId: this.activeId,
      key: e.key,
    });
    if (!next) return;
    e.preventDefault();
    this.focusItem(next);
  }
}
