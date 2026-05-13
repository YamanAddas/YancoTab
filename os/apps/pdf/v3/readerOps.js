/**
 * pdf/v3/readerOps.js — wiring for the More menu's modal features
 * (merge, split, compare).
 *
 * Redact has its own controller wired through readerTools because it
 * registers a tool with the dispatcher.
 *
 * Target size: ≤ 80 lines.
 */

import { createMergeController } from './readerMerge.js';
import { createSplitController } from './readerSplit.js';
import { createCompareController } from './readerCompare.js';

export function createReaderOps({
  pdfStore,
  stage,
  getDocId,
  getDocTitle,
  getTotalPages,
  getLeftStrip,
  getPdfJs,
  onToast,
  onOpenDoc,
}) {
  const merge = createMergeController({
    pdfStore, getDocId, onToast, onOpenDoc,
  });
  const split = createSplitController({
    pdfStore, getDocId, getDocTitle, getTotalPages, onToast, onOpenDoc,
  });
  const compare = createCompareController({
    pdfStore, stage, getLeftStrip, getPdfJs, getDocId, onToast,
  });

  function destroy() {
    merge?.destroy?.();
    split?.destroy?.();
    compare?.destroy?.();
  }

  return {
    openMerge: () => merge.open(),
    openSplit: () => split.open(),
    openCompare: () => compare.open(),
    destroy,
  };
}
