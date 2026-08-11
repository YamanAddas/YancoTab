/**
 * browser/view/portal.js — single hex-clipped portal.
 *
 * Pure DOM builder. Stateless — repaints come from the parent.
 */

import { el } from '../../../utils/dom.js';
import { classifyPortal } from '../engine/visits.js';

function emojiForUrl(url, label) {
  // Rough heuristic — pick an emoji from the label first letter, or
  // host first letter, or default ⌘. The favicon img sits behind it.
  const c = (label || url || '').trim()[0];
  return c ? c.toUpperCase() : '⌘';
}

function faviconFor(url) {
  try {
    const host = new URL(url).hostname;
    return `https://s2.googleusercontent.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return '';
  }
}

export function buildPortal(bookmark, { onOpen, onContextMenu }, now = Date.now()) {
  const cls = ['wh-portal', `is-${classifyPortal(bookmark, now)}`].join(' ');
  const root = el('div', {
    class: cls,
    'data-bookmark-id': bookmark.id,
    style: { left: `${bookmark.x}%`, top: `${bookmark.y}%` },
    title: bookmark.url,
  });

  const hex = el('button', {
    type: 'button',
    class: 'wh-portal-hex',
    'aria-label': bookmark.label,
  });
  const fav = faviconFor(bookmark.url);
  if (fav) {
    const img = el('img', {
      class: 'wh-portal-favicon', src: fav, alt: '', loading: 'lazy',
      // Match PagePanes: never tell the favicon host which page asked.
      referrerpolicy: 'no-referrer',
    });
    hex.appendChild(img);
  } else {
    hex.appendChild(el('span', { class: 'wh-portal-glyph' }, emojiForUrl(bookmark.url, bookmark.label)));
  }
  hex.addEventListener('click', () => onOpen(bookmark));
  hex.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    onContextMenu?.(bookmark);
  });

  const label = el('span', { class: 'wh-portal-label' }, bookmark.label);

  root.append(hex, label);
  return root;
}
