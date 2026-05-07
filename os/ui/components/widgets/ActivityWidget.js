import { el } from '../../../utils/dom.js';
import { kernel } from '../../../kernel.js';

/**
 * ActivityWidget — recent activity feed in the Today bar.
 *
 * Listens to existing event sources and shows the last 4 events:
 *   • kernel.on('process:started') — "Opened {App}"
 *   • window 'yancotab:activity'   — app-specific custom events
 *
 * The buffer (last 20 events) is persisted in `kernel.storage` so it survives
 * reloads. When the buffer is empty (fresh install) we render an empty-state
 * hint instead of a blank card.
 *
 * To emit a custom activity event from anywhere:
 *   window.dispatchEvent(new CustomEvent('yancotab:activity', {
 *     detail: { type: 'pomodoro', label: 'Pomodoro session complete' }
 *   }));
 */

const STORAGE_KEY = 'yancotab_activity_v1';
const MAX_EVENTS = 20;
const VISIBLE_EVENTS = 3;

function loadBuffer() {
    try {
        const saved = kernel.storage?.load(STORAGE_KEY);
        if (saved && Array.isArray(saved.events)) return saved.events.slice(0, MAX_EVENTS);
    } catch { /* ignore */ }
    return [];
}

function saveBuffer(events) {
    try { kernel.storage?.save(STORAGE_KEY, { events: events.slice(0, MAX_EVENTS) }); } catch { /* ignore */ }
}

function formatTime(ts) {
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

function appNameFor(appId) {
    if (!appId) return 'app';
    try {
        const app = kernel.getApps?.()?.find(a => a.id === appId);
        if (app?.name) return app.name;
    } catch { /* ignore */ }
    // Fallback: convert id like 'spider-solitaire' → 'Spider Solitaire'
    return appId.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join(' ');
}

export class ActivityWidget {
    constructor() {
        this.root = null;
        this.events = loadBuffer();
        this._handlers = {};
    }

    render() {
        this.root = el('div', { class: 'widget-card widget-feed widget-medium' });

        this.root.append(
            el('div', { class: 'w-feed-head' }, [
                el('b', {}, 'activity'),
                el('span', {}, 'recent'),
            ]),
            el('div', { class: 'w-feed-list' }),
        );

        this._renderList();
        this._subscribe();

        return this.root;
    }

    _renderList() {
        const list = this.root.querySelector('.w-feed-list');
        if (!list) return;
        list.innerHTML = '';

        const visible = this.events.slice(0, VISIBLE_EVENTS);
        if (visible.length === 0) {
            list.appendChild(el('div', { class: 'w-feed-empty' }, 'No recent activity'));
            return;
        }

        for (const ev of visible) {
            const item = el('div', { class: 'w-feed-item' });
            item.append(
                el('span', { class: 'w-feed-ts' }, formatTime(ev.ts)),
                this._buildText(ev),
            );
            list.appendChild(item);
        }
    }

    _buildText(ev) {
        const wrap = el('span', { class: 'w-feed-txt' });
        // Lightweight markdown: surround spans with *foo* → <em>foo</em>
        const parts = (ev.label || '').split(/(\*[^*]+\*)/g);
        for (const p of parts) {
            if (!p) continue;
            if (p.startsWith('*') && p.endsWith('*')) {
                wrap.appendChild(el('em', {}, p.slice(1, -1)));
            } else {
                wrap.appendChild(document.createTextNode(p));
            }
        }
        return wrap;
    }

    _push(event) {
        // De-dupe: skip if this exact event fires again within 2s
        const recent = this.events[0];
        if (recent && recent.label === event.label && (event.ts - recent.ts) < 2000) {
            return;
        }
        this.events.unshift(event);
        if (this.events.length > MAX_EVENTS) {
            this.events.length = MAX_EVENTS;
        }
        saveBuffer(this.events);
        this._renderList();
    }

    _subscribe() {
        // Kernel: app launches via process:started
        this._handlers.processStarted = ({ appId } = {}) => {
            if (!appId) return;
            this._push({
                ts: Date.now(),
                type: 'app',
                label: `Opened *${appNameFor(appId)}*`,
            });
        };
        kernel.on?.('process:started', this._handlers.processStarted);

        // Window: app-specific activity events
        this._handlers.activity = (e) => {
            const detail = e?.detail;
            if (!detail || !detail.label) return;
            this._push({
                ts: Date.now(),
                type: detail.type || 'misc',
                label: String(detail.label).slice(0, 120),
            });
        };
        window.addEventListener('yancotab:activity', this._handlers.activity);

        // Refresh the displayed timestamps every minute (so "14:18" stays current)
        this._refreshTimer = setInterval(() => this._renderList(), 60_000);
    }

    destroy() {
        if (this._handlers.activity) {
            window.removeEventListener('yancotab:activity', this._handlers.activity);
        }
        if (this._handlers.processStarted) {
            kernel.off?.('process:started', this._handlers.processStarted);
        }
        if (this._refreshTimer) clearInterval(this._refreshTimer);
        this._handlers = {};
    }
}
