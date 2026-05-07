/**
 * PomodoroApp — Solar Cycle. Two-column layout: stage on the left
 * (sky band + timer ring + heading + controls + cycle pips), side
 * rail on the right (week placeholder + presets + ambient placeholder).
 *
 * The shell is a thin coordinator: load engine state on init, drive a
 * 1s tick that dispatches TICK + repaints, and dispatch user actions
 * to the pure reducer in os/apps/pomodoro/engine.
 */

import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { apply } from './pomodoro/engine/reducer.js';
import { effectiveSky, remainingMs, phaseDurationMs } from './pomodoro/engine/state.js';
import { getPreset } from './pomodoro/engine/presets.js';
import { appendSession } from './pomodoro/engine/history.js';
import { loadState, saveState, loadHistory, saveHistory, loadSettings, saveSettings } from './pomodoro/persistence.js';
import { buildSky } from './pomodoro/view/sky.js';
import { buildTimerRing } from './pomodoro/view/timerRing.js';
import { buildTimerInfo } from './pomodoro/view/timerInfo.js';
import { buildPresetsRail } from './pomodoro/view/presetsRail.js';
import { buildStatsTab } from './pomodoro/view/statsTab.js';
import * as intent from './pomodoro/intents.js';

const TABS = ['Today', 'Season', 'Stats', 'Settings'];

function css(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  return link;
}

export class PomodoroApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Pomodoro', id: 'pomodoro', icon: '🍅' };
    this._state = null;
    this._history = null;
    this._settings = null;
    this._tickHandle = null;
    this._styleLinks = [];
    this._activeTab = 'Today';
    this._views = {};
  }

  async init() {
    this._styleLinks = [css('css/pomodoro.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));

    this._settings = loadSettings(this.kernel);
    this._history = loadHistory(this.kernel);
    this._state = loadState(this.kernel);

    // Honor active preset from settings on load (only if currently idle).
    if (this._state.phase === 'idle' && this._state.presetId !== this._settings.activePresetId) {
      this._state = { ...this._state, presetId: this._settings.activePresetId };
    }

    this.root = el('div', { class: 'app-window app-pomodoro', tabindex: '0' });
    this.root.appendChild(this._buildFrame());

    this._renderAll();

    // Drive 1s tick that fires TICK and repaints. Reducer rolls the
    // day key + advances phase if the current one has expired.
    this._tickHandle = setInterval(() => {
      this._dispatch(intent.tick());
      this._renderAll();
    }, 1000);
  }

  _buildFrame() {
    // ── Titlebar ──
    const titlebar = el('div', { class: 'sol-titlebar' });
    titlebar.appendChild(el('div', { class: 'sol-traffic' }, [
      el('i', { class: 'sol-light is-red' }),
      el('i', { class: 'sol-light is-amber' }),
      el('i', { class: 'sol-light is-green' }),
    ]));
    titlebar.appendChild(el('div', { class: 'sol-name' }, [
      el('b', {}, 'pomodoro'),
      document.createTextNode(' / solar cycle'),
    ]));
    const tabs = el('div', { class: 'sol-tabs' });
    for (const name of TABS) {
      const isActive = name === this._activeTab;
      const tab = el('button', {
        class: `sol-tab${isActive ? ' is-active' : ''}`,
        type: 'button',
        'data-tab': name,
      }, name);
      tab.addEventListener('click', () => this._setTab(name));
      tabs.appendChild(tab);
    }
    titlebar.appendChild(tabs);

    // ── Stage (left) ──
    this._views.sky = buildSky({ onTap: () => this._dispatch(intent.toggleSky()) });
    this._views.ring = buildTimerRing();
    this._views.info = buildTimerInfo({
      onPrimary: () => this._handlePrimary(),
      onExtend: () => this._dispatch(intent.extend(5 * 60_000)),
      onSkip: () => this._dispatch(intent.skipBreak()),
      onEnd: () => this._dispatch(intent.endCycle()),
    });

    const timerBlock = el('div', { class: 'sol-timer-block' }, [
      this._views.ring.root,
      this._views.info.root,
    ]);
    this._views.todayBlock = el('div', { class: 'sol-today-block' }, [timerBlock]);

    // Stats tab content (built once, repainted on update).
    this._views.stats = buildStatsTab();
    this._views.stats.root.classList.add('sol-tab-panel', 'is-stats');
    this._views.stats.root.style.display = 'none';

    // Coming-soon notice for tabs other than Today/Stats (Season, Settings).
    this._views.placeholder = el('div', { class: 'sol-tab-placeholder' });

    const stage = el('div', { class: 'sol-stage' }, [
      this._views.sky.root,
      this._views.todayBlock,
      this._views.stats.root,
      this._views.placeholder,
    ]);
    this._views.stage = stage;

    // ── Side rail (right) ──
    this._views.side = buildPresetsRail({
      onPickPreset: (id) => this._handlePickPreset(id),
    });

    const layout = el('div', { class: 'sol-layout' }, [stage, this._views.side.root]);

    const frame = el('div', { class: 'sol-app-frame' }, [titlebar, layout]);
    return frame;
  }

  // ── Action handlers ────────────────────────────────────────────

  _handlePrimary() {
    const s = this._state;
    if (s.phase === 'idle') return this._dispatch(intent.start());
    if (s.paused) return this._dispatch(intent.resume());
    return this._dispatch(intent.pause());
  }

  _handlePickPreset(id) {
    if (this._state.phase !== 'idle') {
      this.kernel.emit('toast', { message: 'End the current cycle to switch presets', type: 'info' });
      return;
    }
    this._dispatch(intent.changePreset(id));
    if (this._state.presetId === id) {
      this._settings = { ...this._settings, activePresetId: id };
      saveSettings(this.kernel, this._settings);
    }
  }

  _setTab(name) {
    if (this._activeTab === name) return;
    this._activeTab = name;
    this._renderTabState();
  }

  // ── Reducer dispatch + side-effect plumbing ────────────────────

  _dispatch(action) {
    if (!this._state) return;
    const preset = getPreset(this._state.presetId);
    const { state, events } = apply(this._state, action, preset, Date.now());
    if (state === this._state) {
      // No-op action (e.g. TICK before expiry). Skip persist + side-effects.
      return;
    }
    this._state = state;
    saveState(this.kernel, state);

    for (const ev of events) {
      if (ev.type === 'toast') {
        this.kernel.emit('toast', { message: ev.message, type: ev.kind });
      } else if (ev.type === 'activity') {
        try {
          window.dispatchEvent(new CustomEvent('yancotab:activity', {
            detail: { type: 'pomodoro', label: ev.label },
          }));
        } catch { /* ignore */ }
      } else if (ev.type === 'sessionLogged') {
        this._history = appendSession(this._history, ev.entry);
        saveHistory(this.kernel, this._history);
      }
      // 'phase' events are listened for by the future widget — for PR-2 we ignore them locally.
    }

    // Repaint immediately for user-initiated actions (Start/Pause/Skip/etc).
    // The 1s tick only handles silent expiry transitions.
    this._renderAll();
  }

  // ── Render ─────────────────────────────────────────────────────

  _renderAll() {
    if (!this._state || !this.root) return;
    const preset = getPreset(this._state.presetId);
    const now = Date.now();
    const remaining = remainingMs(this._state, preset, now);
    const total = phaseDurationMs(this._state.phase, preset);

    // Sky
    this._views.sky.setMode(effectiveSky(this._state));
    this._views.sky.setProgress(total > 0 ? 1 - (remaining / total) : 0);

    // Ring
    const labelByPhase = {
      idle: 'Ready', focus: 'Focus', break: 'Break', longBreak: 'Long break',
    };
    const subLabel = this._state.paused ? 'Paused' : `of ${formatTotal(total)}`;
    this._views.ring.update({
      remainingMs: remaining,
      totalMs: total,
      label: labelByPhase[this._state.phase] || 'Focus',
      subLabel,
      phase: this._state.phase,
    });

    // Info + side
    this._views.info.update(this._state, preset, this._history);
    this._views.side.update(this._state, this._history, this._settings);
    this._views.stats.update(this._history, this._settings);

    // Stage night/day class for ambient tinting.
    const sky = effectiveSky(this._state);
    this._views.stage.classList.toggle('is-night', sky === 'night');

    this._renderTabState();
  }

  _renderTabState() {
    // Tab pills
    const tabEls = this.root.querySelectorAll('[data-tab]');
    for (const t of tabEls) {
      t.classList.toggle('is-active', t.dataset.tab === this._activeTab);
    }
    const today = this._views.todayBlock;
    const stats = this._views.stats.root;
    const ph = this._views.placeholder;
    const sky = this._views.sky?.root;
    if (!today || !stats || !ph) return;

    // Hide all variants first.
    today.style.display = 'none';
    stats.style.display = 'none';
    ph.style.display = 'none';
    ph.textContent = '';

    // Sky is a Today-only anchor; hiding it on other tabs frees ~180px
    // of vertical room for the tab content (and reads cleaner anyway).
    if (sky) sky.style.display = this._activeTab === 'Today' ? 'block' : 'none';

    if (this._activeTab === 'Today') {
      today.style.display = 'block';
      return;
    }
    if (this._activeTab === 'Stats') {
      stats.style.display = 'flex';
      return;
    }
    // Season + Settings — placeholder copy. Explicit 'block' overrides
    // the CSS default of `display: none`.
    ph.style.display = 'block';
    const blurbs = {
      Season: 'Month overview + heatmap — landing in the next update.',
      Settings: 'Custom preset durations, ambient toggles, attached app — landing in the next update.',
    };
    ph.textContent = blurbs[this._activeTab] || '';
  }

  destroy() {
    if (this._tickHandle) {
      clearInterval(this._tickHandle);
      this._tickHandle = null;
    }
    if (this._styleLinks) {
      for (const l of this._styleLinks) l.remove();
      this._styleLinks = [];
    }
    super.destroy();
  }
}

function formatTotal(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
