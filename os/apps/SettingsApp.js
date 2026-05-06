import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { VERSION, BUILD } from '../version.js';
import { getThemeMode, applyThemeMode } from '../theme/theme.js';
import { THEMES, applyColorTheme, applyWallpaper, getSavedTheme } from '../theme/themes.js';
import { renderGames } from './settings/GamesSettings.js';

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
  const defaults = { searchEngine, forceWebParam: true, historyLimit: 20, startTheme: 'aurora' };
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
    this.state = { activeCategory: 'appearance' };
  }

  async init() {
    this.root = el('div', { class: 'app-window ys-settings-app' });

    const sidebar = el('div', { class: 'ys-sidebar' });
    this.contentArea = el('div', { class: 'ys-content' });

    this.categories = [
      { id: 'appearance', label: 'Appearance', icon: '🎨' },
      { id: 'homescreen', label: 'Home', icon: '📱' },
      { id: 'games', label: 'Games', icon: '🎮' },
      { id: 'browser', label: 'Browser', icon: '🌐' },
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
      appearance: 'Appearance',
      homescreen: 'Home Screen',
      games: 'Games',
      browser: 'Browser',
      about: 'About',
    };
    const header = el('div', { class: 'ys-header' }, [
      el('div', { class: 'ys-title' }, titles[this.state.activeCategory] || 'Settings'),
      el('button', { type: 'button', class: 'ys-btn', onclick: () => this.close() }, 'Done'),
    ]);
    const scroll = el('div', { class: 'ys-scroll' });

    switch (this.state.activeCategory) {
      case 'appearance': this._renderAppearance(scroll); break;
      case 'homescreen': this._renderHomeScreen(scroll); break;
      case 'games': this._renderGames(scroll); break;
      case 'browser': this._renderBrowser(scroll); break;
      case 'about': this._renderAbout(scroll); break;
      default: this._renderAppearance(scroll);
    }
    this.contentArea.append(header, scroll);
  }

  _renderAppearance(container) {
    // Profile — name editing
    const nameInput = el('input', { type: 'text', class: 'ys-name-input', placeholder: 'Your name', maxlength: '30' });
    nameInput.value = this.kernel.storage.load('yancotab_user_name') || '';
    let debounce = null;
    nameInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        this.kernel.storage.save('yancotab_user_name', nameInput.value.trim().slice(0, 30));
        window.dispatchEvent(new CustomEvent('yancotab:name_changed'));
      }, 400);
    });
    container.appendChild(this._group('Profile', [
      el('div', { class: 'ys-row' }, [
        el('div', { class: 'ys-info' }, [el('div', { class: 'ys-label' }, 'Name'), el('div', { class: 'ys-desc' }, 'Shown in the greeting')]),
        nameInput,
      ]),
    ]));

    const isDarkMode = getThemeMode() !== 'light';
    container.appendChild(this._group('Appearance', [
      this._toggleRow('Dark Mode', 'Use dark interface colors', isDarkMode, (nextOn) => {
        applyThemeMode(nextOn ? 'dark' : 'light');
      }),
    ]));

    const themeEntries = Object.entries(THEMES);
    const specialModes = [{ id: 'cosmic', name: 'Cosmic' }, { id: 'starfield', name: 'Starfield' }];
    const currentTheme = getSavedTheme();
    const grid = el('div', { class: 'ys-wallpaper-grid' });

    themeEntries.forEach(([id, theme]) => {
      const bgStyle = `background:${theme.wallpaper}; background-size:cover; background-position:center;`;
      const option = el('button', {
        type: 'button',
        class: 'ys-wallpaper' + (id === currentTheme ? ' selected' : ''),
        style: bgStyle,
      }, [el('div', { class: 'ys-wallpaper-label' }, theme.name)]);
      option.onclick = () => {
        applyColorTheme(id);
        applyWallpaper(id);
        this.kernel.storage.save(WALLPAPER_KEY, theme.wallpaper);
        grid.querySelectorAll('.ys-wallpaper.selected').forEach((e) => e.classList.remove('selected'));
        option.classList.add('selected');
      };
      grid.appendChild(option);
    });

    specialModes.forEach((mode) => {
      const bgStyle = mode.id === 'cosmic'
        ? 'background:linear-gradient(135deg, #060b14 0%, #0a1628 50%, #060b14 100%); opacity:0.7;'
        : 'background:radial-gradient(circle at 50% 50%, #0d1b2e 0%, #060b14 100%);';
      const option = el('button', {
        type: 'button',
        class: 'ys-wallpaper' + (mode.id === currentTheme ? ' selected' : ''),
        style: bgStyle,
      }, [el('div', { class: 'ys-wallpaper-label' }, mode.name)]);
      option.onclick = () => {
        const shell = document.getElementById('app-shell') || document.body;
        shell.classList.remove('cosmic-wallpaper');
        if (mode.id === 'cosmic') {
          shell.classList.add('cosmic-wallpaper');
        } else {
          shell.style.background = 'transparent';
          shell.style.backgroundSize = '';
          shell.style.backgroundPosition = '';
        }
        applyColorTheme('emerald');
        this.kernel.storage.save(WALLPAPER_KEY, mode.id);
        grid.querySelectorAll('.ys-wallpaper.selected').forEach((e) => e.classList.remove('selected'));
        option.classList.add('selected');
      };
      grid.appendChild(option);
    });

    container.appendChild(this._group('Theme', [grid]));

    const get24 = () => { try { return Boolean(JSON.parse(localStorage.getItem('yancotab_clock_v2') || '{}').use24h); } catch { return false; } };
    const getMetric = () => { try { return (JSON.parse(localStorage.getItem('yancotab_weather_v1') || '{}').unit || 'c') === 'c'; } catch { return true; } };
    container.appendChild(this._group('Region & Format', [
      this._toggleRow('24-Hour Time', 'Use 24-hour clock format', get24(), (next) => {
        const data = readJson('yancotab_clock_state_v3', {}, this.kernel.storage);
        data.use24h = next;
        this.kernel.storage.save('yancotab_clock_state_v3', data);
        window.dispatchEvent(new CustomEvent('yancotab:clock_update'));
      }),
      this._toggleRow('Metric Units', 'Use Celsius for weather', getMetric(), (next) => {
        const ws = this.kernel.getService('weather');
        if (ws) { const state = ws.getState(); state.unit = next ? 'c' : 'f'; ws.saveState(state); }
        window.dispatchEvent(new CustomEvent('yancotab:weatherchange'));
      }),
    ]));
  }

  _renderGames(scroll) {
    renderGames(scroll, this);
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

    container.appendChild(this._group('Tips', [
      this._infoRow('Shortcuts', 'Long-press desktop background to add web shortcuts'),
      this._infoRow('Quick Actions', 'Long-press any app for quick actions'),
    ]));
  }

  // ─── Browser ─────────────────────────────────────────────

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

    container.appendChild(this._group('Start Page', [
      this._toggleRow('Force Browser Mode', 'Reduces native-app redirects', prefs.forceWebParam, (next) => updatePrefs({ forceWebParam: next })),
      this._choiceRow('Aurora', prefs.startTheme === 'aurora', () => updatePrefs({ startTheme: 'aurora' })),
      this._choiceRow('Graphite', prefs.startTheme === 'graphite', () => updatePrefs({ startTheme: 'graphite' })),
      this._choiceRow('Midnight', prefs.startTheme === 'midnight', () => updatePrefs({ startTheme: 'midnight' })),
    ]));

    container.appendChild(this._group('Privacy & Data', [
      this._actionRow('Clear Browsing History', 'Remove saved recent links', () => {
        if (!confirm('Clear browsing history?')) return;
        const state = readJson(BROWSER_STATE_KEY, {}, this.kernel.storage);
        state.history = [];
        this.kernel.storage.save(BROWSER_STATE_KEY, state);
        this.kernel.emit('toast', { message: 'History cleared', type: 'success' });
      }, true),
      this._actionRow('Clear Bookmarks', 'Remove saved bookmarks', () => {
        if (!confirm('Clear saved bookmarks?')) return;
        const state = readJson(BROWSER_STATE_KEY, {}, this.kernel.storage);
        state.bookmarks = [];
        this.kernel.storage.save(BROWSER_STATE_KEY, state);
        localStorage.removeItem(LEGACY_BOOKMARKS_KEY);
        this.kernel.emit('toast', { message: 'Bookmarks cleared', type: 'success' });
      }, true),
    ]));
  }

  _renderAbout(container) {
    const ua = navigator.userAgent, isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
    const browserName = /Firefox/i.test(ua) ? 'Firefox' : /Edg/i.test(ua) ? 'Edge' : /Chrome/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Browser';
    const platform = isMobile ? (/iPhone|iPad/i.test(ua) ? 'iOS/iPadOS' : 'Android') : (/Mac/i.test(ua) ? 'macOS' : /Win/i.test(ua) ? 'Windows' : /Linux/i.test(ua) ? 'Linux' : 'Desktop');

    container.appendChild(el('div', { class: 'ys-about-hero' }, [
      el('img', { class: 'ys-about-logo', src: './assets/icons/icon-128.png', alt: 'YancoTab' }),
      el('h2', { style: 'margin:0; font-size:25px;' }, 'YancoTab'),
      el('div', { class: 'ys-about-version' }, `Version ${VERSION} (Build ${BUILD})`),
    ]));

    container.appendChild(this._group('System', [
      this._aboutRow('Platform', `${platform} · ${browserName}`),
      this._aboutRow('Screen', `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`),
      this._aboutRow('Touch', ('ontouchstart' in window) ? 'Supported' : 'Not Available'),
    ]));

    let totalKeys = 0, totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('yancotab')) { totalKeys++; totalSize += (localStorage.getItem(k) || '').length * 2; } }
    container.appendChild(this._group('Storage', [
      this._aboutRow('YancoTab Data', `${(totalSize / 1024).toFixed(1)} KB · ${totalKeys} keys`),
    ]));

    container.appendChild(this._group('Data', [
      this._actionRow('Export Data', 'Download all settings as JSON', () => {
        const storage = this.kernel.storage;
        let exportData;
        if (storage) { exportData = storage.exportAll(); }
        else { exportData = {}; for (let j = 0; j < localStorage.length; j++) { const k = localStorage.key(j); if (k?.startsWith('yancotab')) exportData[k] = localStorage.getItem(k); } }
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `yancotab-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
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
                this.kernel.emit('toast', { message: `Imported ${result.imported.length} keys`, type: 'success' });
              } else {
                if (!confirm('Import legacy settings file? This will overwrite current data.')) return;
                for (const [key, value] of Object.entries(json)) {
                  if (typeof key === 'string' && key.startsWith('yancotab')) {
                    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
                  }
                }
                this.kernel.emit('toast', { message: 'Legacy import complete', type: 'success' });
              }
              location.reload();
            } catch (e) {
              this.kernel.emit('toast', { message: 'Import failed: ' + e.message, type: 'error' });
            }
          };
          reader.readAsText(file);
        };
        input.click();
      }),
      this._actionRow('Reset YancoTab', 'Erase all settings and app data', () => {
        if (!confirm('This will delete all YancoTab data. Continue?')) return;
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

    const storage = this.kernel.storage;
    if (storage && storage.isExtension()) {
      const status = storage.getStatus();
      const stateLabel = { active: '● Active', 'fallback-local': '○ Local Only', error: '✕ Error', standalone: '—' };
      container.appendChild(this._group('Sync', [
        this._aboutRow('Sync State', stateLabel[status.syncState] || status.syncState),
        this._aboutRow('Last Sync', status.lastSync ? new Date(status.lastSync).toLocaleTimeString() : 'Never'),
        status.lastError ? this._aboutRow('Last Error', status.lastError) : null,
        this._actionRow('Sync Now', 'Flush pending writes to Chrome sync', async () => {
          await storage.flush();
          this.kernel.emit('toast', { message: 'Sync flushed', type: 'success' });
          this._renderContent();
        }),
      ].filter(Boolean)));
    }

    container.appendChild(this._group('Support', [
      this._actionRow('❤ Support YancoTab', 'Buy me a coffee on Ko-fi', () => {
        window.open('https://ko-fi.com/yamanaddas', '_blank', 'noopener,noreferrer');
      }),
    ]));

    container.appendChild(this._group('Legal', [
      el('div', { class: 'ys-legal' }, [
        el('p', { style: 'font-weight:700; color:#fff;' }, 'Legal'),
        el('p', {}, 'Data is saved locally. Third-party: Open-Meteo (weather), Google Favicons.'),
        el('p', { style: 'color:#73757d;' }, '© 2026 Yaman Addas. All rights reserved.'),
      ]),
    ]));
  }

  _group(title, children) {
    return el('section', { class: 'ys-group' }, [
      el('div', { class: 'ys-group-title' }, title),
      el('div', { class: 'ys-card' }, children),
    ]);
  }

  _toggleRow(label, desc, isOn, onToggle) {
    const toggle = el('button', {
      type: 'button', class: `ys-toggle ${isOn ? 'on' : ''}`, 'aria-pressed': String(isOn),
    }, [el('span', { class: 'ys-toggle-knob' })]);
    toggle.onclick = () => {
      const next = !toggle.classList.contains('on');
      toggle.classList.toggle('on', next);
      toggle.setAttribute('aria-pressed', String(next));
      onToggle(next);
    };
    return el('div', { class: 'ys-row' }, [
      el('div', { class: 'ys-info' }, [
        el('div', { class: 'ys-label' }, label),
        ...(desc ? [el('div', { class: 'ys-desc' }, desc)] : []),
      ]),
      toggle,
    ]);
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
