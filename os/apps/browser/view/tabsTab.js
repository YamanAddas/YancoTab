/**
 * browser/view/tabsTab.js — pseudo-tabs view.
 *
 * Honest stub: YancoTab doesn't have the `tabs` permission, so we
 * can't enumerate Chrome's actual tabs. Instead this surfaces:
 *   • the current "navigated" URL as the "active tab"
 *   • the last 4 distinct hosts from history as "recently closed"
 * Plus a brief explainer.
 */

import { el } from '../../../utils/dom.js';
import { recentVisits, formatRelative } from '../engine/visits.js';

export function buildTabsTab({ onOpenUrl }) {
  const root = el('div', { class: 'wh-tabs-tab' });

  return {
    root,
    update(state, now = Date.now()) {
      root.innerHTML = '';

      const head = el('div', { class: 'wh-tabs-head' }, [
        el('h2', { class: 'wh-history-title' }, 'Tabs'),
        el('span', { class: 'wh-history-meta' }, 'in-app navigation'),
      ]);
      root.appendChild(head);

      const explainer = el('p', { class: 'wh-tabs-explainer' },
        'YancoTab opens external sites in real Chrome tabs (no `tabs` permission, no peeking at your browser). What you see here is in-app navigation history.');
      root.appendChild(explainer);

      // "Active tab" — last navigated URL
      const last = recentVisits(state, 1)[0];
      if (last) {
        const activeSec = el('section', { class: 'wh-history-section' });
        activeSec.appendChild(el('h4', { class: 'wh-side-h' }, 'LAST NAVIGATION'));
        const card = el('button', { type: 'button', class: 'wh-tabs-card is-active' });
        card.append(
          el('span', { class: 'wh-tabs-dot' }),
          el('div', { class: 'wh-tabs-info' }, [
            el('div', { class: 'wh-history-host' }, last.host || last.url),
            el('div', { class: 'wh-history-url' }, last.url),
          ]),
          el('span', { class: 'wh-history-time' }, formatRelative(last.ts, now)),
        );
        card.addEventListener('click', () => onOpenUrl(last.url));
        activeSec.appendChild(card);
        root.appendChild(activeSec);
      }

      // Recently closed = distinct hosts from rest of history
      const others = recentVisits(state, 10).slice(1);
      const seen = new Set();
      const distinct = [];
      for (const v of others) {
        const key = v.host || v.url;
        if (seen.has(key)) continue;
        seen.add(key);
        distinct.push(v);
        if (distinct.length >= 4) break;
      }
      if (distinct.length > 0) {
        const recentSec = el('section', { class: 'wh-history-section' });
        recentSec.appendChild(el('h4', { class: 'wh-side-h' }, 'RECENTLY VISITED'));
        const list = el('div', { class: 'wh-history-list' });
        for (const v of distinct) {
          const card = el('button', { type: 'button', class: 'wh-tabs-card' });
          card.append(
            el('span', { class: 'wh-tabs-dot' }),
            el('div', { class: 'wh-tabs-info' }, [
              el('div', { class: 'wh-history-host' }, v.host || v.url),
              el('div', { class: 'wh-history-url' }, v.url),
            ]),
            el('span', { class: 'wh-history-time' }, formatRelative(v.ts, now)),
          );
          card.addEventListener('click', () => onOpenUrl(v.url));
          list.appendChild(card);
        }
        recentSec.appendChild(list);
        root.appendChild(recentSec);
      }
    },
  };
}
