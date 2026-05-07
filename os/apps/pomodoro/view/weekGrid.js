/**
 * pomodoro/view/weekGrid.js — 7-day orbital-loop grid.
 *
 * Replaces the PR-2 placeholder. Each day is a conic-gradient ring
 * showing the ratio of completed focus sessions vs the user's target.
 * Today's letter is tinted accent; future days are dimmed.
 *
 * The shell calls `update(history, target, weekStart)` whenever
 * history changes (which happens after a session is logged or on a
 * day rollover). Cheap to repaint — 7 nodes.
 */

import { el } from '../../../utils/dom.js';
import { weekSummary } from '../engine/history.js';

export function buildWeekGrid() {
  const root = el('div', { class: 'sol-week' });
  return {
    root,
    update(history, target = 4, weekStart = 'mon') {
      const days = weekSummary(history, Date.now(), target, weekStart);
      // Wipe + re-render. 7 cells is cheap.
      root.innerHTML = '';
      for (const d of days) {
        const cell = el('div', {
          class: `sol-week-day${d.isToday ? ' is-today' : ''}${d.isFuture ? ' is-future' : ''}`,
          title: d.isFuture ? `${d.dayKey} (upcoming)` : `${d.dayKey} — ${d.count}/${d.target}`,
        });
        const lbl = el('span', { class: 'sol-week-letter' }, d.label);
        // Conic-gradient ring driven by --p (0..100). Inner pseudo-element
        // (in CSS) carves the donut hole. CSS custom properties must be
        // set via setProperty — Object.assign on style.cssText skips them.
        const loop = el('div', { class: 'sol-week-loop' });
        loop.style.setProperty('--p', String(Math.round(d.ratio * 100)));
        const txt = d.count > 0
          ? `${d.count}/${d.target}`
          : (d.isToday ? '0' : '—');
        loop.appendChild(el('span', { class: 'sol-week-num' }, txt));
        cell.append(lbl, loop);
        root.appendChild(cell);
      }
    },
  };
}
