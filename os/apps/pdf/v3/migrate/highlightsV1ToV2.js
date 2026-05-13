/**
 * pdf/v3/migrate/highlightsV1ToV2.js — one-shot migration of legacy
 * text-shape highlights into offset-shape annotations.
 *
 * v1 stored highlights as `{page, text, color}` in
 * kernel.storage.yancotab_pdf_highlights_v1[docId][]. Re-find via
 * substring matching fails on hyphenation, ligatures, and glyph
 * fragments — the whole reason we're rewriting.
 *
 * The migration:
 *   1. Skips if pdfStore.viewState[docId]._migrated_v2_at is set.
 *   2. For each legacy highlight on a given page, fetches the page's
 *      textContent ONCE, builds a pageTextIndex, locates the saved
 *      text via case-insensitive substring search, and writes a new
 *      offset-shape annotation via annotationStore.
 *   3. Marks the doc migrated (so we never re-process it) regardless
 *      of how many entries succeeded.
 *
 * Idempotent: re-running on a migrated doc is a no-op. Per-doc lazy:
 * a user with 200 PDFs only migrates the ones they open.
 *
 * Target size: ≤ 250 lines.
 */

import { buildPageTextIndex } from '../select/pageTextIndex.js';
import { listHighlights } from '../../persistence.js';

// v1 used Yanco-flavored color names. v3 uses literal palette names.
// Map onto the closest equivalent.
const V1_COLOR_MAP = {
  accent: 'green',
  warm: 'yellow',
  rose: 'pink',
  violet: 'purple',
  cool: 'blue',
};
function mapV1Color(c) { return V1_COLOR_MAP[c] || 'yellow'; }

/**
 * Run the migration for one doc. Returns a result summary.
 *
 * @param {object} args
 * @param {object} args.pdfDoc          loaded pdf.js doc
 * @param {string} args.docId           canonical doc id used by v2/v3
 * @param {object} args.pdfStore        pdfStore service
 * @param {object} args.kernel          for legacy v1 storage reads
 * @param {object} args.annotationStore v3 annotationStore from ops/
 * @returns {{ migrated: number, fallback: number, skipped?: boolean }}
 */
export async function migrateDocHighlights({
  pdfDoc, docId, pdfStore, kernel, annotationStore,
} = {}) {
  if (!pdfDoc || !docId || !pdfStore || !kernel || !annotationStore) {
    return { migrated: 0, fallback: 0, skipped: true };
  }

  // 1. Skip if already migrated for this doc.
  try {
    const vs = await pdfStore.getViewState(docId);
    if (vs && vs._migrated_v2_at) {
      return { migrated: 0, fallback: 0, skipped: true };
    }
  } catch { /* best-effort */ }

  // 2. Read legacy v1 highlights for this doc.
  const legacy = listHighlights(kernel, docId) || [];
  if (legacy.length === 0) {
    // Nothing to migrate — still mark done so we don't re-check.
    try { await pdfStore.saveViewState(docId, { _migrated_v2_at: Date.now() }); } catch { /* best-effort */ }
    return { migrated: 0, fallback: 0 };
  }

  // 3. Group by page so we fetch textContent at most once per page.
  const byPage = new Map();
  for (const h of legacy) {
    const p = Number(h.page);
    if (!Number.isFinite(p) || p < 1) continue;
    if (!byPage.has(p)) byPage.set(p, []);
    byPage.get(p).push(h);
  }

  let migrated = 0;
  let fallback = 0;

  for (const [page, items] of byPage) {
    let index = null;
    try {
      const pdfPage = await pdfDoc.getPage(page);
      const textContent = await pdfPage.getTextContent({ includeMarkedContent: false });
      index = buildPageTextIndex(textContent);
    } catch (e) {
      // Page fetch failed — count all items on this page as fallback.
      fallback += items.length;
      continue;
    }

    const flatLower = (index.flat || '').toLowerCase();

    for (const h of items) {
      const target = String(h.text || '').toLowerCase();
      if (!target || target.length < 2) continue;
      const at = flatLower.indexOf(target);
      if (at < 0) {
        fallback++;
        continue;
      }
      try {
        await annotationStore.addHighlight({
          docId,
          page,
          pageStartCharOffset: at,
          pageEndCharOffset: at + target.length,
          color: mapV1Color(h.color),
          text: String(h.text || '').slice(0, 240),
        });
        migrated++;
      } catch (e) {
        fallback++;
      }
    }
  }

  // 4. Mark this doc migrated regardless of how many entries succeeded.
  // Failures stay as legacy entries (the v2 reader will continue to
  // render them via the legacy substring matcher).
  try {
    await pdfStore.saveViewState(docId, { _migrated_v2_at: Date.now() });
  } catch { /* best-effort */ }

  return { migrated, fallback };
}
