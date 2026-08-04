#!/usr/bin/env node
/**
 * CWS screenshot capture — the 5 store screenshots at 1280x800.
 *
 *   npm install            (installs puppeteer-core, a devDependency)
 *   npx serve -l 3456 .    (or any static server on :3456)
 *   node scripts/take-screenshots.mjs
 *
 * Uses puppeteer-core against an already-installed Chrome rather than
 * `puppeteer`, so nothing downloads a second 300MB Chromium. Point
 * CHROME_PATH at another binary if the default is wrong.
 *
 * The clock is frozen to a fixed instant before any page script runs, so
 * re-running produces byte-comparable images instead of a different time
 * every capture. It is an *offset*, not a freeze: time still advances at
 * the normal rate, so animations, timers and the Solitaire clock behave.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, access } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'assets', 'store');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3456';
const WIDTH = 1280;
const HEIGHT = 800;

// Wednesday 14:34 — afternoon, so the greeting reads "Good afternoon".
const FROZEN_ISO = '2026-05-06T14:34:07';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    try { await access(p); return p; } catch { /* keep looking */ }
  }
  throw new Error(`No Chrome found. Set CHROME_PATH. Tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
}

/** Freeze the wall clock to a fixed offset, before app code reads it. */
async function freezeClock(page) {
  await page.evaluateOnNewDocument((iso) => {
    const target = new Date(iso).getTime();
    const boot = Date.now();
    const delta = target - boot;
    const RealDate = Date;
    const shifted = () => new RealDate(RealDate.now() + delta);
    // eslint-disable-next-line no-global-assign
    Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [RealDate.now() + delta])); }
      static now() { return RealDate.now() + delta; }
    };
    Date.parse = RealDate.parse;
    Date.UTC = RealDate.UTC;
    window.__shiftedNow = shifted;
  }, FROZEN_ISO);
}

/** Sample content so the apps look alive rather than empty. */
async function seedData(page) {
  await page.evaluate(() => {
    const e = (d, v = 1) => JSON.stringify({ data: d, version: v, ts: Date.now(), seq: 99, deviceId: 'shot' });

    localStorage.setItem('yancotab_user_name', e('Yaman'));
    localStorage.setItem('yancotab_onboarding_done', e(true));
    localStorage.setItem('yancotab_theme_mode', e('dark'));
    localStorage.setItem('yancotab_starfield_enabled', e(true));
    // No wallpaper key → the default (emerald) applies, which is what a new
    // user actually sees.

    localStorage.setItem('yancotab_widgets', e({
      clock: false, weather: true, todo: true, pomodoro: true, activity: true,
    }));

    // Todo — drives the Today widget and the Todo icon's count badge.
    localStorage.setItem('yancotab_todo_v2', e({
      missions: [{
        id: 'm_default', name: 'My Tasks', color: 'accent', position: 1000,
        tasks: [
          ['Review the store listing copy', false],
          ['Finish the privacy policy page', false],
          ['Ship the v1.5 wallpapers', false],
          ['Fix the OCR extraction bug', true],
        ].map(([text, done], i) => ({
          id: 't_' + i, text, done, priority: 'normal', recurring: false,
          dueAt: null, completedAt: done ? new Date().toISOString() : null,
          position: (i + 1) * 1000,
        })),
      }],
      activeMissionId: 'm_default', streakLog: {}, version: 2,
    }, 2));

    // An armed alarm puts the amber dot on the Clock icon.
    localStorage.setItem('yancotab_clock_v3', e({
      use24h: false,
      alarms: [{ time: '07:00', enabled: true, days: [1, 2, 3, 4, 5], label: 'Morning' }],
    }));

    // ── Notes (virtual filesystem) ──
    const fsWrite = (path, content) => localStorage.setItem('yancotab:fs:' + path, JSON.stringify({
      type: 'file', path, content,
      meta: { created: Date.now() - 86400000, modified: Date.now() - 3600000 },
    }));
    const fsDir = (path) => localStorage.setItem('yancotab:fs:' + path, JSON.stringify({
      type: 'directory', path, meta: { created: Date.now() - 86400000 * 7 },
    }));
    ['/home', '/home/documents', '/home/downloads', '/home/photos', '/home/trash'].forEach(fsDir);

    // Tags come from #hashtags in the note BODY — the metadata `tags` field
    // does not populate the constellation rail.
    fsWrite('/home/documents/Project Meeting Notes.txt',
      'Sprint Planning — Week 19  #work #planning\n\nAttendees: Yaman, Sarah, Alex\n\n'
      + 'Key Decisions\n• Launch date moved to June 15\n'
      + '• Performance budget: under 200ms new-tab load\n'
      + '• Privacy audit scheduled for next week\n\n'
      + 'Action Items\n☐ Review store listing copy\n☐ Finalise screenshot designs\n'
      + '☑ Complete storage migration\n☑ Fix OCR text extraction\n\n'
      + 'Notes\nThe team agreed to favour polish over new features this cycle.\n'
      + 'All built-in apps now share the cosmic theme.\n\nNext meeting: Monday, 2pm');
    fsWrite('/home/documents/Reading List.txt',
      'Books for the summer  #reading #personal\n\n1. Designing Data-Intensive Applications\n'
      + '2. The Design of Everyday Things\n3. Thinking, Fast and Slow\n\n'
      + 'Podcasts\n- Syntax.fm — web development\n- Darknet Diaries — security stories');
    fsWrite('/home/documents/Recipe Ideas.txt',
      'Homemade Chicken Shawarma  #food #recipes\n\nIngredients\n- 1 kg chicken thighs\n'
      + '- Shawarma spice blend\n- Pickled turnips, tahini\n- Fresh pita\n\n'
      + 'Marinate overnight for best results.');
    fsWrite('/home/documents/Quick Ideas.txt',
      'Feature ideas  #ideas #product\n- Dark mode scheduling\n- Custom dock shortcuts\n'
      + '- Drag-and-drop file import\n- Voice memos');

    localStorage.setItem('yancotab_notes_meta_v2', e({
      '/home/documents/Project Meeting Notes.txt': { title: 'Project Meeting Notes', pinned: true, tags: ['work'], created: Date.now() - 86400000 * 3, modified: Date.now() - 3600000 },
      '/home/documents/Reading List.txt': { title: 'Reading List', pinned: false, tags: ['personal'], created: Date.now() - 86400000 * 7, modified: Date.now() - 86400000 },
      '/home/documents/Recipe Ideas.txt': { title: 'Recipe Ideas', pinned: false, tags: ['food'], created: Date.now() - 86400000 * 14, modified: Date.now() - 86400000 * 5 },
      '/home/documents/Quick Ideas.txt': { title: 'Quick Ideas', pinned: false, tags: ['ideas'], created: Date.now() - 86400000 * 2, modified: Date.now() - 86400000 },
    }));

    // ── Weather ──
    // Only the location is seeded; the forecast itself is fetched live from
    // Open-Meteo so the screenshot shows real numbers rather than invented
    // ones. Note the real shapes: state holds a `locations` array (not a flat
    // lat/lon/city), and the cache is a map keyed by query (not one entry).
    // Seeding those wrongly silently falls back to "CURRENT LOCATION".
    localStorage.setItem('yancotabWeatherState', e({
      locations: [{ id: 'loc_london', label: 'London', query: 'London', lat: 51.5074, lon: -0.1278 }],
      unit: 'c', expanded: true, effectsEnabled: true, refreshMins: 30,
    }));
  });
}

async function setup(page) {
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await freezeClock(page);
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(1200);
  await seedData(page);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(3000);

  await page.evaluate(() => {
    // `background-attachment: fixed` is measured against the viewport, which
    // the screenshot clip does not always agree with — pin it for capture.
    const shell = document.getElementById('app-shell');
    if (shell) shell.style.backgroundAttachment = 'scroll';
  });
  await sleep(400);
}

async function shoot(page, name) {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`Invalid screenshot name: ${name}`);
  const path = join(OUT_DIR, `${name}.png`); // nosemgrep: path-join-resolve-traversal — validated above
  await page.screenshot({ path, type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  console.log(`  saved ${name}.png`);
}

const openApp = async (page, id) => {
  await page.evaluate((a) => import('/os/kernel.js').then((m) => m.kernel.emit('app:open', a)), id);
  await sleep(2600);
};
const maximize = async (page) => {
  await page.evaluate(() => document.querySelector('.window-chrome__btn-fullscreen')?.click());
  // The Ko-fi badge fades out on `body.in-app`; shooting too early catches
  // it half-faded, bleeding through the maximised titlebar.
  await sleep(1600);
};
const closeApp = async (page) => {
  await page.evaluate(() => document.querySelector('.window-chrome__btn-close')?.click());
  await sleep(800);
};

/** Fail loudly rather than shipping a screenshot of an empty app. */
async function expect(page, selector, label) {
  const ok = await page.evaluate((s) => !!document.querySelector(s), selector);
  if (!ok) throw new Error(`${label}: expected "${selector}" to be present — the shot would be wrong`);
  console.log(`  ok  ${label}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const executablePath = await findChrome();
  console.log(`Chrome: ${executablePath}`);

  const browser = await puppeteer.launch({
    executablePath, headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-device-scale-factor=1',
      '--hide-scrollbars', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.warn('  page error:', err.message));

  try {
    await setup(page);

    console.log('1/5 home');
    await expect(page, '.app-label', 'app grid rendered');
    await expect(page, '.app-dock-tile', 'dock rendered');
    await expect(page, '.smart-badge', 'live badges rendered');
    await shoot(page, 'screenshot-1-home');

    console.log('2/5 notes');
    await openApp(page, 'notes');
    await maximize(page);
    await sleep(900);
    // Notes is the "constellation" library — a star map of notes plus a
    // filter rail. Opening a note does NOT float a window over it: the
    // editor replaces the library inside the same window (the root gains
    // `is-ed`), so the two cannot share a frame. The library is captured
    // because it is the distinctive view; the editor is a text pane that
    // would look like any other editor.
    await expect(page, '.nc-frame', 'notes library rendered');
    // Cosmos (the star map) rather than the plain List view — it is the
    // distinctive thing about this app and shows the tag rail populated.
    await page.evaluate(() => [...document.querySelectorAll('.nc-tab')]
      .find((t) => /cosmos/i.test(t.textContent || ''))?.click());
    await sleep(1500);
    const noteCount = await page.evaluate(() =>
      document.querySelectorAll('.nc-star').length);
    if (noteCount < 4) throw new Error(`only ${noteCount} notes rendered — seeding did not take`);
    const tagCount = await page.evaluate(() =>
      [...document.querySelectorAll('.nc-side-item-label')].filter((e) => !/^[★⏱✓⚡🗑]/.test(e.textContent)).length);
    if (tagCount < 4) throw new Error(`only ${tagCount} tags — hashtags did not parse from note bodies`);
    console.log(`  ok  ${noteCount} notes, ${tagCount} tags`);
    await shoot(page, 'screenshot-2-notes');
    await closeApp(page);

    console.log('3/5 solitaire');
    await openApp(page, 'solitaire');
    // Two buttons read "New Game": the toolbar's `New Game ▾`, which only
    // opens a deal-type dropdown, and the start screen's, which deals
    // immediately. Target the start screen one explicitly.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.cosmic-start-btn')]
        .find((x) => /^new game$/i.test((x.textContent || '').trim()));
      if (b) b.click();
    });
    await sleep(2600);
    const cards = await page.evaluate(() => document.querySelectorAll('.cosmic-card').length);
    if (cards < 40) throw new Error(`solitaire shows ${cards} cards — the deal did not start`);
    console.log(`  ok  ${cards} cards dealt`);
    // Turn a few stock cards so the waste pile is not empty in the shot.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => document.querySelector('.cosmic-pile-slot.kind-stock')?.click());
      await sleep(420);
    }
    await shoot(page, 'screenshot-3-solitaire');
    await closeApp(page);

    console.log('4/5 weather');
    await openApp(page, 'weather');
    await maximize(page);
    await sleep(5000);            // live fetch
    await expect(page, '.weather-shell, [class*="weather"]', 'weather rendered');
    const gotCity = await page.evaluate(() => /London/i.test(document.body.innerText));
    if (!gotCity) throw new Error('weather did not resolve London — check the network or state shape');
    console.log('  ok  London forecast loaded');
    await shoot(page, 'screenshot-4-weather');
    await closeApp(page);

    console.log('5/5 settings');
    await openApp(page, 'settings');
    await maximize(page);
    await sleep(1800);
    await shoot(page, 'screenshot-5-settings');
    await closeApp(page);

    console.log(`\nDone — ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error('FAILED:', err.message); process.exitCode = 1; });
