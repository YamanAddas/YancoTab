/**
 * todo/view/reviewRail.js — right rail: mission %, week stats, blurb.
 *
 * Built once; update(state) repaints from the active mission + streakLog.
 */

import { el } from '../../../utils/dom.js';
import { missionStats, weekSummary, currentStreak } from '../engine/streaks.js';
import { getActiveMission } from '../engine/state.js';

function statRow(k, v, vClass = '') {
  return el('div', { class: 'mc-stat' }, [
    el('span', { class: 'mc-stat-k' }, k),
    el('span', { class: `mc-stat-v ${vClass}`.trim() }, v),
  ]);
}

export function buildReviewRail() {
  const root = el('aside', { class: 'mc-rev' });

  const missionPanel = el('div', { class: 'mc-review' });
  const weekPanel = el('div', { class: 'mc-review' });
  const blurbPanel = el('div', { class: 'mc-review' });

  root.append(missionPanel, weekPanel, blurbPanel);

  return {
    root,
    update(state, settings = {}) {
      const mission = getActiveMission(state) || { name: '—', tasks: [] };
      const ms = missionStats(mission);
      const ws = weekSummary(state, Date.now(), settings.weekStart || 'mon');
      const streak = currentStreak(state.streakLog);

      // Mission panel
      missionPanel.innerHTML = '';
      missionPanel.append(
        el('div', { class: 'mc-review-h' }, `★ ${mission.name} — ${ms.percent}%`),
        statRow('Done', String(ms.done), 'is-up'),
        statRow('Doing', String(ms.doing)),
        statRow('Queued', String(ms.queued)),
        statRow('Overdue', String(ms.overdue), ms.overdue > 0 ? 'is-danger' : ''),
        el('div', { class: 'mc-bar' }, [
          el('div', {
            class: 'mc-bar-fill',
            style: { width: `${ms.percent}%` },
          }),
        ]),
      );

      // Week panel
      weekPanel.innerHTML = '';
      weekPanel.append(
        el('div', { class: 'mc-review-h' }, '⏱ This week'),
        statRow('Completed', String(ws.completed), 'is-up'),
        statRow('On time', `${ws.onTimePercent}%`),
        statRow('Streak', `${streak}d`, 'is-streak'),
        statRow('Best day', ws.bestDay ? `${ws.bestDay.label} · ${ws.bestDay.count}` : '—'),
      );

      // Blurb panel
      blurbPanel.innerHTML = '';
      const total = ws.completed;
      const blurb = total === 0
        ? 'Mark a task done to start your week. Friday\'s review converts each star into a constellation.'
        : `Friday's review converts these ${total} stars into a "Week" constellation — exportable to Notes as a one-page recap.`;
      blurbPanel.append(
        el('div', { class: 'mc-review-h' }, 'Constellations done'),
        el('p', { class: 'mc-review-blurb' }, blurb),
      );
    },
  };
}
