/**
 * pdf/v3/readerRedact.js — Redact tool + bake-on-export wiring.
 *
 * Owns:
 *   - the redact tool registration (rect-select on the annotation layer)
 *   - the bake action (More menu → Bake redactions)
 *
 * Tool commits push undo entries via the existing undoStack pattern.
 * Bake produces a NEW doc; the original keeps the unbaked annotations.
 *
 * Target size: ≤ 140 lines.
 */

import { createRedactTool } from './tools/redactTool.js';
import { bakeRedactions } from './ops/redactBake.js';

export function createRedactController({
  pdfStore,
  annStore,
  strip,
  undoStack,
  getDocId,
  getDocTitle,
  onToast,
  onOpenDoc,
} = {}) {
  const tool = createRedactTool({
    getPageLayer: (pageEl) => {
      const pn = Number(pageEl?.dataset?.page);
      if (!Number.isFinite(pn)) return null;
      return strip.getAnnotationLayerForPage(pn);
    },
    onCommit: async (args) => {
      const docId = getDocId();
      if (!docId) return;
      const rec = await annStore.addRedact({ docId, ...args });
      await strip.refreshNonTextAnnotationsForPage(args.page);
      if (rec && undoStack) {
        let currentId = rec.id;
        undoStack.push({
          label: 'redact',
          undo: async () => {
            await annStore.deleteOne(currentId);
            await strip.refreshNonTextAnnotationsForPage(args.page);
          },
          redo: async () => {
            const r = await annStore.addRedact({ docId, ...args });
            if (r) currentId = r.id;
            await strip.refreshNonTextAnnotationsForPage(args.page);
          },
        });
      }
    },
  });

  async function bake() {
    const docId = getDocId();
    if (!docId) {
      onToast?.({ message: 'Open a PDF first', type: 'info' });
      return;
    }
    let all = [];
    try { all = await annStore.listAllForDoc(docId); }
    catch (e) {
      onToast?.({ message: `Couldn't read annotations: ${e?.message || e}`, type: 'error' });
      return;
    }
    const redacts = all.filter((a) => a.kind === 'redact' && !a.baked);
    if (!redacts.length) {
      onToast?.({ message: 'No redactions to bake. Draw some first.', type: 'info' });
      return;
    }
    onToast?.({ message: `Baking ${redacts.length} redaction${redacts.length === 1 ? '' : 's'}…`, type: 'info' });
    try {
      const { blob, count } = await bakeRedactions({
        pdfStore, docId, annotations: redacts,
      });
      const baseName = (getDocTitle?.() || 'document').replace(/\.pdf$/i, '');
      const name = `${baseName} (redacted).pdf`;
      const rec = await pdfStore.addDocument(blob, name);
      onToast?.({
        message: `Baked ${count} redaction${count === 1 ? '' : 's'} → "${name}"`,
        type: 'success',
      });
      if (rec?.id) onOpenDoc?.(rec.id);
    } catch (e) {
      onToast?.({ message: `Bake failed: ${e?.message || e}`, type: 'error' });
    }
  }

  return { tool, bake };
}
