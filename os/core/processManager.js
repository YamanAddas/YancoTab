
/**
 * YancoTab v2.0 Process Manager
 * Handles application lifecycle, isolation, and resource cleanup.
 */

const SAFE_SCHEMES = ['https:', 'http:', 'tel:', 'mailto:', 'sms:'];

function isValidUrl(url) {
    try {
        const parsed = new URL(url);
        return SAFE_SCHEMES.includes(parsed.protocol);
    } catch {
        return false;
    }
}

function isValidScheme(scheme) {
    try {
        const parsed = new URL(scheme);
        return SAFE_SCHEMES.includes(parsed.protocol);
    } catch {
        // Scheme-style URIs like "tel:+123" won't parse as URL,
        // check if prefix matches allowed schemes
        return SAFE_SCHEMES.some(s => scheme.startsWith(s));
    }
}

export class ProcessManager {
    constructor(kernel) {
        this.kernel = kernel;
        this.processes = new Map(); // pid -> process
        this.registry = new Map(); // appId -> AppClass
        this.nextPid = 1000;
        this._spawning = new Set(); // spawn lock per appId

        // Listen for launch requests from UI
        this.kernel.on('app:open', (appId) => this.spawn(appId));
        this.kernel.on('process:kill', (pid) => this.kill(pid));
    }

    register(appId, appClass) {
        this.registry.set(appId, appClass);
    }

    async spawn(appId, config = {}) {
        // Spawn lock: prevent double-tap duplicate instances
        if (this._spawning.has(appId)) {
            console.warn(`[ProcessManager] Already spawning: ${appId}`);
            return -1;
        }

        console.log(`[ProcessManager] Request to spawn: ${appId}`);

        // A. Internal App (OS Process) - PRIORITY
        const AppClass = this.registry.get(appId);

        if (AppClass) {
            this._spawning.add(appId);
            const pid = this.nextPid++;
            console.log(`[ProcessManager] Spawning Internal ${appId} (PID: ${pid})`);

            const process = {
                pid,
                name: appId,
                instance: null,
                state: 'starting',
                startTime: Date.now()
            };

            try {
                process.instance = new AppClass(this.kernel, pid);
                this.processes.set(pid, process);

                await process.instance.init(config || {});

                // Check if killed during init
                if (!this.processes.has(pid)) {
                    this._spawning.delete(appId);
                    return -1;
                }

                process.state = 'running';
                this.kernel.emit('process:started', { pid, appId, app: process.instance });
                return pid;

            } catch (e) {
                console.error(`[ProcessManager] Failed to spawn ${appId}:`, e?.message || e);
                this.kernel.emit('system:app-error', { appId, message: e?.message || String(e) });
                this.processes.delete(pid);
                return -1;
            } finally {
                this._spawning.delete(appId);
            }
        }

        // B. External / Native / Shortcut Handlers
        const allApps = this.kernel.getApps();
        const appMeta = allApps.find(a => a.id === appId);

        if (appMeta) {
            // 1. Native Scheme with Web Fallback
            if (appMeta.scheme && appMeta.url) {
                if (!isValidScheme(appMeta.scheme) || !isValidUrl(appMeta.url)) {
                    console.error(`[ProcessManager] Blocked unsafe URL/scheme for ${appId}`);
                    return -1;
                }
                console.log(`[ProcessManager] Launching Shortcut: ${appMeta.name}`);
                window.location.href = appMeta.scheme;
                setTimeout(() => {
                    const c = confirm(`Open ${appMeta.name} in Browser? (Cancel if App opened)`);
                    if (c) window.open(appMeta.url, '_blank', 'noopener,noreferrer');
                }, 1500);
                return;
            }

            // 2. Pure Native Scheme
            if (appMeta.scheme) {
                if (!isValidScheme(appMeta.scheme)) {
                    console.error(`[ProcessManager] Blocked unsafe scheme for ${appId}`);
                    return -1;
                }
                console.log(`[ProcessManager] Native Link: ${appMeta.scheme}`);
                window.location.href = appMeta.scheme;
                return;
            }

            // 3. Pure Web URL
            if (appMeta.url) {
                if (!isValidUrl(appMeta.url)) {
                    console.error(`[ProcessManager] Blocked unsafe URL for ${appId}`);
                    return -1;
                }
                console.log(`[ProcessManager] Web Link: ${appMeta.url}`);
                window.open(appMeta.url, '_blank', 'noopener,noreferrer');
                return;
            }
        }

        console.warn(`[ProcessManager] App Implementation not found: ${appId}`);
        return -1;
    }

    async kill(pid) {
        const process = this.processes.get(pid);
        if (!process) return false;

        console.log(`[ProcessManager] Killing process ${pid} (${process.name})`);

        // Remove first to prevent re-entrance
        this.processes.delete(pid);

        // Lifecycle: Dispose (await async cleanup)
        if (process.instance && process.instance.destroy) {
            try {
                await process.instance.destroy();
            } catch (e) {
                console.warn(`[ProcessManager] Error disposing ${pid}: `, e);
            }
        }

        // Null out references to aid GC
        process.instance = null;
        process.kernel = null;

        this.kernel.emit('process:stopped', { pid });
        return true;
    }
}
