/**
 * MobileLayoutEngineV2.js
 *
 * Pure math module. No DOM reads/mutations, no global state.
 * Computes grid layout metrics from viewport dimensions and safe insets.
 */

export class MobileLayoutEngine {
    constructor(config = {}) {
        this.config = {
            gap: 12,
            statusBarHeight: 44,
            searchTopGap: 10,
            searchHeight: 50,
            searchBottomGap: 16,
            landscapeSearchTop: 5,
            landscapeSearchHeight: 34,
            landscapeSearchBottomGap: 8,
            dockHeightPortrait: 92,
            dockHeightLandscape: 84,
            gridBottomGap: 8,
            dotsHeight: 22,
            sideMargin: 12,
            minGridHeight: 200,
            phoneTopInsetFloor: 0,
            landscapeSideInsetFloor: 0,
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

        const topReserved = isLandscape
            ? c.statusBarHeight + c.landscapeSearchBottomGap
            : c.statusBarHeight + c.searchTopGap + c.searchHeight + c.searchBottomGap;
        const dockHeight = isLandscape ? c.dockHeightLandscape : c.dockHeightPortrait;
        const bottomReserved = dockHeight + c.gridBottomGap + c.dotsHeight + insets.bottom;
        const availableHeight = height - topReserved - bottomReserved;

        const leftMargin = Math.max(c.sideMargin, insets.left);
        const rightMargin = Math.max(c.sideMargin, insets.right);
        const gridWidth = Math.max(220, width - leftMargin - rightMargin);
        const gridHeight = Math.max(c.minGridHeight, availableHeight);

        let cols;
        let rows;
        if (isLandscape) {
            cols = gridWidth >= 1180 ? 8 : gridWidth >= 920 ? 7 : 6;
            rows = availableHeight >= 520 ? 3 : 2;
        } else {
            cols = 4;
            rows = height >= 700 ? 5 : 4;
        }

        const cellWidth = (gridWidth - (cols - 1) * c.gap) / cols;
        const cellHeight = (gridHeight - (rows - 1) * c.gap) / rows;
        const iconSize = Math.min(64, Math.min(cellWidth, cellHeight) * 0.75);

        const portraitSearchWidth = Math.max(240, Math.min(620, width - 32));
        const landscapeSearchWidth = Math.max(240, Math.min(560, width - leftMargin - rightMargin - 260));

        return {
            viewport: { width, height },
            insets,
            statusBarHeight: c.statusBarHeight,
            searchArea: {
                top: isLandscape ? c.landscapeSearchTop : c.statusBarHeight + c.searchTopGap,
                height: isLandscape ? c.landscapeSearchHeight : c.searchHeight,
                width: isLandscape ? landscapeSearchWidth : portraitSearchWidth,
            },
            gridArea: {
                width: gridWidth,
                height: gridHeight,
                top: topReserved,
                left: leftMargin,
            },
            metrics: {
                cols,
                rows,
                cellWidth,
                cellHeight,
                gap: c.gap,
                itemsPerPage: cols * rows,
                iconSize,
            },
        };
    }
    /**
   * Pixel position of a cell (local to grid container).
   * @param {number} page
   * @param {number} row
   * @param {number} col
   * @param {number} pageWidth  Width of one page (= gridArea.width)
   * @param {object} layout     Output of calculateLayout()
   * @returns {{ x: number, y: number }}
   */
    getCellPosition(page, row, col, pageWidth, layout) {
        const m = layout.metrics;
        return {
            x: page * pageWidth + col * (m.cellWidth + m.gap),
            y: row * (m.cellHeight + m.gap),
        };
    }

    /**
     * Convert a local point (relative to grid container) to page/row/col.
     * @param {number} localX       X within grid container
     * @param {number} localY       Y within grid container
     * @param {number} pageOffset   Current scroll offset (negative for pages > 0)
     * @param {number} pageWidth    Width of one page
     * @param {object} layout       Output of calculateLayout()
     * @returns {{ page, row, col } | null}
     */
    getGridLocationFromPoint(localX, localY, pageOffset, pageWidth, layout) {
        const m = layout.metrics;

        // VirtualX accounts for the scroll offset
        const virtualX = localX - pageOffset;
        const page = Math.floor(virtualX / pageWidth);
        const pageRelX = virtualX % pageWidth;

        // Bounds check with some tolerance
        if (
            pageRelX < -10 || pageRelX > layout.gridArea.width + 10 ||
            localY < -10 || localY > layout.gridArea.height + 10
        ) {
            return null;
        }

        const col = Math.max(0, Math.min(m.cols - 1, Math.floor(pageRelX / (m.cellWidth + m.gap))));
        const row = Math.max(0, Math.min(m.rows - 1, Math.floor(localY / (m.cellHeight + m.gap))));

        return { page, row, col };
    }
}
