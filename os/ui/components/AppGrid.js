/**
 * AppGrid.js — v0.6.1
 *
 * View/Renderer layer for the mobile desktop grid.
 * Receives state changes from MobileGridState, renders icons,
 * and wires up MobileInteraction events.
 *
 * Fixed bugs from v0.6:
 *   - getDropLocationFromClient now uses this.currentLayout (was this.layout)
 *   - Dropped items use CSS class toggle instead of fragile droppedId hack
 *   - Node reuse via Map for stable DOM references
 *   - Proper layout initialization in setApps
 */

import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';
import { MobileLayoutEngine } from './MobileLayoutEngineV2.js';
import { MobileInteraction } from './MobileInteractionV2.js';
import { MobileContextMenu } from './MobileContextMenu.js';
import { MobileGridState } from './MobileGridState.js';
import { SmartIcon } from '../desktop/SmartIcon.js';
import { FolderIcon } from './FolderIcon.js';
import { FolderOverlay } from './FolderOverlay.js';

export class AppGrid {
  constructor() {
    this.root = el('div', { class: 'm-grid-container' });
    this.pagesContainer = el('div', { class: 'm-grid-pages' });
    this.dotsContainer = el('div', { class: 'm-grid-dots' });

    this.root.appendChild(this.pagesContainer);
    // Dots are mounted separately by the shell (grid has overflow:hidden)

    // Debug (disabled for production)
    this.debug = { log() { }, update() { }, error() { } };

    // Core modules
    this.layoutEngine = new MobileLayoutEngine();
    this.state = new MobileGridState();
    this.interaction = new MobileInteraction(this.root, this.layoutEngine, this.state, this.debug);
    this.contextMenu = new MobileContextMenu(this);

    // Layout reference (single source of truth for current metrics)
    this.currentLayout = null;

    // Counter for staggered icon entrance animation
    this._iconCounter = 0;

    // Bindings
    this.render = this.render.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.openApp = this.openApp.bind(this);
    this.startEditMode = this.startEditMode.bind(this);
    this._viewport = window.visualViewport || null;

    // Resize listeners
    window.addEventListener('resize', this.handleResize);
    this._viewport?.addEventListener('resize', this.handleResize);

    // State subscription
    this._unsubscribeState = this.state.subscribe(this.render);

    // ─── Interaction Events ─────────────────────────────────

    this.root.addEventListener('page:change', (e) => this.setActivePage(e.detail));

    this.root.addEventListener('scroll:update', (e) => {
      this.pagesContainer.style.transform = `translate3d(${e.detail}px, 0, 0)`;
    });

    this.root.addEventListener('scroll:animate', (e) => {
      this.pagesContainer.style.transition = 'transform 0.35s cubic-bezier(0.19, 1, 0.22, 1)';
      this.pagesContainer.style.transform = `translate3d(${e.detail}px, 0, 0)`;
      setTimeout(() => { this.pagesContainer.style.transition = ''; }, 350);
    });

    this.root.addEventListener('item:drop', (e) => {
      const { id, page, row, col } = e.detail;
      // Mark this item as "just dropped" so render skips transition
      this._justDroppedId = id;
      this.state.moveItemTo(id, page, row, col);
      requestAnimationFrame(() => { this._justDroppedId = null; });
    });

    this.root.addEventListener('item:folder-hover', (e) => {
      const { targetId } = e.detail;
      const el = this.pagesContainer.querySelector(`[data-id="${CSS?.escape ? CSS.escape(targetId) : targetId}"]`);
      if (el) el.classList.add('is-folder-target');
    });

    this.root.addEventListener('item:folder-hover-cancel', (e) => {
      const { targetId } = e.detail;
      const el = this.pagesContainer.querySelector(`[data-id="${CSS?.escape ? CSS.escape(targetId) : targetId}"]`);
      if (el) el.classList.remove('is-folder-target', 'is-folder-dwell-triggered');
    });

    this.root.addEventListener('item:folder-dwell', (e) => {
      const { targetId } = e.detail;
      const el = this.pagesContainer.querySelector(`[data-id="${CSS?.escape ? CSS.escape(targetId) : targetId}"]`);
      if (el) el.classList.add('is-folder-dwell-triggered');
    });

    this.root.addEventListener('item:drop-on-item', (e) => {
      const { sourceId, targetId } = e.detail;
      const target = this.state.items.get(targetId);
      if (!target) return;

      if (target.type === 'folder') {
        this.state.addChildToFolder(sourceId, targetId);
      } else {
        this.state.createFolderFromItems(sourceId, targetId, target.page, target.row, target.col);
      }
    });

    // Cancelled drag: ensure the item is visible and in consistent state
    this.root.addEventListener('item:drop-cancel', (e) => {
      const id = e?.detail?.id;
      if (!id) return;
      // Force re-render to restore any items that might have had their opacity set to 0
      requestAnimationFrame(() => {
        const el = this.pagesContainer.querySelector(`[data-id="${CSS?.escape ? CSS.escape(id) : id}"]`);
        if (el) el.style.opacity = '1';
      });
    });

    this.root.addEventListener('item:click', (e) => {
      this.openApp(e.detail);
    });

    // Context menu events
    this.root.addEventListener('item:context-menu', (e) => {
      this.contextMenu.show(e.detail, e.detail.x, e.detail.y);
    });

    this.root.addEventListener('grid:context-menu', (e) => {
      this.contextMenu.show(e.detail, e.detail.x, e.detail.y);
    });

    this.root.addEventListener('menu:hide', () => {
      this.contextMenu.hide();
    });

    // Edit mode
    this.root.addEventListener('edit:start', () => this.root.classList.add('is-edit-mode'));
    this.root.addEventListener('edit:end', () => this.root.classList.remove('is-edit-mode'));

    // Dots (initial)
    this.renderDots(1, 0);
    this._bindDotSwipe();
  }

  // ─── App Opening ────────────────────────────────────────────

  openApp(id) {
    const item = this.state.items.get(id);
    if (item && item.type === 'folder') {
      const overlay = new FolderOverlay(this, item);
      overlay.show();
    } else {
      kernel.emit('app:open', id);
    }
  }

  openUserApp(app) {
    try {
      const url = app?.url || app?.scheme || '';
      if (!url) return;
      if (url.startsWith('http')) {
        window.open(url, '_blank', 'noopener');
      } else {
        // Fallback for Maps if custom scheme fails (simple timer)
        if (url.includes('googlemaps') || url.includes('maps.apple.com')) {
          const start = Date.now();
          window.location.href = url;
          setTimeout(() => {
            if (Date.now() - start < 2000) {
              window.open('https://maps.google.com', '_blank');
            }
          }, 1500);
          return;
        }
        window.location.href = url;
      }
    } catch (e) {
      console.error('[AppGrid] openUserApp failed', e);
    }
  }

  openFile(file) {
    try {
      if (file?.url && typeof file.url === 'string') {
        window.open(file.url, '_blank', 'noopener');
        return;
      }
      kernel.emit('app:open', 'files');
    } catch (e) {
      console.error('[AppGrid] openFile failed', e);
      kernel.emit('app:open', 'files');
    }
  }

  startEditMode() {
    this.interaction.startEditMode();
  }

  removeApp(id) {
    this.state.removeApp(id);
  }

  // ─── Layout ─────────────────────────────────────────────────

  setApps(apps) {
    this._iconCounter = 0;
    this.updateLayoutMetrics();
    this.state.initialize(apps, this.currentLayout);

    // Register persisted shortcuts with kernel
    const shortcuts = Array.from(this.state.items.values())
      .filter(i => i.id.startsWith('shortcut-'));

    if (shortcuts.length > 0) {
      const kernelApps = kernel.getApps();
      const newApps = [...kernelApps];
      for (const s of shortcuts) {
        if (!newApps.find(ka => ka.id === s.id)) {
          newApps.push({ id: s.id, name: s.title, icon: s.icon, url: s.url, scheme: s.scheme });
        }
      }
      kernel.registerApps(newApps);
    }
  }

  updateLayoutMetrics() {
    const w = window.visualViewport?.width ?? window.innerWidth;
    const h = window.visualViewport?.height ?? window.innerHeight;
    const safeInsets = this._readSafeInsets();

    this.currentLayout = this.layoutEngine.calculateLayout(w, h, safeInsets);

    const g = this.currentLayout.gridArea;

    // Grid is in flow (not absolute) — just set dimensions
    this.root.style.width = `${g.width}px`;
    this.root.style.height = `${g.height}px`;

    this.interaction.layout = this.currentLayout;
  }

  _readSafeInsets() {
    const shell = document.querySelector('.mobile-shell');
    const shellStyle = shell ? getComputedStyle(shell) : null;
    const rootStyle = getComputedStyle(document.documentElement);

    const toPx = (value) => {
      const parsed = Number.parseFloat(value || '0');
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const pick = (paddingValue, rootVar) => {
      const fromPadding = toPx(paddingValue);
      if (fromPadding > 0) return fromPadding;
      return toPx(rootStyle.getPropertyValue(rootVar));
    };

    return {
      top: pick(shellStyle?.paddingTop, '--safe-area-top'),
      bottom: pick(shellStyle?.paddingBottom, '--safe-area-bottom'),
      left: pick(shellStyle?.paddingLeft, '--safe-area-left'),
      right: pick(shellStyle?.paddingRight, '--safe-area-right'),
    };
  }

  handleResize() {
    if (this._resizeTimer) clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(() => {
      this.updateLayoutMetrics();
      if (this.currentLayout) {
        this.state.updateLayout(this.currentLayout);
        this.interaction.layout = this.currentLayout;
        this.render(this.state);
      }
    }, 100);
  }

  destroy() {
    if (this._resizeTimer) clearTimeout(this._resizeTimer);
    window.removeEventListener('resize', this.handleResize);
    this._viewport?.removeEventListener('resize', this.handleResize);
    if (this._unsubscribeState) {
      this._unsubscribeState();
      this._unsubscribeState = null;
    }
    this.interaction?.destroy?.();
    this.contextMenu?.hide?.();
  }

  // ─── Render ─────────────────────────────────────────────────

  render(state) {
    const s = state?.items ? state : this.state;
    const rawItems = s.items || [];
    const itemsArray = Array.isArray(rawItems)
      ? rawItems
      : (rawItems instanceof Map ? Array.from(rawItems.values()) : []);

    const items = itemsArray.filter(item => !item.parent && !item.hidden);
    const pageCount = Math.max(s.pageCount || 1, this.interaction.currentPage + 1);
    const layout = this.currentLayout;
    if (!layout) return;

    // Sync pages container size
    this.pagesContainer.style.width = `${pageCount * layout.gridArea.width}px`;
    this.pagesContainer.style.height = `${layout.gridArea.height}px`;

    // Update dots
    this.renderDots(pageCount, this.interaction.currentPage);

    // Reuse existing DOM nodes
    const existingNodes = new Map();
    Array.from(this.pagesContainer.children).forEach(node => {
      if (node.dataset.id) existingNodes.set(node.dataset.id, node);
    });

    const activeIds = new Set();

    for (const item of items) {
      activeIds.add(item.id);
      let node = existingNodes.get(item.id);

      if (!node) {
        node = this._createItemNode(item);
        this.pagesContainer.appendChild(node);
      } else if (item.type === 'folder') {
        // Folders need icon refresh when children change (e.g., after seeding).
        // Check if the rendered child count differs from current state.
        const renderedChildCount = parseInt(node.dataset.childCount || '0', 10);
        const currentChildCount = Array.isArray(item.children) ? item.children.length : 0;
        if (renderedChildCount !== currentChildCount) {
          const newNode = this._createItemNode(item);
          node.replaceWith(newNode);
          node = newNode;
        }
      }

      const pos = this.layoutEngine.getCellPosition(
        item.page, item.row, item.col,
        layout.gridArea.width, layout,
      );

      if (pos) {
        // Skip transition for just-dropped items (instant snap)
        if (this._justDroppedId === item.id) {
          node.style.transition = 'none';
        } else {
          node.style.transition = 'transform 0.3s ease-out, width 0.3s ease-out, height 0.3s ease-out';
        }

        node.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
        node.style.opacity = '1';
        node.style.width = `${layout.metrics.cellWidth}px`;
        node.style.height = `${layout.metrics.cellHeight}px`;

        const icon = node.querySelector('.app-icon-inner');
        if (icon) {
          icon.style.transition = 'width 0.3s ease-out, height 0.3s ease-out';
          icon.style.width = `${layout.metrics.iconSize}px`;
          icon.style.height = `${layout.metrics.iconSize}px`;
        }

        // Always update label (for renames)
        const label = node.querySelector('.app-label');
        if (label && label.textContent !== item.title) {
          label.textContent = item.title;
        }
      }
    }

    // Remove stale nodes
    existingNodes.forEach((node, id) => {
      if (!activeIds.has(id)) node.remove();
    });
  }

  // ─── DOM Creation ───────────────────────────────────────────

  _createItemNode(item) {
    const div = el('div', {
      class: 'app-icon',
      'data-id': item.id,
      style: {
        position: 'absolute', top: 0, left: 0,
        width: '60px', height: '80px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        touchAction: 'none',
      },
    });

    // Stagger entrance animation via CSS custom property
    div.style.setProperty('--icon-i', String(this._iconCounter++));

    // Icon rendering
    let iconNode;
    if (item.type === 'folder') {
      const children = Array.isArray(item.children)
        ? item.children.map(cid => this.state.items.get(cid)).filter(Boolean)
        : [];
      const folderIcon = new FolderIcon(item, children);
      iconNode = folderIcon.render();
      // Track child count for stale-detection on re-render
      div.dataset.childCount = String(children.length);
    } else {
      const smartIcon = new SmartIcon(item.id, { name: item.title, icon: item.icon });
      iconNode = smartIcon.render();
    }

    iconNode.style.marginBottom = '6px';
    iconNode.classList.add('app-icon-inner');

    const label = el('div', {
      class: 'app-label',
      style: {
        fontSize: '10px', fontWeight: '500', color: 'rgba(200,220,240,0.5)',
        textAlign: 'center',
        textShadow: '0 1px 6px rgba(0,0,0,0.9)',
        letterSpacing: '0.3px',
        whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', maxWidth: '100%',
      },
    }, item.title);

    div.appendChild(iconNode);
    div.appendChild(label);

    // Delete button (edit mode)
    const deleteBtn = el('div', { class: 'app-delete-btn' });
    deleteBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (confirm(`Delete ${item.title}?`)) this.removeApp(item.id);
    });
    div.appendChild(deleteBtn);

    return div;
  }

  // ─── Dots ───────────────────────────────────────────────────

  renderDots(count, activeIndex) {
    this.dotsContainer.innerHTML = '';

    Object.assign(this.dotsContainer.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      padding: '8px 0 4px',
      touchAction: 'none', cursor: 'pointer',
    });

    for (let i = 0; i < count; i++) {
      const isActive = i === activeIndex;
      const dot = el('div', {
        class: 'dot',
        style: {
          width: isActive ? '18px' : '6px',
          height: '6px',
          borderRadius: isActive ? '3px' : '50%',
          backgroundColor: isActive ? '#00e5c1' : 'rgba(200,220,240,0.2)',
          transition: 'all 0.3s',
          boxShadow: isActive ? '0 0 8px rgba(0,229,193,0.4)' : 'none',
          pointerEvents: 'none',
        },
      });
      this.dotsContainer.appendChild(dot);
    }
  }

  setActivePage(index) {
    if (index >= this.dotsContainer.children.length) {
      this.renderDots(index + 1, index);
    }

    const dots = this.dotsContainer.querySelectorAll('.dot');
    dots.forEach((d, i) => {
      const isActive = i === index;
      d.style.width = isActive ? '18px' : '6px';
      d.style.borderRadius = isActive ? '3px' : '50%';
      d.style.backgroundColor = isActive ? '#00e5c1' : 'rgba(200,220,240,0.2)';
      d.style.boxShadow = isActive ? '0 0 8px rgba(0,229,193,0.4)' : 'none';
    });
    this.interaction.currentPage = index;
  }

  // ─── Dot Swipe ──────────────────────────────────────────────

  _bindDotSwipe() {
    let startX = 0;
    let pointerId = null;

    this.dotsContainer.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      startX = e.clientX;
      pointerId = e.pointerId;
      try { this.dotsContainer.setPointerCapture(e.pointerId); } catch { }
      this.dotsContainer.style.transform = 'translateX(-50%) scale(0.9)';
      this.dotsContainer.style.background = 'rgba(0,0,0,0.3)';
    }, { passive: false });

    this.dotsContainer.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (pointerId !== null && e.pointerId !== pointerId) return;
      try { this.dotsContainer.releasePointerCapture(e.pointerId); } catch { }
      this.dotsContainer.style.transform = 'translateX(-50%) scale(1)';
      this.dotsContainer.style.background = 'rgba(0,0,0,0.2)';
      pointerId = null;

      const dx = e.clientX - startX;
      const page = this.interaction.currentPage;
      const maxPage = (this.state.pageCount || 1) - 1;

      if (Math.abs(dx) > 30) {
        // Swipe gesture on dots
        if (dx > 0 && page > 0) this.interaction.animateToPage(page - 1);
        else if (dx < 0 && page < maxPage) this.interaction.animateToPage(page + 1);
      } else if (Math.abs(dx) < 10) {
        // Tap on dots — navigate to the tapped dot
        const dotsRect = this.dotsContainer.getBoundingClientRect();
        const dots = this.dotsContainer.querySelectorAll('.dot');
        if (dots.length > 1) {
          const relX = e.clientX - dotsRect.left;
          const fraction = relX / dotsRect.width;
          const targetPage = Math.max(0, Math.min(maxPage, Math.round(fraction * maxPage)));
          if (targetPage !== page) this.interaction.animateToPage(targetPage);
        }
      }
    });

    this.dotsContainer.addEventListener('pointercancel', (e) => {
      this.dotsContainer.style.transform = 'translateX(-50%) scale(1)';
      this.dotsContainer.style.background = 'rgba(0,0,0,0.2)';
      pointerId = null;
    });
  }

  // ─── Public API ─────────────────────────────────────────────

  /**
   * Compute grid drop location from client coordinates.
   * Used by MobileShell for dock→grid drops.
   *
   * BUG FIX: v0.6 used `this.layout` which was never set.
   * Now correctly uses `this.currentLayout`.
   */
  getDropLocationFromClient(clientX, clientY) {
    if (!this.currentLayout) return null;
    const containerRect = this.root.getBoundingClientRect();
    const localX = clientX - containerRect.left;
    const localY = clientY - containerRect.top;

    const w = this.currentLayout.gridArea.width;
    const startPageOffset = -(this.interaction.currentPage * w);
    return this.layoutEngine.getGridLocationFromPoint(localX, localY, startPageOffset, w, this.currentLayout);
  }
}
