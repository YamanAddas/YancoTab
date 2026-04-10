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
     * Called when the app is receiving a signal (e.g. 'pause', 'resume')
     */
    onSignal(signal) {
        // Handle pause/resume
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
