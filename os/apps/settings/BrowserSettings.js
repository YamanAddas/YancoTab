/**
 * BrowserSettings.js — Browser tab for the Settings app
 *
 * Start page theme, force-web-param toggle, and privacy actions
 * (clear history, clear bookmarks). Web search has no engine setting here:
 * it always uses the user's Chrome default search engine (webSearch.js).
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
  const defaults = { forceWebParam: true, historyLimit: 20, startTheme: 'aurora' };
  const stored = readJson(BROWSER_PREFS_KEY, {}, storage);
  const historyLimit = Number(stored.historyLimit);
  const clampedHistory = Number.isFinite(historyLimit)
    ? Math.max(10, Math.min(100, Math.round(historyLimit)))
    : defaults.historyLimit;
  return {
    forceWebParam: typeof stored.forceWebParam === 'boolean' ? stored.forceWebParam : defaults.forceWebParam,
    historyLimit: clampedHistory,
    startTheme: ['aurora', 'graphite', 'midnight'].includes(stored.startTheme) ? stored.startTheme : defaults.startTheme,
  };
}

function setBrowserPrefs(nextPrefs, storage) {
  const sanitized = {
    forceWebParam: nextPrefs?.forceWebParam !== false,
    historyLimit: Number.isFinite(Number(nextPrefs?.historyLimit))
      ? Math.max(10, Math.min(100, Math.round(Number(nextPrefs.historyLimit))))
      : 20,
    startTheme: ['aurora', 'graphite', 'midnight'].includes(nextPrefs?.startTheme) ? nextPrefs.startTheme : 'aurora',
  };
  if (storage) {
    storage.save(BROWSER_PREFS_KEY, sanitized);
  } else {
    localStorage.setItem(BROWSER_PREFS_KEY, JSON.stringify(sanitized));
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

  container.appendChild(app._group('Web Search', [
    app._infoRow('Search engine', "Uses your browser's default search engine. Change it in Chrome settings → Search engine."),
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
