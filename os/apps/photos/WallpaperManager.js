/**
 * WallpaperManager — Curated wallpaper collections + rotation scheduler
 *
 * Categories: Nature, Abstract, Dark, Minimal, Gradient
 * Features: Set wallpaper, auto-rotate on schedule, custom upload
 *
 * All persistence routes through kernel.storage so the user's wallpaper
 * choice + schedule sync across devices via chrome.storage.sync. The
 * custom-upload data URL stays local-only (never sync — too large).
 */
import { el } from '../../utils/dom.js';
import { safeSave } from '../../utils/safeSave.js';
import { WALLPAPER_COLLECTIONS } from '../../theme/wallpaperPresets.js';
import { applyStoredWallpaper } from '../../theme/wallpaper.js';

const WP_KEY = 'yancotab_wallpaper';
const WP_SCHEDULE_KEY = 'yancotab_wp_schedule';
const WP_CUSTOM_KEY = 'yancotab_wallpaper_custom';

export class WallpaperManager {
    constructor(container, kernel) {
        this.container = container;
        this.kernel = kernel;
        this._activeCategory = 'gradients';
        this._currentWp = (kernel?.storage?.load(WP_KEY) || null);
        // Empty default ('') from REGISTRY → null for our null-or-id contract.
        if (this._currentWp === '') this._currentWp = null;
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
        safeSave(this.kernel, WP_KEY, wp.id, 'Wallpaper');
        // Paint from storage rather than from `wp` directly, so the marker
        // and the pixels can never disagree. Until the resolver existed
        // this preset id was written and then never understood by anything
        // that reads on load — all 34 of these vanished on reload.
        applyStoredWallpaper();

        window.dispatchEvent(new CustomEvent('yancotab:wallpaper-changed', { detail: { type: 'preset', id: wp.id } }));
        this._build(); // Refresh to update active state
    }

    _uploadCustom() {
        const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — generous for a wallpaper
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            // Reject before reading the file into memory — prevents OOM and
            // pre-empts the localStorage QuotaExceeded path.
            if (file.size > MAX_BYTES) {
                this.kernel?.emit?.('toast', {
                    message: `Wallpaper too large (max ${MAX_BYTES / 1024 / 1024} MB)`,
                    type: 'error',
                });
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result;
                // Custom wallpaper data URL stays in localStorage (it can be
                // multi-MB; chrome.storage.sync 8KB/item cap would reject).
                // The 'yancotab_wallpaper' = 'custom' marker DOES sync via
                // kernel.storage; the data URL doesn't need to.
                let savedDataUrl = false;
                try {
                    localStorage.setItem(WP_CUSTOM_KEY, dataUrl);
                    savedDataUrl = true;
                } catch {
                    // QuotaExceededError mid-write — bail before flipping
                    // the marker so we don't end up pointing at a missing
                    // data URL.
                    this.kernel?.emit?.('toast', {
                        message: 'Storage full — could not save wallpaper',
                        type: 'error',
                    });
                }
                if (!savedDataUrl) return;

                safeSave(this.kernel, WP_KEY, 'custom', 'Wallpaper');
                this._currentWp = 'custom';
                applyStoredWallpaper();

                window.dispatchEvent(new CustomEvent('yancotab:wallpaper-changed', { detail: { type: 'custom' } }));
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    // ─── Schedule ─────────────────────────────────────────────

    _loadSchedule() {
        const stored = this.kernel?.storage?.load(WP_SCHEDULE_KEY);
        // REGISTRY default is { interval: 0, category: 'gradients', lastChange: 0 }
        // — kernel.storage returns it on first load, so no fallback needed.
        if (stored && typeof stored === 'object') return stored;
        return { interval: 0, category: 'gradients', lastChange: 0 };
    }

    _saveSchedule() {
        safeSave(this.kernel, WP_SCHEDULE_KEY, this._schedule, 'Wallpaper schedule');
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
