/**
 * BrowserSettings.js — Browser tab for the Settings app
 *
 * Search engine, start page theme, force-web-param toggle,
 * and privacy actions (clear history, clear bookmarks).
 */

import { showConfirm } from '../../ui/components/YancoModal.js';

const BROWSER_PREFS_KEY = 'yancotab_browser_prefs';
const BROWSER_STATE_KEY = 'yancotab_browser_v1';
const LEGACY_BOOKMARKS_KEY = 'yancotab_bookmarks';

/* ── Helpers ── */

function readJson(key, fallback, storage) {
  try {
    if (storage) { const d = storage.load(key); return d != null ? d : fallback; }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function getBrowserPrefs(storage) {
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

function setBrowserPrefs(nextPrefs, storage) {
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

/* ── Public entry point ── */

/**
 * @param {HTMLElement} container — scroll div
 * @param {object}      app      — SettingsApp instance
 */
export function renderBrowser(container, app) {
  const storage = app.kernel.storage;
  const prefs = getBrowserPrefs(storage);
  const updatePrefs = (patch) => {
    setBrowserPrefs({ ...prefs, ...patch }, storage);
    app._renderContent();
  };

  container.appendChild(app._group('Search Engine', [
    app._choiceRow('Google', prefs.searchEngine === 'google', () => updatePrefs({ searchEngine: 'google' })),
    app._choiceRow('DuckDuckGo', prefs.searchEngine === 'duck', () => updatePrefs({ searchEngine: 'duck' })),
    app._choiceRow('Bing', prefs.searchEngine === 'bing', () => updatePrefs({ searchEngine: 'bing' })),
  ]));

  container.appendChild(app._group('Start Page', [
    app._toggleRow('Force Browser Mode', 'Reduces native-app redirects', prefs.forceWebParam, (next) => updatePrefs({ forceWebParam: next })),
    app._choiceRow('Aurora', prefs.startTheme === 'aurora', () => updatePrefs({ startTheme: 'aurora' })),
    app._choiceRow('Graphite', prefs.startTheme === 'graphite', () => updatePrefs({ startTheme: 'graphite' })),
    app._choiceRow('Midnight', prefs.startTheme === 'midnight', () => updatePrefs({ startTheme: 'midnight' })),
  ]));

  container.appendChild(app._group('Privacy & Data', [
    app._actionRow('Clear Browsing History', 'Remove saved recent links', async () => {
      if (!await showConfirm('Clear History', 'Remove all saved recent links?', { danger: true })) return;
      const state = readJson(BROWSER_STATE_KEY, {}, storage);
      state.history = [];
      storage.save(BROWSER_STATE_KEY, state);
      app.kernel.emit('toast', { message: 'History cleared', type: 'success' });
    }, true),
    app._actionRow('Clear Bookmarks', 'Remove saved bookmarks', async () => {
      if (!await showConfirm('Clear Bookmarks', 'Remove all saved bookmarks?', { danger: true })) return;
      const state = readJson(BROWSER_STATE_KEY, {}, storage);
      state.bookmarks = [];
      storage.save(BROWSER_STATE_KEY, state);
      localStorage.removeItem(LEGACY_BOOKMARKS_KEY);
      app.kernel.emit('toast', { message: 'Bookmarks cleared', type: 'success' });
    }, true),
  ]));
}
