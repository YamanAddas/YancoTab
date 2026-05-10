/**
 * pdf/engine/zoom.js — pure zoom-level math.
 *
 * The reader stores a "zoom mode" which is either a literal number
 * (e.g. 1.0 = 100%, 2.0 = 200%) or a fit keyword:
 *   'fit-width' — page width = stage inner width
 *   'fit-page'  — page entirely visible (width AND height fit)
 *   'actual'    — 1.0 (alias kept for the preset picker)
 *
 * `zoomToFit` resolves a fit-keyword against the current page + stage
 * geometry and returns a numeric zoom level. UI code compares
 * `zoomMode` to the keyword strings; rendering code passes the
 * resolved number (or computes one from `levelFromString`).
 */

export const PRESETS = Object.freeze([0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0]);
export const FIT_MODES = Object.freeze(['fit-width', 'fit-page', 'actual']);
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8.0;

const STEP_FACTOR = 1.25;
const SNAP_TOLERANCE = 0.05;   // ±5% snap to nearest preset

/**
 * Step zoom up or down. If the current level is within SNAP_TOLERANCE
 * of a preset, jump to the next/previous preset. Otherwise multiply
 * by STEP_FACTOR.
 *
 * @param {number} current  current zoom level (number, 1.0 = 100%)
 * @param {1|-1} dir
 * @returns {number} clamped zoom level
 */
export function stepZoom(current, dir) {
    if (!Number.isFinite(current) || current <= 0) return 1.0;
    const d = dir > 0 ? 1 : -1;

    // Snap-to-preset behavior
    const nearestPreset = findNearestPreset(current);
    if (nearestPreset != null) {
        const idx = PRESETS.indexOf(nearestPreset);
        const ni = idx + d;
        if (ni >= 0 && ni < PRESETS.length) return PRESETS[ni];
        // off the edge — fall through to multiply
    }
    const next = d > 0 ? current * STEP_FACTOR : current / STEP_FACTOR;
    return clampZoom(next);
}

/** Snap if within tolerance of a preset; otherwise null. */
export function findNearestPreset(z) {
    if (!Number.isFinite(z)) return null;
    let best = null;
    let bestDiff = Infinity;
    for (const p of PRESETS) {
        const diff = Math.abs(z - p) / p;
        if (diff < bestDiff && diff <= SNAP_TOLERANCE) {
            best = p;
            bestDiff = diff;
        }
    }
    return best;
}

/** Hard-clamp a zoom level. */
export function clampZoom(z) {
    if (!Number.isFinite(z)) return 1.0;
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/**
 * Resolve a zoom mode against current page + stage geometry to a
 * numeric zoom level.
 *
 * @param {object} args
 * @param {string|number} args.mode      'fit-width' | 'fit-page' | 'actual' | number
 * @param {object} args.pageBaseViewport pdf.js page.getViewport({scale:1})
 *                                       (only `width` and `height` used)
 * @param {object} args.stage             { width, height } CSS px available
 * @param {number} [args.gap]             between-page gap for spread modes
 * @param {boolean} [args.spread]         true if rendering 2-up
 * @param {number} [args.padding]         outer stage padding
 * @returns {number}
 */
export function zoomToFit({ mode, pageBaseViewport, stage, gap = 14, spread = false, padding = 24 }) {
    if (typeof mode === 'number' && Number.isFinite(mode)) return clampZoom(mode);
    if (mode === 'actual') return 1.0;

    if (!pageBaseViewport || !stage || !pageBaseViewport.width || !pageBaseViewport.height) {
        return 1.0;
    }

    const innerW = Math.max(0, stage.width - padding * 2);
    const innerH = Math.max(0, stage.height - padding * 2);
    const perPageW = spread ? (innerW - gap) / 2 : innerW;

    if (mode === 'fit-page') {
        const zoomW = perPageW / pageBaseViewport.width;
        const zoomH = innerH / pageBaseViewport.height;
        return clampZoom(Math.min(zoomW, zoomH));
    }
    // default: fit-width
    return clampZoom(perPageW / pageBaseViewport.width);
}

/**
 * Parse a string into a zoom level or fit keyword.
 * "150%" → 1.5; "0.75" → 0.75; "fit width" / "fit-width" → 'fit-width';
 * "actual" / "100%" → 1.0; bad input → null.
 */
export function levelFromString(s) {
    if (typeof s === 'number') return clampZoom(s);
    if (typeof s !== 'string') return null;
    const lower = s.trim().toLowerCase();
    if (!lower) return null;
    if (lower === 'fit-width' || lower === 'fit width' || lower === 'fitwidth') return 'fit-width';
    if (lower === 'fit-page'  || lower === 'fit page'  || lower === 'fitpage')  return 'fit-page';
    if (lower === 'actual' || lower === 'actual size' || lower === '100%' || lower === '1' || lower === '1.0') return 1.0;
    // %: drop trailing %, divide by 100
    let m;
    if ((m = lower.match(/^([0-9]+(?:\.[0-9]+)?)\s*%$/))) {
        return clampZoom(parseFloat(m[1]) / 100);
    }
    if ((m = lower.match(/^([0-9]+(?:\.[0-9]+)?)$/))) {
        const n = parseFloat(m[1]);
        // > 8 → assume percent; ≤ 8 → assume direct factor
        return n > 8 ? clampZoom(n / 100) : clampZoom(n);
    }
    return null;
}

/** Format a zoom level like the picker label expects. */
export function formatLevel(z) {
    if (typeof z === 'string') {
        if (z === 'fit-width') return 'Fit width';
        if (z === 'fit-page')  return 'Fit page';
        if (z === 'actual')    return '100%';
        return z;
    }
    if (!Number.isFinite(z)) return '—';
    const pct = Math.round(z * 100);
    return `${pct}%`;
}

/**
 * Pinch-zoom anchor math: given two pointer positions before & after
 * a pinch gesture, compute the new zoom and the scroll delta needed
 * to keep the anchor (mid-point) stable on screen.
 *
 * @param {object} a   { d0, d1 } pinch distances; (d1/d0) = zoomFactor
 * @param {object} pos before & after positions of the pinch midpoint, in stage coords
 * @returns { zoomFactor, dx, dy }
 */
export function pinchAnchor({ d0, d1, mid0, mid1 }) {
    const factor = d0 > 0 ? d1 / d0 : 1;
    const dx = (mid1?.x ?? 0) - (mid0?.x ?? 0);
    const dy = (mid1?.y ?? 0) - (mid0?.y ?? 0);
    return { zoomFactor: factor, dx, dy };
}
