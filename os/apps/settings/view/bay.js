/**
 * settings/view/bay.js — common bay container (header + body).
 *
 * Used by every console bay (Appearance, Apps & dock, Privacy, Sync,
 * Wallpaper, About). The header has a hex badge in the bay's color
 * + a title.
 */

import { el } from '../../../utils/dom.js';

function colorVar(color) {
  switch (color) {
    case 'cool':   return 'var(--cool, #5aa8ff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'green':  return 'var(--green, #2dcf6a)';
    default:       return 'var(--accent, #00e5c1)';
  }
}

export function buildBay({ id, title, color = 'accent', extraClass = '', children = [] }) {
  const root = el('section', {
    class: `mc-bay ${extraClass}`.trim(),
    'data-bay-id': id,
  });
  const head = el('div', { class: 'mc-bay-h' }, [
    el('i', { class: 'mc-bay-badge', style: { background: colorVar(color) } }),
    el('h3', { class: 'mc-bay-title' }, title),
  ]);
  const body = el('div', { class: 'mc-bay-body' }, children);
  root.append(head, body);
  return { root, body, head };
}
