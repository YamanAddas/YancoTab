import { el } from '../../../utils/dom.js';
import { kernel } from '../../../kernel.js';

export class PomodoroWidget {
    constructor() {
        this.root = null;
        this._interval = null;
    }

    render() {
        this.root = el('div', { class: 'widget-card widget-pomodoro' });
        this.root.addEventListener('click', () => kernel.emit('app:open', 'pomodoro'));
        this._update();
        this._interval = setInterval(() => this._update(), 1000);
        return this.root;
    }

    _update() {
        if (!this.root) return;
        this.root.innerHTML = '';

        const active = window.__YANCOTAB_POMODORO_ACTIVE__;

        if (active && active.endTime > Date.now()) {
            const remaining = Math.max(0, active.endTime - Date.now());
            const totalMs = active.durationMs || (25 * 60 * 1000);
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            const pct = Math.round(((totalMs - remaining) / totalMs) * 100);

            this.root.append(
                el('div', { class: 'widget-title' }, 'Focus'),
                el('div', { class: 'widget-value' },
                    `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`),
            );

            const bar = el('div', { class: 'widget-pomo-progress' });
            const fill = el('div', { class: 'widget-pomo-fill' });
            fill.style.width = `${pct}%`;
            bar.appendChild(fill);
            this.root.append(bar);
        } else {
            this.root.append(
                el('div', { class: 'widget-empty' }, 'Focus Timer'),
                el('div', { class: 'widget-pomo-cta' }, 'Start Focus'),
            );
        }
    }

    destroy() {
        if (this._interval) clearInterval(this._interval);
    }
}
