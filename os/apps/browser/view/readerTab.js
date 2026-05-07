/**
 * browser/view/readerTab.js — full Reader tab content.
 *
 * Larger version of the side-rail Reader stub. Shows last visited
 * URL prominently, with Open / Anchor / Send-to-Notes actions and
 * a list of "also recent" entries below.
 *
 * MV3 reality: page bodies aren't pulled into the new-tab page.
 * The panel is honest about that.
 */

import { el } from '../../../utils/dom.js';
import { recentVisits, formatRelative } from '../engine/visits.js';
import { hostFromUrl } from '../engine/state.js';

export function buildReaderTab({ onOpenUrl, onAnchor }) {
  const root = el('div', { class: 'wh-reader-tab' });

  const top = el('div', { class: 'wh-reader-top' });
  const list = el('div', { class: 'wh-reader-also' });

  root.append(top, el('h4', { class: 'wh-side-h' }, 'ALSO RECENT'), list);

  return {
    root,
    update(state, now = Date.now()) {
      const recent = recentVisits(state, 6);
      top.innerHTML = '';
      const last = recent[0];

      if (!last) {
        top.append(
          el('span', { class: 'wh-reader-source' }, 'no visits yet'),
          el('h2', { class: 'wh-reader-tab-title' }, 'Reader'),
          el('p', { class: 'wh-reader-tab-blurb' },
            'Click a portal or use the URL bar to teleport. The page you visit shows up here.'),
        );
        list.innerHTML = '';
        list.appendChild(el('p', { class: 'wh-empty' }, 'No history yet.'));
        return;
      }

      const matchingBookmark = state.bookmarks.find((b) => b.url === last.url);
      top.append(
        el('span', { class: 'wh-reader-source' }, last.host || hostFromUrl(last.url) || ''),
        el('h2', { class: 'wh-reader-tab-title' }, last.url),
        el('p', { class: 'wh-reader-tab-blurb' },
          'YancoTab opens external sites in a new tab. Page bodies aren\'t pulled into this page — that\'s the privacy bit. Use the actions below to act on this URL.'),
        actionsRow([
          ghostBtn('↗ Open',  () => onOpenUrl(last.url)),
          ghostBtn(matchingBookmark?.visitCount >= 3 ? '★ Anchored' : '☆ Anchor',
                   () => onAnchor?.(last.url)),
        ]),
      );

      list.innerHTML = '';
      const others = recent.slice(1);
      if (others.length === 0) {
        list.appendChild(el('p', { class: 'wh-empty' }, 'No earlier visits today.'));
        return;
      }
      for (const v of others) {
        const item = el('button', { type: 'button', class: 'wh-recent-item' });
        item.append(
          el('i', { class: 'wh-recent-dot', style: { background: 'var(--accent)' } }),
          el('div', { class: 'wh-recent-info' }, [
            el('div', { class: 'wh-recent-name' }, v.host || v.url),
            el('div', { class: 'wh-recent-time' }, formatRelative(v.ts, now)),
          ]),
        );
        item.addEventListener('click', () => onOpenUrl(v.url));
        list.appendChild(item);
      }
    },
  };
}

function actionsRow(children) {
  return el('div', { class: 'wh-reader-tab-actions' }, children);
}

function ghostBtn(label, onClick) {
  const b = el('button', { type: 'button', class: 'wh-btn-ghost' }, label);
  b.addEventListener('click', onClick);
  return b;
}
