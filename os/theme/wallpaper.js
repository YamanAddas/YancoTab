/**
 * theme/wallpaper.js — one place that turns the stored marker into pixels.
 *
 * `yancotab_wallpaper` holds a marker, and five different code paths wrote
 * one in five different vocabularies:
 *
 *   ''                                  nothing chosen — CSS default
 *   'cosmic' | 'starfield'              special modes
 *   'custom'                            → data URL in yancotab_wallpaper_custom
 *   'g1' | 'a3' | 'd2' …                a Photos preset id
 *   'url("assets/wallpapers/rose.webp")' a themed image
 *   'assets/wallpapers/rose.webp'        the same thing, unwrapped
 *   'linear-gradient(…)' | '#000000'     a legacy inline background
 *
 * Nothing could read all seven. `themes.js` handled only the themed image
 * and the two special modes, so a custom upload and all 34 Photos presets
 * were applied once — inline, by whichever app set them — and then lost on
 * the next load.
 *
 * Worse, MobileContextMenu's boot-time restore treated every unrecognised
 * marker as a path: it painted `background-image: url("custom")` (a
 * request for a file named "custom" that 404s) and then WROTE THAT BACK,
 * so the marker degraded to `url("custom")` and the real choice was gone
 * for good. Same for `url("g1")`.
 *
 * So: one resolver, one applier, and no writes on the read path.
 */

import { THEMES } from './themes.js';
import { getPresetCss } from './wallpaperPresets.js';

export const WP_KEY = 'yancotab_wallpaper';
export const WP_CUSTOM_KEY = 'yancotab_wallpaper_custom';

/**
 * Markers that are modes rather than backgrounds. Kept as a set because
 * every caller that special-cases them has to special-case ALL of them —
 * missing one is how 'custom' ended up going down the image-path branch.
 */
export const SPECIAL_MARKERS = new Set(['cosmic', 'starfield', 'custom']);

/**
 * Legacy markers from earlier releases, mapped to the closest current
 * theme wallpaper. Mirrors what MobileContextMenu carried; kept here so
 * the migration runs wherever a wallpaper is resolved, not only when a
 * context menu happens to be constructed.
 */
const LEGACY_MARKERS = {
  'linear-gradient(135deg, #0a1628 0%, #1a2d4a 50%, #0d1f35 100%)': 'assets/wallpapers/sapphire.webp',
  '#000000': 'assets/wallpapers/obsidian.webp',
  'linear-gradient(45deg, #121212, #2a2a2a)': 'assets/wallpapers/obsidian.webp',
  'linear-gradient(135deg, #667eea, #764ba2)': 'assets/wallpapers/amethyst.webp',
  'linear-gradient(135deg, #f093fb, #f5576c)': 'assets/wallpapers/rose.webp',
  'linear-gradient(135deg, #4facfe, #00f2fe)': 'assets/wallpapers/arctic.webp',
  'linear-gradient(135deg, #43e97b, #38f9d7)': 'assets/wallpapers/emerald.webp',
  'assets/wallpaper.webp': 'assets/wallpapers/emerald.webp',
  'assets/wallpapers/deep-blue.webp': 'assets/wallpapers/sapphire.webp',
  'assets/wallpapers/black.webp': 'assets/wallpapers/obsidian.webp',
  'assets/wallpapers/dark.webp': 'assets/wallpapers/obsidian.webp',
  'assets/wallpapers/violet.webp': 'assets/wallpapers/amethyst.webp',
  'assets/wallpapers/pink.webp': 'assets/wallpapers/rose.webp',
  'assets/wallpapers/sky.webp': 'assets/wallpapers/arctic.webp',
  'assets/wallpapers/mint.webp': 'assets/wallpapers/emerald.webp',
};

/**
 * A data URL we are willing to put inside `url("…")`.
 *
 * Two independent requirements, both enforced here:
 *   • it must be an IMAGE — `data:text/html` in a background is pointless
 *     but `data:` of any type is exactly the kind of value that should
 *     never be waved through;
 *   • it must contain none of `" ' ( ) \` or whitespace, because the value
 *     is interpolated into a CSS declaration and any of those could close
 *     the url() early and append declarations of the author's choosing.
 *
 * Base64 payloads satisfy the second condition by construction; a
 * percent-encoded SVG does too. A raw, unencoded SVG does not, and is
 * rejected — correctly, since it is also the one that could carry markup.
 */
const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+[;,][^"'()\s\\]*$/i;

/** True when `value` is safe to use as a custom wallpaper image. */
export function isWallpaperImage(value) {
  return typeof value === 'string' && value.length > 0 && DATA_IMAGE_RE.test(value);
}

/** Image paths we build a url() from — no quotes, parens or whitespace. */
const SAFE_PATH_RE = /^[A-Za-z0-9._\-/]+$/;

/** Unwrap AppStorage's {data, version, ts, …} envelope, or pass through. */
function unwrapEnvelope(raw) {
  if (raw == null) return '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.data === 'string') return parsed.data;
    if (typeof parsed === 'string') return parsed;
  } catch { /* not JSON — a raw value */ }
  return raw;
}

/**
 * Read the marker straight from localStorage.
 *
 * Raw rather than through kernel.storage on purpose: this runs during
 * boot, before the kernel is constructed, and a wallpaper that only
 * appears once the kernel is ready is a visible flash of the default.
 */
export function readMarker() {
  try { return unwrapEnvelope(localStorage.getItem(WP_KEY)); } catch { return ''; }
}

/** The stored custom image, or '' when absent or not a plain image data URL. */
export function readCustomImage() {
  try {
    const raw = localStorage.getItem(WP_CUSTOM_KEY);
    return typeof raw === 'string' && DATA_IMAGE_RE.test(raw) ? raw : '';
  } catch { return ''; }
}

/**
 * Marker → what to paint.
 *
 * Pure: `customImage` is passed in rather than read, so this is testable
 * without a DOM or a storage stub.
 *
 * @returns {{kind: 'none'|'cosmic'|'starfield'|'image'|'css', value: string}}
 */
export function resolveWallpaper(marker, customImage = '') {
  const m = typeof marker === 'string' ? marker.trim() : '';
  if (!m) return { kind: 'none', value: '' };
  if (m === 'cosmic') return { kind: 'cosmic', value: '' };
  if (m === 'starfield') return { kind: 'starfield', value: '' };

  if (m === 'custom') {
    // A marker with no usable image behind it. Falling back to 'none'
    // rather than repairing the marker: the image may simply not have
    // reached this device yet (the marker syncs, the multi-MB data URL
    // deliberately does not), and rewriting would destroy the choice on
    // the device that does have it.
    return DATA_IMAGE_RE.test(customImage)
      ? { kind: 'image', value: customImage }
      : { kind: 'none', value: '' };
  }

  const preset = getPresetCss(m);
  if (preset) return { kind: 'css', value: preset };

  if (THEMES[m]) return { kind: 'css', value: THEMES[m].wallpaper };

  if (Object.prototype.hasOwnProperty.call(LEGACY_MARKERS, m)) {
    return { kind: 'image', value: LEGACY_MARKERS[m] };
  }

  // url("…") → the path inside. Written by the context menu and by the
  // Appearance theme grid, so it is the most common shape on disk.
  const wrapped = m.match(/^url\(["']?(.+?)["']?\)$/);
  const path = wrapped ? wrapped[1].trim() : m;
  if (Object.prototype.hasOwnProperty.call(LEGACY_MARKERS, path)) {
    return { kind: 'image', value: LEGACY_MARKERS[path] };
  }
  if (DATA_IMAGE_RE.test(path)) return { kind: 'image', value: path };
  if (SAFE_PATH_RE.test(path)) return { kind: 'image', value: path };

  // A raw CSS background from a much older build (gradients, hex colors).
  // Anything with a quote or a paren imbalance never reaches here as an
  // image; letting it through as CSS is safe because the browser drops an
  // invalid declaration rather than reinterpreting the rest of the rule.
  return { kind: 'css', value: path };
}

/** Paint a resolved descriptor onto the shell element. */
export function applyWallpaperDescriptor(shell, desc) {
  if (!shell) return;
  shell.classList.remove('cosmic-wallpaper');
  shell.style.background = '';
  shell.style.backgroundImage = '';
  shell.style.backgroundSize = '';
  shell.style.backgroundPosition = '';

  switch (desc?.kind) {
    case 'cosmic':
      shell.classList.add('cosmic-wallpaper');
      return;
    case 'starfield':
      shell.style.background = 'transparent';
      return;
    case 'image':
      shell.style.backgroundImage = `url("${desc.value}")`;
      shell.style.backgroundSize = 'cover';
      shell.style.backgroundPosition = 'center';
      return;
    case 'css':
      shell.style.background = desc.value;
      shell.style.backgroundSize = 'cover';
      shell.style.backgroundPosition = 'center';
      return;
    default:
      // 'none' — leave the stylesheet's own default in place.
  }
}

function shellEl() {
  return document.getElementById('app-shell')
    || document.querySelector('.mobile-shell')
    || document.body;
}

/**
 * Read the stored choice and paint it. The one function every caller
 * should use; nothing else needs to know the marker vocabulary.
 */
export function applyStoredWallpaper() {
  const desc = resolveWallpaper(readMarker(), readCustomImage());
  applyWallpaperDescriptor(shellEl(), desc);
  return desc;
}
