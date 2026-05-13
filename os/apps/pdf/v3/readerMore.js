/**
 * pdf/v3/readerMore.js — "More" popover wiring for the v3 reader.
 *
 * Owns the toolbar's ⋯ menu. Entries get enabled as each feature lands;
 * unsupplied callbacks stay greyed out.
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
  onRedactMode,
  onBakeRedactions,
}) {
  const popover = buildMorePopover({
    items: [
      { id: 'properties', label: 'Properties' },
      { id: 'exportAnnotations', label: 'Export annotations…' },
      { separator: true },
      { id: 'merge', label: 'Merge PDFs', disabled: !onMerge },
      { id: 'split', label: 'Split pages', disabled: !onSplit },
      { id: 'compare', label: 'Compare', disabled: !onCompare },
      { separator: true },
      { id: 'redactMode', label: 'Redact mode', disabled: !onRedactMode },
      { id: 'bakeRedactions', label: 'Bake redactions', disabled: !onBakeRedactions },
    ],
    onSelect: (id) => {
      const docId = getDocId();
      if (id === 'properties') onShowProperties?.(getProperties?.());
      else if (id === 'exportAnnotations') onExportAnnotations?.(docId);
      else if (id === 'merge') onMerge?.();
      else if (id === 'split') onSplit?.();
      else if (id === 'compare') onCompare?.();
      else if (id === 'redactMode') onRedactMode?.();
      else if (id === 'bakeRedactions') onBakeRedactions?.();
    },
  });
  return popover;
}
