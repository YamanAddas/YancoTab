/**
 * pdf/v3/readerMarkActions.js — mark popover create + handlers.
 *
 * Owns the click-on-existing-highlight flow:
 *   - color change (with undo)
 *   - delete (with undo, snapshotting the row first so undo can revive
 *     it via annotationStore.addRaw)
 *
 * Extracted from reader.js to keep the orchestrator under the 500-line cap.
 *
 * Target size: ≤ 130 lines.
 */

import { buildMarkPopover } from './chrome/markPopover.js';

export function createMarkActions({
  annStore,
  strip,
  undoStack,
  onToast,
  onAddNote,    // (annId, anchorRect) → opens the note popover for this highlight
}) {
  const popover = buildMarkPopover({
    onAddNote: async (annId, anchorRect) => {
      if (!Number.isFinite(annId)) return;
      try {
        const rec = await annStore.getOne(annId);
        if (!rec) return;
        onAddNote?.({
          annId,
          page: rec.page,
          body: rec.body || '',
          rect: anchorRect,
        });
      } catch { /* best-effort */ }
    },
    onChangeColor: async (annId, color) => {
      try {
        const prev = await annStore.getOne(annId);
        const oldColor = prev?.color || 'yellow';
        if (oldColor === color) return;
        await annStore.updateColor(annId, color);
        await strip.refreshAllHighlights();
        undoStack?.push({
          label: 'recolor highlight',
          undo: async () => {
            await annStore.updateColor(annId, oldColor);
            await strip.refreshAllHighlights();
          },
          redo: async () => {
            await annStore.updateColor(annId, color);
            await strip.refreshAllHighlights();
          },
        });
      } catch { /* best-effort */ }
    },
    onDelete: async (annId) => {
      try {
        const snapshot = await annStore.getOne(annId);
        if (!snapshot) {
          await strip.refreshAllHighlights();
          return;
        }
        await annStore.deleteOne(annId);
        await strip.refreshAllHighlights();
        onToast?.({ message: 'Highlight deleted', type: 'success' });
        let currentId = annId;
        undoStack?.push({
          label: 'delete highlight',
          undo: async () => {
            const r = await annStore.addRaw(snapshot.docId, snapshot);
            if (r) currentId = r.id;
            await strip.refreshAllHighlights();
          },
          redo: async () => {
            await annStore.deleteOne(currentId);
            await strip.refreshAllHighlights();
          },
        });
      } catch {
        onToast?.({ message: 'Delete failed', type: 'error' });
      }
    },
  });

  return popover;
}
