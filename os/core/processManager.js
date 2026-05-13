/**
 * YancoTab v1.1 Process Manager
 * Handles application lifecycle, isolation, and resource cleanup.
 *
 * Lazy-load contract:
 *   - register(id, AppClass)  — eager. Class is already imported.
 *   - registerLazy(id, ()=>import(...))  — lazy. Loader thunk; module
 *     is fetched on first spawn and cached.
 *   - _resolve(id) caches the in-flight import promise; on rejection,
 *     the cache is cleared so the next spawn retries cleanly.
 *
 * Spawn dedup:
 *   - Empty-config spawn (icon tap, dock tap, search result) — deduped
 *     by appId. Two simultaneous taps share one pid.
 *   - Config-bearing spawn (FilesApp opening different files) — always
 *     allocates a fresh pid + instance so each file gets its own window.
 */

import { dlog } from '../utils/debugLog.js';

const SAFE_SCHEMES = ['https:', 'http:', 'tel:', 'mailto:', 'sms:'];
const IMPORT_TIMEOUT_MS = 15_000;

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

function isEmptyConfig(config) {
    if (!config) return true;
    if (typeof config !== 'object') return false;
    for (const _ in config) return false; // eslint-disable-line no-unused-vars
    return true;
}

export class ProcessManager {
    constructor(kernel) {
        this.kernel = kernel;
        this.processes = new Map(); // pid -> process record
        this.registry = new Map();  // appId -> { resolved, appClass?, loader?, loading? }
        this.nextPid = 1000;
        // Empty-config spawns are deduped — second tap shares first tap's pid promise.
        // Config-bearing spawns are NOT deduped — each FilesApp file open gets its own pid.
        this._inflightNoConfig = new Map(); // appId -> Promise<pid>

        // Listen for launch requests from UI. Optional `config` ride-along
        // lets `kernel.emit('app:open', 'tarneeb', { preset: 'damascus' })`
        // pass the preset all the way through to App.init(config). Existing
        // single-arg callers keep working — config defaults to {} via spawn.
        this.kernel.on('app:open', (appId, config) => this.spawn(appId, config));
        this.kernel.on('process:kill', (pid) => this.kill(pid));
    }

    register(appId, appClass) {
        this.registry.set(appId, { resolved: true, appClass });
    }

    registerLazy(appId, loaderFn) {
        this.registry.set(appId, {
            resolved: false,
            loader: loaderFn,
            appClass: null,
            loading: null,
        });
    }

    isRegistered(appId) {
        return this.registry.has(appId);
    }

    /** Test/hot-reload helper. */
    unregister(appId) {
        this.registry.delete(appId);
    }

    async _resolve(appId) {
        const entry = this.registry.get(appId);
        if (!entry) return null;
        if (entry.resolved) return entry.appClass;

        // Cache the in-flight import promise. Concurrent _resolve calls
        // share it. On rejection the cache is cleared so retries can
        // re-attempt the import cleanly.
        if (!entry.loading) {
            const timeout = new Promise((_, reject) => {
                setTimeout(
                    () => reject(new Error(`Import timeout after ${IMPORT_TIMEOUT_MS}ms: ${appId}`)),
                    IMPORT_TIMEOUT_MS,
                );
            });
            entry.loading = Promise.race([entry.loader(), timeout]).then(
                (AppClass) => {
                    entry.appClass = AppClass;
                    entry.resolved = true;
                    entry.loading = null;
                    return AppClass;
                },
                (err) => {
                    entry.loading = null;
                    throw err;
                },
            );
        }
        return entry.loading;
    }

    async spawn(appId, config = {}) {
        // Dedup empty-config spawns (icon taps): two simultaneous taps
        // share one pid. Config-bearing spawns (FilesApp open file)
        // skip the dedup so each file gets a fresh window.
        if (isEmptyConfig(config) && this._inflightNoConfig.has(appId)) {
            return this._inflightNoConfig.get(appId);
        }

        const promise = this._doSpawn(appId, config);

        if (isEmptyConfig(config)) {
            this._inflightNoConfig.set(appId, promise);
            promise.finally(() => {
                if (this._inflightNoConfig.get(appId) === promise) {
                    this._inflightNoConfig.delete(appId);
                }
            });
        }

        return promise;
    }

    async _doSpawn(appId, config) {
        dlog(`[ProcessManager] Request to spawn: ${appId}`);

        // A. Internal App (OS Process) — try the registry first.
        let AppClass;
        try {
            AppClass = await this._resolve(appId);
        } catch (e) {
            // Import failed (network, parse error, timeout). Surface to UI.
            console.error('[ProcessManager] Import failed for', appId, ':', e?.message || e);
            this.kernel.emit('system:app-error', {
                appId,
                stage: 'import',
                message: e?.message || String(e),
            });
            return -1;
        }

        if (AppClass) {
            const pid = this.nextPid++;
            dlog(`[ProcessManager] Spawning Internal ${appId} (PID: ${pid})`);

            const process = {
                pid,
                name: appId,
                instance: null,
                state: 'starting',
                startTime: Date.now(),
            };

            try {
                process.instance = new AppClass(this.kernel, pid);
                this.processes.set(pid, process);

                await process.instance.init(config || {});

                // Check if killed during init
                if (!this.processes.has(pid)) {
                    return -1;
                }

                process.state = 'running';
                this.kernel.emit('process:started', { pid, appId, app: process.instance });
                return pid;

            } catch (e) {
                console.error('[ProcessManager] Failed to spawn', appId, ':', e?.message || e);
                this.kernel.emit('system:app-error', {
                    appId,
                    stage: 'init',
                    message: e?.message || String(e),
                });
                this.processes.delete(pid);
                return -1;
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
                dlog(`[ProcessManager] Launching Shortcut: ${appMeta.name}`);
                window.location.href = appMeta.scheme;
                // Lazy-import YancoModal so processManager doesn't carry a
                // hard dependency on the UI module — the modal is only
                // needed in this rare scheme-with-fallback path.
                setTimeout(async () => {
                    try {
                        const { showConfirm } = await import('../ui/components/YancoModal.js');
                        const ok = await showConfirm(
                            `Open ${appMeta.name} in Browser?`,
                            'Click "Open" only if the native app did not launch.',
                            { confirmLabel: 'Open', cancelLabel: 'Stay' }
                        );
                        if (ok) window.open(appMeta.url, '_blank', 'noopener,noreferrer');
                    } catch (e) {
                        console.error('[ProcessManager] Fallback confirm failed:', e);
                    }
                }, 1500);
                return;
            }

            // 2. Pure Native Scheme
            if (appMeta.scheme) {
                if (!isValidScheme(appMeta.scheme)) {
                    console.error(`[ProcessManager] Blocked unsafe scheme for ${appId}`);
                    return -1;
                }
                dlog(`[ProcessManager] Native Link: ${appMeta.scheme}`);
                window.location.href = appMeta.scheme;
                return;
            }

            // 3. Pure Web URL
            if (appMeta.url) {
                if (!isValidUrl(appMeta.url)) {
                    console.error(`[ProcessManager] Blocked unsafe URL for ${appId}`);
                    return -1;
                }
                dlog(`[ProcessManager] Web Link: ${appMeta.url}`);
                window.open(appMeta.url, '_blank', 'noopener,noreferrer');
                return;
            }
        }

        console.warn(`[ProcessManager] App Implementation not found: ${appId}`);
        return -1;
    }

    /**
     * Public read-only accessor — returns the app instance for `pid`, or
     * null. Used by the shell to dispatch keyboard shortcuts to the
     * active app (Ctrl+N → notes._createDocument, Escape → close, etc.).
     *
     * Mutating the returned instance is allowed (it's the same reference
     * the app holds), but callers should treat it as opaque — only call
     * documented App methods on it.
     */
    getInstance(pid) {
        return this.processes.get(pid)?.instance || null;
    }

    /**
     * Returns { pid, name } for `pid`, or null. `name` is the appId the
     * process was spawned for ('notes', 'todo', 'tarneeb' …). Useful
     * when the caller only needs identity, not the live instance.
     */
    getProcessInfo(pid) {
        const p = this.processes.get(pid);
        if (!p) return null;
        return { pid, name: p.name };
    }

    /**
     * Soft-close a process via its app's own close() method, if defined.
     * The app is responsible for deciding what "close" means (animations,
     * confirmation prompts, etc.) and for ultimately calling kill() —
     * the shell asks politely; the app does the work.
     *
     * Returns true if a close method was invoked. Falls back to false
     * if the pid is unknown or the instance has no close method.
     * Callers wanting unconditional teardown should use kill() directly.
     */
    closeProcess(pid) {
        const inst = this.processes.get(pid)?.instance;
        if (inst && typeof inst.close === 'function') {
            try { inst.close(); return true; } catch (e) {
                console.warn('[ProcessManager] close() threw:', e);
                return false;
            }
        }
        return false;
    }

    async kill(pid) {
        const process = this.processes.get(pid);
        if (!process) return false;

        dlog(`[ProcessManager] Killing process ${pid} (${process.name})`);

        // Remove first to prevent re-entrance
        this.processes.delete(pid);

        // Lifecycle: Dispose (await async cleanup)
        if (process.instance && process.instance.destroy) {
            try {
                await process.instance.destroy();
            } catch (e) {
                console.warn('[ProcessManager] Error disposing', pid, ':', e);
            }
        }

        // Null out references to aid GC
        process.instance = null;
        process.kernel = null;

        this.kernel.emit('process:stopped', { pid });
        return true;
    }
}
