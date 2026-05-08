/**
 * photos/view/stage.js — center column of the Lightbox.
 *
 * Composes the featured row (month label + meta), focus preview,
 * hex grid, and scrubber. Pure-ish: holds DOM refs and exposes an
 * `update()` method but does not own filter or selection state —
 * the parent Lightbox controller owns that.
 */

import { el } from '../../../utils/dom.js';
import { buildPhotoCell } from './photoCell.js';
import { buildFocusPreview } from './focusPreview.js';
import { buildScrubberBar } from './scrubber.js';

export function buildStage({ onSelect, onPrev, onNext, onToggleFav, onSetWallpaper, onEdit, onPickMonth } = {}) {
  const root = el('div', { class: 'lb-stage' });

  const featuredTitle = el('h3', { class: 'lb-featured-title' });
  const featuredMeta = el('span', { class: 'lb-featured-meta' });
  const clearFilterBtn = el('button', {
    type: 'button', class: 'lb-featured-clear',
    title: 'Clear filter',
  }, '× clear');
  clearFilterBtn.style.display = 'none';
  clearFilterBtn.addEventListener('click', () => onPickMonth?.(null));
  const featuredRow = el('div', { class: 'lb-featured-row' }, [
    featuredTitle, featuredMeta, clearFilterBtn,
  ]);

  const focus = buildFocusPreview({ onPrev, onNext, onToggleFav, onSetWallpaper, onEdit });
  const grid = el('div', { class: 'lb-grid' });
  const empty = el('div', { class: 'lb-grid-empty' }, [
    el('div', { class: 'lb-grid-empty-title' }, 'No photos here'),
    el('div', { class: 'lb-grid-empty-hint' }, 'Drag images in or paste from the clipboard.'),
  ]);
  empty.style.display = 'none';

  const scrubber = buildScrubberBar({ onPickMonth });

  root.append(featuredRow, focus.root, grid, empty, scrubber.root);

  return {
    root,
    update({ photos, allPhotos, selectedPath, filter, monthBuckets }) {
      // Featured row label.
      const f = filter || {};
      let title = 'All photos';
      let meta = '';
      if (f.month) {
        // Look up the matching bucket label
        const b = monthBuckets?.find((x) => x.key === f.month);
        title = b ? b.label : f.month;
      } else if (f.smart === 'favorites') {
        title = 'Favorites';
      } else if (f.smart === 'recent') {
        title = 'Recently added';
      } else if (allPhotos.length > 0) {
        title = 'All photos';
      }
      const photoCount = photos.length;
      meta = `${photoCount} photo${photoCount === 1 ? '' : 's'}`;
      featuredTitle.textContent = title;
      featuredMeta.textContent = meta;
      clearFilterBtn.style.display = (f.month || f.smart === 'favorites' || f.smart === 'recent') ? '' : 'none';

      // Focus preview.
      const selected = photos.find((p) => p.path === selectedPath)
        || allPhotos.find((p) => p.path === selectedPath)
        || null;
      focus.update(selected);

      // Grid.
      grid.innerHTML = '';
      if (photos.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'flex';
      } else {
        grid.style.display = '';
        empty.style.display = 'none';
        for (const p of photos) {
          grid.appendChild(buildPhotoCell(p, {
            onSelect,
            isActive: p.path === selectedPath,
          }));
        }
      }

      // Scrubber (always built off the FULL list — gives the user a
      // consistent scrub even when the current filter narrows things).
      scrubber.update(monthBuckets || [], f.month || null);
    },
  };
}
