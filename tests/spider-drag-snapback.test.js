/**
 * Regression tests for the Spider drag controller's snap-back discipline.
 *
 * The "cards go all over" bug in 2-suit Spider had two interacting causes:
 *   A) CardView.update() early-out: when the drag controller mutated
 *      style.transform directly, `cur` stayed stale, so the next _render
 *      wrote nothing — stranding the card at the release point.
 *   B) drag.js _onUp rewrote style.transform by re-parsing it with regex.
 *      On illegal drops and non-tableau drops, no dispatch fired, no
 *      _render followed, and the "snap-back" was a no-op (the transform it
 *      re-wrote was the same mid-drag value).
 *
 * The fix:
 *   - CardView.update always refreshes `cur` and gates the DOM write on
 *     the `.dragging` class.
 *   - drag.js caches each card's pre-drag transform + zIndex in dataset
 *     during _beginDrag, and _snapBackDragged writes them back on _onUp
 *     AND _onCancel.
 *
 * These tests build a minimal DOM shim and drive DragController through
 * the three paths that previously stranded cards:
 *   1. Illegal drop onto a valid tableau column (rank mismatch)
 *   2. Drop onto non-tableau area (no target)
 *   3. Pointer cancel mid-drag
 *
 * Run with: node --test tests/spider-drag-snapback.test.js
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal DOM shim ────────────────────────────────────────────────────────
// drag.js uses: el.classList (add/remove/contains), el.style.{transform,
// zIndex, transition, pointerEvents}, el.dataset.*, el.closest('.selector'),
// el.querySelector / querySelectorAll, el.addEventListener, boardEl.remove...
// Plus globalThis.window + document.elementsFromPoint.

function makeEl({ className = '', attrs = {}, children = [] } = {}) {
  const el = {
    _classes: new Set(className.split(/\s+/).filter(Boolean)),
    _children: children,
    _listeners: Object.create(null),
    style: { transform: '', zIndex: '', transition: '', pointerEvents: '' },
    dataset: { ...attrs },
    get className() { return [...this._classes].join(' '); },
    classList: {
      add: (...cs) => cs.forEach((c) => el._classes.add(c)),
      remove: (...cs) => cs.forEach((c) => el._classes.delete(c)),
      contains: (c) => el._classes.has(c),
      toggle: (c) => (el._classes.has(c) ? (el._classes.delete(c), false) : (el._classes.add(c), true)),
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 60, height: 80, right: 60, bottom: 80 }),
    addEventListener(type, fn) { (el._listeners[type] ??= []).push(fn); },
    removeEventListener(type, fn) {
      const arr = el._listeners[type];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    dispatchEvent(ev) {
      const arr = el._listeners[ev.type];
      if (arr) for (const fn of arr.slice()) fn(ev);
      return true;
    },
    closest(sel) {
      const match = (node) => {
        if (sel.startsWith('.')) return node._classes?.has(sel.slice(1));
        return false;
      };
      return match(el) ? el : null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  return el;
}

function makeCardEl({ pile, idx, cardId, transform, zIndex = '' }) {
  const el = makeEl({
    className: 'cosmic-card',
    attrs: { pile, index: String(idx), cardId },
  });
  el.style.transform = transform;
  el.style.zIndex = zIndex;
  return el;
}

// ── Fixture setup ───────────────────────────────────────────────────────────
// Tableau with two columns:
//   t0: one face-up card S9 (rank 9) — our drag source.
//   t1: one face-up card H6 (rank 6) — an ILLEGAL target (need rank 10).
// Stock empty. No foundations.

function buildFixture() {
  const cards = {
    S9_0: makeCardEl({ pile: 't0', idx: 0, cardId: 'S9_0', transform: 'translate(10px, 100px)', zIndex: '100' }),
    H6_1: makeCardEl({ pile: 't1', idx: 0, cardId: 'H6_1', transform: 'translate(90px, 100px)', zIndex: '100' }),
  };
  const state = {
    tableau: [
      [{ id: 'S9_0', suit: 'S', rank: 9, faceUp: true }],
      [{ id: 'H6_1', suit: 'H', rank: 6, faceUp: true }],
      [], [], [], [], [], [], [], [],
    ],
    stock: [],
    foundation: [],
  };
  const boardEl = makeEl({ className: 'cosmic-spider-board' });
  // Board needs to observe hot/hot-target cleanup queries — return empty arrays.
  boardEl.querySelectorAll = () => [];
  boardEl.querySelector = () => null;

  const cardViews = new Map([
    ['S9_0', { el: cards.S9_0 }],
    ['H6_1', { el: cards.H6_1 }],
  ]);

  return { cards, state, boardEl, cardViews };
}

// ── Global shim ─────────────────────────────────────────────────────────────
let winListeners;
let elementsAtPoint;

function installGlobals() {
  winListeners = Object.create(null);
  elementsAtPoint = [];
  globalThis.window = {
    addEventListener(type, fn) { (winListeners[type] ??= []).push(fn); },
    removeEventListener(type, fn) {
      const arr = winListeners[type];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
  };
  globalThis.document = {
    elementsFromPoint: () => elementsAtPoint.slice(),
  };
  globalThis.PointerEvent = class {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  };
}

function uninstallGlobals() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.PointerEvent;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('DragController — snap-back discipline', () => {
  let mod;
  beforeEach(async () => {
    installGlobals();
    // Re-import each time to reset internal module state (none currently, but safe).
    mod = await import('../os/apps/games/spider/view/drag.js');
  });
  afterEach(() => {
    uninstallGlobals();
  });

  test('illegal drop onto wrong-rank tableau column snaps back to pre-drag transform', () => {
    const { cards, state, boardEl, cardViews } = buildFixture();
    const dispatched = [];
    const controller = new mod.DragController({
      boardEl,
      getState: () => state,
      getCardView: (id) => cardViews.get(id),
      getLayout: () => null,
      onDrop: (p) => dispatched.push(p),
    });

    const src = cards.S9_0;
    const preTransform = src.style.transform;
    const preZ = src.style.zIndex;

    // Simulate pointerdown on the source card. The event.target.closest lookup
    // requires the target to carry the 'cosmic-card' class — src does.
    controller._onDown({ button: 0, target: src, clientX: 10, clientY: 100, pointerId: 1 });
    assert.ok(controller.active, 'active gesture should be recorded');

    // Move far enough to cross the 6px start threshold.
    controller._onMove({ clientX: 80, clientY: 100 });
    assert.ok(controller.active.started, 'drag should have started past threshold');
    assert.equal(src.classList.contains('dragging'), true, 'card should carry .dragging class');
    assert.equal(src.style.zIndex, '9999', 'card zIndex should lift during drag');
    assert.equal(src.dataset.dragBaseX, '10', 'pre-drag X should be cached');
    assert.equal(src.dataset.dragBaseY, '100', 'pre-drag Y should be cached');
    assert.equal(src.dataset.dragBaseZ, '100', 'pre-drag zIndex should be cached');

    // Release over t1 which has rank-6 top (illegal — S9 needs rank 10).
    // elementsFromPoint returns the H6 card, so _hitTest picks 't1'.
    elementsAtPoint = [cards.H6_1];
    controller._onUp({ clientX: 90, clientY: 100 });

    // Snap-back invariants.
    assert.equal(src.style.transform, preTransform, 'transform must snap back');
    assert.equal(src.style.zIndex, preZ, 'zIndex must restore');
    assert.equal(src.classList.contains('dragging'), false, '.dragging must clear');
    assert.equal(src.dataset.dragBaseX, undefined, 'dataset.dragBaseX must clear');
    assert.equal(src.dataset.dragBaseY, undefined, 'dataset.dragBaseY must clear');
    assert.equal(src.dataset.dragBaseZ, undefined, 'dataset.dragBaseZ must clear');
    assert.deepEqual(dispatched, [{ from: { pile: 't0', idx: 0 }, to: 't1' }],
      'onDrop still fires — intents.js validates and flashes illegal');
    assert.equal(controller.active, null, 'gesture state must be cleaned up');
  });

  test('drop onto non-tableau area (no target) snaps back without dispatching', () => {
    const { cards, state, boardEl, cardViews } = buildFixture();
    const dispatched = [];
    const controller = new mod.DragController({
      boardEl,
      getState: () => state,
      getCardView: (id) => cardViews.get(id),
      getLayout: () => null,
      onDrop: (p) => dispatched.push(p),
    });
    const src = cards.S9_0;
    const preTransform = src.style.transform;

    controller._onDown({ button: 0, target: src, clientX: 10, clientY: 100, pointerId: 1 });
    controller._onMove({ clientX: 80, clientY: 100 });

    // Release into empty space — no card under point.
    elementsAtPoint = [];
    controller._onUp({ clientX: 500, clientY: 10 });

    assert.equal(src.style.transform, preTransform, 'transform must snap back');
    assert.equal(src.classList.contains('dragging'), false);
    assert.deepEqual(dispatched, [], 'no dispatch when no tableau target');
  });

  test('pointer cancel mid-drag snaps back cleanly', () => {
    const { cards, state, boardEl, cardViews } = buildFixture();
    const controller = new mod.DragController({
      boardEl,
      getState: () => state,
      getCardView: (id) => cardViews.get(id),
      getLayout: () => null,
      onDrop: () => {},
    });
    const src = cards.S9_0;
    const preTransform = src.style.transform;
    const preZ = src.style.zIndex;

    controller._onDown({ button: 0, target: src, clientX: 10, clientY: 100, pointerId: 1 });
    controller._onMove({ clientX: 50, clientY: 130 });
    assert.ok(controller.active.started, 'drag started');
    assert.notEqual(src.style.transform, preTransform, 'card moved mid-drag');

    controller._onCancel();

    assert.equal(src.style.transform, preTransform, 'cancel must snap transform back');
    assert.equal(src.style.zIndex, preZ, 'cancel must restore zIndex');
    assert.equal(src.classList.contains('dragging'), false, 'cancel must clear .dragging');
    assert.equal(controller.active, null, 'gesture must be cleaned up');
  });

  test('tap (no movement past threshold) does not mutate transform', () => {
    const { cards, state, boardEl, cardViews } = buildFixture();
    const controller = new mod.DragController({
      boardEl,
      getState: () => state,
      getCardView: (id) => cardViews.get(id),
      getLayout: () => null,
      onDrop: () => {},
    });
    const src = cards.S9_0;
    const preTransform = src.style.transform;
    const preZ = src.style.zIndex;

    controller._onDown({ button: 0, target: src, clientX: 10, clientY: 100, pointerId: 1 });
    // No _onMove — just release immediately (tap path).
    controller._onUp({ clientX: 10, clientY: 100 });

    assert.equal(src.style.transform, preTransform, 'tap must not move the card');
    assert.equal(src.style.zIndex, preZ, 'tap must not raise zIndex');
    assert.equal(src.classList.contains('dragging'), false, 'tap never added .dragging');
  });
});
