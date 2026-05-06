/**
 * YancoTab Theme Definitions (v1.0)
 * Each theme defines a wallpaper + accent color palette.
 * Applied via CSS custom properties on :root.
 */

export const THEMES = {
  emerald: {
    name: 'Emerald',
    wallpaper: 'url("assets/wallpapers/emerald.webp")',
    accent: '#00e5c1',
    accentRgb: '0, 229, 193',
    accentBright: '#33ffdd',
  },
  obsidian: {
    name: 'Obsidian',
    wallpaper: 'url("assets/wallpapers/obsidian.webp")',
    accent: '#a8b2c1',
    accentRgb: '168, 178, 193',
    accentBright: '#c8d2e1',
  },
  sapphire: {
    name: 'Sapphire',
    wallpaper: 'url("assets/wallpapers/sapphire.webp")',
    accent: '#4d9fff',
    accentRgb: '77, 159, 255',
    accentBright: '#7ab8ff',
  },
  amethyst: {
    name: 'Amethyst',
    wallpaper: 'url("assets/wallpapers/amethyst.webp")',
    accent: '#b57aff',
    accentRgb: '181, 122, 255',
    accentBright: '#cc9eff',
  },
  rose: {
    name: 'Rose',
    wallpaper: 'url("assets/wallpapers/rose.webp")',
    accent: '#ff6b9d',
    accentRgb: '255, 107, 157',
    accentBright: '#ff8fb8',
  },
  arctic: {
    name: 'Arctic',
    wallpaper: 'url("assets/wallpapers/arctic.webp")',
    accent: '#64d2ff',
    accentRgb: '100, 210, 255',
    accentBright: '#8ae0ff',
  },
  sunset: {
    name: 'Sunset',
    wallpaper: 'url("assets/wallpapers/sunset.webp")',
    accent: '#ff9f43',
    accentRgb: '255, 159, 67',
    accentBright: '#ffb86c',
  },
  crimson: {
    name: 'Crimson',
    wallpaper: 'url("assets/wallpapers/crimson.webp")',
    accent: '#ff4757',
    accentRgb: '255, 71, 87',
    accentBright: '#ff6b7a',
  },
};

/** Default theme ID */
export const DEFAULT_THEME = 'emerald';

const THEME_KEY = 'yancotab_color_theme';

/**
 * Compute relative luminance of an RGB color (0-1 scale).
 * Per WCAG 2.0 formula.
 */
function luminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Return a dark or light text color for readable contrast on the given accent.
 */
function contrastText(accentRgbStr) {
  const [r, g, b] = accentRgbStr.split(',').map(s => parseInt(s.trim(), 10));
  const lum = luminance(r, g, b);
  // If accent is bright (lum > 0.35), use dark text; otherwise light text
  return lum > 0.35 ? '#0a0f1a' : '#f0f4f8';
}

/**
 * Apply a color theme by ID. Sets CSS custom properties on :root
 * and persists the choice.
 *
 * Light-mode override: inline :root styles beat body.theme-light cascade,
 * so we pin the accent to system blue (#007AFF) when the user is in light
 * mode regardless of which color theme they picked. Color themes resume
 * their selected accent in dark mode.
 */
export function applyColorTheme(themeId) {
  const theme = THEMES[themeId] || THEMES[DEFAULT_THEME];
  const root = document.documentElement;
  const isLight = typeof document !== 'undefined'
    && document.body
    && document.body.classList.contains('theme-light');

  // Light mode pins accent to blue for WCAG-AA contrast on white surfaces.
  // Dark mode uses the picked theme's accent (which is tuned for dark bg).
  const accent       = isLight ? '#007AFF' : theme.accent;
  const accentRgb    = isLight ? '0, 122, 255' : theme.accentRgb;
  const accentBright = isLight ? '#0A84FF' : theme.accentBright;

  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-rgb', accentRgb);
  root.style.setProperty('--accent-bright', accentBright);
  root.style.setProperty('--accent-contrast', contrastText(accentRgb));
  root.style.setProperty('--accent-dim', `rgba(${accentRgb}, 0.25)`);
  root.style.setProperty('--accent-glow', `rgba(${accentRgb}, 0.35)`);
  root.style.setProperty('--accent-bg', `rgba(${accentRgb}, 0.08)`);
  root.style.setProperty('--accent-subtle', `rgba(${accentRgb}, 0.04)`);

  // Glow overrides — softer in light mode
  if (isLight) {
    root.style.setProperty('--glow-sm', `0 0 15px rgba(${accentRgb}, 0.10), 0 2px 8px rgba(0, 0, 0, 0.06)`);
    root.style.setProperty('--glow-md', `0 0 24px rgba(${accentRgb}, 0.10), 0 4px 12px rgba(0, 0, 0, 0.08)`);
  } else {
    root.style.setProperty('--glow-sm', `0 0 15px rgba(${accentRgb}, 0.15), 0 0 30px rgba(${accentRgb}, 0.05)`);
    root.style.setProperty('--glow-md', `0 0 30px rgba(${accentRgb}, 0.12), 0 8px 32px rgba(0, 0, 0, 0.4)`);
  }

  // Border accent
  root.style.setProperty('--border-accent', `rgba(${accentRgb}, 0.08)`);

  // The user's color-theme choice is always persisted (even though light mode
  // overrides the visible accent). When they flip back to dark, the chosen
  // color theme reasserts itself.
  localStorage.setItem(THEME_KEY, themeId);
}

/**
 * Apply wallpaper to the shell element.
 */
export function applyWallpaper(themeId) {
  const theme = THEMES[themeId] || THEMES[DEFAULT_THEME];
  const shell = document.getElementById('app-shell') || document.body;

  shell.classList.remove('cosmic-wallpaper');
  shell.style.background = theme.wallpaper;
  shell.style.backgroundSize = 'cover';
  shell.style.backgroundPosition = 'center';
}

/**
 * Get saved theme ID or default.
 */
export function getSavedTheme() {
  return localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
}

/**
 * Initialize theme on boot — restore saved color theme + wallpaper.
 */
export function initColorTheme() {
  try {
    const saved = getSavedTheme();
    applyColorTheme(saved);

    // Restore wallpaper (special modes handled separately)
    const savedWp = localStorage.getItem('yancotab_wallpaper') || '';
    if (savedWp === 'cosmic' || savedWp === 'starfield') {
      // Special modes — don't change wallpaper, boot.js / starfield.js handles it
      return;
    }
    if (saved !== DEFAULT_THEME && THEMES[saved]) {
      // Apply the theme's wallpaper (overrides CSS default)
      applyWallpaper(saved);
    }
  } catch {
    // Fallback — emerald defaults are in CSS already
  }
}
