/**
 * pdf/v3/readerSelection.js — selection pill + selection watcher +
 * commitHighlight orchestration.
 *
 * Owns the in-flight selection state (lastSelection + screen rect),
 * builds the floating action pill, listens to native selectionchange
 * events through the page-strip's per-page index resolver, and
 * commits a selection into a highlight (with optional follow-up note
 * popover for the "Note" action).
 *
 * Extracted from reader.js to keep the orchestrator under the 500-line
 * cap. The reader passes in the strip, the annotation store, the
 * color controller, the undo stack, and a thunk for opening the
 * highlight-note popover.
 *
 * Target size: ≤ 130 lines.
 */

import { buildSelectionPill } from './chrome/selectionPill.js';
import { createSelectionWatcher } from './select/selectionWatcher.js';
import { commitSelectionAsHighlight } from './ops/highlightCommit.js';

export function createSelectionLayer({
  stage, strip, annStore, undoStack, onToast,
  getDocId,
  getColor,                // () → currently active highlight color
  setColor,                // (color) → persist + reflect in UI
  openNoteForHighlight,    // ({annId, page, body, rect}) → opens note popover
} = {}) {
  let lastSelection = null;
  let selectionRectScreen = null;

  const pill = buildSelectionPill({
    onColor: (color) => {
      setColor?.(color);
      commitHighlight(color);
    },
    onNote: async () => {
      // Snapshot the rect BEFORE commit — commitHighlight clears the
      // browser selection, which collapses selectionRectScreen.
      const sr = selectionRectScreen;
      const rect = sr ? {
        left: sr.left, top: sr.top,
        right: sr.right, bottom: sr.bottom,
        width: sr.width, height: sr.height,
      } : null;
      const color = getColor?.() || 'yellow';
      const rec = await commitHighlight(color);
      if (!rec || rec.multiPage || !Number.isFinite(rec.id)) {
        if (rec?.multiPage) {
          onToast?.({ message: 'Notes on multi-page highlights are coming soon', type: 'info' });
        }
        return;
      }
      openNoteForHighlight?.({ annId: rec.id, page: rec.page, body: '', rect });
    },
    onCopy: () => {
      const text = lastSelection?.text || '';
      if (text) {
        try { navigator.clipboard.writeText(text); } catch { /* best-effort */ }
        onToast?.({ message: 'Selection copied', type: 'success' });
      }
    },
  });

  const watcher = createSelectionWatcher({
    stage,
    getPageIndexForElement: (pageEl) => strip.getPageIndexForElement(pageEl),
    getPageNumberForElement: (pageEl) => strip.getPageNumberForElement(pageEl),
    onChange: (update) => {
      lastSelection = update;
      selectionRectScreen = update.rect || null;
      if (selectionRectScreen) pill.show(selectionRectScreen);
    },
    onCleared: () => {
      lastSelection = null;
      selectionRectScreen = null;
      pill.hide();
    },
  });

  function commitHighlight(color) {
    return commitSelectionAsHighlight({
      selection: lastSelection,
      docId: getDocId?.(),
      color,
      annotationStore: annStore,
      strip,
      onToast,
      onPillHide: () => pill.hide(),
      undoStack,
    });
  }

  function clear() {
    lastSelection = null;
    selectionRectScreen = null;
    pill.hide();
  }

  function destroy() {
    try { watcher.destroy(); } catch { /* best-effort */ }
  }

  return {
    pillRoot: pill.root,
    hidePill: () => pill.hide(),
    commitHighlight,
    clear,
    getLastSelection: () => lastSelection,
    getSelectionRect: () => selectionRectScreen,
    destroy,
  };
}
