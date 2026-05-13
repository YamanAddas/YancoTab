/**
 * pdf/v3/ops/merge.js — combine N PDFs into one via pdf-lib.
 *
 * Loads pdf-lib lazily on first call. For each source doc:
 *   1. Read the blob from pdfStore.
 *   2. PDFDocument.load() the bytes.
 *   3. copyPages() into the output doc.
 *   4. addPage() in order.
 *
 * Returns a Blob suitable for pdfStore.addDocument. The caller is
 * responsible for naming + persisting; this module never touches the
 * library directly so it stays unit-testable with a fake pdfStore.
 *
 * Target size: ≤ 150 lines.
 */

import { loadPdfLib } from './pdfLibLoader.js';

const MAX_DOCS = 20;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;   // 500 MB combined hard ceiling

/**
 * Merge an ordered list of doc IDs into a new PDF blob.
 *
 * @param {object} opts
 * @param {object} opts.pdfStore — must expose readBlob(id) → Blob|null
 * @param {string[]} opts.docIds — order of pages in output (first → first)
 * @param {(progress: {step: string, done: number, total: number}) => void} [opts.onProgress]
 * @returns {Promise<{ blob: Blob, pageCount: number }>}
 */
export async function mergeDocs({ pdfStore, docIds, onProgress } = {}) {
  if (!pdfStore) throw new Error('pdfStore required');
  if (!Array.isArray(docIds) || docIds.length < 2) {
    throw new Error('Need at least 2 documents to merge');
  }
  if (docIds.length > MAX_DOCS) {
    throw new Error(`Too many documents — max ${MAX_DOCS} at once`);
  }

  const { PDFDocument } = await loadPdfLib();
  const out = await PDFDocument.create();
  const total = docIds.length;
  let totalBytes = 0;
  let totalPages = 0;

  for (let i = 0; i < total; i++) {
    const id = docIds[i];
    onProgress?.({ step: 'reading', done: i, total });
    const blob = await pdfStore.readBlob(id);
    if (!blob) throw new Error(`Document not found: ${id}`);
    totalBytes += blob.size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error('Merged output would exceed 500 MB');
    }
    const buf = await blob.arrayBuffer();
    let src;
    try {
      src = await PDFDocument.load(buf, { ignoreEncryption: true });
    } catch (e) {
      throw new Error(`Couldn't read PDF "${id}": ${e?.message || e}`);
    }
    onProgress?.({ step: 'copying', done: i, total });
    const indices = src.getPageIndices();
    const pages = await out.copyPages(src, indices);
    for (const p of pages) out.addPage(p);
    totalPages += pages.length;
  }

  onProgress?.({ step: 'saving', done: total, total });
  const bytes = await out.save({ addDefaultPage: false });
  const blob = new Blob([bytes], { type: 'application/pdf' });
  return { blob, pageCount: totalPages };
}

export const __TEST__ = Object.freeze({ MAX_DOCS, MAX_TOTAL_BYTES });
