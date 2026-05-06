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
