/**
 * pdf/v3/select/pageTextIndex.js — per-page flat text index with span mapping.
 *
 * Built from pdf.js's `pdfPage.getTextContent()` output:
 *   { items: [{ str, hasEOL, transform, width, height, dir, fontName }] }
 *
 * The output index has two parts:
 *   - `flat`   — the page's text as one string, with hyphenation healed
 *                across visual line breaks and a synthetic space inserted
 *                at every other line break.
 *   - `spans`  — one entry per textContent item, mapping each item to its
 *                slice of `flat`. Positional 1:1 with pdf.js's rendered
 *                <span> elements in the TextLayer.
 *
 * Why this exists:
 *   The v2 highlight matcher tried to re-find selected text by walking
 *   the rendered <span>s and concatenating their normalized text. It broke
 *   on hyphenated line breaks ("care-" + "ful" → "care- ful" doesn't
 *   contain "careful"), ligatures, and pdf.js's per-glyph scaleX
 *   fragments. The fix is to store {charStart, charEnd} offsets into the
 *   flat text at selection time and rebuild a DOM Range from them on
 *   re-render — same approach Mozilla's reference viewer uses.
 *
 * This module is the source of truth for "flat" coordinates. Everything
 * downstream (offsetRanges.js, annotationStore.js, highlightRender.js)
 * speaks in flat-char offsets.
 *
 * Target size: ≤ 200 lines. Pure (no DOM, no pdf.js).
 */

/**
 * Build a page-text index from pdf.js textContent output.
 *
 * @param {Object} textContent  shape: { items: [{ str, hasEOL, ... }, ...] }
 * @returns {{ flat: string, spans: SpanEntry[] }}
 *
 * Each SpanEntry is:
 *   {
 *     itemIdx:   number,    // index into textContent.items (positional)
 *     flatStart: number,    // first char of this span in `flat`
 *     flatEnd:   number,    // one past last char in `flat`
 *     hadHyphen: boolean,   // true if this span had a trailing '-' elided
 *                           //  because of hyphenation across an EOL
 *     hasEOL:    boolean,   // copied from item.hasEOL
 *     rawLength: number,    // original item.str.length
 *                           //   (== flatEnd - flatStart UNLESS hadHyphen,
 *                           //    in which case rawLength = (flatEnd - flatStart) + 1)
 *   }
 */
export function buildPageTextIndex(textContent) {
  const items = (textContent && textContent.items) || [];
  const spans = [];
  let flat = '';
  let prev = null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const s = (item && typeof item.str === 'string') ? item.str : '';

    // Between prev and current: heal hyphen OR insert a space, on visual
    // line break (hasEOL). Within a line (hasEOL=false), assume item.str
    // already carries any needed whitespace — pdf.js packs spaces into the
    // raw text on the same line.
    if (prev && prev.hasEOL) {
      // Heal hyphenation: if prev's slice in `flat` ends in '-' AND a real
      // item follows on the next line, drop the hyphen and join directly.
      // We only heal when current item starts with a letter — punctuation
      // followed by a hyphen-trailing word is usually a real hyphen.
      if (
        prev.flatEnd > prev.flatStart
        && flat.charAt(prev.flatEnd - 1) === '-'
        && /^[\p{Letter}]/u.test(s)
      ) {
        flat = flat.slice(0, -1);
        prev.flatEnd -= 1;
        prev.hadHyphen = true;
      } else if (s.length > 0) {
        // No hyphen to heal — insert a single space as the word boundary
        // between visual lines. We don't add a synthetic-space-span entry;
        // the space lives in `flat` between spans (flatStart..flatEnd gaps).
        flat += ' ';
      }
    }

    const flatStart = flat.length;
    flat += s;
    const flatEnd = flat.length;

    spans.push({
      itemIdx: i,
      flatStart,
      flatEnd,
      hadHyphen: false,
      hasEOL: !!(item && item.hasEOL),
      rawLength: s.length,
    });
    prev = spans[spans.length - 1];
  }

  return { flat, spans };
}

/**
 * Locate the span containing a given flat offset.
 *
 * Returns the index into `index.spans`, or -1 if the offset is in a gap
 * between spans (typically a synthetic word-boundary space) or out of range.
 *
 * Boundary convention:
 *   - charOffset === span.flatStart           → that span
 *   - span.flatStart < charOffset < flatEnd   → that span
 *   - charOffset === span.flatEnd              → that span (inclusive end)
 *
 * For `mode: 'start'` we prefer the span the offset OPENS into; for
 * `mode: 'end'` we prefer the span the offset CLOSES.
 */
export function findSpanIdxForOffset(index, charOffset, mode = 'start') {
  if (!index || !Array.isArray(index.spans)) return -1;
  if (!Number.isFinite(charOffset) || charOffset < 0) return -1;
  for (let i = 0; i < index.spans.length; i++) {
    const s = index.spans[i];
    if (mode === 'end') {
      if (charOffset > s.flatStart && charOffset <= s.flatEnd) return i;
    } else {
      if (charOffset >= s.flatStart && charOffset < s.flatEnd) return i;
    }
  }
  // End-of-document edge: charOffset == lastSpan.flatEnd
  const last = index.spans[index.spans.length - 1];
  if (last && charOffset === last.flatEnd) return index.spans.length - 1;
  return -1;
}

/**
 * Convert a flat char offset into {spanIdx, charWithinSpan}, where
 * `charWithinSpan` is the offset inside the span's RAW rendered text
 * (NOT the flat-trimmed slice). For hyphen-elided spans, this means
 * offsets in the range [0..rawLength], with the convention that the
 * hyphen at position (rawLength-1) maps to the same flat offset as
 * the start of the next span.
 *
 * Returns null if the offset can't be located.
 */
export function flatToSpanCoord(index, charOffset, mode = 'start') {
  const spanIdx = findSpanIdxForOffset(index, charOffset, mode);
  if (spanIdx < 0) return null;
  const span = index.spans[spanIdx];
  const charWithinSpan = charOffset - span.flatStart;
  // For hyphen-elided spans, charWithinSpan is bounded by (rawLength - 1)
  // since the hyphen itself doesn't exist in `flat`. Clamp upward.
  return { spanIdx, charWithinSpan };
}

/**
 * Inverse of flatToSpanCoord: given a span index and a char offset within
 * that span's raw rendered text, return the flat char offset.
 *
 * For hyphen-elided spans:
 *   charWithinSpan === span.rawLength - 1 (the elided hyphen) maps to
 *   span.flatEnd — which equals the next span's flatStart (or end-of-doc).
 *   charWithinSpan === span.rawLength (one past the hyphen) clamps to
 *   span.flatEnd as well.
 */
export function spanCoordToFlat(index, spanIdx, charWithinSpan) {
  if (!index || !Array.isArray(index.spans)) return -1;
  const span = index.spans[spanIdx];
  if (!span) return -1;
  if (!Number.isFinite(charWithinSpan) || charWithinSpan < 0) return -1;
  // Clamp at the flat boundary of this span. Anything past it (including
  // an elided hyphen) collapses onto flatEnd.
  const flatLen = span.flatEnd - span.flatStart;
  const within = Math.min(charWithinSpan, flatLen);
  return span.flatStart + within;
}

/**
 * Stable, fast 32-bit hash for a string. FNV-1a 32. Used to attach a
 * cheap textHash to highlight annotations so the legacy-fallback locator
 * can disambiguate when offsets fail to relocate.
 *
 * Deterministic — same input always returns the same hex digest.
 */
export function fnv32(str) {
  let hash = 0x811c9dc5;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    // 32-bit multiplication via Math.imul.
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to unsigned and hex.
  return (hash >>> 0).toString(16).padStart(8, '0');
}
