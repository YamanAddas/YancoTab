/**
 * csp-img-src.test.js — images may only come from places we chose.
 * Run with: node --test tests/csp-img-src.test.js
 *
 * Backstop for the v1.10.8 wallpaper beacon: an imported settings file
 * put an off-origin `url()` into a storage marker and it fetched on
 * every new tab. That hole is closed in os/theme/wallpaper.js, but the
 * only thing that kills the whole CLASS — any future sink that reaches
 * an image URL — is a CSP that refuses off-origin images outright.
 *
 * The policy is declared twice on purpose, and both are required:
 *   • manifest.json  → governs the EXTENSION's pages.
 *   • index.html meta → governs the STANDALONE WEB APP, which has no
 *     manifest and therefore no other backstop.
 * They must not drift apart, so this suite pins them to each other.
 *
 * The subtle part, and the reason the sources are asserted individually:
 * the favicon URL we request (s2.googleusercontent.com) 302s to
 * t*.gstatic.com. CSP re-checks every redirect target and blocks on the
 * DESTINATION while reporting the ORIGINAL URI — so allowing only the
 * host we type silently kills every favicon and blames the wrong URL.
 * That was observed live, not theorised.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const MANIFEST = JSON.parse(read('manifest.json'));
const INDEX = read('index.html');

/** Pull one directive's source list out of a CSP string. */
function directive(csp, name) {
  const found = String(csp)
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + ' '));
  return found ? found.slice(name.length).trim().split(/\s+/) : null;
}

const REQUIRED = [
  ["'self'", 'local assets — wallpapers, app icons, fonts'],
  ['data:', 'Photos, custom wallpapers, generated icons'],
  ['blob:', 'PDF page renders and thumbnails'],
  ['https://s2.googleusercontent.com', 'the favicon URL we request'],
  ['https://*.gstatic.com', 'where that favicon URL redirects — omit and every favicon dies'],
];

describe('the extension policy', () => {
  const csp = MANIFEST.content_security_policy?.extension_pages;

  test('declares an img-src directive', () => {
    assert.ok(csp, 'no extension_pages CSP');
    assert.ok(directive(csp, 'img-src'), 'extension_pages CSP must declare img-src');
  });

  for (const [src, why] of REQUIRED) {
    test(`allows ${src} — ${why}`, () => {
      assert.ok(directive(csp, 'img-src').includes(src), `img-src must include ${src}`);
    });
  }

  test('does not open itself back up', () => {
    // A bare '*', 'https:' or 'http:' would allow any host and make the
    // directive decorative — which is exactly the state before v1.10.9.
    const sources = directive(csp, 'img-src');
    for (const wildcard of ['*', 'https:', 'http:']) {
      assert.ok(!sources.includes(wildcard),
        `img-src must not include the blanket source ${wildcard}`);
    }
  });

  test('the other directives survived the edit', () => {
    for (const d of ['script-src', 'object-src', 'frame-src', 'worker-src']) {
      assert.ok(directive(csp, d), `${d} must still be declared`);
    }
    assert.ok(!directive(csp, 'script-src').includes("'unsafe-eval'"),
      "script-src must never gain 'unsafe-eval'");
  });
});

describe('the standalone web-app policy', () => {
  const meta = INDEX.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i,
  );

  test('index.html ships a CSP meta tag', () => {
    // The web app has no manifest, so without this it has no backstop.
    assert.ok(meta, 'index.html must declare a Content-Security-Policy meta tag');
  });

  test('its img-src matches the extension policy exactly', () => {
    // Drift here means the web app and the extension disagree about what
    // may load — and only one of them would be tested.
    const fromMeta = directive(meta[1], 'img-src');
    const fromManifest = directive(MANIFEST.content_security_policy.extension_pages, 'img-src');
    assert.deepEqual([...fromMeta].sort(), [...fromManifest].sort());
  });

  test('the meta tag precedes the first stylesheet', () => {
    // A policy declared after resources have started loading governs
    // less than it appears to.
    assert.ok(INDEX.indexOf('http-equiv="Content-Security-Policy"') < INDEX.indexOf('<link rel="stylesheet"'),
      'the CSP meta tag must come before the first <link rel="stylesheet">');
  });
});

describe('the favicon host the code actually calls is allowed', () => {
  test('every s2/favicons call site uses an allowed origin', () => {
    // Guards the pairing: if someone switches the favicon host back
    // (v1.10.8 moved it off the cookied www.google.com), the CSP must
    // move with it or favicons break silently.
    const sources = directive(MANIFEST.content_security_policy.extension_pages, 'img-src');
    const files = [
      'os/apps/browser/view/portal.js',
      'os/ui/components/MobileShortcutModal.js',
      'os/ui/components/PagePanes.js',
      'os/ui/mobileShell.js',
    ];
    let found = 0;
    for (const f of files) {
      for (const m of read(f).matchAll(/https:\/\/([a-z0-9.-]+)\/s2\/favicons/g)) {
        found++;
        const host = m[1];
        const allowed = sources.some((s) => s === `https://${host}`
          || (s.startsWith('https://*.') && host.endsWith(s.slice('https://*.'.length))));
        assert.ok(allowed, `${f} requests ${host}, which img-src does not allow`);
      }
    }
    assert.equal(found, 4, `expected 4 favicon call sites, scanned ${found} — parser drifted`);
  });
});
