import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createHistoryStack, MAX_DEPTH } from '../os/apps/notes/engine/historyStack.js';

describe('historyStack — basic linear', () => {
  test('starts with one entry (the initial body)', () => {
    const h = createHistoryStack({ initialBody: 'hello' });
    assert.equal(h.depth(), 1);
    assert.equal(h.head(), 'hello');
    assert.equal(h.canUndo(), false);
    assert.equal(h.canRedo(), false);
  });

  test('push appends', () => {
    const h = createHistoryStack({ initialBody: 'a' });
    h.push('ab');
    h.push('abc');
    assert.equal(h.depth(), 3);
    assert.equal(h.head(), 'abc');
    assert.equal(h.canUndo(), true);
    assert.equal(h.canRedo(), false);
  });

  test('undo walks backwards', () => {
    const h = createHistoryStack({ initialBody: 'a' });
    h.push('ab');
    h.push('abc');
    assert.equal(h.undo().body, 'ab');
    assert.equal(h.undo().body, 'a');
    assert.equal(h.undo().didUndo, false);
    assert.equal(h.head(), 'a');
  });

  test('redo replays forward', () => {
    const h = createHistoryStack({ initialBody: 'a' });
    h.push('ab');
    h.push('abc');
    h.undo();   // → ab
    h.undo();   // → a
    assert.equal(h.redo().body, 'ab');
    assert.equal(h.redo().body, 'abc');
    assert.equal(h.redo().didRedo, false);
  });
});

describe('historyStack — live vs committed', () => {
  test('first undo snaps live back to head when live diverges', () => {
    const h = createHistoryStack({ initialBody: 'one' });
    h.push('two');
    h.setLive('two-typing-more');
    const r = h.undo();
    assert.equal(r.didUndo, true);
    assert.equal(r.body, 'two');
    // Second undo actually walks back.
    assert.equal(h.undo().body, 'one');
  });

  test('canUndo true when live diverges even with only one entry', () => {
    const h = createHistoryStack({ initialBody: 'a' });
    h.setLive('aa');
    assert.equal(h.canUndo(), true);
  });
});

describe('historyStack — branching', () => {
  test('push after undo drops the redo future', () => {
    const h = createHistoryStack({ initialBody: 'a' });
    h.push('ab');
    h.push('abc');
    h.undo();          // → ab
    h.push('ab!');      // new branch
    assert.equal(h.depth(), 3);   // a, ab, ab!
    assert.equal(h.head(), 'ab!');
    assert.equal(h.canRedo(), false);
  });

  test('idempotent push (same body) does not grow the stack', () => {
    const h = createHistoryStack({ initialBody: 'x' });
    h.push('x');
    h.push('x');
    assert.equal(h.depth(), 1);
  });
});

describe('historyStack — capacity', () => {
  test('drops oldest beyond MAX_DEPTH', () => {
    const h = createHistoryStack({ initialBody: '0' });
    for (let i = 1; i <= MAX_DEPTH + 10; i++) {
      h.push(String(i));
    }
    assert.equal(h.depth(), MAX_DEPTH);
    // head should be the latest push
    assert.equal(h.head(), String(MAX_DEPTH + 10));
  });
});

describe('historyStack — serialise + hydrate', () => {
  test('roundtrips state', () => {
    const a = createHistoryStack({ initialBody: 'x' });
    a.push('xy');
    a.push('xyz');
    a.undo();
    const snap = a.serialise();
    const b = createHistoryStack({ initial: snap });
    assert.equal(b.head(), 'xy');
    assert.equal(b.canRedo(), true);
    assert.equal(b.redo().body, 'xyz');
  });

  test('hydrating from empty initial defaults sanely', () => {
    const h = createHistoryStack({ initial: { entries: [], index: 0, live: '' } });
    assert.equal(h.depth(), 0);
    assert.equal(h.canUndo(), false);
  });
});
