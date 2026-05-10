/**
 * pdf/engine/viewport.js — pure scroll/zoom geometry.
 *
 * No DOM. Resolves how a page should render given a chosen
 * zoom level + view mode + stage size. Used by codex.js +
 * pageStrip.js + thumbnail virtualization.
 */

/**
 * Compute the per-page CSS width for a given mode + stage + zoom.
 *
 * @param {object} args
 * @param {object} args.pageBaseViewport pdf.js page.getViewport({scale:1})
 * @param {object} args.stage             { width, height }
 * @param {number} args.zoom              numeric zoom level (1 = 100%)
 * @param {string} args.mode              'single'|'continuous'|'spread'|'book'
 * @param {number} [args.gap]
 * @param {number} [args.padding]
 * @returns {number} CSS width per page
 */
export function pageCssWidth({ pageBaseViewport, stage, zoom, mode = 'single', gap = 14, padding = 24 }) {
    if (!pageBaseViewport || !stage) return 0;
    const isSpread = mode === 'spread' || mode === 'book';

    // For numeric zoom, just multiply.
    if (Number.isFinite(zoom) && zoom > 0) {
        return pageBaseViewport.width * zoom;
    }

    // Fallback: fit-width.
    const innerW = Math.max(0, stage.width - padding * 2);
    return isSpread ? (innerW - gap) / 2 : innerW;
}

/**
 * For a continuous-scroll layout, compute which pages are currently
 * visible (intersect the viewport rect). Returns inclusive page numbers.
 *
 * @param {object} args
 * @param {Array<{height: number}>} args.pageBoxes  ordered list of page box heights (CSS px)
 * @param {number} args.scrollTop      current scrollTop
 * @param {number} args.viewportH      viewport height
 * @param {number} [args.overscan]     pages above/below to also include
 * @returns {{first:number, last:number}}    1-based page indices
 */
export function visiblePages({ pageBoxes, scrollTop, viewportH, overscan = 1 }) {
    if (!Array.isArray(pageBoxes) || pageBoxes.length === 0) return { first: 0, last: 0 };
    let y = 0;
    let first = -1;
    let last = -1;
    for (let i = 0; i < pageBoxes.length; i++) {
        const h = pageBoxes[i]?.height || 0;
        const top = y;
        const bottom = y + h;
        const visible = bottom >= scrollTop && top <= scrollTop + viewportH;
        if (visible) {
            if (first < 0) first = i;
            last = i;
        }
        y = bottom;
    }
    if (first < 0) {
        // Past the end — clamp to last page
        first = pageBoxes.length - 1;
        last = pageBoxes.length - 1;
    }
    const f = Math.max(0, first - overscan);
    const l = Math.min(pageBoxes.length - 1, last + overscan);
    return { first: f + 1, last: l + 1 };
}

/**
 * Compute the y-offset that places page `pageNum` at the top of the
 * viewport (with optional offset).
 *
 * @param {Array<{height:number, gap?:number}>} pageBoxes
 * @param {number} pageNum 1-based
 * @param {number} [extra] extra offset to add (e.g. snap-into-view margin)
 */
export function scrollYForPage(pageBoxes, pageNum, extra = 0) {
    if (!Array.isArray(pageBoxes)) return 0;
    let y = 0;
    for (let i = 0; i < Math.min(pageNum - 1, pageBoxes.length); i++) {
        y += (pageBoxes[i]?.height || 0) + (pageBoxes[i]?.gap || 0);
    }
    return y + extra;
}

/**
 * For zoom-anchored pinch / wheel, compute the new scrollLeft + scrollTop
 * after zooming so a given anchor stays under the cursor.
 *
 * @param {object} args
 * @param {{x,y}} args.anchor   anchor point in stage coords (CSS px)
 * @param {{scrollLeft, scrollTop}} args.scroll
 * @param {number} args.oldZoom
 * @param {number} args.newZoom
 * @returns {{scrollLeft, scrollTop}}
 */
export function zoomAnchored({ anchor, scroll, oldZoom, newZoom }) {
    if (!Number.isFinite(oldZoom) || oldZoom <= 0 || !Number.isFinite(newZoom) || newZoom <= 0) {
        return scroll;
    }
    const factor = newZoom / oldZoom;
    const x = anchor?.x ?? 0;
    const y = anchor?.y ?? 0;
    const scrollLeft = (scroll.scrollLeft + x) * factor - x;
    const scrollTop = (scroll.scrollTop + y) * factor - y;
    return { scrollLeft, scrollTop };
}

/**
 * Decide a default view mode for a freshly-opened doc, based on stage
 * size + page aspect ratio. Portrait stage → 'continuous'.
 * Landscape ≥ 920px → 'spread'. Otherwise 'single'.
 */
export function pickDefaultMode({ stage, pageBaseViewport }) {
    if (!stage) return 'single';
    if (stage.width < 920) {
        return stage.height > stage.width ? 'continuous' : 'single';
    }
    // wide enough for spread; check page aspect to avoid spreading
    // unusual landscape pages where one page is already wider.
    if (pageBaseViewport && pageBaseViewport.width > pageBaseViewport.height) {
        return 'single';
    }
    return 'spread';
}
