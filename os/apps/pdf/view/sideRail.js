/**
 * pdf/view/sideRail.js — outline + bookmarks + reading streak.
 *
 * Outline entries are flat (depth + title + page); rendered with a
 * vertical accent rule and hex bullets per the Codex mock. Active
 * entry is the deepest one whose page ≤ currentPage. Bookmarks
 * have a small per-color hex glyph next to the title. The streak
 * strip is a 14-cell hex grid.
 */

import { el } from '../../../utils/dom.js';

function colorVar(c) {
  switch (c) {
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'cool':   return 'var(--cool, #5aa8ff)';
    default:       return 'var(--accent, #00e5c1)';
  }
}

export function buildSideRail({ onJumpToPage, onRemoveBookmark } = {}) {
  const root = el('aside', { class: 'cx-side' });

  const outlineHead = el('h4', { class: 'cx-side-h' }, 'OUTLINE');
  const outlineList = el('div', { class: 'cx-outline' });
  const outlineEmpty = el('p', { class: 'cx-side-empty' }, 'No outline in this PDF.');
  outlineEmpty.style.display = 'none';

  const bmHead = el('h4', { class: 'cx-side-h' }, 'BOOKMARKS');
  const bmList = el('div', { class: 'cx-bookmarks' });
  const bmEmpty = el('p', { class: 'cx-side-empty' }, 'No bookmarks yet.');

  const streakHead = el('h4', { class: 'cx-side-h cx-streak-h' });
  const streakStrip = el('div', { class: 'cx-streak-strip' });

  root.append(outlineHead, outlineList, outlineEmpty,
    bmHead, bmList, bmEmpty,
    streakHead, streakStrip);

  function findActiveIdx(outline, currentPage) {
    if (!Array.isArray(outline) || !Number.isFinite(currentPage)) return -1;
    let best = -1;
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i].page;
      if (Number.isFinite(p) && p <= currentPage && p >= 1) best = i;
    }
    return best;
  }

  return {
    root,
    update({ outline = [], bookmarks = [], currentPage = 1, streak = [], streakDays = 0 } = {}) {
      // ── Outline ──
      outlineList.innerHTML = '';
      outlineEmpty.style.display = outline.length ? 'none' : '';
      const activeIdx = findActiveIdx(outline, currentPage);
      outline.forEach((entry, i) => {
        const item = el('button', {
          type: 'button',
          class: `cx-ol-item${entry.depth > 0 ? ' cx-ol-deep' : ''}${i === activeIdx ? ' is-active' : ''}`,
          'data-page': entry.page || '',
          title: entry.title,
          style: { paddingLeft: `${6 + entry.depth * 12}px` },
        }, [
          el('span', { class: 'cx-ol-dot' }),
          el('span', { class: 'cx-ol-title' }, entry.title),
          entry.page ? el('span', { class: 'cx-ol-pg' }, String(entry.page)) : null,
        ].filter(Boolean));
        if (entry.page) {
          item.addEventListener('click', () => onJumpToPage?.(entry.page));
        } else {
          item.disabled = true;
        }
        outlineList.appendChild(item);
      });

      // ── Bookmarks ──
      bmList.innerHTML = '';
      bmEmpty.style.display = bookmarks.length ? 'none' : '';
      for (const b of bookmarks) {
        const item = el('div', { class: 'cx-ol-item cx-bm-item', title: b.label });
        const dot = el('span', { class: 'cx-bm-dot', style: { background: colorVar(b.color) } }, '★');
        const title = el('span', { class: 'cx-ol-title' }, b.label);
        const pg = el('span', { class: 'cx-ol-pg' }, String(b.page));
        item.append(dot, title, pg);
        item.addEventListener('click', (e) => {
          if (e.target === dot) {
            onRemoveBookmark?.(b);
            return;
          }
          onJumpToPage?.(b.page);
        });
        bmList.appendChild(item);
      }

      // ── Streak ──
      streakHead.textContent = streakDays > 0
        ? `READING STREAK · ${streakDays}d`
        : 'READING STREAK';
      streakStrip.innerHTML = '';
      for (const b of (streak || [])) {
        const pip = document.createElement('i');
        pip.style.setProperty('--a', String(b.density || 0));
        pip.title = b.key;
        streakStrip.appendChild(pip);
      }
    },
  };
}
