/**
 * BrowserApp — Wormholes redesign.
 *
 * 2-column layout: star map (left, 1fr) + side rail (right, 320px).
 * Toolbar above hosts nav buttons + URL input + engine pills + add.
 * Title bar tabs (Star map / Reader / History / Tabs) — Star map is
 * fully wired in PR-2; the others land later.
 *
 * Bookmark visit count, recency, and clustering all come from the
 * pure helpers in os/apps/browser/engine/. The shell just dispatches
 * intents and repaints.
 */

import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { showConfirm, showPrompt } from '../ui/components/YancoModal.js';
import { loadState, saveState, subscribe } from './browser/persistence.js';
import * as intent from './browser/intents.js';
import { buildToolbar } from './browser/view/toolbar.js';
import { buildStarMap } from './browser/view/starMap.js';
import { buildSideRail } from './browser/view/sideRail.js';
import { hostFromUrl } from './browser/engine/state.js';

const TABS = ['Star map', 'Reader', 'History', 'Tabs'];

const DEFAULT_PREFS = {
  searchEngine: 'google',
  forceWebParam: true,
  historyLimit: 50,
  startTheme: 'aurora',
};
const PREFS_KEY = 'yancotab_browser_prefs_v1';
const SAFE_PROTOCOLS = new Set(['https:', 'http:', 'tel:', 'mailto:', 'sms:']);

const SHORTCUTS = {
  google:    'https://www.google.com',
  youtube:   'https://www.youtube.com',
  yt:        'https://www.youtube.com',
  github:    'https://github.com',
  gh:        'https://github.com',
  reddit:    'https://www.reddit.com',
  wikipedia: 'https://www.wikipedia.org',
  twitter:   'https://x.com',
  x:         'https://x.com',
  netflix:   'https://www.netflix.com',
};

function css(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  return link;
}

export class BrowserApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Browser', id: 'browser', icon: 'assets/browser-icon.png' };
    this._state = null;
    this._prefs = { ...DEFAULT_PREFS };
    this._unsubscribe = null;
    this._activeTab = 'Star map';
    this._views = {};
    this._styleLinks = [];
    this._tickHandle = null;
  }

  async init() {
    this._styleLinks = [css('css/browser.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));

    this._state = loadState(this.kernel);
    this._prefs = this._loadPrefs();

    this._unsubscribe = subscribe(this.kernel, (s) => {
      this._state = s;
      this._renderAll();
    });

    this.root = el('div', { class: 'app-window app-browser-v2', tabindex: '0' });
    this.root.appendChild(this._buildFrame());
    this._renderAll();

    // 30-second tick refreshes the relative time labels in the Recent
    // trail (just-now → 1m ago → 17m ago, etc).
    this._tickHandle = setInterval(() => this._renderAll(), 30_000);

    // ⌘K / Ctrl+K to focus the URL input.
    this.root.addEventListener('keydown', (e) => {
      const isCmdK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K');
      if (isCmdK) {
        e.preventDefault();
        this._views.toolbar?.focusUrl();
      }
    });
  }

  destroy() {
    if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null; }
    if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
    if (this._styleLinks) {
      for (const l of this._styleLinks) l.remove();
      this._styleLinks = [];
    }
    super.destroy();
  }

  _buildFrame() {
    // Title bar (tabs only — WindowChrome owns controls + window title).
    const titlebar = el('div', { class: 'wh-titlebar' });
    const tabs = el('div', { class: 'wh-tabs' });
    for (const name of TABS) {
      const t = el('button', {
        type: 'button',
        class: `wh-tab${name === this._activeTab ? ' is-active' : ''}`,
        'data-tab': name,
      }, name);
      t.addEventListener('click', () => this._setTab(name));
      tabs.appendChild(t);
    }
    titlebar.appendChild(tabs);

    // Toolbar
    this._views.toolbar = buildToolbar({
      onNavigate: (input) => this._navigate(input),
      onAddPortal: (seed) => this._addPortalPrompt(seed),
      onPickEngine: (id) => this._setEngine(id),
      onClearHistory: () => this._clearHistoryPrompt(),
    });

    // Star map (stage)
    this._views.starMap = buildStarMap({
      onOpenPortal: (b) => this._navigate(b.url),
      onContextMenu: (b) => this._portalContextMenu(b),
    });

    // Side rail
    this._views.sideRail = buildSideRail({
      onOpenUrl: (url) => this._navigate(url),
    });

    // Tab placeholder for non-Star-map tabs.
    this._views.placeholder = el('div', { class: 'wh-tab-placeholder' });
    this._views.placeholder.style.display = 'none';

    // Layout: stage + side rail in a 2-column grid.
    const stage = el('div', { class: 'wh-stage' }, [this._views.starMap.root, this._views.placeholder]);
    this._views.stage = stage;
    const layout = el('div', { class: 'wh-layout' }, [stage, this._views.sideRail.root]);

    return el('div', { class: 'wh-frame' }, [titlebar, this._views.toolbar.root, layout]);
  }

  // ── State actions ────────────────────────────────────────

  _commit(next) {
    if (next === this._state) return;
    this._state = next;
    saveState(this.kernel, next);
    this._renderAll();
  }

  _navigate(input) {
    const url = this._resolveUrl(input);
    if (!url) return;
    this._commit(intent.navigated(this._state, url));
    this._openExternal(url);
  }

  async _addPortalPrompt(seed = '') {
    const prefilled = this._resolveUrl(seed) || 'https://';
    const urlRaw = await showPrompt('Add portal', 'URL:', prefilled);
    if (!urlRaw) return;
    const url = this._resolveUrl(urlRaw);
    if (!url) return;
    const labelRaw = await showPrompt('Portal name', 'Label:', hostFromUrl(url) || 'Saved');
    if (labelRaw === null) return;
    this._commit(intent.addBookmark(this._state, { label: labelRaw || hostFromUrl(url), url }));
  }

  async _portalContextMenu(b) {
    const newName = await showPrompt(`Edit "${b.label}"`, 'New label (or empty to delete):', b.label);
    if (newName === null) return;
    if (newName.trim() === '') {
      const ok = await showConfirm('Delete portal', `Delete "${b.label}"?`, { danger: true });
      if (!ok) return;
      this._commit(intent.removeBookmark(this._state, b.id));
    } else {
      this._commit(intent.updateBookmark(this._state, b.id, { label: newName }));
    }
  }

  async _clearHistoryPrompt() {
    if (!this._state.history.length) return;
    const ok = await showConfirm('Clear history', 'Remove all visit history?', { danger: true });
    if (!ok) return;
    this._commit(intent.clearHistory(this._state));
  }

  _setEngine(engineId) {
    if (!['google', 'duck', 'bing'].includes(engineId)) return;
    this._prefs = { ...this._prefs, searchEngine: engineId };
    this._savePrefs();
    this._renderAll();
  }

  _setTab(name) {
    if (this._activeTab === name) return;
    this._activeTab = name;
    this._renderTabState();
  }

  // ── Render ───────────────────────────────────────────────

  _renderAll() {
    if (!this.root || !this._state) return;
    this._views.toolbar.update(this._state, this._prefs);
    this._views.starMap.update(this._state);
    this._views.sideRail.update(this._state);
    this._renderTabState();
  }

  _renderTabState() {
    for (const t of this.root.querySelectorAll('[data-tab]')) {
      t.classList.toggle('is-active', t.dataset.tab === this._activeTab);
    }
    const sm = this._views.starMap.root;
    const ph = this._views.placeholder;
    if (this._activeTab === 'Star map') {
      sm.style.display = '';
      ph.style.display = 'none';
      ph.textContent = '';
      return;
    }
    sm.style.display = 'none';
    ph.style.display = 'block';
    const blurbs = {
      Reader:  'Inline reader view — landing in the next update.',
      History: 'Full history with date grouping — landing in the next update.',
      Tabs:    'Pseudo-tab view — landing in the next update.',
    };
    ph.textContent = blurbs[this._activeTab] || '';
  }

  // ── Helpers ──────────────────────────────────────────────

  _loadPrefs() {
    try {
      const stored = this.kernel?.storage?.load?.(PREFS_KEY);
      if (stored && typeof stored === 'object') return { ...DEFAULT_PREFS, ...stored };
    } catch { /* ignore */ }
    return { ...DEFAULT_PREFS };
  }

  _savePrefs() {
    try { this.kernel?.storage?.save?.(PREFS_KEY, this._prefs); } catch { /* ignore */ }
    try { this.kernel?.storage?.save?.('yancotabSearchEngine', this._prefs.searchEngine); } catch { /* ignore */ }
  }

  /**
   * Resolve a user-typed string into a safe URL.
   * Same rules as the original BrowserApp: shortcut → expanded;
   * scheme-prefixed → as-is (if safe); domain-like → https://...;
   * else → search engine query URL.
   */
  _resolveUrl(input) {
    const text = String(input || '').trim();
    if (!text) return '';
    const lower = text.toLowerCase();
    if (SHORTCUTS[lower]) return SHORTCUTS[lower];

    if (/^[a-z]+:\/\//i.test(text) || /^[a-z]+:/i.test(text)) {
      try {
        const u = new URL(text);
        if (!SAFE_PROTOCOLS.has(u.protocol)) return '';
        return u.toString();
      } catch { return ''; }
    }
    if (text.includes('.') && !text.includes(' ')) {
      try {
        const u = new URL(`https://${text}`);
        return u.toString();
      } catch { return ''; }
    }

    const q = encodeURIComponent(text);
    if (this._prefs.searchEngine === 'duck') return `https://duckduckgo.com/?q=${q}`;
    if (this._prefs.searchEngine === 'bing') return `https://www.bing.com/search?q=${q}`;
    return `https://www.google.com/search?q=${q}`;
  }

  _openExternal(url) {
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (popup) return;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
