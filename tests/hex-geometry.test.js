/**
 * Hex geometry — drift guard + shape correctness.
 *
 * The rounded hexagon exists in two places that cannot import each other:
 *
 *   • HEX_PATH_D in os/ui/icons/hexGeometry.js  (JS, for the SVG rim stroke)
 *   • --hex-mask in css/tokens.css              (CSS, for the body mask)
 *
 * CSS can't read a JS constant, so the path is duplicated by necessity. If the
 * two ever drift, the rim stroke traces a different outline than the body mask
 * and every icon on the home screen gets a visible sliver of misalignment —
 * the exact class of bug that is obvious in a screenshot and invisible in code
 * review. Hence: parse the token back out of tokens.css and compare.
 *
 * The shape tests then pin the properties the visual design depends on:
 * the silhouette matches the legacy polygon it replaced, the corners are
 * smooth (control point == original vertex), and the trims never overlap.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { HEX_PATH_D, CORNER_TRIM, HEX_RIM_GRADIENT_ID } from '../os/ui/icons/hexGeometry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS = resolve(__dirname, '../css/tokens.css');

/** The six vertices of the legacy --hex-clip polygon, in viewBox units. */
const LEGACY_VERTICES = [
    [50, 0], [100, 25], [100, 75], [50, 100], [0, 75], [0, 25],
];

/** Pull the `d` attribute out of the --hex-mask data-URI in tokens.css. */
function maskPathFromTokens() {
    const css = readFileSync(TOKENS, 'utf8');
    const decl = css.match(/--hex-mask:\s*url\("([^"]+)"\)/);
    assert.ok(decl, '--hex-mask declaration not found in css/tokens.css');
    const d = decodeURIComponent(decl[1]).match(/\bd='([^']+)'/);
    assert.ok(d, '--hex-mask data-URI has no path d attribute');
    return d[1];
}

/** Parse "M58.94 4.47 L91.06 20.53 Q100 25 100 35 ... Z" into commands. */
function parsePath(d) {
    const out = [];
    const re = /([MLQZ])([^MLQZ]*)/gi;
    let m;
    while ((m = re.exec(d)) !== null) {
        const nums = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
        out.push({ cmd: m[1].toUpperCase(), nums });
    }
    return out;
}

const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

/**
 * Extents of the shape as actually drawn.
 *
 * Straight segments contribute their endpoints. A quadratic contributes its
 * endpoints plus any axis extremum strictly inside 0<t<1, found by solving
 * B'(t)=0 for each axis:  t = (P0 - C) / (P0 - 2C + P1).
 * Skipping that step is what makes naive "min over all path numbers" wrong.
 */
function renderedExtents(cmds) {
    const xs = [], ys = [];
    let cur = null;
    const push = (p) => { xs.push(p[0]); ys.push(p[1]); };
    const quadAt = (p0, c, p1, t) => [0, 1].map(i =>
        (1 - t) * (1 - t) * p0[i] + 2 * (1 - t) * t * c[i] + t * t * p1[i]);

    for (const { cmd, nums } of cmds) {
        if (cmd === 'M' || cmd === 'L') {
            cur = [nums[0], nums[1]];
            push(cur);
        } else if (cmd === 'Q') {
            const c = [nums[0], nums[1]];
            const p1 = [nums[2], nums[3]];
            const p0 = cur;
            push(p1);
            for (let i = 0; i < 2; i++) {
                const denom = p0[i] - 2 * c[i] + p1[i];
                if (denom === 0) continue;
                const t = (p0[i] - c[i]) / denom;
                if (t > 0 && t < 1) push(quadAt(p0, c, p1, t));
            }
            cur = p1;
        }
    }
    return {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
    };
}

describe('hex geometry — CSS/JS drift guard', () => {
    test('--hex-mask in tokens.css matches HEX_PATH_D exactly', () => {
        assert.equal(maskPathFromTokens(), HEX_PATH_D);
    });

    test('the token actually parses as a URL-encoded SVG mask', () => {
        const css = readFileSync(TOKENS, 'utf8');
        const decl = css.match(/--hex-mask:\s*url\("([^"]+)"\)/)[1];
        // `#` MUST be encoded — an unescaped one starts a URL fragment and
        // silently truncates the data-URI, masking the tile to nothing.
        assert.ok(!decl.includes('#'), 'data-URI contains a raw # — encode it as %23');
        assert.ok(decl.startsWith('data:image/svg+xml,'));
        const svg = decodeURIComponent(decl);
        assert.match(svg, /viewBox='0 0 100 100'/);
        // Must stretch-to-fit like the percentage polygon it replaces,
        // otherwise a non-square tile letterboxes instead of deforming.
        assert.match(svg, /preserveAspectRatio='none'/);
        assert.match(svg, /fill='#fff'/);
    });
});

describe('hex geometry — shape correctness', () => {
    const cmds = parsePath(HEX_PATH_D);

    test('path is closed and uses only M/L/Q/Z', () => {
        assert.equal(cmds[0].cmd, 'M');
        assert.equal(cmds.at(-1).cmd, 'Z');
        for (const { cmd } of cmds) assert.ok(['M', 'L', 'Q', 'Z'].includes(cmd));
    });

    test('has exactly six rounded corners', () => {
        assert.equal(cmds.filter(c => c.cmd === 'Q').length, 6);
    });

    test('every point stays inside the 0..100 viewBox', () => {
        for (const { nums } of cmds) {
            for (const n of nums) {
                assert.ok(n >= 0 && n <= 100, `${n} is outside the viewBox`);
            }
        }
    });

    test('every Q control point IS a legacy vertex — corners are tangent, not kinked', () => {
        // A quadratic whose control point sits exactly on the original corner
        // is tangent to both adjacent edges at its endpoints. That is what
        // makes the joins smooth. If a control point drifted off the vertex,
        // the outline would visibly kink.
        const controls = cmds.filter(c => c.cmd === 'Q').map(c => [c.nums[0], c.nums[1]]);
        assert.equal(controls.length, LEGACY_VERTICES.length);
        for (const v of LEGACY_VERTICES) {
            assert.ok(
                controls.some(c => near(c[0], v[0]) && near(c[1], v[1])),
                `no rounded corner is anchored on legacy vertex ${v}`,
            );
        }
    });

    test('each corner is trimmed CORNER_TRIM units along both adjacent edges', () => {
        // Walk the path and check each Q's endpoints sit CORNER_TRIM from the
        // vertex, measured along the straight edges. This is what keeps the
        // rounding visually even despite the hexagon being horizontally
        // stretched (edges alternate 55.9 and 50 units long).
        const pts = [];
        for (const { cmd, nums } of cmds) {
            if (cmd === 'M' || cmd === 'L') pts.push({ kind: cmd, p: [nums[0], nums[1]] });
            else if (cmd === 'Q') pts.push({ kind: 'Q', c: [nums[0], nums[1]], p: [nums[2], nums[3]] });
        }
        let checked = 0;
        for (const seg of pts) {
            if (seg.kind !== 'Q') continue;
            const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
            // Distance from the vertex (control point) to the curve's endpoint.
            assert.ok(
                near(dist(seg.c, seg.p), CORNER_TRIM, 0.02),
                `corner at ${seg.c} trims ${dist(seg.c, seg.p).toFixed(3)}, expected ${CORNER_TRIM}`,
            );
            checked++;
        }
        assert.equal(checked, 6);
    });

    test('trims never overlap — the shortest edge keeps a straight run', () => {
        // Shortest edges are the two verticals at 50 units. 2 * CORNER_TRIM
        // must stay under that or adjacent corners eat each other and the
        // outline self-intersects.
        let shortest = Infinity;
        for (let i = 0; i < LEGACY_VERTICES.length; i++) {
            const a = LEGACY_VERTICES[i];
            const b = LEGACY_VERTICES[(i + 1) % LEGACY_VERTICES.length];
            shortest = Math.min(shortest, Math.hypot(b[0] - a[0], b[1] - a[1]));
        }
        assert.equal(shortest, 50);
        assert.ok(2 * CORNER_TRIM < shortest, 'CORNER_TRIM too large — corners would overlap');
    });

    test('silhouette is centred and spans the full width', () => {
        // Measured on the RENDERED outline, not the command coordinates. A
        // quadratic does not pass through its control point, so the top corner's
        // control point at y=0 is NOT on the curve — the curve peaks at
        // 0.25*4.47 + 0.5*0 + 0.25*4.47 = 2.2352. Asserting min(ys)===0 over raw
        // command numbers would "pass" while describing a shape that does not
        // exist; Chrome's getBBox() on the real path reports y=2.235, h=95.53.
        const { minX, maxX, minY, maxY } = renderedExtents(cmds);

        // Left and right edges are straight verticals, so they do reach the box.
        assert.ok(near(minX, 0), `left edge at ${minX}, expected 0`);
        assert.ok(near(maxX, 100), `right edge at ${maxX}, expected 100`);

        // Top and bottom are rounded points, so they inset by the corner's
        // quadratic midpoint height. That inset is the rounding — it is the
        // whole point — but it must be symmetric or the tile sits off-centre
        // inside its cell.
        const topInset = minY;
        const bottomInset = 100 - maxY;
        assert.ok(near(topInset, bottomInset), `asymmetric: top ${topInset}, bottom ${bottomInset}`);
        assert.ok(near(topInset, 2.235, 0.01), `top inset ${topInset}, expected 2.235`);

        // Keep the shrink small enough that tiles don't visibly change size
        // against the pre-rounding layout.
        assert.ok(maxY - minY > 95, `silhouette height ${maxY - minY} lost too much of the box`);
    });
});

describe('hex geometry — shared rim gradient', () => {
    test('gradient id is a stable constant', () => {
        // Every rim on the page references this one id. It must not be
        // per-instance or SmartIcon's id-scoping would rewrite it to a
        // dangling reference and the strokes would paint black.
        assert.equal(HEX_RIM_GRADIENT_ID, 'yv-hex-rim');
    });

    test('ensureHexDefs injects once and is idempotent', async () => {
        const { ensureHexDefs } = await import('../os/ui/icons/hexGeometry.js');
        const doc = makeFakeDoc();
        ensureHexDefs(doc);
        ensureHexDefs(doc);
        ensureHexDefs(doc);
        assert.equal(doc.body.children.length, 1, 'defs injected more than once');
    });

    test('buildHexFrame emits a bloom stroke and a rim stroke on the same path', async () => {
        const { buildHexFrame } = await import('../os/ui/icons/hexGeometry.js');
        const doc = makeFakeDoc();
        const svg = buildHexFrame(doc);
        assert.equal(svg.attrs.class, 'hex-frame');
        assert.equal(svg.attrs.viewBox, '0 0 100 100');
        assert.equal(svg.attrs['aria-hidden'], 'true');
        assert.equal(svg.children.length, 2);
        assert.deepEqual(
            svg.children.map(c => c.attrs.class),
            ['hex-frame-bloom', 'hex-frame-rim'],
            'bloom must paint before rim so the crisp edge sits on top',
        );
        for (const path of svg.children) {
            assert.equal(path.attrs.d, HEX_PATH_D);
            // Without this the stroke scales with the viewBox and thickens
            // on the diagonals — the very defect this rewrite removes.
            assert.equal(path.attrs['vector-effect'], 'non-scaling-stroke');
        }
    });
});

/** Minimal DOM double — just enough for createElementNS/appendChild/getElementById. */
function makeFakeDoc() {
    const nodes = [];
    const make = (tag) => {
        const node = {
            tag, attrs: {}, children: [],
            setAttribute(k, v) { this.attrs[k] = v; },
            appendChild(c) { this.children.push(c); return c; },
        };
        nodes.push(node);
        return node;
    };
    const body = make('body');
    return {
        body,
        documentElement: body,
        createElementNS: (_ns, tag) => make(tag),
        getElementById: (id) => nodes.find(n => n.attrs.id === id) || null,
    };
}
