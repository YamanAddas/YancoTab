import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';
import { SmartIcon } from '../desktop/SmartIcon.js';

/**
 * AppDock — design-style hex-tile dock at the bottom of the home screen.
 *
 * Replaces the old NavBar's view-tabs (HOME / FILES / GAMES / AI / SETTINGS)
 * with quick-launch hex tiles for actual apps. Click opens the app. The tile
 * gets a small accent dot underneath when the app is running (process:started
 * → process:stopped lifecycle).
 *
 * Separators visually group the row by category:
 *   Browser | Notes | Todo | Weather | Clock | sep | Solitaire | Snake | Files | sep | Settings
 *
 * The .nav-bar class is preserved on the root so the existing
 * `body.in-app .nav-bar { is-hidden }` slide-out animation still applies —
 * keeps the in-app transition feeling consistent with the previous shell.
 */

const DOCK_LAYOUT = [
    { type: 'app',  id: 'browser' },
    { type: 'app',  id: 'notes' },
    { type: 'app',  id: 'todo' },
    { type: 'app',  id: 'weather' },
    { type: 'app',  id: 'clock' },
    { type: 'sep' },
    { type: 'app',  id: 'solitaire' },
    { type: 'app',  id: 'snake' },
    { type: 'app',  id: 'files' },
    { type: 'sep' },
    { type: 'app',  id: 'settings' },
];

export class AppDock {
    constructor() {
        // .nav-bar class kept so existing CSS hides it in-app via the same path.
        // .app-dock is the new selector we use for dock-specific styling.
        this.root = el('nav', { class: 'nav-bar app-dock', 'aria-label': 'Dock' });
        this._tiles = new Map(); // appId → tile element
        this._iconInstances = new Map(); // appId → SmartIcon (for destroy)
        this._runningPids = new Map(); // appId → pid (set on process:started)
        this._handlers = {};
    }

    render() {
        this.root.innerHTML = '';

        for (const slot of DOCK_LAYOUT) {
            if (slot.type === 'sep') {
                this.root.appendChild(el('span', { class: 'app-dock-sep' }));
            } else {
                this.root.appendChild(this._buildTile(slot.id));
            }
        }

        this._subscribeLifecycle();
        return this.root;
    }

    _buildTile(appId) {
        const tile = el('div', {
            class: 'app-dock-tile',
            'data-app-id': appId,
            tabindex: '0',
            role: 'button',
            'aria-label': this._appName(appId),
            title: this._appName(appId),
        });

        // SmartIcon gives us the chromed ring + glass body + spec sweep
        // automatically — same recipe as the main grid hexes, just smaller
        // (sized via CSS via .app-dock-tile { --hex-size: 44px }).
        const icon = new SmartIcon(appId, { name: this._appName(appId) });
        const iconRoot = icon.render();
        tile.appendChild(iconRoot);
        this._iconInstances.set(appId, icon);

        // Running-app dot under the tile
        tile.appendChild(el('span', { class: 'app-dock-dot' }));

        const open = () => kernel.emit('app:open', appId);
        tile.addEventListener('click', open);
        tile.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
        });

        this._tiles.set(appId, tile);
        return tile;
    }

    _appName(appId) {
        try {
            const app = kernel.getApps?.()?.find(a => a.id === appId);
            if (app?.name) return app.name;
        } catch { /* ignore */ }
        return appId.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join(' ');
    }

    _subscribeLifecycle() {
        // process:started → flip running-dot on the tile (if any)
        this._handlers.started = ({ pid, appId } = {}) => {
            if (!appId || !this._tiles.has(appId)) return;
            this._runningPids.set(appId, pid);
            this._tiles.get(appId).classList.add('is-running');
        };
        kernel.on?.('process:started', this._handlers.started);

        this._handlers.stopped = ({ pid } = {}) => {
            // Clear whichever appId owned that pid
            for (const [appId, runningPid] of this._runningPids.entries()) {
                if (runningPid === pid) {
                    this._runningPids.delete(appId);
                    this._tiles.get(appId)?.classList.remove('is-running');
                    break;
                }
            }
        };
        kernel.on?.('process:stopped', this._handlers.stopped);
    }

    /** No-op kept for API parity with the old NavBar (mobileShell calls setActive). */
    setActive() { /* dock has no active state — running dots are managed via lifecycle events */ }

    destroy() {
        if (this._handlers.started) kernel.off?.('process:started', this._handlers.started);
        if (this._handlers.stopped) kernel.off?.('process:stopped', this._handlers.stopped);
        for (const icon of this._iconInstances.values()) icon.destroy?.();
        this._iconInstances.clear();
        this._tiles.clear();
        this._runningPids.clear();
    }
}
