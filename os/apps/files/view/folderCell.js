/**
 * files/view/folderCell.js — single hex cell for a folder or smart room.
 *
 * Tone variants set via the `tone` field:
 *   smart  — accent-tinted, used for Recent/Pinned/Heavy
 *   violet — Projects-style folder
 *   warm   — Photos-style folder
 *   cool   — Music-style folder
 *   rose   — alt accent
 *   default (no class) — plain
 */

import { el } from '../../../utils/dom.js';

export function buildFolderCell(spec, { onSelect, onDrop } = {}) {
  const cls = ['fv-cell', spec.tone ? `fv-cell-${spec.tone}` : '']
    .filter(Boolean).join(' ');
  const root = el('div', {
    class: cls,
    'data-cell-id': spec.id || '',
    'data-cell-path': spec.path || '',
    title: spec.title || spec.label,
    role: 'button',
    tabindex: '0',
  });

  const icon = el('div', { class: 'fv-cell-ic' }, spec.icon || '📂');
  const name = el('div', { class: 'fv-cell-name' }, spec.label || 'Folder');
  const meta = el('div', { class: 'fv-cell-meta' }, spec.meta || '');
  root.append(icon, name, meta);

  if (spec.opacity != null) root.style.opacity = String(spec.opacity);
  if (spec.x != null && spec.y != null) {
    root.style.left = `${spec.x}px`;
    root.style.top = `${spec.y}px`;
  }

  const trigger = () => onSelect?.(spec);
  root.addEventListener('click', trigger);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      trigger();
    }
  });

  // Drop target — coin-onto-cell move.
  if (onDrop) {
    root.addEventListener('dragover', (e) => {
      // Only respond to drags that include our internal path payload.
      // (External OS-file drags are handled at the app-window level.)
      if (e.dataTransfer && [...e.dataTransfer.types].includes('text/yancotab-fs-path')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        root.classList.add('is-drop-target');
      }
    });
    root.addEventListener('dragleave', () => root.classList.remove('is-drop-target'));
    root.addEventListener('drop', (e) => {
      const sourcePath = e.dataTransfer?.getData('text/yancotab-fs-path');
      root.classList.remove('is-drop-target');
      if (!sourcePath) return;
      e.preventDefault();
      onDrop(sourcePath, spec);
      // Brief success flash so the user sees the drop landed.
      root.classList.add('is-drop-flash');
      setTimeout(() => root.classList.remove('is-drop-flash'), 600);
    });
  }

  return root;
}
