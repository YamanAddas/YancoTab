// YancoTab Theme Service (v1.0.0)
// Single source of truth for light/dark mode.
// Applies a body class and sets color-scheme so built-in controls render correctly.

const THEME_MODE_KEY = 'yancotab_theme_mode';
const LEGACY_THEME_KEY = 'yancotab_theme';
const LEGACY_THEME_DARK_KEY = 'yancotab_theme_dark';

export function getThemeMode() {
  const mode = localStorage.getItem(THEME_MODE_KEY);
  if (mode === 'light' || mode === 'dark') return mode;

  const legacy = localStorage.getItem(LEGACY_THEME_KEY);
  if (legacy === 'light' || legacy === 'dark') return legacy;

  const legacyDark = localStorage.getItem(LEGACY_THEME_DARK_KEY);
  if (legacyDark === 'true') return 'dark';
  if (legacyDark === 'false') return 'light';

  return 'dark';
}

export function applyThemeMode(mode) {
  const next = mode === 'light' ? 'light' : 'dark';
  const isLight = next === 'light';

  document.body.classList.toggle('theme-light', isLight);
  // Helps form controls / scrollbars match mode
  document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';

  // Persist in both new + legacy keys for backwards compatibility
  localStorage.setItem(THEME_MODE_KEY, next);
  localStorage.setItem(LEGACY_THEME_KEY, next);
  localStorage.setItem(LEGACY_THEME_DARK_KEY, String(!isLight));
}

export function initTheme() {
  try {
    applyThemeMode(getThemeMode());
  } catch {
    // If localStorage is blocked, fall back to dark
    document.body.classList.remove('theme-light');
    document.documentElement.style.colorScheme = 'dark';
  }
}
