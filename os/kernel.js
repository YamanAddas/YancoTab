/**
 * YancoTab v2.0 Kernel
 * Central nervous system of the OS.
 * Manages boot sequence, services, and global state.
 */

import { ProcessManager } from './core/processManager.js';
import { ClockService } from './services/clockService.js';
import { WeatherService } from './services/weatherService.js';
import { FileSystemService } from './services/fileSystemService.js';
import { AppStorage } from './services/appStorage.js';
import { VERSION, BUILD } from './version.js';

// Trusted system events that only the kernel should emit
const SYSTEM_EVENTS = new Set([
    'system:ready',
    'system:panic',
    'process:kill',
    'process:started',
    'process:stopped',
    'system:app-error',
    'ui:mount',
]);

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
        console.log(`[Kernel] Booting YancoTab ${this.version} (${BUILD})...`);

        try {
            // 1. Initialize Core Services (individually guarded)
            await this.initServices();

            // 2. Detect Environment
            this.detectEnvironment();

            // 3. Mount UI
            this.mountUI();

            this.state.status = 'ready';
            this.emit('system:ready');
            console.log('[Kernel] System Ready');
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
            const clock = new ClockService();
            this.registerService('clock', clock);
            if (typeof clock.start === 'function') clock.start();
        } catch (e) {
            console.error('[Kernel] ClockService init failed:', e);
        }

        try {
            this.registerService('weather', new WeatherService());
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
