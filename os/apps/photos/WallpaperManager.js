/**
 * WallpaperManager — Curated wallpaper collections + rotation scheduler
 *
 * Categories: Nature, Abstract, Dark, Minimal, Gradient
 * Features: Set wallpaper, auto-rotate on schedule, custom upload
 */
import { el } from '../../utils/dom.js';

const WP_SCHEDULE_KEY = 'yancotab_wp_schedule';
const WP_COLLECTION_KEY = 'yancotab_wp_collection';
const WP_CUSTOM_KEY = 'yancotab_wallpaper_custom';

// Curated gradient wallpapers (CSS gradients — zero external deps, instant load)
const WALLPAPER_COLLECTIONS = {
    gradients: {
        name: 'Gradients',
        icon: '\uD83C\uDF08',
        items: [
            { id: 'g1', name: 'Ocean Depths', css: 'linear-gradient(135deg, #0c1445 0%, #0d4f6e 50%, #00b4d8 100%)' },
            { id: 'g2', name: 'Aurora', css: 'linear-gradient(135deg, #0a0f1a 0%, #1a3a4a 30%, #00e5c1 70%, #33ffdd 100%)' },
            { id: 'g3', name: 'Sunset', css: 'linear-gradient(135deg, #1a0533 0%, #6b2fa0 30%, #ff6b6b 70%, #ffd93d 100%)' },
            { id: 'g4', name: 'Forest', css: 'linear-gradient(135deg, #0a1a0a 0%, #1a4a2a 50%, #2ed573 100%)' },
            { id: 'g5', name: 'Midnight', css: 'linear-gradient(135deg, #0a0a2e 0%, #1a1a5e 50%, #3a3a8e 100%)' },
            { id: 'g6', name: 'Rose Gold', css: 'linear-gradient(135deg, #2a1a1a 0%, #6b3a3a 40%, #e8a0a0 80%, #ffd4d4 100%)' },
            { id: 'g7', name: 'Arctic', css: 'linear-gradient(135deg, #0a1a2e 0%, #1a4a6e 40%, #a0d4e8 80%, #e0f0ff 100%)' },
            { id: 'g8', name: 'Volcano', css: 'linear-gradient(135deg, #1a0a0a 0%, #5a1a0a 30%, #ff4500 70%, #ff8c00 100%)' },
            { id: 'g9', name: 'Lavender', css: 'linear-gradient(135deg, #1a0a2e 0%, #4a2a6e 40%, #9b6dff 80%, #c4b5fd 100%)' },
            { id: 'g10', name: 'Emerald', css: 'linear-gradient(135deg, #0a1a15 0%, #0d4a35 40%, #00e5c1 80%, #6bffd8 100%)' },
        ],
    },
    abstract: {
        name: 'Abstract',
        icon: '\uD83C\uDFA8',
        items: [
            { id: 'a1', name: 'Mesh 1', css: 'radial-gradient(at 40% 20%, #1a4a6e 0px, transparent 50%), radial-gradient(at 80% 0%, #6b2fa0 0px, transparent 50%), radial-gradient(at 0% 50%, #0d4f6e 0px, transparent 50%), radial-gradient(at 80% 50%, #00e5c1 0px, transparent 50%), radial-gradient(at 0% 100%, #1a0533 0px, transparent 50%), #0a0f1a' },
            { id: 'a2', name: 'Mesh 2', css: 'radial-gradient(at 0% 0%, #2a0a3a 0px, transparent 50%), radial-gradient(at 100% 0%, #0a3a4a 0px, transparent 50%), radial-gradient(at 100% 100%, #1a1a4a 0px, transparent 50%), radial-gradient(at 0% 100%, #3a0a2a 0px, transparent 50%), #0a0a1a' },
            { id: 'a3', name: 'Orbs', css: 'radial-gradient(circle at 30% 40%, rgba(0, 229, 193, 0.3) 0%, transparent 40%), radial-gradient(circle at 70% 60%, rgba(107, 47, 160, 0.3) 0%, transparent 40%), radial-gradient(circle at 50% 80%, rgba(255, 107, 107, 0.2) 0%, transparent 40%), #0a0f1a' },
            { id: 'a4', name: 'Nebula', css: 'radial-gradient(ellipse at 50% 50%, rgba(107, 47, 160, 0.4) 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(0, 229, 193, 0.2) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(255, 71, 87, 0.2) 0%, transparent 50%), #060b14' },
            { id: 'a5', name: 'Waves', css: 'linear-gradient(180deg, #0a0f1a 0%, #0d2a3a 30%, #1a4a6e 50%, #0d2a3a 70%, #0a0f1a 100%)' },
            { id: 'a6', name: 'Prism', css: 'conic-gradient(from 45deg at 50% 50%, #0a0f1a, #1a2a4a, #00e5c1, #6b5cff, #ff4757, #ffa502, #0a0f1a)' },
        ],
    },
    dark: {
        name: 'Dark',
        icon: '\uD83C\uDF11',
        items: [
            { id: 'd1', name: 'Pure Black', css: '#000000' },
            { id: 'd2', name: 'Dark Navy', css: 'linear-gradient(180deg, #060b14 0%, #0c1628 100%)' },
            { id: 'd3', name: 'Charcoal', css: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)' },
            { id: 'd4', name: 'Deep Space', css: 'radial-gradient(ellipse at 50% 50%, #0c1628 0%, #060b14 60%, #000000 100%)' },
            { id: 'd5', name: 'Carbon', css: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)' },
            { id: 'd6', name: 'Dark Accent', css: 'radial-gradient(ellipse at 50% 100%, rgba(0, 229, 193, 0.08) 0%, transparent 50%), #060b14' },
        ],
    },
    minimal: {
        name: 'Minimal',
        icon: '\u25FB',
        items: [
            { id: 'm1', name: 'Soft White', css: 'linear-gradient(180deg, #f5f5f7 0%, #e8e8ed 100%)' },
            { id: 'm2', name: 'Warm Grey', css: 'linear-gradient(180deg, #e8e0d8 0%, #d4ccc4 100%)' },
            { id: 'm3', name: 'Cool Grey', css: 'linear-gradient(180deg, #d8e0e8 0%, #c4ccd4 100%)' },
            { id: 'm4', name: 'Cream', css: 'linear-gradient(180deg, #faf5e8 0%, #f0e8d4 100%)' },
            { id: 'm5', name: 'Slate', css: 'linear-gradient(180deg, #3d4f63 0%, #2a3a4e 100%)' },
            { id: 'm6', name: 'Fog', css: 'linear-gradient(180deg, #c8d6e5 0%, #8a9bb0 100%)' },
        ],
    },
    nature: {
        name: 'Nature',
        icon: '\uD83C\uDF3F',
        items: [
            { id: 'n1', name: 'Deep Ocean', css: 'linear-gradient(180deg, #001122 0%, #003366 30%, #006699 50%, #0099cc 70%, #00ccff 100%)' },
            { id: 'n2', name: 'Twilight Sky', css: 'linear-gradient(180deg, #0a0a2e 0%, #2a1a5e 20%, #5a3a8e 40%, #ff6b6b 70%, #ffd93d 100%)' },
            { id: 'n3', name: 'Mountain Mist', css: 'linear-gradient(180deg, #2c3e50 0%, #4a6741 30%, #7a9a6e 50%, #bdc3c7 70%, #ecf0f1 100%)' },
            { id: 'n4', name: 'Northern Lights', css: 'linear-gradient(180deg, #0a0a2e 0%, #1a2a4e 20%, #00e5c1 50%, #6b5cff 70%, #0a0a2e 100%)' },
            { id: 'n5', name: 'Desert Dusk', css: 'linear-gradient(180deg, #1a0a0a 0%, #5a2a0a 20%, #c86414 40%, #e8a050 60%, #ffd4a0 80%, #ffe8c8 100%)' },
            { id: 'n6', name: 'Rainforest', css: 'linear-gradient(180deg, #0a1a0a 0%, #1a3a1a 25%, #2a5a2a 50%, #3a7a3a 75%, #4a9a4a 100%)' },
        ],
    },
};

export class WallpaperManager {
    constructor(container, kernel) {
        this.container = container;
        this.kernel = kernel;
        this._activeCategory = 'gradients';
        this._currentWp = localStorage.getItem('yancotab_wallpaper') || null;
        this._schedule = this._loadSchedule();
        this._scheduleTimer = null;
    }

    init() {
        this._build();
        this._startSchedule();
    }

    _build() {
        this.container.innerHTML = '';

        // Category tabs
        const tabs = el('div', { class: 'wp-tabs' },
            Object.entries(WALLPAPER_COLLECTIONS).map(([key, cat]) =>
                el('button', {
                    class: `wp-tab${this._activeCategory === key ? ' is-active' : ''}`,
                    onclick: () => { this._activeCategory = key; this._build(); },
                }, [el('span', {}, cat.icon), el('span', {}, ` ${cat.name}`)])
            )
        );

        // Wallpaper grid
        const collection = WALLPAPER_COLLECTIONS[this._activeCategory];
        const grid = el('div', { class: 'wp-grid' },
            collection.items.map(wp =>
                el('div', {
                    class: `wp-card${this._currentWp === wp.id ? ' is-active' : ''}`,
                    onclick: () => this._applyWallpaper(wp),
                }, [
                    el('div', {
                        class: 'wp-card__preview',
                        style: { background: wp.css },
                    }),
                    el('div', { class: 'wp-card__name' }, wp.name),
                ])
            )
        );

        // Custom upload
        const customSection = el('div', { class: 'wp-custom' }, [
            el('div', { class: 'pe-panel__subtitle' }, 'Custom Wallpaper'),
            el('button', {
                class: 'pe-btn',
                onclick: () => this._uploadCustom(),
            }, '\uD83D\uDCC2 Upload Image'),
        ]);

        // Schedule section
        const scheduleSection = this._buildScheduleSection();

        this.container.append(tabs, grid, customSection, scheduleSection);
    }

    _buildScheduleSection() {
        const intervals = [
            { value: 0, label: 'Off' },
            { value: 30, label: '30 min' },
            { value: 60, label: '1 hour' },
            { value: 360, label: '6 hours' },
            { value: 1440, label: 'Daily' },
        ];

        const select = el('select', {
            class: 'pe-select',
            onchange: (e) => {
                this._schedule.interval = parseInt(e.target.value);
                this._schedule.category = this._activeCategory;
                this._saveSchedule();
                this._startSchedule();
            },
        }, intervals.map(i =>
            el('option', { value: String(i.value) }, i.label)
        ));
        select.value = String(this._schedule.interval || 0);

        return el('div', { class: 'wp-schedule' }, [
            el('div', { class: 'pe-panel__subtitle' }, 'Auto-Rotate'),
            el('div', { class: 'wp-schedule__row' }, [
                el('span', {}, 'Change wallpaper every:'),
                select,
            ]),
            this._schedule.interval > 0
                ? el('div', { class: 'wp-schedule__status' }, `Rotating from: ${WALLPAPER_COLLECTIONS[this._schedule.category || 'gradients']?.name || 'Gradients'}`)
                : null,
        ].filter(Boolean));
    }

    _applyWallpaper(wp) {
        this._currentWp = wp.id;
        localStorage.setItem('yancotab_wallpaper', wp.id);

        const shell = document.getElementById('app-shell');
        if (shell) {
            shell.style.backgroundImage = 'none';
            shell.style.background = wp.css;
            shell.style.backgroundSize = 'cover';
            shell.style.backgroundPosition = 'center';
        }

        window.dispatchEvent(new CustomEvent('yancotab:wallpaper-changed', { detail: { type: 'preset', id: wp.id } }));
        this._build(); // Refresh to update active state
    }

    _uploadCustom() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result;
                try {
                    localStorage.setItem(WP_CUSTOM_KEY, dataUrl);
                    localStorage.setItem('yancotab_wallpaper', 'custom');
                    this._currentWp = 'custom';

                    const shell = document.getElementById('app-shell');
                    if (shell) {
                        shell.style.background = 'none';
                        shell.style.backgroundImage = `url(${dataUrl})`;
                        shell.style.backgroundSize = 'cover';
                        shell.style.backgroundPosition = 'center';
                    }

                    window.dispatchEvent(new CustomEvent('yancotab:wallpaper-changed', { detail: { type: 'custom' } }));
                } catch (e) {
                    console.warn('[WallpaperManager] Image too large for localStorage');
                }
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    // ─── Schedule ─────────────────────────────────────────────

    _loadSchedule() {
        try {
            const raw = localStorage.getItem(WP_SCHEDULE_KEY);
            return raw ? JSON.parse(raw) : { interval: 0, category: 'gradients', lastChange: 0 };
        } catch { return { interval: 0, category: 'gradients', lastChange: 0 }; }
    }

    _saveSchedule() {
        try { localStorage.setItem(WP_SCHEDULE_KEY, JSON.stringify(this._schedule)); } catch {}
    }

    _startSchedule() {
        if (this._scheduleTimer) clearInterval(this._scheduleTimer);
        if (!this._schedule.interval) return;

        const ms = this._schedule.interval * 60 * 1000;
        this._scheduleTimer = setInterval(() => this._rotateWallpaper(), ms);

        // Check if we should rotate now
        const elapsed = Date.now() - (this._schedule.lastChange || 0);
        if (elapsed >= ms) this._rotateWallpaper();
    }

    _rotateWallpaper() {
        const cat = WALLPAPER_COLLECTIONS[this._schedule.category || 'gradients'];
        if (!cat?.items?.length) return;

        const currentIdx = cat.items.findIndex(w => w.id === this._currentWp);
        const nextIdx = (currentIdx + 1) % cat.items.length;
        const wp = cat.items[nextIdx];

        this._schedule.lastChange = Date.now();
        this._saveSchedule();
        this._applyWallpaper(wp);
    }

    destroy() {
        if (this._scheduleTimer) clearInterval(this._scheduleTimer);
    }
}
