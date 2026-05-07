/**
 * browser/view/starMap.js — absolute-positioned portals + cluster orbits.
 *
 * Pure DOM builder. update(state, now) repaints from scratch — cheap
 * because the portal count is bounded (typically <30) and the user
 * moves them rarely.
 *
 * Cluster orbit/label rendering is a follow-up; for PR-2 we just
 * render the portals themselves.
 */

import { el } from '../../../utils/dom.js';
import { buildPortal } from './portal.js';

export function buildStarMap({ onOpenPortal, onContextMenu }) {
  const root = el('div', { class: 'wh-starmap' });
  const portalsLayer = el('div', { class: 'wh-portals' });
  const emptyEl = el('div', { class: 'wh-starmap-empty' },
    'No portals yet. Use the toolbar to add one.');
  emptyEl.style.display = 'none';
  root.append(portalsLayer, emptyEl);

  return {
    root,
    update(state, now = Date.now()) {
      portalsLayer.innerHTML = '';
      const bookmarks = Array.isArray(state?.bookmarks) ? state.bookmarks : [];
      if (bookmarks.length === 0) {
        emptyEl.style.display = 'block';
        return;
      }
      emptyEl.style.display = 'none';
      for (const b of bookmarks) {
        portalsLayer.appendChild(buildPortal(b, { onOpen: onOpenPortal, onContextMenu }, now));
      }
    },
  };
}
