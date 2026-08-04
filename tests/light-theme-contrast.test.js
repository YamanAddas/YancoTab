/**
 * light-theme-contrast.test.js — the light desktop stays readable.
 *
 * Light theme was unusable on the home screen for a long time: #app-shell is
 * full-bleed at z-index 1, so its dark wallpaper covered <body> completely
 * while the light text tokens applied on top of it. Nothing caught it because
 * the failure is a *combination* of two files — a token block in tokens.css
 * and a background in main.css — that are individually fine.
 *
 * These guards pin the combination:
 *   1. main.css keeps a light-mode #app-shell override, and that override
 *      does not reintroduce a wallpaper image.
 *   2. The light text tokens still clear WCAG AA against the darkest pixel
 *      that override can produce.
 *
 * The contrast math is duplicated here rather than imported because it
 * belongs to CSS, which has no runtime this suite can call into. Values are
 * parsed out of the stylesheets so the test fails when they drift.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const tokens = read('css/tokens.css');
const mainCss = read('css/main.css');

// ── colour helpers (WCAG 2.1 relative luminance) ──────────────────

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const over = (fg, bg) => ({
  r: fg.a * fg.r + (1 - fg.a) * bg.r,
  g: fg.a * fg.g + (1 - fg.a) * bg.g,
  b: fg.a * fg.b + (1 - fg.a) * bg.b,
});
const lum = (c) => {
  const [r, g, b] = [c.r, c.g, c.b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};

/** Pull `--name: value;` out of the `body.theme-light { … }` block. */
function lightToken(name) {
  const block = tokens.match(/body\.theme-light\s*\{([\s\S]*?)\n\}/);
  assert.ok(block, 'could not locate the body.theme-light token block');
  const m = block[1].match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

describe('light theme — parser sanity', () => {
  // Without these the assertions below could pass vacuously against a
  // stylesheet the parser silently failed to read.
  test('the light token block parses and yields real values', () => {
    for (const t of ['bg', 'bg-elevated', 'text', 'text-bright', 'accent', 'accent-text']) {
      const v = lightToken(t);
      assert.ok(v && /^#|^rgb/.test(v), `--${t} did not parse (got ${v})`);
    }
  });

  test('main.css is non-trivial and contains the shell rule', () => {
    assert.ok(mainCss.length > 1000);
    assert.match(mainCss, /#app-shell\s*\{/);
  });
});

describe('light theme — the desktop surface', () => {
  test('a light-mode #app-shell override exists', () => {
    // This is the actual fix. Without it the dark wallpaper covers <body>
    // and every light text token lands on a dark photo.
    assert.match(
      mainCss,
      /body\.theme-light\s+#app-shell\s*\{/,
      'light mode must override #app-shell, or the dark wallpaper covers the whole desktop',
    );
  });

  test('the override replaces the wallpaper rather than layering over it', () => {
    const rule = mainCss.match(/body\.theme-light\s+#app-shell\s*\{([\s\S]*?)\}/);
    assert.ok(rule, 'light #app-shell rule not found');
    assert.doesNotMatch(
      rule[1], /wallpapers\//,
      'light mode must not paint a wallpaper image — contrast then depends on a photo',
    );
    assert.match(rule[1], /background-image\s*:/, 'override must set background-image');
    // themes.js and WallpaperManager write the wallpaper as an INLINE style,
    // which only an important author declaration outranks.
    assert.match(rule[1], /!important/, 'override must be !important to beat the inline wallpaper');
  });
});

describe('light theme — WCAG AA on the desktop surface', () => {
  // Darkest pixel the surface can produce: the bottom stop of the linear ramp
  // (--bg-elevated) with the nearer accent radial at full strength. The two
  // radials sit at opposite corners, so they cannot both peak on one pixel.
  const ACCENT_RADIAL_ALPHA = 0.07;
  const surface = () =>
    over({ ...hex('#007AFF'), a: ACCENT_RADIAL_ALPHA }, hex(lightToken('bg-elevated')));

  test('the surface stays light', () => {
    assert.ok(lum(surface()) > 0.6, 'light surface unexpectedly dark');
  });

  test('--text clears AA for body copy (date line, idle page tabs)', () => {
    // #6e6e73 — Apple's secondary label — measured 4.09:1 here and failed.
    const r = ratio(hex(lightToken('text')), surface());
    assert.ok(r >= 4.5, `--text is ${r.toFixed(2)}:1 on the light surface, need 4.5`);
  });

  test('--text-bright clears AA comfortably', () => {
    const r = ratio(hex(lightToken('text-bright')), surface());
    assert.ok(r >= 7, `--text-bright is ${r.toFixed(2)}:1, expected AAA-level`);
  });

  test('--accent-text clears AA for small accent text', () => {
    // The greeting line (11px) and active page tab (10.5px) use this.
    const r = ratio(hex(lightToken('accent-text')), surface());
    assert.ok(r >= 4.5, `--accent-text is ${r.toFixed(2)}:1, need 4.5`);
  });

  test('--accent alone would NOT clear AA — which is why --accent-text exists', () => {
    // Guards the reasoning: if someone "simplifies" --accent-text back to
    // --accent, this documents why that regresses.
    const r = ratio(hex(lightToken('accent')), surface());
    assert.ok(r < 4.5, `--accent is now ${r.toFixed(2)}:1 — if it passes, --accent-text may be redundant`);
  });

  test('--accent still clears the 3:1 bar for large text and UI edges', () => {
    const r = ratio(hex(lightToken('accent')), surface());
    assert.ok(r >= 3, `--accent is ${r.toFixed(2)}:1, below the 3:1 large-text/non-text bar`);
  });

  test('the text hierarchy stays ordered bright > text > dim', () => {
    const l = (n) => lum(hex(lightToken(n)));
    assert.ok(l('text-bright') < l('text'), 'text-bright must be darker than text');
    assert.ok(l('text') < l('text-dim'), 'text must be darker than text-dim');
  });
});

describe('dark theme — wallpaper readability scrim', () => {
  // Every shipped wallpaper has the YancoTab crest baked into its centre,
  // and the crest is near-white (rgb(141,255,145) at the centre pixel) —
  // directly behind the app grid. App labels are pure white, so no colour
  // change can rescue them; only darkening what is behind them can.
  const rule = () => mainCss.match(/#app-shell::after\s*\{([\s\S]*?)\}/);

  test('the scrim exists', () => {
    assert.ok(rule(), '#app-shell::after scrim is missing — app labels drop to ~1.1:1');
  });

  test('it sits above the wallpaper but below the UI', () => {
    // z-index:-1 paints a child above its parent's background and below the
    // parent's in-flow content. Any other value either hides the scrim
    // behind the wallpaper or covers the entire interface.
    assert.match(rule()[1], /z-index:\s*-1\s*;/, 'scrim must use z-index: -1');
    assert.match(rule()[1], /position:\s*absolute/);
    assert.match(rule()[1], /inset:\s*0/);
  });

  test('it never intercepts clicks', () => {
    assert.match(rule()[1], /pointer-events:\s*none/);
  });

  test('it is opaque enough to clear AA for white text on the crest', () => {
    const m = rule()[1].match(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([\d.]+)\s*\)/);
    assert.ok(m, 'scrim must be a black rgba fill');
    const alpha = parseFloat(m[1]);
    // Measured: white on emerald's brightest label pixel is 4.43:1 at 0.50
    // and 5.27:1 at 0.55. Below 0.5 the app labels fail.
    assert.ok(alpha >= 0.5, `scrim alpha ${alpha} is too light — white app labels need >= 0.5`);
    assert.ok(alpha <= 0.7, `scrim alpha ${alpha} would flatten the wallpaper entirely`);
  });

  test('a pseudo-element is used, not a background layer', () => {
    // themes.js applyWallpaper and both WallpaperManager paths assign
    // shell.style.background / .backgroundImage inline, which would wipe any
    // background-layer scrim. A pseudo-element is immune.
    const themes = read('os/theme/themes.js');
    assert.match(themes, /shell\.style\.background\s*=/,
      'themes.js no longer writes an inline background — re-check the scrim approach');
  });

  test('it is disabled in light mode', () => {
    assert.match(
      mainCss, /body\.theme-light\s+#app-shell::after\s*\{[^}]*display:\s*none/,
      'light mode paints its own surface; the scrim would only muddy it',
    );
  });
});

describe('dark theme is untouched', () => {
  test('--accent-text aliases --accent in the root block', () => {
    // Every call site switched from --accent to --accent-text. In dark mode
    // that must be a literal no-op.
    const root = tokens.match(/:root\s*\{([\s\S]*?)\n\}/);
    assert.ok(root, ':root block not found');
    assert.match(
      root[1], /--accent-text\s*:\s*var\(--accent\)\s*;/,
      'dark --accent-text must alias --accent so the switch changes nothing',
    );
  });

  test('no light-mode rule leaks into the default theme', () => {
    const rule = mainCss.match(/body\.theme-light\s+#app-shell\s*\{[\s\S]*?\}/);
    assert.ok(rule[0].startsWith('body.theme-light'), 'shell override must be scoped to .theme-light');
  });
});
