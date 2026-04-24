// StatsPanel.js — Solitaire stats modal. Pure view.

import { el } from '../../../../utils/dom.js';
import { mountOverlay } from './overlay.js';

function fmtTime(s) {
  if (s == null) return '—';
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function showStatsPanel(root, stats) {
  const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  const row = (label, val) => el('div', { class: 'cosmic-stat-row' }, [
    el('span', {}, label), el('strong', {}, val),
  ]);
  const card = el('div', { class: 'cosmic-win-card' }, [
    el('div', { class: 'cosmic-win-title' }, 'Statistics'),
    el('div', { class: 'cosmic-stats-grid' }, [
      row('Played',         String(stats.played)),
      row('Won',            String(stats.won)),
      row('Win %',          `${winPct}%`),
      row('Current streak', String(stats.currentStreak || 0)),
      row('Longest streak', String(stats.longestStreak || 0)),
      row('Best time',      fmtTime(stats.bestTimeSec)),
      row('Fewest moves',   stats.bestMoves == null ? '—' : String(stats.bestMoves)),
      row('Best score',     String(stats.bestScore || 0)),
    ]),
    el('button', { class: 'cosmic-btn', type: 'button', style: 'margin-top:16px;' }, 'Close'),
  ]);
  const { overlay, close } = mountOverlay(root, card);
  overlay.querySelector('button').addEventListener('click', close);
}
