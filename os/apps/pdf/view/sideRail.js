/**
 * pdf/view/sideRail.js — outline + bookmarks + reading streak +
 * saved-quote vault + bookmark constellation.
 *
 * Outline entries are flat (depth + title + page); rendered with a
 * vertical accent rule and hex bullets per the Codex mock. Active
 * entry is the deepest one whose page ≤ currentPage. Bookmarks have
 * a small per-color hex glyph. The constellation is an SVG star-map
 * timeline shown when ≥3 bookmarks exist. The vault shows the most
 * recent quotes saved from this doc.
 */

import { el } from '../../../utils/dom.js';

const MAX_VAULT_VISIBLE = 5;

function colorVar(c) {
  switch (c) {
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'cool':   return 'var(--cool, #5aa8ff)';
    default:       return 'var(--accent, #00e5c1)';
  }
}

export function buildSideRail({ onJumpToPage, onRemoveBookmark, onDeleteQuote } = {}) {
  const root = el('aside', { class: 'cx-side' });

  const outlineHead = el('h4', { class: 'cx-side-h' }, 'OUTLINE');
  const outlineList = el('div', { class: 'cx-outline' });
  const outlineEmpty = el('p', { class: 'cx-side-empty' }, 'No outline in this PDF.');
  outlineEmpty.style.display = 'none';

  const bmHead = el('h4', { class: 'cx-side-h' }, 'BOOKMARKS');
  const constellWrap = el('div', { class: 'cx-constellation-wrap' });
  const bmList = el('div', { class: 'cx-bookmarks' });
  const bmEmpty = el('p', { class: 'cx-side-empty' }, 'No bookmarks yet.');

  const streakHead = el('h4', { class: 'cx-side-h cx-streak-h' });
  const streakStrip = el('div', { class: 'cx-streak-strip' });

  const vaultHead = el('div', { class: 'cx-side-row' }, [
    el('h4', { class: 'cx-side-h cx-side-h-inline' }, 'SAVED QUOTES'),
  ]);
  const vaultList = el('div', { class: 'cx-vault-list' });
  const vaultEmpty = el('p', { class: 'cx-side-empty' },
    'Select text and choose "Save to vault" to keep a quote here.');

  root.append(
    outlineHead, outlineList, outlineEmpty,
    bmHead, constellWrap, bmList, bmEmpty,
    streakHead, streakStrip,
    vaultHead, vaultList, vaultEmpty,
  );

  function findActiveIdx(outline, currentPage) {
    if (!Array.isArray(outline) || !Number.isFinite(currentPage)) return -1;
    let best = -1;
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i].page;
      if (Number.isFinite(p) && p <= currentPage && p >= 1) best = i;
    }
    return best;
  }

  function renderConstellation(bookmarks, totalPages) {
    constellWrap.innerHTML = '';
    if (!bookmarks || bookmarks.length < 3 || !totalPages) return;

    const W = 200, H = 52, PAD = 12;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'cx-constellation');
    svg.setAttribute('aria-hidden', 'true');

    // Baseline connector
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', PAD); line.setAttribute('y1', H / 2);
    line.setAttribute('x2', W - PAD); line.setAttribute('y2', H / 2);
    line.setAttribute('class', 'cx-const-line');
    svg.appendChild(line);

    for (let i = 0; i < bookmarks.length; i++) {
      const b = bookmarks[i];
      const x = PAD + ((b.page - 1) / Math.max(totalPages - 1, 1)) * (W - PAD * 2);
      // Alternate above/below baseline for visual interest
      const y = (i % 2 === 0) ? H * 0.28 : H * 0.72;

      const spoke = document.createElementNS(ns, 'line');
      spoke.setAttribute('x1', x); spoke.setAttribute('y1', H / 2);
      spoke.setAttribute('x2', x); spoke.setAttribute('y2', y);
      spoke.setAttribute('class', 'cx-const-spoke');
      svg.appendChild(spoke);

      const star = document.createElementNS(ns, 'circle');
      star.setAttribute('cx', x); star.setAttribute('cy', y); star.setAttribute('r', '4');
      star.setAttribute('class', `cx-const-star cx-const-star-${b.color || 'accent'}`);
      star.setAttribute('role', 'button');
      star.setAttribute('tabindex', '0');
      star.setAttribute('aria-label', `${b.label}, page ${b.page}`);
      star.style.cursor = 'pointer';
      star.addEventListener('click', () => onJumpToPage?.(b.page));
      star.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') onJumpToPage?.(b.page); });
      svg.appendChild(star);

      // Page label below/above star
      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', x); lbl.setAttribute('y', i % 2 === 0 ? y - 6 : y + 10);
      lbl.setAttribute('class', 'cx-const-label');
      lbl.setAttribute('text-anchor', 'middle');
      lbl.textContent = String(b.page);
      svg.appendChild(lbl);
    }

    constellWrap.appendChild(svg);
  }

  return {
    root,
    update({ outline = [], bookmarks = [], currentPage = 1, totalPages = 0,
             streak = [], streakDays = 0, quotes = [] } = {}) {

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

      // ── Bookmark constellation + list ──
      renderConstellation(bookmarks, totalPages);
      bmList.innerHTML = '';
      bmEmpty.style.display = bookmarks.length ? 'none' : '';
      for (const b of bookmarks) {
        const item = el('div', { class: 'cx-ol-item cx-bm-item', title: b.label });
        const dot = el('span', { class: 'cx-bm-dot', style: { background: colorVar(b.color) } }, '★');
        const title = el('span', { class: 'cx-ol-title' }, b.label);
        const pg = el('span', { class: 'cx-ol-pg' }, String(b.page));
        item.append(dot, title, pg);
        item.addEventListener('click', (e) => {
          if (e.target === dot) { onRemoveBookmark?.(b); return; }
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

      // ── Saved Quotes vault ──
      vaultList.innerHTML = '';
      const visible = (quotes || []).slice(0, MAX_VAULT_VISIBLE);
      vaultEmpty.style.display = visible.length ? 'none' : '';
      for (const q of visible) {
        const item = el('div', { class: 'cx-vault-item' });
        const text = el('div', { class: 'cx-vault-text' },
          q.text.length > 120 ? q.text.slice(0, 120) + '…' : q.text);
        const meta = el('div', { class: 'cx-vault-meta' });
        if (q.page) {
          const pgBtn = el('button', {
            type: 'button', class: 'cx-vault-pg',
            title: `Jump to page ${q.page}`,
            onclick: () => onJumpToPage?.(q.page),
          }, `p.${q.page}`);
          meta.appendChild(pgBtn);
        }
        const delBtn = el('button', {
          type: 'button', class: 'cx-vault-del', title: 'Remove quote',
          onclick: () => onDeleteQuote?.(q),
        }, '×');
        meta.appendChild(delBtn);
        item.append(text, meta);
        item.style.borderLeftColor = colorVar(q.color || 'accent');
        vaultList.appendChild(item);
      }
    },
  };
}
