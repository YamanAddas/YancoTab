/*
 * FolderOverlay.js
 *
 * This component renders a full‑screen overlay listing the children of a
 * folder item. It uses EVENT DELEGATION for robust touch/mouse handling.
 */

import { kernel } from '../../kernel.js';
import { el } from '../../utils/dom.js';
import { SmartIcon } from '../desktop/SmartIcon.js';

export class FolderOverlay {
  constructor(appGrid, folder) {
    this.appGrid = appGrid;
    this.folder = folder;
    this.overlay = null;
    this.handleKey = this.handleKey.bind(this);

    // Drag State
    this._dragState = {
      active: false,
      itemWrapper: null,
      itemId: null,
      startX: 0,
      startY: 0,
      ghost: null,
      hasMoved: false
    };

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
  }

  show() {
    if (this.overlay) return;

    // Announced as a modal dialog. It covers the whole screen and Escape
    // already closes it, so the only thing missing was saying so — without
    // aria-modal a screen reader keeps offering the desktop underneath,
    // which is exactly the confusion Focus Mode's overlay had in 1.6.0.
    this.overlay = el('div', {
      class: 'folder-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': `${this.folder.title || 'Folder'} folder`,
    });
    this._lastFocus = document.activeElement;
    // Prevent native browser context menu inside the folder overlay (desktop) and route to OS menu
    this.overlay.addEventListener('contextmenu', this._onContextMenu, true);
    this.overlay.addEventListener('click', (e) => {
      // Background dismiss
      if (e.target === this.overlay) this.hide();
    });

    const container = el('div', { class: 'folder-overlay-container' });

    // Header
    const header = el('div', { class: 'folder-overlay-header' });
    const titleInput = el('input', {
      class: 'folder-title-input',
      value: this.folder.title || 'Folder',
      spellcheck: false,
      // Its visible text is the folder's own name, so with no label it
      // announces as "Games, edit text" — indistinguishable from a
      // heading that happens to be focusable.
      'aria-label': 'Folder name',
    });
    titleInput.addEventListener('blur', () => this._saveTitle(titleInput.value));
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this._saveTitle(titleInput.value);
        titleInput.blur();
        this.hide();
      }
    });

    header.appendChild(titleInput);
    container.appendChild(header);

    // Grid
    const grid = el('div', { class: 'folder-overlay-grid' });
    // IMPORTANT: Event Delegation on the Grid
    grid.style.touchAction = 'none'; // Prevent browser scrolling
    grid.addEventListener('pointerdown', this._onPointerDown);
    // Note: We attach move/up to window during drag, but basic monitoring can be here.

    const stateItems = this.appGrid.state.items;
    if (Array.isArray(this.folder.children)) {
      this.folder.children.forEach(childId => {
        const child = stateItems.get(childId);
        if (!child) return;

        const icon = new SmartIcon(child.id, {
          name: child.title,
          icon: child.icon
        }).render();

        const itemWrapper = el('div', {
          class: 'folder-item-wrapper',
          'data-id': child.id,
          role: 'button',
          tabindex: '0',
          'aria-label': child.title,
        });
        // Enter/Space route through the same _handleItemClick a tap ends
        // at, so URL shortcuts keep their validation and the overlay still
        // closes behind the launch.
        itemWrapper.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
          e.preventDefault();
          this._handleItemClick(child.id);
        });

        // Disable internal pointer events effectively
        icon.style.pointerEvents = 'none';

        const label = el('div', {
          class: 'folder-item-label',
          style: 'pointer-events: none;'
        }, child.title);

        itemWrapper.appendChild(icon);
        itemWrapper.appendChild(label);
        grid.appendChild(itemWrapper);
      });
    }

    container.appendChild(grid);
    this.overlay.appendChild(container);
    document.body.appendChild(this.overlay);

    requestAnimationFrame(() => {
      this.overlay.classList.add('is-visible');
      // Anchor focus inside the dialog. Without this, Tab from an overlay
      // opened by keyboard walks the desktop hidden behind it and launches
      // things sight-unseen — the same defect Focus Mode had.
      (grid.querySelector('.folder-item-wrapper') || titleInput)?.focus();
    });

    document.addEventListener('keydown', this.handleKey);
  }

  _onPointerDown(e) {
    if (e.button !== 0 && e.button !== undefined) return;

    // Hit test
    const wrapper = e.target.closest('.folder-item-wrapper');
    if (!wrapper) return;

    // Start tracking
    this._dragState = {
      active: true,
      itemWrapper: wrapper,
      itemId: wrapper.dataset.id,
      startX: e.clientX,
      startY: e.clientY,
      ghost: null,
      hasMoved: false,
      containerRect: this.overlay.querySelector('.folder-overlay-container').getBoundingClientRect()
    };

    // Add temporary window listeners
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);

    // Press feedback
    wrapper.style.transform = 'scale(0.95)';
    wrapper.style.transition = 'transform 0.1s';
  }

  _onPointerMove(e) {
    if (!this._dragState.active) return;

    const { startX, startY, hasMoved, itemWrapper } = this._dragState;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Threshold check
    if (!hasMoved && Math.hypot(dx, dy) > 8) {
      this._dragState.hasMoved = true;
      this._startVisualDrag(itemWrapper, e.clientX, e.clientY);
    }

    if (this._dragState.hasMoved && this._dragState.ghost) {
      // Move Ghost
      const ghost = this._dragState.ghost;
      const offset = this._dragState.ghostOffset;
      const x = e.clientX - offset.x;
      const y = e.clientY - offset.y;
      ghost.style.transform = `translate(${x}px, ${y}px)`;

      // Exit Check
      this._checkExit(e);
      // Reorder Check
      this._checkReorder(e);
    }
  }

  _onPointerUp(e) {
    if (!this._dragState.active) return;

    const { hasMoved, itemWrapper, itemId } = this._dragState;

    // Cleanup listeners
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);

    // Reset visual
    if (itemWrapper) {
      itemWrapper.style.transform = '';
      itemWrapper.style.opacity = '';
    }

    if (hasMoved) {
      // Drag End
      this._endVisualDrag();
    } else {
      // Logic: It was a CLICK
      // We manually implement click because we might have prevented default behavior
      this._handleItemClick(itemId);
    }

    this._dragState.active = false;
    this._dragState.itemWrapper = null;
  }

  _handleItemClick(id) {
    const item = this.appGrid.state.items.get(id);
    if (!item) return;

    if (item.url && item.url.startsWith('http')) {
      window.open(item.url, '_blank', 'noopener');
    } else {
      kernel.emit('app:open', item.id);
    }
    this.hide();
  }

  _startVisualDrag(el, clientX, clientY) {
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);

    Object.assign(ghost.style, {
      position: 'fixed',
      top: '0', left: '0',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transform: `translate(${rect.left}px, ${rect.top}px)`,
      zIndex: '100001',
      pointerEvents: 'none',
      opacity: '0.9',
      margin: 0
    });

    document.body.appendChild(ghost);
    this._dragState.ghost = ghost;
    this._dragState.ghostOffset = { x: clientX - rect.left, y: clientY - rect.top };

    el.style.opacity = '0.01';
    el.style.pointerEvents = 'none'; // Allow hit-testing through the placeholder
  }

  _endVisualDrag() {
    if (this._dragState.ghost) {
      this._dragState.ghost.remove();
      this._dragState.ghost = null;
    }
    // Restore source
    if (this._dragState.itemWrapper) {
      this._dragState.itemWrapper.style.pointerEvents = '';
    }
  }

  _checkExit(e) {
    const rect = this._dragState.containerRect;
    const buff = 50;
    const isOutside = (
      e.clientX < rect.left - buff ||
      e.clientX > rect.right + buff ||
      e.clientY < rect.top - buff ||
      e.clientY > rect.bottom + buff
    );

    if (isOutside) {
      // Exit logic
      this._endVisualDrag();
      // Stop tracking immediately
      this._dragState.active = false;
      window.removeEventListener('pointermove', this._onPointerMove);
      window.removeEventListener('pointerup', this._onPointerUp);

      const id = this._dragState.itemId;
      this.appGrid.state.removeChildFromFolder(id);
      this.hide();
      this.appGrid.interaction.startDragFromExternal(id, e.pointerId, e.clientX, e.clientY);
    }
  }

  _checkReorder(e) {
    const grid = this.overlay.querySelector('.folder-overlay-grid');
    // We do NOT hide the itemWrapper (display:none) because that causes layout thrashing.
    // The source wrapper already has pointer-events: none set in _startVisualDrag/style

    // We need to look through the ghost (pointer-events: none) and the source placeholder
    const targetEl = document.elementFromPoint(e.clientX, e.clientY);

    const targetWrapper = targetEl?.closest('.folder-item-wrapper');
    const sourceWrapper = this._dragState.itemWrapper;

    if (targetWrapper && targetWrapper !== sourceWrapper && grid.contains(targetWrapper)) {
      // Swap Logic
      const children = Array.from(grid.children);
      const fromIndex = children.indexOf(sourceWrapper);
      const toIndex = children.indexOf(targetWrapper);

      if (fromIndex !== -1 && toIndex !== -1) {
        // State Swap
        const item = this.folder.children.splice(fromIndex, 1)[0];
        this.folder.children.splice(toIndex, 0, item);
        this.appGrid.state._save();

        // DOM Swap
        if (fromIndex < toIndex) {
          grid.insertBefore(sourceWrapper, targetWrapper.nextSibling);
        } else {
          grid.insertBefore(sourceWrapper, targetWrapper);
        }
      }
    }
  }

  _onContextMenu(e) {
    // Desktop/right-click: show OS context menu instead of the browser menu
    try { if (e && e.cancelable) e.preventDefault(); } catch (err) { /* best-effort */ }
    try { if (e) e.stopPropagation(); } catch (err) { /* best-effort */ }
    const x = (e && typeof e.clientX === 'number') ? e.clientX : 0;
    const y = (e && typeof e.clientY === 'number') ? e.clientY : 0;
    const t = e && e.target && e.target.closest ? e.target : null;
    const wrapper = t && t.closest ? t.closest('.folder-item-wrapper') : null;
    if (wrapper && wrapper.dataset && wrapper.dataset.id) {
      const id = wrapper.dataset.id;
      // Reuse the grid's context menu pipeline so options match everywhere
      this.appGrid.root.dispatchEvent(new CustomEvent('item:context-menu', {
        detail: { id: id, title: '', icon: '', x: x, y: y }, bubbles: true
      }));
    } else {
      this.appGrid.root.dispatchEvent(new CustomEvent('grid:context-menu', {
        detail: { type: 'grid', x: x, y: y }, bubbles: true
      }));
    }
  }

  _saveTitle(newTitle) {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed === this.folder.title) return;
    this.folder.title = trimmed;
    this.appGrid.state._save();
    this.appGrid.state.notify();
  }

  /** Keep Tab inside the dialog — see the focus note in show(). */
  _trapTab(e) {
    const focusables = Array.from(
      this.overlay.querySelectorAll('.folder-item-wrapper, .folder-title-input'),
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !this.overlay.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  hide() {
    if (!this.overlay) return;
    document.removeEventListener('keydown', this.handleKey);
    // Return focus to whatever opened the folder, so Escape does not dump
    // the user back at the top of the document.
    try { this._lastFocus?.focus?.(); } catch { /* element may be gone */ }
    try { if (this.overlay) this.overlay.removeEventListener('contextmenu', this._onContextMenu, true); } catch (err) { /* best-effort */ }
    this.overlay.classList.remove('is-visible');
    setTimeout(() => {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
    }, 300);
  }

  handleKey(e) {
    if (e.key === 'Escape') { this.hide(); return; }
    if (e.key === 'Tab' && this.overlay) this._trapTab(e);
  }
}