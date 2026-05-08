/**
 * files/view/breadcrumb.js — top row above the stage.
 *
 * Layout: ⌘ <Vault> / <Recent | folder name> | view-toggle | zoom.
 */

import { el } from '../../../utils/dom.js';

const VIEWS = [
  { id: 'honeycomb', label: 'Honeycomb' },
  { id: 'grid',      label: 'Grid' },
  { id: 'list',      label: 'List' },
];

export function buildBreadcrumb({ onPickView, onZoomIn, onZoomOut, onZoomReset } = {}) {
  const root = el('div', { class: 'fv-crumb-row' });

  const crumb = el('div', { class: 'fv-crumb' });

  const viewToggle = el('div', { class: 'fv-view' });
  for (const def of VIEWS) {
    const span = el('button', {
      type: 'button',
      class: 'fv-view-pill',
      'data-view': def.id,
    }, def.label);
    span.addEventListener('click', () => onPickView?.(def.id));
    viewToggle.appendChild(span);
  }

  const zoom = el('div', { class: 'fv-zoom' });
  const zOut = el('button', { type: 'button', class: 'fv-zoom-btn', title: 'Zoom out' }, '−');
  const zRst = el('button', { type: 'button', class: 'fv-zoom-btn', title: 'Reset zoom' }, '⌖');
  const zIn  = el('button', { type: 'button', class: 'fv-zoom-btn', title: 'Zoom in' }, '+');
  zOut.addEventListener('click', () => onZoomOut?.());
  zRst.addEventListener('click', () => onZoomReset?.());
  zIn.addEventListener('click', () => onZoomIn?.());
  zoom.append(zOut, zRst, zIn);

  root.append(crumb, viewToggle, zoom);

  return {
    root,
    update({ rootLabel = 'Vault', segment = '', view = 'honeycomb' }) {
      crumb.innerHTML = '';
      crumb.append(
        el('span', { class: 'fv-crumb-prefix' }, '⌘ '),
        el('b', {}, rootLabel),
        document.createTextNode(' / '),
        el('span', { class: 'fv-crumb-seg' }, segment || ''),
      );
      // Highlight active view pill.
      for (const pill of viewToggle.querySelectorAll('.fv-view-pill')) {
        pill.classList.toggle('is-active', pill.dataset.view === view);
      }
    },
  };
}
