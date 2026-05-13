/**
 * notes/view/notesContextMenu.js — right-click menu for the Notes
 * library list / cosmos.
 *
 * Two flavors:
 *   - note     — right-clicked a row / star
 *   - canvas   — right-clicked the empty stage / list body
 *
 * Caller wires action callbacks. Mounts itself on document.body; the
 * caller is responsible for telling it which note is under the
 * pointer (via the showForNote / showForCanvas API).
 *
 * Target size: ≤ 130 lines.
 */

import { el } from '../../../utils/dom.js';

export function buildNotesContextMenu({
  onOpen,
  onOpenInNewWindow,
  onTogglePin,
  onRename,
  onDelete,
  onCopyTitle,
  onCreate,
} = {}) {
  let menuEl = null;

  function close() {
    if (!menuEl) return;
    menuEl.remove();
    menuEl = null;
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onEsc, true);
    window.removeEventListener('blur', close);
  }
  function onOutside(e) { if (menuEl && !menuEl.contains(e.target)) close(); }
  function onEsc(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }

  function positionAt(x, y) {
    if (!menuEl) return;
    menuEl.style.position = 'fixed';
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;
    requestAnimationFrame(() => {
      if (!menuEl) return;
      const r = menuEl.getBoundingClientRect();
      const maxX = window.innerWidth - r.width - 8;
      const maxY = window.innerHeight - r.height - 8;
      if (r.right > window.innerWidth - 8) menuEl.style.left = `${Math.max(8, maxX)}px`;
      if (r.bottom > window.innerHeight - 8) menuEl.style.top = `${Math.max(8, maxY)}px`;
    });
  }

  function showForNote(note, x, y) {
    close();
    if (!note) return;
    menuEl = el('div', { class: 'nc-ctx-menu', role: 'menu' });
    addItem(menuEl, 'Open', () => onOpen?.(note), { primary: true });
    addItem(menuEl, 'Open in new window', () => onOpenInNewWindow?.(note));
    addSep(menuEl);
    addItem(menuEl, note.meta?.pinned ? 'Unpin' : 'Pin', () => onTogglePin?.(note));
    addItem(menuEl, 'Rename…', () => onRename?.(note));
    addItem(menuEl, 'Copy title', () => onCopyTitle?.(note));
    addSep(menuEl);
    addItem(menuEl, 'Delete', () => onDelete?.(note), { danger: true });
    document.body.appendChild(menuEl);
    positionAt(x, y);
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onEsc, true);
    window.addEventListener('blur', close);
  }

  function showForCanvas(x, y) {
    close();
    menuEl = el('div', { class: 'nc-ctx-menu', role: 'menu' });
    addItem(menuEl, 'New note here', () => onCreate?.(), { primary: true });
    document.body.appendChild(menuEl);
    positionAt(x, y);
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onEsc, true);
    window.addEventListener('blur', close);
  }

  function addItem(root, label, fn, opts = {}) {
    if (!fn) return;
    const cls = ['nc-ctx-item'];
    if (opts.primary) cls.push('is-primary');
    if (opts.danger) cls.push('is-danger');
    const it = el('button', { type: 'button', class: cls.join(' '), role: 'menuitem' }, label);
    it.addEventListener('click', () => { close(); fn(); });
    root.appendChild(it);
  }
  function addSep(root) {
    root.appendChild(el('div', { class: 'nc-ctx-sep' }));
  }

  function destroy() { close(); }

  return { showForNote, showForCanvas, close, destroy };
}
