import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { VERSION, BUILD } from '../version.js';
import { getThemeMode, applyThemeMode } from '../theme/theme.js';

const WALLPAPER_KEY = 'yancotab_wallpaper';
const GRID_STORAGE_KEY = 'yancotab_mobile_grid_v8';
const DOCK_STORAGE_KEY = 'yancotab_dock_items';
const FOLDER_SEED_KEY = 'yancotab_mobile_seed_v06';
const HOME_LAYOUT_MODE_KEY = 'yancotab_home_layout_mode';
const HOME_LAYOUT_APPLIED_KEY = 'yancotab_home_layout_v100';
const BROWSER_PREFS_KEY = 'yancotab_browser_prefs';
const BROWSER_STATE_KEY = 'yancotab_browser_v1';
const LEGACY_BOOKMARKS_KEY = 'yancotab_bookmarks';

function readJson(key, fallback = {}, storage = null) {
  try {
    if (storage) {
      const data = storage.load(key);
      return data !== null && data !== undefined ? data : fallback;
    }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getBrowserPrefs(storage = null) {
  const searchEngine = storage
    ? (storage.load('yancotabSearchEngine') || 'google')
    : (localStorage.getItem('yancotabSearchEngine') || 'google');
  const defaults = {
    searchEngine,
    forceWebParam: true,
    historyLimit: 20,
    startTheme: 'aurora',
  };

  const stored = readJson(BROWSER_PREFS_KEY, {}, storage);
  const historyLimit = Number(stored.historyLimit);
  const clampedHistory = Number.isFinite(historyLimit)
    ? Math.max(10, Math.min(100, Math.round(historyLimit)))
    : defaults.historyLimit;

  return {
    searchEngine: ['google', 'duck', 'bing'].includes(stored.searchEngine) ? stored.searchEngine : defaults.searchEngine,
    forceWebParam: typeof stored.forceWebParam === 'boolean' ? stored.forceWebParam : defaults.forceWebParam,
    historyLimit: clampedHistory,
    startTheme: ['aurora', 'graphite', 'midnight'].includes(stored.startTheme) ? stored.startTheme : defaults.startTheme,
  };
}

function setBrowserPrefs(nextPrefs, storage = null) {
  const sanitized = {
    searchEngine: ['google', 'duck', 'bing'].includes(nextPrefs?.searchEngine) ? nextPrefs.searchEngine : 'google',
    forceWebParam: nextPrefs?.forceWebParam !== false,
    historyLimit: Number.isFinite(Number(nextPrefs?.historyLimit))
      ? Math.max(10, Math.min(100, Math.round(Number(nextPrefs.historyLimit))))
      : 20,
    startTheme: ['aurora', 'graphite', 'midnight'].includes(nextPrefs?.startTheme) ? nextPrefs.startTheme : 'aurora',
  };
  if (storage) {
    storage.save(BROWSER_PREFS_KEY, sanitized);
    storage.save('yancotabSearchEngine', sanitized.searchEngine);
  } else {
    localStorage.setItem(BROWSER_PREFS_KEY, JSON.stringify(sanitized));
    localStorage.setItem('yancotabSearchEngine', sanitized.searchEngine);
  }
  window.dispatchEvent(new CustomEvent('yancotab:browser-settings-changed', { detail: sanitized }));
}

export class SettingsApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Settings', id: 'settings', icon: '⚙️' };
    this.state = { activeCategory: 'display' };
  }

  async init() {
    this.root = el('div', { class: 'app-window ys-settings-app' });

    const style = el('style', {}, `
      .ys-settings-app {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--glass-surface-3);
        color: var(--surface-text);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        overflow: hidden;
      }

      .ys-wallpaper.selected {
        border-color: var(--glow-teal);
        box-shadow: 0 0 0 2px rgba(255,255,255,0.06), 0 10px 24px rgba(0,0,0,0.35);
      }

      .ys-wallpaper::after {
        content: "";
        position: absolute;
        top: 6px;
        right: 6px;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: rgba(0,0,0,0.45);
        border: 1px solid rgba(255,255,255,0.18);
        opacity: 0;
        transform: scale(0.9);
        transition: opacity 120ms ease, transform 120ms ease;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }

      .ys-wallpaper.selected::after {
        opacity: 1;
        transform: scale(1);
        background: var(--glow-teal);
        border-color: rgba(255,255,255,0.25);
      }

      .ys-wallpaper.selected::before {
        content: "✓";
        position: absolute;
        top: 5px;
        right: 10px;
        font-size: 12px;
        font-weight: 900;
        color: var(--surface-text);
        opacity: 1;
        z-index: 2;
        pointer-events: none;
      }

      .ys-sidebar {
        width: 100%;
        flex: 0 0 64px;
        flex-shrink: 0;
        min-height: 64px;
        max-height: 64px;
        background: rgba(10, 12, 18, 0.92);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
        padding: 10px 8px;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        z-index: 4;
      }

      .ys-sidebar::-webkit-scrollbar {
        display: none;
      }

      .ys-content {
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        background: rgba(0,0,0,0.25);
        overflow: hidden;
      }

      .ys-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-shrink: 0;
        padding: 14px 20px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        background: rgba(12, 14, 20, 0.9);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        position: sticky;
        top: 0;
        z-index: 3;
      }

      .ys-title {
        font-size: 21px;
        font-weight: 700;
        letter-spacing: -0.2px;
      }

      .ys-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 16px 20px max(28px, env(safe-area-inset-bottom, 0px) + 20px);
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }

      .ys-nav-item {
        border: 0;
        background: transparent;
        color: #a7a8ad;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        gap: 10px;
        min-height: 42px;
        padding: 8px 14px;
        text-align: left;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }

      .ys-nav-item:active {
        opacity: 0.85;
      }

      .ys-nav-item.active {
        background: var(--glow-teal);
        color: var(--surface-text);
      }

      .ys-nav-icon {
        width: 20px;
        text-align: center;
        font-size: 16px;
      }

      .ys-group {
        margin-bottom: 20px;
      }

      .ys-group-title {
        color: #8f9198;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding-left: 4px;
        margin-bottom: 8px;
      }

      .ys-card {
        background: var(--glass-surface-2);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        overflow: hidden;
      }

      .ys-row,
      .ys-choice,
      .ys-action {
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }

      .ys-row:last-child,
      .ys-choice:last-child,
      .ys-action:last-child {
        border-bottom: 0;
      }

      .ys-row,
      .ys-choice,
      .ys-action {
        min-height: 56px;
        padding: 12px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .ys-info {
        min-width: 0;
        flex: 1;
      }

      .ys-label {
        font-size: 15px;
        color: var(--surface-text);
      }

      .ys-desc {
        margin-top: 2px;
        color: #8f9198;
        font-size: 12px;
        line-height: 1.35;
      }

      .ys-toggle {
        border: 0;
        width: 50px;
        height: 30px;
        border-radius: 20px;
        background: rgba(255,255,255,0.18);
        position: relative;
        cursor: pointer;
        flex-shrink: 0;
      }

      .ys-toggle.on {
        background: #0a84ff;
      }

      .ys-toggle-knob {
        width: 26px;
        height: 26px;
        border-radius: 13px;
        background: var(--surface-text);
        position: absolute;
        top: 2px;
        left: 2px;
        transition: transform 0.2s ease;
      }

      .ys-toggle.on .ys-toggle-knob {
        transform: translateX(20px);
      }

      .ys-choice,
      .ys-action {
        border: 0;
        width: 100%;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }

      .ys-choice {
        padding: 14px;
      }

      .ys-check {
        color: var(--glow-teal);
        font-weight: 700;
        font-size: 18px;
      }

      .ys-action .ys-label.is-danger {
        color: #ff453a;
      }

      .ys-chevron {
        color: #5f6168;
        font-size: 19px;
        line-height: 1;
      }

      .ys-btn {
        border: 0;
        background: var(--glass-surface-2);
        color: var(--glow-teal);
        border-radius: 10px;
        padding: 9px 14px;
        min-width: 88px;
        font-size: 14px;
        font-weight: 600;
        width: auto;
        white-space: nowrap;
        text-align: center;
      }

      .ys-btn:active {
        opacity: 0.8;
      }

      .ys-wallpaper-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }

      .ys-wallpaper {
        border: 2px solid rgba(255,255,255,0.12);
        border-radius: 10px;
        height: 54px;
        position: relative;
        cursor: pointer;
        overflow: hidden;
      }

      .ys-wallpaper-label {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 2px 4px;
        font-size: 9px;
        text-align: center;
        background: rgba(0,0,0,0.5);
      }

      .ys-about-hero {
        text-align: center;
        padding: 20px 0 14px;
      }

      .ys-about-logo {
        width: 64px;
        height: 64px;
        margin-bottom: 10px;
      }

      .ys-about-version {
        color: #8f9198;
        font-size: 14px;
        margin-top: 4px;
      }

      .ys-about-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }

      .ys-about-row:last-child {
        border-bottom: 0;
      }

      .ys-about-key {
        color: var(--surface-text);
        font-size: 14px;
      }

      .ys-about-value {
        color: #9a9ca3;
        font-size: 14px;
        text-align: right;
        max-width: 62%;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .ys-legal {
        font-size: 12px;
        line-height: 1.5;
        color: #9a9ca3;
        padding: 14px;
      }

      .ys-legal p {
        margin: 0 0 8px;
      }

      .ys-legal p:last-child {
        margin-bottom: 0;
      }

      @media (max-width: 820px) {
        .ys-sidebar {
          min-height: 60px;
          max-height: 60px;
          gap: 6px;
          padding: 10px 8px;
        }

        .ys-nav-item {
          border-radius: 999px;
          background: var(--glass-surface-2);
          padding: 8px 11px;
          font-size: 13px;
        }

        .ys-nav-icon {
          width: auto;
          font-size: 14px;
        }

        .ys-header {
          padding: 12px 14px;
        }

        .ys-title {
          font-size: 18px;
        }

        .ys-scroll {
          padding: 12px 14px max(24px, env(safe-area-inset-bottom, 0px) + 18px);
        }

        .ys-wallpaper-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @media (orientation: landscape) and (max-height: 520px) {
        .ys-sidebar {
          min-height: 56px;
          max-height: 56px;
          padding: 8px 8px;
        }

        .ys-nav-item {
          min-height: 38px;
          font-size: 14px;
          padding: 6px 12px;
        }

        .ys-header {
          padding: 10px 14px;
        }

        .ys-scroll {
          padding: 12px 14px max(20px, env(safe-area-inset-bottom, 0px) + 16px);
        }
      }
    `);

    this.root.appendChild(style);

    const sidebar = el('div', { class: 'ys-sidebar' });
    this.contentArea = el('div', { class: 'ys-content' });

    this.categories = [
      { id: 'display', label: 'Display', icon: '🎨' },
      { id: 'homescreen', label: 'Home', icon: '📱' },
      { id: 'browser', label: 'Browser', icon: '🌐' },
      { id: 'storage', label: 'Storage', icon: '💾' },
      { id: 'accessibility', label: 'Access', icon: '♿' },
      { id: 'about', label: 'About', icon: 'ℹ️' },
    ];

    this.categories.forEach((cat) => {
      const btn = el('button', {
        type: 'button',
        class: `ys-nav-item ${this.state.activeCategory === cat.id ? 'active' : ''}`,
        onclick: () => {
          this.state.activeCategory = cat.id;
          this._updateSidebar(sidebar);
          this._renderContent();
        },
      }, [
        el('span', { class: 'ys-nav-icon' }, cat.icon),
        el('span', {}, cat.label),
      ]);
      sidebar.appendChild(btn);
    });

    this.sidebar = sidebar;
    this.root.append(sidebar, this.contentArea);
    this._renderContent();
  }

  _updateSidebar(sidebar) {
    Array.from(sidebar.children).forEach((child, i) => {
      const isActive = this.categories[i].id === this.state.activeCategory;
      child.classList.toggle('active', isActive);
      if (isActive && typeof child.scrollIntoView === 'function') {
        child.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    });
  }

  _renderContent() {
    this.contentArea.innerHTML = '';

    const titles = {
      display: 'Display & Wallpaper',
      homescreen: 'Home Screen',
      browser: 'Browser',
      storage: 'Storage & Data',
      accessibility: 'Accessibility',
      about: 'About YancoTab',
    };

    const header = el('div', { class: 'ys-header' }, [
      el('div', { class: 'ys-title' }, titles[this.state.activeCategory] || 'Settings'),
      el('button', { type: 'button', class: 'ys-btn', onclick: () => this.close() }, 'Done'),
    ]);

    const scroll = el('div', { class: 'ys-scroll' });

    switch (this.state.activeCategory) {
      case 'display':
        this._renderDisplay(scroll);
        break;
      case 'homescreen':
        this._renderHomeScreen(scroll);
        break;
      case 'browser':
        this._renderBrowser(scroll);
        break;
      case 'storage':
        this._renderStorage(scroll);
        break;
      case 'accessibility':
        this._renderAccessibility(scroll);
        break;
      case 'about':
        this._renderAbout(scroll);
        break;
      default:
        this._renderDisplay(scroll);
    }

    this.contentArea.append(header, scroll);
  }

  _renderDisplay(container) {
    const isDarkMode = getThemeMode() !== 'light';

    container.appendChild(this._group('Appearance', [
      this._toggleRow('Dark Mode', 'Use dark interface colors', isDarkMode, (nextOn) => {
        applyThemeMode(nextOn ? 'dark' : 'light');
      }),
    ]));

    const wallpapers = [
      { css: 'url("assets/wallpaper.webp")', name: 'Default' },
      { css: 'url("assets/wallpapers/deep-blue.webp")', name: 'Deep Blue' },
      { css: 'url("assets/wallpapers/black.webp")', name: 'Black' },
      { css: 'url("assets/wallpapers/dark.webp")', name: 'Dark' },
      { css: 'url("assets/wallpapers/violet.webp")', name: 'Violet' },
      { css: 'url("assets/wallpapers/pink.webp")', name: 'Pink' },
      { css: 'url("assets/wallpapers/sky.webp")', name: 'Sky' },
      { css: 'url("assets/wallpapers/mint.webp")', name: 'Mint' },
      { css: 'cosmic', name: 'Cosmic', special: true },
      { css: 'starfield', name: 'Starfield', special: true },
    ];

    const currentWallpaper = this.kernel.storage.load(WALLPAPER_KEY) || wallpapers[0].css;

    const grid = el('div', { class: 'ys-wallpaper-grid' });
    wallpapers.forEach((wp) => {
      let bgStyle = `background:${wp.css}; background-size:cover; background-position:center;`;
      if (wp.css === 'cosmic') bgStyle = 'background:linear-gradient(135deg, #060b14 0%, #0a1628 50%, #060b14 100%); opacity:0.7;';
      if (wp.css === 'starfield') bgStyle = 'background:radial-gradient(circle at 50% 50%, #0d1b2e 0%, #060b14 100%);';
      const option = el('button', {
        type: 'button',
        class: 'ys-wallpaper' + (wp.css === currentWallpaper ? ' selected' : ''),
        style: bgStyle,
      }, [el('div', { class: 'ys-wallpaper-label' }, wp.name)]);

      option.onclick = () => {
        const shell = document.getElementById('app-shell') || document.body;
        shell.classList.remove('cosmic-wallpaper');

        if (wp.css === 'cosmic') {
          // Cosmic: keep current wallpaper but fade it to show starfield
          shell.classList.add('cosmic-wallpaper');
        } else if (wp.css === 'starfield') {
          // Starfield: remove wallpaper entirely, show pure starfield
          shell.style.background = 'transparent';
          shell.style.backgroundSize = '';
          shell.style.backgroundPosition = '';
        } else {
          shell.style.background = wp.css;
          shell.style.backgroundSize = 'cover';
          shell.style.backgroundPosition = 'center';
        }
        this.kernel.storage.save(WALLPAPER_KEY, wp.css);

        grid.querySelectorAll('.ys-wallpaper.selected').forEach((el) => el.classList.remove('selected'));
        option.classList.add('selected');
      };

      grid.appendChild(option);
    });

    container.appendChild(this._group('Wallpaper', [grid]));
  }

  _renderHomeScreen(container) {
    container.appendChild(this._group('Icon Layout', [
      this._actionRow('Reset Icon Positions', 'Restore default layout sorted by type and name', () => {
        if (!confirm('Reset home screen layout? Icons will be rearranged.')) return;
        this.kernel.storage.remove(GRID_STORAGE_KEY);
        this.kernel.storage.remove(HOME_LAYOUT_APPLIED_KEY);
        localStorage.removeItem('yancotab_home_layout_v091_hotfix2');
        this.kernel.storage.save(HOME_LAYOUT_MODE_KEY, 'type-name');
        location.reload();
      }),
      this._actionRow('Reset Dock', 'Restore default dock items', () => {
        if (!confirm('Reset dock to defaults?')) return;
        this.kernel.storage.remove(DOCK_STORAGE_KEY);
        location.reload();
      }),
    ]));

    container.appendChild(this._group('Folders', [
      this._actionRow('Reset Folders', 'Re-seed default folders (AI, TV, Social, Games)', () => {
        if (!confirm('This will re-seed default folders on next reload.')) return;
        localStorage.removeItem(FOLDER_SEED_KEY);
        location.reload();
      }),
    ]));

    container.appendChild(this._group('Shortcuts', [
      this._infoRow('Tip', 'Long-press desktop background to add web shortcuts. Long-press any app for quick actions.'),
    ]));
  }

  _renderBrowser(container) {
    const prefs = getBrowserPrefs(this.kernel.storage);
    const updatePrefs = (patch) => {
      setBrowserPrefs({ ...prefs, ...patch }, this.kernel.storage);
      this._renderContent();
    };

    container.appendChild(this._group('Search Engine', [
      this._choiceRow('Google', prefs.searchEngine === 'google', () => updatePrefs({ searchEngine: 'google' })),
      this._choiceRow('DuckDuckGo', prefs.searchEngine === 'duck', () => updatePrefs({ searchEngine: 'duck' })),
      this._choiceRow('Bing', prefs.searchEngine === 'bing', () => updatePrefs({ searchEngine: 'bing' })),
    ]));

    container.appendChild(this._group('Browsing Behavior', [
      this._infoRow('Open Links in New Tab', 'Always on for best compatibility (iframe embeds are blocked by many websites).'),
      this._toggleRow('Force Browser Mode', 'Append yancotab_web=1 to reduce native-app redirects', prefs.forceWebParam, (next) => {
        updatePrefs({ forceWebParam: next });
      }),
    ]));

    container.appendChild(this._group('Start Page Theme', [
      this._choiceRow('Aurora', prefs.startTheme === 'aurora', () => updatePrefs({ startTheme: 'aurora' })),
      this._choiceRow('Graphite', prefs.startTheme === 'graphite', () => updatePrefs({ startTheme: 'graphite' })),
      this._choiceRow('Midnight', prefs.startTheme === 'midnight', () => updatePrefs({ startTheme: 'midnight' })),
    ]));

    container.appendChild(this._group('History Limit', [
      this._choiceRow('20 entries', prefs.historyLimit === 20, () => updatePrefs({ historyLimit: 20 })),
      this._choiceRow('50 entries', prefs.historyLimit === 50, () => updatePrefs({ historyLimit: 50 })),
      this._choiceRow('100 entries', prefs.historyLimit === 100, () => updatePrefs({ historyLimit: 100 })),
    ]));

    container.appendChild(this._group('Privacy & Data', [
      this._actionRow('Clear Browsing History', 'Remove saved recent links', () => {
        if (!confirm('Clear browsing history?')) return;
        const state = readJson(BROWSER_STATE_KEY, {}, this.kernel.storage);
        state.history = [];
        this.kernel.storage.save(BROWSER_STATE_KEY, state);
        alert('Browsing history cleared.');
      }, true),
      this._actionRow('Clear Bookmarks', 'Remove saved bookmarks', () => {
        if (!confirm('Clear saved bookmarks?')) return;
        const state = readJson(BROWSER_STATE_KEY, {}, this.kernel.storage);
        state.bookmarks = [];
        this.kernel.storage.save(BROWSER_STATE_KEY, state);
        localStorage.removeItem(LEGACY_BOOKMARKS_KEY);
        alert('Bookmarks cleared.');
      }, true),
      this._actionRow('Reset Browser Settings', 'Restore browser defaults', () => {
        if (!confirm('Reset browser settings and data?')) return;
        this.kernel.storage.remove(BROWSER_STATE_KEY);
        localStorage.removeItem(LEGACY_BOOKMARKS_KEY);
        setBrowserPrefs({
          searchEngine: 'google',
          forceWebParam: true,
          historyLimit: 20,
          startTheme: 'aurora',
        }, this.kernel.storage);
        alert('Browser reset complete.');
      }, true),
    ]));
  }

  _renderStorage(container) {
    let totalKeys = 0;
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('yancotab')) continue;
      totalKeys += 1;
      totalSize += (localStorage.getItem(key) || '').length * 2;
    }

    const totalStorage = (() => {
      let bytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || '';
        const value = localStorage.getItem(key) || '';
        bytes += (key.length + value.length) * 2;
      }
      return (bytes / 1024).toFixed(1);
    })();

    container.appendChild(this._group('Local Storage', [
      this._dataRow('YancoTab Data', `${(totalSize / 1024).toFixed(1)} KB across ${totalKeys} keys`),
      this._dataRow('Total localStorage', `${totalStorage} KB used`),
    ]));

    container.appendChild(this._group('Data Management', [
      this._actionRow('Clear App Caches', 'Remove cached weather and browser data', () => {
        if (!confirm('Clear app caches?')) return;
        ['yancotab_browser_v1', 'yancotab_weather_v1'].forEach((k) => localStorage.removeItem(k));
        alert('Caches cleared.');
      }),
      this._actionRow('Export Data', 'Download settings and user data as JSON', () => {
        const storage = this.kernel.storage;
        if (storage) {
          const exportData = storage.exportAll();
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          const objectUrl = URL.createObjectURL(blob);
          a.href = objectUrl;
          a.download = `yancotab-export-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        } else {
          // Fallback: raw export
          const data = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('yancotab')) data[key] = localStorage.getItem(key);
          }
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          const objectUrl = URL.createObjectURL(blob);
          a.href = objectUrl;
          a.download = 'yancotab-settings.json';
          a.click();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        }
      }),
      this._actionRow('Import Data', 'Restore from a previously exported file', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = () => {
          const file = input.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const json = JSON.parse(reader.result);
              const storage = this.kernel.storage;
              if (storage && json.exportVersion) {
                const result = storage.importAll(json);
                alert(`Import complete:\n• Imported: ${result.imported.length}\n• Skipped: ${result.skipped.length}\n• Errors: ${result.errors.length}`);
              } else {
                // Legacy import: raw keys
                if (!confirm('Import legacy settings file? This will overwrite current data.')) return;
                for (const [key, value] of Object.entries(json)) {
                  if (typeof key === 'string' && key.startsWith('yancotab')) {
                    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
                  }
                }
                alert('Legacy import complete.');
              }
              location.reload();
            } catch (e) {
              alert('Import failed: ' + e.message);
            }
          };
          reader.readAsText(file);
        };
        input.click();
      }),
      this._actionRow('Restore from Backup', 'Restore data from last import backup', () => {
        try {
          const raw = localStorage.getItem('yancotab_import_backup');
          if (!raw) { alert('No backup found.'); return; }
          const backup = JSON.parse(raw);
          const backupData = backup?.data;
          if (!backupData?.keys) { alert('Backup is empty or corrupted.'); return; }
          if (!confirm(`Restore from backup made on ${backupData.backupDate || 'unknown date'}?`)) return;
          const storage = this.kernel.storage;
          if (storage) {
            const result = storage.importAll(backupData);
            alert(`Restore complete:\n• Restored: ${result.imported.length}\n• Errors: ${result.errors.length}`);
          } else {
            alert('Storage service unavailable.');
          }
          location.reload();
        } catch (e) {
          alert('Restore failed: ' + e.message);
        }
      }),
      this._actionRow('Reset YancoTab', 'Erase layout, settings, and app data', () => {
        if (!confirm('This will delete YancoTab data. Continue?')) return;
        if (!confirm('Are you absolutely sure? This cannot be undone.')) return;
        const prefixes = ['yancotab', 'desktop_', 'dock_'];
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i) || '';
          if (prefixes.some((p) => key.startsWith(p))) toRemove.push(key);
        }
        toRemove.forEach((k) => localStorage.removeItem(k));
        location.reload();
      }, true),
    ]));
  }

  _renderAccessibility(container) {
    const get24 = () => {
      try {
        return Boolean(JSON.parse(localStorage.getItem('yancotab_clock_v2') || '{}').use24h);
      } catch {
        return false;
      }
    };

    const getMetric = () => {
      try {
        return (JSON.parse(localStorage.getItem('yancotab_weather_v1') || '{}').unit || 'c') === 'c';
      } catch {
        return true;
      }
    };

    container.appendChild(this._group('Region & Format', [
      this._toggleRow('24-Hour Time', 'Use 24-hour clock format', get24(), (next) => {
        const data = readJson('yancotab_clock_state_v3', {}, this.kernel.storage);
        data.use24h = next;
        this.kernel.storage.save('yancotab_clock_state_v3', data);
        window.dispatchEvent(new CustomEvent('yancotab:clock_update'));
      }),
      this._toggleRow('Metric Units', 'Use Celsius for weather', getMetric(), (next) => {
        const ws = this.kernel.getService('weather');
        if (ws) {
          const state = ws.getState();
          state.unit = next ? 'c' : 'f';
          ws.saveState(state);
        }
        window.dispatchEvent(new CustomEvent('yancotab:weatherchange'));
      }),
    ]));
  }

  _renderAbout(container) {
    const ua = navigator.userAgent;
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
    const browserName = /Firefox/i.test(ua)
      ? 'Firefox'
      : /Edg/i.test(ua)
        ? 'Edge'
        : /Chrome/i.test(ua)
          ? 'Chrome'
          : /Safari/i.test(ua)
            ? 'Safari'
            : 'Browser';
    const platform = isMobile
      ? (/iPhone|iPad/i.test(ua) ? 'iOS/iPadOS' : 'Android')
      : (/Mac/i.test(ua) ? 'macOS' : /Win/i.test(ua) ? 'Windows' : /Linux/i.test(ua) ? 'Linux' : 'Desktop');

    container.appendChild(el('div', { class: 'ys-about-hero' }, [
      el('img', { class: 'ys-about-logo', src: './assets/icons/icon-128.png', alt: 'YancoTab' }),
      el('h2', { style: 'margin:0; font-size:25px;' }, 'YancoTab'),
      el('div', { class: 'ys-about-version' }, `Version ${VERSION} (Build ${BUILD})`),
    ]));

    container.appendChild(this._group('System Information', [
      this._aboutRow('Device Type', isMobile ? 'Mobile / Tablet' : 'Desktop'),
      this._aboutRow('Platform', platform),
      this._aboutRow('Browser', browserName),
      this._aboutRow('Screen', `${window.screen.width}×${window.screen.height}`),
      this._aboutRow('Viewport', `${window.innerWidth}×${window.innerHeight}`),
      this._aboutRow('Pixel Ratio', `${window.devicePixelRatio}x`),
      this._aboutRow('Touch', ('ontouchstart' in window) ? 'Supported' : 'Not Available'),
    ]));

    container.appendChild(this._group('Runtime', [
      this._aboutRow('Runtime', 'Browser (HTML5 + ES Modules)'),
      this._aboutRow('Storage', 'localStorage (on-device browser storage)'),
      this._aboutRow('Architecture', 'Mobile-first web shell'),
    ]));

    // Sync status — only in extension mode
    const storage = this.kernel.storage;
    if (storage && storage.isExtension()) {
      const status = storage.getStatus();
      const stateLabel = {
        active: '● Active',
        'fallback-local': '○ Local Only (quota/error)',
        error: '✕ Error',
        standalone: '—',
      };
      container.appendChild(this._group('Sync', [
        this._aboutRow('Mode', 'Chrome Extension'),
        this._aboutRow('Sync State', stateLabel[status.syncState] || status.syncState),
        this._aboutRow('Last Sync', status.lastSync ? new Date(status.lastSync).toLocaleTimeString() : 'Never'),
        status.lastError ? this._aboutRow('Last Error', status.lastError) : null,
        this._actionRow('Sync Now', 'Flush pending writes to Chrome sync', async () => {
          await storage.flush();
          alert('Sync flushed. Note: remote propagation timing depends on Chrome.');
          this._renderContent(this.activeCategory);
        }),
      ].filter(Boolean)));
    }

    // Support
    container.appendChild(this._group('Support', [
      this._actionRow('♥ Support YancoTab', 'Buy me a coffee on Ko-fi', () => {
        window.open('https://ko-fi.com/yamanaddas', '_blank', 'noopener,noreferrer');
      }),
    ]));

    const legal = el('div', { class: 'ys-legal' }, [
      el('p', { style: 'font-weight:700; color:#fff;' }, 'Legal & Service Disclaimer'),
      el('p', {}, 'YancoTab is a browser-based interface and does not replace your device operating system. Behavior may vary by browser engine and version.'),
      el('p', {}, 'Data you create in YancoTab is saved locally in this browser profile unless a feature explicitly opens a third-party website.'),
      el('p', {}, 'Third-party services used by default features include Open-Meteo APIs (weather/geocoding/air-quality) and Google Favicons API. Their own terms and privacy policies apply.'),
      el('p', {}, 'Shortcuts and web apps can open external sites such as YouTube, Netflix, social platforms, and maps services. Those services are independent and govern their own accounts, content, and privacy handling.'),
      el('p', {}, 'YancoTab is an independent project and is not affiliated with or endorsed by Apple, Google, Microsoft, OpenAI, or other third-party brands shown in icons or shortcuts.'),
      el('p', { style: 'color:#73757d;' }, '© 2026 Yaman Addas. All rights reserved.'),
    ]);

    container.appendChild(this._group('Legal', [legal]));
  }

  _group(title, children) {
    return el('section', { class: 'ys-group' }, [
      el('div', { class: 'ys-group-title' }, title),
      el('div', { class: 'ys-card' }, children),
    ]);
  }

  _toggleRow(label, desc, isOn, onToggle) {
    const row = el('div', { class: 'ys-row' });
    const info = el('div', { class: 'ys-info' }, [
      el('div', { class: 'ys-label' }, label),
      ...(desc ? [el('div', { class: 'ys-desc' }, desc)] : []),
    ]);

    const toggle = el('button', {
      type: 'button',
      class: `ys-toggle ${isOn ? 'on' : ''}`,
      'aria-pressed': String(isOn),
    }, [el('span', { class: 'ys-toggle-knob' })]);

    toggle.onclick = () => {
      const next = !toggle.classList.contains('on');
      toggle.classList.toggle('on', next);
      toggle.setAttribute('aria-pressed', String(next));
      onToggle(next);
    };

    row.append(info, toggle);
    return row;
  }

  _choiceRow(label, isSelected, onSelect) {
    return el('button', { type: 'button', class: 'ys-choice', onclick: onSelect }, [
      el('div', { class: 'ys-label' }, label),
      el('div', { class: 'ys-check', style: isSelected ? '' : 'visibility:hidden;' }, '✓'),
    ]);
  }

  _actionRow(label, desc, action, isDanger = false) {
    return el('button', { type: 'button', class: 'ys-action', onclick: action }, [
      el('div', { class: 'ys-info' }, [
        el('div', { class: `ys-label ${isDanger ? 'is-danger' : ''}` }, label),
        ...(desc ? [el('div', { class: 'ys-desc' }, desc)] : []),
      ]),
      el('div', { class: 'ys-chevron' }, '›'),
    ]);
  }

  _dataRow(label, value) {
    return el('div', { class: 'ys-row' }, [
      el('div', { class: 'ys-label' }, label),
      el('div', { class: 'ys-desc', style: 'margin-top:0; text-align:right;' }, value),
    ]);
  }

  _infoRow(label, text) {
    return el('div', { class: 'ys-row' }, [
      el('div', { class: 'ys-info' }, [
        el('div', { class: 'ys-label' }, label),
        el('div', { class: 'ys-desc' }, text),
      ]),
    ]);
  }

  _aboutRow(label, value) {
    return el('div', { class: 'ys-about-row' }, [
      el('div', { class: 'ys-about-key' }, label),
      el('div', { class: 'ys-about-value' }, value),
    ]);
  }
}