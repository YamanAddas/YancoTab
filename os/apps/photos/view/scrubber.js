/**
 * photos/view/scrubber.js — month density timeline at the bottom of
 * the stage.
 *
 * Renders one column per month, each showing a vertical stack of
 * up to 5 hex pips proportional to that month's photo count. Click a
 * month to filter the grid to that month; click the active month
 * again to clear the filter.
 */

import { el } from '../../../utils/dom.js';
import { cappedBuckets } from '../engine/scrubber.js';

export function buildScrubberBar({ onPickMonth } = {}) {
  const root = el('div', { class: 'lb-scrubber' });

  const label = el('div', { class: 'lb-scrubber-label' }, 'Timeline · scrub by month');
  const months = el('div', { class: 'lb-months' });

  root.append(label, months);

  return {
    root,
    update(buckets, activeMonthKey) {
      months.innerHTML = '';
      const capped = cappedBuckets(buckets, 5);
      if (capped.length === 0) {
        months.appendChild(el('div', { class: 'lb-months-empty' }, '—'));
        return;
      }
      for (const b of capped) {
        const isActive = activeMonthKey === b.key;
        const monthEl = el('button', {
          type: 'button',
          class: `lb-month${isActive ? ' is-active' : ''}${b.count === 0 ? ' is-empty' : ''}`,
          'data-month': b.key,
          title: `${b.label} · ${b.count} photo${b.count === 1 ? '' : 's'}`,
        });
        const stars = el('div', { class: 'lb-month-stars' });
        for (let i = 0; i < b.stars; i++) stars.appendChild(el('i', { class: 'lb-month-pip' }));
        const lbl = el('span', { class: 'lb-month-lbl' }, b.shortLabel);
        monthEl.append(stars, lbl);
        monthEl.addEventListener('click', () => onPickMonth?.(b.key));
        months.appendChild(monthEl);
      }
    },
  };
}
