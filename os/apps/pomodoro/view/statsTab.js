/**
 * pomodoro/view/statsTab.js — Stats tab panel.
 *
 * Three regions:
 *   1. Lifetime stat cards: focus hours · sessions · current/longest streak
 *   2. Today's sessions: list of today's entries with start time and duration
 *   3. Last 7 days: mini-bar chart from weekSummary
 *
 * Pure DOM builder. The shell calls `update(history, settings)` after
 * any history mutation.
 */

import { el } from '../../../utils/dom.js';
import { lifetimeStats, weekSummary, todaysSessions } from '../engine/history.js';

function fmtDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

function fmtHm(ts) {
  if (!Number.isFinite(ts)) return '—';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function statCard(label, value, sub) {
  return el('div', { class: 'sol-stat-card' }, [
    el('span', { class: 'sol-stat-label' }, label),
    el('span', { class: 'sol-stat-value' }, value),
    el('span', { class: 'sol-stat-sub' }, sub),
  ]);
}

export function buildStatsTab() {
  const root = el('div', { class: 'sol-stats' });

  const cardsRow = el('div', { class: 'sol-stat-grid' });

  const todaySection = el('section', { class: 'sol-stats-section' });
  todaySection.appendChild(el('h4', { class: 'sol-stats-h' }, "TODAY'S SESSIONS"));
  const todayList = el('div', { class: 'sol-today-list' });
  todaySection.appendChild(todayList);

  const weekSection = el('section', { class: 'sol-stats-section' });
  weekSection.appendChild(el('h4', { class: 'sol-stats-h' }, 'LAST 7 DAYS'));
  const bars = el('div', { class: 'sol-bars' });
  weekSection.appendChild(bars);

  root.append(cardsRow, todaySection, weekSection);

  return {
    root,
    update(history, settings = {}) {
      const stats = lifetimeStats(history);

      // ── Cards ──
      cardsRow.innerHTML = '';
      cardsRow.append(
        statCard('Focus time',  fmtDuration(stats.totalFocusMs), `${stats.completedFocus} completed`),
        statCard('Sessions',     String(stats.totalFocus),         `${stats.days} active days`),
        statCard('Current streak', `${stats.currentStreak}d`,      stats.currentStreak === stats.longestStreak && stats.longestStreak > 0 ? 'matches your best' : 'days in a row'),
        statCard('Longest streak', `${stats.longestStreak}d`,       stats.longestStreak === 0 ? 'start one today' : 'days, all-time'),
      );

      // ── Today's session list ──
      todayList.innerHTML = '';
      const todays = todaysSessions(history).filter((e) => e.kind === 'focus');
      if (todays.length === 0) {
        todayList.appendChild(el('p', { class: 'sol-empty' },
          'No focus sessions today yet. Press Start to begin a cycle.'));
      } else {
        for (const e of todays) {
          const row = el('div', { class: 'sol-today-row' }, [
            el('span', { class: 'sol-today-time' }, fmtHm(e.startedAt)),
            el('span', { class: 'sol-today-dur' }, fmtDuration(e.durationMs)),
            el('span', {
              class: e.completed ? 'sol-today-tag is-ok' : 'sol-today-tag is-partial',
            }, e.completed ? 'COMPLETE' : 'PARTIAL'),
          ]);
          todayList.appendChild(row);
        }
      }

      // ── 7-day bar chart ──
      bars.innerHTML = '';
      const target = 4;
      const week = weekSummary(history, Date.now(), target, settings.weekStart || 'mon');
      const max = Math.max(target, ...week.map((d) => d.count));
      for (const d of week) {
        const fillPct = max > 0 ? (d.count / max) * 100 : 0;
        const cell = el('div', {
          class: `sol-bar-cell${d.isToday ? ' is-today' : ''}${d.isFuture ? ' is-future' : ''}`,
        }, [
          el('div', { class: 'sol-bar-track' }, [
            el('div', { class: 'sol-bar-fill', style: { height: `${fillPct}%` } }),
          ]),
          el('span', { class: 'sol-bar-letter' }, d.label),
          el('span', { class: 'sol-bar-num' }, String(d.count)),
        ]);
        bars.appendChild(cell);
      }
    },
  };
}
