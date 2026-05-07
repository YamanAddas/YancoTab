/**
 * notes/view/calendarTab.js — month grid of notes by edit date.
 *
 * Each day cell shows up to 3 chips (one per note updated that
 * day). Click a chip → select the note. Prev/Next/Today nav at top.
 */

import { el } from '../../../utils/dom.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MAX_CHIPS = 3;

export function buildCalendarTab({ onSelectPath } = {}) {
  const root = el('div', { class: 'nc-cal' });

  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let cachedNotes = [];

  // Header
  const monthLabel = el('div', { class: 'nc-cal-month-label' });
  const prevBtn = el('button', { type: 'button', class: 'nc-btn-ghost' }, '‹ Prev');
  const todayBtn = el('button', { type: 'button', class: 'nc-btn-ghost' }, 'Today');
  const nextBtn = el('button', { type: 'button', class: 'nc-btn-ghost' }, 'Next ›');
  prevBtn.addEventListener('click', () => { shiftMonth(-1); render(); });
  nextBtn.addEventListener('click', () => { shiftMonth(1); render(); });
  todayBtn.addEventListener('click', () => {
    const d = new Date();
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    render();
  });
  const head = el('div', { class: 'nc-cal-head' }, [
    prevBtn,
    el('div', { class: 'nc-cal-title' }, [monthLabel]),
    todayBtn,
    nextBtn,
  ]);

  // Weekday row
  const weekdays = el('div', { class: 'nc-cal-weekdays' });
  for (const w of WEEKDAYS) weekdays.appendChild(el('div', { class: 'nc-cal-wd' }, w));

  const grid = el('div', { class: 'nc-cal-grid' });

  root.append(head, weekdays, grid);

  function shiftMonth(delta) {
    viewMonth += delta;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  }

  function dayKey(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function buildBuckets() {
    const buckets = new Map();
    for (const n of cachedNotes) {
      const u = Number.isFinite(n.meta.updated) ? n.meta.updated : 0;
      if (u <= 0) continue;
      const d = new Date(u);
      const k = dayKey(d.getFullYear(), d.getMonth(), d.getDate());
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(n);
    }
    return buckets;
  }

  function render() {
    monthLabel.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
    grid.innerHTML = '';

    // First weekday of the month, with Monday-first conversion (JS getDay
    // returns Sun=0..Sat=6; we want Mon=0..Sun=6).
    const first = new Date(viewYear, viewMonth, 1);
    const jsDay = first.getDay();
    const offset = (jsDay + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const buckets = buildBuckets();
    const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());

    // Leading blanks
    for (let i = 0; i < offset; i++) {
      grid.appendChild(el('div', { class: 'nc-cal-cell nc-cal-cell-blank' }));
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const k = dayKey(viewYear, viewMonth, day);
      const isToday = k === todayKey;
      const cell = el('div', {
        class: `nc-cal-cell${isToday ? ' is-today' : ''}`,
      });
      cell.appendChild(el('div', { class: 'nc-cal-day-num' }, String(day)));

      const dayNotes = buckets.get(k) || [];
      if (dayNotes.length > 0) {
        const chips = el('div', { class: 'nc-cal-chips' });
        for (const n of dayNotes.slice(0, MAX_CHIPS)) {
          const variant = n.meta.pinned || n.meta.status === 'anchor' ? 'is-anchor'
            : n.meta.status === 'idea' ? 'is-idea'
            : n.meta.status === 'draft' ? 'is-draft'
            : n.meta.status === 'done' ? 'is-done' : '';
          const chip = el('button', {
            type: 'button',
            class: `nc-cal-chip ${variant}`.trim(),
            'data-note-path': n.path,
            title: n.title || 'Untitled',
          }, (n.title || 'Untitled').slice(0, 24));
          chip.addEventListener('click', () => onSelectPath?.(n.path));
          chips.appendChild(chip);
        }
        if (dayNotes.length > MAX_CHIPS) {
          chips.appendChild(el('div', { class: 'nc-cal-more' },
            `+${dayNotes.length - MAX_CHIPS} more`));
        }
        cell.appendChild(chips);
      }

      grid.appendChild(cell);
    }

    // Trailing blanks to complete the last week row
    const totalCells = offset + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < trailing; i++) {
      grid.appendChild(el('div', { class: 'nc-cal-cell nc-cal-cell-blank' }));
    }
  }

  return {
    root,
    update(notes /* selectedPath unused — calendar doesn't highlight selection */) {
      cachedNotes = notes || [];
      render();
    },
  };
}
