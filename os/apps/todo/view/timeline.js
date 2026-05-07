/**
 * todo/view/timeline.js — intraday timeline strip.
 *
 * Renders today's open tasks positioned along a 6am → 12am axis,
 * with a "now" marker and severity-colored chips.
 */

import { el } from '../../../utils/dom.js';
import { todayTimeline } from '../engine/aggregate.js';
import { formatDue, dueSeverity } from '../engine/buckets.js';

export function buildTimeline() {
  const root = el('div', { class: 'mc-timeline' });
  const label = el('div', { class: 'mc-timeline-label' }, '');
  const ticks = el('div', { class: 'mc-timeline-ticks' });
  root.append(label, ticks);

  return {
    root,
    update(state, now = Date.now()) {
      const { items, nowPct } = todayTimeline(state, now);
      const d = new Date(now);
      const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      label.textContent = `Today · ${d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} · ${time}`;

      ticks.innerHTML = '';

      // Hour ticks at 9 / 12 / 15 / 18 / 21 (visual reference).
      const hourMarks = [9, 12, 15, 18, 21];
      const dayStartHour = 6;
      const dayEndHour = 24;
      for (const h of hourMarks) {
        const pct = ((h - dayStartHour) / (dayEndHour - dayStartHour)) * 100;
        const tick = el('div', { class: 'mc-timeline-hour', style: { left: `${pct}%` } }, `${h}:00`);
        ticks.appendChild(tick);
      }

      // "Now" marker
      if (Number.isFinite(nowPct)) {
        const nowEl = el('div', {
          class: 'mc-timeline-now',
          style: { left: `${nowPct}%` },
          title: `Now ${time}`,
        });
        ticks.appendChild(nowEl);
      }

      // Task chips
      for (const it of items) {
        const sev = dueSeverity(it.task, now);
        const cls = ['mc-tl-item', sev === 'over' && 'is-over', sev === 'soon' && 'is-soon']
          .filter(Boolean).join(' ');
        const chip = el('div', {
          class: cls,
          style: { left: `${it.pct}%` },
          title: `${it.task.text} · ${formatDue(it.task, now)}`,
        }, [
          el('span', { class: 'mc-tl-text' }, it.task.text),
        ]);
        ticks.appendChild(chip);
      }
    },
  };
}
