/**
 * notes/view/editorFrame.js — single-note editor frame.
 *
 * Built around a textarea but augmented with:
 *   - Markdown preview toggle (Ctrl+/) using engine/markdown.js
 *   - List-item auto-continue on Enter (engine/listAutoContinue.js)
 *   - Persistent undo / redo stack (engine/historyStack.js + caller
 *     persists via persistence.saveHistoryFor)
 *   - Inline Find bar (Ctrl+F) (editorFindBar.js)
 *   - Status bar with word/char count + save state (editorStatusBar.js)
 *   - Keyboard shortcuts: Ctrl+S (no-op + flush), Ctrl+P (print),
 *     Ctrl+W (close), Ctrl+Z / Ctrl+Y (undo / redo), Ctrl+/ (preview)
 *
 * Target size: ≤ 480 lines.
 */

import { el } from '../../../utils/dom.js';
import { formatDate } from '../../../utils/notes-utils.js';
import { renderMarkdown, countWords } from '../engine/markdown.js';
import { handleListEnter } from '../engine/listAutoContinue.js';
import { createHistoryStack } from '../engine/historyStack.js';
import { buildEditorFindBar } from './editorFindBar.js';
import { buildEditorStatusBar } from './editorStatusBar.js';

export function buildEditorFrame({
  onSaveBody,
  onSaveTitle,
  onSaveTags,
  onTogglePin,
  onSetStatus,
  onDelete,
  onExportMd,
  onPrint,
  onClose,
  loadHistory,    // (path) → serialised history snapshot or null
  saveHistory,    // (path, snapshot) → persist
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
    autocomplete: 'off', spellcheck: 'false',
  });

  // ── Toolbar (undo/redo/preview/print/export) ──
  const undoBtn = el('button', { type: 'button', class: 'nc-btn-icon', title: 'Undo (Ctrl+Z)' }, '↶');
  const redoBtn = el('button', { type: 'button', class: 'nc-btn-icon', title: 'Redo (Ctrl+Y)' }, '↷');
  const findBtn = el('button', { type: 'button', class: 'nc-btn-icon', title: 'Find (Ctrl+F)' }, '🔍');
  const previewBtn = el('button', { type: 'button', class: 'nc-btn-icon', title: 'Toggle markdown preview (Ctrl+/)' }, '◐');
  const printBtn = el('button', { type: 'button', class: 'nc-btn-icon', title: 'Print (Ctrl+P)' }, '⎙');
  const exportBtn = el('button', { type: 'button', class: 'nc-btn-icon', title: 'Export as Markdown' }, '↓');
  const toolbarRow = el('div', { class: 'nc-editor-toolbar' }, [
    undoBtn, redoBtn,
    el('span', { class: 'nc-editor-toolbar-sep' }),
    findBtn, previewBtn,
    el('span', { class: 'nc-editor-toolbar-sep' }),
    printBtn, exportBtn,
  ]);

  // ── Status row (pin / status / delete buttons) ──
  const actionsRow = el('div', { class: 'nc-editor-actions' });
  const pinBtn = el('button', { type: 'button', class: 'nc-btn-ghost' }, '☆ Pin');
  const statusBtn = el('button', { type: 'button', class: 'nc-btn-ghost' }, 'Status: —');
  const delBtn = el('button', { type: 'button', class: 'nc-btn-ghost is-danger' }, 'Delete');
  actionsRow.append(pinBtn, statusBtn, delBtn);

  // ── Body / preview area ──
  const bodyEditor = el('textarea', {
    class: 'nc-editor-body',
    spellcheck: 'true',
    placeholder: 'Start writing… use [[Title]] to link other notes, #tag inline to categorize.\n\nMarkdown supported: **bold**, *italic*, # heading, - list, - [ ] task, > quote, `code`.',
  });
  const previewPane = el('div', { class: 'nc-editor-preview', 'aria-hidden': 'true' });
  previewPane.style.display = 'none';

  const findBar = buildEditorFindBar({ getTextarea: () => bodyEditor });
  const statusBar = buildEditorStatusBar();

  root.append(
    el('div', { class: 'nc-editor-header' }, [titleInput, metaRow]),
    toolbarRow,
    actionsRow,
    findBar.root,
    el('div', { class: 'nc-editor-tagrow' }, [tagsInput]),
    el('div', { class: 'nc-editor-bodywrap' }, [bodyEditor, previewPane]),
    statusBar.root,
  );

  // ── State ─────────────────────────────────────────────────────
  let currentNote = null;
  let bodyTimer = null;
  let titleTimer = null;
  let tagsTimer = null;
  let pendingBody = null;
  let pendingTitle = null;
  let pendingTags = null;
  let history = null;            // historyStack — created when a note loads
  let suppressHistoryPush = false;
  let previewOpen = false;

  // ── Flush helpers ─────────────────────────────────────────────
  function flushBody() {
    if (bodyTimer) { clearTimeout(bodyTimer); bodyTimer = null; }
    if (currentNote && pendingBody !== null) {
      const body = pendingBody;
      pendingBody = null;
      statusBar.setSaveState({ state: 'saving' });
      onSaveBody?.(currentNote.path, body);
      if (history && !suppressHistoryPush) {
        history.push(body);
        persistHistory();
      }
      statusBar.setSaveState({ state: 'saved', ts: Date.now() });
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

  function persistHistory() {
    if (!history || !currentNote || !saveHistory) return;
    try { saveHistory(currentNote.path, history.serialise()); } catch { /* ignore */ }
  }

  // ── Body input ────────────────────────────────────────────────
  bodyEditor.addEventListener('input', () => {
    pendingBody = bodyEditor.value;
    history?.setLive(pendingBody);
    if (bodyTimer) clearTimeout(bodyTimer);
    statusBar.setSaveState({ state: 'edited' });
    updateCounts();
    findBar.refresh();
    updateUndoButtons();
    bodyTimer = setTimeout(flushBody, 300);
  });
  bodyEditor.addEventListener('blur', flushBody);

  // ── List auto-continue + shortcuts on body ────────────────────
  bodyEditor.addEventListener('keydown', (e) => {
    // Shortcuts that work inside the textarea.
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.shiftKey && e.key === 'z') {
      e.preventDefault(); doUndo(); return;
    }
    if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
      e.preventDefault(); doRedo(); return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const r = handleListEnter({
        value: bodyEditor.value,
        selectionStart: bodyEditor.selectionStart,
        selectionEnd: bodyEditor.selectionEnd,
      });
      if (r.handled) {
        e.preventDefault();
        bodyEditor.value = r.value;
        bodyEditor.selectionStart = r.selectionStart;
        bodyEditor.selectionEnd = r.selectionEnd;
        // Fire input handlers manually since we bypassed default.
        bodyEditor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });

  // ── Title + tags ──────────────────────────────────────────────
  titleInput.addEventListener('input', () => {
    pendingTitle = titleInput.value;
    if (titleTimer) clearTimeout(titleTimer);
    statusBar.setSaveState({ state: 'edited' });
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

  // ── Toolbar wiring ────────────────────────────────────────────
  undoBtn.addEventListener('click', doUndo);
  redoBtn.addEventListener('click', doRedo);
  findBtn.addEventListener('click', () => findBar.show());
  previewBtn.addEventListener('click', togglePreview);
  printBtn.addEventListener('click', () => onPrint?.(currentNote));
  exportBtn.addEventListener('click', () => onExportMd?.(currentNote));

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

  // ── Window-level shortcuts (Ctrl+F / S / P / W / /) ───────────
  root.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (e.key === 'f') { e.preventDefault(); findBar.show(window.getSelection?.()?.toString() || ''); }
    else if (e.key === 's') { e.preventDefault(); flushAll(); }
    else if (e.key === 'p') { e.preventDefault(); onPrint?.(currentNote); }
    else if (e.key === 'w') { e.preventDefault(); flushAll(); onClose?.(); }
    else if (e.key === '/') { e.preventDefault(); togglePreview(); }
  });

  // ── Undo / redo ───────────────────────────────────────────────
  function doUndo() {
    if (!history) return;
    if (!history.canUndo()) return;
    flushBody();   // ensure live state is up-to-date
    const r = history.undo();
    suppressHistoryPush = true;
    bodyEditor.value = r.body;
    pendingBody = r.body;
    onSaveBody?.(currentNote.path, r.body);
    persistHistory();
    suppressHistoryPush = false;
    updateCounts();
    updateUndoButtons();
    if (previewOpen) renderPreview();
  }
  function doRedo() {
    if (!history) return;
    if (!history.canRedo()) return;
    const r = history.redo();
    suppressHistoryPush = true;
    bodyEditor.value = r.body;
    pendingBody = r.body;
    onSaveBody?.(currentNote.path, r.body);
    persistHistory();
    suppressHistoryPush = false;
    updateCounts();
    updateUndoButtons();
    if (previewOpen) renderPreview();
  }
  function updateUndoButtons() {
    undoBtn.disabled = !history || !history.canUndo();
    redoBtn.disabled = !history || !history.canRedo();
  }

  // ── Preview toggle ────────────────────────────────────────────
  function togglePreview() {
    previewOpen = !previewOpen;
    if (previewOpen) renderPreview();
    bodyEditor.style.display = previewOpen ? 'none' : '';
    previewPane.style.display = previewOpen ? 'block' : 'none';
    previewBtn.classList.toggle('is-active', previewOpen);
    statusBar.setMode(previewOpen ? 'preview' : 'plain');
  }
  function renderPreview() {
    const md = bodyEditor.value;
    previewPane.innerHTML = renderMarkdown(md);
  }

  // ── Counts + tags parsing ─────────────────────────────────────
  function updateCounts() {
    const v = bodyEditor.value;
    statusBar.setCounts({ words: countWords(v), chars: v.length });
  }
  function parseTagList(s) {
    return String(s || '')
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, '').trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length <= 32);
  }

  // ── Public API ────────────────────────────────────────────────
  function update(note) {
    const switching = !currentNote || (note && currentNote.path !== note.path);
    if (switching) flushAll();
    currentNote = note || null;
    if (!note) {
      history = null;
      updateUndoButtons();
      return;
    }
    if (switching) {
      titleInput.value = note.title || '';
      bodyEditor.value = String(note.body || '');
      tagsInput.value = (note.meta?.tags || []).map((t) => `#${t}`).join(' ');
      pendingBody = null; pendingTitle = null; pendingTags = null;
      // Hydrate history from storage; fall back to a fresh stack.
      const snap = loadHistory?.(note.path);
      history = snap
        ? createHistoryStack({ initial: snap })
        : createHistoryStack({ initialBody: bodyEditor.value });
      updateCounts();
      updateUndoButtons();
      statusBar.setSaveState({ state: 'saved', ts: note.meta?.updated || Date.now() });
      if (previewOpen) renderPreview();
    } else {
      // Same note, external refresh — only update meta chrome, don't
      // clobber the body the user might still be editing.
      updateCounts();
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

  function destroy() {
    try { findBar.hide(); } catch { /* ignore */ }
    try { statusBar.destroy(); } catch { /* ignore */ }
  }

  return { root, update, flushAll, focusTitle, focusBody, destroy };
}
