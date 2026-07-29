/**
 * hexGeometry.js — the YancoVerse hexagon, defined once.
 *
 * WHY THIS EXISTS
 * ---------------
 * The original hex tile was four stacked layers, each independently clipped
 * with `clip-path: polygon(50% 0%, 100% 25%, ...)`. That has three defects
 * that cap how good the icons can look:
 *
 *   1. Six needle-sharp vertices. A polygon has hard points — at 62px they
 *      read as cheap rather than crafted.
 *   2. No outer glow is possible. clip-path removes everything outside the
 *      shape, so every shadow on a clipped element must be `inset`. The old
 *      "outer bloom" was faked as a hard-edged hexagon 5px larger with
 *      blur(1px) — a ring, not a bloom.
 *   3. Rim width varies around the perimeter. Offsetting a percentage-based
 *      polygon (`inset: -3px` on a bigger box) is not an equidistant offset,
 *      so the accent ring measures ~3.0px on the vertical edges but ~2.68px
 *      mid-diagonal.
 *
 * THE FIX
 * -------
 * One rounded-hexagon path, used two ways:
 *
 *   • As a CSS `mask-image` for the tile body. Unlike clip-path, a mask still
 *     lets an ancestor apply `filter: drop-shadow()`, so a real soft halo
 *     that follows the rounded silhouette becomes possible.
 *   • As an SVG `<path>` stroke for the rim. A stroke is mathematically
 *     uniform all the way around, and with `vector-effect:
 *     non-scaling-stroke` it stays a crisp constant screen width at any tile
 *     size — which removes defect 3 outright.
 *
 * GEOMETRY
 * --------
 * Same silhouette as the legacy polygon so nothing shifts on screen:
 * a pointy-top hexagon inscribed in a 100x100 box with vertices
 *   A(50,0) B(100,25) C(100,75) D(50,100) E(0,75) F(0,25)
 * Each vertex is replaced by a quadratic Bézier whose control point IS the
 * original vertex, entered and left at CORNER_TRIM units along each adjacent
 * edge. A quadratic built that way is tangent to both edges at the join, so
 * the corner is smooth with no kink.
 *
 * SINGLE SOURCE OF TRUTH
 * ----------------------
 * `--hex-mask` in css/tokens.css embeds this same path (CSS cannot read a JS
 * constant). tests/hex-geometry.test.js parses the token out of tokens.css and
 * asserts it matches HEX_PATH_D exactly, so the two can never drift.
 */

/** Corner trim distance, in viewBox units (of 100). */
export const CORNER_TRIM = 10;

/** The rounded hexagon, in a 0 0 100 100 viewBox. */
export const HEX_PATH_D = [
    'M58.94 4.47',
    'L91.06 20.53',
    'Q100 25 100 35',
    'L100 65',
    'Q100 75 91.06 79.47',
    'L58.94 95.53',
    'Q50 100 41.06 95.53',
    'L8.94 79.47',
    'Q0 75 0 65',
    'L0 35',
    'Q0 25 8.94 20.53',
    'L41.06 4.47',
    'Q50 0 58.94 4.47',
    'Z',
].join(' ');

/** Shared gradient id for every rim stroke on the page. */
export const HEX_RIM_GRADIENT_ID = 'yv-hex-rim';

/**
 * Shared clipPath id, referenced by the --hex-clip token in css/tokens.css.
 *
 * WHY A CLIP AS WELL AS A MASK
 * ----------------------------
 * The home tiles use --hex-mask because a mask lets an ancestor cast a real
 * drop-shadow (see the header above). But ~42 in-app hex decorations across 13
 * stylesheets were already using `clip-path`, and six of them are interactive
 * (.calc-key, .fv-cell, .lb-cell, .mc-chk, .wh-portal-hex, .cx-bm-dot).
 *
 * clip-path clips hit-testing; mask does not. Converting those to a mask would
 * silently grow each one's click target from the hexagon to its full square
 * bounding box — bad for a calculator keypad or a packed photo grid where the
 * squares can overlap their neighbours.
 *
 * So --hex-clip keeps clip semantics and only its SHAPE changes: it now points
 * at this rounded clipPath instead of a sharp polygon(). Every existing call
 * site gets rounded corners with no behavioural change at all.
 *
 * clipPathUnits="objectBoundingBox" makes the coordinates fractions of the
 * element's box, so one definition scales to every size — which `clip-path:
 * path()` cannot do, since path() is fixed pixels. The 0..100 path is reused
 * verbatim and scaled by 0.01 so there is still exactly one geometry source.
 */
export const HEX_CLIP_ID = 'yv-hex-clip';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Inject the one shared rim gradient the whole page references.
 *
 * A single document-level <defs> beats per-instance gradients: no id
 * collisions (SmartIcon already had to add _scopeSvgIds to work around
 * duplicate ids binding to the first match in document order), and one node
 * instead of one per tile.
 *
 * The stops use `var(--accent)` etc. Gradient stops resolve custom properties
 * against their OWN position in the tree, not the referencing element's — so
 * anchoring this <svg> in <body> means a theme switch (which rewrites
 * --accent on body) repaints every rim for free.
 */
export function ensureHexDefs(doc = document) {
    if (doc.getElementById(HEX_RIM_GRADIENT_ID)) return;

    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'yv-hex-defs');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');

    const defs = doc.createElementNS(SVG_NS, 'defs');
    const grad = doc.createElementNS(SVG_NS, 'linearGradient');
    grad.setAttribute('id', HEX_RIM_GRADIENT_ID);
    // Matches the 160deg chrome sweep the old .hex-ring gradient used.
    grad.setAttribute('x1', '0');
    grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0.36');
    grad.setAttribute('y2', '1');

    // accent → dim accent → steel → deep ink → accent. Reads as a machined
    // metal frame catching one light, not a uniform glow.
    const STOPS = [
        ['0',    'var(--accent)',        '0.95'],
        ['0.18', 'var(--accent)',        '0.55'],
        ['0.45', 'var(--hex-rim-mid)',   '0.85'],
        ['0.70', 'var(--hex-rim-deep)',  '0.95'],
        ['1',    'var(--accent)',        '0.92'],
    ];
    for (const [offset, color, opacity] of STOPS) {
        const stop = doc.createElementNS(SVG_NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        stop.setAttribute('stop-opacity', opacity);
        grad.appendChild(stop);
    }

    defs.appendChild(grad);

    // Rounded clipPath, referenced by --hex-clip. See HEX_CLIP_ID above for why
    // the in-app decorations clip rather than mask.
    const clip = doc.createElementNS(SVG_NS, 'clipPath');
    clip.setAttribute('id', HEX_CLIP_ID);
    clip.setAttribute('clipPathUnits', 'objectBoundingBox');
    const clipPath = doc.createElementNS(SVG_NS, 'path');
    clipPath.setAttribute('d', HEX_PATH_D);
    // objectBoundingBox units are 0..1; the shared path is authored 0..100.
    clipPath.setAttribute('transform', 'scale(0.01)');
    clip.appendChild(clipPath);
    defs.appendChild(clip);

    svg.appendChild(defs);
    (doc.body || doc.documentElement).appendChild(svg);
}

/**
 * Build the rim + bloom overlay for one hex tile.
 *
 * Two stacked strokes on the same path:
 *   .hex-frame-bloom — thick, blurred, accent. The real outer halo, drawn
 *                      OUTSIDE the body's mask so nothing clips it.
 *   .hex-frame-rim   — thin, gradient. The crisp machined edge.
 *
 * preserveAspectRatio="none" matches the legacy percentage polygon's
 * stretch-to-fit behaviour, so a non-square tile deforms identically to
 * before instead of letterboxing. non-scaling-stroke keeps the rim a constant
 * screen width regardless of that stretch.
 */
export function buildHexFrame(doc = document) {
    ensureHexDefs(doc);

    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'hex-frame');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    for (const cls of ['hex-frame-bloom', 'hex-frame-rim']) {
        const path = doc.createElementNS(SVG_NS, 'path');
        path.setAttribute('class', cls);
        path.setAttribute('d', HEX_PATH_D);
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(path);
    }

    return svg;
}
