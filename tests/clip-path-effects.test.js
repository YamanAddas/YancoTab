/**
 * Guard: effects that a clipped element can never paint.
 *
 * `clip-path` (and `mask`) remove everything the element paints outside the
 * shape. On a clipped element these are silently discarded — no warning, no
 * console error, the declaration just does nothing:
 *
 *   - a non-inset `box-shadow`            (glow / drop shadow)
 *   - a spread-only ring `0 0 0 Npx`      (selection outline)
 *   - `filter: drop-shadow()` on the SAME element — verified by rasterising a
 *     test case and reading pixels: the filter is applied BEFORE the clip, so
 *     the clip eats the shadow too. Only a filter on an unclipped ANCESTOR
 *     escapes.
 *   - `outline`
 *
 * and a `border` is mangled rather than removed: it sits inside the border
 * box, so only the fragments where the box edge falls inside the shape
 * survive, drawing a broken outline.
 *
 * This bug class shipped 14 times across 8 stylesheets before it was caught,
 * including three cases that removed real interaction feedback (the Files
 * drop-target ring, the Notes star selection ring, the Tarneeb/Trix
 * whose-turn indicator). It is invisible in code review because the broken
 * declaration usually lives in a DIFFERENT rule from the clip-path — a state
 * variant like `.x.is-selected .y` — so grepping for clip-path misses it.
 *
 * The fix is always one of:
 *   - inset the effect (`box-shadow: inset ...`) so it lives inside the shape;
 *   - move the clip to a `::before`/`::after` surface and let the now-unclipped
 *     host carry a `filter: drop-shadow()`;
 *   - move the effect to an unclipped ancestor.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_DIR = resolve(__dirname, '../css');

/** Blank comments, preserving newlines so line numbers stay accurate. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '));

/** Every `--name: value` declared anywhere, for resolving var() in shadows. */
function collectTokens() {
    const map = new Map();
    for (const f of readdirSync(CSS_DIR).filter((x) => x.endsWith('.css'))) {
        const src = stripComments(readFileSync(join(CSS_DIR, f), 'utf8'));
        for (const m of src.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;}]+)/g)) {
            if (!map.has(m[1])) map.set(m[1], m[2].trim());
        }
    }
    return map;
}

/**
 * Expand var() a few levels so `box-shadow: var(--lg-edge)` can be seen for
 * what it is. Without this, every token-composed inset shadow looks like a
 * potential outer shadow and the guard is useless.
 */
function expandVars(value, tokens, depth = 0) {
    if (depth > 4 || !value.includes('var(')) return value;
    const out = value.replace(/var\(\s*(--[A-Za-z0-9-]+)\s*(?:,([^()]*(?:\([^()]*\)[^()]*)*))?\)/g,
        (m, name, fallback) => tokens.get(name) ?? (fallback ? fallback.trim() : m));
    return out === value ? out : expandVars(out, tokens, depth + 1);
}

function* eachRule(src, file) {
    const clean = stripComments(src);
    for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const line = clean.slice(0, m.index).split('\n').length;
        for (const raw of m[1].split(',')) {
            const sel = raw.trim().split('\n').pop().trim();
            if (!sel || sel.startsWith('@') || /^\d+%$|^from$|^to$/.test(sel)) continue;
            yield { file, line, sel, body: m[2] };
        }
    }
}

const declOf = (body, prop) => {
    const m = body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:([^;]*)`, 'i'));
    return m ? m[1].trim() : null;
};

const keyCompound = (sel) => sel.trim().split(/\s+|>|\+|~/).filter(Boolean).pop() || '';
const classesOf = (c) => (c.match(/\.[A-Za-z0-9_-]+/g) || []).map((s) => s.slice(1));

/** Split a box-shadow into layers, ignoring commas inside parens. */
const layersOf = (v) => v.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);

function analyse() {
    const tokens = collectTokens();
    const files = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'));
    const rules = [];
    const keyframes = new Map(); // name -> [{prop, value}]

    for (const f of files) {
        const src = readFileSync(join(CSS_DIR, f), 'utf8');
        for (const r of eachRule(src, f)) rules.push(r);

        // Keyframe bodies: the Files drop-flash bug animated an outer
        // box-shadow from inside @keyframes, where no rule-level scan sees it.
        const clean = stripComments(src);
        for (const km of clean.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)\s*\{([\s\S]*?)\n\}/g)) {
            const decls = [];
            for (const step of km[2].matchAll(/\{([^{}]*)\}/g)) {
                for (const prop of ['box-shadow', 'outline']) {
                    const v = declOf(step[1], prop);
                    if (v) decls.push({ prop, value: v, file: f });
                }
            }
            if (decls.length) keyframes.set(km[1], decls);
        }
    }

    // Which classes are clipped?
    const clipped = new Map();
    for (const r of rules) {
        const cp = declOf(r.body, 'clip-path') || declOf(r.body, '-webkit-clip-path');
        const mk = declOf(r.body, 'mask-image') || declOf(r.body, '-webkit-mask-image')
                || declOf(r.body, 'mask') || declOf(r.body, '-webkit-mask');
        const how = (cp && cp !== 'none') ? cp : ((mk && mk !== 'none') ? mk : null);
        if (!how) continue;
        const compound = keyCompound(r.sel);
        const pe = compound.match(/::(before|after)/);
        for (const c of classesOf(compound)) {
            const key = pe ? `${c}${pe[0]}` : c;
            if (!clipped.has(key)) clipped.set(key, `${r.file}:${r.line}`);
        }
    }

    const findings = [];
    for (const r of rules) {
        const compound = keyCompound(r.sel);
        const pe = compound.match(/::(before|after)/);
        const targetsClipped = classesOf(compound).some((c) =>
            clipped.has(c) || (pe && clipped.has(`${c}${pe[0]}`)));
        if (!targetsClipped) continue;

        const add = (kind, value) => findings.push({ ...r, kind, value });

        const bs = declOf(r.body, 'box-shadow');
        if (bs && bs !== 'none') {
            const outer = layersOf(expandVars(bs, tokens)).filter((l) => !/\binset\b/.test(l));
            if (outer.length) add('outer box-shadow', outer.join(', '));
        }
        const fl = declOf(r.body, 'filter');
        if (fl && /drop-shadow/.test(fl)) add('filter: drop-shadow on a clipped element', fl);

        const ol = declOf(r.body, 'outline');
        if (ol && !/^(none|0)/.test(ol)) add('outline', ol);

        const bd = declOf(r.body, 'border');
        if (bd && !/^(none|0)/.test(bd)) add('border (fragmented by the clip)', bd);

        // Animations applied to a clipped element that animate an outer shadow.
        const anim = declOf(r.body, 'animation') || declOf(r.body, 'animation-name');
        if (anim) {
            for (const [name, decls] of keyframes) {
                if (!new RegExp(`\\b${name}\\b`).test(anim)) continue;
                for (const d of decls) {
                    if (d.prop === 'outline') { add(`@keyframes ${name} outline`, d.value); continue; }
                    const outer = layersOf(expandVars(d.value, tokens)).filter((l) => !/\binset\b/.test(l));
                    if (outer.length) add(`@keyframes ${name} outer box-shadow`, outer.join(', '));
                }
            }
        }
    }
    return { findings, clippedCount: clipped.size };
}

describe('clip-path / mask — effects that can never paint', () => {
    const { findings, clippedCount } = analyse();

    test('the audit actually finds clipped elements to check', () => {
        // If this drops to ~0 the guard has silently stopped testing anything
        // (e.g. the selector parser broke), and every assertion below is vacuous.
        assert.ok(clippedCount > 20, `only ${clippedCount} clipped classes found — parser likely broken`);
    });

    test('no clipped element declares an effect the clip would delete', () => {
        const report = findings.map((f) =>
            `\n  ${f.file}:${f.line}  ${f.sel}\n      ${f.kind}: ${f.value.replace(/\s+/g, ' ').slice(0, 120)}`).join('');
        assert.equal(findings.length, 0,
            `${findings.length} declaration(s) will be discarded by clip-path/mask:${report}\n\n`
            + 'Fix by insetting the effect, moving the clip to a ::before/::after surface '
            + 'so the host can carry a filter: drop-shadow(), or moving the effect to an '
            + 'unclipped ancestor. See the header of this file.');
    });
});
