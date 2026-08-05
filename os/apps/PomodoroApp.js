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
import { el, cssLink } from '../utils/dom.js';
import { effectiveSky, remainingMs, phaseDurationMs } from './pomodoro/engine/state.js';
import { getPreset } from './pomodoro/engine/presets.js';
import { loadState, loadHistory, loadSettings, saveSettings, STORAGE_KEYS, normalizeHistory } from './pomodoro/persistence.js';
import { runPomodoro } from './pomodoro/effects.js';
import { buildSky } from './pomodoro/view/sky.js';
import { buildTimerRing } from './pomodoro/view/timerRing.js';
import { buildTimerInfo } from './pomodoro/view/timerInfo.js';
import { buildPresetsRail } from './pomodoro/view/presetsRail.js';
import { buildStatsTab } from './pomodoro/view/statsTab.js';
import { buildSeasonTab } from './pomodoro/view/seasonTab.js';
import { buildSettingsTab } from './pomodoro/view/settingsTab.js';
import { buildAttachedRow } from './pomodoro/view/attachedRow.js';
import { createAmbient } from './pomodoro/ambient.js';
import * as intent from './pomodoro/intents.js';

const TABS = ['Today', 'Season', 'Stats', 'Settings'];


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
    this._ambient = createAmbient();
  }

  async init() {
    this._styleLinks = [cssLink('css/pomodoro.css')];
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

    // Learn about sessions another surface logged while this window is
    // open. When the widget wins the expiry race, this app's own TICK
    // returns changed:false and would otherwise never find out.
    //
    // Deliberately assigns only — no repaint. AppStorage.save emits to
    // in-process subscribers SYNCHRONOUSLY, so repainting here would
    // re-enter _renderAll from inside runPomodoro with a stale
    // this._state. The 1s tick repaints within a second anyway.
    this._unsubHistory = this.kernel.storage?.subscribe?.(
      STORAGE_KEYS.history,
      (e) => { this._history = normalizeHistory(e?.newValue); },
    ) || null;
  }

  _buildFrame() {
    // ── Titlebar (tabs only — WindowChrome owns the controls + title) ──
    const titlebar = el('div', { class: 'sol-titlebar' });
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
    this._views.attachedRow = buildAttachedRow();
    this._views.todayBlock = el('div', { class: 'sol-today-block' }, [
      timerBlock,
      this._views.attachedRow.root,
    ]);

    // Stats / Season / Settings panels — each built once, repainted on update.
    this._views.stats = buildStatsTab();
    this._views.stats.root.classList.add('sol-tab-panel', 'is-stats');
    this._views.stats.root.style.display = 'none';

    this._views.season = buildSeasonTab();
    this._views.season.root.classList.add('sol-tab-panel', 'is-season');
    this._views.season.root.style.display = 'none';

    this._views.settings = buildSettingsTab({
      onChange: (patch) => this._applySettings(patch),
    });
    this._views.settings.root.classList.add('sol-tab-panel', 'is-settings');
    this._views.settings.root.style.display = 'none';

    const stage = el('div', { class: 'sol-stage' }, [
      this._views.sky.root,
      this._views.todayBlock,
      this._views.stats.root,
      this._views.season.root,
      this._views.settings.root,
    ]);
    this._views.stage = stage;

    // ── Side rail (right) ──
    this._views.side = buildPresetsRail({
      onPickPreset: (id) => this._handlePickPreset(id),
      onAmbientToggle: (key) => this._toggleAmbient(key),
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

  _toggleAmbient(key) {
    const amb = { ...(this._settings.ambient || {}) };
    amb[key] = !amb[key];
    this._applySettings({ ambient: amb });
  }

  _applySettings(patch) {
    this._settings = { ...this._settings, ...patch };
    if (patch.ambient) {
      this._settings.ambient = { ...(this._settings.ambient || {}), ...patch.ambient };
    }
    saveSettings(this.kernel, this._settings);
    this._renderAll();
  }

  _setTab(name) {
    if (this._activeTab === name) return;
    this._activeTab = name;
    this._renderTabState();
  }

  // ── Reducer dispatch + side-effect plumbing ────────────────────

  _dispatch(action) {
    if (!this._state) return;

    // Routes through the shared writer, which re-reads storage. This used
    // to apply TICK to the cached `this._state` — loaded once at init —
    // so when the widget advanced the phase underneath, the app's stale
    // copy expired independently a moment later and logged the session a
    // SECOND time. That stale-input path is why simply teaching the widget
    // to write history would have inflated exactly the stats being fixed.
    const { state, history, changed } = runPomodoro(this.kernel, action);

    // Assign even on a no-op: the app's Pause/Resume label used to go
    // wrong when the widget paused the timer underneath it, because
    // `this._state` never re-read. Now it self-corrects each tick.
    this._state = state;
    if (history) this._history = history;

    // Ambient body classes (mute / night shell) stay app-owned — see
    // getSharedChime() in pomodoro/ambient.js for why they must not
    // outlive this window. The chime itself is handled inside runPomodoro.
    this._ambient.applyState(this._state, this._settings);

    if (!changed) return;

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
    this._views.season.update(this._history, this._settings);
    this._views.settings.update(this._state, this._settings);

    // Ambient effects (body classes for break-time mute / night shell).
    this._ambient.applyState(this._state, this._settings);

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
    const panels = {
      Today:    this._views.todayBlock,
      Stats:    this._views.stats.root,
      Season:   this._views.season.root,
      Settings: this._views.settings.root,
    };
    const sky = this._views.sky?.root;
    // Hide all panels first.
    for (const p of Object.values(panels)) {
      if (p) p.style.display = 'none';
    }
    // Sky is a Today-only anchor; hiding it on other tabs frees ~180px
    // of vertical room for the tab content (and reads cleaner anyway).
    if (sky) sky.style.display = this._activeTab === 'Today' ? 'block' : 'none';

    const target = panels[this._activeTab];
    if (target) {
      target.style.display = (this._activeTab === 'Stats' || this._activeTab === 'Settings')
        ? 'flex'
        : 'block';
    }
  }

  destroy() {
    if (this._tickHandle) {
      clearInterval(this._tickHandle);
      this._tickHandle = null;
    }
    if (this._ambient) {
      this._ambient.destroy();
      this._ambient = null;
    }
    if (this._unsubHistory) {
      try { this._unsubHistory(); } catch { /* ignore */ }
      this._unsubHistory = null;
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
