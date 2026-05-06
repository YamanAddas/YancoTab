#!/usr/bin/env node
/**
 * CWS Screenshot Capture Script
 * Takes 5 Chrome Web Store screenshots at 1280x800 from the local dev server.
 * Usage: npm i -D puppeteer && node scripts/take-screenshots.mjs
 */
import puppeteer from 'puppeteer';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'assets', 'store');
const BASE_URL = 'http://localhost:3456';
const WIDTH = 1280;
const HEIGHT = 800;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function envelope(data) {
  return JSON.stringify({ data, version: 1, ts: Date.now(), seq: 99, deviceId: 'screenshot' });
}

/** Pre-populate storage with sample data for attractive screenshots */
async function seedData(page) {
  await page.evaluate((env) => {
    const e = (d) => JSON.stringify({ data: d, version: 1, ts: Date.now(), seq: 99, deviceId: 'screenshot' });

    // ── User & prefs ──
    localStorage.setItem('yancotab_user_name', e('Yaman'));
    localStorage.setItem('yancotab_onboarding_done', e(true));
    localStorage.setItem('yancotab_wallpaper', 'url("assets/wallpapers/deep-blue.webp")');
    localStorage.setItem('yancotab_theme_mode', e('dark'));
    localStorage.setItem('yancotab_starfield_enabled', e(true));

    // ── Notes filesystem (prefix yancotab:fs:) ──
    function fsWrite(path, content) {
      localStorage.setItem('yancotab:fs:' + path, JSON.stringify({
        type: 'file', path, content,
        meta: { created: Date.now() - 86400000, modified: Date.now() - 3600000 }
      }));
    }
    function fsDir(path) {
      localStorage.setItem('yancotab:fs:' + path, JSON.stringify({
        type: 'directory', path, meta: { created: Date.now() - 86400000 * 7 }
      }));
    }
    fsDir('/home');
    fsDir('/home/documents');
    fsDir('/home/downloads');
    fsDir('/home/photos');
    fsDir('/home/trash');

    // Notes use .txt extension in /home/documents/ (not a notes subfolder)
    fsWrite('/home/documents/Project Meeting Notes.txt',
      `Sprint Planning — Week 19\n\nAttendees: Yaman, Sarah, Alex, Dev Team\n\nKey Decisions\n• Launch date moved to June 15\n• Performance budget: < 200ms new tab load\n• Privacy audit scheduled for next week\n\nAction Items\n☐ Review store listing copy\n☐ Finalize screenshot designs\n☑ Complete storage migration\n☑ Fix OCR text extraction bug\n\nNotes\nThe team agreed to focus on polish over new features.\nWidget bar deferred to v2.5. All 18 apps are fully\nplayable with the cosmic theme rewrite complete.\n\nNext Meeting: Monday 2pm`);

    fsWrite('/home/documents/Reading List.txt',
      `Books to read this summer:\n\n1. Designing Data-Intensive Applications\n2. The Design of Everyday Things\n3. Thinking, Fast and Slow\n\nPodcasts:\n- Syntax.fm — Web development\n- Darknet Diaries — Security stories`);

    fsWrite('/home/documents/Recipe Ideas.txt',
      `Homemade Chicken Shawarma\n\nIngredients:\n- 1 kg chicken thighs\n- Shawarma spice blend\n- Pickled turnips, tahini sauce\n- Fresh pita bread\n\nMarinate overnight for best results.`);

    fsWrite('/home/documents/Quick Ideas.txt',
      `Feature ideas:\n- Dark mode scheduling\n- Custom app shortcuts on dock\n- Drag-and-drop file import\n- Voice memo recording`);

    // Notes metadata keyed by filesystem path
    localStorage.setItem('yancotab_notes_meta_v2', e({
      '/home/documents/Project Meeting Notes.txt': {
        title: 'Project Meeting Notes', pinned: true, tags: ['work'],
        created: Date.now() - 86400000 * 3, modified: Date.now() - 3600000
      },
      '/home/documents/Reading List.txt': {
        title: 'Reading List', pinned: false, tags: ['personal'],
        created: Date.now() - 86400000 * 7, modified: Date.now() - 86400000
      },
      '/home/documents/Recipe Ideas.txt': {
        title: 'Recipe Ideas', pinned: false, tags: ['food'],
        created: Date.now() - 86400000 * 14, modified: Date.now() - 86400000 * 5
      },
      '/home/documents/Quick Ideas.txt': {
        title: 'Quick Ideas', pinned: false, tags: ['ideas'],
        created: Date.now() - 86400000 * 2, modified: Date.now() - 86400000
      }
    }));

    // ── Weather cache (so Weather app renders fully) ──
    localStorage.setItem('yancotabWeatherState', e({
      lat: 24.71, lon: 46.67, city: 'Riyadh', country: 'SA', unit: 'C'
    }));
    localStorage.setItem('yancotabWeatherCacheV2', e({
      ts: Date.now(),
      data: {
        current: { temp: 27, feelsLike: 30, humidity: 35, wind: 12, uv: 7,
          code: 2, desc: 'Partly Cloudy', isDay: true, pressure: 1013, visibility: 10 },
        hourly: Array.from({ length: 24 }, (_, i) => ({
          time: new Date(Date.now() + i * 3600000).toISOString(),
          temp: 22 + Math.round(Math.sin(i / 4) * 8),
          code: i < 6 ? 0 : i < 18 ? 2 : 1,
          isDay: i >= 6 && i < 18
        })),
        daily: Array.from({ length: 10 }, (_, i) => ({
          date: new Date(Date.now() + i * 86400000).toISOString().slice(0, 10),
          tempMax: 32 + Math.round(Math.random() * 5),
          tempMin: 20 + Math.round(Math.random() * 4),
          code: [0, 1, 2, 3, 1, 0, 2, 1, 3, 0][i],
          precip: [0, 0, 10, 30, 5, 0, 15, 0, 25, 0][i],
          uvMax: [8, 7, 6, 5, 7, 8, 6, 7, 5, 8][i],
          sunrise: '05:30', sunset: '18:45'
        })),
        aqi: { index: 42, label: 'Good', pm25: 8.2, pm10: 15.1, o3: 38 }
      }
    }));
  });
}

async function setupPage(page) {
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 15000 });
  await sleep(1500);

  await seedData(page);

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(3000);

  // Cosmetic fixes for screenshot
  await page.evaluate(() => {
    const gt = document.querySelector('.greeting-text');
    const gs = document.querySelector('.greeting-sub');
    const gtime = document.querySelector('.greeting-time');
    if (gt) gt.textContent = 'Good afternoon, Yaman';
    if (gs) gs.textContent = 'Monday, May 5';
    if (gtime) gtime.textContent = '2:34 PM';
    document.body.style.backgroundColor = '#060b14';
    document.documentElement.style.backgroundColor = '#060b14';
    const shell = document.getElementById('app-shell');
    if (shell) shell.style.backgroundAttachment = 'scroll';
  });
  await sleep(500);
}

async function takeScreenshot(page, name) {
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  console.log(`  ✓ ${name}.png saved`);
}

async function openApp(page, appId) {
  await page.evaluate((id) => import('/os/kernel.js').then(m => m.kernel.emit('app:open', id)), appId);
  await sleep(2500);
}

async function maximizeWindow(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('.window-chrome__btn-fullscreen');
    if (btn) btn.click();
  });
  await sleep(500);
}

async function closeApp(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('.window-chrome__btn-close');
    if (btn) btn.click();
  });
  await sleep(600);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log('Launching browser...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  try {
    await setupPage(page);

    // ── 1/5: Home Screen ──
    console.log('1/5 Home Screen...');
    await takeScreenshot(page, 'screenshot-1-home');

    // ── 2/5: Notes App ──
    console.log('2/5 Notes App...');
    await openApp(page, 'notes');
    await sleep(1000);
    // Use Puppeteer's native click on the first note card
    const noteCard = await page.$('.notes-doc-card');
    if (noteCard) {
      await noteCard.click({ clickCount: 2 }); // native double-click
      console.log('  Double-clicked note card natively');
    } else {
      console.log('  No note card found, clicking +New');
      const newBtn = await page.$('.notes-bw-new-btn');
      if (newBtn) await newBtn.click();
    }
    await sleep(2000);
    // Verify editor opened
    const notesState = await page.evaluate(() => {
      const editor = document.querySelector('.notes-editor-root');
      const textarea = document.querySelector('.notes-ed-body');
      return {
        editorExists: !!editor,
        textareaExists: !!textarea,
        textareaValue: textarea?.value?.substring(0, 80)
      };
    });
    console.log('  Notes state:', JSON.stringify(notesState));
    await takeScreenshot(page, 'screenshot-2-notes');
    await closeApp(page);

    // ── 3/5: Solitaire ──
    console.log('3/5 Solitaire...');
    await openApp(page, 'solitaire');
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      const ng = Array.from(btns).find(b => b.textContent?.trim() === 'New Game');
      if (ng) ng.click();
    });
    await sleep(2500);
    // Draw a few cards for visual interest
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const stock = document.querySelector('[data-pile="stock"]');
        if (stock) stock.click();
      });
      await sleep(400);
    }
    await takeScreenshot(page, 'screenshot-3-solitaire');
    await closeApp(page);

    // ── 4/5: Weather ──
    console.log('4/5 Weather...');
    await openApp(page, 'weather');
    await sleep(1000);
    await maximizeWindow(page);
    await sleep(3000); // weather needs time to render forecast
    // Log weather state
    const weatherState = await page.evaluate(() => {
      const content = document.querySelector('.weather-content');
      const shell = document.querySelector('.weather-shell');
      const chrome = document.querySelector('.window-chrome');
      const rect = chrome?.getBoundingClientRect();
      const cols = content ? content.querySelectorAll('.weather-column') : [];
      return {
        hasShell: !!shell,
        hasContent: !!content,
        colCount: cols.length,
        chromeW: rect?.width, chromeH: rect?.height,
        shellHTML: shell?.innerHTML?.substring(0, 200)
      };
    });
    console.log('  Weather state:', JSON.stringify(weatherState));
    await takeScreenshot(page, 'screenshot-4-weather');
    await closeApp(page);

    // ── 5/5: Settings ──
    console.log('5/5 Settings...');
    await openApp(page, 'settings');
    await maximizeWindow(page);
    await sleep(1500);
    // Log settings state
    const settingsState = await page.evaluate(() => {
      const wallpapers = document.querySelectorAll('.ys-wallpaper, [class*="wallpaper"]');
      const sections = document.querySelectorAll('.ys-section, [class*="section"]');
      return {
        wallpaperCount: wallpapers.length,
        sectionCount: sections.length,
        sectionNames: Array.from(sections).map(s => s.querySelector('h3, h2, .ys-section-title')?.textContent).slice(0, 5)
      };
    });
    console.log('  Settings state:', JSON.stringify(settingsState));
    await takeScreenshot(page, 'screenshot-5-settings');
    await closeApp(page);

    console.log(`\nAll 5 screenshots saved to ${OUT_DIR}`);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    await browser.close();
  }
}

main();
