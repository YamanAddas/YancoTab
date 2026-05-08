/**
 * Regression tests for MobileGridState folder operations.
 *
 * Covers the iOS-like folder behavior implemented in the home grid:
 *   - Drop on icon → createFolderFromItems → folder with both as children.
 *   - Drop on existing folder → addChildToFolder.
 *   - Drag last app out → folder dissolves, surviving child takes folder slot.
 *   - Drag from folder when 2+ remain → folder stays.
 *
 * These are the load-bearing methods behind the "icon touched another → make
 * a folder" + "single-app folder auto-dissolves" UX. The view layer (drag
 * controller, AppGrid) only orchestrates calls to these — get them right
 * here and the visible behavior is correct.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// MobileGridState reads/writes localStorage; stub it before import.
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

const { MobileGridState } = await import('../os/ui/components/MobileGridState.js');

function freshState() {
  // Reset persistence between tests so they don't leak.
  globalThis.localStorage.clear();
  const state = new MobileGridState();
  // Honeycomb: row0=4 cols, row1=3 cols, row2=4 cols → 11 slots/page.
  state.layout = {
    metrics: { cols: 4, colsOdd: 3, rows: 3, cellWidth: 80, cellHeight: 80, hGap: 6, vGap: 4 },
    gridArea: { width: 400, height: 300 },
  };
  return state;
}

function seedApps(state, ids, page = 0) {
  const m = state.layout.metrics;
  ids.forEach((id, idx) => {
    const local = idx;
    const row = local < m.cols ? 0 : (local < m.cols + m.colsOdd ? 1 : 2);
    const col = row === 1 ? local - m.cols : (row === 2 ? local - m.cols - m.colsOdd : local);
    state.items.set(id, {
      id, type: 'app', title: id.toUpperCase(), icon: 'a',
      children: [], parent: null,
      page, row, col, hidden: false,
    });
  });
}

describe('MobileGridState — createFolderFromItems', () => {
  test('combines source + target into a new folder at target slot', () => {
    const state = freshState();
    seedApps(state, ['a', 'b', 'c']); // a@(0,0,0), b@(0,0,1), c@(0,0,2)
    const folderId = state.createFolderFromItems('a', 'b', 0, 0, 1);
    assert.ok(folderId, 'folder id returned');
    const folder = state.items.get(folderId);
    assert.equal(folder.type, 'folder');
    assert.deepEqual(folder.children.sort(), ['a', 'b']);
    assert.equal(folder.page, 0);
    assert.equal(folder.row, 0);
    assert.equal(folder.col, 1);
    // Children are detached from grid coordinates
    assert.equal(state.items.get('a').parent, folderId);
    assert.equal(state.items.get('a').page, -1);
    assert.equal(state.items.get('b').parent, folderId);
    assert.equal(state.items.get('b').page, -1);
    // Untouched item stays where it was
    assert.equal(state.items.get('c').col, 2);
  });

  test('returns null when source or target is missing', () => {
    const state = freshState();
    seedApps(state, ['a']);
    assert.equal(state.createFolderFromItems('a', 'missing', 0, 0, 0), null);
    assert.equal(state.createFolderFromItems('missing', 'a', 0, 0, 0), null);
  });
});

describe('MobileGridState — addChildToFolder', () => {
  test('moves a top-level app into a folder', () => {
    const state = freshState();
    seedApps(state, ['a', 'b', 'c']);
    const folderId = state.createFolderFromItems('a', 'b', 0, 0, 1);
    state.addChildToFolder('c', folderId);
    const folder = state.items.get(folderId);
    assert.deepEqual(folder.children.sort(), ['a', 'b', 'c']);
    assert.equal(state.items.get('c').parent, folderId);
    assert.equal(state.items.get('c').page, -1);
  });

  test('idempotent: adding the same child twice is a no-op', () => {
    const state = freshState();
    seedApps(state, ['a', 'b', 'c']);
    const folderId = state.createFolderFromItems('a', 'b', 0, 0, 1);
    const before = state.items.get(folderId).children.length;
    state.addChildToFolder('a', folderId); // already in
    assert.equal(state.items.get(folderId).children.length, before);
  });

  test('rejects when folder is missing or not a folder', () => {
    const state = freshState();
    seedApps(state, ['a', 'b']);
    state.addChildToFolder('a', 'b'); // 'b' is an app, not a folder
    assert.equal(state.items.get('a').parent, null,
      'a must NOT be moved into another app');
  });
});

describe('MobileGridState — removeChildFromFolder', () => {
  test('with 3+ children: child detaches; folder stays', () => {
    const state = freshState();
    seedApps(state, ['a', 'b', 'c', 'd']);
    const folderId = state.createFolderFromItems('a', 'b', 0, 0, 1);
    state.addChildToFolder('c', folderId);
    state.addChildToFolder('d', folderId);

    state.removeChildFromFolder('a');
    const folder = state.items.get(folderId);
    assert.ok(folder, 'folder still exists');
    assert.deepEqual(folder.children.sort(), ['b', 'c', 'd']);
    const a = state.items.get('a');
    assert.equal(a.parent, null);
    assert.notEqual(a.page, -1, 'a got placed back into the grid');
  });

  test('with exactly 1 remaining: folder dissolves; survivor takes folder slot', () => {
    const state = freshState();
    seedApps(state, ['a', 'b', 'c']); // c is at (0,0,2) and stays put
    const folderId = state.createFolderFromItems('a', 'b', 0, 0, 1);
    // Now remove a → b is the lone survivor
    state.removeChildFromFolder('a');
    assert.ok(!state.items.has(folderId), 'folder must be deleted');
    const b = state.items.get('b');
    assert.equal(b.parent, null);
    assert.equal(b.page, 0);
    assert.equal(b.row, 0);
    assert.equal(b.col, 1, 'survivor takes the folder’s slot');
    const a = state.items.get('a');
    assert.equal(a.parent, null);
    assert.notEqual(a.page, -1);
    // c untouched
    assert.equal(state.items.get('c').col, 2);
  });

  test('removing the last child empties the folder and deletes it', () => {
    const state = freshState();
    seedApps(state, ['a', 'b']);
    const folderId = state.createFolderFromItems('a', 'b', 0, 0, 1);
    // Remove a (1 left), then b (0 left)
    state.removeChildFromFolder('a');
    // After first remove: folder dissolved (1-child rule), b at folder slot
    assert.ok(!state.items.has(folderId));
    // Removing 'b' from a non-existent parent should be a no-op now
    state.removeChildFromFolder('b');
    assert.ok(state.items.has('b'), 'b is still around');
    assert.equal(state.items.get('b').parent, null);
  });

  test('a child with no parent is a silent no-op', () => {
    const state = freshState();
    seedApps(state, ['a', 'b']);
    const before = JSON.stringify(state.items.get('a'));
    state.removeChildFromFolder('a'); // a has parent=null
    const after = JSON.stringify(state.items.get('a'));
    assert.equal(before, after);
  });
});

describe('MobileGridState — folder lifecycle round-trip', () => {
  test('create → add → remove down to 1 leaves no folder behind', () => {
    const state = freshState();
    seedApps(state, ['a', 'b', 'c']);
    const folderId = state.createFolderFromItems('a', 'b', 0, 0, 1);
    state.addChildToFolder('c', folderId);
    // 3 children. Remove two; the third should auto-dissolve out.
    state.removeChildFromFolder('a');
    assert.ok(state.items.has(folderId), '2 children: folder stays');
    state.removeChildFromFolder('b');
    assert.ok(!state.items.has(folderId), '1 child remains → folder dissolves');
    const survivor = state.items.get('c');
    assert.equal(survivor.parent, null);
    assert.equal(survivor.page, 0);
    assert.equal(survivor.row, 0);
    assert.equal(survivor.col, 1, 'survivor inherits the folder’s slot');
  });
});
