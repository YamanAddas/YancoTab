/**
 * historyView.js — full chronological history grouped by day.
 *
 * Replaces the right-rail tape area when the History tab is active.
 * Reads the same `tape` array as the Tape view but groups by UTC day.
 */
import { el } from '../../utils/dom.js';
import { groupTapeByDay } from './engine.js';

function fmtTime(ts) {
  if (!ts) return '--:--';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/**
 * Render the history scroll area into a container (typically the
 * shared `.calc-tape` element). Caller wipes the container; we fill.
 */
export function renderHistory(containerEl, tape, onReuse) {
  containerEl.textContent = '';
  if (!Array.isArray(tape) || tape.length === 0) {
    containerEl.appendChild(el('div', { class: 'calc-tape-empty' }, '— no history yet —'));
    return;
  }
  const groups = groupTapeByDay(tape);
  for (const g of groups) {
    containerEl.appendChild(el('div', { class: 'calc-history-day' }, [
      el('span', { class: 'calc-history-day-label' }, g.dayLabel),
      el('span', { class: 'calc-history-day-count' }, `${g.entries.length}`),
    ]));
    for (const t of g.entries) {
      containerEl.appendChild(el('div', {
        class: 'calc-tape-line',
        title: 'Tap to reuse this result',
        onclick: () => onReuse(t.result),
      }, [
        el('span', { class: 'ts' }, fmtTime(t.ts)),
        el('span', { class: 'expr' }, t.expr || ''),
        el('span', { class: 'res' }, t.result || ''),
      ]));
    }
  }
}
