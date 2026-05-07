/**
 * notes/view/sideRail.js — Smart / Constellations (tags) / Mood.
 */

import { el } from '../../../utils/dom.js';
import { tagCounts, smartCounts } from '../engine/filters.js';

const SMART_DEFS = [
  { id: 'pinned', label: '★ Pinned' },
  { id: 'recent', label: '⏱ Recent' },
  { id: 'done',   label: '✓ Done' },
  { id: 'today',  label: '⚡ Today' },
];

const TAG_COLORS = ['accent', 'violet', 'warm', 'rose', 'cool', 'green'];

const MOOD_DEFS = [
  { id: 'idea',     label: 'idea' },
  { id: 'draft',    label: 'draft' },
  { id: 'done',     label: 'done' },
  { id: 'archived', label: 'archived' },
];

function colorVar(c) {
  switch (c) {
    case 'cool':   return 'var(--cool, #5aa8ff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'green':  return 'var(--green, #2dcf6a)';
    default:       return 'var(--accent, #00e5c1)';
  }
}

export function buildSideRail({ onPickSmart, onPickTag, onPickMood, onClearFilters }) {
  const root = el('aside', { class: 'nc-side' });

  const smartHead = el('h4', { class: 'nc-side-h' }, 'SMART');
  const smartList = el('div', { class: 'nc-side-list' });
  const tagHead = el('h4', { class: 'nc-side-h' }, 'CONSTELLATIONS');
  const tagList = el('div', { class: 'nc-side-list' });
  const moodHead = el('h4', { class: 'nc-side-h' }, 'MOOD');
  const moodRow = el('div', { class: 'nc-mood' });

  const clearBtn = el('button', {
    type: 'button', class: 'nc-side-clear',
  }, 'Clear filters');
  clearBtn.addEventListener('click', () => onClearFilters?.());

  root.append(smartHead, smartList, tagHead, tagList, moodHead, moodRow, clearBtn);

  // Tag color is assigned by *index* on first render so the same
  // tag keeps the same color across renders within a session.
  const tagColors = new Map();

  return {
    root,
    update(notes, filter) {
      // ── Smart ──
      const sCounts = smartCounts(notes);
      smartList.innerHTML = '';
      for (const def of SMART_DEFS) {
        const isActive = filter.smart === def.id;
        const item = el('button', {
          type: 'button',
          class: `nc-side-item${isActive ? ' is-active' : ''}`,
          'data-smart': def.id,
        }, [
          el('span', { class: 'nc-side-item-label' }, def.label),
          el('span', { class: 'nc-side-item-count' }, String(sCounts[def.id] || 0)),
        ]);
        item.addEventListener('click', () => onPickSmart?.(def.id));
        smartList.appendChild(item);
      }

      // ── Tags / Constellations ──
      const tags = tagCounts(notes);
      tagList.innerHTML = '';
      for (const { tag, count } of tags) {
        if (!tagColors.has(tag)) {
          tagColors.set(tag, TAG_COLORS[tagColors.size % TAG_COLORS.length]);
        }
        const isActive = filter.tag === tag;
        const item = el('button', {
          type: 'button',
          class: `nc-side-item${isActive ? ' is-active' : ''}`,
          'data-tag': tag,
        }, [
          el('i', { class: 'nc-side-dot', style: { background: colorVar(tagColors.get(tag)) } }),
          el('span', { class: 'nc-side-item-label' }, tag),
          el('span', { class: 'nc-side-item-count' }, String(count)),
        ]);
        item.addEventListener('click', () => onPickTag?.(tag));
        tagList.appendChild(item);
      }
      if (tags.length === 0) {
        tagList.appendChild(el('p', { class: 'nc-side-empty' },
          'No tags yet. Add #tag to a note body.'));
      }

      // ── Mood ──
      moodRow.innerHTML = '';
      for (const m of MOOD_DEFS) {
        const isActive = filter.status === m.id;
        const chip = el('button', {
          type: 'button',
          class: `nc-mood-chip${isActive ? ' is-active' : ''}`,
          'data-mood': m.id,
        }, m.label);
        chip.addEventListener('click', () => onPickMood?.(m.id));
        moodRow.appendChild(chip);
      }

      // Show clear button only when something is active.
      const hasFilter = !!(filter.smart || filter.tag || filter.status || (filter.search && filter.search.trim()));
      clearBtn.style.display = hasFilter ? 'block' : 'none';
    },
    getTagColor(tag) { return tagColors.get(tag) || 'accent'; },
  };
}
