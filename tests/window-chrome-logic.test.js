/**
 * Tests for WindowChrome drag/resize math (os/ui/components/WindowChrome.js)
 *
 * The clamping and resize logic are pure calculations that can be tested
 * without a DOM — extracted here as standalone functions matching the
 * source implementation exactly.
 *
 * Run with: node --test tests/window-chrome-logic.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── Constants matching WindowChrome.js ───────────────────────────────────────
const MIN_W = 320;
const MIN_H = 240;
const TITLE_BAR_H = 38;
const MIN_VISIBLE = 50; // minimum px of titlebar that must stay on-screen

// ── Pure math helpers (mirroring WindowChrome._onDragMove / _onResizeMove) ──

/** Clamp a drag move so at least MIN_VISIBLE px stays on-screen. */
function clampDrag(newLeft, newTop, windowWidth, viewportWidth, viewportHeight) {
    const left = Math.max(-windowWidth + MIN_VISIBLE, Math.min(viewportWidth - MIN_VISIBLE, newLeft));
    const top  = Math.max(0, Math.min(viewportHeight - TITLE_BAR_H, newTop));
    return { left, top };
}

/** East-edge resize: grows/shrinks the right side. */
function resizeEast(startLeft, startWidth, dx, viewportWidth) {
    const w = Math.max(MIN_W, Math.min(viewportWidth - startLeft, startWidth + dx));
    return { left: startLeft, width: w };
}

/** West-edge resize: grows/shrinks the left side (left pos also changes). */
function resizeWest(startLeft, startWidth, dx) {
    let l = Math.max(0, Math.min(startLeft + startWidth - MIN_W, startLeft + dx));
    let w = startLeft + startWidth - l;
    if (w < MIN_W) { w = MIN_W; l = startLeft + startWidth - MIN_W; }
    return { left: l, width: w };
}

/** South-edge resize: grows/shrinks the bottom. */
function resizeSouth(startTop, startHeight, dy, viewportHeight) {
    const h = Math.max(MIN_H, Math.min(viewportHeight - startTop, startHeight + dy));
    return { top: startTop, height: h };
}

/** North-edge resize: grows/shrinks the top (top pos also changes). */
function resizeNorth(startTop, startHeight, dy) {
    let t = Math.max(0, Math.min(startTop + startHeight - MIN_H, startTop + dy));
    let h = startTop + startHeight - t;
    if (h < MIN_H) { h = MIN_H; t = startTop + startHeight - MIN_H; }
    return { top: t, height: h };
}

// ─────────────────────────────────────────────
// Drag clamping
// ─────────────────────────────────────────────
describe('clampDrag — horizontal', () => {
    const VW = 1280, VH = 800, W = 600;

    test('normal drag within bounds is unchanged', () => {
        const { left } = clampDrag(100, 50, W, VW, VH);
        assert.equal(left, 100);
    });

    test('dragging off the right edge clamps to (VW - MIN_VISIBLE)', () => {
        const { left } = clampDrag(1300, 50, W, VW, VH);
        assert.equal(left, VW - MIN_VISIBLE); // 1230
    });

    test('dragging off the left edge clamps to (-W + MIN_VISIBLE)', () => {
        const { left } = clampDrag(-800, 50, W, VW, VH);
        assert.equal(left, -W + MIN_VISIBLE); // -550
    });

    test('window can be partially off-screen but keeps MIN_VISIBLE px visible', () => {
        // -500 with W=600 leaves 100px visible (> MIN_VISIBLE=50), so no clamping
        const { left } = clampDrag(-500, 50, W, VW, VH);
        assert.equal(left, -500);
    });
});

describe('clampDrag — vertical', () => {
    const VW = 1280, VH = 800, W = 600;

    test('normal drag within bounds is unchanged', () => {
        const { top } = clampDrag(100, 200, W, VW, VH);
        assert.equal(top, 200);
    });

    test('dragging above the viewport clamps to 0', () => {
        const { top } = clampDrag(100, -50, W, VW, VH);
        assert.equal(top, 0);
    });

    test('dragging below the viewport clamps so titlebar stays visible', () => {
        const { top } = clampDrag(100, 900, W, VW, VH);
        assert.equal(top, VH - TITLE_BAR_H); // 762
    });
});

// ─────────────────────────────────────────────
// East resize
// ─────────────────────────────────────────────
describe('resizeEast', () => {
    const VW = 1280;

    test('grows width by dx', () => {
        const { width } = resizeEast(100, 500, 50, VW);
        assert.equal(width, 550);
    });

    test('shrinks width by negative dx', () => {
        const { width } = resizeEast(100, 500, -100, VW);
        assert.equal(width, 400);
    });

    test('does not shrink below MIN_W', () => {
        const { width } = resizeEast(100, 500, -400, VW);
        assert.equal(width, MIN_W);
    });

    test('does not grow beyond viewport right edge', () => {
        const { width } = resizeEast(100, 500, 1000, VW);
        assert.equal(width, VW - 100); // 1180
    });

    test('left position is unchanged', () => {
        const { left } = resizeEast(200, 400, 50, VW);
        assert.equal(left, 200);
    });
});

// ─────────────────────────────────────────────
// West resize
// ─────────────────────────────────────────────
describe('resizeWest', () => {
    test('shrinks from the left (moves left edge right)', () => {
        const { left, width } = resizeWest(200, 500, 100);
        assert.equal(left, 300);
        assert.equal(width, 400);
    });

    test('grows from the left (moves left edge left)', () => {
        const { left, width } = resizeWest(200, 500, -100);
        assert.equal(left, 100);
        assert.equal(width, 600);
    });

    test('does not move left past 0', () => {
        const { left } = resizeWest(100, 500, -200);
        assert.equal(left, 0);
    });

    test('right edge (left + width) stays fixed', () => {
        const rightEdge = 200 + 500; // 700
        const { left, width } = resizeWest(200, 500, 80);
        assert.equal(left + width, rightEdge);
    });

    test('does not shrink below MIN_W', () => {
        const { width } = resizeWest(200, 500, 400);
        assert.equal(width, MIN_W);
    });
});

// ─────────────────────────────────────────────
// South resize
// ─────────────────────────────────────────────
describe('resizeSouth', () => {
    const VH = 800;

    test('grows height by dy', () => {
        const { height } = resizeSouth(100, 400, 50, VH);
        assert.equal(height, 450);
    });

    test('shrinks height by negative dy', () => {
        const { height } = resizeSouth(100, 400, -100, VH);
        assert.equal(height, 300);
    });

    test('does not shrink below MIN_H', () => {
        const { height } = resizeSouth(100, 400, -400, VH);
        assert.equal(height, MIN_H);
    });

    test('does not grow past viewport bottom', () => {
        const { height } = resizeSouth(100, 400, 1000, VH);
        assert.equal(height, VH - 100); // 700
    });

    test('top position is unchanged', () => {
        const { top } = resizeSouth(150, 400, 50, VH);
        assert.equal(top, 150);
    });
});

// ─────────────────────────────────────────────
// North resize
// ─────────────────────────────────────────────
describe('resizeNorth', () => {
    test('shrinks from the top (moves top edge down)', () => {
        const { top, height } = resizeNorth(200, 500, 100);
        assert.equal(top, 300);
        assert.equal(height, 400);
    });

    test('grows from the top (moves top edge up)', () => {
        const { top, height } = resizeNorth(200, 500, -100);
        assert.equal(top, 100);
        assert.equal(height, 600);
    });

    test('does not move top past 0', () => {
        const { top } = resizeNorth(100, 500, -200);
        assert.equal(top, 0);
    });

    test('bottom edge (top + height) stays fixed', () => {
        const bottom = 200 + 500; // 700
        const { top, height } = resizeNorth(200, 500, 80);
        assert.equal(top + height, bottom);
    });

    test('does not shrink below MIN_H', () => {
        const { height } = resizeNorth(200, 500, 400);
        assert.equal(height, MIN_H);
    });
});

// ─────────────────────────────────────────────
// Combined corner resize (NW = North + West)
// ─────────────────────────────────────────────
describe('NW corner resize (combined North + West)', () => {
    test('moves both top and left when dragging NW corner', () => {
        const dx = -50, dy = -50;
        const { left, width }  = resizeWest(200, 500, dx);
        const { top,  height } = resizeNorth(300, 400, dy);
        assert.equal(left,   150);
        assert.equal(width,  550);
        assert.equal(top,    250);
        assert.equal(height, 450);
    });
});
