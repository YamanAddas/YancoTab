// StatsPanel.js — Spider stats modal. Per-difficulty best results, since 1/2/4
// suits play like different games and conflating them hides real progress.

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

  const perDiffSection = (label, diffKey) => {
    const t = stats.bestTimeSec?.[diffKey];
    const m = stats.bestMoves?.[diffKey];
    const s = stats.bestScore?.[diffKey];
    return el('div', { class: 'cosmic-stats-block' }, [
      el('div', { class: 'cosmic-stats-block-label' }, label),
      row('Best time',    fmtTime(t)),
      row('Fewest moves', m == null ? '—' : String(m)),
      row('Best score',   String(s || 0)),
    ]);
  };

  const card = el('div', { class: 'cosmic-win-card' }, [
    el('div', { class: 'cosmic-win-title' }, 'Statistics'),
    el('div', { class: 'cosmic-stats-grid' }, [
      row('Played',         String(stats.played)),
      row('Won',            String(stats.won)),
      row('Win %',          `${winPct}%`),
      row('Current streak', String(stats.currentStreak || 0)),
      row('Longest streak', String(stats.longestStreak || 0)),
    ]),
    perDiffSection('1 Suit',  1),
    perDiffSection('2 Suits', 2),
    perDiffSection('4 Suits', 4),
    el('button', { class: 'cosmic-btn', type: 'button', style: 'margin-top:16px;' }, 'Close'),
  ]);
  const { overlay, close } = mountOverlay(root, card);
  overlay.querySelector('button').addEventListener('click', close);
}
