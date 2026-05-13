/**
 * pdf/v3/chrome/notePopover.js — floating dialog for editing sticky
 * notes (create + edit modes).
 *
 * Create mode: opened at click position by noteTool; on Save calls
 * onSave({body}); on Cancel calls onCancel().
 *
 * Edit mode: opened from a note pip click with the existing note;
 * Save calls onSave({id, body}), Delete calls onDelete(id).
 *
 * Dismisses on outside click or Escape. Anchored near the screen
 * position, clamped to the viewport.
 *
 * Target size: ≤ 200 lines.
 */

import { el } from '../../../../utils/dom.js';

export function buildNotePopover({ onSave, onDelete, onCancel } = {}) {
  const root = el('div', { class: 'pdf-note-popover', role: 'dialog', 'aria-label': 'Note' });
  root.style.display = 'none';

  const header = el('div', { class: 'pdf-note-popover-h' }, 'Note');
  const ta = el('textarea', {
    class: 'pdf-note-popover-body',
    placeholder: 'Type your note…',
    maxlength: '2000',
    rows: '4',
  });
  const actions = el('div', { class: 'pdf-note-popover-actions' });
  const saveBtn = el('button', {
    type: 'button', class: 'pdf-note-btn pdf-note-btn-primary',
  }, 'Save');
  const deleteBtn = el('button', {
    type: 'button', class: 'pdf-note-btn pdf-note-btn-danger',
  }, 'Delete');
  const cancelBtn = el('button', {
    type: 'button', class: 'pdf-note-btn',
  }, 'Cancel');
  actions.append(deleteBtn, cancelBtn, saveBtn);
  root.append(header, ta, actions);

  let mode = 'create';     // 'create' | 'edit'
  let currentNoteId = null;
  let outsideHandler = null;
  let escHandler = null;

  saveBtn.addEventListener('click', () => {
    const body = ta.value.trim();
    if (!body) return;
    const payload = mode === 'edit' ? { id: currentNoteId, body } : { body };
    hide();
    onSave?.(payload);
  });
  deleteBtn.addEventListener('click', () => {
    const id = currentNoteId;
    hide();
    onDelete?.(id);
  });
  cancelBtn.addEventListener('click', () => {
    hide();
    onCancel?.();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveBtn.click();
    }
  });

  function showAt({ clientX, clientY, page, note } = {}) {
    hide();
    if (note) {
      mode = 'edit';
      currentNoteId = note.id;
      ta.value = note.body || '';
      header.textContent = `Note · Page ${page ?? note.page}`;
      deleteBtn.style.display = '';
    } else {
      mode = 'create';
      currentNoteId = null;
      ta.value = '';
      header.textContent = `New note · Page ${page ?? '?'}`;
      deleteBtn.style.display = 'none';
    }
    root.style.display = 'flex';
    root.style.position = 'fixed';
    root.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      const pr = root.getBoundingClientRect();
      let left = (clientX ?? window.innerWidth / 2) + 12;
      let top = (clientY ?? window.innerHeight / 2) - pr.height / 2;
      if (left + pr.width > window.innerWidth - 8) left = (clientX ?? 0) - pr.width - 12;
      if (left < 8) left = 8;
      if (top < 8) top = 8;
      if (top + pr.height > window.innerHeight - 8) top = window.innerHeight - pr.height - 8;
      root.style.left = `${Math.round(left)}px`;
      root.style.top = `${Math.round(top)}px`;
      root.style.visibility = 'visible';
      try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      catch { /* best-effort */ }
    });
    bindDismiss();
  }

  function hide() {
    root.style.display = 'none';
    currentNoteId = null;
    unbindDismiss();
  }

  function isOpen() { return root.style.display !== 'none'; }

  function bindDismiss() {
    unbindDismiss();
    outsideHandler = (e) => {
      if (root.contains(e.target)) return;
      // Don't dismiss if clicking another note pip — let that flow take over.
      if (e.target?.closest?.('.pdf-note-pip')) return;
      hide();
      onCancel?.();
    };
    escHandler = (e) => {
      if (e.key === 'Escape') { hide(); onCancel?.(); }
    };
    setTimeout(() => {
      document.addEventListener('pointerdown', outsideHandler, true);
      document.addEventListener('keydown', escHandler, true);
    }, 0);
  }

  function unbindDismiss() {
    if (outsideHandler) document.removeEventListener('pointerdown', outsideHandler, true);
    if (escHandler) document.removeEventListener('keydown', escHandler, true);
    outsideHandler = null;
    escHandler = null;
  }

  function destroy() {
    unbindDismiss();
    root.remove();
  }

  return { root, showAt, hide, isOpen, destroy };
}
