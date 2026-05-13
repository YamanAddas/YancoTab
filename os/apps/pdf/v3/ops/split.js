/**
 * pdf/v3/ops/split.js — extract page ranges from a PDF into new docs.
 *
 * Pure parser + pdf-lib executor. Parser is exported separately so
 * tests can validate the range syntax without loading pdf-lib.
 *
 * Range syntax: comma-separated. Each segment is either a single
 * number ("5") or a hyphen range ("5-10"). Whitespace tolerated.
 * Out-of-range or malformed segments are skipped, not rejected — the
 * caller decides whether the parsed result is non-empty.
 *
 * Each range produces one output blob containing those pages in order.
 *
 * Target size: ≤ 180 lines.
 */

import { loadPdfLib } from './pdfLibLoader.js';

const MAX_RANGES = 50;
const MAX_TOTAL_PAGES = 1000;

/**
 * Parse "1-10, 15, 20-25" → [{pages:[1..10]}, {pages:[15]}, {pages:[20..25]}].
 * `totalPages` clamps the upper bound; pages outside 1..totalPages are
 * silently dropped.
 *
 * @returns {Array<{label: string, pages: number[]}>}
 */
export function parseRanges(input, totalPages) {
  if (typeof input !== 'string' || !Number.isFinite(totalPages) || totalPages < 1) return [];
  const out = [];
  const segments = input.split(',').map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    if (out.length >= MAX_RANGES) break;
    const m = seg.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (a > b) [a, b] = [b, a];
      a = Math.max(1, a);
      b = Math.min(totalPages, b);
      if (a > b) continue;
      const pages = [];
      for (let p = a; p <= b; p++) pages.push(p);
      out.push({ label: `${a}-${b}`, pages });
      continue;
    }
    const single = seg.match(/^(\d+)$/);
    if (single) {
      const n = parseInt(single[1], 10);
      if (n >= 1 && n <= totalPages) out.push({ label: String(n), pages: [n] });
    }
  }
  return out;
}

/** Total page count across all parsed ranges (sum, with duplicates counted). */
export function totalParsedPages(ranges) {
  if (!Array.isArray(ranges)) return 0;
  return ranges.reduce((sum, r) => sum + (r.pages?.length || 0), 0);
}

/**
 * Run the split: produce one blob per range from the source doc.
 *
 * @returns {Promise<Array<{ blob: Blob, label: string, pageCount: number }>>}
 */
export async function splitDoc({ pdfStore, docId, ranges, onProgress } = {}) {
  if (!pdfStore) throw new Error('pdfStore required');
  if (!docId) throw new Error('docId required');
  if (!Array.isArray(ranges) || ranges.length === 0) {
    throw new Error('No page ranges to extract');
  }
  if (totalParsedPages(ranges) > MAX_TOTAL_PAGES) {
    throw new Error(`Range expansion exceeds ${MAX_TOTAL_PAGES} pages total`);
  }

  const { PDFDocument } = await loadPdfLib();
  const blob = await pdfStore.readBlob(docId);
  if (!blob) throw new Error('Source document not found');
  const buf = await blob.arrayBuffer();
  const src = await PDFDocument.load(buf, { ignoreEncryption: true });
  const srcTotal = src.getPageCount();

  const out = [];
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    onProgress?.({ done: i, total: ranges.length, label: r.label });
    // pdf-lib uses 0-based indices.
    const zeroBased = r.pages.filter((p) => p >= 1 && p <= srcTotal).map((p) => p - 1);
    if (!zeroBased.length) continue;
    const dst = await PDFDocument.create();
    const copied = await dst.copyPages(src, zeroBased);
    for (const p of copied) dst.addPage(p);
    const bytes = await dst.save({ addDefaultPage: false });
    out.push({
      blob: new Blob([bytes], { type: 'application/pdf' }),
      label: r.label,
      pageCount: copied.length,
    });
  }
  onProgress?.({ done: ranges.length, total: ranges.length, label: '' });
  return out;
}

export const __TEST__ = Object.freeze({ MAX_RANGES, MAX_TOTAL_PAGES });
