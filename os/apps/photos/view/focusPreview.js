/**
 * photos/view/focusPreview.js — large featured image at the top of
 * the Lightbox stage.
 *
 * Layout: 16:9 box with image, vignette, prev/next nav, and a row of
 * floating controls (favorite / wallpaper / edit). Empty state when
 * no photo is selected.
 */

import { el } from '../../../utils/dom.js';

export function buildFocusPreview({ onPrev, onNext, onToggleFav, onSetWallpaper, onEdit } = {}) {
  const root = el('div', { class: 'lb-focus' });

  const empty = el('div', { class: 'lb-focus-empty' }, [
    el('div', { class: 'lb-focus-empty-title' }, 'No photo selected'),
    el('div', { class: 'lb-focus-empty-hint' }, 'Pick a hex below.'),
  ]);

  const img = el('div', { class: 'lb-focus-img' });
  const vignette = el('div', { class: 'lb-focus-vignette' });

  const prev = el('button', {
    type: 'button', class: 'lb-focus-nav lb-focus-nav-left',
    title: 'Previous (←)', 'aria-label': 'Previous',
  }, '‹');
  const next = el('button', {
    type: 'button', class: 'lb-focus-nav lb-focus-nav-right',
    title: 'Next (→)', 'aria-label': 'Next',
  }, '›');
  prev.addEventListener('click', () => onPrev?.());
  next.addEventListener('click', () => onNext?.());

  const favBtn = el('button', {
    type: 'button', class: 'lb-focus-ctrl-btn',
    title: 'Favorite (F)',
    'aria-label': 'Toggle favorite',
  }, '♡');
  const wpBtn = el('button', {
    type: 'button', class: 'lb-focus-ctrl-btn',
    title: 'Set as wallpaper',
    'aria-label': 'Set as wallpaper',
  }, '↗');
  const editBtn = el('button', {
    type: 'button', class: 'lb-focus-ctrl-btn',
    title: 'Open editor (Enter)',
    'aria-label': 'Open editor',
  }, '⌖');
  favBtn.addEventListener('click', () => onToggleFav?.());
  wpBtn.addEventListener('click', () => onSetWallpaper?.());
  editBtn.addEventListener('click', () => onEdit?.());

  const ctrls = el('div', { class: 'lb-focus-ctrls' }, [favBtn, wpBtn, editBtn]);

  root.append(empty, img, vignette, prev, next, ctrls);

  function showEmpty(visible) {
    empty.style.display = visible ? 'flex' : 'none';
    for (const e of [img, vignette, prev, next, ctrls]) {
      e.style.display = visible ? 'none' : '';
    }
  }

  return {
    root,
    update(photo) {
      if (!photo) {
        showEmpty(true);
        return;
      }
      showEmpty(false);
      const src = photo.dataUrl || photo.thumbnail;
      img.style.backgroundImage = src ? `url("${String(src).replace(/"/g, '\\"')}")` : '';
      favBtn.textContent = photo.favorite ? '♥' : '♡';
      favBtn.classList.toggle('is-fav', !!photo.favorite);
    },
  };
}
