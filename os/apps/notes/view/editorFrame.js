/**
 * notes/view/editorFrame.js — single-note editor frame.
 *
 * The NotesApp is dual-mode:
 *   - mode: 'library' (default) — list/cosmos/calendar/timeline
 *   - mode: 'editor'             — this frame, just one note in a
 *                                  draggable window
 *
 * Renders a title input (the note's title is editable in place),
 * a meta row, a tag input, and a full-height body textarea. Saves
 * are debounced 300ms on input and flushed on blur / window close.
 *
 * Target size: ≤ 220 lines.
 */

import { el } from '../../../utils/dom.js';
import { formatDate } from '../../../utils/notes-utils.js';

export function buildEditorFrame({
  onSaveBody,
  onSaveTitle,
  onSaveTags,
  onTogglePin,
  onSetStatus,
  onDelete,
} = {}) {
  const root = el('div', { class: 'nc-editor-window', tabindex: '0', 'data-allow-context': 'true' });

  const titleInput = el('input', {
    type: 'text',
    class: 'nc-editor-title-input',
    placeholder: 'Untitled',
    spellcheck: 'false',
    autocomplete: 'off',
  });

  const metaRow = el('div', { class: 'nc-editor-meta' });

  const tagsInput = el('input', {
    type: 'text',
    class: 'nc-editor-tags-input',
    placeholder: '#tags, comma or space separated',
    autocomplete: 'off',
    spellcheck: 'false',
  });

  const actionsRow = el('div', { class: 'nc-editor-actions' });
  const pinBtn = el('button', { type: 'button', class: 'nc-btn-ghost' }, '☆ Pin');
  const statusBtn = el('button', { type: 'button', class: 'nc-btn-ghost' }, 'Status: —');
  const delBtn = el('button', { type: 'button', class: 'nc-btn-ghost is-danger' }, 'Delete');
  actionsRow.append(pinBtn, statusBtn, delBtn);

  const bodyEditor = el('textarea', {
    class: 'nc-editor-body',
    spellcheck: 'true',
    placeholder: 'Start writing… use [[Title]] to link other notes, #tag inline to categorize.',
  });

  root.append(
    el('div', { class: 'nc-editor-header' }, [titleInput, metaRow]),
    actionsRow,
    el('div', { class: 'nc-editor-tagrow' }, [tagsInput]),
    bodyEditor,
  );

  // ── Debounce state ─────────────────────────────────────────
  let currentNote = null;
  let bodyTimer = null;
  let titleTimer = null;
  let tagsTimer = null;
  let pendingBody = null;
  let pendingTitle = null;
  let pendingTags = null;

  function flushBody() {
    if (bodyTimer) { clearTimeout(bodyTimer); bodyTimer = null; }
    if (currentNote && pendingBody !== null) {
      onSaveBody?.(currentNote.path, pendingBody);
      pendingBody = null;
    }
  }
  function flushTitle() {
    if (titleTimer) { clearTimeout(titleTimer); titleTimer = null; }
    if (currentNote && pendingTitle !== null) {
      const trimmed = String(pendingTitle).trim();
      onSaveTitle?.(currentNote.path, trimmed || 'Untitled');
      pendingTitle = null;
    }
  }
  function flushTags() {
    if (tagsTimer) { clearTimeout(tagsTimer); tagsTimer = null; }
    if (currentNote && pendingTags !== null) {
      onSaveTags?.(currentNote.path, parseTagList(pendingTags));
      pendingTags = null;
    }
  }
  function flushAll() { flushBody(); flushTitle(); flushTags(); }

  bodyEditor.addEventListener('input', () => {
    pendingBody = bodyEditor.value;
    if (bodyTimer) clearTimeout(bodyTimer);
    bodyTimer = setTimeout(flushBody, 300);
  });
  bodyEditor.addEventListener('blur', flushBody);

  titleInput.addEventListener('input', () => {
    pendingTitle = titleInput.value;
    if (titleTimer) clearTimeout(titleTimer);
    titleTimer = setTimeout(flushTitle, 300);
  });
  titleInput.addEventListener('blur', flushTitle);
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      flushTitle();
      bodyEditor.focus();
    }
  });

  tagsInput.addEventListener('input', () => {
    pendingTags = tagsInput.value;
    if (tagsTimer) clearTimeout(tagsTimer);
    tagsTimer = setTimeout(flushTags, 300);
  });
  tagsInput.addEventListener('blur', flushTags);

  pinBtn.addEventListener('click', () => {
    if (!currentNote) return;
    onTogglePin?.(currentNote.path, !currentNote.meta.pinned);
  });
  statusBtn.addEventListener('click', () => {
    if (!currentNote) return;
    const order = [null, 'anchor', 'idea', 'draft', 'done', 'archived'];
    const i = order.indexOf(currentNote.meta.status || null);
    onSetStatus?.(currentNote.path, order[(i + 1) % order.length]);
  });
  delBtn.addEventListener('click', () => {
    if (!currentNote) return;
    onDelete?.(currentNote.path);
  });

  function parseTagList(s) {
    return String(s || '')
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, '').trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length <= 32);
  }

  function update(note) {
    const switching = !currentNote || (note && currentNote.path !== note.path);
    if (switching) flushAll();
    currentNote = note || null;
    if (!note) return;

    if (switching) {
      titleInput.value = note.title || '';
      bodyEditor.value = String(note.body || '');
      tagsInput.value = (note.meta?.tags || []).map((t) => `#${t}`).join(' ');
      pendingBody = null;
      pendingTitle = null;
      pendingTags = null;
    }

    const meta = note.meta || {};
    metaRow.innerHTML = '';
    if (Number.isFinite(meta.updated) && meta.updated > 0) {
      metaRow.appendChild(el('span', { class: 'nc-chip is-muted' }, `edited ${formatDate(meta.updated)}`));
    }
    if (Number.isFinite(meta.created) && meta.created > 0) {
      metaRow.appendChild(el('span', { class: 'nc-chip is-muted' }, `created ${formatDate(meta.created)}`));
    }
    pinBtn.textContent = meta.pinned ? '★ Unpin' : '☆ Pin';
    statusBtn.textContent = meta.status ? `Status: ${meta.status}` : 'Status: —';
  }

  function focusTitle() {
    try { titleInput.focus(); titleInput.select(); } catch { /* ignore */ }
  }
  function focusBody() {
    try { bodyEditor.focus(); } catch { /* ignore */ }
  }

  return { root, update, flushAll, focusTitle, focusBody };
}
