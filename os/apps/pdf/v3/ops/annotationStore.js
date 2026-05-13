/**
 * pdf/v3/ops/annotationStore.js — CRUD wrapper around pdfStore.annotations.
 *
 * Centralizes the v3 annotation shape so the rest of the reader doesn't
 * need to know IDB record structure. Every annotation in v3 carries:
 *   - kind, docId, page, color
 *   - {pageStartCharOffset, pageEndCharOffset, text, textHash} for text-anchored kinds
 *   - {x, y, w, h, points, body, ...} for region kinds (later phases)
 *
 * Phase B scope: highlights only. Other kinds land in later phases.
 *
 * Target size: ≤ 200 lines.
 */

import { fnv32 } from '../select/pageTextIndex.js';

const TEXT_CACHE_LIMIT = 240;
const VALID_HL_COLORS = new Set(['yellow', 'green', 'blue', 'pink', 'purple']);
const VALID_HL_KINDS = new Set(['highlight', 'underline', 'strike']);

export function createAnnotationStore(pdfStore) {
  if (!pdfStore) throw new Error('pdfStore is required');

  /**
   * Add a text-anchored highlight (or underline/strike).
   *
   * Returns the stored annotation with its assigned `id`, or null on
   * validation failure.
   */
  async function addHighlight({
    docId, page, kind = 'highlight',
    pageStartCharOffset, pageEndCharOffset,
    color = 'yellow', text = '', groupId = null,
  } = {}) {
    if (!docId || !Number.isFinite(page)) return null;
    if (!VALID_HL_KINDS.has(kind)) return null;
    if (!Number.isFinite(pageStartCharOffset) || !Number.isFinite(pageEndCharOffset)) return null;
    if (pageStartCharOffset >= pageEndCharOffset) return null;
    if (!VALID_HL_COLORS.has(color)) color = 'yellow';

    const cleanText = String(text || '').slice(0, TEXT_CACHE_LIMIT);
    const record = {
      kind,
      page,
      pageStartCharOffset,
      pageEndCharOffset,
      color,
      text: cleanText,
      textHash: fnv32(cleanText),
      ...(groupId ? { groupId } : {}),
    };
    return pdfStore.addAnnotation(docId, record);
  }

  /**
   * List highlight/underline/strike annotations on a specific page.
   * Skips non-text kinds and legacy v1 shape (no offsets).
   */
  async function listTextAnchoredOnPage(docId, page) {
    if (!docId || !Number.isFinite(page)) return [];
    const all = await pdfStore.listAnnotationsOnPage(docId, page);
    return all.filter((a) =>
      VALID_HL_KINDS.has(a.kind) &&
      Number.isFinite(a.pageStartCharOffset) &&
      Number.isFinite(a.pageEndCharOffset)
    );
  }

  /**
   * List ALL annotations for a document. Used by the sidebar
   * annotations tab (later phase).
   */
  async function listAllForDoc(docId) {
    if (!docId) return [];
    return pdfStore.listAnnotations(docId);
  }

  async function deleteOne(id) {
    if (!Number.isFinite(id)) return false;
    return pdfStore.deleteAnnotation(id);
  }

  /** Read an annotation by id (used by undo to snapshot before mutating). */
  async function getOne(id) {
    if (!Number.isFinite(id)) return null;
    return pdfStore.getAnnotation(id);
  }

  /** Re-insert a previously-deleted annotation. Returns the record with a fresh id. */
  async function addRaw(docId, record) {
    if (!docId || !record) return null;
    const clone = { ...record };
    delete clone.id;
    delete clone.docId;
    return pdfStore.addAnnotation(docId, clone);
  }

  /**
   * Change an annotation's color in place (most common edit operation
   * from the context menu).
   */
  async function updateColor(id, color) {
    if (!VALID_HL_COLORS.has(color)) return null;
    return pdfStore.updateAnnotation(id, { color });
  }

  // ── Ink annotations (Phase D2) ──────────────────────────────

  async function addInk({ docId, page, points, color = 'red', width = 2 } = {}) {
    if (!docId || !Number.isFinite(page)) return null;
    if (!Array.isArray(points) || points.length < 2) return null;
    return pdfStore.addAnnotation(docId, {
      kind: 'ink',
      page,
      points,
      color,
      width: Math.max(0.5, Math.min(24, Number(width) || 2)),
    });
  }

  // ── Shape annotations (Phase D3) ────────────────────────────

  async function addShape({ docId, page, shape, x, y, w, h, color = 'red', width = 2, fill = 'none', dash = 'solid' } = {}) {
    if (!docId || !Number.isFinite(page)) return null;
    if (!['rect', 'ellipse', 'arrow', 'line'].includes(shape)) return null;
    if (![x, y, w, h].every(Number.isFinite)) return null;
    return pdfStore.addAnnotation(docId, {
      kind: 'shape',
      page, shape, x, y, w, h, color,
      width: Math.max(0.5, Math.min(24, Number(width) || 2)),
      fill, dash,
    });
  }

  // ── Signature instances (Phase D4) ──────────────────────────

  async function addSignature({ docId, page, imageDataUrl, x, y, w, h } = {}) {
    if (!docId || !Number.isFinite(page)) return null;
    if (typeof imageDataUrl !== 'string') return null;
    if (!imageDataUrl.startsWith('data:image/png;base64,')) return null;
    if (![x, y, w, h].every(Number.isFinite)) return null;
    return pdfStore.addAnnotation(docId, {
      kind: 'signature', page, imageDataUrl, x, y, w, h,
    });
  }

  // ── Generic list ──────────────────────────────────────────

  async function listAllOnPage(docId, page) {
    if (!docId || !Number.isFinite(page)) return [];
    return pdfStore.listAnnotationsOnPage(docId, page);
  }

  async function listNonTextOnPage(docId, page) {
    const all = await listAllOnPage(docId, page);
    return all.filter((a) => a && ['ink', 'shape', 'signature', 'redact'].includes(a.kind));
  }

  return {
    addHighlight,
    addInk,
    addShape,
    addSignature,
    addRaw,
    getOne,
    listTextAnchoredOnPage,
    listAllOnPage,
    listNonTextOnPage,
    listAllForDoc,
    deleteOne,
    updateColor,
    // expose constants for view code that needs to validate locally
    VALID_HL_COLORS,
    VALID_HL_KINDS,
  };
}
