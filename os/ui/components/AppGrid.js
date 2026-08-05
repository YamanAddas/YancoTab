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
import { GridKeyboard } from './grid/gridKeyboard.js';
import { GridPager } from './grid/gridPager.js';
import { openUserApp as launchUserApp, openFile as launchFile } from './grid/gridLaunch.js';
import { showConfirm } from './YancoModal.js';

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
    // Keyboard access. Separate from `interaction` on purpose: that module
    // owns pointer gestures (drag, page swipe, long-press) and the two
    // share nothing but the item:click event they both end up dispatching.
    this.keyboard = new GridKeyboard(this);
    this.keyboard.attach();
    this.pager = new GridPager(this.dotsContainer, this);

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
    this.pager.bindSwipe();
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

  // User shortcuts and files carry arbitrary URLs, so their opening logic
  // — including the re-validation at navigation time — lives in
  // grid/gridLaunch.js. These delegates stay because MobileShell and
  // SmartSearch both call them on the grid instance.
  openUserApp(app) { launchUserApp(app); }

  openFile(file) { launchFile(file); }

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

    // Grid is in flow — set width, height is flex-grown
    this.root.style.width = `${g.width}px`;

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
    this.keyboard?.destroy?.();
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

    // Update dots
    this.renderDots(pageCount, this.interaction.currentPage);

    // Reuse existing DOM nodes
    const existingNodes = new Map();
    Array.from(this.pagesContainer.children).forEach(node => {
      if (node.dataset.id) existingNodes.set(node.dataset.id, node);
    });

    const activeIds = new Set();
    let maxBottomY = 0;
    let minX = Infinity;
    let maxRightX = -Infinity;
    const curPage = this.interaction.currentPage;

    for (const item of items) {
      activeIds.add(item.id);
      let node = existingNodes.get(item.id);

      if (!node) {
        node = this._createItemNode(item);
        this.pagesContainer.appendChild(node);
      } else if (item.type === 'folder') {
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
        if (this._justDroppedId === item.id) {
          node.style.transition = 'none';
        } else {
          node.style.transition = 'transform 0.3s ease-out, width 0.3s ease-out, height 0.3s ease-out';
        }

        node.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
        node.style.opacity = '1';
        node.style.width = `${layout.metrics.cellWidth}px`;
        node.style.height = `${layout.metrics.cellHeight}px`;

        if (item.page === curPage) {
          maxBottomY = Math.max(maxBottomY, pos.y + layout.metrics.cellHeight);
          // Track horizontal bounds of current page items
          const localX = pos.x - curPage * layout.gridArea.width;
          minX = Math.min(minX, localX);
          maxRightX = Math.max(maxRightX, localX + layout.metrics.cellWidth);
        }

        const icon = node.querySelector('.app-icon-inner');
        if (icon) {
          icon.style.transition = 'width 0.3s ease-out, height 0.3s ease-out';
          icon.style.width = `${layout.metrics.iconSize}px`;
          icon.style.height = `${layout.metrics.iconSize}px`;
        }

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

    // Set grid height to actual content — margin-top: auto in CSS centers it
    if (maxBottomY > 0) {
      // Size container to actual content width for horizontal centering via margin:auto
      const actualWidth = maxRightX > minX ? maxRightX - minX : layout.gridArea.contentWidth;
      const contentShift = minX;

      this.root.style.height = `${maxBottomY}px`;
      this.root.style.width = `${actualWidth}px`;

      // Shift pages container left to compensate for the centering offset
      this.pagesContainer.style.width = `${pageCount * layout.gridArea.width}px`;
      this.pagesContainer.style.height = `${maxBottomY}px`;
      this.pagesContainer.style.marginLeft = `${-contentShift}px`;
    }

    // Nodes are reused but new ones are created freely, and a fresh node
    // carries no tabindex — so the roving stop has to be re-applied here
    // rather than once at construction.
    this.keyboard?.sync();
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

    // Inline styles dropped here — all of these are now defined on the
    // .app-label CSS rule (including the multi-layer text-shadow that
    // makes labels readable on busy wallpapers). Keeping inline styles
    // would override the CSS and break the readability fix.
    const label = el('div', { class: 'app-label' }, item.title);

    div.appendChild(iconNode);
    div.appendChild(label);

    // Delete button (edit mode)
    const deleteBtn = el('div', { class: 'app-delete-btn' });
    deleteBtn.addEventListener('pointerdown', async (e) => {
      e.stopPropagation();
      // The last native confirm() in the product. The v1 pass replaced 14
      // of them with YancoModal and missed this one, so deleting an icon
      // was the single place that still raised an OS dialog.
      if (await showConfirm('Delete Icon', `Remove ${item.title} from the home screen?`)) {
        this.removeApp(item.id);
      }
    });
    div.appendChild(deleteBtn);

    return div;
  }

  // ─── Dots ───────────────────────────────────────────────────
  // Thin delegates. The dots themselves live in grid/gridPager.js; these
  // stay because MobileShell and MobileInteractionV2 both call them.

  renderDots(count, activeIndex) {
    this.pager.render(count, activeIndex);
  }

  setActivePage(index) {
    this.pager.setActive(index);
    this.interaction.currentPage = index;
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
