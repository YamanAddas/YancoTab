/**
 * notes/view/detailPanel.js — selected note's title + meta + body
 * editor + mentioned + backlinks.
 *
 * PR-3: body is an always-editable textarea. Saves are debounced
 * 300ms on input and flushed synchronously on blur and on any
 * update() that targets a different note.
 */

import { el } from '../../../utils/dom.js';
import { buildBacklinkMap, extractWikilinks } from '../engine/wikilinks.js';
import { formatDate } from '../../../utils/notes-utils.js';

function chip(text, mod = '') {
  return el('span', { class: `nc-chip${mod ? ' ' + mod : ''}` }, text);
}

export function buildDetailPanel({ onPin, onSetStatus, onDelete, onCreate, onSelectPath, onSaveBody }) {
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
  const bodyEditor = el('textarea', {
    class: 'nc-detail-body-editor',
    spellcheck: 'true',
    placeholder: 'Write… use [[Title]] to link other notes, #tag to categorize.',
  });
  const mentionedEl = el('div', { class: 'nc-detail-mentioned' });
  const backlinksEl = el('div', { class: 'nc-detail-backlinks' });

  root.append(empty, titleEl, metaRow, actionsRow, bodyEditor, mentionedEl, backlinksEl);

  function showSelected(visible) {
    for (const e of [titleEl, metaRow, actionsRow, bodyEditor, mentionedEl, backlinksEl]) {
      e.style.display = visible ? '' : 'none';
    }
    empty.style.display = visible ? 'none' : 'flex';
  }

  // ── Save state ──────────────────────────────────────────────
  let currentPath = null;
  let saveTimer = null;
  let pendingContent = null;

  function flushPendingSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (currentPath && pendingContent !== null) {
      onSaveBody?.(currentPath, pendingContent);
      pendingContent = null;
    }
  }

  bodyEditor.addEventListener('input', () => {
    pendingContent = bodyEditor.value;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushPendingSave, 300);
  });
  bodyEditor.addEventListener('blur', flushPendingSave);

  return {
    root,
    update(note, allNotes) {
      // If we're switching notes, flush whatever was pending for the old one.
      if (currentPath && (!note || currentPath !== note.path)) {
        flushPendingSave();
      }

      if (!note) {
        currentPath = null;
        showSelected(false);
        return;
      }
      showSelected(true);

      const switchingNote = currentPath !== note.path;
      currentPath = note.path;

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

      // ── Body editor ──
      // Only refresh textarea content when switching notes — avoid
      // clobbering the user's in-flight edits during background re-renders.
      if (switchingNote) {
        bodyEditor.value = String(note.body || '');
        pendingContent = null;
      }

      // ── Mentioned (forward wikilinks) ──
      mentionedEl.innerHTML = '';
      const lookup = new Map(allNotes.map((n) => [n.title.trim().toLowerCase(), n.path]));
      const titleByLower = new Map(allNotes.map((n) => [n.title.trim().toLowerCase(), n.title]));
      const mentioned = extractWikilinks(note.body);
      mentionedEl.appendChild(el('h4', { class: 'nc-detail-h' }, 'MENTIONED'));
      if (mentioned.length === 0) {
        mentionedEl.appendChild(el('p', { class: 'nc-detail-blurb' },
          'Use [[Title]] in the body to link to other notes.'));
      } else {
        const list = el('ul', { class: 'nc-detail-blink-list' });
        for (const targetLc of mentioned) {
          const targetPath = lookup.get(targetLc);
          const display = titleByLower.get(targetLc) || targetLc;
          const li = el('li', {
            class: targetPath ? 'nc-detail-blink' : 'nc-detail-blink is-broken',
            title: targetPath ? '' : 'No matching note',
          }, display);
          if (targetPath) {
            li.addEventListener('click', () => onSelectPath?.(targetPath));
          }
          list.appendChild(li);
        }
        mentionedEl.appendChild(list);
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
    flushPendingSave,
  };
}
