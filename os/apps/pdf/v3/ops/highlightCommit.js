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
 * Target size: ≤ 100 lines.
 */

export async function commitSelectionAsHighlight({
  selection, docId, color,
  annotationStore, strip,
  onToast, onPillHide,
} = {}) {
  if (!docId || !selection) return;
  try {
    if (!selection.multiPage) {
      await annotationStore.addHighlight({
        docId,
        page: selection.page,
        pageStartCharOffset: selection.charStart,
        pageEndCharOffset: selection.charEnd,
        color,
        text: selection.text,
      });
      await strip.refreshHighlightsForPage(selection.page);
    } else if (Array.isArray(selection.segments)) {
      const groupId = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      for (const seg of selection.segments) {
        await annotationStore.addHighlight({
          docId,
          page: seg.page,
          pageStartCharOffset: seg.charStart,
          pageEndCharOffset: seg.charEnd,
          color,
          text: '',
          groupId,
        });
      }
      for (const seg of selection.segments) {
        await strip.refreshHighlightsForPage(seg.page);
      }
    }
    onPillHide?.();
    try { window.getSelection()?.removeAllRanges(); } catch { /* best-effort */ }
    onToast?.({ message: 'Highlight saved', type: 'success' });
  } catch (e) {
    console.error('[pdf-v3] highlight save failed:', e);
    onToast?.({ message: 'Highlight save failed', type: 'error' });
  }
}
