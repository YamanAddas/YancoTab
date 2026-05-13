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

  /**
   * Change an annotation's color in place (most common edit operation
   * from the context menu).
   */
  async function updateColor(id, color) {
    if (!VALID_HL_COLORS.has(color)) return null;
    return pdfStore.updateAnnotation(id, { color });
  }

  return {
    addHighlight,
    listTextAnchoredOnPage,
    listAllForDoc,
    deleteOne,
    updateColor,
    // expose constants for view code that needs to validate locally
    VALID_HL_COLORS,
    VALID_HL_KINDS,
  };
}
