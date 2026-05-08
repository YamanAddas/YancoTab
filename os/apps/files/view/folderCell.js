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

  // Drop target — coin-onto-cell move (PR-3 will dispatch this).
  if (onDrop) {
    root.addEventListener('dragover', (e) => {
      e.preventDefault();
      root.classList.add('is-drop-target');
    });
    root.addEventListener('dragleave', () => root.classList.remove('is-drop-target'));
    root.addEventListener('drop', (e) => {
      e.preventDefault();
      root.classList.remove('is-drop-target');
      const sourcePath = e.dataTransfer?.getData('text/yancotab-fs-path');
      if (sourcePath) onDrop(sourcePath, spec);
    });
  }

  return root;
}
