/**
 * grid-nav.test.js — arrow-key movement across the app grid.
 *
 * The grid was pointer-only: icons are plain divs positioned by transform,
 * launching runs entirely through MobileInteractionV2's pointer pipeline,
 * and Tab walked past all 22 apps to the dock.
 *
 * Movement cannot be derived from DOM order — every icon is absolutely
 * positioned, all pages share one container, and a dragged icon keeps its
 * original node — so it is computed from each item's stored page/row/col.
 * That arithmetic is what these tests cover.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { nextFocusId, pageItems, NAV_KEYS, ACTIVATE_KEYS } from '../os/ui/components/grid/gridNav.js';

/** Build a Map of items from a compact "page:row,col" spec. */
function grid(spec) {
  const map = new Map();
  for (const [id, page, row, col, extra] of spec) {
    map.set(id, { id, title: id, page, row, col, ...(extra || {}) });
  }
  return map;
}

// Two full rows of 4 on page 0, a partial row of 2 on page 1.
const ITEMS = grid([
  ['a', 0, 0, 0], ['b', 0, 0, 1], ['c', 0, 0, 2], ['d', 0, 0, 3],
  ['e', 0, 1, 0], ['f', 0, 1, 1], ['g', 0, 1, 2],
  ['x', 1, 0, 0], ['y', 1, 0, 1],
]);

const move = (key, activeId, page = 0, items = ITEMS, pageCount = 2) =>
  nextFocusId({ items, page, pageCount, activeId, key });

describe('pageItems', () => {
  test('returns only the visible top-level items of one page, in reading order', () => {
    const items = grid([
      ['z', 0, 1, 0], ['a', 0, 0, 0], ['m', 0, 0, 1],
      ['child', 0, 2, 0, { parent: 'folder1' }],
      ['ghost', 0, 3, 0, { hidden: true }],
      ['other', 1, 0, 0],
    ]);
    assert.deepEqual(pageItems(items, 0).map((i) => i.id), ['a', 'm', 'z']);
  });

  test('accepts an array as well as a Map, and survives junk', () => {
    assert.deepEqual(pageItems([{ id: 'a', page: 0, row: 0, col: 0 }, null, 7], 0).map((i) => i.id), ['a']);
    assert.deepEqual(pageItems(null, 0), []);
    assert.deepEqual(pageItems(undefined, 0), []);
  });
});

describe('horizontal movement', () => {
  test('steps along the row', () => {
    assert.equal(move('ArrowRight', 'a'), 'b');
    assert.equal(move('ArrowLeft', 'b'), 'a');
  });

  test('wraps onto the next row rather than stopping at the row end', () => {
    assert.equal(move('ArrowRight', 'd'), 'e');
    assert.equal(move('ArrowLeft', 'e'), 'd');
  });

  test('spills onto the adjacent page at the page edges', () => {
    assert.equal(move('ArrowRight', 'g'), 'x', 'last item of page 0 → first of page 1');
    assert.equal(move('ArrowLeft', 'x', 1), 'g', 'first of page 1 → last of page 0');
  });

  test('does NOT wrap around from the last page to the first', () => {
    // A silent jump back to page 1 reads as the key having done something
    // else entirely, so running off the end does nothing at all.
    assert.equal(move('ArrowRight', 'y', 1), null);
    assert.equal(move('ArrowLeft', 'a', 0), null);
  });
});

describe('vertical movement', () => {
  test('moves a row and keeps the column', () => {
    assert.equal(move('ArrowDown', 'b'), 'f');
    assert.equal(move('ArrowUp', 'f'), 'b');
  });

  test('lands on the nearest column when the target row is short', () => {
    // Row 1 stops at col 2. Down from col 3 must land SOMEWHERE — requiring
    // an exact column match would make Down do nothing from most of a row.
    assert.equal(move('ArrowDown', 'd'), 'g');
  });

  test('does nothing when there is no row that way', () => {
    assert.equal(move('ArrowUp', 'a'), null);
    assert.equal(move('ArrowDown', 'f'), null);
  });

  test('vertical movement stays on the page', () => {
    // Only horizontal steps page. Down from the last row must not silently
    // teleport to another page's first row.
    assert.equal(move('ArrowDown', 'g'), null);
  });
});

describe('Home / End', () => {
  test('jump to the first and last item of the page in view', () => {
    assert.equal(move('Home', 'f'), 'a');
    assert.equal(move('End', 'a'), 'g');
    assert.equal(move('End', 'x', 1), 'y');
  });
});

describe('an unknown active item', () => {
  test('the first arrow press anchors instead of doing nothing', () => {
    // On a fresh page — or right after the focused item was deleted —
    // activeId matches nothing. Returning null there means the first
    // keypress is silently swallowed, which reads as broken.
    assert.equal(move('ArrowRight', null), 'a');
    assert.equal(move('ArrowDown', 'deleted-id'), 'a');
  });

  test('Home and End still work with no active item', () => {
    assert.equal(move('Home', null), 'a');
    assert.equal(move('End', null), 'g');
  });
});

describe('degenerate input', () => {
  test('an empty page yields nothing rather than throwing', () => {
    for (const key of [...NAV_KEYS]) {
      assert.equal(nextFocusId({ items: new Map(), page: 0, pageCount: 1, activeId: null, key }), null);
    }
  });

  test('unknown keys are ignored', () => {
    for (const key of ['Tab', 'Escape', 'a', 'PageDown', '']) {
      assert.equal(move(key, 'a'), null);
    }
  });

  test('items with missing coordinates sort as page/row/col 0', () => {
    const items = grid([['solo', 0, 0, 0]]);
    items.set('bare', { id: 'bare', title: 'bare' });
    // `bare` has no page — it must still be reachable rather than
    // vanishing from navigation entirely.
    assert.deepEqual(pageItems(items, 0).map((i) => i.id).sort(), ['bare', 'solo']);
  });
});

describe('key sets', () => {
  test('activation keys are separate from navigation keys', () => {
    // Enter must not fall into nextFocusId — it dispatches item:click.
    for (const k of ACTIVATE_KEYS) assert.ok(!NAV_KEYS.has(k), `${k} must not navigate`);
    assert.ok(ACTIVATE_KEYS.has('Enter'));
    assert.ok(ACTIVATE_KEYS.has(' '));
    // Older engines report the space bar as 'Spacebar'.
    assert.ok(ACTIVATE_KEYS.has('Spacebar'));
  });
});
