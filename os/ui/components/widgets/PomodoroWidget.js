import { el, setLiteralHtml } from '../../../utils/dom.js';
import { kernel } from '../../../kernel.js';
import { runPomodoro, activePreset } from '../../../apps/pomodoro/effects.js';
import { loadState, loadSettings } from '../../../apps/pomodoro/persistence.js';
import { remainingMs, phaseDurationMs } from '../../../apps/pomodoro/engine/state.js';
import * as intent from '../../../apps/pomodoro/intents.js';

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
 * Persistence and phase advance are NOT owned here. Every action goes
 * through pomodoro/effects.js `runPomodoro`, which is the single writer
 * for both the live state and the session history. This widget used to
 * hand-roll the state machine and never wrote history at all, so a
 * session that completed with the Pomodoro window closed — the whole
 * point of a background timer — never reached Stats.
 */

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ≈ 263.9

function formatMMSS(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export class PomodoroWidget {
    constructor() {
        this.root = null;
        this._interval = null;
        this._preset = null;
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
        const s = loadState(kernel);
        runPomodoro(kernel, s.phase === 'idle' ? intent.start()
                          : s.paused        ? intent.resume()
                                            : intent.pause());
        this._update();
    }

    _reset() {
        // END_CYCLE rather than a hard write to idle. The old reset threw
        // away the in-progress focus block; the reducer logs it as a
        // `completed: false` partial instead, so an abandoned session is
        // still visible in Stats. No-ops (silently) when already idle.
        runPomodoro(kernel, intent.endCycle());
        this._update();
    }

    _update() {
        if (!this.root) return;

        // ONE call does everything: re-reads storage, advances the phase if
        // the deadline passed, persists state + history, and fires toasts,
        // activity and the chime. The widget used to hand-roll all of that
        // and never wrote history — so any session that completed while the
        // Pomodoro window was closed vanished from Stats. It also no longer
        // computes a day key (its unpadded '2026-8-4' fought the engine's
        // padded form, resetting sessionsToday on every alternating tick).
        const { state: s } = runPomodoro(kernel, intent.tick());
        this._preset = activePreset(s, loadSettings(kernel));
        const p = this._preset;

        const remNow = remainingMs(s, p);
        const totNow = phaseDurationMs(s.phase, p);
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

    destroy() {
        if (this._interval) clearInterval(this._interval);
        this._interval = null;
    }
}
