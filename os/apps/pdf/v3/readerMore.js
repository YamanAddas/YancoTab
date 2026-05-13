/**
 * pdf/v3/readerMore.js — "More" popover wiring for the v3 reader.
 *
 * Owns the toolbar's ⋯ menu: Properties, Export annotations, plus
 * placeholders for Merge/Split/Compare/Redact (marked "Soon").
 *
 * Extracted from reader.js to keep the orchestrator under the 500-line
 * cap.
 *
 * Target size: ≤ 60 lines.
 */

import { buildMorePopover } from './chrome/morePopover.js';

export function createReaderMore({
  getDocId,
  getProperties,
  onShowProperties,
  onExportAnnotations,
}) {
  const popover = buildMorePopover({
    items: [
      { id: 'properties', label: 'Properties' },
      { id: 'exportAnnotations', label: 'Export annotations…' },
      { separator: true },
      { id: 'merge', label: 'Merge PDFs', disabled: true },
      { id: 'split', label: 'Split pages', disabled: true },
      { id: 'compare', label: 'Compare', disabled: true },
      { id: 'redact', label: 'Redact', disabled: true },
    ],
    onSelect: (id) => {
      const docId = getDocId();
      if (id === 'properties') onShowProperties?.(getProperties?.());
      else if (id === 'exportAnnotations') onExportAnnotations?.(docId);
    },
  });
  return popover;
}
