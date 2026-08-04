import { el, setLiteralHtml } from '../../utils/dom.js';
import { countOpenTodos, countActiveAlarms } from '../badges/badgeModel.js';

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
        setLiteralHtml(this.elements.themeBtn, `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`);

        // Focus Mode's only entries used to be Ctrl+Shift+F and typing
        // `> focus` — a headline feature with no visible door. This button
        // dispatches the same kernel event the SmartSearch command uses.
        this.elements.focusBtn = el('button', {
            type: 'button',
            class: 'sb-icon-btn',
            'aria-label': 'Enter focus mode',
            title: 'Focus mode (Ctrl+Shift+F)',
            onclick: () => this.kernel?.emit?.('focus:toggle'),
        });
        setLiteralHtml(this.elements.focusBtn, `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="1" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="1" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="23" y2="12"/></svg>`);

        this.elements.settingsBtn = el('button', {
            type: 'button',
            class: 'sb-icon-btn',
            'aria-label': 'Open settings',
            title: 'Settings',
            onclick: () => this.kernel?.emit?.('app:open', 'settings'),
        });
        setLiteralHtml(this.elements.settingsBtn, `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`);

        this.elements.right.append(
            this.elements.activity,
            this.elements.time,
            this.elements.focusBtn,
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

    // Counting lives in badges/badgeModel.js so this pill and the Todo /
    // Clock icon badges can never disagree. Two independent counters
    // drifting apart is how the v1.1.1 TodoWidget bug happened.

    _getOpenTodoCount() {
        try {
            // Canonical v2 schema — TodoApp / TodoWidget all use this. The
            // pre-fix v1 read returned 0 for every user post-migration.
            return countOpenTodos(this.kernel?.storage?.load('yancotab_todo_v2'));
        } catch { return 0; }
    }

    _getActiveAlarmCount() {
        try {
            // Canonical key — ClockApp persists alarms here.
            return countActiveAlarms(this.kernel?.storage?.load('yancotab_clock_v3'));
        } catch { return 0; }
    }

    _toggleTheme() {
        // Route through the real theme system — the same path SmartSearch's
        // `> dark` command uses. The old body dispatched
        // 'yancotab:theme-request' (an event with zero listeners) and
        // hand-toggled the body class, which skipped persistence, skipped
        // the light-mode accent re-pin (teal on white is 1.46:1), and left
        // the starfield animating over the light surface.
        import('../../theme/theme.js').then((t) => {
            const next = document.body.classList.contains('theme-light') ? 'dark' : 'light';
            t.applyThemeMode(next);
        }).catch(() => { /* ignore */ });
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

        // The pill used to refresh only on alarm events and tab-visibility
        // changes, so completing a todo left it stale until you switched
        // tabs and back. Harmless while it was the only counter on screen;
        // now that the Todo icon carries a live badge, a stale pill sits
        // right next to a correct badge and reads as a bug. Subscribe to the
        // same keys the badges watch.
        this._storeUnsubs = [];
        for (const key of ['yancotab_todo_v2', 'yancotab_clock_v3']) {
            const off = this.kernel?.storage?.subscribe?.(key, () => this._refreshActivity());
            if (typeof off === 'function') this._storeUnsubs.push(off);
        }
        const offTodo = this.kernel?.on?.('todo:changed', () => this._refreshActivity());
        if (typeof offTodo === 'function') this._storeUnsubs.push(offTodo);

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
        for (const off of this._storeUnsubs || []) { try { off(); } catch { /* ignore */ } }
        this._storeUnsubs = [];
    }
}
