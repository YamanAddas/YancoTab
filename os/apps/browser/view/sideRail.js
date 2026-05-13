/**
 * browser/view/sideRail.js — Reader stub + Recent trail + Legend.
 */

import { el } from '../../../utils/dom.js';
import { recentVisits, formatRelative } from '../engine/visits.js';

export function buildSideRail({ onOpenUrl }) {
  const root = el('aside', { class: 'wh-side' });

  // Reader panel (currently visited page or last navigated)
  const reader = el('div', { class: 'wh-reader' });

  // Recent trail
  const recentSec = el('section', { class: 'wh-side-section' });
  recentSec.appendChild(el('h4', { class: 'wh-side-h' }, 'RECENT TRAIL'));
  const recentList = el('div', { class: 'wh-recent-list' });
  recentSec.appendChild(recentList);

  // Legend (static)
  const legendSec = el('section', { class: 'wh-side-section' });
  legendSec.appendChild(el('h4', { class: 'wh-side-h' }, 'LEGEND'));
  const legend = el('div', { class: 'wh-legend' }, [
    legendRow('is-anchor',   'Anchor',   'opened ≥3× recently'),
    legendRow('is-recent',   'Recent',   'visited just now'),
    legendRow('is-standard', 'Standard', 'bookmarked + grouped'),
    legendRow('is-floating', 'Floating', 'uncategorized'),
  ]);
  legendSec.appendChild(legend);

  // Hint footer
  const hint = el('div', { class: 'wh-side-hint' },
    '⌘K to focus the URL bar · click a portal to teleport');

  root.append(reader, recentSec, legendSec, hint);

  return {
    root,
    update(state, now = Date.now()) {
      // ── Reader ──
      reader.innerHTML = '';
      const last = recentVisits(state, 1)[0];
      if (last) {
        reader.append(
          el('span', { class: 'wh-reader-source' }, last.host || ''),
          el('h4', { class: 'wh-reader-title' }, last.url),
          el('p', { class: 'wh-reader-blurb' },
            'YancoTab opens external sites in a new tab — page bodies aren\'t pulled into the new tab page for privacy. Click below to revisit.'),
          el('div', { class: 'wh-reader-actions' }, [
            ghostBtn('↗ Open', () => onOpenUrl(last.url)),
          ]),
        );
      } else {
        reader.append(
          el('span', { class: 'wh-reader-source' }, 'no visits yet'),
          el('h4', { class: 'wh-reader-title' }, 'Reader'),
          el('p', { class: 'wh-reader-blurb' },
            'Click a portal or use the URL bar to teleport. The page you visit shows up here.'),
        );
      }

      // ── Recent trail ──
      recentList.innerHTML = '';
      const recent = recentVisits(state, 5);
      if (recent.length === 0) {
        recentList.appendChild(el('p', { class: 'wh-empty' }, 'No recent visits.'));
      } else {
        for (const v of recent) {
          const item = el('button', { type: 'button', class: 'wh-recent-item' });
          // Color the dot accent for now (later: by cluster color of matching bookmark)
          const dotColor = colorForVisit(state, v);
          item.append(
            el('i', { class: 'wh-recent-dot', style: { background: dotColor } }),
            el('div', { class: 'wh-recent-info' }, [
              el('div', { class: 'wh-recent-name' }, v.host || v.url),
              el('div', { class: 'wh-recent-time' }, formatRelative(v.ts, now)),
            ]),
          );
          item.addEventListener('click', () => onOpenUrl(v.url));
          recentList.appendChild(item);
        }
      }
    },
  };
}

function legendRow(modifier, name, blurb) {
  return el('div', { class: 'wh-legend-item' }, [
    el('i', { class: `wh-legend-dot ${modifier}` }),
    el('div', { class: 'wh-legend-text' }, [
      el('b', {}, name),
      ' — ',
      el('span', {}, blurb),
    ]),
  ]);
}

function ghostBtn(label, onClick) {
  const b = el('button', { type: 'button', class: 'wh-btn-ghost' }, label);
  b.addEventListener('click', onClick);
  return b;
}

function colorForVisit(state, visit) {
  // Find the matching bookmark's cluster color, or default to accent.
  const b = state.bookmarks?.find((x) => x.url === visit.url);
  if (!b) return 'var(--accent, #00e5c1)';
  if (!b.clusterId) return 'var(--accent, #00e5c1)';
  const cluster = state.clusters?.find((c) => c.id === b.clusterId);
  if (!cluster) return 'var(--accent, #00e5c1)';
  switch (cluster.color) {
    case 'cool':   return 'var(--cool, #5aa8ff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'green':  return 'var(--green, #2dcf6a)';
    default:       return 'var(--accent, #00e5c1)';
  }
}
