/**
 * AppsSettings.js — Apps tab for the Settings app
 *
 * Surfaces cross-app preferences: clock style, alarm audio,
 * weather effects, files/photos view+sort defaults.
 */

import { el } from '../../utils/dom.js';

/* ── Storage keys ── */

const CLOCK_KEY   = 'yancotab_clock_v3';
const FILES_VIEW  = 'yancotab_files_view';
const FILES_SORT  = 'yancotab_files_sort';
const PHOTOS_VIEW = 'yancotab_photos_view';
const PHOTOS_SORT = 'yancotab_photos_sort';

const ALARM_TONES = ['pulse', 'chime', 'soft'];

const FILE_SORT_OPTIONS = [
  { key: 'name', label: 'Name A-Z' },
  { key: 'name-desc', label: 'Name Z-A' },
  { key: 'date', label: 'Newest' },
  { key: 'date-old', label: 'Oldest' },
  { key: 'size', label: 'Largest' },
  { key: 'type', label: 'By Type' },
];

const PHOTO_SORT_OPTIONS = [
  { key: 'date', label: 'Newest' },
  { key: 'date-old', label: 'Oldest' },
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
];

/* ── Helpers ── */

function load(storage, key, fallback) {
  try { const v = storage.load(key); return v != null ? v : fallback; } catch { return fallback; }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ── Public entry point ── */

/**
 * @param {HTMLElement} container — scroll div
 * @param {object}      app      — SettingsApp instance
 */
export function renderApps(container, app) {
  const storage = app.kernel.storage;
  const rerender = () => app._renderContent();

  _clock(container, storage, app, rerender);
  _weather(container, storage, app);
  _files(container, storage, app, rerender);
  _photos(container, storage, app, rerender);
}

/* ── Clock ── */

function _clock(container, storage, app, rerender) {
  const state = load(storage, CLOCK_KEY, {
    mainClockStyle: 'digital',
    alarmAudio: { tone: 'pulse', volume: 0.45 },
  });
  const style = state.mainClockStyle || 'digital';
  const audio = state.alarmAudio || { tone: 'pulse', volume: 0.45 };

  container.appendChild(app._group('Clock', [
    // Clock face style
    _pillRow('Clock Face', ['digital', 'analog'], style, (picked) => {
      state.mainClockStyle = picked;
      storage.save(CLOCK_KEY, state);
      window.dispatchEvent(new CustomEvent('yancotab:clock_update'));
      rerender();
    }),
    // Alarm tone
    _pillRow('Alarm Tone', ALARM_TONES, audio.tone, (picked) => {
      audio.tone = picked;
      state.alarmAudio = audio;
      storage.save(CLOCK_KEY, state);
    }),
    // Alarm volume
    _sliderRow('Alarm Volume', audio.volume, 0.05, 1, 0.05, (val) => {
      audio.volume = val;
      state.alarmAudio = audio;
      storage.save(CLOCK_KEY, state);
    }),
  ]));
}

/* ── Weather ── */

function _weather(container, storage, app) {
  const ws = app.kernel.getService?.('weather');
  const state = ws?.getState?.() || {};
  const effectsOn = state.effectsEnabled !== false;

  container.appendChild(app._group('Weather', [
    app._toggleRow('Background Effects', 'Animated weather effects behind forecast', effectsOn, (next) => {
      if (ws) {
        const s = ws.getState();
        s.effectsEnabled = next;
        ws.saveState(s);
      }
    }),
  ]));
}

/* ── Files ── */

function _files(container, storage, app, rerender) {
  const view = load(storage, FILES_VIEW, 'grid');
  const sort = load(storage, FILES_SORT, 'name');

  container.appendChild(app._group('Files', [
    _pillRow('Default View', ['grid', 'list'], view, (picked) => {
      storage.save(FILES_VIEW, picked);
      rerender();
    }),
    _selectRow('Default Sort', FILE_SORT_OPTIONS, sort, (key) => {
      storage.save(FILES_SORT, key);
      rerender();
    }),
  ]));
}

/* ── Photos ── */

function _photos(container, storage, app, rerender) {
  const view = load(storage, PHOTOS_VIEW, 'grid');
  const sort = load(storage, PHOTOS_SORT, 'date');

  container.appendChild(app._group('Photos', [
    _pillRow('Default View', ['grid', 'list'], view, (picked) => {
      storage.save(PHOTOS_VIEW, picked);
      rerender();
    }),
    _selectRow('Default Sort', PHOTO_SORT_OPTIONS, sort, (key) => {
      storage.save(PHOTOS_SORT, key);
      rerender();
    }),
  ]));
}

/* ── UI building blocks ── */

function _pillRow(label, options, current, onChange) {
  const pills = el('div', { class: 'ys-pill-group' });
  options.forEach((opt) => {
    const btn = el('button', {
      type: 'button',
      class: 'ys-pill' + (opt === current ? ' selected' : ''),
      onclick: () => {
        pills.querySelectorAll('.ys-pill').forEach((p) => p.classList.remove('selected'));
        btn.classList.add('selected');
        onChange(opt);
      },
    }, capitalize(opt));
    pills.appendChild(btn);
  });
  return el('div', { class: 'ys-row' }, [
    el('div', { class: 'ys-label' }, label),
    pills,
  ]);
}

function _selectRow(label, options, currentKey, onChange) {
  const pills = el('div', { class: 'ys-pill-group' });
  options.forEach((opt) => {
    const btn = el('button', {
      type: 'button',
      class: 'ys-pill' + (opt.key === currentKey ? ' selected' : ''),
      onclick: () => {
        pills.querySelectorAll('.ys-pill').forEach((p) => p.classList.remove('selected'));
        btn.classList.add('selected');
        onChange(opt.key);
      },
    }, opt.label);
    pills.appendChild(btn);
  });
  return el('div', { class: 'ys-row' }, [
    el('div', { class: 'ys-label' }, label),
    pills,
  ]);
}

function _sliderRow(label, value, min, max, step, onChange) {
  const valLabel = el('span', { class: 'ys-slider-val' }, `${Math.round(value * 100)}%`);
  const slider = el('input', {
    type: 'range', class: 'ys-slider',
    min: String(min), max: String(max), step: String(step), value: String(value),
  });
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    valLabel.textContent = `${Math.round(v * 100)}%`;
    onChange(v);
  });
  return el('div', { class: 'ys-row' }, [
    el('div', { class: 'ys-info' }, [
      el('div', { class: 'ys-label' }, label),
      valLabel,
    ]),
    slider,
  ]);
}
