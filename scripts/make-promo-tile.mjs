#!/usr/bin/env node
/**
 * CWS promotional tile — the required 440x280 small tile.
 *
 *   npm install            (installs puppeteer-core, a devDependency)
 *   node serve.mjs         (or any static server on :3456)
 *   node scripts/make-promo-tile.mjs
 *
 * promo-tile-generator.html draws the tile into a <canvas> and has a
 * Download button. That made regenerating it a manual step — open the
 * page, click, move the file — which is why the CHANGELOG carried it as
 * an outstanding chore across several releases. The drawing code stays
 * where it is (it is also a live preview); this script just drives it
 * and writes the PNG to its final home.
 *
 * Same approach as take-screenshots.mjs: puppeteer-core against an
 * already-installed Chrome, so nothing downloads a second Chromium.
 */
import puppeteer from 'puppeteer-core';
import { writeFile, access } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'assets', 'store', 'promo-tile-440x280.png');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3456';
const W = 440;
const H = 280;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

async function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    try { await access(p); return p; } catch { /* keep looking */ }
  }
  throw new Error(`No Chrome found. Set CHROME_PATH. Tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
}

const browser = await puppeteer.launch({
  executablePath: await findChrome(),
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => { throw new Error(`generator threw: ${e.message}`); });

  const res = await page.goto(`${BASE_URL}/promo-tile-generator.html`, { waitUntil: 'networkidle0' });
  if (!res || !res.ok()) throw new Error(`generator page returned ${res && res.status()}`);

  // The canvas is painted from the logo's onload, so waiting on the load
  // event is not enough — wait for actual pixels. Assert rather than
  // sleep: a missing logo used to leave a permanently blank canvas with
  // nothing in the console to say so.
  await page.waitForFunction(() => {
    const c = document.getElementById('promo');
    if (!c) return false;
    const d = c.getContext('2d').getImageData(135, 140, 1, 1).data;
    return d[1] > 100; // the logo is green; the background there is not
  }, { timeout: 10_000 });

  const { width, height, corners, dataUrl } = await page.evaluate(() => {
    const c = document.getElementById('promo');
    const ctx = c.getContext('2d');
    const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    return {
      width: c.width,
      height: c.height,
      corners: {
        tl: px(0, 0), tr: px(c.width - 1, 0),
        bl: px(0, c.height - 1), br: px(c.width - 1, c.height - 1),
      },
      dataUrl: c.toDataURL('image/png'),
    };
  });

  if (width !== W || height !== H) throw new Error(`canvas is ${width}x${height}, expected ${W}x${H}`);

  // The store crops rounded corners, and a white border reads as broken
  // against the white listing background — so every corner must be opaque
  // and dark. Asserted rather than eyeballed: a transparent corner is
  // invisible in a preview on a dark page and obvious in the listing.
  for (const [name, [r, g, b, a]] of Object.entries(corners)) {
    if (a !== 255) throw new Error(`corner ${name} is transparent (alpha ${a})`);
    if (r > 60 && g > 60 && b > 60) throw new Error(`corner ${name} is light (${r},${g},${b}) — reads as a border`);
  }

  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  // The store crops rounded corners and a white border reads as broken on
  // the white listing background, so the tile must be full-bleed. Cheap
  // sanity check that we did not capture a transparent or empty canvas.
  if (png.length < 5_000) throw new Error(`tile is only ${png.length} bytes — canvas was probably blank`);

  await writeFile(OUT, png);
  console.log(`✓ ${OUT}  ${width}x${height}  ${(png.length / 1024).toFixed(0)} KB`);
} finally {
  await browser.close();
}
