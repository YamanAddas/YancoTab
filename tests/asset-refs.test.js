/**
 * Guard: references and version strings that silently rot.
 *
 * Same bug class as the CSS and el() guards — things that look maintained and
 * quietly aren't. Two real defects motivated this file:
 *
 *  1. VERSION DRIFT IN index.html. The version is bumped in manifest.json,
 *     package.json, os/version.js and sw.js together (the project contract
 *     says so), but index.html hand-writes it in 16 more places: `?v=<ver>`
 *     on 15 stylesheets plus the boot screen's subtitle. Those sat at v1.1.2
 *     while everything else moved to v1.2.4. Nothing consumes ASSET_VERSION
 *     to generate them, and there is no build step to template them, so only
 *     a test can catch the drift.
 *
 *  2. THE PRECACHE NEVER MATCHED THOSE REQUESTS. sw.js precaches
 *     './css/shell.css' while the page requests './css/shell.css?v=...'.
 *     caches.match() keys on the full URL, so every stylesheet missed the
 *     cache and fell through to the network: the precache listed 349 paths
 *     that all existed, and offline still had no CSS. Fixed with
 *     `{ ignoreSearch: true }` on the cache-first branch only — the API
 *     branch must keep exact matching or one city's weather is served for
 *     another's.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const exists = (p) => existsSync(join(ROOT, p));
/** Absolute path → repo-relative, forward slashes (Windows resolve() gives \). */
const toRepoPath = (abs) => abs.slice(ROOT.length + 1).split('\\').join('/');

/** HTML boolean attributes — presence applies them, so ="false" still applies. */
const BOOLEAN_ATTRS = [
    'disabled', 'checked', 'selected', 'readonly', 'required', 'multiple',
    'open', 'autofocus', 'controls', 'loop', 'muted', 'playsinline',
    'hidden', 'reversed', 'novalidate', 'inert', 'async', 'defer',
];

/** Root-level pages that end up inside the extension zip, per pack-extension.sh. */
function shippedPages() {
    const excludes = new Set();
    const script = read('scripts/pack-extension.sh');
    const block = script.match(/EXCLUDES=\(([\s\S]*?)\n\)/);
    if (block) {
        // Strip `#` comments FIRST. One of them reads "aren't part of the
        // extension", and that lone apostrophe desynchronises naive quote
        // pairing — every entry after it parses shifted by one, which silently
        // dropped kofi-logo-generator.html and icon-concepts.html from the
        // exclude set and made this suite audit files that never ship.
        const code = block[1].replace(/#[^\n]*/g, '');
        for (const m of code.matchAll(/'([^']+)'/g)) excludes.add(m[1]);
    }
    return readdirSync(ROOT)
        .filter((f) => f.endsWith('.html') && !excludes.has(f));
}

describe('version strings stay in sync', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const pkg = JSON.parse(read('package.json'));
    const versionJs = read('os/version.js');
    const sw = read('sw.js');
    const index = read('index.html');

    const found = {
        'manifest.json': manifest.version,
        'package.json': pkg.version,
        'os/version.js VERSION': (versionJs.match(/\bVERSION\s*=\s*'v([\d.]+)'/) || [])[1],
        'os/version.js ASSET_VERSION': (versionJs.match(/ASSET_VERSION\s*=\s*'v([\d.]+)'/) || [])[1],
        'sw.js CACHE_NAME': (sw.match(/CACHE_NAME\s*=\s*'yancotab-v([\d.]+)/) || [])[1],
        // The README's shields.io badge. Added after it was found sitting at
        // 1.2.5 while the release was 1.9.x — seven versions of drift on the
        // first thing anyone sees on GitHub. It is a version location like
        // any other, so it belongs in the same guard.
        'README.md badge': (read('README.md').match(/badge\/version-([\d.]+)-teal/) || [])[1],
    };

    test('every declared version matches', () => {
        for (const [where, v] of Object.entries(found)) {
            assert.ok(v, `could not parse a version from ${where}`);
        }
        assert.equal(new Set(Object.values(found)).size, 1,
            `version drift: ${JSON.stringify(found, null, 2)}`);
    });

    test('index.html cache-busting query matches the release', () => {
        // Stale here means returning web-app users keep the previously cached
        // CSS — every visual change silently fails to reach them.
        const qs = [...new Set([...index.matchAll(/\?v=v([\d.]+)/g)].map((m) => m[1]))];
        assert.ok(qs.length > 0, 'no ?v= cache-busting found in index.html');
        assert.deepEqual(qs, [manifest.version],
            `index.html ?v= is ${qs.join('/')} but the release is ${manifest.version}`);
    });

    test('the boot screen shows the real version', () => {
        const sub = (index.match(/class="boot-subtext">v([\d.]+)</) || [])[1];
        assert.equal(sub, manifest.version);
    });
});

describe('service worker cache correctness', () => {
    const sw = read('sw.js');

    test('every precached path exists on disk', () => {
        // One missing path makes cache.addAll() reject, which disables offline
        // support entirely and silently.
        const missing = [...sw.matchAll(/'\.\/([^']+)'/g)]
            .map((m) => m[1])
            .filter((p) => !exists(p));
        assert.deepEqual(missing, [], `precached paths that do not exist: ${missing.join(', ')}`);
    });

    test('the static branch matches regardless of query string', () => {
        // Without ignoreSearch, './css/x.css?v=1' never matches precached
        // './css/x.css' and offline loses every stylesheet.
        assert.match(sw, /caches\.match\(\s*event\.request\s*,\s*\{\s*ignoreSearch:\s*true\s*\}/,
            'cache-first branch must use { ignoreSearch: true }');
    });

    test('the API branch still matches exactly', () => {
        // Ignoring the query here would serve one city's weather for another's.
        const apiBranch = sw.match(/fetch\(event\.request\)\.catch\(\(\) => caches\.match\(([^)]*)\)/);
        assert.ok(apiBranch, 'network-first fallback not found');
        assert.ok(!/ignoreSearch/.test(apiBranch[1]),
            'API fallback must NOT ignore the query string');
    });

    // ── The reverse direction ───────────────────────────────────────
    // The test above proves everything in the precache exists on disk. It
    // says nothing about whether everything the BOOT needs is in the
    // precache — and the fetch handler is precache-or-network with no
    // runtime cache.put, so an ES module graph is all-or-nothing offline:
    // ONE uncached static import rejects the whole graph and the user gets
    // the "Boot Module Missing" screen. This drifted silently for releases
    // (22 boot modules + 4 stylesheets missing) because only the forward
    // direction was guarded.

    const precached = new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]));

    /** Walk the STATIC import graph from the boot entries. Lazy app
     *  imports are dynamic and legitimately load post-boot; the one
     *  dynamic import that IS boot-critical (boot-loader → boot.js) is
     *  seeded explicitly. */
    function staticImportGraph(entries) {
        const seen = new Set();
        const queue = [...entries];
        while (queue.length) {
            const file = queue.pop();
            if (seen.has(file) || !exists(file)) continue;
            seen.add(file);
            const src = read(file);
            const dir = dirname(file);
            for (const m of src.matchAll(/^\s*import\s+(?:[^'"]*?from\s+)?['"](\.[^'"]+)['"]/gm)) {
                // resolve() gives an absolute path; normalize back to repo-relative
                const abs = resolve(join(ROOT, dir), m[1]);
                queue.push(abs.slice(ROOT.length + 1).replace(/\\/g, '/'));
            }
        }
        return seen;
    }

    test('every module in the boot import graph is precached', () => {
        const graph = staticImportGraph(['os/boot-loader.js', 'os/boot.js', 'os/boot-init.js']);
        const missing = [...graph].filter((p) => !precached.has(p)).sort();
        assert.deepEqual(missing, [],
            `boot-critical modules missing from the SW precache (offline boot fails at the first one): ${missing.join(', ')}`);
    });

    test('every stylesheet index.html loads is precached', () => {
        const html = read('index.html');
        const links = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.\/([^"?]+)/g)].map((m) => m[1]);
        assert.ok(links.length >= 10, `expected the full stylesheet list, parsed only ${links.length}`);
        const missing = links.filter((p) => !precached.has(p));
        assert.deepEqual(missing, [],
            `stylesheets index.html loads but the precache omits: ${missing.join(', ')}`);
    });

    // ── Every import target must exist ──────────────────────────────
    // The graph tests above only follow STATIC imports from the boot
    // entries, so a dynamic import() elsewhere in the tree can point at a
    // path that has never existed and nobody notices: the failure surfaces
    // as a rejected promise inside a try/catch, which is exactly how PDF
    // auto-OCR spent its whole life "silently skipped if unavailable".
    // Found by auditing the packed zip, not by any test — hence this one.

    /** Every literal import specifier in os/, with its source file. */
    function allLiteralImports() {
        const out = [];
        const walk = (rel) => {
            for (const entry of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
                const child = `${rel}/${entry.name}`;
                if (entry.isDirectory()) { walk(child); continue; }
                if (!entry.name.endsWith('.js')) continue;
                const src = read(child);
                const dir = dirname(child);
                const specs = [
                    ...src.matchAll(/(?:^|[\s;{(])import\s+(?:[^'"]*?from\s+)?['"](\.[^'"]+)['"]/gm),
                    ...src.matchAll(/import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g),
                    ...src.matchAll(/export\s+(?:\*|\{[^}]*\})\s+from\s*['"](\.[^'"]+)['"]/g),
                ];
                for (const m of specs) {
                    const abs = resolve(join(ROOT, dir), m[1]);
                    out.push({ from: child, target: toRepoPath(abs) });
                }
            }
        };
        walk('os');
        return out;
    }

    test('every relative import in os/ resolves to a real file', () => {
        const broken = allLiteralImports()
            .filter(({ target }) => !exists(target))
            .map(({ from, target }) => `${from} -> ${target}`);
        assert.deepEqual(broken, [],
            `imports pointing at files that do not exist: ${broken.join(' | ')}`);
    });

    test('the import scanner actually scans (anti-vacuity)', () => {
        // A regex that matches nothing would make the test above pass on an
        // empty list. Both forms must be reachable, because the defect this
        // was written for was a DYNAMIC import — the form the boot-graph
        // walker deliberately does not follow.
        const all = allLiteralImports();
        assert.ok(all.length > 300, `only ${all.length} import specifiers found — the scanner is broken`);
        assert.ok(all.some((i) => i.from === 'os/apps/pdf/codexSearch.js'),
            'the dynamic-import site this test exists for is no longer being scanned');
        assert.ok(all.some((i) => i.target === 'os/kernel.js'),
            'static imports are no longer being scanned');
    });

    test('the walker actually walks (anti-vacuity)', () => {
        // A broken regex that matches nothing would make the two tests
        // above pass on an empty graph. The boot graph is known to be
        // dozens of modules deep.
        const graph = staticImportGraph(['os/boot-loader.js', 'os/boot.js', 'os/boot-init.js']);
        assert.ok(graph.size > 30, `boot graph suspiciously small: ${graph.size} modules`);
        assert.ok(graph.has('os/kernel.js'), 'kernel.js must be reachable from boot');
        assert.ok(graph.has('os/ui/mobileShell.js'), 'mobileShell.js must be reachable from boot');
    });
});

describe('manifest and locale references resolve', () => {
    const manifest = JSON.parse(read('manifest.json'));

    test('declared icons exist', () => {
        const missing = Object.entries(manifest.icons || {})
            .filter(([, p]) => !exists(p)).map(([s, p]) => `${s}: ${p}`);
        assert.deepEqual(missing, []);
    });

    test('the new-tab override exists', () => {
        const nt = manifest.chrome_url_overrides?.newtab;
        assert.ok(nt && exists(nt), `newtab override missing: ${nt}`);
    });

    test('every __MSG_*__ placeholder is defined in the default locale', () => {
        // An undefined key makes Chrome reject the extension at load time.
        const locale = `_locales/${manifest.default_locale || 'en'}/messages.json`;
        assert.ok(exists(locale), `missing ${locale}`);
        const msgs = JSON.parse(read(locale));
        const missing = [];
        for (const [k, v] of Object.entries(manifest)) {
            if (typeof v !== 'string') continue;
            for (const m of v.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
                if (!msgs[m[1]]) missing.push(`${k} -> ${m[1]}`);
            }
        }
        assert.deepEqual(missing, []);
        for (const [k, entry] of Object.entries(msgs)) {
            assert.ok(entry && entry.message, `locale key "${k}" has no message`);
        }
    });
});

describe('HTML references and attributes', () => {
    const pages = shippedPages();

    test('the page list resolves', () => {
        assert.ok(pages.includes('index.html'), `shipped pages not detected: ${pages.join(', ')}`);
    });

    for (const page of pages) {
        const html = read(page);
        const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

        test(`${page}: no boolean attribute set to a false-ish value`, () => {
            // Same trap as el(): <button disabled="false"> is disabled.
            const hits = [];
            for (const attr of BOOLEAN_ATTRS) {
                for (const m of html.matchAll(new RegExp(`\\s${attr}\\s*=\\s*["']?(false|0)["']?`, 'gi'))) {
                    hits.push(m[0].trim());
                }
            }
            assert.deepEqual(hits, []);
        });

        test(`${page}: no duplicate ids`, () => {
            const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
            assert.deepEqual(dup, [], `getElementById would silently return only the first`);
        });

        test(`${page}: label/aria references point at real ids`, () => {
            const idset = new Set(ids);
            const dangling = [];
            for (const attr of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls']) {
                for (const m of html.matchAll(new RegExp(`\\s${attr}="([^"]+)"`, 'g'))) {
                    for (const ref of m[1].trim().split(/\s+/)) {
                        if (ref && !idset.has(ref)) dangling.push(`${attr}="${ref}"`);
                    }
                }
            }
            assert.deepEqual(dangling, [], 'a dangling reference silently provides no accessible name');
        });

        test(`${page}: local href/src targets exist`, () => {
            const missing = [];
            for (const m of html.matchAll(/(?:href|src)="(\.\/[^"#?]+)(\?[^"]*)?"/g)) {
                const p = m[1].replace(/^\.\//, '');
                if (!exists(p)) missing.push(m[1]);
            }
            assert.deepEqual(missing, []);
        });

        test(`${page}: no inline script or on* handler (MV3 CSP kills them silently)`, () => {
            const inlineScripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/gi)].length;
            const inlineHandlers = [...html.matchAll(/\son[a-z]+\s*=\s*"/gi)].map((m) => m[0].trim());
            assert.equal(inlineScripts, 0, 'inline <script> is blocked in extension pages');
            assert.deepEqual(inlineHandlers, [], 'inline handlers are blocked in extension pages');
        });
    }
});
