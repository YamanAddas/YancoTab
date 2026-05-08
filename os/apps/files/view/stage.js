/**
 * files/view/stage.js — honeycomb arena.
 *
 * Renders folder cells (programmatic hex layout) + file coins (ring
 * around perimeter). Fires onSelectCell / onSelectCoin / onMoveFile
 * back up to the orchestrator.
 *
 * The stage has THREE render paths:
 *   - 'honeycomb': hex cells + coins (default)
 *   - 'grid':      square thumbnail grid (delegated to gridView.js)
 *   - 'list':      tall list rows (delegated to listView.js)
 */

import { el } from '../../../utils/dom.js';
import { buildFolderCell } from './folderCell.js';
import { buildFileCoin } from './fileCoin.js';
import { cellLayout, coinRing } from '../engine/honeycombLayout.js';
import { buildGridView } from './gridView.js';
import { buildListView } from './listView.js';

const MAX_VISIBLE_COINS = 14; // cap so a 500-file folder doesn't overflow

export function buildStage({ onSelectCell, onSelectCoin, onMoveFile } = {}) {
  const root = el('div', { class: 'fv-stage' });
  const honey = el('div', { class: 'fv-honey' });
  const empty = el('div', { class: 'fv-stage-empty' }, [
    el('div', { class: 'fv-stage-empty-title' }, 'Empty room'),
    el('div', { class: 'fv-stage-empty-hint' }, 'Drop a file or use Import.'),
  ]);
  empty.style.display = 'none';
  const overflowChip = el('div', { class: 'fv-overflow-chip' });
  overflowChip.style.display = 'none';

  const grid = buildGridView({ onSelect: (item) => onSelectCoin?.(item) });
  const list = buildListView({ onSelect: (item) => onSelectCoin?.(item) });
  grid.root.style.display = 'none';
  list.root.style.display = 'none';

  honey.append(overflowChip);
  root.append(honey, grid.root, list.root, empty);

  return {
    root,
    update({ view = 'honeycomb', cells = [], files = [], selectedPath = null }) {
      const isEmpty = cells.length === 0 && files.length === 0;
      empty.style.display = isEmpty ? 'flex' : 'none';

      honey.style.display = view === 'honeycomb' ? '' : 'none';
      grid.root.style.display = view === 'grid' ? '' : 'none';
      list.root.style.display = view === 'list' ? '' : 'none';

      if (view === 'grid') {
        grid.update({ items: [...cells.filter((c) => c.isFolder !== false), ...files], selectedPath });
        return;
      }
      if (view === 'list') {
        list.update({ items: [...cells.filter((c) => c.isFolder !== false), ...files], selectedPath });
        return;
      }

      // Honeycomb path — keep cells/coins but rebuild on update.
      // Wipe everything except the overflow chip + empty.
      const keep = new Set([overflowChip, empty]);
      for (const child of [...honey.children]) {
        if (!keep.has(child)) child.remove();
      }

      if (isEmpty) return;

      // Lay out folder cells.
      const dims = honey.getBoundingClientRect();
      const w = Math.max(360, dims.width || 760);
      const h = Math.max(360, dims.height || 540);
      const positions = cellLayout({ count: cells.length, width: w, height: h });
      cells.forEach((spec, i) => {
        const pos = positions[i] || { x: 0, y: 0 };
        const node = buildFolderCell(
          { ...spec, x: pos.x, y: pos.y },
          {
            onSelect: () => onSelectCell?.(spec),
            onDrop: (sourcePath) => onMoveFile?.(sourcePath, spec),
          },
        );
        honey.appendChild(node);
      });

      // Lay out file coins around the perimeter, capped.
      const visibleFiles = files.slice(0, MAX_VISIBLE_COINS);
      const overflow = files.length - visibleFiles.length;
      const ringPos = coinRing({ count: visibleFiles.length, width: w, height: h });
      visibleFiles.forEach((item, i) => {
        const pos = ringPos[i] || { x: 0, y: 0 };
        const node = buildFileCoin(
          { ...item, x: pos.x, y: pos.y },
          {
            onSelect: () => onSelectCoin?.(item),
            isSelected: selectedPath === item.path,
          },
        );
        honey.appendChild(node);
      });

      if (overflow > 0) {
        overflowChip.style.display = '';
        overflowChip.textContent = `+${overflow} more · switch to Grid to see all`;
      } else {
        overflowChip.style.display = 'none';
      }
    },
  };
}
