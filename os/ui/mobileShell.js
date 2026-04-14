/**
 * mobileShell.js — v0.6.1
 *
 * Top-level wiring layer for the mobile OS.
 * Owns the DOM shell structure and connects:
 *   - AppGrid (desktop grid renderer + state + interaction)
 *   - Dock (bottom bar)
 *   - StatusBar, HomeBar, SmartSearch
 *   - System events (app open/close, dock↔grid drops, shortcuts)
 *
 * Design:
 *   - All cross-component communication via window CustomEvents
 *   - Dock uses grid.root as eventTarget for unified context-menu pipeline
 *   - Drop logic with graceful fallbacks (clamp → first-empty-slot)
 *   - Default folder seeding (idempotent, runs once per version)
 */

import { kernel } from '../kernel.js';
import { el } from '../utils/dom.js';
import { VERSION } from '../version.js';
import { AppGrid } from './components/AppGrid.js';
import { NavBar } from './components/NavBar.js';
import { SmartSearch } from './components/SmartSearch.js';
import { StatusBar } from './components/StatusBar.js';
import { HomeBar } from './components/HomeBar.js';
import { MobileContextMenu } from './components/MobileContextMenu.js';
import { Greeting } from './components/Greeting.js';
import { ToastManager } from './components/Toast.js';
import { Onboarding } from './components/Onboarding.js';
import { WindowChrome } from './components/WindowChrome.js';
import { defaultFolders } from '../config/defaultApps.js';

export class MobileShell {
  constructor(root) {
    this.root = root;
    this.components = {
      grid: new AppGrid(),
      navBar: new NavBar(),
      search: new SmartSearch(),
      statusBar: new StatusBar(kernel),
      homeBar: new HomeBar(() => this.goHome()),
      contextMenu: new MobileContextMenu(this),
      greeting: new Greeting(),
    };

    this.state = { viewportHeight: window.innerHeight, activePid: null, isLandscape: window.innerWidth > window.innerHeight };
    this.alarmUi = null;
    this._windowChrome = null;
    this.handleResize = this.handleResize.bind(this);
    this._orientationTransitionTimer = null;
  }

  // ─── Boot ───────────────────────────────────────────────────

  init() {
    console.log(`[MobileShell] Initializing ${VERSION}...`);
    document.body.classList.add('is-mobile');
    document.body.classList.toggle('is-landscape', this.state.isLandscape);
    document.body.classList.toggle('is-standalone-webapp', this._isStandaloneWebApp());
    document.body.classList.toggle('reduced-effects', this._shouldReduceEffects());
    document.body.classList.remove('in-app');
    this._applyViewportHeightVar();
    this.mount();
    this.bindEvents();

    // App definitions
    const apps = [
      { id: 'settings', name: 'Settings', icon: '⚙️' },
      { id: 'browser', name: 'Browser', icon: 'assets/browser-icon.png', url: 'https://google.com' },
      { id: 'clock', name: 'Clock', icon: '🕒' },
      { id: 'weather', name: 'Weather', icon: '⛅' },
      { id: 'notes', name: 'Notes', icon: '📝' },
      { id: 'snake', name: 'Snake', icon: 'game:snake' },
      { id: 'memory', name: 'Memory', icon: 'game:memory' },
      { id: 'tictactoe', name: 'Tic-Tac-Toe', icon: 'game:tictactoe' },
      { id: 'minesweeper', name: 'Minesweeper', icon: 'game:minesweeper' },
      { id: 'solitaire', name: 'Solitaire', icon: 'game:solitaire' },
      { id: 'spider-solitaire', name: 'Spider', icon: 'game:spider' },
      { id: 'mahjong', name: 'Mahjong', icon: 'game:mahjong' },
      { id: 'tarneeb', name: 'Tarneeb', icon: 'game:tarneeb' },
      { id: 'trix', name: 'Trix', icon: 'game:trix' },
      { id: 'calculator', name: 'Calculator', icon: '🔢' },
      { id: 'todo', name: 'Todo', icon: '✅' },
      { id: 'files', name: 'Files', icon: '📁' },
      { id: 'photos', name: 'Photos', icon: '🖼️' },
      { id: 'maps', name: 'Maps', icon: '🗺️' },
    ];

    this.components.grid.setApps(apps);
    kernel.registerApps(apps);

    // Organize games into folder (idempotent)
    this.ensureGamesFolder();

    // Seed default folders on first run (idempotent)
    this.seedDefaultFolders();

    this._applyHomeLayoutDefaults(apps);

    // System setup
    this._injectMobileStyles();
    this._bindSystemEvents();
    this.bindAlarmOverlay();

    // Toast notification system
    this._toast = new ToastManager();
    this._toast.init();

    // First-run onboarding
    const onboarding = new Onboarding();
    if (onboarding.shouldShow()) {
      requestAnimationFrame(() => onboarding.show());
    }
  }

  // ─── DOM Structure ──────────────────────────────────────────

  mount() {
    this.root.innerHTML = '';

    this.dom = {
      wrapper: el('div', { class: 'mobile-shell' }),
      mainContent: el('div', { class: 'main-content' }),
      homeTop: el('div', { class: 'home-top' }),
      statusBarLayer: this.components.statusBar.render(),
      appLayer: el('div', { class: 'm-app-layer', hidden: true }),
      homeBarLayer: this.components.homeBar.render(),
      spacer: el('div', { class: 'm-keyboard-spacer' }),
      alarmOverlay: this.renderAlarmOverlay(),
    };

    this.dom.homeTop.append(
      this.components.greeting.render(),
      this.components.search.render(),
    );

    // Main content: greeting + search + grid + dots (vertically centered by CSS)
    this.dom.mainContent.append(
      this.dom.homeTop,
      this.components.grid.root,
      this.components.grid.dotsContainer,
    );

    this.dom.wrapper.append(
      this.dom.statusBarLayer,
      this.dom.mainContent,
      this.components.navBar.render(),
      this.dom.appLayer,
      this.dom.homeBarLayer,
      this.dom.alarmOverlay,
      this.dom.spacer,
    );

    this.root.appendChild(this.dom.wrapper);
  }

  // ─── Mode Switching ─────────────────────────────────────────

  setMode(mode) {
    if (mode === 'app') {
      document.body.classList.add('in-app');
      this.dom.appLayer.hidden = false;
      this.dom.appLayer.style.display = 'block';
      // Small delay to allow display:block to apply before adding active class for transition
      requestAnimationFrame(() => {
        this.dom.appLayer.classList.add('active');
      });

      this.components.grid.root.style.opacity = '0';
      this.components.grid.root.style.pointerEvents = 'none';

      this.components.navBar.root.classList.add('is-hidden');

      this.components.search.root.style.opacity = '0';
      this.components.search.root.style.pointerEvents = 'none';
      if (this.components.search.input) {
        this.components.search.input.blur();
        this.components.search.input.disabled = true;
        this.components.search.input.style.pointerEvents = 'none';
      }
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    } else {
      document.body.classList.remove('in-app');
      this.dom.appLayer.classList.remove('active');

      // Wait for transition to finish before hiding
      setTimeout(() => {
        if (!this.dom.appLayer.classList.contains('active')) {
          this.dom.appLayer.hidden = true;
          this.dom.appLayer.style.display = 'none';
        }
      }, 350); // Matches --duration-normal

      this.components.grid.root.style.opacity = '1';
      this.components.grid.root.style.pointerEvents = 'auto';

      this.components.navBar.root.classList.remove('is-hidden');
      this.components.navBar.setActive('home');

      this.components.search.root.style.opacity = '1';
      this.components.search.root.style.pointerEvents = 'auto';
      if (this.components.search.input) {
        this.components.search.input.disabled = false;
        this.components.search.input.style.pointerEvents = 'auto';
      }

      if (document.activeElement?.classList.contains('m-search-input')) {
        document.activeElement.blur();
      }

      // Force grid redraw for orientation changes while app was active
      this.components.grid.handleResize?.();
    }
  }

  goHome() {
    if (this.state.activePid) kernel.processManager.kill(this.state.activePid);
  }

  // ─── Event Wiring ───────────────────────────────────────────

  bindEvents() {
    const win = window.visualViewport || window;
    win.addEventListener('resize', this.handleResize);

    // NEW: Bind orientation change listener
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.handleResize(), 100);
    });

    // App lifecycle
    kernel.on('process:started', ({ pid, appId, app }) => {
      // Destroy previous window chrome if any
      if (this._windowChrome) {
        this._windowChrome.destroy();
        this._windowChrome = null;
      }
      this.dom.appLayer.innerHTML = '';

      const appName = app.metadata?.name || 'App';
      let appContent = app.root;

      try {
        // Touch app.root to verify it's mountable
        if (!appContent || !(appContent instanceof HTMLElement)) {
          throw new Error('App root is not a valid DOM element');
        }
      } catch (e) {
        console.error(`[Shell] ${appName} crashed on mount:`, e);
        appContent = el('div', {
          class: 'app-crash',
          style: 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;padding:24px;text-align:center;color:var(--text-bright);'
        }, [
          el('h3', { style: 'font-size:18px;margin:0;' }, `${appName} crashed`),
          el('p', { style: 'font-size:13px;color:var(--text-dim);margin:0;max-width:300px;' }, e.message || 'An unexpected error occurred'),
          el('button', {
            type: 'button',
            style: 'margin-top:8px;padding:8px 20px;background:var(--accent);color:#000;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;',
            onclick: () => { app.close(); kernel.emit('app:open', appId || app.metadata?.id); },
          }, 'Restart'),
        ]);
      }

      // Floating window chrome (iPadOS Stage Manager style)
      this._windowChrome = new WindowChrome(appName, appContent, () => app.close());
      this.dom.appLayer.append(this._windowChrome.scrim, this._windowChrome.chrome);

      this.state.activePid = pid;
      this.setMode('app');
    });

    kernel.on('process:stopped', ({ pid } = {}) => {
      if (pid && this.state.activePid && pid !== this.state.activePid) return;
      if (this._windowChrome) {
        this._windowChrome.destroy();
        this._windowChrome = null;
      }
      this.dom.appLayer.innerHTML = '';
      this.state.activePid = null;
      this.setMode('home');
    });

    // Item open (from grid tap or nav)
    window.addEventListener('item:open', (e) => {
      const item = e.detail;
      if (!item) return;

      if (item.type === 'folder') {
        this.components.grid.openApp(item.id);
      } else if (item.type === 'app') {
        kernel.emit('app:open', item.id);
      } else if (item.type === 'file') {
        this.components.grid.openFile?.(item) ?? kernel.emit('app:open', 'files');
      } else if (item.type === 'shortcut') {
        this.components.grid.openUserApp?.(item) ?? kernel.emit('app:open', 'browser');
      } else if (item.type === 'alias') {
        const targetType = item.targetType || 'app';
        if (targetType === 'app') kernel.emit('app:open', item.targetId);
        else if (targetType === 'shortcut') this.components.grid.openApp(item.targetId);
        else kernel.emit('app:open', 'files');
      } else {
        kernel.emit('app:open', item.id);
      }
    });

    // NavBar actions
    window.addEventListener('nav:action', (e) => {
      const id = e.detail?.id;
      if (!id) return;

      // If in-app, go home first
      if (this.state.activePid) {
        const proc = kernel.processManager.processes.get(this.state.activePid);
        if (proc?.instance?.close) proc.instance.close();
      }

      switch (id) {
        case 'home':
          // Already going home from above
          break;
        case 'files':
          kernel.emit('app:open', 'files');
          break;
        case 'games':
          this.components.grid.openApp('folder-games');
          break;
        case 'ai':
          this.components.grid.openApp('folder-ai');
          break;
        case 'settings':
          kernel.emit('app:open', 'settings');
          break;
      }
    });

    // Ensure minimum pages (used by edge-drag page creation for smooth flipping)
    window.addEventListener('page:ensure', (e) => {
      try {
        const minPages = e?.detail?.minPages;
        if (!minPages || !this.components?.grid?.state) return;
        const st = this.components.grid.state;
        st.pageCount = Math.max(st.pageCount || 1, minPages);
        st._save?.();
        st.notify?.();
      } catch (err) {
        console.warn('[Shell] page:ensure failed', err);
      }
    });

    // Shortcut creation
    window.addEventListener('shortcut:create', (e) => {
      try {
        const { origin, id: sourceId } = e?.detail || {};
        if (!origin || !sourceId) return;

        const apps = kernel.getApps?.() || [];
        const app = apps.find(a => a.id === sourceId);
        const stateItem = this.components.grid.state.items.get(sourceId);

        const title = app?.name || stateItem?.title || stateItem?.name || sourceId;
        const icon = app?.icon || stateItem?.icon || '🔗';
        const targetType = app ? 'app'
          : stateItem?.type === 'file' ? 'file'
            : stateItem?.type === 'shortcut' ? 'shortcut' : 'app';

        const aliasId = `alias-${sourceId}-${Date.now()}`;

        this.components.grid.state.addAlias({
          id: aliasId,
          title, icon,
          targetId: sourceId,
          targetType,
          hidden: false,
        });

        try { this.components.grid.state.showItem?.(aliasId); } catch { }
      } catch (err) {
        console.error('[MobileShell] shortcut:create failed', err);
      }
    });
  }

  // ─── Drop Location Resolution ───────────────────────────────

  _resolveGridDropLocation(clientX, clientY) {
    // Attempt 1: direct grid location from coordinates
    let loc = this.components.grid.getDropLocationFromClient?.(clientX, clientY);
    if (loc) return loc;

    // Attempt 2: clamp coordinates to grid bounds
    try {
      const r = this.components.grid.root.getBoundingClientRect();
      const cx = Math.max(r.left + 2, Math.min(r.right - 2, clientX));
      const cy = Math.max(r.top + 2, Math.min(r.bottom - 2, clientY));
      loc = this.components.grid.getDropLocationFromClient?.(cx, cy);
    } catch { }
    if (loc) return loc;

    // Attempt 3: first empty slot on current page
    try {
      const st = this.components.grid.state;
      const m = st?.layout?.metrics;
      const page = this.components.grid.interaction?.currentPage ?? 0;
      const rows = m?.rows ?? 4;
      const cols = m?.cols ?? 4;

      for (let p = page; p <= (st.pageCount ?? page); p++) {
        for (let rr = 0; rr < rows; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            if (!st.findItemAt(p, rr, cc)) return { page: p, row: rr, col: cc };
          }
        }
      }
    } catch { }

    // Final fallback
    return { page: 0, row: 0, col: 0 };
  }

  // ─── Folder Seeding ─────────────────────────────────────────

  ensureGamesFolder() {
    try {
      const grid = this.components.grid;
      const folderId = 'folder-games';
      if (!grid.state.items.has(folderId)) {
        grid.state.addFolder({ id: folderId, title: 'Games', icon: 'folder', children: [] });
      }
      for (const id of ['snake', 'memory', 'tictactoe', 'minesweeper', 'solitaire', 'spider-solitaire', 'mahjong', 'tarneeb', 'trix']) {
        if (grid.state.items.has(id)) {
          grid.state.addChildToFolder(id, folderId);
        }
      }
    } catch (e) {
      console.error('Error ensuring Games folder:', e);
    }
  }

  seedDefaultFolders() {
    try {
      if (!defaultFolders || !Array.isArray(defaultFolders)) return;

      const grid = this.components.grid;
      const seedFlag = localStorage.getItem('yancotab_mobile_seed_v06');

      // Verify that seeded folders actually exist in grid state.
      // If the flag says "seeded" but the folders are missing, re-seed.
      if (seedFlag) {
        const allPresent = defaultFolders.every(f => grid.state.items.has(`folder-${f.id}`));
        if (allPresent) return; // Already seeded and data is intact
        console.warn('[Shell] Seed flag set but folders missing — re-seeding...');
      }

      const newKernelApps = kernel.getApps().slice();

      for (const folderDef of defaultFolders) {
        const folderId = `folder-${folderDef.id}`;

        // Only create folder if it doesn't already exist
        if (!grid.state.items.has(folderId)) {
          grid.state.addFolder({ id: folderId, title: folderDef.name, icon: 'folder', children: [] });
        }

        for (const appDef of folderDef.apps) {
          const cleanName = appDef.name.replace(/\s+/g, '').toLowerCase();
          const childId = `shortcut-${folderDef.id}-${cleanName}`;

          let iconUrl = '🌍';
          try {
            const domain = new URL(appDef.url).hostname;
            iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
          } catch { }

          // Only add if not already in state
          if (!grid.state.items.has(childId)) {
            grid.state.addApp({ id: childId, title: appDef.name, icon: iconUrl, url: appDef.url, scheme: null, parent: folderId });
          }
          grid.state.addChildToFolder(childId, folderId);

          if (!newKernelApps.find(k => k.id === childId)) {
            newKernelApps.push({ id: childId, name: appDef.name, icon: iconUrl, url: appDef.url, scheme: null });
          }
        }
      }

      kernel.registerApps(newKernelApps);
      localStorage.setItem('yancotab_mobile_seed_v06', 'true');
    } catch (e) {
      console.error('Error seeding default folders:', e);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────

  _createAllItems(apps) {
    const all = [
      ...apps.map(app => ({ id: app.id, name: app.name, icon: app.icon, type: 'app', url: app.url, scheme: app.scheme })),
      ...Array.from(this.components.grid.state.items.values())
        .map(item => ({
          id: item.id,
          name: item.title || item.name,
          icon: item.icon,
          type: item.type || 'app',
          url: item.url,
          scheme: item.scheme,
          targetId: item.targetId,
          targetType: item.targetType
        })),
    ];
    return all;
  }

  _applyHomeLayoutDefaults(apps) {
    try {
      const key = 'yancotab_home_layout_v101';
      if (localStorage.getItem(key)) return;

      const mode = localStorage.getItem('yancotab_home_layout_mode') || 'type-name';
      if (mode === 'type-name') {
        this.components.grid.state.sortTopLevelByTypeAndName({ resetSavedModes: true });
      } else {
        const preferred = [];
        for (const app of apps || []) {
          if (app?.id && !preferred.includes(app.id)) preferred.push(app.id);
        }
        this.components.grid.state.sortTopLevel(preferred, { resetSavedModes: true });
      }

      localStorage.setItem(key, 'true');
    } catch (e) {
      console.warn('[Shell] Home layout default sort skipped:', e);
    }
  }

  _injectMobileStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
      html, body {
        overscroll-behavior: none;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      img {
        -webkit-user-drag: none;
        user-drag: none;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  _bindSystemEvents() {
    const scope = () => document.querySelector('.mobile-shell') || document;

    scope().addEventListener('contextmenu', (e) => {
      const t = e.target;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
      if (e.cancelable) e.preventDefault();
    }, { passive: false, capture: true });

    scope().addEventListener('selectstart', (e) => {
      const t = e.target;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
      if (e.cancelable) e.preventDefault();
    }, { passive: false, capture: true });

    // Desktop Context Menu (Right Click on background)
    scope().addEventListener('contextmenu', (e) => {
      if (e.target.closest('.app-icon') || e.target.closest('.m-dock')) return; // handled by MobileInteraction
      e.preventDefault();
      this.components.contextMenu.show({ type: 'grid', x: e.clientX, y: e.clientY }, e.clientX, e.clientY);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ignore during IME composition
      if (e.isComposing) return;

      const isInput = e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.isContentEditable;
      const ctrl = e.ctrlKey || e.metaKey;

      // Escape — close current app and go home (always active)
      if (e.key === 'Escape') {
        if (this.state.activePid) {
          const proc = kernel.processManager.processes.get(this.state.activePid);
          if (proc?.instance?.close) proc.instance.close();
          e.preventDefault();
        } else if (isInput) {
          e.target.blur();
        }
        return;
      }

      // Don't override shortcuts when typing in inputs (except Escape above)
      if (isInput) return;

      // Ctrl+K / Cmd+K — focus SmartSearch
      if (ctrl && e.key === 'k') {
        e.preventDefault();
        this.components.search.input?.focus();
        return;
      }

      // Ctrl+, — open Settings
      if (ctrl && e.key === ',') {
        e.preventDefault();
        kernel.emit('app:open', 'settings');
        return;
      }
    });
  }

  handleResize() {
    const viewport = window.visualViewport || window;
    const newHeight = viewport.height;
    const isKeyboard = Math.abs(window.innerHeight - newHeight) > 100;
    this._applyViewportHeightVar();

    // NEW: Detect orientation change
    const isLandscape = window.innerWidth > window.innerHeight;
    const orientationChanged = (isLandscape !== this.state.isLandscape);

    if (orientationChanged) {
      this.state.isLandscape = isLandscape;
      document.body.classList.toggle('is-landscape', isLandscape);
      document.body.classList.add('is-orientation-transition');
      if (this._orientationTransitionTimer) clearTimeout(this._orientationTransitionTimer);
      this._orientationTransitionTimer = setTimeout(() => {
        document.body.classList.remove('is-orientation-transition');
        this._orientationTransitionTimer = null;
      }, 280);

      // Force grid recalculation
      this.components.grid.handleResize?.();
    }

    this._windowChrome?.onViewportResize();

    this.dom.spacer.style.height = isKeyboard
      ? `${window.innerHeight - newHeight}px`
      : '0px';
  }

  _applyViewportHeightVar() {
    const viewport = window.visualViewport || window;
    const vh = Math.max(0, Number(viewport?.height || window.innerHeight || 0) * 0.01);
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  _isStandaloneWebApp() {
    try {
      if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
      if (window.matchMedia?.('(display-mode: fullscreen)').matches) return true;
      if (window.matchMedia?.('(display-mode: minimal-ui)').matches) return true;
      if (typeof navigator.standalone === 'boolean' && navigator.standalone) return true;
    } catch (e) {
      // No-op; fall back to browser mode.
    }
    return false;
  }

  _shouldReduceEffects() {
    try {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
      const cores = Number(navigator.hardwareConcurrency || 0);
      const memory = Number(navigator.deviceMemory || 0);
      if (cores > 0 && cores <= 4) return true;
      if (memory > 0 && memory <= 4) return true;
    } catch (e) {
      // Ignore and keep full effects.
    }
    return false;
  }

  // ─── Alarm Overlay ──────────────────────────────────────────

  renderAlarmOverlay() {
    const title = el('div', { class: 'm-alarm-title' }, 'Alarm');
    const label = el('div', { class: 'm-alarm-label' }, 'Clock');
    const time = el('div', { class: 'm-alarm-time' }, '--:--');
    const snoozeBtn = el('button', { class: 'm-alarm-btn', type: 'button' }, 'Snooze');
    const dismissBtn = el('button', { class: 'm-alarm-btn is-primary', type: 'button' }, 'Dismiss');
    const actions = el('div', { class: 'm-alarm-actions' }, [snoozeBtn, dismissBtn]);
    const card = el('div', { class: 'm-alarm-card' }, [title, label, time, actions]);
    const overlay = el('div', { class: 'm-alarm-overlay', hidden: true }, [card]);
    this.alarmUi = { overlay, label, time, snoozeBtn, dismissBtn };
    return overlay;
  }

  bindAlarmOverlay() {
    const service = kernel.getService('clock');
    if (!service || !this.alarmUi) return;

    const setRing = (ring) => {
      const ui = this.alarmUi;
      if (!ui) return;
      if (!ring) {
        ui.overlay.classList.remove('is-visible');
        setTimeout(() => {
          if (!ui.overlay.classList.contains('is-visible')) ui.overlay.hidden = true;
        }, 180);
        return;
      }
      ui.label.textContent = ring.label || 'Alarm';
      ui.time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      ui.overlay.hidden = false;
      requestAnimationFrame(() => ui.overlay.classList.add('is-visible'));
    };

    if (this.alarmUi.snoozeBtn) this.alarmUi.snoozeBtn.onclick = () => service.snoozeActiveAlarm();
    if (this.alarmUi.dismissBtn) this.alarmUi.dismissBtn.onclick = () => service.dismissActiveAlarm();

    window.addEventListener('yancotab:alarmringstate', (event) => {
      setRing(event.detail?.ring || null);
    });

    if (typeof service.getActiveRing === 'function') setRing(service.getActiveRing());
  }
}
