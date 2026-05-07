/**
 * todo/view/reviewTab.js — full-page review panel.
 *
 *   Top: 4 stat cards (week completed, total open, overdue, streak)
 *   Middle: per-mission progress bars
 *   Bottom: 7-day completion bar chart from streakLog
 */

import { el } from '../../../utils/dom.js';
import { missionProgress, reviewSummary } from '../engine/aggregate.js';
import { weekConstellation, currentStreak } from '../engine/streaks.js';

function colorVar(color) {
  switch (color) {
    case 'cool':   return 'var(--cool, #5aa8ff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'green':  return 'var(--green, #2dcf6a)';
    default:       return 'var(--accent, #00e5c1)';
  }
}

function statCard(label, value, sub, modifier = '') {
  return el('div', { class: `mc-stat-card${modifier ? ' ' + modifier : ''}` }, [
    el('span', { class: 'mc-stat-card-label' }, label),
    el('span', { class: 'mc-stat-card-value' }, value),
    el('span', { class: 'mc-stat-card-sub' }, sub),
  ]);
}

export function buildReviewTab() {
  const root = el('div', { class: 'mc-review-tab' });

  const cards = el('div', { class: 'mc-review-cards' });

  const missionsSection = el('section', { class: 'mc-review-section' });
  missionsSection.appendChild(el('h3', { class: 'mc-review-h2' }, 'Missions'));
  const missionsList = el('div', { class: 'mc-review-missions' });
  missionsSection.appendChild(missionsList);

  const weekSection = el('section', { class: 'mc-review-section' });
  weekSection.appendChild(el('h3', { class: 'mc-review-h2' }, 'Last 7 days'));
  const bars = el('div', { class: 'mc-review-bars' });
  weekSection.appendChild(bars);

  root.append(cards, missionsSection, weekSection);

  return {
    root,
    update(state, settings = {}, now = Date.now()) {
      const summary = reviewSummary(state, now, settings.weekStart || 'mon');
      const streak = currentStreak(state.streakLog, now);

      // ── Cards ──
      cards.innerHTML = '';
      cards.append(
        statCard('This week', String(summary.weekTotal), 'tasks completed'),
        statCard('Open', String(summary.totalOpen), 'across missions'),
        statCard('Overdue', String(summary.totalOverdue),
          summary.totalOverdue === 0 ? 'all clear' : 'needs attention',
          summary.totalOverdue > 0 ? 'is-danger' : ''),
        statCard('Streak', `${streak}d`, streak === 0 ? 'start one today' : 'days in a row'),
      );

      // ── Per-mission ──
      missionsList.innerHTML = '';
      const progress = missionProgress(state, now);
      if (progress.length === 0) {
        missionsList.appendChild(el('p', { class: 'mc-review-empty' }, 'No missions yet.'));
      } else {
        for (const m of progress) {
          const row = el('div', { class: 'mc-review-mission' }, [
            el('div', { class: 'mc-review-mission-head' }, [
              el('i', { class: 'mc-review-mission-dot', style: { background: colorVar(m.color) } }),
              el('span', { class: 'mc-review-mission-name' }, m.name),
              el('span', { class: 'mc-review-mission-counts' },
                `${m.done}/${m.total}${m.overdue > 0 ? ` · ${m.overdue} overdue` : ''}`),
              el('span', { class: 'mc-review-mission-pct' }, `${m.percent}%`),
            ]),
            el('div', { class: 'mc-bar' }, [
              el('div', {
                class: 'mc-bar-fill',
                style: { width: `${m.percent}%`, background: `linear-gradient(90deg, ${colorVar(m.color)}, ${colorVar(m.color)})` },
              }),
            ]),
          ]);
          missionsList.appendChild(row);
        }
      }

      // ── 7-day bar chart ──
      bars.innerHTML = '';
      const week = weekConstellation(state.streakLog, now, settings.weekStart || 'mon');
      const max = Math.max(1, ...week.map((d) => d.count));
      for (const d of week) {
        const fillPct = max > 0 ? (d.count / max) * 100 : 0;
        const cell = el('div', {
          class: `mc-review-bar${d.isToday ? ' is-today' : ''}${d.isFuture ? ' is-future' : ''}`,
        }, [
          el('div', { class: 'mc-review-bar-track' }, [
            el('div', { class: 'mc-review-bar-fill', style: { height: `${fillPct}%` } }),
          ]),
          el('span', { class: 'mc-review-bar-label' }, d.label),
          el('span', { class: 'mc-review-bar-num' }, String(d.count)),
        ]);
        bars.appendChild(cell);
      }
    },
  };
}
