/**
 * notes/view/detailPanel.js — selected note's title + meta + body
 * preview + backlinks.
 *
 * PR-2: read-only. Editing returns in PR-3.
 */

import { el } from '../../../utils/dom.js';
import { buildBacklinkMap } from '../engine/wikilinks.js';
import { formatDate } from '../../../utils/notes-utils.js';

function chip(text, mod = '') {
  return el('span', { class: `nc-chip${mod ? ' ' + mod : ''}` }, text);
}

export function buildDetailPanel({ onPin, onSetStatus, onDelete, onCreate, onSelectPath }) {
  const root = el('aside', { class: 'nc-detail' });

  const empty = el('div', { class: 'nc-detail-empty' }, [
    el('h3', {}, 'No note selected'),
    el('p', {}, 'Click a star on the cosmos to open it. Or…'),
    (() => {
      const btn = el('button', { type: 'button', class: 'nc-btn' }, '+ New note');
      btn.addEventListener('click', () => onCreate?.());
      return btn;
    })(),
  ]);

  const titleEl = el('h2', { class: 'nc-detail-title' });
  const metaRow = el('div', { class: 'nc-detail-meta' });
  const actionsRow = el('div', { class: 'nc-detail-actions' });
  const bodyEl = el('div', { class: 'nc-detail-body' });
  const backlinksEl = el('div', { class: 'nc-detail-backlinks' });

  root.append(empty, titleEl, metaRow, actionsRow, bodyEl, backlinksEl);

  // Helper to hide the populated rows when nothing's selected.
  function showSelected(visible) {
    for (const el of [titleEl, metaRow, actionsRow, bodyEl, backlinksEl]) {
      el.style.display = visible ? '' : 'none';
    }
    empty.style.display = visible ? 'none' : 'flex';
  }

  return {
    root,
    update(note, allNotes) {
      if (!note) {
        showSelected(false);
        return;
      }
      showSelected(true);

      // ── Title ──
      titleEl.textContent = note.title || 'Untitled';

      // ── Meta chips ──
      metaRow.innerHTML = '';
      const meta = note.meta || {};
      const tagPrimary = (meta.tags || [])[0];
      if (tagPrimary) metaRow.appendChild(chip(tagPrimary, 'is-tag'));
      if (meta.status) metaRow.appendChild(chip(meta.status));
      if (meta.pinned) metaRow.appendChild(chip('★ pinned'));
      const updated = Number.isFinite(meta.updated) ? meta.updated : 0;
      if (updated > 0) metaRow.appendChild(chip(`edited ${formatDate(updated)}`, 'is-muted'));

      // ── Actions ──
      actionsRow.innerHTML = '';
      const pinBtn = el('button', { type: 'button', class: 'nc-btn-ghost' },
        meta.pinned ? '★ Unpin' : '☆ Pin');
      pinBtn.addEventListener('click', () => onPin?.(note.path, !meta.pinned));
      actionsRow.appendChild(pinBtn);

      // Status cycle: cycles through anchor → idea → draft → done → null.
      const cycleBtn = el('button', { type: 'button', class: 'nc-btn-ghost' },
        meta.status ? `Status: ${meta.status}` : 'Status: —');
      cycleBtn.addEventListener('click', () => {
        const order = [null, 'anchor', 'idea', 'draft', 'done', 'archived'];
        const i = order.indexOf(meta.status || null);
        const next = order[(i + 1) % order.length];
        onSetStatus?.(note.path, next);
      });
      actionsRow.appendChild(cycleBtn);

      const delBtn = el('button', { type: 'button', class: 'nc-btn-ghost is-danger' }, 'Delete');
      delBtn.addEventListener('click', () => onDelete?.(note.path));
      actionsRow.appendChild(delBtn);

      // ── Body preview (read-only in PR-2) ──
      bodyEl.innerHTML = '';
      const body = String(note.body || '').trim();
      if (body) {
        // Render with basic line preservation; wikilinks become clickable spans.
        const parts = body.split(/(\[\[[^\]]+\]\])/g);
        const lookup = new Map(allNotes.map((n) => [n.title.trim().toLowerCase(), n.path]));
        for (const p of parts) {
          if (/^\[\[.+\]\]$/.test(p)) {
            const target = p.slice(2, -2).trim();
            const targetPath = lookup.get(target.toLowerCase());
            const linkEl = el('span', {
              class: targetPath ? 'nc-wikilink' : 'nc-wikilink is-broken',
              title: targetPath ? target : 'No matching note',
            }, target);
            if (targetPath) {
              linkEl.addEventListener('click', () => onSelectPath?.(targetPath));
            }
            bodyEl.appendChild(linkEl);
          } else if (p) {
            bodyEl.appendChild(document.createTextNode(p));
          }
        }
      } else {
        bodyEl.textContent = 'Empty note. Editing lands in the next update.';
        bodyEl.classList.add('is-empty');
      }

      // ── Backlinks ──
      backlinksEl.innerHTML = '';
      const backMap = buildBacklinkMap(allNotes);
      const sources = backMap.get(note.path);
      backlinksEl.appendChild(el('h4', { class: 'nc-detail-h' }, 'LINKED FROM'));
      if (!sources || sources.size === 0) {
        backlinksEl.appendChild(el('p', { class: 'nc-detail-blurb' },
          'No backlinks yet. Use [[Title]] in another note to link to this one.'));
      } else {
        const list = el('ul', { class: 'nc-detail-blink-list' });
        for (const sourcePath of sources) {
          const source = allNotes.find((n) => n.path === sourcePath);
          if (!source) continue;
          const li = el('li', { class: 'nc-detail-blink' }, source.title || 'Untitled');
          li.addEventListener('click', () => onSelectPath?.(sourcePath));
          list.appendChild(li);
        }
        backlinksEl.appendChild(list);
      }
    },
  };
}
