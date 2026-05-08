/**
 * Regression tests for the read/write helpers exposed by
 * os/apps/todo/persistence.js — used by TodoWidget and SmartSearch's
 * "> add todo" / "! …" quick-capture paths.
 *
 * Bug they prevent: pre-fix, the widget mutated yancotab_todo_v1 (by
 * matching tasks on text) while TodoApp had moved to _v2 (mission ids,
 * streak log, completedAt). Toggling a checkbox in the widget did not
 * affect the app, and two tasks with identical text would collide.
 *
 * These helpers route through the v2 reducer (intents.js), so streaks
 * and completedAt timestamps stay consistent with TodoApp's own writes.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Stub localStorage and AppStorage's _emit window dispatch.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
}

const { AppStorage } = await import('../os/services/appStorage.js');
const persist = await import('../os/apps/todo/persistence.js');

function makeKernel() {
  globalThis.localStorage.clear();
  const storage = new AppStorage();
  // Minimal kernel with the methods persistence.js calls.
  return {
    storage,
    emit: () => {}, // not under test
    on: () => () => {},
  };
}

describe('todo/persistence — getActiveMission / getOpenTasks', () => {
  test('first-load returns the default mission', () => {
    const k = makeKernel();
    const state = persist.loadState(k);
    const m = persist.getActiveMission(state);
    assert.ok(m, 'mission exists');
    assert.equal(m.name, 'My Tasks');
    assert.deepEqual(persist.getOpenTasks(state), []);
  });

  test('falls back to first mission when activeMissionId is invalid', () => {
    const k = makeKernel();
    const state = persist.loadState(k);
    state.activeMissionId = 'nonexistent';
    const m = persist.getActiveMission(state);
    assert.equal(m, state.missions[0]);
  });

  test('getOpenTasks omits done tasks and sorts by position', () => {
    const k = makeKernel();
    persist.quickAddTask(k, 'first');
    persist.quickAddTask(k, 'second');
    persist.quickAddTask(k, 'third');
    const state = persist.loadState(k);
    const open = persist.getOpenTasks(state);
    assert.equal(open.length, 3);
    assert.deepEqual(open.map(t => t.text), ['first', 'second', 'third']);
    // Mark the middle one done; it disappears from open list.
    persist.quickToggleTask(k, open[1].id);
    const after = persist.getOpenTasks(persist.loadState(k));
    assert.deepEqual(after.map(t => t.text), ['first', 'third']);
  });
});

describe('todo/persistence — quickAddTask / quickToggleTask', () => {
  test('quickAddTask adds to the active mission and assigns an id', () => {
    const k = makeKernel();
    const next = persist.quickAddTask(k, 'buy milk');
    const open = persist.getOpenTasks(next);
    assert.equal(open.length, 1);
    assert.equal(open[0].text, 'buy milk');
    assert.match(open[0].id, /^t_/);
    assert.equal(open[0].done, false);
  });

  test('quickAddTask returns null on empty input', () => {
    const k = makeKernel();
    assert.equal(persist.quickAddTask(k, ''), null);
    assert.equal(persist.quickAddTask(k, null), null);
  });

  test('quickToggleTask flips done and stamps completedAt', () => {
    const k = makeKernel();
    persist.quickAddTask(k, 'task A');
    let state = persist.loadState(k);
    const taskId = persist.getOpenTasks(state)[0].id;

    persist.quickToggleTask(k, taskId);
    state = persist.loadState(k);
    const toggled = state.missions[0].tasks.find(t => t.id === taskId);
    assert.equal(toggled.done, true);
    assert.ok(typeof toggled.completedAt === 'string', 'completedAt set');

    // Toggle back — done flips false, completedAt clears.
    persist.quickToggleTask(k, taskId);
    state = persist.loadState(k);
    const back = state.missions[0].tasks.find(t => t.id === taskId);
    assert.equal(back.done, false);
    assert.equal(back.completedAt, null);
  });

  test('quickToggleTask is a no-op for unknown task id', () => {
    const k = makeKernel();
    persist.quickAddTask(k, 'real');
    const before = persist.loadState(k);
    persist.quickToggleTask(k, 'nonexistent_id');
    const after = persist.loadState(k);
    // Active mission tasks unchanged
    assert.deepEqual(
      before.missions[0].tasks.map(t => ({ id: t.id, done: t.done })),
      after.missions[0].tasks.map(t => ({ id: t.id, done: t.done })),
    );
  });

  test('writes land in yancotab_todo_v2, never v1', () => {
    const k = makeKernel();
    persist.quickAddTask(k, 'audit task');
    // v2 is populated, v1 is not.
    assert.ok(globalThis.localStorage.getItem('yancotab_todo_v2'));
    assert.equal(globalThis.localStorage.getItem('yancotab_todo_v1'), null);
  });

  test('quickToggleTask bumps streak on flip-to-done', () => {
    const k = makeKernel();
    persist.quickAddTask(k, 'streak task');
    const taskId = persist.getOpenTasks(persist.loadState(k))[0].id;
    persist.quickToggleTask(k, taskId);
    const state = persist.loadState(k);
    const todayKey = new Date().toISOString().slice(0, 10);
    assert.equal(state.streakLog[todayKey], 1);
  });
});
