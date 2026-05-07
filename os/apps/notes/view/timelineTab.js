/**
 * notes/view/timelineTab.js — chronological feed grouped by day.
 *
 * Notes are grouped by their last-edited date. Within each day the
 * most recent edit is shown first. A vertical thread runs down the
 * left edge with a hex marker per group.
 */

import { el } from '../../../utils/dom.js';
import { snippet } from '../../../utils/notes-utils.js';

function dayLabel(ts, now = Date.now()) {
  const d = new Date(ts);
  const dToday = new Date(now);
  const sameDay = d.toDateString() === dToday.toDateString();
  if (sameDay) return 'Today';
  const yest = new Date(now - 86400_000);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  // This week → weekday name; older → full date.
  const weekAgo = now - 7 * 86400_000;
  if (ts > weekAgo) {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === dToday.getFullYear() ? undefined : 'numeric' });
}

function dayBucket(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function buildTimelineTab({ onSelectPath } = {}) {
  const root = el('div', { class: 'nc-tl' });

  const empty = el('div', { class: 'nc-tl-empty' }, 'No notes yet.');
  empty.style.display = 'none';
  const list = el('div', { class: 'nc-tl-list' });

  root.append(empty, list);

  let cachedNotes = [];
  let cachedSelected = null;

  function render() {
    list.innerHTML = '';
    if (!cachedNotes.length) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    // Sort by updated desc; missing updated → 0.
    const sorted = [...cachedNotes].sort((a, b) => {
      const au = Number.isFinite(a.meta.updated) ? a.meta.updated : 0;
      const bu = Number.isFinite(b.meta.updated) ? b.meta.updated : 0;
      return bu - au;
    });

    let lastBucket = null;
    const now = Date.now();
    for (const n of sorted) {
      const u = Number.isFinite(n.meta.updated) ? n.meta.updated : 0;
      if (u <= 0) continue;
      const bucket = dayBucket(u);
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        list.appendChild(el('div', { class: 'nc-tl-group' }, [
          el('div', { class: 'nc-tl-marker' }),
          el('div', { class: 'nc-tl-day' }, dayLabel(u, now)),
        ]));
      }
      const item = el('div', {
        class: `nc-tl-item${n.path === cachedSelected ? ' is-selected' : ''}`,
        'data-note-path': n.path,
      });
      const time = new Date(u).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      item.appendChild(el('div', { class: 'nc-tl-meta' }, [
        el('span', { class: 'nc-tl-time' }, time),
        n.meta.status ? el('span', { class: 'nc-tl-status' }, n.meta.status) : null,
        n.meta.pinned ? el('span', { class: 'nc-tl-status' }, '★ pinned') : null,
      ].filter(Boolean)));
      item.appendChild(el('div', { class: 'nc-tl-title' }, n.title || 'Untitled'));
      const snip = snippet(n.body, 110);
      if (snip && snip !== 'Empty document') {
        item.appendChild(el('div', { class: 'nc-tl-snippet' }, snip));
      }
      item.addEventListener('click', () => onSelectPath?.(n.path));
      list.appendChild(item);
    }
  }

  return {
    root,
    update(notes, selectedPath) {
      cachedNotes = notes || [];
      cachedSelected = selectedPath || null;
      render();
    },
  };
}
