/**
 * pdf/v3/ops/redactBake.js — flatten redact annotations into the PDF.
 *
 * For each `kind: 'redact'` annotation, draws a solid black rectangle
 * over the same coordinates in the underlying PDF page content stream
 * via pdf-lib. The output is a NEW document — the original stays
 * untouched. Caller adds the result to the library.
 *
 * Coordinate flip: annotations use top-left fractional (x, y, w, h).
 * pdf-lib's drawRectangle uses bottom-left origin, so we flip Y:
 *   pdfY = pageHeight − (y + h) × pageHeight.
 *
 * Target size: ≤ 130 lines.
 */

import { loadPdfLib } from './pdfLibLoader.js';

/**
 * Produce a baked copy of `docId` with all redact annotations applied.
 *
 * @returns {Promise<{ blob: Blob, count: number }>} blob is the new
 *   PDF; count is how many redactions were applied.
 */
export async function bakeRedactions({ pdfStore, docId, annotations, onProgress } = {}) {
  if (!pdfStore) throw new Error('pdfStore required');
  if (!docId) throw new Error('docId required');
  if (!Array.isArray(annotations)) throw new Error('annotations required');

  const redacts = annotations.filter(
    (a) => a && a.kind === 'redact'
        && Number.isFinite(a.page) && a.page >= 1
        && [a.x, a.y, a.w, a.h].every(Number.isFinite),
  );
  if (!redacts.length) {
    throw new Error('No redactions to bake');
  }

  const { PDFDocument, rgb } = await loadPdfLib();
  const blob = await pdfStore.readBlob(docId);
  if (!blob) throw new Error('Source document not found');
  const buf = await blob.arrayBuffer();
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const pageCount = doc.getPageCount();

  let i = 0;
  for (const r of redacts) {
    onProgress?.({ done: i, total: redacts.length });
    if (r.page > pageCount) { i++; continue; }
    const page = doc.getPage(r.page - 1);
    const { width: pw, height: ph } = page.getSize();
    page.drawRectangle({
      x: r.x * pw,
      y: ph - (r.y + r.h) * ph,
      width: r.w * pw,
      height: r.h * ph,
      color: rgb(0, 0, 0),
    });
    i++;
  }
  onProgress?.({ done: redacts.length, total: redacts.length });

  const bytes = await doc.save({ addDefaultPage: false });
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    count: redacts.length,
  };
}
