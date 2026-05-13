/**
 * pdf/v3/readerMerge.js — Merge feature wiring for the v3 reader.
 *
 * Owns the mergeModal instance + the IDB write-back path. The merge
 * itself is the pure mergeDocs() operation; this controller handles:
 *   - opening the modal pre-populated with the current doc
 *   - feeding the library list (filtered: PDFs only)
 *   - persisting the resulting blob via pdfStore.addDocument
 *   - toast + caller callback to open the merged doc
 *
 * Target size: ≤ 130 lines.
 */

import { buildMergeModal } from './chrome/mergeModal.js';
import { mergeDocs } from './ops/merge.js';

export function createMergeController({
  pdfStore,
  getDocId,
  onToast,
  onOpenDoc,    // (docId) → switch the reader to this new doc
}) {
  const modal = buildMergeModal({
    onMerge: async ({ docIds, outputName, onProgress }) => {
      await runMerge({ docIds, outputName, onProgress });
    },
  });
  document.body.appendChild(modal.root);

  async function open() {
    const docId = getDocId();
    if (!docId) {
      onToast?.({ message: 'Open a PDF first', type: 'info' });
      return;
    }
    let libraryDocs = [];
    let currentDoc = null;
    try {
      libraryDocs = await pdfStore.listDocuments();
      currentDoc = libraryDocs.find((d) => d.id === docId);
    } catch (e) {
      onToast?.({ message: `Couldn't list library: ${e?.message || e}`, type: 'error' });
      return;
    }
    if (!currentDoc) {
      onToast?.({ message: 'Current document not in library', type: 'error' });
      return;
    }
    modal.open({ currentDoc, libraryDocs });
  }

  async function runMerge({ docIds, outputName, onProgress }) {
    try {
      const { blob, pageCount } = await mergeDocs({
        pdfStore, docIds, onProgress,
      });
      const rec = await pdfStore.addDocument(blob, outputName, { pageCount });
      onToast?.({
        message: `Merged ${docIds.length} PDFs → ${pageCount} pages`,
        type: 'success',
      });
      if (rec?.id) onOpenDoc?.(rec.id);
    } catch (e) {
      onToast?.({ message: `Merge failed: ${e?.message || e}`, type: 'error' });
      throw e;   // surfaces back to the modal's catch
    }
  }

  function destroy() {
    modal.root.remove();
  }

  return { open, destroy };
}
