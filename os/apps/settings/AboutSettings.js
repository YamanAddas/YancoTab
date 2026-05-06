/**
 * AboutSettings.js — About tab for the Settings app
 *
 * System info, storage usage, data export/import/reset,
 * sync status (extension only), support link, legal.
 */

import { el } from '../../utils/dom.js';
import { VERSION, BUILD } from '../../version.js';

/**
 * @param {HTMLElement} container — scroll div
 * @param {object}      app      — SettingsApp instance
 */
export function renderAbout(container, app) {
  const storage = app.kernel.storage;

  _hero(container);
  _system(container, app);
  _storageInfo(container, app);
  _dataActions(container, app, storage);
  _sync(container, app, storage);
  _support(container, app);
  _legal(container, app);
}

/* ── Hero ── */

function _hero(container) {
  container.appendChild(el('div', { class: 'ys-about-hero' }, [
    el('img', { class: 'ys-about-logo', src: './assets/icons/icon-128.png', alt: 'YancoTab' }),
    el('h2', { style: 'margin:0; font-size:25px;' }, 'YancoTab'),
    el('div', { class: 'ys-about-version' }, `Version ${VERSION} (Build ${BUILD})`),
  ]));
}

/* ── System ── */

function _system(container, app) {
  const ua = navigator.userAgent;
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browserName = /Firefox/i.test(ua) ? 'Firefox' : /Edg/i.test(ua) ? 'Edge' : /Chrome/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Browser';
  const platform = isMobile
    ? (/iPhone|iPad/i.test(ua) ? 'iOS/iPadOS' : 'Android')
    : (/Mac/i.test(ua) ? 'macOS' : /Win/i.test(ua) ? 'Windows' : /Linux/i.test(ua) ? 'Linux' : 'Desktop');

  container.appendChild(app._group('System', [
    app._aboutRow('Platform', `${platform} · ${browserName}`),
    app._aboutRow('Screen', `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`),
    app._aboutRow('Touch', ('ontouchstart' in window) ? 'Supported' : 'Not Available'),
  ]));
}

/* ── Storage Info ── */

function _storageInfo(container, app) {
  let totalKeys = 0, totalSize = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('yancotab')) { totalKeys++; totalSize += (localStorage.getItem(k) || '').length * 2; }
  }
  container.appendChild(app._group('Storage', [
    app._aboutRow('YancoTab Data', `${(totalSize / 1024).toFixed(1)} KB · ${totalKeys} keys`),
  ]));
}

/* ── Data Actions (export / import / reset) ── */

function _dataActions(container, app, storage) {
  container.appendChild(app._group('Data', [
    app._actionRow('Export Data', 'Download all settings as JSON', () => {
      let exportData;
      if (storage) { exportData = storage.exportAll(); }
      else {
        exportData = {};
        for (let j = 0; j < localStorage.length; j++) {
          const k = localStorage.key(j);
          if (k?.startsWith('yancotab')) exportData[k] = localStorage.getItem(k);
        }
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `yancotab-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }),
    app._actionRow('Import Data', 'Restore from a previously exported file', () => {
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
            if (storage && json.exportVersion) {
              const result = storage.importAll(json);
              app.kernel.emit('toast', { message: `Imported ${result.imported.length} keys`, type: 'success' });
            } else {
              if (!confirm('Import legacy settings file? This will overwrite current data.')) return;
              for (const [key, value] of Object.entries(json)) {
                if (typeof key === 'string' && key.startsWith('yancotab')) {
                  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
                }
              }
              app.kernel.emit('toast', { message: 'Legacy import complete', type: 'success' });
            }
            location.reload();
          } catch (e) {
            app.kernel.emit('toast', { message: 'Import failed: ' + e.message, type: 'error' });
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }),
    app._actionRow('Reset YancoTab', 'Erase all settings and app data', () => {
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
}

/* ── Sync (extension only) ── */

function _sync(container, app, storage) {
  if (!storage || !storage.isExtension()) return;

  const status = storage.getStatus();
  const stateLabel = { active: '● Active', 'fallback-local': '○ Local Only', error: '✕ Error', standalone: '—' };
  container.appendChild(app._group('Sync', [
    app._aboutRow('Sync State', stateLabel[status.syncState] || status.syncState),
    app._aboutRow('Last Sync', status.lastSync ? new Date(status.lastSync).toLocaleTimeString() : 'Never'),
    status.lastError ? app._aboutRow('Last Error', status.lastError) : null,
    app._actionRow('Sync Now', 'Flush pending writes to Chrome sync', async () => {
      await storage.flush();
      app.kernel.emit('toast', { message: 'Sync flushed', type: 'success' });
      app._renderContent();
    }),
  ].filter(Boolean)));
}

/* ── Support ── */

function _support(container, app) {
  container.appendChild(app._group('Support', [
    app._actionRow('❤ Support YancoTab', 'Buy me a coffee on Ko-fi', () => {
      window.open('https://ko-fi.com/yamanaddas', '_blank', 'noopener,noreferrer');
    }),
  ]));
}

/* ── Legal ── */

function _legal(container, app) {
  container.appendChild(app._group('Legal', [
    el('div', { class: 'ys-legal' }, [
      el('p', { style: 'font-weight:700; color:#fff;' }, 'Legal'),
      el('p', {}, 'Data is saved locally. Third-party: Open-Meteo (weather), Google Favicons.'),
      el('p', { style: 'color:#73757d;' }, '© 2026 Yaman Addas. All rights reserved.'),
    ]),
  ]));
}
