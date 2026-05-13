/**
 * Tests for os/apps/pdf/v3/ops/undoStack.js — pure command-stack.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createUndoStack } from '../os/apps/pdf/v3/ops/undoStack.js';

function mkCmd(log, name) {
  return {
    label: name,
    undo: () => { log.push(`u:${name}`); },
    redo: () => { log.push(`r:${name}`); },
  };
}

describe('undoStack', () => {
  it('starts empty', () => {
    const s = createUndoStack();
    assert.equal(s.canUndo(), false);
    assert.equal(s.canRedo(), false);
    assert.deepEqual(s.depth(), { undo: 0, redo: 0 });
  });

  it('push advances canUndo', () => {
    const s = createUndoStack();
    s.push(mkCmd([], 'a'));
    assert.equal(s.canUndo(), true);
    assert.equal(s.canRedo(), false);
    assert.equal(s.topLabel(), 'a');
  });

  it('undo runs cmd.undo and flips canRedo', async () => {
    const log = [];
    const s = createUndoStack();
    s.push(mkCmd(log, 'a'));
    s.push(mkCmd(log, 'b'));
    const ok = await s.undo();
    assert.equal(ok, true);
    assert.deepEqual(log, ['u:b']);
    assert.equal(s.canRedo(), true);
    assert.equal(s.topLabel(), 'a');
  });

  it('redo runs cmd.redo and flips canRedo back', async () => {
    const log = [];
    const s = createUndoStack();
    s.push(mkCmd(log, 'a'));
    await s.undo();
    const ok = await s.redo();
    assert.equal(ok, true);
    assert.deepEqual(log, ['u:a', 'r:a']);
    assert.equal(s.canUndo(), true);
    assert.equal(s.canRedo(), false);
  });

  it('push clears the redo branch', async () => {
    const s = createUndoStack();
    s.push(mkCmd([], 'a'));
    s.push(mkCmd([], 'b'));
    await s.undo();
    assert.equal(s.canRedo(), true);
    s.push(mkCmd([], 'c'));
    assert.equal(s.canRedo(), false);
  });

  it('undo on empty stack is a no-op', async () => {
    const s = createUndoStack();
    const ok = await s.undo();
    assert.equal(ok, false);
  });

  it('redo on empty stack is a no-op', async () => {
    const s = createUndoStack();
    const ok = await s.redo();
    assert.equal(ok, false);
  });

  it('caps at 100 entries (oldest dropped)', () => {
    const s = createUndoStack();
    for (let i = 0; i < 105; i++) s.push(mkCmd([], `c${i}`));
    assert.equal(s.depth().undo, 100);
    // Oldest 5 (c0..c4) should be gone; c5 is the new bottom.
    assert.equal(s.topLabel(), 'c104');
  });

  it('clear() empties both stacks', async () => {
    const s = createUndoStack();
    s.push(mkCmd([], 'a'));
    s.push(mkCmd([], 'b'));
    await s.undo();
    s.clear();
    assert.deepEqual(s.depth(), { undo: 0, redo: 0 });
    assert.equal(s.canUndo(), false);
    assert.equal(s.canRedo(), false);
  });

  it('onChange fires on push / undo / redo / clear', async () => {
    const events = [];
    const s = createUndoStack({
      onChange: (st) => events.push(`${st.canUndo ? 'U' : '-'}${st.canRedo ? 'R' : '-'}`),
    });
    s.push(mkCmd([], 'a'));
    await s.undo();
    await s.redo();
    s.clear();
    assert.deepEqual(events, ['U-', '-R', 'U-', '--']);
  });

  it('failed undo re-pushes the command', async () => {
    const s = createUndoStack();
    let attempts = 0;
    s.push({
      label: 'flaky',
      undo: () => { attempts++; throw new Error('boom'); },
      redo: () => {},
    });
    const ok = await s.undo();
    assert.equal(ok, false);
    assert.equal(attempts, 1);
    assert.equal(s.canUndo(), true);   // still there to retry
  });

  it('rejects malformed commands', () => {
    const s = createUndoStack();
    s.push(null);
    s.push({});
    s.push({ undo: () => {} });   // missing redo
    s.push({ redo: () => {} });   // missing undo
    assert.equal(s.canUndo(), false);
  });

  it('awaits async undo before flipping state', async () => {
    const s = createUndoStack();
    let resolved = false;
    s.push({
      label: 'slow',
      undo: () => new Promise((r) => setTimeout(() => { resolved = true; r(); }, 5)),
      redo: () => {},
    });
    const p = s.undo();
    // While pending, canUndo should report false.
    assert.equal(s.canUndo(), false);
    await p;
    assert.equal(resolved, true);
    assert.equal(s.canRedo(), true);
  });

  it('label defaults to "edit" if missing', () => {
    const s = createUndoStack();
    s.push({ undo: () => {}, redo: () => {} });
    assert.equal(s.topLabel(), 'edit');
  });
});
