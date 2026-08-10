/**
 * wm-core.test.js — pure window-manager logic (os/ui/wm/wmCore.js).
 *
 * The invariants here are what every DOM decision in WindowManager.js
 * hangs off: focused is always null or a visible pid, minimized ⊆ order,
 * and every operation returns fresh state without mutating its input.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWmState, openWindow, closeWindow, activate, minimize,
  minimizeAll, compactEnforce, visiblePids, zOf,
  cascadeOffset, hitTestSnap, snapRect, WINDOW_CAP,
} from '../os/ui/wm/wmCore.js';

/** Open pids in sequence, asserting each admission succeeds. */
function openAll(...pids) {
  let state = createWmState();
  for (const pid of pids) {
    const r = openWindow(state, pid);
    assert.equal(r.ok, true, `openWindow(${pid}) should succeed`);
    state = r.state;
  }
  return state;
}

function assertInvariants(state, label) {
  const visible = visiblePids(state);
  if (state.focused !== null) {
    assert.ok(visible.includes(state.focused),
      `${label}: focused ${state.focused} must be visible`);
  }
  for (const p of state.minimized) {
    assert.ok(state.order.includes(p), `${label}: minimized ${p} must be in order`);
  }
  // State must stay JSON-serializable (guards a Set/Map sneaking in).
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state,
    `${label}: state must round-trip through JSON`);
}

describe('order and focus', () => {
  test('opening A,B,C stacks bottom→top with C focused', () => {
    const s = openAll(1, 2, 3);
    assert.deepEqual(s.order, [1, 2, 3]);
    assert.equal(s.focused, 3);
    assert.equal(zOf(s, 1), 0);
    assert.equal(zOf(s, 3), 2);
  });

  test('activate raises to top and preserves relative order of the rest', () => {
    const s = activate(openAll(1, 2, 3), 1);
    assert.deepEqual(s.order, [2, 3, 1]);
    assert.equal(s.focused, 1);
  });

  test('activate on the already-focused top window is stable', () => {
    const before = openAll(1, 2);
    const after = activate(before, 2);
    assert.deepEqual(after.order, before.order);
    assert.equal(after.focused, 2);
  });

  test('closing the focused window focuses the next top-most visible', () => {
    const s = closeWindow(openAll(1, 2, 3), 3);
    assert.deepEqual(s.order, [1, 2]);
    assert.equal(s.focused, 2);
  });

  test('closing a bottom window leaves focus alone', () => {
    const s = closeWindow(openAll(1, 2, 3), 1);
    assert.deepEqual(s.order, [2, 3]);
    assert.equal(s.focused, 3);
  });

  test('closing the last window leaves focused null', () => {
    const s = closeWindow(openAll(1), 1);
    assert.deepEqual(s.order, []);
    assert.equal(s.focused, null);
  });
});

describe('minimize bookkeeping', () => {
  test('minimizing the focused window falls back to next visible', () => {
    const s = minimize(openAll(1, 2, 3), 3);
    assert.equal(s.focused, 2);
    assert.deepEqual(visiblePids(s), [1, 2]);
    assert.deepEqual(s.order, [1, 2, 3]); // z slot retained
  });

  test('focus fallback skips already-minimized windows', () => {
    let s = minimize(openAll(1, 2, 3), 2);
    s = minimize(s, 3);
    assert.equal(s.focused, 1);
  });

  test('minimizing the last visible window leaves focused null', () => {
    let s = minimize(openAll(1, 2), 2);
    s = minimize(s, 1);
    assert.equal(s.focused, null);
    assert.deepEqual(visiblePids(s), []);
  });

  test('minimize is idempotent', () => {
    const once = minimize(openAll(1, 2), 2);
    const twice = minimize(once, 2);
    assert.deepEqual(twice, once);
    assert.equal(once.minimized.filter((p) => p === 2).length, 1);
  });

  test('minimizing an unfocused window leaves focus alone', () => {
    const s = minimize(openAll(1, 2, 3), 1);
    assert.equal(s.focused, 3);
  });

  test('activate restores a minimized window: visible + top + focused', () => {
    let s = minimize(openAll(1, 2, 3), 2);
    s = activate(s, 2);
    assert.deepEqual(s.order, [1, 3, 2]);
    assert.deepEqual(s.minimized, []);
    assert.equal(s.focused, 2);
  });

  test('minimizeAll empties the visible set but keeps order', () => {
    const s = minimizeAll(openAll(1, 2, 3));
    assert.deepEqual(visiblePids(s), []);
    assert.deepEqual(s.order, [1, 2, 3]);
    assert.equal(s.focused, null);
  });
});

describe('window cap', () => {
  test(`${WINDOW_CAP} windows admitted, the next refused with state unchanged`, () => {
    let state = createWmState();
    for (let i = 0; i < WINDOW_CAP; i++) {
      const r = openWindow(state, 100 + i);
      assert.equal(r.ok, true);
      state = r.state;
    }
    const before = structuredClone(state);
    const r = openWindow(state, 999);
    assert.equal(r.ok, false);
    assert.equal(r.cascadeSlot, -1);
    assert.deepEqual(r.state, before);
  });

  test('minimized windows count toward the cap', () => {
    let state = createWmState();
    for (let i = 0; i < WINDOW_CAP; i++) {
      state = openWindow(state, 100 + i).state;
    }
    state = minimize(state, 100);
    assert.equal(openWindow(state, 999).ok, false);
  });

  test('closing a window frees a cap slot', () => {
    let state = createWmState();
    for (let i = 0; i < WINDOW_CAP; i++) {
      state = openWindow(state, 100 + i).state;
    }
    state = closeWindow(state, 100);
    assert.equal(openWindow(state, 999).ok, true);
  });
});

describe('hostile and edge input', () => {
  test('duplicate pid is refused', () => {
    const s = openAll(1);
    const r = openWindow(s, 1);
    assert.equal(r.ok, false);
    assert.deepEqual(r.state, s);
  });

  test('non-numeric pids are refused or ignored everywhere', () => {
    const s = openAll(1, 2);
    for (const bad of ['1', null, undefined, NaN, {}, []]) {
      assert.equal(openWindow(s, bad).ok, false, `open(${String(bad)})`);
      assert.deepEqual(closeWindow(s, bad), s, `close(${String(bad)})`);
      assert.deepEqual(activate(s, bad), s, `activate(${String(bad)})`);
      assert.deepEqual(minimize(s, bad), s, `minimize(${String(bad)})`);
    }
  });

  test('operations on unknown pids are no-ops', () => {
    const s = openAll(1, 2);
    assert.deepEqual(closeWindow(s, 77), s);
    assert.deepEqual(activate(s, 77), s);
    assert.deepEqual(minimize(s, 77), s);
  });

  test('no operation mutates its input state', () => {
    const s = openAll(1, 2, 3);
    const frozen = structuredClone(s);
    openWindow(s, 4);
    closeWindow(s, 2);
    activate(s, 1);
    minimize(s, 3);
    minimizeAll(s);
    compactEnforce(s);
    assert.deepEqual(s, frozen);
  });
});

describe('compactEnforce', () => {
  test('minimizes every visible window except the focused one', () => {
    const { state, toMinimize } = compactEnforce(openAll(1, 2, 3));
    assert.deepEqual(toMinimize.sort(), [1, 2]);
    assert.deepEqual(visiblePids(state), [3]);
    assert.equal(state.focused, 3);
  });

  test('nothing to do at ≤1 visible window', () => {
    const one = openAll(1);
    assert.deepEqual(compactEnforce(one).toMinimize, []);
    const none = minimizeAll(openAll(1, 2));
    assert.deepEqual(compactEnforce(none).toMinimize, []);
  });

  test('with focused null but windows visible, keeps the top one', () => {
    // Constructed state: focused window closed while others visible is
    // impossible via the API, but a hand-built state must not crash.
    const s = { order: [1, 2], minimized: [], focused: null, cascadeSeq: 2 };
    const { state, toMinimize } = compactEnforce(s);
    assert.deepEqual(toMinimize, [1]);
    assert.deepEqual(visiblePids(state), [2]);
  });
});

describe('cascade', () => {
  test('slots step monotonically by 28px on both axes', () => {
    for (let slot = 0; slot < 6; slot++) {
      assert.deepEqual(cascadeOffset(slot), { dx: slot * 28, dy: slot * 28 });
    }
  });

  test('slot 6 wraps to 0', () => {
    assert.deepEqual(cascadeOffset(6), { dx: 0, dy: 0 });
    assert.deepEqual(cascadeOffset(7), cascadeOffset(1));
  });

  test('garbage slots resolve to slot 0', () => {
    for (const bad of [-1, NaN, Infinity, null, undefined]) {
      assert.deepEqual(cascadeOffset(bad), { dx: 0, dy: 0 }, `slot ${String(bad)}`);
    }
  });

  test('closing the last window resets the cascade counter', () => {
    // Without the reset, a lone window opened after a busy session lands
    // up to 140px off its CSS default position for no visible reason.
    let s = openAll(1, 2, 3);
    s = closeWindow(closeWindow(s, 1), 2);
    assert.ok(s.cascadeSeq > 0, 'counter keeps counting while windows remain');
    s = closeWindow(s, 3);
    assert.equal(s.cascadeSeq, 0);
    const r = openWindow(s, 9);
    assert.equal(r.cascadeSlot, 0, 'fresh desktop starts the cascade over');
  });
});

describe('snap hit-testing', () => {
  const vw = 1280, vh = 800;

  test('side zones and top strip', () => {
    assert.equal(hitTestSnap(0, 400, vw, vh), 'left');
    assert.equal(hitTestSnap(24, 400, vw, vh), 'left');
    assert.equal(hitTestSnap(25, 400, vw, vh), null);
    assert.equal(hitTestSnap(vw, 400, vw, vh), 'right');
    assert.equal(hitTestSnap(vw - 24, 400, vw, vh), 'right');
    assert.equal(hitTestSnap(640, 8, vw, vh), 'top');
    assert.equal(hitTestSnap(640, 9, vw, vh), null);
    assert.equal(hitTestSnap(640, 400, vw, vh), null);
  });

  test('corners: side beats top', () => {
    assert.equal(hitTestSnap(2, 2, vw, vh), 'left');
    assert.equal(hitTestSnap(vw - 2, 0, vw, vh), 'right');
  });

  test('out-of-viewport and non-finite coordinates arm nothing', () => {
    assert.equal(hitTestSnap(-1, 400, vw, vh), null);
    assert.equal(hitTestSnap(vw + 1, 400, vw, vh), null);
    assert.equal(hitTestSnap(640, -1, vw, vh), null);
    assert.equal(hitTestSnap(640, vh + 1, vw, vh), null);
    assert.equal(hitTestSnap(NaN, 400, vw, vh), null);
    assert.equal(hitTestSnap(640, NaN, vw, vh), null);
  });
});

describe('snap geometry', () => {
  test('halves tile an even viewport exactly', () => {
    const l = snapRect('left', 1280, 800);
    const r = snapRect('right', 1280, 800);
    assert.deepEqual(l, { left: 0, top: 0, width: 640, height: 800 });
    assert.deepEqual(r, { left: 640, top: 0, width: 640, height: 800 });
  });

  test('halves tile an odd viewport with no seam and no overlap', () => {
    const vw = 1367;
    const l = snapRect('left', vw, 900);
    const r = snapRect('right', vw, 900);
    assert.equal(l.width, 684);
    assert.equal(r.left, 683);
    assert.equal(r.left + r.width, vw);      // right edge flush
    assert.ok(l.width >= vw - r.left - r.width + l.width); // no gap: l covers up to 684, r starts at 683
    assert.ok(l.left + l.width >= r.left);   // seam covered
  });

  test('top zone returns null (maximize path, not a rect)', () => {
    assert.equal(snapRect('top', 1280, 800), null);
    assert.equal(snapRect('nonsense', 1280, 800), null);
  });
});

describe('invariant lock', () => {
  test('focused is always visible and minimized ⊆ order across an op matrix', () => {
    const ops = [
      (s) => openWindow(s, 50).state,
      (s) => closeWindow(s, s.order[0]),
      (s) => closeWindow(s, s.focused),
      (s) => activate(s, s.order[0]),
      (s) => minimize(s, s.focused),
      (s) => minimize(s, s.order[0]),
      (s) => minimizeAll(s),
      (s) => compactEnforce(s).state,
    ];
    const seeds = [
      createWmState(),
      openAll(1),
      openAll(1, 2, 3),
      minimize(openAll(1, 2, 3), 2),
      minimizeAll(openAll(1, 2)),
    ];
    for (const [si, seed] of seeds.entries()) {
      for (const [oi, op] of ops.entries()) {
        const out = op(structuredClone(seed));
        assertInvariants(out, `seed ${si} op ${oi}`);
      }
    }
  });
});
