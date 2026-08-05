/**
 * grid/gridLaunch.js — opening a user shortcut or a file from the grid.
 *
 * Extracted from AppGrid.js, which sits over the 500-line cap. Built-in
 * apps stay there (one line: emit `app:open`); what moves is the part with
 * actual decisions in it — arbitrary user-supplied URLs.
 *
 * That makes this a security boundary, not just a tidy-up. `url` comes
 * from a shortcut the user typed, which is then persisted, synced, and
 * re-read on some later version — so it is re-validated here at the moment
 * of navigation rather than trusted because it was checked when saved.
 */

import { kernel } from '../../../kernel.js';
import { isSafeUrl } from '../../../utils/url.js';

/**
 * Schemes the Maps app registers. Matched as a PREFIX, never a substring:
 * a mailto: address with "googlemaps" in the local-part must not be
 * mistaken for a map link.
 */
const MAPS_SCHEMES = ['comgooglemaps:', 'comgooglemaps-x-callback:', 'maps:'];

/** Open a user-added shortcut (a web link or a custom scheme). */
export function openUserApp(app) {
  try {
    const url = app?.url || app?.scheme || '';
    if (!url) return;
    // Defence in depth: MobileShortcutModal validates on save, but a
    // shortcut stored by an older version could still hold a javascript:
    // or data: URL, and the blob is reachable by JSON import besides.
    if (!isSafeUrl(url)) {
      kernel.emit('toast', { message: 'Blocked unsafe URL', type: 'error' });
      return;
    }
    if (url.startsWith('http')) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    if (MAPS_SCHEMES.some((s) => url.startsWith(s))) {
      // If the handler is not installed the navigation is a no-op and we
      // are still here a moment later — that is the signal to fall back.
      const start = Date.now();
      window.location.href = url;
      setTimeout(() => {
        if (Date.now() - start < 2000) window.open('https://maps.google.com', '_blank');
      }, 1500);
      return;
    }
    window.location.href = url;
  } catch (e) {
    console.error('[AppGrid] openUserApp failed', e);
  }
}

/** Open a file item — externally if it carries a URL, else in Files. */
export function openFile(file) {
  try {
    if (file?.url && typeof file.url === 'string') {
      if (!isSafeUrl(file.url)) {
        kernel.emit('toast', { message: 'Blocked unsafe URL', type: 'error' });
        return;
      }
      window.open(file.url, '_blank', 'noopener');
      return;
    }
  } catch (e) {
    console.error('[AppGrid] openFile failed', e);
  }
  kernel.emit('app:open', 'files');
}
