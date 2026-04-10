import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

const SETTINGS_KEY = 'yancotab_pomodoro_settings';
const SESSIONS_KEY = 'yancotab_pomodoro_sessions';

const PHASES = {
    idle: { label: 'Ready', color: '#8a9bb0' },
    work: { label: 'Focus', color: '#ff6b6b' },
    'short-break': { label: 'Short Break', color: '#2ed573' },
    'long-break': { label: 'Long Break', color: '#0a84ff' },
};

export class PomodoroApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Pomodoro', id: 'pomodoro', icon: '🍅' };
        this._tickInterval = null;
        this._audioCtx = null;
        this._unsubSettings = null;

        this.settings = null;
        this.sessions = [];

        this.state = {
            phase: 'idle',
            startedAt: null,
            targetEndAt: null,
            pausedRemaining: null,
            workCount: 0, // count of completed work sessions before next long break
        };
    }

    async init() {
        this.root = el('div', { class: 'app-window app-pomodoro' });
        this._injectStyles();
        this._loadData();

        if (this.kernel.storage) {
            this._unsubSettings = this.kernel.storage.subscribe(SETTINGS_KEY, (e) => {
                if (e.source === 'remote') {
                    this.settings = e.newValue;
                    this.render();
                }
            });
        }

        this.render();
        this._startTick();
    }

    destroy() {
        this._stopTick();
        if (this._unsubSettings) this._unsubSettings();
        if (this._audioCtx) {
            try { this._audioCtx.close(); } catch { /* ignore */ }
        }
        super.destroy();
    }

    // ─── Data ────────────────────────────────────────────────

    _loadData() {
        if (this.kernel.storage) {
            this.settings = this.kernel.storage.load(SETTINGS_KEY);
            this.sessions = this.kernel.storage.load(SESSIONS_KEY);
        } else {
            try {
                this.settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || this._defaultSettings();
            } catch { this.settings = this._defaultSettings(); }
            try {
                this.sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY)) || [];
            } catch { this.sessions = []; }
        }
    }

    _defaultSettings() {
        return { workMin: 25, shortBreakMin: 5, longBreakMin: 15 };
    }

    _saveSettings() {
        if (this.kernel.storage) {
            this.kernel.storage.save(SETTINGS_KEY, this.settings);
        } else {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
        }
    }

    _saveSessions() {
        // Keep last 200 sessions max
        this.sessions = this.sessions.slice(-200);
        if (this.kernel.storage) {
            this.kernel.storage.save(SESSIONS_KEY, this.sessions);
        } else {
            localStorage.setItem(SESSIONS_KEY, JSON.stringify(this.sessions));
        }
    }

    // ─── Timer ───────────────────────────────────────────────

    _startTick() {
        this._stopTick();
        this._tickInterval = setInterval(() => this._tick(), 1000);
    }

    _stopTick() {
        if (this._tickInterval) {
            clearInterval(this._tickInterval);
            this._tickInterval = null;
        }
    }

    _tick() {
        if (this.state.phase === 'idle' || this.state.pausedRemaining !== null) return;

        const remaining = this.state.targetEndAt - Date.now();
        if (remaining <= 0) {
            this._onTimerComplete();
        }
        this._updateDisplay();
    }

    _getRemainingMs() {
        if (this.state.phase === 'idle') {
            return this._phaseDurationMs('work');
        }
        if (this.state.pausedRemaining !== null) {
            return this.state.pausedRemaining;
        }
        return Math.max(0, this.state.targetEndAt - Date.now());
    }

    _phaseDurationMs(phase) {
        const s = this.settings;
        if (phase === 'work') return s.workMin * 60 * 1000;
        if (phase === 'short-break') return s.shortBreakMin * 60 * 1000;
        if (phase === 'long-break') return s.longBreakMin * 60 * 1000;
        return s.workMin * 60 * 1000;
    }

    _onTimerComplete() {
        const completedPhase = this.state.phase;
        const duration = this._phaseDurationMs(completedPhase);

        // Record session
        this.sessions.push({
            date: new Date().toISOString().slice(0, 10),
            type: completedPhase,
            durationSec: Math.round(duration / 1000),
            completed: true,
        });
        this._saveSessions();

        // Play chime
        this._playChime();

        // Determine next phase
        if (completedPhase === 'work') {
            this.state.workCount++;
            if (this.state.workCount >= 4) {
                this.state.workCount = 0;
                this._setPhase('long-break');
            } else {
                this._setPhase('short-break');
            }
        } else {
            // After any break, go back to work
            this._setPhase('work');
        }
    }

    _setPhase(phase) {
        const duration = this._phaseDurationMs(phase);
        this.state.phase = phase;
        this.state.startedAt = Date.now();
        this.state.targetEndAt = Date.now() + duration;
        this.state.pausedRemaining = null;
        this.render();
    }

    // ─── Controls ────────────────────────────────────────────

    _start() {
        if (this.state.phase === 'idle') {
            this._setPhase('work');
        } else if (this.state.pausedRemaining !== null) {
            // Resume from pause
            this.state.targetEndAt = Date.now() + this.state.pausedRemaining;
            this.state.pausedRemaining = null;
            this.render();
        }
    }

    _pause() {
        if (this.state.phase === 'idle' || this.state.pausedRemaining !== null) return;
        this.state.pausedRemaining = Math.max(0, this.state.targetEndAt - Date.now());
        this.render();
    }

    _skip() {
        if (this.state.phase === 'idle') return;
        this._onTimerComplete();
    }

    _reset() {
        this.state = {
            phase: 'idle',
            startedAt: null,
            targetEndAt: null,
            pausedRemaining: null,
            workCount: 0,
        };
        this.render();
    }

    // ─── Audio ───────────────────────────────────────────────

    _playChime() {
        try {
            if (!this._audioCtx) {
                this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = this._audioCtx;

            // Pleasant two-tone chime
            [523.25, 659.25].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.2);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.8);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + i * 0.2);
                osc.stop(ctx.currentTime + i * 0.2 + 0.8);
            });
        } catch {
            // Audio not available
        }
    }

    // ─── Render ──────────────────────────────────────────────

    render() {
        this.root.innerHTML = '';
        this._injectStyles();

        const phaseInfo = PHASES[this.state.phase] || PHASES.idle;
        const remaining = this._getRemainingMs();
        const total = this.state.phase === 'idle'
            ? this._phaseDurationMs('work')
            : this._phaseDurationMs(this.state.phase);
        const progress = 1 - (remaining / total);

        // Timer section
        const timer = this._buildTimer(remaining, progress, phaseInfo);
        const controls = this._buildControls();
        const stats = this._buildStats();
        const settingsBtn = this._buildSettingsRow();

        const container = el('div', { class: 'pomo-container' }, [
            timer, controls, settingsBtn, stats,
        ]);

        this.root.appendChild(container);
    }

    _updateDisplay() {
        // Lightweight update — just the time and ring
        const timeEl = this.root.querySelector('.pomo-time');
        const ringEl = this.root.querySelector('.pomo-ring-progress');
        if (!timeEl || !ringEl) return;

        const remaining = this._getRemainingMs();
        const total = this._phaseDurationMs(this.state.phase);
        const progress = 1 - (remaining / total);

        timeEl.textContent = this._formatMs(remaining);

        const circumference = 2 * Math.PI * 90;
        const offset = circumference * (1 - progress);
        ringEl.style.strokeDashoffset = String(offset);
    }

    _buildTimer(remaining, progress, phaseInfo) {
        const circumference = 2 * Math.PI * 90;
        const offset = circumference * (1 - progress);

        const svg = `
            <svg viewBox="0 0 200 200" class="pomo-ring-svg">
                <circle cx="100" cy="100" r="90" fill="none"
                    stroke="rgba(255,255,255,0.05)" stroke-width="6"/>
                <circle cx="100" cy="100" r="90" fill="none"
                    class="pomo-ring-progress"
                    stroke="${phaseInfo.color}" stroke-width="6"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${offset}"
                    stroke-linecap="round"
                    transform="rotate(-90 100 100)"
                    style="transition: stroke-dashoffset 0.3s ease;"/>
            </svg>
        `;

        const ring = el('div', { class: 'pomo-ring' });
        ring.innerHTML = svg;

        const center = el('div', { class: 'pomo-center' }, [
            el('div', { class: 'pomo-phase', style: `color: ${phaseInfo.color}` }, phaseInfo.label),
            el('div', { class: 'pomo-time' }, this._formatMs(remaining)),
            this.state.pausedRemaining !== null
                ? el('div', { class: 'pomo-paused' }, 'PAUSED')
                : null,
        ].filter(Boolean));

        return el('div', { class: 'pomo-timer' }, [ring, center]);
    }

    _buildControls() {
        const isIdle = this.state.phase === 'idle';
        const isPaused = this.state.pausedRemaining !== null;
        const isRunning = !isIdle && !isPaused;

        const buttons = [];

        if (isIdle) {
            buttons.push(el('button', {
                class: 'pomo-btn pomo-btn-primary',
                type: 'button',
                onclick: () => this._start(),
            }, 'Start Focus'));
        } else if (isPaused) {
            buttons.push(el('button', {
                class: 'pomo-btn pomo-btn-primary',
                type: 'button',
                onclick: () => this._start(),
            }, 'Resume'));
            buttons.push(el('button', {
                class: 'pomo-btn pomo-btn-secondary',
                type: 'button',
                onclick: () => this._reset(),
            }, 'Reset'));
        } else if (isRunning) {
            buttons.push(el('button', {
                class: 'pomo-btn pomo-btn-secondary',
                type: 'button',
                onclick: () => this._pause(),
            }, 'Pause'));
            buttons.push(el('button', {
                class: 'pomo-btn pomo-btn-secondary',
                type: 'button',
                onclick: () => this._skip(),
            }, 'Skip'));
        }

        return el('div', { class: 'pomo-controls' }, buttons);
    }

    _buildSettingsRow() {
        const s = this.settings;
        const makeInput = (label, value, onChange) => {
            const input = el('input', {
                class: 'pomo-setting-input',
                type: 'number',
                min: '1',
                max: '120',
                value: String(value),
                onchange: (e) => onChange(parseInt(e.target.value, 10) || value),
            });
            return el('div', { class: 'pomo-setting' }, [
                el('span', { class: 'pomo-setting-label' }, label),
                input,
            ]);
        };

        return el('div', { class: 'pomo-settings-row' }, [
            makeInput('Focus', s.workMin, (v) => {
                this.settings.workMin = Math.max(1, Math.min(120, v));
                this._saveSettings();
            }),
            makeInput('Short', s.shortBreakMin, (v) => {
                this.settings.shortBreakMin = Math.max(1, Math.min(60, v));
                this._saveSettings();
            }),
            makeInput('Long', s.longBreakMin, (v) => {
                this.settings.longBreakMin = Math.max(1, Math.min(60, v));
                this._saveSettings();
            }),
        ]);
    }

    _buildStats() {
        const today = new Date().toISOString().slice(0, 10);
        const todaySessions = this.sessions.filter(
            (s) => s.date === today && s.type === 'work' && s.completed
        );
        const todayFocusMin = Math.round(
            todaySessions.reduce((sum, s) => sum + s.durationSec, 0) / 60
        );

        // 7-day data
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);
            const count = this.sessions.filter(
                (s) => s.date === dateStr && s.type === 'work' && s.completed
            ).length;
            days.push({ label: dayLabel, count });
        }

        const maxCount = Math.max(1, ...days.map((d) => d.count));

        const bars = days.map((day) => {
            const height = Math.max(4, (day.count / maxCount) * 60);
            return el('div', { class: 'pomo-bar-col' }, [
                el('div', {
                    class: 'pomo-bar',
                    style: `height: ${height}px`,
                    title: `${day.count} session${day.count !== 1 ? 's' : ''}`,
                }),
                el('div', { class: 'pomo-bar-label' }, day.label),
            ]);
        });

        return el('div', { class: 'pomo-stats' }, [
            el('div', { class: 'pomo-stats-header' }, [
                el('span', { class: 'pomo-stats-title' }, 'Today'),
                el('span', { class: 'pomo-stats-value' }, [
                    el('strong', {}, String(todaySessions.length)),
                    ` session${todaySessions.length !== 1 ? 's' : ''} · ${todayFocusMin}m`,
                ]),
            ]),
            el('div', { class: 'pomo-chart' }, bars),
        ]);
    }

    // ─── Helpers ─────────────────────────────────────────────

    _formatMs(ms) {
        const totalSec = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // ─── Styles ──────────────────────────────────────────────

    _injectStyles() {
        const style = el('style', {}, `
            .app-pomodoro {
                background: var(--bg, #060b14);
                color: var(--text-bright, #c8d6e5);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                overflow: hidden;
            }

            .pomo-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                height: 100%;
                padding: 20px;
                overflow-y: auto;
                gap: 20px;
            }

            /* ── Timer Ring ── */
            .pomo-timer {
                position: relative;
                width: min(240px, 50vw);
                height: min(240px, 50vw);
                flex-shrink: 0;
            }

            .pomo-ring {
                width: 100%;
                height: 100%;
            }

            .pomo-ring-svg {
                width: 100%;
                height: 100%;
            }

            .pomo-center {
                position: absolute;
                inset: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 4px;
            }

            .pomo-phase {
                font-size: 13px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 1px;
            }

            .pomo-time {
                font-size: clamp(36px, 8vw, 52px);
                font-weight: 700;
                font-variant-numeric: tabular-nums;
                color: var(--text-bright, #c8d6e5);
            }

            .pomo-paused {
                font-size: 11px;
                color: var(--warning, #ffa502);
                letter-spacing: 2px;
                animation: pomoBlink 1.5s ease infinite;
            }

            @keyframes pomoBlink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
            }

            /* ── Controls ── */
            .pomo-controls {
                display: flex;
                gap: 12px;
                flex-shrink: 0;
            }

            .pomo-btn {
                border: none;
                border-radius: var(--radius-md, 12px);
                padding: 12px 28px;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.15s, opacity 0.15s;
            }

            .pomo-btn:active {
                transform: scale(0.95);
            }

            .pomo-btn-primary {
                background: #ff6b6b;
                color: #fff;
            }

            .pomo-btn-primary:hover {
                opacity: 0.9;
            }

            .pomo-btn-secondary {
                background: var(--bg-card, rgba(8,18,32,0.85));
                color: var(--text, #8a9bb0);
                border: 1px solid var(--border, rgba(255,255,255,0.06));
            }

            .pomo-btn-secondary:hover {
                color: var(--text-bright, #c8d6e5);
            }

            /* ── Settings Row ── */
            .pomo-settings-row {
                display: flex;
                gap: 16px;
                flex-shrink: 0;
            }

            .pomo-setting {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
            }

            .pomo-setting-label {
                font-size: 11px;
                color: var(--text-dim, #3d4f63);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .pomo-setting-input {
                width: 56px;
                text-align: center;
                background: var(--bg-card, rgba(8,18,32,0.85));
                border: 1px solid var(--border, rgba(255,255,255,0.06));
                border-radius: var(--radius-xs, 4px);
                color: var(--text-bright, #c8d6e5);
                font-size: 14px;
                padding: 6px 4px;
                outline: none;
            }

            .pomo-setting-input:focus {
                border-color: var(--accent-dim, rgba(0,229,193,0.25));
            }

            /* ── Stats ── */
            .pomo-stats {
                width: 100%;
                max-width: 320px;
                background: var(--bg-card, rgba(8,18,32,0.85));
                border: 1px solid var(--border, rgba(255,255,255,0.06));
                border-radius: var(--radius-md, 12px);
                padding: 16px;
                flex-shrink: 0;
            }

            .pomo-stats-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }

            .pomo-stats-title {
                font-size: 14px;
                font-weight: 600;
                color: var(--text-bright, #c8d6e5);
            }

            .pomo-stats-value {
                font-size: 12px;
                color: var(--text, #8a9bb0);
            }

            .pomo-stats-value strong {
                color: var(--accent, #00e5c1);
                font-size: 16px;
            }

            /* ── Bar Chart ── */
            .pomo-chart {
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
                height: 80px;
                gap: 8px;
            }

            .pomo-bar-col {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                height: 100%;
                justify-content: flex-end;
            }

            .pomo-bar {
                width: 100%;
                max-width: 28px;
                border-radius: 4px 4px 0 0;
                background: linear-gradient(to top, rgba(255,107,107,0.3), rgba(255,107,107,0.6));
                transition: height 0.3s ease;
            }

            .pomo-bar-label {
                font-size: 10px;
                color: var(--text-dim, #3d4f63);
            }

            /* ── Mobile ── */
            @media (max-width: 400px) {
                .pomo-container { padding: 12px; gap: 14px; }
                .pomo-timer { width: min(200px, 55vw); height: min(200px, 55vw); }
                .pomo-btn { padding: 10px 20px; font-size: 14px; }
            }

            @media (orientation: landscape) and (max-height: 500px) {
                .pomo-container { flex-direction: row; flex-wrap: wrap; justify-content: center; }
                .pomo-timer { width: min(180px, 35vh); height: min(180px, 35vh); }
                .pomo-stats { max-width: 250px; }
            }
        `);
        this.root.appendChild(style);
    }
}
