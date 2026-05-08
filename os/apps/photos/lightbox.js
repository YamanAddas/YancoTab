/**
 * photos/lightbox.js — Lightbox controller.
 *
 * Composes side rail + stage + info panel. Holds filter + selected
 * path state. Receives raw fs photos from PhotosApp via setPhotos();
 * decorates them with engine helpers and pushes the result through
 * the views.
 *
 * No fs / kernel access here — all side effects flow back through
 * the callbacks supplied at construction.
 */

import { el } from '../../utils/dom.js';

import { decoratePhotos } from './engine/state.js';
import { applyFilter, applySort, emptyFilter } from './engine/filters.js';
import { libraryCounts } from './engine/aggregate.js';
import { monthBuckets } from './engine/scrubber.js';

import { buildSideRail } from './view/sideRail.js';
import { buildStage } from './view/stage.js';
import { buildInfoPanel } from './view/infoPanel.js';

export function buildLightbox({
  onEdit,
  onSetWallpaper,
  onOpenInBrowser,
  onSendToFiles,
  onDelete,
  onToggleFavorite,
  getFavorites,
  getSortMode,
} = {}) {
  let rawPhotos = [];
  let filter = emptyFilter();
  let selectedPath = null;
  let visiblePhotos = [];

  const root = el('div', { class: 'lb' });

  const side = buildSideRail({
    onPickSmart: (id) => {
      filter = { ...filter, smart: filter.smart === id ? 'all' : id };
      // Switching smart filters drops the month filter to avoid a dead state.
      if (filter.smart !== 'all') filter.month = null;
      rerender();
    },
  });

  const stage = buildStage({
    onSelect: (path) => { selectedPath = path; rerender(); },
    onPrev: () => move(-1),
    onNext: () => move(1),
    onToggleFav: () => {
      if (!selectedPath) return;
      onToggleFavorite?.(selectedPath);
      // PhotosApp will refresh photos via setPhotos.
    },
    onSetWallpaper: () => selectedPath && onSetWallpaper?.(selectedPath),
    onEdit: () => selectedPath && onEdit?.(selectedPath),
    onPickMonth: (key) => {
      filter = { ...filter, month: key };
      rerender();
    },
  });

  const info = buildInfoPanel({
    onSetWallpaper: (path) => onSetWallpaper?.(path),
    onOpenInBrowser: (path) => onOpenInBrowser?.(path),
    onSendToFiles: (path) => onSendToFiles?.(path),
    onEdit: (path) => onEdit?.(path),
    onDelete: (path) => onDelete?.(path),
  });

  root.append(side.root, stage.root, info.root);

  function move(delta) {
    if (!visiblePhotos.length) return;
    const i = visiblePhotos.findIndex((p) => p.path === selectedPath);
    const next = i < 0 ? 0 : (i + delta + visiblePhotos.length) % visiblePhotos.length;
    selectedPath = visiblePhotos[next].path;
    rerender();
  }

  function rerender() {
    const favorites = getFavorites?.() || new Set();
    const sortMode = getSortMode?.() || 'date';
    const decorated = decoratePhotos(rawPhotos, { favorites });
    const sorted = applySort(decorated, sortMode);
    const filtered = applyFilter(sorted, filter);
    visiblePhotos = filtered;

    // Pin selection if it left the visible set.
    if (selectedPath && !decorated.find((p) => p.path === selectedPath)) {
      selectedPath = filtered[0]?.path || null;
    } else if (!selectedPath && filtered.length) {
      selectedPath = filtered[0].path;
    }

    const counts = libraryCounts(decorated);
    const buckets = monthBuckets(decorated);

    side.update(counts, filter);
    stage.update({
      photos: filtered,
      allPhotos: decorated,
      selectedPath,
      filter,
      monthBuckets: buckets,
    });
    info.update(decorated.find((p) => p.path === selectedPath) || null);
  }

  return {
    root,
    setPhotos(photos) {
      rawPhotos = Array.isArray(photos) ? photos : [];
      rerender();
    },
    /** Allow PhotosApp to focus a specific photo (e.g. after import). */
    setSelected(path) {
      selectedPath = path;
      rerender();
    },
    getSelected() { return selectedPath; },
    /** Keyboard navigation forwarded from the app shell. */
    keyMove(delta) { move(delta); },
  };
}
