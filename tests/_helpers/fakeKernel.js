/**
 * Minimal Kernel double for testing ProcessManager.
 * Uses Node's built-in EventTarget so the bus matches the real kernel's behavior.
 */

export function makeFakeKernel({ apps = [] } = {}) {
    const bus = new EventTarget();
    const events = []; // captured emissions for test assertions

    const kernel = {
        bus,
        apps: [...apps],
        emit(event, data) {
            events.push({ event, data });
            bus.dispatchEvent(new CustomEvent(event, { detail: data }));
        },
        on(event, callback) {
            const handler = (e) => callback(e.detail);
            bus.addEventListener(event, handler);
            return () => bus.removeEventListener(event, handler);
        },
        getApps() {
            return [...kernel.apps];
        },
        // Read-only handle for tests to inspect emissions.
        get _events() {
            return events;
        },
        _clearEvents() {
            events.length = 0;
        },
    };

    return kernel;
}

/**
 * Minimal AppStorage double: an in-memory Map with load/save/subscribe.
 *
 * Mirrors two behaviours the real AppStorage has that tests depend on:
 *   • save() JSON-clones, so a caller cannot mutate stored state by
 *     holding onto the object it passed in;
 *   • load() returns a fresh object every call (no memory cache) — which
 *     is what makes runPomodoro's read-modify-write convergence real.
 *
 * `writes` counts save() calls so a test can assert a no-op wrote nothing.
 */
export function makeFakeStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    const subs = new Map();
    return {
        writes: 0,
        load(key) {
            const v = map.get(key);
            return v === undefined ? null : JSON.parse(JSON.stringify(v));
        },
        save(key, value) {
            this.writes++;
            const clean = JSON.parse(JSON.stringify(value));
            map.set(key, clean);
            for (const cb of subs.get(key) || []) cb({ key, newValue: clean, source: 'local' });
        },
        subscribe(key, cb) {
            if (!subs.has(key)) subs.set(key, new Set());
            subs.get(key).add(cb);
            return () => subs.get(key)?.delete(cb);
        },
        /** Test-only: write without counting or notifying (seed / restore). */
        _seed(key, value) { map.set(key, JSON.parse(JSON.stringify(value))); },
        _raw(key) { return map.get(key); },
    };
}

/** Kernel double carrying a fake storage handle. */
export function makeStorageKernel(initial = {}) {
    const kernel = makeFakeKernel();
    kernel.storage = makeFakeStorage(initial);
    return kernel;
}

/**
 * Minimal AppClass shape for tests. The constructor receives (kernel, pid)
 * and `init(config)` runs async work. Tracks call counts for assertions.
 */
export function makeFakeAppClass({ initDelay = 0, throwOnInit = false } = {}) {
    let instanceCount = 0;
    let initCount = 0;

    class FakeApp {
        constructor(kernel, pid) {
            this.kernel = kernel;
            this.pid = pid;
            this.initConfigs = [];
            instanceCount++;
        }
        async init(config) {
            initCount++;
            this.initConfigs.push(config);
            if (initDelay) await new Promise((r) => setTimeout(r, initDelay));
            if (throwOnInit) throw new Error('init failure');
        }
        async destroy() {
            // no-op
        }
    }

    Object.defineProperty(FakeApp, 'instanceCount', { get: () => instanceCount });
    Object.defineProperty(FakeApp, 'initCount', { get: () => initCount });
    return FakeApp;
}
