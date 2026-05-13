/**
 * pdf/v3/chrome/icons.js — SVG icon registry for v3 PDF reader chrome.
 *
 * All icons:
 *   - 24×24 viewBox
 *   - fill="none"
 *   - stroke="currentColor"
 *   - stroke-width="2"
 *   - stroke-linecap="round"
 *   - stroke-linejoin="round"
 *
 * Returned as inline SVG strings. Callers inject them via DOMParser
 * (see sidebar.js / toolbar.js) — never via innerHTML.
 *
 * Target size: ≤ 400 lines.
 */

const HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const FOOT = '</svg>';

function wrap(body) { return HEAD + body + FOOT; }

export const ICONS = {
  prev:        wrap('<path d="m15 18-6-6 6-6"/>'),
  next:        wrap('<path d="m9 18 6-6-6-6"/>'),
  zoomIn:      wrap('<circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M21 21l-4.3-4.3"/>'),
  zoomOut:     wrap('<circle cx="11" cy="11" r="7"/><path d="M8 11h6M21 21l-4.3-4.3"/>'),
  fullscreen:  wrap('<path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/>'),
  hand:        wrap('<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v6M10 10V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0"/>'),
  text:        wrap('<path d="M5 4h14M12 4v16M8 20h8"/>'),
  highlight:   wrap('<path d="m9 11 5-5 4 4-5 5zm-4 9 4-1 1-3-1-1z"/>'),
  ink:         wrap('<path d="M12 19l7-7a2.5 2.5 0 0 0-3.5-3.5L8 16l-2 5z"/>'),
  shape:       wrap('<rect x="3" y="3" width="18" height="18" rx="2"/>'),
  note:        wrap('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.5 8.5 0 0 1-7.6-4 8.4 8.4 0 0 1-1-4.5 8.5 8.5 0 0 1 8.6-8.5 8.4 8.4 0 0 1 9 4.5z"/>'),
  signature:   wrap('<path d="m3 17 4-8 4 8M17 12c-1.5-2-2.5-3-2.5-4.5S15.5 5 17 5s2.5 1 2.5 2.5S18.5 10 17 12c-1 1.5-1 3 0 4"/>'),
  search:      wrap('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  rotate:      wrap('<path d="M21 12a9 9 0 1 1-3-6.7l3-3v6h-6"/>'),
  print:       wrap('<path d="M6 9V3h12v6M6 14h12v7H6zM18 14v4M6 14v4"/>'),
  download:    wrap('<path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/>'),
  more:        wrap('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  sidebar:     wrap('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>'),
  thumbs:      wrap('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  outline:     wrap('<path d="M4 6h16M4 12h10M4 18h16"/>'),
  bookmark:    wrap('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>'),
  close:       wrap('<path d="M18 6 6 18M6 6l12 12"/>'),
  back:        wrap('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  undo:        wrap('<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7"/>'),
  redo:        wrap('<path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7"/>'),
};

/**
 * Return the SVG string for a named icon, or empty string if unknown.
 * Trusted output: caller must only feed author-defined names.
 */
export function getIcon(name) {
  return ICONS[name] || '';
}
