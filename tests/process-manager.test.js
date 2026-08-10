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

    test('sequential empty-config spawn of a RUNNING app reuses its pid', async () => {
        // The completed-spawn twin of the in-flight dedupe. Before this,
        // a re-tap of a running app's icon spawned a second process while
        // the first kept running invisibly behind the new window — a leak
        // on every re-tap.
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass();
        pm.register('foo', App);

        const reused = captureEvents(kernel, 'process:reused');
        const pid1 = await pm.spawn('foo');
        const pid2 = await pm.spawn('foo');
        assert.equal(pid1, pid2, 'second tap reuses the running pid');
        assert.equal(App.instanceCount, 1, 'no second instance constructed');
        assert.deepEqual(reused, [{ pid: pid1, appId: 'foo' }]);
    });

    test('config-bearing spawn is NOT reused — each gets a fresh pid', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass();
        pm.register('notes', App);

        const reused = captureEvents(kernel, 'process:reused');
        const pid1 = await pm.spawn('notes', { path: 'A.md' });
        const pid2 = await pm.spawn('notes', { path: 'B.md' });
        assert.notEqual(pid1, pid2);
        assert.equal(App.instanceCount, 2);
        assert.equal(reused.length, 0);
    });

    test('empty-config spawn does NOT reuse a config-bearing sibling', async () => {
        // A Notes *editor* window (config spawn) must not make the Notes
        // *library* unreachable from the icon — the icon tap opens the
        // app's default view alongside the editor.
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass();
        pm.register('notes', App);

        const pid1 = await pm.spawn('notes', { path: 'A.md' });
        const pid2 = await pm.spawn('notes');
        assert.notEqual(pid2, pid1);
        assert.equal(App.instanceCount, 2);
    });

    test('a process marked closing is not offered for reuse', async () => {
        // The window's close animation defers the actual kill by ~220ms;
        // a relaunch during the fade must spawn fresh, not focus a window
        // already committed to dying.
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass();
        pm.register('foo', App);

        const pid1 = await pm.spawn('foo');
        pm.markClosing(pid1);
        const reused = captureEvents(kernel, 'process:reused');
        const pid2 = await pm.spawn('foo');
        assert.notEqual(pid2, pid1);
        assert.equal(reused.length, 0);
        assert.equal(App.instanceCount, 2);
    });

    test('after kill, an empty-config spawn is fresh (no reuse of dead pids)', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass();
        pm.register('foo', App);

        const pid1 = await pm.spawn('foo');
        await pm.kill(pid1);
        const reused = captureEvents(kernel, 'process:reused');
        const pid2 = await pm.spawn('foo');
        assert.notEqual(pid1, pid2);
        assert.equal(App.instanceCount, 2);
        assert.equal(reused.length, 0);
    });

    test('findRunningPid ignores processes still in starting state', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass({ initDelay: 30 });
        pm.register('slow', App);

        const inflight = pm.spawn('slow');
        // Mid-init the process exists in state 'starting' — it must not be
        // offered for reuse (the in-flight dedupe covers this window).
        assert.equal(pm.findRunningPid('slow'), null);
        const pid = await inflight;
        assert.equal(pm.findRunningPid('slow'), pid);
    });

    test('app:open accepts an object payload with config', async () => {
        // kernel.emit forwards exactly one payload argument, so the old
        // emit('app:open', id, config) form silently dropped the config.
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass();
        pm.register('notes', App);

        const started = captureEvents(kernel, 'process:started');
        kernel.emit('app:open', { id: 'notes', config: { mode: 'editor', path: 'x.md' } });
        await new Promise((r) => setTimeout(r, 10));
        assert.equal(App.instanceCount, 1);
        // findRunningPid deliberately ignores config-bearing processes,
        // so resolve the pid from the lifecycle event instead.
        const inst = pm.getInstance(started[0].pid);
        assert.deepEqual(inst.initConfigs, [{ mode: 'editor', path: 'x.md' }]);
    });

    test('app:open ignores malformed payloads without throwing', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        pm.register('notes', makeFakeAppClass());

        for (const bad of [null, 42, {}, { config: {} }, { id: 7 }]) {
            kernel.emit('app:open', bad);
        }
        await new Promise((r) => setTimeout(r, 10));
        assert.equal(pm.findRunningPid('notes'), null);
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

// ─────────────────────────────────────────────
// Resource-key dedupe (one window per owned resource)
// ─────────────────────────────────────────────

/** A fake app that owns `config.path` when config.mode === 'editor'. */
function makeOwningAppClass(opts = {}) {
    const App = makeFakeAppClass(opts);
    App.resourceKey = (config) => (
        config?.mode === 'editor' && typeof config.path === 'string' && config.path
            ? `notes:editor:${config.path}`
            : null
    );
    return App;
}

describe('resource-key dedupe', () => {
    test('a second editor on the SAME path reuses the first process', async () => {
        // Two editors on one note both flush their whole in-memory buffer
        // on a debounce, so the later save silently reverts the other's
        // work. One window per path is the invariant.
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeOwningAppClass();
        pm.register('notes', App);

        const reused = captureEvents(kernel, 'process:reused');
        const pid1 = await pm.spawn('notes', { mode: 'editor', path: '/a.txt' });
        const pid2 = await pm.spawn('notes', { mode: 'editor', path: '/a.txt' });

        assert.equal(pid2, pid1);
        assert.equal(App.instanceCount, 1, 'no second editor instance constructed');
        assert.deepEqual(reused, [{ pid: pid1, appId: 'notes' }]);
    });

    test('editors on DIFFERENT paths still open concurrently', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeOwningAppClass();
        pm.register('notes', App);

        const pid1 = await pm.spawn('notes', { mode: 'editor', path: '/a.txt' });
        const pid2 = await pm.spawn('notes', { mode: 'editor', path: '/b.txt' });
        assert.notEqual(pid1, pid2);
        assert.equal(App.instanceCount, 2);
    });

    test('a config the app declares unowned is never deduped', async () => {
        // Library windows hold no buffer and sync via notes:changed.
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeOwningAppClass();
        pm.register('notes', App);

        const pid1 = await pm.spawn('notes', { path: '/a.txt' });
        const pid2 = await pm.spawn('notes', { path: '/a.txt' });
        assert.notEqual(pid1, pid2);
        assert.equal(App.instanceCount, 2);
    });

    test('an editor does not satisfy a plain icon tap, and vice versa', async () => {
        // findRunningPid only reuses empty-config processes, so an open
        // editor must not make the library unreachable from the icon —
        // and the resulting library must not then be reused as an editor.
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeOwningAppClass();
        pm.register('notes', App);

        const editor = await pm.spawn('notes', { mode: 'editor', path: '/a.txt' });
        const library = await pm.spawn('notes');
        assert.notEqual(library, editor);

        const editorAgain = await pm.spawn('notes', { mode: 'editor', path: '/a.txt' });
        assert.equal(editorAgain, editor, 'the editor, not the library, is reused');
        assert.equal(App.instanceCount, 2);
    });

    test('concurrent opens of the same path share ONE process', async () => {
        // The double-click case: both callers await the same cached
        // import, so the second reaches the check after the first has
        // registered its 'starting' record.
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeOwningAppClass({ initDelay: 20 });
        pm.registerLazy('notes', async () => App);

        const [pid1, pid2] = await Promise.all([
            pm.spawn('notes', { mode: 'editor', path: '/a.txt' }),
            pm.spawn('notes', { mode: 'editor', path: '/a.txt' }),
        ]);
        assert.equal(pid2, pid1);
        assert.equal(App.instanceCount, 1);
    });

    test('a closing editor is not reused — reopening spawns fresh', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeOwningAppClass();
        pm.register('notes', App);

        const pid1 = await pm.spawn('notes', { mode: 'editor', path: '/a.txt' });
        pm.markClosing(pid1);
        const pid2 = await pm.spawn('notes', { mode: 'editor', path: '/a.txt' });
        assert.notEqual(pid2, pid1);
        assert.equal(App.instanceCount, 2);
    });

    test('after the editor is killed, the path is free again', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeOwningAppClass();
        pm.register('notes', App);

        const pid1 = await pm.spawn('notes', { mode: 'editor', path: '/a.txt' });
        await pm.kill(pid1);
        const reused = captureEvents(kernel, 'process:reused');
        const pid2 = await pm.spawn('notes', { mode: 'editor', path: '/a.txt' });
        assert.notEqual(pid2, pid1);
        assert.equal(reused.length, 0);
    });

    test('keys do not leak across apps', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const Notes = makeOwningAppClass();
        const Other = makeOwningAppClass();
        pm.register('notes', Notes);
        pm.register('other', Other);

        const a = await pm.spawn('notes', { mode: 'editor', path: '/a.txt' });
        const b = await pm.spawn('other', { mode: 'editor', path: '/a.txt' });
        assert.notEqual(a, b, 'same key, different app -> different process');
        assert.equal(Notes.instanceCount, 1);
        assert.equal(Other.instanceCount, 1);
    });

    test('apps declaring no resourceKey are unaffected', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);
        const App = makeFakeAppClass(); // no static resourceKey at all
        pm.register('plain', App);

        const pid1 = await pm.spawn('plain', { path: '/a.txt' });
        const pid2 = await pm.spawn('plain', { path: '/a.txt' });
        assert.notEqual(pid1, pid2);
        assert.equal(App.instanceCount, 2);
    });

    test('a throwing or non-string resourceKey degrades to "owns nothing"', async () => {
        const kernel = makeFakeKernel();
        const pm = new ProcessManager(kernel);

        const Thrower = makeFakeAppClass();
        Thrower.resourceKey = () => { throw new Error('boom'); };
        pm.register('thrower', Thrower);
        const t1 = await pm.spawn('thrower', { mode: 'editor', path: '/a.txt' });
        const t2 = await pm.spawn('thrower', { mode: 'editor', path: '/a.txt' });
        assert.notEqual(t1, t2, 'a throwing key must not take the spawn down');
        assert.ok(t1 >= 1000 && t2 >= 1000);

        const Junk = makeFakeAppClass();
        Junk.resourceKey = () => ({ not: 'a string' });
        pm.register('junk', Junk);
        const j1 = await pm.spawn('junk', { mode: 'editor', path: '/a.txt' });
        const j2 = await pm.spawn('junk', { mode: 'editor', path: '/a.txt' });
        assert.notEqual(j1, j2);
    });
});
