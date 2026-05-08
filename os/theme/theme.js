// YancoTab Theme Service (v1.0.0)
// Single source of truth for light/dark mode.
// Three modes: 'dark', 'light', 'auto' (follows OS prefers-color-scheme).
// Applies a body class and sets color-scheme so built-in controls render correctly.

import { kernel } from '../kernel.js';

const THEME_MODE_KEY = 'yancotab_theme_mode';
const LEGACY_THEME_KEY = 'yancotab_theme';
const LEGACY_THEME_DARK_KEY = 'yancotab_theme_dark';
export const THEME_CHANGE_EVENT = 'yancotab:theme_change';

let _osMql = null;

/**
 * Read a value from localStorage, transparently unwrapping AppStorage's
 * envelope shape `{data, version, ts, ...}` if present. Falls back to
 * the raw string for legacy values written before the envelope existed.
 *
 * Theme has to cope with both shapes because the boot path writes raw
 * (no kernel yet) but `kernel.storage.save` (used for cross-device
 * sync) wraps the next write in an envelope.
 */
function readMaybeWrapped(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.data === 'string') return parsed.data;
      if (typeof parsed === 'string') return parsed;
    } catch { /* not JSON — fall through */ }
    return raw;
  } catch { return null; }
}

/**
 * Persist mode dual-write:
 *   1. Raw localStorage so boot.js can read synchronously before the
 *      kernel singleton is constructed (FOUC prevention).
 *   2. kernel.storage when available — replicates to chrome.storage.sync
 *      so the theme follows the user across devices.
 * The kernel.storage write wraps the value in an envelope, so the next
 * raw read sees envelope JSON; readMaybeWrapped() handles both shapes.
 */
function persistMode(value) {
  try { localStorage.setItem(THEME_MODE_KEY, value); } catch { /* ignore */ }
  try { kernel?.storage?.save?.(THEME_MODE_KEY, value); } catch { /* ignore */ }
}

/**
 * Returns the user's stored preference: 'light' | 'dark' | 'auto' | null.
 * Distinguishes "auto" (follow OS) from "no choice yet" (legacy migration).
 */
export function getStoredMode() {
  const mode = readMaybeWrapped(THEME_MODE_KEY);
  if (mode === 'light' || mode === 'dark' || mode === 'auto') return mode;

  const legacy = readMaybeWrapped(LEGACY_THEME_KEY);
  if (legacy === 'light' || legacy === 'dark') return legacy;

  const legacyDark = readMaybeWrapped(LEGACY_THEME_DARK_KEY);
  if (legacyDark === 'true') return 'dark';
  if (legacyDark === 'false') return 'light';

  return null;
}

/**
 * Returns the concrete mode to apply: 'light' | 'dark'.
 * Resolves 'auto' (and missing) to OS preference.
 */
export function getThemeMode() {
  const stored = getStoredMode();
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersLight() ? 'light' : 'dark';
}

function prefersLight() {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

/**
 * Apply the given mode. Accepts 'light' | 'dark' | 'auto'.
 * Persists the user's choice. 'auto' follows OS until they pick a fixed mode.
 */
export function applyThemeMode(mode) {
  let effective;
  if (mode === 'auto') {
    persistMode('auto');
    effective = prefersLight() ? 'light' : 'dark';
  } else {
    effective = mode === 'light' ? 'light' : 'dark';
    persistMode(effective);
    // Legacy keys stay raw (not in AppStorage REGISTRY) — back-compat
    // shims for older versions of the extension reading these names.
    try {
      localStorage.setItem(LEGACY_THEME_KEY, effective);
      localStorage.setItem(LEGACY_THEME_DARK_KEY, String(effective === 'dark'));
    } catch { /* ignore */ }
  }

  const isLight = effective === 'light';
  document.body.classList.toggle('theme-light', isLight);
  document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';

  // Re-apply current color theme so accent picks up light-mode override
  // (themes.js writes inline :root accents which beat body.theme-light cascade)
  import('./themes.js').then(({ applyColorTheme, getSavedTheme }) => {
    applyColorTheme(getSavedTheme());
  }).catch(() => { /* themes.js optional */ });

  try {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, {
      detail: { mode: effective, stored: mode },
    }));
  } catch { /* CustomEvent unsupported in some contexts (tests) */ }
}

export function initTheme() {
  try {
    applyThemeMode(getStoredMode() || 'auto');

    // Subscribe to OS theme changes; only honor when user is on 'auto'
    _osMql = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e) => {
      const stored = getStoredMode();
      if (stored !== 'auto' && stored !== null) return;
      const isLight = e.matches;
      document.body.classList.toggle('theme-light', isLight);
      document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';
      // Re-pin accent for light-mode override
      import('./themes.js').then(({ applyColorTheme, getSavedTheme }) => {
        applyColorTheme(getSavedTheme());
      }).catch(() => {});
      try {
        window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, {
          detail: { mode: isLight ? 'light' : 'dark', stored },
        }));
      } catch {}
    };
    if (_osMql.addEventListener) _osMql.addEventListener('change', onChange);
    else if (_osMql.addListener) _osMql.addListener(onChange); // Safari ≤14
  } catch {
    // If localStorage / matchMedia is blocked, fall back to dark
    document.body.classList.remove('theme-light');
    document.documentElement.style.colorScheme = 'dark';
  }
}
