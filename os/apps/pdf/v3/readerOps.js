/**
 * pdf/v3/readerOps.js — wiring for the More menu's binary-mutation
 * features (merge, split, redact, compare).
 *
 * Each sub-controller is its own module; this orchestrator just owns
 * the construction + destroy so reader.js stays under the line cap.
 *
 * Target size: ≤ 80 lines.
 */

import { createMergeController } from './readerMerge.js';
import { createSplitController } from './readerSplit.js';

export function createReaderOps({
  pdfStore,
  getDocId,
  getDocTitle,
  getTotalPages,
  onToast,
  onOpenDoc,
}) {
  const merge = createMergeController({
    pdfStore, getDocId, onToast, onOpenDoc,
  });
  const split = createSplitController({
    pdfStore, getDocId, getDocTitle, getTotalPages, onToast, onOpenDoc,
  });

  function destroy() {
    merge?.destroy?.();
    split?.destroy?.();
  }

  return {
    openMerge: () => merge.open(),
    openSplit: () => split.open(),
    destroy,
  };
}
