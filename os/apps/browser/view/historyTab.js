/**
 * browser/view/historyTab.js — full history with date grouping.
 *
 * Groups history entries into Today / Yesterday / Earlier this week /
 * Earlier. Within each group, latest-first. Click an entry to revisit.
 */

import { el } from '../../../utils/dom.js';
import { formatRelative } from '../engine/visits.js';

const DAY = 24 * 60 * 60_000;

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupOf(visit, now) {
  if (!Number.isFinite(visit.ts) || visit.ts === 0) return 'Earlier';
  const today = startOfDay(now);
  const visitDay = startOfDay(visit.ts);
  if (visitDay === today) return 'Today';
  if (visitDay === today - DAY) return 'Yesterday';
  if (visitDay > today - 7 * DAY) return 'Earlier this week';
  return 'Earlier';
}

const ORDER = ['Today', 'Yesterday', 'Earlier this week', 'Earlier'];

export function buildHistoryTab({ onOpenUrl, onClearHistory }) {
  const root = el('div', { class: 'wh-history-tab' });

  return {
    root,
    update(state, now = Date.now()) {
      root.innerHTML = '';
      const visits = Array.isArray(state?.history) ? state.history : [];

      // Header with title + count + clear
      const header = el('div', { class: 'wh-history-head' }, [
        el('h2', { class: 'wh-history-title' }, 'History'),
        el('span', { class: 'wh-history-meta' }, visits.length === 0 ? 'empty' : `${visits.length} visit${visits.length === 1 ? '' : 's'}`),
      ]);
      if (visits.length > 0) {
        const clear = el('button', { type: 'button', class: 'wh-btn-ghost' }, 'Clear all');
        clear.addEventListener('click', () => onClearHistory());
        header.appendChild(clear);
      }
      root.appendChild(header);

      if (visits.length === 0) {
        root.appendChild(el('p', { class: 'wh-history-empty' },
          'No visits yet. Use the URL bar or click a portal.'));
        return;
      }

      // Bucket by group, preserving latest-first inside each.
      const groups = {};
      for (const v of visits) {
        const g = groupOf(v, now);
        if (!groups[g]) groups[g] = [];
        groups[g].push(v);
      }

      for (const groupName of ORDER) {
        const list = groups[groupName];
        if (!list || list.length === 0) continue;
        const sec = el('section', { class: 'wh-history-section' });
        sec.appendChild(el('h4', { class: 'wh-side-h' }, groupName.toUpperCase()));
        const inner = el('div', { class: 'wh-history-list' });
        for (const v of list) {
          const item = el('button', { type: 'button', class: 'wh-history-row', title: v.url });
          item.append(
            el('span', { class: 'wh-history-host' }, v.host || v.url),
            el('span', { class: 'wh-history-url' }, v.url),
            el('span', { class: 'wh-history-time' }, formatRelative(v.ts, now)),
          );
          item.addEventListener('click', () => onOpenUrl(v.url));
          inner.appendChild(item);
        }
        sec.appendChild(inner);
        root.appendChild(sec);
      }
    },
  };
}
