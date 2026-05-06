/**
 * Tests for os/core/processManager.js
 * Run with: node --test tests/process-manager.test.js
 *
 * Covers:
 *   - eager + lazy registration
 *   - concurrent spawn dedup (empty config) vs. fresh-instance (config-bearing)
 *   - import dedup, retry-on-rejection
 *   - error events on import failure and init failure
 *   - kill-during-init cleanup
 *   - URL/scheme guards still fire
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ProcessManager } from '../os/core/processManager.js';
import { makeFakeKernel, makeFakeAppClass } from './_helpers/fakeKernel.js';

function captureEvents(kernel, eventName) {
    const captured = [];
    kernel.on(eventName, (data) => captured.push(data));
    return captured;
}

// ─────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────

describe('register / registerLazy / isRegistered', () => {
    test('register stores eager class', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass();
        pm.register('foo', App);
        assert.equal(pm.isRegistered('foo'), true);
        const pid = await pm.spawn('foo');
        assert.ok(pid >= 1000);
        assert.equal(App.instanceCount, 1);
    });

    test('registerLazy stores loader and resolves on first spawn', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass();
        let loaderCalls = 0;
        pm.registerLazy('foo', async () => {
            loaderCalls++;
            return App;
        });
        const pid = await pm.spawn('foo');
        assert.ok(pid >= 1000);
        assert.equal(loaderCalls, 1);
    });

    test('lazy class is cached after first resolve — second spawn does not re-import', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass();
        let loaderCalls = 0;
        pm.registerLazy('foo', async () => {
            loaderCalls++;
            return App;
        });
        await pm.spawn('foo');
        await pm.spawn('foo');
        assert.equal(loaderCalls, 1);
    });

    test('unregister removes the entry', () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        pm.register('foo', makeFakeAppClass());
        assert.equal(pm.isRegistered('foo'), true);
        pm.unregister('foo');
        assert.equal(pm.isRegistered('foo'), false);
    });
});

// ─────────────────────────────────────────────
// Concurrent spawn dedup
// ─────────────────────────────────────────────

describe('concurrent spawn dedup', () => {
    test('two simultaneous empty-config spawns share one pid (icon double-tap protection)', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass({ initDelay: 30 });
        pm.registerLazy('foo', async () => {
            await new Promise((r) => setTimeout(r, 20));
            return App;
        });

        const [pid1, pid2] = await Promise.all([pm.spawn('foo'), pm.spawn('foo')]);
        assert.equal(pid1, pid2, 'both calls return same pid');
        assert.equal(App.instanceCount, 1, 'only one instance created');
    });

    test('config-bearing spawns always allocate fresh pid (FilesApp opens A then B)', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass({ initDelay: 30 });
        pm.registerLazy('notes', async () => {
            await new Promise((r) => setTimeout(r, 20));
            return App;
        });

        const [pidA, pidB] = await Promise.all([
            pm.spawn('notes', { path: 'A.md' }),
            pm.spawn('notes', { path: 'B.md' }),
        ]);
        assert.notEqual(pidA, pidB, 'each file gets its own pid');
        assert.equal(App.instanceCount, 2, 'two separate instances');
    });

    test('two sequential empty-config spawns do NOT dedup (only concurrent ones do)', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass();
        pm.register('foo', App);

        const pid1 = await pm.spawn('foo');
        const pid2 = await pm.spawn('foo');
        assert.notEqual(pid1, pid2, 'sequential spawns get fresh pids');
        assert.equal(App.instanceCount, 2);
    });
});

// ─────────────────────────────────────────────
// Error paths
// ─────────────────────────────────────────────

describe('import failure', () => {
    test('rejected import emits system:app-error with stage:"import" and returns -1', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const errs = captureEvents(kernel, 'system:app-error');

        pm.registerLazy('broken', async () => {
            throw new Error('module not found');
        });

        const pid = await pm.spawn('broken');
        assert.equal(pid, -1);
        assert.equal(errs.length, 1);
        assert.equal(errs[0].appId, 'broken');
        assert.equal(errs[0].stage, 'import');
        assert.match(errs[0].message, /module not found/);
    });

    test('failed import is retryable — second spawn re-invokes the loader', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        let attempts = 0;
        const App = makeFakeAppClass();
        pm.registerLazy('flaky', async () => {
            attempts++;
            if (attempts === 1) throw new Error('first call fails');
            return App;
        });

        const firstPid = await pm.spawn('flaky');
        assert.equal(firstPid, -1);
        const secondPid = await pm.spawn('flaky');
        assert.ok(secondPid >= 1000, 'second spawn succeeds');
        assert.equal(attempts, 2, 'loader was called twice');
    });
});

describe('init failure', () => {
    test('init throw emits system:app-error with stage:"init" and cleans up process record', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const errs = captureEvents(kernel, 'system:app-error');
        const App = makeFakeAppClass({ throwOnInit: true });
        pm.register('crash', App);

        const pid = await pm.spawn('crash');
        assert.equal(pid, -1);
        assert.equal(errs.length, 1);
        assert.equal(errs[0].stage, 'init');
        assert.equal(pm.processes.size, 0, 'no leaked process record');
    });
});

// ─────────────────────────────────────────────
// Kill-during-init regression test
// ─────────────────────────────────────────────

describe('kill during init', () => {
    test('killing a process mid-init does not leave a phantom record', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass({ initDelay: 50 });
        pm.register('slow', App);

        const spawnPromise = pm.spawn('slow');
        // Wait a tick so the spawn allocates a pid and inserts into processes.
        await new Promise((r) => setTimeout(r, 5));
        const [pid] = pm.processes.keys();
        assert.ok(pid, 'process was registered');
        await pm.kill(pid);

        const finalPid = await spawnPromise;
        assert.equal(finalPid, -1, 'spawn returns -1 because killed');
        assert.equal(pm.processes.size, 0, 'no leaked process record');
    });
});

// ─────────────────────────────────────────────
// External app handlers (URL/scheme guards still active)
// ─────────────────────────────────────────────

describe('URL/scheme guards', () => {
    test('javascript: URL is blocked', async () => {
        const kernel = makeFakeKernel({
            apps: [{ id: 'evil', name: 'Evil', url: 'javascript:alert(1)' }],
        });
        const pm = new ProcessManager(kernel);
        const pid = await pm.spawn('evil');
        assert.equal(pid, -1);
    });

    test('data: URL is blocked', async () => {
        const kernel = makeFakeKernel({
            apps: [{ id: 'evil', name: 'Evil', url: 'data:text/html,<script>alert(1)</script>' }],
        });
        const pm = new ProcessManager(kernel);
        const pid = await pm.spawn('evil');
        assert.equal(pid, -1);
    });

    test('javascript: scheme is blocked', async () => {
        const kernel = makeFakeKernel({
            apps: [{ id: 'evil', name: 'Evil', scheme: 'javascript:alert(1)' }],
        });
        const pm = new ProcessManager(kernel);
        const pid = await pm.spawn('evil');
        assert.equal(pid, -1);
    });
});

// ─────────────────────────────────────────────
// Smoke: lifecycle event order
// ─────────────────────────────────────────────

describe('lifecycle events', () => {
    test('process:started fires after init resolves with correct payload', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const events = captureEvents(kernel, 'process:started');
        const App = makeFakeAppClass();
        pm.register('foo', App);

        const pid = await pm.spawn('foo');
        assert.equal(events.length, 1);
        assert.equal(events[0].pid, pid);
        assert.equal(events[0].appId, 'foo');
        assert.ok(events[0].app, 'app instance included in payload');
    });

    test('process:stopped fires after kill', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const events = captureEvents(kernel, 'process:stopped');
        const App = makeFakeAppClass();
        pm.register('foo', App);

        const pid = await pm.spawn('foo');
        await pm.kill(pid);
        assert.equal(events.length, 1);
        assert.equal(events[0].pid, pid);
    });
});
