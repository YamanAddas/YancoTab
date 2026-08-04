/**
 * YancoTab Kernel
 * Central nervous system of the OS.
 * Manages boot sequence, services, and global state.
 */

import { ProcessManager } from './core/processManager.js';
import { ClockService } from './services/clockService.js';
import { WeatherService } from './services/weatherService.js';
import { FileSystemService } from './services/fileSystemService.js';
import { AppStorage } from './services/appStorage.js';
import { PdfStore } from './services/pdfStore.js';
import { VERSION, BUILD } from './version.js';
import { dlog } from './utils/debugLog.js';

/**
 * Canonical event names used across YancoTab.
 *
 * Convention: `domain:event-name` — colon separates the namespace from
 * the event, and the event itself uses kebab-case. The pre-v1.1.1 mix
 * of `theme_change` / `weatherchange` / `wallpaper-changed` was
 * normalized to kebab-case across the board.
 *
 * Two buses are in use:
 *   • kernel.bus      — for app lifecycle + cross-app commands
 *                       (process:started, app:open, toast).
 *                       Use kernel.emit() / kernel.on() — these include
 *                       a return-value unsubscribe to avoid leaks.
 *   • window          — for events that fire before the kernel singleton
 *                       is constructed (boot/theme/wallpaper) or that
 *                       intentionally cross documents (storage events).
 *                       Use window.dispatchEvent() / addEventListener().
 *
 * Migrating an event between buses requires changing every dispatcher
 * AND every listener in the same commit — this list helps the next
 * person spot mismatches.
 */
export const KNOWN_EVENTS = Object.freeze({
    // ── kernel.bus ──
    SYSTEM_READY:    'system:ready',
    SYSTEM_PANIC:    'system:panic',
    SYSTEM_APP_ERROR: 'system:app-error',
    UI_MOUNT:        'ui:mount',
    PROCESS_KILL:    'process:kill',
    PROCESS_STARTED: 'process:started',
    PROCESS_STOPPED: 'process:stopped',
    APP_OPEN:        'app:open',
    TOAST:           'toast',
    TODO_CHANGED:    'todo:changed',

    // ── window bus (early-boot or cross-document) ──
    THEME_CHANGE:        'yancotab:theme-change',
    THEME_REQUEST:       'yancotab:theme-request',
    NAME_CHANGED:        'yancotab:name-changed',
    CLOCK_UPDATE:        'yancotab:clock-update',
    WEATHER_CHANGE:      'yancotab:weather-change',
    WALLPAPER_CHANGED:   'yancotab:wallpaper-changed',
    BROWSER_SETTINGS_CHANGED: 'yancotab:browser-settings-changed',
    SETTINGS_CHANGED:    'yancotab:settings-changed',
    OPEN_FILE:           'yancotab:open-file',
    NEW_FOLDER_REQUEST:  'yancotab:new-folder-request',
    ACTIVITY:            'yancotab:activity',
    NOTIFY:              'yancotab:notify',
    STORAGE_CHANGED:     'yancotab:storage-changed',
    STORAGE_FULL:        'yancotab:storage-full',
});

let resizeHandler = null;

export class Kernel {
    constructor() {
        this.version = VERSION;
        this.bus = new EventTarget();
        this.services = new Map();
        this.apps = []; // Registry
        this.state = {
            isMobile: false,
            orientation: 'landscape',
            status: 'booting'
        };
        this.processManager = new ProcessManager(this);
        this.storage = null;
    }

    registerApps(appList) {
        this.apps = Object.freeze([...appList]);
    }

    getApps() {
        return [...this.apps];
    }

    async boot() {
        dlog(`[Kernel] Booting YancoTab ${this.version} (${BUILD})...`);

        try {
            // 1. Initialize Core Services (individually guarded)
            await this.initServices();

            // 2. Detect Environment
            this.detectEnvironment();

            // 3. Mount UI
            this.mountUI();

            this.state.status = 'ready';
            this.emit('system:ready');
            dlog('[Kernel] System Ready');
        } catch (e) {
            console.error('[Kernel] Boot Failure:', e);
            this.emit('system:panic', e);
        }
    }

    async initServices() {
        // Storage layer must initialize first — all other services
        // and apps depend on it as the canonical persistence path
        try {
            this.storage = new AppStorage();
            this.storage.init();
            this.registerService('storage', this.storage);
        } catch (e) {
            console.error('[Kernel] AppStorage init failed:', e);
        }

        // Each service init is individually guarded so one failure
        // doesn't prevent the rest from starting
        try {
            // The storage handle is load-bearing: ClockApp saves alarms via
            // kernel.storage (AppStorage envelope format). Without this
            // handle the service fell back to raw JSON.parse, received the
            // envelope instead of the state, normalized it to alarms: [] —
            // and no alarm could ever ring.
            const clock = new ClockService(this.storage);
            this.registerService('clock', clock);
            if (typeof clock.start === 'function') clock.start();
        } catch (e) {
            console.error('[Kernel] ClockService init failed:', e);
        }

        try {
            this.registerService('weather', new WeatherService(this.storage));
        } catch (e) {
            console.error('[Kernel] WeatherService init failed:', e);
        }

        try {
            const fs = new FileSystemService();
            fs.init();
            this.registerService('fs', fs);
        } catch (e) {
            console.error('[Kernel] FileSystemService init failed:', e);
        }

        try {
            // PdfStore is lazy — DB opens on first call. We just register the
            // singleton here so apps can grab it via kernel.getService('pdfStore').
            this.registerService('pdfStore', new PdfStore());
        } catch (e) {
            console.error('[Kernel] PdfStore init failed:', e);
        }
    }

    registerService(name, instance) {
        this.services.set(name, instance);
    }

    getService(name) {
        return this.services.get(name);
    }

    detectEnvironment() {
        const ua = navigator.userAgent;
        const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
        this.state.isMobile = mobileRegex.test(ua) || window.matchMedia("(pointer: coarse)").matches;

        const updateOrientation = () => {
            const { width, height } = window.visualViewport || window;
            this.state.orientation = width > height ? 'landscape' : 'portrait';
            this.emit('display:orientation_change', this.state.orientation);
        };

        // Store ref so we can clean up if needed
        if (resizeHandler) window.removeEventListener('resize', resizeHandler);
        resizeHandler = updateOrientation;
        window.addEventListener('resize', updateOrientation);
        updateOrientation();
    }

    mountUI() {
        this.emit('ui:mount');
    }

    emit(event, data) {
        const e = new CustomEvent(event, { detail: data });
        this.bus.dispatchEvent(e);
    }

    on(event, callback) {
        const handler = (e) => callback(e.detail);
        this.bus.addEventListener(event, handler);
        return () => this.bus.removeEventListener(event, handler);
    }
}

// Module-scoped singleton — NOT exposed on window
export const kernel = new Kernel();
