import { el } from '../../utils/dom.js';

export class StatusBar {
    constructor(kernel) {
        this.kernel = kernel || null;
        this.root = null;
        this.elements = {};
        this.interval = null;
    }

    render() {
        this.root = el('div', { class: 'status-bar' });
        this.elements.time = el('div', { class: 'sb-time' }, this.getTime());
        this.root.appendChild(this.elements.time);
        this.startUpdates();
        return this.root;
    }

    getTime() {
        const now = new Date();
        const use24h = this.getClock24h();
        return now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !use24h });
    }

    getClock24h() {
        try {
            const state = this.kernel?.storage?.load('yancotab_clock_state_v3');
            if (state && typeof state === 'object') return state.use24h || false;
            return JSON.parse(localStorage.getItem('yancotab_clock_v2') || '{}').use24h || false;
        } catch { return false; }
    }

    startUpdates() {
        this.interval = setInterval(() => {
            if (this.elements.time) {
                this.elements.time.textContent = this.getTime();
            }
        }, 1000);

        window.addEventListener('yancotab:clock_update', () => {
            if (this.elements.time) this.elements.time.textContent = this.getTime();
        });
    }

    destroy() {
        if (this.interval) clearInterval(this.interval);
    }
}
