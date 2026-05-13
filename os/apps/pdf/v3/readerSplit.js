/**
 * pdf/v3/readerSplit.js — Split feature wiring for the v3 reader.
 *
 * Owns the splitModal + result-persist path. The split itself is the
 * pure splitDoc() op; this controller:
 *   - opens the modal with current doc info
 *   - persists each output via pdfStore.addDocument
 *   - opens the first output via onOpenDoc
 *
 * Target size: ≤ 100 lines.
 */

import { buildSplitModal } from './chrome/splitModal.js';
import { splitDoc } from './ops/split.js';

export function createSplitController({
  pdfStore,
  getDocId,
  getDocTitle,
  getTotalPages,
  onToast,
  onOpenDoc,
}) {
  const modal = buildSplitModal({
    onSplit: async ({ ranges, onProgress }) => {
      await runSplit({ ranges, onProgress });
    },
  });
  document.body.appendChild(modal.root);

  function open() {
    const docId = getDocId();
    if (!docId) {
      onToast?.({ message: 'Open a PDF first', type: 'info' });
      return;
    }
    modal.open({
      docName: getDocTitle?.() || 'document',
      totalPages: getTotalPages?.() || 0,
    });
  }

  async function runSplit({ ranges, onProgress }) {
    const docId = getDocId();
    if (!docId) return;
    const baseName = (getDocTitle?.() || 'document').replace(/\.pdf$/i, '');
    try {
      const outputs = await splitDoc({ pdfStore, docId, ranges, onProgress });
      let firstId = null;
      for (const o of outputs) {
        const name = `${baseName} - pages ${o.label}.pdf`;
        const rec = await pdfStore.addDocument(o.blob, name, { pageCount: o.pageCount });
        if (!firstId && rec?.id) firstId = rec.id;
      }
      onToast?.({
        message: `Split into ${outputs.length} PDF${outputs.length === 1 ? '' : 's'}`,
        type: 'success',
      });
      if (firstId) onOpenDoc?.(firstId);
    } catch (e) {
      onToast?.({ message: `Split failed: ${e?.message || e}`, type: 'error' });
      throw e;
    }
  }

  function destroy() { modal.root.remove(); }

  return { open, destroy };
}
