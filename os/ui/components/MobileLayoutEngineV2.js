/**
 * MobileLayoutEngineV2.js
 *
 * Pure math module. No DOM reads/mutations, no global state.
 * Computes honeycomb grid layout metrics from viewport dimensions.
 *
 * Honeycomb layout: even rows have `cols` columns, odd rows have `cols - 1`
 * columns and are offset horizontally by half a cell width.
 */

export class MobileLayoutEngine {
    constructor(config = {}) {
        this.config = {
            statusBarHeight: 24,
            greetingHeight: 70,
            greetingTopGap: 20,
            searchHeight: 46,
            searchBottomGap: 20,
            navBarHeight: 64,
            navBarMargin: 16,
            gridBottomGap: 8,
            dotsHeight: 28,
            sideMargin: 12,
            minGridHeight: 200,
            phoneTopInsetFloor: 0,
            landscapeSideInsetFloor: 0,
            maxGridWidth: 1100,
            // Honeycomb cell sizes by breakpoint
            cellSmall: { w: 68, h: 74, hGap: 6, vGap: 2, hex: 52 },
            cellMedium: { w: 82, h: 84, hGap: 10, vGap: 4, hex: 62 },
            cellLarge: { w: 90, h: 90, hGap: 14, vGap: 6, hex: 68 },
            ...config,
        };
    }

    getSafeInsets(width, height, safeInsets = {}) {
        const toPx = (value) => {
            const parsed = Number.parseFloat(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };

        const insets = {
            top: Math.max(0, toPx(safeInsets.top)),
            bottom: Math.max(0, toPx(safeInsets.bottom)),
            left: Math.max(0, toPx(safeInsets.left)),
            right: Math.max(0, toPx(safeInsets.right)),
        };

        if (width <= 600 && this.config.phoneTopInsetFloor > 0) {
            insets.top = Math.max(insets.top, this.config.phoneTopInsetFloor);
        }

        if (width > height && width <= 950 && this.config.landscapeSideInsetFloor > 0) {
            insets.left = Math.max(insets.left, this.config.landscapeSideInsetFloor);
            insets.right = Math.max(insets.right, this.config.landscapeSideInsetFloor);
        }

        return insets;
    }

    calculateLayout(width, height, safeInsets = {}) {
        const insets = this.getSafeInsets(width, height, safeInsets);
        const c = this.config;
        const isLandscape = width > height;

        // Top reserved: time bar + greeting + search
        const topReserved = insets.top + c.greetingTopGap + c.greetingHeight
            + c.searchHeight + c.searchBottomGap;

        // Bottom reserved: nav bar + dots + padding
        const bottomReserved = c.navBarHeight + c.navBarMargin + c.gridBottomGap
            + c.dotsHeight + insets.bottom;

        const availableHeight = height - topReserved - bottomReserved;

        // Grid width calculation
        let leftMargin = Math.max(c.sideMargin, insets.left);
        const rightMargin = Math.max(c.sideMargin, insets.right);
        let gridWidth = Math.max(220, width - leftMargin - rightMargin);

        if (gridWidth > c.maxGridWidth) {
            const excess = gridWidth - c.maxGridWidth;
            gridWidth = c.maxGridWidth;
            leftMargin += Math.floor(excess / 2);
        }

        // Pick cell size based on viewport width
        let cell;
        if (width <= 700) {
            cell = c.cellSmall;
        } else if (width >= 1400) {
            cell = c.cellLarge;
        } else {
            cell = c.cellMedium;
        }

        const cellWidth = cell.w;
        const cellHeight = cell.h;
        const hGap = cell.hGap;
        const vGap = cell.vGap;
        const iconSize = cell.hex;

        // Calculate columns from available width
        // Even row: cols * cellWidth + (cols-1) * hGap <= gridWidth
        let cols = Math.floor((gridWidth + hGap) / (cellWidth + hGap));
        if (isLandscape) {
            cols = Math.max(5, Math.min(9, cols));
        } else {
            cols = Math.max(4, Math.min(8, cols));
        }

        // Calculate rows from available height
        let rows = Math.floor((availableHeight + vGap) / (cellHeight + vGap));
        if (isLandscape) {
            rows = Math.max(2, Math.min(3, rows));
        } else {
            rows = Math.max(2, Math.min(5, rows));
        }

        // Honeycomb content dimensions
        const contentWidth = cols * cellWidth + (cols - 1) * hGap;
        const contentHeight = rows * cellHeight + (rows - 1) * vGap;
        const gridHeight = Math.max(c.minGridHeight, contentHeight);

        // Items per page (honeycomb: even rows = cols, odd rows = cols - 1)
        const itemsPerPage = MobileLayoutEngine.calcItemsPerPage(cols, rows);

        // Search area
        const portraitSearchWidth = Math.max(240, Math.min(620, width - 32));
        const landscapeSearchWidth = Math.max(240, Math.min(560, width - leftMargin - rightMargin - 260));

        return {
            viewport: { width, height },
            insets,
            statusBarHeight: c.statusBarHeight,
            searchArea: {
                top: insets.top + c.greetingTopGap + c.greetingHeight,
                height: c.searchHeight,
                width: isLandscape ? landscapeSearchWidth : portraitSearchWidth,
            },
            gridArea: {
                width: gridWidth,
                height: gridHeight,
                top: topReserved,
                left: leftMargin,
                contentWidth,
                contentHeight,
            },
            metrics: {
                cols,
                colsOdd: cols - 1,
                rows,
                cellWidth,
                cellHeight,
                hGap,
                vGap,
                gap: hGap,
                itemsPerPage,
                iconSize,
                honeycomb: true,
            },
        };
    }

    /**
     * Pixel position of a cell (local to grid container).
     * Honeycomb: odd rows offset by half a cell+gap.
     */
    getCellPosition(page, row, col, pageWidth, layout) {
        const m = layout.metrics;
        const honeycombWidth = m.cols * m.cellWidth + (m.cols - 1) * m.hGap;
        const centerOffset = Math.max(0, (pageWidth - honeycombWidth) / 2);
        const rowOffset = row % 2 === 1 ? (m.cellWidth + m.hGap) / 2 : 0;

        return {
            x: page * pageWidth + centerOffset + col * (m.cellWidth + m.hGap) + rowOffset,
            y: row * (m.cellHeight + m.vGap),
        };
    }

    /**
     * Convert a local point (relative to grid container) to page/row/col.
     * Honeycomb-aware: accounts for row offset and varying column counts.
     */
    getGridLocationFromPoint(localX, localY, pageOffset, pageWidth, layout) {
        const m = layout.metrics;
        const honeycombWidth = m.cols * m.cellWidth + (m.cols - 1) * m.hGap;
        const centerOffset = Math.max(0, (pageWidth - honeycombWidth) / 2);

        const virtualX = localX - pageOffset;
        const page = Math.floor(virtualX / pageWidth);
        const pageRelX = virtualX - page * pageWidth - centerOffset;

        // Determine row
        const vStep = m.cellHeight + m.vGap;
        if (localY < -10 || localY > layout.gridArea.height + 10) return null;
        const row = Math.max(0, Math.min(m.rows - 1, Math.floor((localY + m.vGap / 2) / vStep)));

        // Determine col, accounting for row offset
        const rowOffset = row % 2 === 1 ? (m.cellWidth + m.hGap) / 2 : 0;
        const adjustedX = pageRelX - rowOffset;
        const maxCols = MobileLayoutEngine.colsForRow(row, m);

        if (adjustedX < -(m.cellWidth / 2) || pageRelX > honeycombWidth + 10) return null;

        const col = Math.max(0, Math.min(maxCols - 1,
            Math.floor((adjustedX + m.hGap / 2) / (m.cellWidth + m.hGap))));

        return { page, row, col };
    }

    // ─── Static Helpers (used by MobileGridState) ─────────────

    /**
     * Number of columns for a given row in honeycomb layout.
     * Even rows: cols, Odd rows: cols - 1.
     */
    static colsForRow(row, metrics) {
        return row % 2 === 0 ? metrics.cols : (metrics.colsOdd ?? metrics.cols - 1);
    }

    /**
     * Total items that fit on one page.
     */
    static calcItemsPerPage(cols, rows) {
        let total = 0;
        for (let r = 0; r < rows; r++) {
            total += r % 2 === 0 ? cols : cols - 1;
        }
        return total;
    }

    /**
     * Convert a linear slot index (within a page) to { row, col }.
     */
    static slotToRowCol(slotInPage, metrics) {
        let count = 0;
        for (let r = 0; r < metrics.rows; r++) {
            const rc = MobileLayoutEngine.colsForRow(r, metrics);
            if (slotInPage < count + rc) {
                return { row: r, col: slotInPage - count };
            }
            count += rc;
        }
        return null;
    }

    /**
     * Convert { row, col } to a linear slot index (within a page).
     */
    static rowColToSlot(row, col, metrics) {
        let slot = 0;
        for (let r = 0; r < row; r++) {
            slot += MobileLayoutEngine.colsForRow(r, metrics);
        }
        return slot + col;
    }
}
