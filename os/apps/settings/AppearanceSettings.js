/**
 * AppearanceSettings.js — Appearance tab for the Settings app
 *
 * Profile name, dark mode, theme picker, wallpaper grid,
 * and region/format toggles (24h clock, metric units).
 */

import { el } from '../../utils/dom.js';
import { getStoredMode, applyThemeMode } from '../../theme/theme.js';
import { THEMES, applyColorTheme, applyWallpaper, getSavedTheme } from '../../theme/themes.js';

const WALLPAPER_KEY = 'yancotab_wallpaper';

function readJson(key, fallback, storage) {
  try {
    if (storage) { const d = storage.load(key); return d != null ? d : fallback; }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

/**
 * @param {HTMLElement} container — scroll div
 * @param {object}      app      — SettingsApp instance
 */
export function renderAppearance(container, app) {
  const storage = app.kernel.storage;

  _profile(container, app, storage);
  _darkMode(container, app);
  _themeGrid(container, app, storage);
  _motion(container, app);
  _regionFormat(container, app, storage);
}

/* ── Profile ── */

function _profile(container, app, storage) {
  const nameInput = el('input', {
    type: 'text', class: 'ys-name-input', placeholder: 'Your name', maxlength: '30',
  });
  nameInput.value = storage.load('yancotab_user_name') || '';
  let debounce = null;
  nameInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      storage.save('yancotab_user_name', nameInput.value.trim().slice(0, 30));
      window.dispatchEvent(new CustomEvent('yancotab:name_changed'));
    }, 400);
  });
  container.appendChild(app._group('Profile', [
    el('div', { class: 'ys-row' }, [
      el('div', { class: 'ys-info' }, [
        el('div', { class: 'ys-label' }, 'Name'),
        el('div', { class: 'ys-desc' }, 'Shown in the greeting'),
      ]),
      nameInput,
    ]),
  ]));
}

/* ── Theme Mode (3-state: Dark / Light / Auto) ── */

function _darkMode(container, app) {
  const current = getStoredMode() || 'auto';
  const segGroup = el('div', { class: 'ys-seg-group', role: 'radiogroup', 'aria-label': 'Theme mode' });

  const opts = [
    { id: 'dark',  label: 'Dark' },
    { id: 'light', label: 'Light' },
    { id: 'auto',  label: 'Auto' },
  ];

  opts.forEach(({ id, label }) => {
    const btn = el('button', {
      type: 'button',
      class: 'ys-seg' + (current === id ? ' is-active' : ''),
      role: 'radio',
      'aria-checked': String(current === id),
      'data-mode': id,
    }, label);
    btn.onclick = () => {
      segGroup.querySelectorAll('.ys-seg').forEach((b) => {
        b.classList.remove('is-active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-checked', 'true');
      applyThemeMode(id);
    };
    segGroup.appendChild(btn);
  });

  container.appendChild(app._group('Appearance', [
    el('div', { class: 'ys-row' }, [
      el('div', { class: 'ys-info' }, [
        el('div', { class: 'ys-label' }, 'Theme'),
        el('div', { class: 'ys-desc' }, 'Auto follows your system theme'),
      ]),
      segGroup,
    ]),
  ]));
}

/* ── Theme / Wallpaper Grid ── */

function _themeGrid(container, app, storage) {
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
      storage.save(WALLPAPER_KEY, theme.wallpaper);
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
      storage.save(WALLPAPER_KEY, mode.id);
      grid.querySelectorAll('.ys-wallpaper.selected').forEach((e) => e.classList.remove('selected'));
      option.classList.add('selected');
    };
    grid.appendChild(option);
  });

  container.appendChild(app._group('Theme', [grid]));
}

/* ── Motion (background animation toggle) ── */

function _motion(container, app) {
  const storage = app.kernel.storage;
  const stored = storage?.load('yancotab_starfield_enabled');
  const isOn = stored === null || stored === undefined ? true : Boolean(stored);

  container.appendChild(app._group('Motion', [
    app._toggleRow('Background Animation', 'Twinkling stars on solid wallpapers', isOn, (next) => {
      storage?.save('yancotab_starfield_enabled', Boolean(next));
      // Dispatch a theme_change event — starfield already listens and will
      // start/stop accordingly without double-registering listeners.
      window.dispatchEvent(new CustomEvent('yancotab:theme_change', {
        detail: { reason: 'starfield-toggle' },
      }));
    }),
  ]));
}

/* ── Region & Format ── */

function _regionFormat(container, app, storage) {
  // ClockApp's canonical storage key is yancotab_clock_v3. Pre-fix this
  // toggle wrote to a phantom yancotab_clock_state_v3 (registered but
  // unused) and read from yancotab_clock_v2 (not registered at all),
  // so flipping it visually moved the switch but ClockApp never saw it.
  const get24 = () => {
    const data = readJson('yancotab_clock_v3', null, storage);
    return Boolean(data?.use24h);
  };
  const getMetric = () => {
    try { return (JSON.parse(localStorage.getItem('yancotab_weather_v1') || '{}').unit || 'c') === 'c'; }
    catch { return true; }
  };

  container.appendChild(app._group('Region & Format', [
    app._toggleRow('24-Hour Time', 'Use 24-hour clock format', get24(), (next) => {
      const data = readJson('yancotab_clock_v3', {}, storage) || {};
      data.use24h = next;
      storage.save('yancotab_clock_v3', data);
      // ClockApp listens for yancotab:clock_update and re-reads its state.
      window.dispatchEvent(new CustomEvent('yancotab:clock_update'));
    }),
    app._toggleRow('Metric Units', 'Use Celsius for weather', getMetric(), (next) => {
      const ws = app.kernel.getService('weather');
      if (ws) { const state = ws.getState(); state.unit = next ? 'c' : 'f'; ws.saveState(state); }
      window.dispatchEvent(new CustomEvent('yancotab:weatherchange'));
    }),
  ]));
}
