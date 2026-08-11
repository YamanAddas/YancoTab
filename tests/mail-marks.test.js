/**
 * mail-marks.test.js
 *
 * Two things are being guarded here, and only one of them is cosmetic.
 *
 * 1. **No ids, no defs, no gradients.** SmartIcon carries _scopeSvgIds()
 *    because duplicate gradient ids across instances make url(#…) bind to the
 *    first match in document order — which, after a page switch, can be inside
 *    a display:none pane. Mail renders the same mark at up to three sizes at
 *    once, which is exactly that setup. Forbidding ids makes the bug class
 *    unreachable rather than mitigated, and this test is what keeps it that
 *    way when someone pastes in a full-colour logo later.
 *
 * 2. **Contrast in both themes.** A brand mark is never composited against the
 *    app surface: it sits on a plate whose colour pair is fixed. So the pair
 *    is computable offline, and every provider has to clear 3:1 (WCAG 1.4.11,
 *    non-text graphical object) whichever plate it declares.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PROVIDER_MARKS } from '../os/apps/mail/marks.js';
import { PROVIDERS } from '../os/apps/mail/providers.js';

/* ── contrast helpers ────────────────────────────────────── */

function srgbToLinear(c) {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    assert.ok(m, `bad hex ${hex}`);
    const [r, g, b] = [1, 2, 3].map(i => srgbToLinear(parseInt(m[i], 16)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}

describe('provider marks', () => {
    it('sanity: the contrast helper agrees with known pairs', () => {
        // Anti-vacuity — a broken helper would pass every provider silently.
        assert.ok(Math.abs(contrast('#000000', '#ffffff') - 21) < 0.01);
        assert.ok(Math.abs(contrast('#ffffff', '#ffffff') - 1) < 0.01);
    });

    it('every mark is a well-formed 24x24 currentColor svg', () => {
        for (const [id, svg] of Object.entries(PROVIDER_MARKS)) {
            assert.match(svg, /^<svg /, `${id} does not start with <svg`);
            assert.match(svg, /<\/svg>$/, `${id} does not end with </svg>`);
            assert.match(svg, /viewBox="0 0 24 24"/, `${id} viewBox must be 0 0 24 24`);
            assert.match(svg, /fill="currentColor"/, `${id} must fill with currentColor`);
            assert.match(svg, /aria-hidden="true"/, `${id} must be aria-hidden`);
        }
    });

    it('no mark carries an id, defs, gradient, or use — see header', () => {
        for (const [id, svg] of Object.entries(PROVIDER_MARKS)) {
            assert.ok(!/\sid\s*=/.test(svg), `${id} has an id attribute`);
            assert.ok(!/<defs/i.test(svg), `${id} has <defs>`);
            assert.ok(!/Gradient/i.test(svg), `${id} has a gradient`);
            assert.ok(!/<use/i.test(svg), `${id} has <use>`);
            assert.ok(!/url\(#/.test(svg), `${id} references a fragment url`);
        }
    });

    it('no mark can execute or fetch anything', () => {
        for (const [id, svg] of Object.entries(PROVIDER_MARKS)) {
            assert.ok(!/<script/i.test(svg), `${id} has <script>`);
            assert.ok(!/\son[a-z]+\s*=/i.test(svg), `${id} has an on* handler`);
            assert.ok(!/<image/i.test(svg), `${id} has <image>`);
            assert.ok(!/<foreignObject/i.test(svg), `${id} has <foreignObject>`);
            // A non-fragment href would be a network fetch, which is exactly
            // what inlining these was meant to avoid.
            assert.ok(!/href\s*=\s*"(?!#)/i.test(svg), `${id} has an external href`);
        }
    });

    it('is built only from <path> elements', () => {
        for (const [id, svg] of Object.entries(PROVIDER_MARKS)) {
            const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
            const tags = [...inner.matchAll(/<([a-zA-Z]+)/g)].map(m => m[1]);
            assert.ok(tags.length > 0, `${id} has no shapes`);
            for (const tag of tags) assert.equal(tag, 'path', `${id} contains <${tag}>`);
        }
    });

    it('every mark id names a real provider', () => {
        const ids = new Set(PROVIDERS.map(p => p.id));
        for (const id of Object.keys(PROVIDER_MARKS)) {
            assert.ok(ids.has(id), `mark "${id}" matches no provider`);
        }
    });

    it('every provider renders something — a mark or a letter, never blank', () => {
        for (const p of PROVIDERS) {
            const hasMark = Object.hasOwn(PROVIDER_MARKS, p.id);
            const hasLetter = typeof p.short === 'string' && p.short.length > 0;
            const hasName = typeof p.name === 'string' && p.name.length > 0;
            assert.ok(hasMark || hasLetter || hasName, `${p.id} would render blank`);
            // iCloud deliberately has an empty `short` because its mark is a
            // cloud; if the mark ever goes, the name's first letter is used.
            if (!hasMark) assert.ok(hasLetter, `${p.id} has no mark and no short`);
        }
    });

    it('the registry is frozen', () => {
        // The module aliases outlook365 to the outlook glyph; doing that by
        // assignment after Object.freeze throws in module strict mode, so the
        // freeze is load-bearing rather than decorative.
        assert.ok(Object.isFrozen(PROVIDER_MARKS));
    });

    it('every plate pair clears 3:1 in both themes', () => {
        for (const p of PROVIDERS) {
            // plate 'light' => white plate + brand glyph.
            // plate 'brand' => brand plate + white glyph.
            // Either way the pair is (white, brand) and is theme-independent.
            const ratio = contrast('#ffffff', p.brand);
            assert.ok(ratio >= 3,
                `${p.id} (${p.brand}, plate ${p.plate}) is ${ratio.toFixed(2)}:1 against white`);
        }
    });
});
