/**
 * Tests for os/ui/components/MobileLayoutEngineV2.js
 * Run with: node --test tests/mobile-layout-engine.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MobileLayoutEngine } from '../os/ui/components/MobileLayoutEngineV2.js';

// ─────────────────────────────────────────────
// calcItemsPerPage (static)
// ─────────────────────────────────────────────
describe('calcItemsPerPage', () => {
    test('1 row, 4 cols → 4 items (single even row)', () => {
        assert.equal(MobileLayoutEngine.calcItemsPerPage(4, 1), 4);
    });

    test('2 rows, 4 cols → 7 items (even=4, odd=3)', () => {
        assert.equal(MobileLayoutEngine.calcItemsPerPage(4, 2), 7);
    });

    test('3 rows, 4 cols → 11 items (4+3+4)', () => {
        assert.equal(MobileLayoutEngine.calcItemsPerPage(4, 3), 11);
    });

    test('5 rows, 5 cols → 23 items (5+4+5+4+5)', () => {
        assert.equal(MobileLayoutEngine.calcItemsPerPage(5, 5), 23);
    });

    test('0 rows → 0 items', () => {
        assert.equal(MobileLayoutEngine.calcItemsPerPage(6, 0), 0);
    });
});

// ─────────────────────────────────────────────
// colsForRow (static)
// ─────────────────────────────────────────────
describe('colsForRow', () => {
    const m = { cols: 6, colsOdd: 5 };

    test('even row gets full columns', () => {
        assert.equal(MobileLayoutEngine.colsForRow(0, m), 6);
        assert.equal(MobileLayoutEngine.colsForRow(2, m), 6);
        assert.equal(MobileLayoutEngine.colsForRow(4, m), 6);
    });

    test('odd row gets cols - 1', () => {
        assert.equal(MobileLayoutEngine.colsForRow(1, m), 5);
        assert.equal(MobileLayoutEngine.colsForRow(3, m), 5);
    });

    test('fallback when colsOdd missing', () => {
        assert.equal(MobileLayoutEngine.colsForRow(1, { cols: 4 }), 3);
    });
});

// ─────────────────────────────────────────────
// slotToRowCol (static)
// ─────────────────────────────────────────────
describe('slotToRowCol', () => {
    const m = { cols: 4, colsOdd: 3, rows: 3 };

    test('slot 0 → row 0, col 0', () => {
        assert.deepEqual(MobileLayoutEngine.slotToRowCol(0, m), { row: 0, col: 0 });
    });

    test('slot 3 → row 0, col 3 (last in even row)', () => {
        assert.deepEqual(MobileLayoutEngine.slotToRowCol(3, m), { row: 0, col: 3 });
    });

    test('slot 4 → row 1, col 0 (first in odd row)', () => {
        assert.deepEqual(MobileLayoutEngine.slotToRowCol(4, m), { row: 1, col: 0 });
    });

    test('slot 6 → row 1, col 2 (last in odd row)', () => {
        assert.deepEqual(MobileLayoutEngine.slotToRowCol(6, m), { row: 1, col: 2 });
    });

    test('slot 7 → row 2, col 0 (first in second even row)', () => {
        assert.deepEqual(MobileLayoutEngine.slotToRowCol(7, m), { row: 2, col: 0 });
    });

    test('slot beyond last returns null', () => {
        assert.equal(MobileLayoutEngine.slotToRowCol(11, m), null);
    });
});

// ─────────────────────────────────────────────
// rowColToSlot (static)
// ─────────────────────────────────────────────
describe('rowColToSlot', () => {
    const m = { cols: 4, colsOdd: 3, rows: 3 };

    test('row 0, col 0 → slot 0', () => {
        assert.equal(MobileLayoutEngine.rowColToSlot(0, 0, m), 0);
    });

    test('row 1, col 0 → slot 4', () => {
        assert.equal(MobileLayoutEngine.rowColToSlot(1, 0, m), 4);
    });

    test('row 2, col 0 → slot 7', () => {
        assert.equal(MobileLayoutEngine.rowColToSlot(2, 0, m), 7);
    });

    test('slotToRowCol and rowColToSlot are inverses', () => {
        for (let slot = 0; slot < 11; slot++) {
            const rc = MobileLayoutEngine.slotToRowCol(slot, m);
            assert.notEqual(rc, null);
            assert.equal(MobileLayoutEngine.rowColToSlot(rc.row, rc.col, m), slot);
        }
    });
});

// ─────────────────────────────────────────────
// calculateLayout
// ─────────────────────────────────────────────
describe('calculateLayout', () => {
    const engine = new MobileLayoutEngine();

    test('portrait phone (375×812) uses cellSmall', () => {
        const layout = engine.calculateLayout(375, 812);
        assert.equal(layout.metrics.cellWidth, 68);
        assert.equal(layout.metrics.cellHeight, 74);
    });

    test('mid-size tablet (900×600) uses cellMedium', () => {
        const layout = engine.calculateLayout(900, 600);
        assert.equal(layout.metrics.cellWidth, 82);
        assert.equal(layout.metrics.cellHeight, 84);
    });

    test('large desktop (1500×900) uses cellLarge', () => {
        const layout = engine.calculateLayout(1500, 900);
        assert.equal(layout.metrics.cellWidth, 90);
        assert.equal(layout.metrics.cellHeight, 90);
    });

    test('portrait has at least 4 cols', () => {
        const layout = engine.calculateLayout(320, 568);
        assert.ok(layout.metrics.cols >= 4);
    });

    test('portrait has at most 8 cols', () => {
        const layout = engine.calculateLayout(1200, 1600);
        assert.ok(layout.metrics.cols <= 8);
    });

    test('landscape has at least 5 cols', () => {
        const layout = engine.calculateLayout(1024, 768);
        assert.ok(layout.metrics.cols >= 5);
    });

    test('landscape rows capped at 3', () => {
        const layout = engine.calculateLayout(1200, 600);
        assert.ok(layout.metrics.rows <= 3);
    });

    test('portrait rows capped at 5', () => {
        const layout = engine.calculateLayout(400, 900);
        assert.ok(layout.metrics.rows <= 5);
    });

    test('grid width does not exceed maxGridWidth', () => {
        const layout = engine.calculateLayout(2000, 1200);
        assert.ok(layout.gridArea.width <= engine.config.maxGridWidth);
    });

    test('grid width is at least 220', () => {
        const layout = engine.calculateLayout(100, 400);
        assert.ok(layout.gridArea.width >= 220);
    });

    test('honeycomb flag is set', () => {
        const layout = engine.calculateLayout(400, 800);
        assert.equal(layout.metrics.honeycomb, true);
    });

    test('colsOdd is cols - 1', () => {
        const layout = engine.calculateLayout(400, 800);
        assert.equal(layout.metrics.colsOdd, layout.metrics.cols - 1);
    });

    test('itemsPerPage matches calcItemsPerPage', () => {
        const layout = engine.calculateLayout(400, 800);
        const expected = MobileLayoutEngine.calcItemsPerPage(layout.metrics.cols, layout.metrics.rows);
        assert.equal(layout.metrics.itemsPerPage, expected);
    });
});

// ─────────────────────────────────────────────
// getSafeInsets
// ─────────────────────────────────────────────
describe('getSafeInsets', () => {
    test('returns zeroes for no insets', () => {
        const engine = new MobileLayoutEngine();
        const insets = engine.getSafeInsets(400, 800, {});
        assert.deepEqual(insets, { top: 0, bottom: 0, left: 0, right: 0 });
    });

    test('passes through valid insets', () => {
        const engine = new MobileLayoutEngine();
        const insets = engine.getSafeInsets(400, 800, { top: 44, bottom: 34, left: 0, right: 0 });
        assert.equal(insets.top, 44);
        assert.equal(insets.bottom, 34);
    });

    test('treats non-numeric insets as 0', () => {
        const engine = new MobileLayoutEngine();
        const insets = engine.getSafeInsets(400, 800, { top: 'auto', bottom: undefined });
        assert.equal(insets.top, 0);
        assert.equal(insets.bottom, 0);
    });

    test('negative insets become 0', () => {
        const engine = new MobileLayoutEngine();
        const insets = engine.getSafeInsets(400, 800, { top: -10 });
        assert.equal(insets.top, 0);
    });

    test('phone top inset floor applied for narrow screens', () => {
        const engine = new MobileLayoutEngine({ phoneTopInsetFloor: 20 });
        const insets = engine.getSafeInsets(375, 812, { top: 5 });
        assert.equal(insets.top, 20);
    });

    test('phone top inset floor not applied for wide screens', () => {
        const engine = new MobileLayoutEngine({ phoneTopInsetFloor: 20 });
        const insets = engine.getSafeInsets(800, 600, { top: 5 });
        assert.equal(insets.top, 5);
    });
});

// ─────────────────────────────────────────────
// getCellPosition
// ─────────────────────────────────────────────
describe('getCellPosition', () => {
    const engine = new MobileLayoutEngine();

    test('page 0 row 0 col 0 starts at centerOffset', () => {
        const layout = engine.calculateLayout(400, 800);
        const pos = engine.getCellPosition(0, 0, 0, layout.gridArea.width, layout);
        assert.ok(pos.x >= 0);
        assert.equal(pos.y, 0);
    });

    test('odd row has offset', () => {
        const layout = engine.calculateLayout(400, 800);
        const pos0 = engine.getCellPosition(0, 0, 0, layout.gridArea.width, layout);
        const pos1 = engine.getCellPosition(0, 1, 0, layout.gridArea.width, layout);
        // Odd row x should be shifted right by half a cell+gap
        const expectedOffset = (layout.metrics.cellWidth + layout.metrics.hGap) / 2;
        assert.ok(Math.abs(pos1.x - pos0.x - expectedOffset) < 1);
    });

    test('page 1 position is shifted by pageWidth', () => {
        const layout = engine.calculateLayout(400, 800);
        const pw = layout.gridArea.width;
        const p0 = engine.getCellPosition(0, 0, 0, pw, layout);
        const p1 = engine.getCellPosition(1, 0, 0, pw, layout);
        assert.equal(p1.x - p0.x, pw);
    });

    test('y increases with row', () => {
        const layout = engine.calculateLayout(400, 800);
        const pw = layout.gridArea.width;
        const r0 = engine.getCellPosition(0, 0, 0, pw, layout);
        const r1 = engine.getCellPosition(0, 1, 0, pw, layout);
        const r2 = engine.getCellPosition(0, 2, 0, pw, layout);
        assert.ok(r1.y > r0.y);
        assert.ok(r2.y > r1.y);
    });
});

// ─────────────────────────────────────────────
// getGridLocationFromPoint
// ─────────────────────────────────────────────
describe('getGridLocationFromPoint', () => {
    const engine = new MobileLayoutEngine();

    test('getCellPosition and getGridLocationFromPoint are consistent', () => {
        const layout = engine.calculateLayout(400, 800);
        const pw = layout.gridArea.width;
        const m = layout.metrics;

        // Check a few cells round-trip
        for (let row = 0; row < m.rows; row++) {
            const maxCols = MobileLayoutEngine.colsForRow(row, m);
            for (let col = 0; col < maxCols; col++) {
                const pos = engine.getCellPosition(0, row, col, pw, layout);
                // Hit center of cell
                const cx = pos.x + m.cellWidth / 2;
                const cy = pos.y + m.cellHeight / 2;
                const loc = engine.getGridLocationFromPoint(cx, cy, 0, pw, layout);
                assert.notEqual(loc, null, `null for row=${row} col=${col}`);
                assert.equal(loc.page, 0, `page for row=${row} col=${col}`);
                assert.equal(loc.row, row, `row mismatch at row=${row} col=${col}`);
                assert.equal(loc.col, col, `col mismatch at row=${row} col=${col}`);
            }
        }
    });

    test('returns null for points far outside grid', () => {
        const layout = engine.calculateLayout(400, 800);
        const pw = layout.gridArea.width;
        assert.equal(engine.getGridLocationFromPoint(200, -50, 0, pw, layout), null);
    });
});
