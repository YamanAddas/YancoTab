/**
 * pdf/v3/ops/highlightCommit.js — commits a selection into a highlight
 * annotation (or several, for cross-page selections).
 *
 * Single-page selection → 1 annotation.
 * Multi-page selection  → N annotations sharing a generated groupId.
 *
 * Refreshes the affected page strips and clears the native selection
 * + selection pill on success.
 *
 * If `undoStack` is supplied, pushes an undo command that re-creates
 * the same annotation(s) on redo (with fresh ids).
 *
 * Target size: ≤ 130 lines.
 */

export async function commitSelectionAsHighlight({
  selection, docId, color,
  annotationStore, strip,
  onToast, onPillHide,
  undoStack,
} = {}) {
  if (!docId || !selection) return null;
  try {
    if (!selection.multiPage) {
      const args = {
        docId,
        page: selection.page,
        pageStartCharOffset: selection.charStart,
        pageEndCharOffset: selection.charEnd,
        color,
        text: selection.text,
      };
      const rec = await annotationStore.addHighlight(args);
      await strip.refreshHighlightsForPage(selection.page);
      if (rec && undoStack) {
        let currentId = rec.id;
        undoStack.push({
          label: 'highlight',
          undo: async () => {
            await annotationStore.deleteOne(currentId);
            await strip.refreshHighlightsForPage(args.page);
          },
          redo: async () => {
            const r = await annotationStore.addHighlight(args);
            if (r) currentId = r.id;
            await strip.refreshHighlightsForPage(args.page);
          },
        });
      }
      onPillHide?.();
      try { window.getSelection()?.removeAllRanges(); } catch { /* best-effort */ }
      onToast?.({ message: 'Highlight saved', type: 'success' });
      return rec ? { id: rec.id, page: args.page, multiPage: false } : null;
    } else if (Array.isArray(selection.segments)) {
      const groupId = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const segs = selection.segments.map((seg) => ({
        docId,
        page: seg.page,
        pageStartCharOffset: seg.charStart,
        pageEndCharOffset: seg.charEnd,
        color,
        text: '',
        groupId,
      }));
      let ids = [];
      for (const args of segs) {
        const r = await annotationStore.addHighlight(args);
        if (r) ids.push(r.id);
      }
      for (const args of segs) await strip.refreshHighlightsForPage(args.page);
      if (ids.length && undoStack) {
        let currentIds = ids;
        undoStack.push({
          label: 'highlight (multi-page)',
          undo: async () => {
            for (const id of currentIds) await annotationStore.deleteOne(id);
            for (const args of segs) await strip.refreshHighlightsForPage(args.page);
          },
          redo: async () => {
            const fresh = [];
            for (const args of segs) {
              const r = await annotationStore.addHighlight(args);
              if (r) fresh.push(r.id);
            }
            currentIds = fresh;
            for (const args of segs) await strip.refreshHighlightsForPage(args.page);
          },
        });
      }
    }
    // Multi-page path falls through to here; single-page path returns early above.
    onPillHide?.();
    try { window.getSelection()?.removeAllRanges(); } catch { /* best-effort */ }
    onToast?.({ message: 'Highlight saved', type: 'success' });
    return { multiPage: true };
  } catch (e) {
    console.error('[pdf-v3] highlight save failed:', e);
    onToast?.({ message: 'Highlight save failed', type: 'error' });
    return null;
  }
}
