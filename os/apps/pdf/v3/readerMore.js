/**
 * pdf/v3/readerMore.js — "More" popover wiring for the v3 reader.
 *
 * Owns the toolbar's ⋯ menu. Merge/Split/Compare/Redact get enabled as
 * each feature lands; the modal itself is built by the orchestrator.
 *
 * Target size: ≤ 70 lines.
 */

import { buildMorePopover } from './chrome/morePopover.js';

export function createReaderMore({
  getDocId,
  getProperties,
  onShowProperties,
  onExportAnnotations,
  onMerge,
  onSplit,
  onCompare,
  onRedact,
}) {
  const popover = buildMorePopover({
    items: [
      { id: 'properties', label: 'Properties' },
      { id: 'exportAnnotations', label: 'Export annotations…' },
      { separator: true },
      { id: 'merge', label: 'Merge PDFs', disabled: !onMerge },
      { id: 'split', label: 'Split pages', disabled: !onSplit },
      { id: 'compare', label: 'Compare', disabled: !onCompare },
      { id: 'redact', label: 'Redact', disabled: !onRedact },
    ],
    onSelect: (id) => {
      const docId = getDocId();
      if (id === 'properties') onShowProperties?.(getProperties?.());
      else if (id === 'exportAnnotations') onExportAnnotations?.(docId);
      else if (id === 'merge') onMerge?.();
      else if (id === 'split') onSplit?.();
      else if (id === 'compare') onCompare?.();
      else if (id === 'redact') onRedact?.();
    },
  });
  return popover;
}
