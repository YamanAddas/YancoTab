import { kernel } from './kernel.js';
import { VERSION, BUILD, ASSET_VERSION } from './version.js';
import { MobileShell } from './ui/mobileShell.js';
import { initTheme } from './theme/theme.js';
import { initColorTheme } from './theme/themes.js';
import { initStarfield } from './ui/starfield.js';

// Global error handlers to catch any boot-time errors
window.addEventListener('error', (e) => {
  console.error('[Boot] Uncaught Error:', e.error);
  const bootScreen = document.getElementById('boot');
  if (bootScreen) {
    const errEl = document.createElement('div');
    errEl.style.cssText = 'color:red;font-size:11px;position:absolute;bottom:40px;width:100%;text-align:center;';
    errEl.textContent = `Error: ${e.message}`;
    bootScreen.appendChild(errEl);
  }
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Boot] Unhandled Promise Rejection:', e.reason);
  const bootScreen = document.getElementById('boot');
  if (bootScreen) {
    const errEl = document.createElement('div');
    errEl.style.cssText = 'color:orange;font-size:11px;position:absolute;bottom:55px;width:100%;text-align:center;';
    errEl.textContent = `Promise Error: ${e.reason?.message || e.reason}`;
    bootScreen.appendChild(errEl);
  }
});

const nextFrame = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(resolve);
    // Fallback if rAF doesn't fire (background tab / headless)
    setTimeout(() => { cancelAnimationFrame(id); resolve(); }, 50);
  } else {
    setTimeout(resolve, 16);
  }
});

function applyInitialTheme() {
  const mode = localStorage.getItem('yancotab_theme_mode');
  const legacy = localStorage.getItem('yancotab_theme');
  const legacyDark = localStorage.getItem('yancotab_theme_dark');
  const resolved = mode === 'light' || mode === 'dark'
    ? mode
    : legacy === 'light' || legacy === 'dark'
      ? legacy
      : legacyDark === 'false'
        ? 'light'
        : 'dark';
  const isLight = resolved === 'light';
  document.body.classList.toggle('theme-light', isLight);
  document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';
}

async function runBootSmokeCheck(shell) {
  const grid = shell?.components?.grid;
  if (!grid) throw new Error('Startup check failed: AppGrid missing');

  const engine = grid.layoutEngine;
  if (!engine || typeof engine.getCellPosition !== 'function') {
    throw new Error('Startup check failed: layoutEngine.getCellPosition missing');
  }
  if (typeof engine.getGridLocationFromPoint !== 'function') {
    throw new Error('Startup check failed: layoutEngine.getGridLocationFromPoint missing');
  }

  let iconCount = 0;
  for (let i = 0; i < 45; i++) {
    await nextFrame();
    iconCount = grid.pagesContainer?.querySelectorAll('.app-icon, .m-app-item, .m-app-icon, [data-id]').length ?? 0;
    if (iconCount > 0) break;
  }
  const stateItemCount = grid.state?.items?.size ?? 0;
  return {
    ok: !(stateItemCount > 0 && iconCount < 1),
    iconCount,
    stateItemCount,
  };
}

async function boot() {
  initTheme();
  initColorTheme();
  initStarfield();
  // SINGLETON GUARD: Prevent multiple boots
  if (window.__YANCOTAB_BOOTED__) {
    console.warn('[Boot] Prevented duplicate boot!');
    return;
  }
  window.__YANCOTAB_BOOTED__ = true;
  window.__YANCOTAB_VERSION__ = VERSION;
  window.__YANCOTAB_BUILD__ = BUILD;
  window.__YANCOTAB_ASSET_VERSION__ = ASSET_VERSION;
  applyInitialTheme();
  document.title = `YancoTab ${VERSION}`;

  const appShell = document.getElementById("app-shell");
  const bootScreen = document.getElementById("boot");

  // Boot sequence uses logStatus() to update status messages on the boot screen.
  // Additional debug modifications should be removed for production.

  const logStatus = (msg) => {
    console.log(`[Boot] ${msg}`);
    if (bootScreen) {
      const statusEl = bootScreen.querySelector('.boot-status') || document.createElement('div');
      statusEl.className = 'boot-status';
      statusEl.style.position = 'absolute';
      statusEl.style.bottom = '20px';
      statusEl.style.width = '100%';
      statusEl.style.textAlign = 'center';
      statusEl.style.color = 'rgba(255,255,255,0.7)';
      statusEl.style.fontSize = '12px';
      statusEl.textContent = msg;
      if (!bootScreen.contains(statusEl)) bootScreen.appendChild(statusEl);
    }
  };

  logStatus(`Starting YancoTab ${VERSION}...`);

  // --- iOS Zoom Block ---
  document.addEventListener('gesturestart', function (e) {
    e.preventDefault();
  });

  try {
    // 1. Initialize Kernel
    logStatus("Initializing Kernel...");
    await kernel.boot();
    logStatus("Kernel Booted.");

    // 2. Register Apps (lazy-loaded on first launch)
    logStatus("Registering Apps...");
    const pm = kernel.processManager;
    pm.registerLazy('settings',         () => import('./apps/SettingsApp.js').then(m => m.SettingsApp));
    pm.registerLazy('clock',            () => import('./apps/ClockApp.js').then(m => m.ClockApp));
    pm.registerLazy('snake',            () => import('./apps/SnakeApp.js').then(m => m.SnakeApp));
    pm.registerLazy('weather',          () => import('./apps/WeatherApp.js').then(m => m.WeatherApp));
    pm.registerLazy('memory',           () => import('./apps/MemoryApp.js').then(m => m.MemoryApp));
    pm.registerLazy('notes',            () => import('./apps/NotesApp.js').then(m => m.NotesApp));
    pm.registerLazy('browser',          () => import('./apps/BrowserApp.js').then(m => m.BrowserApp));
    pm.registerLazy('calculator',       () => import('./apps/CalculatorApp.js').then(m => m.CalculatorApp));
    pm.registerLazy('files',            () => import('./apps/FilesApp.js').then(m => m.FilesApp));
    pm.registerLazy('tictactoe',        () => import('./apps/TicTacToeApp.js').then(m => m.TicTacToeApp));
    pm.registerLazy('minesweeper',      () => import('./apps/games/MinesweeperApp.js').then(m => m.MinesweeperApp));
    pm.registerLazy('solitaire',        () => import('./apps/games/SolitaireApp.js').then(m => m.SolitaireApp));
    pm.registerLazy('spider-solitaire', () => import('./apps/games/SpiderSolitaireApp.js').then(m => m.SpiderSolitaireApp));
    pm.registerLazy('mahjong',          () => import('./apps/games/MahjongApp.js').then(m => m.MahjongApp));
    pm.registerLazy('tarneeb',          () => import('./apps/games/TarneebApp.js').then(m => m.TarneebApp));
    pm.registerLazy('trix',             () => import('./apps/games/TrixApp.js').then(m => m.TrixApp));
    pm.registerLazy('todo',             () => import('./apps/TodoApp.js').then(m => m.TodoApp));
    pm.registerLazy('maps',             () => import('./apps/MapsApp.js').then(m => m.MapsApp));
    pm.registerLazy('photos',           () => import('./apps/PhotosApp.js').then(m => m.PhotosApp));
    pm.registerLazy('pdf-reader',       () => import('./apps/PdfReaderApp.js').then(m => m.PdfReaderApp));

    // 3. Mount Shell (Mobile-Only Mode - Works on all devices)
    if (appShell) {
      logStatus("Mounting Shell...");
      // Force mobile mode for consistent experience across all devices
      kernel.state.isMobile = true;
      document.body.classList.add('is-mobile');

      console.log('[Boot] Using MobileShell (mobile-only mode)');
      logStatus("Creating MobileShell...");
      const shell = new MobileShell(appShell);
      logStatus("Initializing MobileShell...");
      let shellInitError = null;
      try {
        shell.init();
      } catch (e) {
        shellInitError = e;
        console.error('[Boot] MobileShell.init() warning:', e);
        logStatus(`Startup warning: ${e.message || 'Shell init issue'}`);
      }

      if (!shellInitError) {
        logStatus("Running startup checks...");
        const smoke = await runBootSmokeCheck(shell);
        if (!smoke.ok) {
          console.warn('[Boot] Startup warning: icon render check did not pass in time', smoke);
          logStatus(`Startup warning: UI slow (${smoke.iconCount}/${smoke.stateItemCount})`);
        }
      }
      logStatus(`MobileShell OK (${BUILD})`);
    } else {
      console.error('[Boot] Fatal: #app-shell not found');
      throw new Error("#app-shell not found");
    }

    // 4. Reveal App
    logStatus("Revealing App...");
    const appContainer = document.getElementById("app");
    if (appContainer) {
      appContainer.hidden = false;
    }

    // 5. Cleanup Boot Screen
    logStatus("Done.");
    if (bootScreen) {
      bootScreen.style.transition = 'opacity 0.8s ease-out';
      bootScreen.style.opacity = '0';
      setTimeout(() => bootScreen.remove(), 800);
    }

  } catch (e) {
    console.error('[Boot] Fatal Error:', e);
    if (bootScreen) {
      const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      bootScreen.innerHTML = `<div style="color:red; padding:20px; text-align:center; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); background:rgba(0,0,0,0.8); border-radius:8px;">
                <h2>System Failure</h2>
                <p>${esc(e.message)}</p>
                <small>${esc(e.stack)}</small>
            </div>`;
    }
  }
}

// Start the engine
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
