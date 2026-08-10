/**
 * Base Application Class
 * All YancoTab apps must extend this.
 */
import { el } from '../utils/dom.js';

export class App {
    constructor(kernel, pid) {
        this.kernel = kernel;
        this.pid = pid;
        this.metadata = {
            name: 'Untitled App',
            icon: '📦',
            id: 'unknown'
        };
        this.root = null;
    }

    /**
     * Called when the app is launched.
     * @param {Object} args - Launch arguments
     */
    async init(args = {}) {
        this.root = el('div', { class: 'app-window' });
        // Default simplistic render, override this
        this.render();
    }

    /**
     * Override this to build your UI.
     * Append elements to this.root
     */
    render() {
        const h1 = document.createElement('h1');
        h1.textContent = this.metadata.name;
        this.root.innerHTML = '';
        this.root.appendChild(h1);
    }

    /**
     * Does this spawn config own an exclusive resource?
     *
     * Return a stable string when only ONE window may exist for the
     * thing the config names (a Notes editor owns one note path — two
     * of them autosave over each other), or null when several windows
     * of this app may coexist. ProcessManager focuses the existing
     * window instead of spawning a duplicate when the keys match.
     *
     * Declared per-app because ownership is app knowledge; enforced in
     * ProcessManager so every spawn site inherits it.
     *
     * @param {object} _config — the spawn config
     * @returns {string|null}
     */
    static resourceKey(_config) {
        return null;
    }

    /**
     * Called when the app is receiving a signal. The window manager
     * sends 'pause' when this app's window is minimized (or hidden by a
     * show-desktop / Focus Mode / breakpoint change) and 'resume' when
     * it is restored. Apps that keep wall-clock time or run per-frame
     * loops should override this to freeze their clock and halt their
     * loop — the process stays alive while minimized, so an unhandled
     * clock keeps counting. See the game apps for the pattern.
     */
    onSignal(signal) {
        // Base class: no-op. Override in apps that keep time or tick.
    }

    /**
     * Request the kernel to terminate this app.
     * This is the correct way for an app to close itself.
     */
    close() {
        if (this.pid) {
            this.kernel.emit('process:kill', this.pid);
        } else {
            this.destroy();
        }
    }

    /**
     * Cleanup event listeners, intervals, etc.
     * Called by ProcessManager.
     */
    destroy() {
        if (this.root) {
            this.root.remove();
            this.root = null;
        }
        this.kernel = null;
        this.pid = null;
    }
}
