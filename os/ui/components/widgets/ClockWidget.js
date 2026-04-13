import { el } from '../../../utils/dom.js';
import { kernel } from '../../../kernel.js';

export class ClockWidget {
    constructor() {
        this.root = null;
        this._interval = null;
    }

    render() {
        this.root = el('div', { class: 'widget-card widget-clock' });
        this.root.addEventListener('click', () => kernel.emit('app:open', 'clock'));
        this._update();
        this._interval = setInterval(() => this._update(), 1000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this._update();
        });
        return this.root;
    }

    _update() {
        if (!this.root) return;
        const now = new Date();
        const use24h = (() => {
            try {
                const s = kernel.storage?.load('yancotab_clock_state_v3');
                return s?.use24h || false;
            } catch { return false; }
        })();
        const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !use24h });
        const date = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

        this.root.innerHTML = '';
        this.root.append(
            el('div', { class: 'widget-value' }, time),
            el('div', { class: 'widget-label' }, date),
        );
    }

    destroy() {
        if (this._interval) clearInterval(this._interval);
    }
}
