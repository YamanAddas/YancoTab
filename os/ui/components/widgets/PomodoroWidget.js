import { el } from '../../../utils/dom.js';
import { kernel } from '../../../kernel.js';

/**
 * PomodoroWidget — focus timer in the Today bar.
 *
 * Layout (matches the design's w-pomo card):
 *   • Header label: "FOCUS · POMODORO" (uppercase mono)
 *   • SVG progress ring (88px) with the live MM:SS at the center
 *   • Footer label: "Session N of 4"  (focus mode)
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
 */

const STORAGE_KEY = 'yancotab_pomodoro_v1';
const FOCUS_MS = 25 * 60 * 1000;   // 25 minutes
const BREAK_MS = 5 * 60 * 1000;    // 5 minutes
const SESSIONS_PER_CYCLE = 4;
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
    return { phase: 'idle', startedAt: null, paused: false, pausedRemainingMs: 0, sessionsToday: 0, dayKey: todayKey() };
}

function saveState(state) {
    try { kernel.storage?.save(STORAGE_KEY, state); } catch { /* ignore */ }
}

export class PomodoroWidget {
    constructor() {
        this.root = null;
        this._interval = null;
        this._state = loadState();
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
            this._reset();
        });

        this._update();
        this._interval = setInterval(() => this._update(), 1000);

        return this.root;
    }

    _buildRing() {
        const ring = el('div', { class: 'w-pomo-ring' });
        ring.innerHTML = `
            <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle class="track" cx="50" cy="50" r="${RING_RADIUS}" fill="none" stroke-width="6"/>
                <circle class="fill" cx="50" cy="50" r="${RING_RADIUS}" fill="none" stroke-width="6"
                        stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${RING_CIRCUMFERENCE.toFixed(2)}"/>
            </svg>
            <div class="w-pomo-time">25:00</div>
        `;
        return ring;
    }

    _toggle() {
        const s = this._state;
        if (s.phase === 'idle') {
            // Start a focus session
            s.phase = 'focus';
            s.startedAt = Date.now();
            s.paused = false;
            s.pausedRemainingMs = 0;
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
        this._state = { phase: 'idle', startedAt: null, paused: false, pausedRemainingMs: 0, sessionsToday: this._state.sessionsToday, dayKey: todayKey() };
        saveState(this._state);
        this._update();
    }

    _duration() {
        return this._state.phase === 'break' ? BREAK_MS : FOCUS_MS;
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
        const s = this._state;

        // Day rollover
        if (s.dayKey !== todayKey()) {
            s.sessionsToday = 0;
            s.dayKey = todayKey();
            saveState(s);
        }

        const remaining = this._remainingMs();
        const total = this._duration();

        // Phase transitions on hitting 0
        if (s.phase !== 'idle' && !s.paused && remaining <= 0) {
            if (s.phase === 'focus') {
                s.sessionsToday = (s.sessionsToday || 0) + 1;
                if (s.sessionsToday >= SESSIONS_PER_CYCLE) {
                    s.phase = 'idle';
                    s.startedAt = null;
                    kernel.emit?.('toast', { message: `Pomodoro cycle complete · ${SESSIONS_PER_CYCLE} sessions`, type: 'success' });
                    this._emitActivity(`Pomodoro cycle complete · ${SESSIONS_PER_CYCLE} sessions`);
                } else {
                    s.phase = 'break';
                    s.startedAt = Date.now();
                    kernel.emit?.('toast', { message: 'Focus complete · take a 5 minute break', type: 'success' });
                    this._emitActivity(`Pomodoro · session ${s.sessionsToday} complete`);
                }
            } else if (s.phase === 'break') {
                s.phase = 'idle';
                s.startedAt = null;
                kernel.emit?.('toast', { message: 'Break over · ready when you are', type: 'info' });
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
            fill.classList.toggle('is-break', s.phase === 'break');
        }

        // Time display
        const timeEl = this.root.querySelector('.w-pomo-time');
        if (timeEl) timeEl.textContent = formatMMSS(remNow);

        // Footer label
        const labelEl = this.root.querySelector('.w-pomo-label');
        if (labelEl) {
            if (s.phase === 'idle') {
                labelEl.textContent = 'Tap to start';
            } else if (s.phase === 'break') {
                labelEl.textContent = 'Take a break';
            } else if (s.paused) {
                labelEl.textContent = 'Paused';
            } else {
                const n = (s.sessionsToday || 0) + 1;
                labelEl.textContent = `Session ${Math.min(n, SESSIONS_PER_CYCLE)} of ${SESSIONS_PER_CYCLE}`;
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
