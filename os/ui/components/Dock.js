/**
 * Dock.js — v0.7
 *
 * v0.7 fixes:
 *   - Reorder tolerance: generous vertical zone (±60px) keeps items in dock
 *     during left/right reorder gestures. Items only leave dock when dragged
 *     clearly above the dock zone.
 *   - Smoother reorder with visual feedback (translate animation on siblings)
 */

import { el } from '../../utils/dom.js';
import { SmartIcon } from '../desktop/SmartIcon.js';

const DOCK_STORAGE_KEY = 'yancotab_dock_items';
const DEFAULT_DOCK_IDS = ['browser', 'files', 'settings', 'notes'];

export class Dock {
  constructor() {
    this.root = el('div', { class: 'mobile-dock m-dock', 'aria-label': 'Dock' });
    this.root.style.touchAction = 'none';
    this.root.style.userSelect = 'none';
    this.root.style.webkitUserSelect = 'none';
    this.items = [];
    this.allItems = [];
    this.eventTarget = window;
  }

  setEventTarget(target) { this.eventTarget = target || window; }

  setItems(allItems) {
    this.allItems = Array.isArray(allItems) ? allItems : [];
    this.items = this._loadItems();
    this._render();
  }

  hasItem(id) { return this.items.some(it => it.id === id); }

  addItem(id) {
    if (!id || this.hasItem(id)) return false;
    const item = this.allItems.find(it => it.id === id);
    if (!item) return false;
    this.items.push(item);
    this._saveItems();
    this._render();
    return true;
  }

  removeItem(id) {
    const prev = this.items.length;
    this.items = this.items.filter(it => it.id !== id);
    if (this.items.length !== prev) { this._saveItems(); this._render(); return true; }
    return false;
  }

  render() { return this.root; }

  // ─── Private: Rendering ─────────────────────────────────────

  _render() {
    this.root.innerHTML = '';
    if (!this.items.length) {
      this.root.appendChild(el('div', { class: 'm-dock-empty' }));
      return;
    }
    for (const item of this.items) {
      let metadata = { name: item.name, icon: item.icon, badge: null, type: item.type };

      // Resolve children for folders
      if (item.type === 'folder' && Array.isArray(item.children)) {
        metadata.children = item.children.map(cid => this.allItems.find(it => it.id === cid)).filter(Boolean);
      }

      const smartIcon = new SmartIcon(item.id, metadata);
      const iconNode = smartIcon.render();
      const dockItem = el('div', { class: 'm-dock-item', 'data-id': item.id });
      dockItem.style.touchAction = 'none';
      dockItem.style.userSelect = 'none';
      dockItem.style.webkitUserSelect = 'none';
      dockItem.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
      dockItem.appendChild(iconNode);
      this._bindPointer(dockItem, item);
      this.root.appendChild(dockItem);
    }
  }

  // ─── Per-Icon Pointer Handler ───────────────────────────────

  _bindPointer(dockItem, item) {
    let active = false;
    let isDragging = false;
    let longPressTriggered = false;
    let startX = 0, startY = 0;
    let downTime = 0;
    let lastX = 0, lastY = 0;
    let pointerId = null;
    let lpTimer = null;
    let dragArmTimer = null;
    let ghost = null;
    let ghostX = 0, ghostY = 0;
    let ghostTargetX = 0, ghostTargetY = 0;
    let ghostRAF = 0;
    let currentIndex = -1;

    // Desktop right-click context menu
    try {
      dockItem.addEventListener('contextmenu', (ev) => {
        try { if (ev && ev.cancelable) ev.preventDefault(); } catch (err) { }
        try { if (ev) ev.stopPropagation(); } catch (err) { }
        longPressTriggered = true;
        this._showContextMenu(item, (typeof ev.clientX === 'number') ? ev.clientX : startX, (typeof ev.clientY === 'number') ? ev.clientY : startY);
        return false;
      }, { capture: true });
    } catch (err) { }

    const clearLP = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } if (dragArmTimer) { clearTimeout(dragArmTimer); dragArmTimer = null; } };
    const cleanGhost = () => {
      if (ghostRAF) { cancelAnimationFrame(ghostRAF); ghostRAF = 0; }
      if (ghost) { ghost.remove(); ghost = null; }
    };
    const resetStyles = () => { dockItem.style.transform = ''; dockItem.style.opacity = '1'; };

    let finish = (finalX, finalY, { allowUndock }) => {
      const dockRect = this.root.getBoundingClientRect();

      // Items stay in dock unless user drags clearly ABOVE the dock zone.
      // Use the last known pointer position (lostpointercapture can report 0,0 on some browsers).
      const clearlyAboveDock = finalY < (dockRect.top - 60);

      cleanGhost();
      resetStyles();
      try { document.body.classList.remove('is-dragging'); } catch { }

      if (isDragging) {
        if (allowUndock && clearlyAboveDock) {
          // User intentionally pulled item up out of dock → move to grid
          this._moveToGrid(item, finalX, finalY);
        } else {
          // Stay in dock — just save the new order
          this._saveItems();
          this._render(); // clean up any visual artifacts
        }
      } else if (!longPressTriggered) {
        this._openItem(item);
      }
    };

    let cancel = () => {
      clearLP();
      cleanGhost();
      resetStyles();
      active = false;
      isDragging = false;
      longPressTriggered = false;
      pointerId = null;
    };

    const onDown = (e) => {
      // Desktop mouse: ignore right-click here (handled by contextmenu)
      try { if (e && e.pointerType === 'mouse' && typeof e.button === 'number' && e.button !== 0) return; } catch (err) { }
      if (!e.isPrimary || active) return;
      if (e.cancelable) e.preventDefault();
      active = true;
      isDragging = false;
      longPressTriggered = false;
      startX = e.clientX;
      startY = e.clientY;
      downTime = performance.now();
      lastX = e.clientX;
      lastY = e.clientY;
      pointerId = e.pointerId;
      currentIndex = this.items.findIndex(it => it.id === item.id);

      // Set pointer capture BEFORE timers (iOS fix)
      try {
        dockItem.setPointerCapture(e.pointerId);
        // Force immediate capture acknowledgment (iOS WebKit fix)
        dockItem.getBoundingClientRect();
      } catch { }
      try { dockItem.style.touchAction = 'none'; } catch { }
      try { dockItem.style.userSelect = 'none'; dockItem.style.webkitUserSelect = 'none'; } catch { }
      dockItem.style.transform = 'scale(0.96)';

      // Arm timer: after 150ms of sustained press WITH any movement, start drag.
      // If the finger hasn't moved at all, this is likely a long-press → skip.
      // iOS WebKit sometimes underreports movement, so threshold is very low (1px).
      if (dragArmTimer) { clearTimeout(dragArmTimer); dragArmTimer = null; }
      dragArmTimer = setTimeout(() => {
        if (!active || isDragging || longPressTriggered) return;
        const armDist = Math.hypot(lastX - startX, lastY - startY);
        if (armDist >= 1) {
          // Finger moved: this is a drag attempt
          isDragging = true;
          clearLP();
          startDragVisuals(lastX, lastY);
        }
        // If armDist < 1: finger stationary → let long-press timer handle it
      }, 150);

      lpTimer = setTimeout(() => {
        if (!active || isDragging) return;
        longPressTriggered = true;
        if (navigator.vibrate) navigator.vibrate(40);
        this._showContextMenu(item, startX, startY);
      }, 520);
    };

    const startDragVisuals = (clientX, clientY) => {
      if (!active) return;
      try { document.body.classList.add('is-dragging'); } catch { }

      // Get actual dock icon size from CSS variable
      const iconSize = parseInt(getComputedStyle(dockItem).width) || 56;
      const halfIcon = Math.round(iconSize / 2);

      // Visual ghost that follows the finger; keep the original node in the dock
      ghost = dockItem.cloneNode(true);
      Object.assign(ghost.style, {
        position: 'fixed', left: `${clientX - halfIcon}px`, top: `${clientY - halfIcon}px`,
        width: `${iconSize}px`, height: `${iconSize}px`, zIndex: '9999',
        pointerEvents: 'none', opacity: '0.85', transform: 'scale(1.05)',
      });
      document.body.appendChild(ghost);

      // Smooth ghost follow (ease) for a more "native" feel.
      ghostX = clientX - halfIcon;
      ghostY = clientY - halfIcon;
      ghostTargetX = ghostX;
      ghostTargetY = ghostY;
      const tick = () => {
        if (!active || !ghost) { ghostRAF = 0; return; }
        // critically damped-ish easing
        ghostX += (ghostTargetX - ghostX) * 0.35;
        ghostY += (ghostTargetY - ghostY) * 0.35;
        ghost.style.left = `${ghostX}px`;
        ghost.style.top = `${ghostY}px`;
        ghostRAF = requestAnimationFrame(tick);
      };
      ghostRAF = requestAnimationFrame(tick);

      // Hide the real node but keep its slot so reorder can work
      dockItem.style.opacity = '0';
      dockItem.style.transform = '';
    };

    const onMove = (e) => {
      if (!active || e.pointerId !== pointerId) return;
      if (e.cancelable) e.preventDefault();
      if (longPressTriggered) return;

      lastX = e.clientX;
      lastY = e.clientY;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const dist = Math.hypot(dx, dy);

      // More lenient: very low distance threshold for iOS WebKit reliability
      if (!isDragging && dist > 2) {
        clearLP();
        isDragging = true;
        startDragVisuals(e.clientX, e.clientY);
      }

      if (isDragging && ghost) {
        const halfIcon = Math.round((parseInt(getComputedStyle(dockItem).width) || 56) / 2);
        ghostTargetX = e.clientX - halfIcon;
        ghostTargetY = e.clientY - halfIcon;

        // Reorder within dock if pointer is near the dock
        this._tryReorder(dockItem, e.clientX, e.clientY, currentIndex, (newIdx) => {
          currentIndex = newIdx;
        });
      }
    };

    const onUp = (e) => {
      if (!active || e.pointerId !== pointerId) return;
      if (e.cancelable) e.preventDefault();
      clearLP();
      try { dockItem.releasePointerCapture(e.pointerId); } catch { }

      // Use lastX/lastY because pointerup can fire with stale coords on some browsers
      lastX = e.clientX || lastX;
      lastY = e.clientY || lastY;

      if (longPressTriggered) {
        cleanGhost();
        resetStyles();
      } else {
        finish(lastX, lastY, { allowUndock: true });
      }

      active = false;
      isDragging = false;
      longPressTriggered = false;
      pointerId = null;
    };

    const onCancel = (e) => {
      // Pointercancel / lostpointercapture should NEVER undock.
      // Some browsers emit lostpointercapture with (0,0) coordinates.
      if (!active) return;
      if (e?.pointerId != null && e.pointerId !== pointerId) return;

      // During a drag, iOS WebKit may emit lostpointercapture.
      // We *ignore* it here; we no longer reorder by moving DOM nodes,
      // so capture loss should be rare and canceling would be worse.
      if (isDragging && e?.type === 'lostpointercapture') {
        return;
      }

      if (e?.cancelable) e.preventDefault();
      cancel();
      try { document.body.classList.remove('is-dragging'); } catch { }
    };

    dockItem.addEventListener('pointerdown', onDown, { passive: false });
    dockItem.addEventListener('pointermove', onMove, { passive: false });
    dockItem.addEventListener('pointerup', onUp, { passive: false });
    dockItem.addEventListener('pointercancel', onCancel, { passive: false });
    dockItem.addEventListener('lostpointercapture', onCancel, { passive: false });

  }

  /**

   * Reorder dock items while dragging.
   * v0.7: expanded vertical tolerance to ±60px so horizontal reorder works even
   * if the finger drifts slightly above/below the dock bar.
   */
  _tryReorder(dragItem, clientX, clientY, fromIndex, setIndex) {
    const dockRect = this.root.getBoundingClientRect();
    const nearDock = clientY >= (dockRect.top - 60) && clientY <= (dockRect.bottom + 60);
    if (!nearDock) return;

    const children = Array.from(this.root.querySelectorAll('.m-dock-item'));
    // FLIP animation for smooth "native" reordering without moving DOM nodes.
    // Moving DOM nodes (insertBefore) can trigger lostpointercapture on iOS WebKit,
    // which can kill drags or crash under heavy interaction. We reorder using flex
    // `order` instead, and only re-render on drop.

    const first = new Map();
    for (const c of children) first.set(c, c.getBoundingClientRect());

    // Determine visual order by current positions.
    const ordered = children.slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

    let targetIndex = ordered.length - 1;
    for (let i = 0; i < ordered.length; i++) {
      const r = ordered[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) { targetIndex = i; break; }
    }

    if (fromIndex >= 0 && targetIndex !== fromIndex && targetIndex >= 0 && targetIndex < this.items.length) {
      const [moved] = this.items.splice(fromIndex, 1);
      this.items.splice(targetIndex, 0, moved);
      setIndex(targetIndex);

      // Apply flex order to match this.items
      for (const c of children) {
        const id = c.getAttribute('data-id');
        const idx = this.items.findIndex(it => it.id === id);
        if (idx >= 0) c.style.order = String(idx);
      }

      // Animate siblings into their new positions.
      const after = children.slice();
      for (const c of after) {
        if (c === dragItem) continue;
        const f = first.get(c);
        if (!f) continue;
        const last = c.getBoundingClientRect();
        const dx = f.left - last.left;
        if (Math.abs(dx) < 0.5) continue;
        c.style.transition = 'none';
        c.style.transform = `translate3d(${dx}px, 0, 0)`;
        c.getBoundingClientRect(); // reflow
        requestAnimationFrame(() => {
          c.style.transition = 'transform 0.2s ease';
          c.style.transform = '';
        });
      }
    }

  }

  // ─── Actions ────────────────────────────────────────────────

  _showContextMenu(item, x, y) {
    const detail = {
      id: item.id, title: item.name, icon: item.icon, x, y,
      type: 'dock', itemType: item.type,
    };
    try {
      this.eventTarget.dispatchEvent(new CustomEvent('item:context-menu', { detail, bubbles: false }));
    } catch {
      window.dispatchEvent(new CustomEvent('item:context-menu', { detail }));
    }
  }

  _openItem(item) { window.dispatchEvent(new CustomEvent('item:open', { detail: item })); }

  _moveToGrid(item, x, y) {
    window.dispatchEvent(new CustomEvent('dock:item-drop-to-grid', {
      detail: { id: item.id, clientX: x, clientY: y },
    }));
  }

  // ─── Persistence ────────────────────────────────────────────

  _loadItems() {
    try {
      const stored = localStorage.getItem(DOCK_STORAGE_KEY);
      if (stored) {
        const ids = JSON.parse(stored);
        return ids.map(id => {
          const item = this.allItems.find(it => it.id === id);
          if (item && !item.type) item.type = 'app';
          return item;
        }).filter(Boolean);
      }
    } catch (e) { console.warn('[Dock] Load error:', e); }
    return DEFAULT_DOCK_IDS.map(id => this.allItems.find(it => it.id === id)).filter(Boolean);
  }

  _saveItems() {
    try { localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(this.items.map(it => it.id))); }
    catch (e) { console.error('[Dock] Save error:', e); }
  }
}
