import { el, setLiteralHtml } from '../../../utils/dom.js';
import { kernel } from '../../../kernel.js';
import { getPreset } from '../../../apps/pomodoro/engine/presets.js';
import { normalizeSettings } from '../../../apps/pomodoro/persistence.js';

/**
 * PomodoroWidget — focus timer in the Today bar.
 *
 * Layout (matches the design's w-pomo card):
 *   • Header label: "FOCUS · POMODORO" (uppercase mono)
 *   • SVG progress ring (88px) with the live MM:SS at the center
 *   • Footer label: "Session N of M"  (focus mode, M from active preset)
 *                  or "Take a break"   (break mode)
 *                  or "Tap to start"   (idle)
 *
 * State machine:
 *   idle → focus  (on click) — starts a focus session
 *   focus → break (on countdown to 0) — increments sessionsToday, fires toast
 *   break → idle  (on countdown to 0) — fires toast
 *   * → idle      (on right-click / context-menu) — reset
 *   focus/break → paused  (on click during run)
 *
 * Persistence: state lives in `kernel.storage` so the timer survives reload
 * (we recompute remaining time from `startedAt` rather than ticking in storage).
 *
 * Preset awareness: durations + cycle length come from the active preset
 * (yancotab_pomodoro_settings_v1 → activePresetId). PomodoroApp writes
 * this when the user picks a preset; widget polls each tick to stay in
 * sync. Long-break is treated like a regular break here — the widget
 * doesn't visually distinguish, but the underlying state machine does.
 */

const STORAGE_KEY = 'yancotab_pomodoro_v1';
const SETTINGS_KEY = 'yancotab_pomodoro_settings_v1';
const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ≈ 263.9

function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function formatMMSS(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function loadState() {
    try {
        const saved = kernel.storage?.load(STORAGE_KEY);
        if (saved && typeof saved === 'object') return saved;
    } catch { /* ignore */ }
    return { phase: 'idle', startedAt: null, paused: false, pausedRemainingMs: 0, sessionsToday: 0, dayKey: todayKey(), presetId: 'classic' };
}

function saveState(state) {
    try { kernel.storage?.save(STORAGE_KEY, state); } catch { /* ignore */ }
}

function loadActivePreset() {
    try {
        const raw = kernel.storage?.load(SETTINGS_KEY);
        const settings = normalizeSettings(raw);
        return getPreset(settings.activePresetId);
    } catch { /* ignore */ }
    return getPreset('classic');
}

export class PomodoroWidget {
    constructor() {
        this.root = null;
        this._interval = null;
        this._state = loadState();
        this._preset = loadActivePreset();
        // Reset session counter on day change
        if (this._state.dayKey !== todayKey()) {
            this._state.sessionsToday = 0;
            this._state.dayKey = todayKey();
        }
    }

    render() {
        this.root = el('div', { class: 'widget-card widget-pomo' });

        this.root.append(
            el('div', { class: 'widget-head' }, [
                el('b', {}, 'focus'),
                el('span', {}, 'pomodoro'),
            ]),
            el('div', { class: 'widget-body' }, [this._buildRing()]),
            el('div', { class: 'widget-foot w-pomo-label' }, ''),
        );

        this.root.addEventListener('click', () => this._toggle());
        this.root.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            // Claim the event fully: without stopPropagation the shell's
            // (now-working) desktop background menu would open on top of
            // the reset this right-click just performed.
            e.stopPropagation();
            this._reset();
        });

        this._update();
        this._interval = setInterval(() => this._update(), 1000);

        return this.root;
    }

    _buildRing() {
        const ring = el('div', { class: 'w-pomo-ring' });
        setLiteralHtml(ring, `
            <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle class="track" cx="50" cy="50" r="${RING_RADIUS}" fill="none" stroke-width="6"/>
                <circle class="fill" cx="50" cy="50" r="${RING_RADIUS}" fill="none" stroke-width="6"
                        stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${RING_CIRCUMFERENCE.toFixed(2)}"/>
            </svg>
            <div class="w-pomo-time">25:00</div>
        `);
        return ring;
    }

    _toggle() {
        const s = this._state;
        if (s.phase === 'idle') {
            // Start a focus session — anchor cycle metadata so the windowed
            // app picks up the in-flight cycle correctly.
            s.phase = 'focus';
            s.startedAt = Date.now();
            s.cycleStartedAt = Date.now();
            s.sessionIndex = 0;
            s.paused = false;
            s.pausedRemainingMs = 0;
            s.manualSkyOverride = null;
        } else if (s.paused) {
            // Resume — re-anchor startedAt so remaining matches what was paused
            s.startedAt = Date.now() - (this._duration() - s.pausedRemainingMs);
            s.paused = false;
            s.pausedRemainingMs = 0;
        } else {
            // Pause — capture how much time was left
            s.paused = true;
            s.pausedRemainingMs = this._remainingMs();
        }
        saveState(s);
        this._update();
    }

    _reset() {
        this._state = {
            phase: 'idle', startedAt: null, paused: false, pausedRemainingMs: 0,
            sessionsToday: this._state.sessionsToday, dayKey: todayKey(),
            presetId: this._state.presetId || 'classic',
            sessionIndex: 0, cycleStartedAt: null, manualSkyOverride: null,
        };
        saveState(this._state);
        this._update();
    }

    _duration() {
        const p = this._preset;
        if (this._state.phase === 'longBreak') return p.longBreakMs;
        if (this._state.phase === 'break') return p.breakMs;
        return p.focusMs;
    }

    _remainingMs() {
        const s = this._state;
        if (s.phase === 'idle') return this._duration();
        if (s.paused) return s.pausedRemainingMs;
        const elapsed = Date.now() - (s.startedAt || Date.now());
        return Math.max(0, this._duration() - elapsed);
    }

    _update() {
        if (!this.root) return;
        // Re-read preset every tick so a preset switch in the app is picked
        // up within ≤1s, with no cross-tab event plumbing.
        this._preset = loadActivePreset();
        const p = this._preset;

        // Re-read state from storage so the app's writes (Start/Pause/etc)
        // surface in the widget within ≤1s.
        const fresh = loadState();
        if (fresh) this._state = fresh;
        const s = this._state;

        // Day rollover
        if (s.dayKey !== todayKey()) {
            s.sessionsToday = 0;
            s.dayKey = todayKey();
            saveState(s);
        }

        const remaining = this._remainingMs();

        // Phase transitions on hitting 0 — widget owns advance only when
        // the app isn't (the app is also ticking; whoever runs first wins,
        // but both compute the same next-state from the same preset).
        if (s.phase !== 'idle' && !s.paused && remaining <= 0) {
            if (s.phase === 'focus') {
                s.sessionsToday = (s.sessionsToday || 0) + 1;
                const sessionIdx = (s.sessionIndex || 0) + 1;
                s.sessionIndex = sessionIdx;
                const isLast = sessionIdx >= p.sessions;
                if (isLast) {
                    s.phase = 'longBreak';
                    s.startedAt = Date.now();
                    kernel.emit?.('toast', { message: `Cycle complete · long break ${Math.round(p.longBreakMs / 60000)} min`, type: 'success' });
                    this._emitActivity(`Pomodoro · cycle complete (${p.sessions} sessions)`);
                } else {
                    s.phase = 'break';
                    s.startedAt = Date.now();
                    kernel.emit?.('toast', { message: `Focus complete · ${Math.round(p.breakMs / 60000)}-min break`, type: 'success' });
                    this._emitActivity(`Pomodoro · session ${sessionIdx} complete`);
                }
            } else if (s.phase === 'break' || s.phase === 'longBreak') {
                if (s.phase === 'longBreak') {
                    s.phase = 'idle';
                    s.startedAt = null;
                    s.sessionIndex = 0;
                    s.cycleStartedAt = null;
                    kernel.emit?.('toast', { message: 'Cycle complete · ready when you are', type: 'info' });
                } else {
                    s.phase = 'focus';
                    s.startedAt = Date.now();
                    kernel.emit?.('toast', { message: 'Break over · back to focus', type: 'info' });
                }
            }
            saveState(s);
        }

        const remNow = this._remainingMs();
        const totNow = this._duration();
        const progress = totNow > 0 ? 1 - (remNow / totNow) : 0;

        // Update ring
        const fill = this.root.querySelector('.fill');
        if (fill) {
            const offset = RING_CIRCUMFERENCE * (1 - progress);
            fill.setAttribute('stroke-dashoffset', offset.toFixed(2));
            fill.classList.toggle('is-break', s.phase === 'break' || s.phase === 'longBreak');
        }

        // Time display
        const timeEl = this.root.querySelector('.w-pomo-time');
        if (timeEl) timeEl.textContent = formatMMSS(remNow);

        // Footer label
        const labelEl = this.root.querySelector('.w-pomo-label');
        if (labelEl) {
            if (s.phase === 'idle') {
                labelEl.textContent = 'Tap to start';
            } else if (s.phase === 'longBreak') {
                labelEl.textContent = 'Long break';
            } else if (s.phase === 'break') {
                labelEl.textContent = 'Take a break';
            } else if (s.paused) {
                labelEl.textContent = 'Paused';
            } else {
                // Use sessionIndex (engine-managed) when present; fall back to legacy sessionsToday count.
                const n = ((Number.isFinite(s.sessionIndex) ? s.sessionIndex : (s.sessionsToday || 0))) + 1;
                labelEl.textContent = `Session ${Math.min(n, p.sessions)} of ${p.sessions}`;
            }
        }

        // State classes
        this.root.classList.toggle('is-focus', s.phase === 'focus' && !s.paused);
        this.root.classList.toggle('is-break', s.phase === 'break');
        this.root.classList.toggle('is-paused', !!s.paused);
    }

    _emitActivity(label) {
        try {
            window.dispatchEvent(new CustomEvent('yancotab:activity', {
                detail: { type: 'pomodoro', label },
            }));
        } catch { /* ignore */ }
    }

    destroy() {
        if (this._interval) clearInterval(this._interval);
        this._interval = null;
    }
}
