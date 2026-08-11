/**
 * z-order.test.js — locks the one invariant the z-index scale cannot
 * express on its own: A TOAST MUST PAINT ABOVE APP WINDOWS.
 * Run with: node --test tests/z-order.test.js
 *
 * Why this needs a guard at all: `--z-toast` is 800 and the app layer is
 * `z-index: 2000 !important`, so reading the numbers side by side says
 * toasts are buried — and that reading is wrong, which is exactly why it
 * keeps getting re-reported. `#app` has `z-index: auto` and forms no
 * stacking context, so the whole shell competes at the root as
 * `#app-shell` (z-index: 1); the 2000 is sealed inside it. The toast
 * container is appended to document.body, beside #app-shell, so 800 > 1
 * and it wins. Verified live: with a window overlapping the toast strip,
 * elementsFromPoint returns the toast pill above the app's own content.
 *
 * Two things can silently break that, and both are guarded here:
 *   1. moving the toast container inside the shell (then 800 vs 2000
 *      really does apply, and every toast disappears behind windows);
 *   2. adding a body-level element ranked above --z-toast — which is
 *      what #app-windows (an empty, fixed, z-index:1000 leftover) was
 *      until v1.10.3.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOKENS_CSS = read('css/tokens.css');
const TOAST_JS = read('os/ui/components/Toast.js');
const INDEX_HTML = read('index.html');

/** Every .css file under css/. */
function cssFiles(dir = 'css', out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) cssFiles(rel, out);
    else if (e.name.endsWith('.css')) out.push(rel);
  }
  return out;
}

/** --z-* token values parsed from tokens.css. */
const Z = (() => {
  const out = {};
  for (const m of TOKENS_CSS.matchAll(/(--z-[\w-]+)\s*:\s*(\d+)\s*;/g)) out[m[1]] = Number(m[2]);
  return out;
})();

/** Resolve a raw z-index value, following a single var(--z-*) hop. */
function resolveZ(raw) {
  const v = String(raw).trim();
  const varm = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(\d+)\s*)?\)$/);
  if (varm) return Z[varm[1]] ?? (varm[2] !== undefined ? Number(varm[2]) : null);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * All z-index declarations for `#id` across css/, as {file, z}.
 * The id is anchored so `#app` does not also match `#app-shell`.
 */
function zIndexesForId(id) {
  const hits = [];
  const re = new RegExp(`#${id}(?![-\\w])[^{}]*\\{([^}]*)\\}`, 'g');
  for (const file of cssFiles()) {
    for (const m of read(file).matchAll(re)) {
      const zm = m[1].match(/(?:^|;)\s*z-index\s*:\s*([^;}]+)/);
      if (zm) hits.push({ file, z: resolveZ(zm[1]), raw: zm[1].trim() });
    }
  }
  return hits;
}

describe('the token scale itself', () => {
  test('parsed the scale (a broken parser must fail loudly, not vacuously)', () => {
    assert.ok(Object.keys(Z).length >= 14, `only parsed ${Object.keys(Z).length} z tokens`);
    for (const t of ['--z-toast', '--z-focus', '--z-boot', '--z-wm-tray', '--z-alarm', '--z-grid']) {
      assert.equal(typeof Z[t], 'number', `${t} missing`);
    }
  });

  test('toasts outrank Focus Mode (the v1.3.0 invariant)', () => {
    // Focus Mode exists to deliver "focus complete · break" — the one
    // message it must never cover.
    assert.ok(Z['--z-focus'] < Z['--z-toast'],
      `--z-focus (${Z['--z-focus']}) must be below --z-toast (${Z['--z-toast']})`);
  });

  test('the two-tier split is documented, not just numeric', () => {
    // The comment is load-bearing: without it the next reader compares
    // 800 against 2000 and "fixes" a bug that does not exist.
    assert.match(TOKENS_CSS, /TWO TIERS/,
      'tokens.css must explain that tier-1 and tier-2 values are not comparable');
  });
});

describe('the toast container escapes the shell', () => {
  test('it is appended to document.body, not into the shell', () => {
    // THIS is what puts toasts above app windows — not the 800.
    assert.match(TOAST_JS, /document\.body\.appendChild\(\s*this\.container\s*\)/,
      'Toast.js must append its container to document.body; mounting it '
      + 'inside #app-shell would seal it under .m-app-layer (z-index 2000)');
  });

  test('it uses the --z-toast token', () => {
    assert.match(TOAST_JS, /zIndex:\s*'var\(--z-toast/,
      'the toast container must take its z-index from --z-toast');
  });

  test('the shell root stays below --z-toast in every stylesheet', () => {
    // #app-shell is the shell's root-level representative. If any rule
    // ever lifts it above the toast container, the whole shell — windows,
    // tray, alarm — starts painting over toasts.
    const hits = zIndexesForId('app-shell');
    assert.ok(hits.length > 0, 'expected at least one #app-shell z-index declaration');
    for (const h of hits) {
      assert.ok(h.z !== null, `#app-shell z-index "${h.raw}" in ${h.file} did not resolve`);
      assert.ok(h.z < Z['--z-toast'],
        `#app-shell z-index ${h.z} (${h.file}) must stay below --z-toast (${Z['--z-toast']})`);
    }
  });
});

describe('no body-level element outranks a toast', () => {
  // Anything in index.html that CSS gives a z-index at or above
  // --z-toast can cover a toast. Only these two may: the boot screen
  // (nothing should toast during boot) and the fatal-error screen.
  const ALLOWED = new Set(['boot', 'fatal', 'fatal-error']);

  test('every id in index.html is below --z-toast, or explicitly allowed', () => {
    const ids = [...new Set([...INDEX_HTML.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))];
    assert.ok(ids.length >= 3, `only found ${ids.length} ids in index.html — parser broken?`);

    const offenders = [];
    for (const id of ids) {
      if (ALLOWED.has(id)) continue;
      for (const h of zIndexesForId(id)) {
        if (h.z !== null && h.z >= Z['--z-toast']) {
          offenders.push(`#${id} z-index ${h.z} in ${h.file}`);
        }
      }
    }
    assert.deepEqual(offenders, [],
      'these body-level elements can paint over toasts:\n  ' + offenders.join('\n  '));
  });

  test('the dead #app-windows container stays gone', () => {
    // Empty, position:fixed, z-index:1000 — above --z-toast — and named
    // exactly like the thing a future reader would mount windows into.
    // App windows live in .m-app-layer inside the shell.
    assert.doesNotMatch(INDEX_HTML, /id="app-windows"/,
      '#app-windows was removed in v1.10.3; it outranked the toast container');
    for (const file of cssFiles()) {
      assert.doesNotMatch(read(file), /^\s*#app-windows[^{}]*\{/m,
        `${file} still styles the removed #app-windows`);
    }
  });
});
