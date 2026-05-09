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

        // Brand mark + "/ new tab" wordmark and the local/net mid pills were
        // removed per Yaman's call — they cluttered the chrome without
        // earning their pixels. Status bar now only carries the right-side
        // controls (activity / clock / theme / settings). The .sb-right
        // section keeps margin-left: auto in CSS so it stays pinned right.

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

        this.root.append(this.elements.right);

        this._refreshActivity();
        this.startUpdates();
        return this.root;
    }

    getTime() {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !this.getClock24h() });
    }

    getClock24h() {
        try {
            // Canonical key — ClockApp writes here. Pre-fix this read used
            // a phantom 'yancotab_clock_state_v3' that nothing wrote, so
            // the status-bar clock was always stuck on 12-hour format.
            const state = this.kernel?.storage?.load('yancotab_clock_v3');
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

    _getOpenTodoCount() {
        try {
            // Canonical v2 schema — TodoApp / TodoWidget all use this. The
            // pre-fix v1 read returned 0 for every user post-migration.
            const data = this.kernel?.storage?.load('yancotab_todo_v2');
            if (!data || !Array.isArray(data.missions)) return 0;
            let n = 0;
            for (const m of data.missions) {
                if (Array.isArray(m.tasks)) {
                    for (const t of m.tasks) if (!t.done) n++;
                }
            }
            return n;
        } catch { return 0; }
    }

    _getActiveAlarmCount() {
        try {
            // Canonical key — ClockApp persists alarms here.
            const state = this.kernel?.storage?.load('yancotab_clock_v3');
            if (!state || !Array.isArray(state.alarms)) return 0;
            return state.alarms.filter(a => a && a.enabled).length;
        } catch { return 0; }
    }

    _toggleTheme() {
        try {
            const isLight = document.body.classList.contains('theme-light');
            const next = isLight ? 'dark' : 'light';
            window.dispatchEvent(new CustomEvent('yancotab:theme-request', { detail: { mode: next } }));
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
            if (!document.hidden) this._refreshActivity();
        };
        document.addEventListener('visibilitychange', this._visibilityHandler);

        window.addEventListener('yancotab:clock-update', () => {
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
    }
}
