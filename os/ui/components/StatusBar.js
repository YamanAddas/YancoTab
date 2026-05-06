import { el } from '../../utils/dom.js';

/**
 * StatusBar — full-width top tray.
 *
 * Layout (left → right):
 *   • Brand   — hex glyph + "YancoTab / new tab" wordmark
 *   • Mid     — system pills: local weather, net online/offline
 *   • Right   — activity pill (open todos + alarms), live clock, theme + settings buttons
 *
 * Brand and mid sections hide on narrow screens (< 768px) — handled in CSS.
 * All data flows through `kernel.storage` / `kernel.getService` / `navigator.onLine`.
 */
export class StatusBar {
    constructor(kernel) {
        this.kernel = kernel || null;
        this.root = null;
        this.elements = {};
        this.interval = null;
        this._onlineHandler = null;
        this._alarmHandler = null;
        this._visibilityHandler = null;
    }

    render() {
        this.root = el('div', { class: 'status-bar' });

        // ── Brand (left) ─────────────────────────────────────
        this.elements.brand = el('div', { class: 'sb-brand' }, [
            el('span', { class: 'sb-brand-mark' }),
            el('span', { class: 'sb-brand-name' }, 'YancoTab'),
            el('span', { class: 'sb-brand-tag' }, '/ new tab'),
        ]);

        // ── Mid (system status) ──────────────────────────────
        this.elements.mid = el('div', { class: 'sb-mid' });
        this.elements.local = el('span', { class: 'sb-mid-item sb-local sb-pill-hidden' }, [
            el('b', {}, 'local'),
            el('span', { class: 'sb-local-text' }, ''),
        ]);
        this.elements.net = el('span', { class: 'sb-mid-item sb-net' }, [
            el('b', {}, 'net'),
            el('span', { class: 'sb-net-text' }, navigator.onLine ? 'online' : 'offline'),
        ]);
        this.elements.mid.append(this.elements.local, this.elements.net);

        // ── Right (controls) ─────────────────────────────────
        this.elements.right = el('div', { class: 'sb-right' });

        this.elements.activity = el('span', {
            class: 'sb-pill sb-activity sb-pill-hidden',
            title: 'Open tasks and alarms',
        }, [
            el('span', { class: 'sb-dot' }),
            el('span', { class: 'sb-activity-text' }, ''),
        ]);

        this.elements.time = el('span', {
            class: 'sb-pill sb-time',
            title: 'Current time',
        }, this.getTime());

        this.elements.themeBtn = el('button', {
            type: 'button',
            class: 'sb-icon-btn',
            'aria-label': 'Toggle theme',
            title: 'Toggle theme',
            onclick: () => this._toggleTheme(),
        });
        this.elements.themeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

        this.elements.settingsBtn = el('button', {
            type: 'button',
            class: 'sb-icon-btn',
            'aria-label': 'Open settings',
            title: 'Settings',
            onclick: () => this.kernel?.emit?.('app:open', 'settings'),
        });
        this.elements.settingsBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

        this.elements.right.append(
            this.elements.activity,
            this.elements.time,
            this.elements.themeBtn,
            this.elements.settingsBtn,
        );

        this.root.append(this.elements.brand, this.elements.mid, this.elements.right);

        this._refreshActivity();
        this._refreshLocal();
        this.startUpdates();
        return this.root;
    }

    getTime() {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !this.getClock24h() });
    }

    getClock24h() {
        try {
            const state = this.kernel?.storage?.load('yancotab_clock_state_v3');
            if (state && typeof state === 'object') return state.use24h || false;
        } catch { /* fall through to default */ }
        return false;
    }

    _refreshActivity() {
        const todoCount = this._getOpenTodoCount();
        const alarmCount = this._getActiveAlarmCount();
        const total = todoCount + alarmCount;
        const text = this.elements.activity.querySelector('.sb-activity-text');

        if (total === 0) {
            this.elements.activity.classList.add('sb-pill-hidden');
            text.textContent = '';
        } else {
            this.elements.activity.classList.remove('sb-pill-hidden');
            const parts = [];
            if (todoCount > 0) parts.push(`${todoCount} ${todoCount === 1 ? 'task' : 'tasks'}`);
            if (alarmCount > 0) parts.push(`${alarmCount} ${alarmCount === 1 ? 'alarm' : 'alarms'}`);
            text.textContent = parts.join(' · ');
        }
    }

    _refreshLocal() {
        const summary = this._getWeatherSummary();
        const text = this.elements.local.querySelector('.sb-local-text');
        if (summary) {
            text.textContent = summary;
            this.elements.local.classList.remove('sb-pill-hidden');
        } else {
            this.elements.local.classList.add('sb-pill-hidden');
        }
    }

    _refreshNet() {
        const text = this.elements.net.querySelector('.sb-net-text');
        if (!text) return;
        text.textContent = navigator.onLine ? 'online' : 'offline';
        this.elements.net.classList.toggle('sb-net-offline', !navigator.onLine);
    }

    _getOpenTodoCount() {
        try {
            const data = this.kernel?.storage?.load('yancotab_todo_v1');
            if (!data || !data.lists || !Array.isArray(data.lists)) return 0;
            let n = 0;
            for (const list of data.lists) {
                if (Array.isArray(list.tasks)) {
                    for (const t of list.tasks) if (!t.done) n++;
                }
            }
            return n;
        } catch { return 0; }
    }

    _getActiveAlarmCount() {
        try {
            const state = this.kernel?.storage?.load('yancotab_clock_state_v3');
            if (!state || !Array.isArray(state.alarms)) return 0;
            return state.alarms.filter(a => a && a.enabled).length;
        } catch { return 0; }
    }

    _getWeatherSummary() {
        try {
            const ws = this.kernel?.getService?.('weather');
            if (!ws) return null;
            const state = ws.getState?.();
            if (!state?.currentLocation) return null;
            const query = state.currentLocation.query;
            const forecast = ws.getCache?.(query, 1000 * 60 * 60); // 1h tolerance
            if (!forecast?.current) return null;
            const temp = Math.round(forecast.current.temperature_2m ?? forecast.current.temp ?? 0);
            const unit = state.unit === 'f' ? 'f' : 'c';
            const city = (state.currentLocation.label || '').split(',')[0].toLowerCase();
            return `${city} · ${temp}°${unit}`;
        } catch { return null; }
    }

    _toggleTheme() {
        try {
            const isLight = document.body.classList.contains('theme-light');
            const next = isLight ? 'dark' : 'light';
            window.dispatchEvent(new CustomEvent('yancotab:theme_request', { detail: { mode: next } }));
            document.body.classList.toggle('theme-light');
        } catch { /* ignore */ }
    }

    startUpdates() {
        this.interval = setInterval(() => {
            if (this.elements.time) this.elements.time.textContent = this.getTime();
        }, 1000);

        this._alarmHandler = () => this._refreshActivity();
        window.addEventListener('yancotab:alarm', this._alarmHandler);
        window.addEventListener('yancotab:alarmringstate', this._alarmHandler);

        this._visibilityHandler = () => {
            if (!document.hidden) {
                this._refreshActivity();
                this._refreshLocal();
            }
        };
        document.addEventListener('visibilitychange', this._visibilityHandler);

        this._onlineHandler = () => this._refreshNet();
        window.addEventListener('online', this._onlineHandler);
        window.addEventListener('offline', this._onlineHandler);

        window.addEventListener('yancotab:clock_update', () => {
            if (this.elements.time) this.elements.time.textContent = this.getTime();
        });
    }

    destroy() {
        if (this.interval) clearInterval(this.interval);
        if (this._alarmHandler) {
            window.removeEventListener('yancotab:alarm', this._alarmHandler);
            window.removeEventListener('yancotab:alarmringstate', this._alarmHandler);
        }
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
        }
        if (this._onlineHandler) {
            window.removeEventListener('online', this._onlineHandler);
            window.removeEventListener('offline', this._onlineHandler);
        }
    }
}
