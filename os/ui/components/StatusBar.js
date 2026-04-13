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

        // CSS for Status Bar (Inline for now to avoid modifying main.css too much)
        Object.assign(this.root.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            height: '44px', // Standard iOS height
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            zIndex: '1000',
            fontSize: '15px',
            fontWeight: '600',
            color: '#fff', // Default to white
            pointerEvents: 'none', // Let clicks pass through to apps
            mixBlendMode: 'difference' // Ensure visibility on light/dark backgrounds
        });

        // Left: Time
        this.elements.time = el('div', { class: 'sb-time' }, this.getTime());

        // Right: Battery (Only functionality we keep besides time, but if API fails it just hides)
        this.elements.battery = el('div', {
            style: 'display: flex; align-items: center; gap: 4px; font-size: 12px;'
        });

        this.root.append(this.elements.time, this.elements.battery);

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
            // Fallback for legacy key
            return JSON.parse(localStorage.getItem('yancotab_clock_v2') || '{}').use24h || false;
        } catch { return false; }
    }

    startUpdates() {
        // Update time every second to be accurate
        this.interval = setInterval(() => {
            if (this.elements.time) {
                this.elements.time.textContent = this.getTime();
            }
        }, 1000);

        // Listen for 24h toggle change
        window.addEventListener('yancotab:clock_update', () => {
            if (this.elements.time) this.elements.time.textContent = this.getTime();
        });

        // Real Battery Level Only
        if (navigator.getBattery) {
            navigator.getBattery().then(battery => {
                const updateBat = () => {
                    const level = Math.floor(battery.level * 100);
                    this.elements.battery.textContent = `${level}% 🔋`;
                };
                updateBat();
                battery.addEventListener('levelchange', updateBat);
            }).catch(() => {
                this.elements.battery.style.display = 'none';
            });
        } else {
            this.elements.battery.style.display = 'none';
        }
    }

    destroy() {
        if (this.interval) clearInterval(this.interval);
    }
}
