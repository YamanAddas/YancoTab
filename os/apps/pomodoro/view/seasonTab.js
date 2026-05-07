/**
 * pomodoro/view/seasonTab.js — Season tab: 30-day calendar heatmap.
 *
 * Renders 5 rows × 7 columns ending on this week. Each cell is a hex
 * tile colored by completion ratio (focus count / target). Today's
 * cell glows accent. Future cells are dim.
 *
 * Pure DOM builder. The shell calls update(history, settings) on
 * every render (cheap — 35 cells).
 */

import { el } from '../../../utils/dom.js';
import { focusCountForDay } from '../engine/history.js';
import { todayKey } from '../engine/state.js';

const ROWS = 5;
const COLS = 7;

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildSeasonTab() {
  const root = el('div', { class: 'sol-season' });

  // Header row of letters
  const header = el('div', { class: 'sol-season-head' });

  // Cells container
  const cells = el('div', { class: 'sol-season-grid' });

  // Legend
  const legend = el('div', { class: 'sol-season-legend' }, [
    el('span', { class: 'sol-season-legend-l' }, 'Less'),
    el('div', { class: 'sol-season-swatches' }, [
      el('div', { class: 'sol-season-swatch s0' }),
      el('div', { class: 'sol-season-swatch s1' }),
      el('div', { class: 'sol-season-swatch s2' }),
      el('div', { class: 'sol-season-swatch s3' }),
      el('div', { class: 'sol-season-swatch s4' }),
    ]),
    el('span', { class: 'sol-season-legend-l' }, 'More'),
  ]);

  root.append(header, cells, legend);

  return {
    root,
    update(history, settings = {}) {
      const target = 4;
      const weekStart = settings.weekStart === 'sun' ? 'sun' : 'mon';

      // Anchor the grid: bottom-right cell = today. Walk back ROWS*COLS-1 days.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dow = today.getDay(); // 0=Sun..6=Sat
      const offsetFromStart = weekStart === 'sun' ? dow : (dow + 6) % 7;
      const lastInWeek = COLS - 1 - offsetFromStart;
      // Find the very last cell (today's row, today's column).
      // We render top-left → bottom-right. Compute the start day so today
      // lands on (rowsRendered=ROWS-1, col=offsetFromStart).
      const totalCells = ROWS * COLS;
      const todayCellIdx = (ROWS - 1) * COLS + offsetFromStart;
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - todayCellIdx);

      // Header: column letters
      header.innerHTML = '';
      const labels = weekStart === 'sun'
        ? ['S', 'M', 'T', 'W', 'T', 'F', 'S']
        : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      for (const l of labels) header.appendChild(el('span', { class: 'sol-season-letter' }, l));

      cells.innerHTML = '';
      const todayStr = todayKey(Date.now());
      for (let i = 0; i < totalCells; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const dKey = fmt(d);
        const count = focusCountForDay(history, dKey);
        const isFuture = d.getTime() > today.getTime();
        const isToday = dKey === todayStr;
        const ratio = target > 0 ? Math.min(1, count / target) : 0;
        // Bucket 0..4 for the swatch palette
        let bucket = 0;
        if (ratio > 0)    bucket = 1;
        if (ratio >= 0.34) bucket = 2;
        if (ratio >= 0.67) bucket = 3;
        if (ratio >= 1)    bucket = 4;
        const cell = el('div', {
          class: `sol-season-cell s${bucket}${isToday ? ' is-today' : ''}${isFuture ? ' is-future' : ''}`,
          title: isFuture ? `${dKey} (upcoming)` : `${dKey} — ${count} focus session${count === 1 ? '' : 's'}`,
        }, [
          el('span', { class: 'sol-season-num' }, String(d.getDate())),
        ]);
        cells.appendChild(cell);
      }
      // No-op: lastInWeek isn't used after layout decision; left as a
      // hint for future "first day of month" badging.
      void lastInWeek;
    },
  };
}
