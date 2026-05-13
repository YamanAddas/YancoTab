/**
 * pdf/v3/select/offsetRanges.js — DOM Range ↔ flat-char offset conversion.
 *
 * Two layers:
 *   1. Pure span-coord algebra (`offsetsFromSpanCoords`,
 *      `spanCoordsFromOffsets`) — testable without DOM.
 *   2. Thin DOM adapters (`offsetsFromRange`, `rangeFromOffsets`,
 *      `wrapOffsetsAsRange`) — used by the production reader against
 *      pdf.js's TextLayer DOM. Not unit-tested in Phase A.
 *
 * Span indexing convention:
 *   pdf.js v4's `pdfjsLib.TextLayer` renders one <span> per textContent
 *   item, in DOM order. We rely on that: index.spans[i] ↔ querySelectorAll
 *   ('span')[i]. If pdf.js ever changes that mapping, swap the adapter
 *   to thread `data-text-item-index` attributes through.
 *
 * Target size: ≤ 300 lines. Pure functions unit-tested; DOM helpers integrated.
 */

import { spanCoordToFlat, flatToSpanCoord, findSpanIdxForOffset } from './pageTextIndex.js';

// ── Pure span-coord algebra ────────────────────────────────────────────

/**
 * Given an index and a {startSpanIdx, startCharInSpan, endSpanIdx,
 * endCharInSpan} structure (i.e. "which span(s) does the selection
 * touch, and where inside them"), return {charStart, charEnd} in flat
 * coordinates.
 *
 * Returns null if either coord is unresolvable.
 */
export function offsetsFromSpanCoords(index, coords) {
  if (!coords || !index) return null;
  const { startSpanIdx, startCharInSpan, endSpanIdx, endCharInSpan } = coords;
  const charStart = spanCoordToFlat(index, startSpanIdx, startCharInSpan);
  const charEnd = spanCoordToFlat(index, endSpanIdx, endCharInSpan);
  if (charStart < 0 || charEnd < 0) return null;
  // Normalize so charStart <= charEnd (selection direction-agnostic).
  if (charStart <= charEnd) return { charStart, charEnd };
  return { charStart: charEnd, charEnd: charStart };
}

/**
 * Inverse: given an index and {charStart, charEnd} in flat coordinates,
 * return the equivalent {startSpanIdx, startCharInSpan, endSpanIdx,
 * endCharInSpan}.
 *
 * The 'end' coord uses end-mode boundary lookup so that a selection that
 * ends exactly at a span boundary points to the closing span, not the
 * span following it.
 *
 * Returns null if either offset is out of range.
 */
export function spanCoordsFromOffsets(index, charStart, charEnd) {
  if (!index) return null;
  if (!Number.isFinite(charStart) || !Number.isFinite(charEnd)) return null;
  const lo = Math.min(charStart, charEnd);
  const hi = Math.max(charStart, charEnd);
  const start = flatToSpanCoord(index, lo, 'start');
  const end = flatToSpanCoord(index, hi, 'end');
  if (!start || !end) return null;
  return {
    startSpanIdx: start.spanIdx,
    startCharInSpan: start.charWithinSpan,
    endSpanIdx: end.spanIdx,
    endCharInSpan: end.charWithinSpan,
  };
}

/**
 * Break a flat-offset range that spans multiple spans into a list of
 * per-span segments. Used by the highlight renderer to wrap text in
 * <mark> elements that don't cross DOM boundaries.
 *
 * Each segment is { spanIdx, startInSpan, endInSpan } with offsets
 * relative to the span's raw rendered text.
 *
 * Returns [] if the range is invalid or empty.
 */
export function segmentByOffsets(index, charStart, charEnd) {
  if (!index || !Array.isArray(index.spans)) return [];
  const lo = Math.min(charStart, charEnd);
  const hi = Math.max(charStart, charEnd);
  if (lo === hi) return [];
  const out = [];
  for (let i = 0; i < index.spans.length; i++) {
    const s = index.spans[i];
    if (s.flatEnd <= lo) continue;
    if (s.flatStart >= hi) break;
    const segStart = Math.max(lo, s.flatStart);
    const segEnd = Math.min(hi, s.flatEnd);
    if (segEnd <= segStart) continue;
    out.push({
      spanIdx: i,
      startInSpan: segStart - s.flatStart,
      endInSpan: segEnd - s.flatStart,
    });
  }
  return out;
}

// ── DOM adapters ───────────────────────────────────────────────────────
//
// These functions touch the DOM. They're not unit-tested in Phase A.
// Phase B (v3 reader integration) covers them via manual smoke + integration.

/**
 * Convert a live DOM Range inside a TextLayer to flat offsets.
 *
 * Algorithm:
 *   1. Walk up from range.startContainer to the nearest <span> child of
 *      textLayerEl. Compute the character offset within that span by
 *      summing prior text nodes inside the span plus the range's offset.
 *   2. Same for range.endContainer.
 *   3. Look up each span's position in the spans NodeList to get spanIdx.
 *   4. Convert (spanIdx, charInSpan) to flat coords.
 *
 * Returns null if either endpoint isn't inside a text-layer span.
 */
export function offsetsFromRange(index, textLayerEl, domRange) {
  if (!index || !textLayerEl || !domRange) return null;
  const spans = textLayerEl.querySelectorAll('span');
  if (spans.length === 0) return null;
  const start = locateInSpans(spans, domRange.startContainer, domRange.startOffset);
  const end = locateInSpans(spans, domRange.endContainer, domRange.endOffset);
  if (!start || !end) return null;
  const coords = {
    startSpanIdx: start.spanIdx,
    startCharInSpan: start.charInSpan,
    endSpanIdx: end.spanIdx,
    endCharInSpan: end.charInSpan,
  };
  return offsetsFromSpanCoords(index, coords);
}

/**
 * Build a live DOM Range that covers the given flat offsets in the
 * provided TextLayer. Returns null if the offsets can't be resolved to
 * actual text nodes (e.g. the page's text-layer hasn't rendered yet).
 */
export function rangeFromOffsets(index, textLayerEl, charStart, charEnd) {
  if (!index || !textLayerEl) return null;
  const coords = spanCoordsFromOffsets(index, charStart, charEnd);
  if (!coords) return null;
  const spans = textLayerEl.querySelectorAll('span');
  const startSpan = spans[coords.startSpanIdx];
  const endSpan = spans[coords.endSpanIdx];
  if (!startSpan || !endSpan) return null;
  const startText = firstTextNode(startSpan);
  const endText = firstTextNode(endSpan);
  if (!startText || !endText) return null;
  const range = textLayerEl.ownerDocument.createRange();
  range.setStart(startText, Math.min(coords.startCharInSpan, startText.length));
  range.setEnd(endText, Math.min(coords.endCharInSpan, endText.length));
  return range;
}

/**
 * Walk up from a DOM node to find its enclosing <span> child of the
 * text layer, then compute the character offset within that span.
 *
 * Returns { spanIdx, charInSpan } or null.
 */
function locateInSpans(spans, node, offsetInNode) {
  if (!node) return null;
  // Find the <span> ancestor that's a direct/indirect child of the text layer.
  let cur = node;
  let stopSpan = null;
  while (cur) {
    if (cur.nodeType === 1 /* Element */ && cur.tagName === 'SPAN') {
      // Is this span in our spans NodeList?
      for (let i = 0; i < spans.length; i++) {
        if (spans[i] === cur) {
          stopSpan = { el: cur, idx: i };
          break;
        }
      }
      if (stopSpan) break;
    }
    cur = cur.parentNode;
  }
  if (!stopSpan) return null;
  // Sum text-node lengths inside the span up to `node`, then add offsetInNode.
  const charInSpan = textOffsetWithin(stopSpan.el, node, offsetInNode);
  if (charInSpan < 0) return null;
  return { spanIdx: stopSpan.idx, charInSpan };
}

/**
 * Walk the descendants of `root` in document order, summing the
 * `nodeValue.length` of every text node we pass through. Stop at
 * `target` and return the running total + `offsetInTarget`.
 *
 * Returns -1 if `target` isn't a descendant of `root`.
 */
function textOffsetWithin(root, target, offsetInTarget) {
  if (root === target) {
    // Element offset: how many chars come before child[offsetInTarget]?
    if (target.nodeType === 1) {
      let total = 0;
      for (let i = 0; i < offsetInTarget && i < target.childNodes.length; i++) {
        total += textLength(target.childNodes[i]);
      }
      return total;
    }
    // Text node at the root edge.
    return Math.min(offsetInTarget, target.length || 0);
  }
  let total = 0;
  let found = false;
  walk(root);
  return found ? total : -1;

  function walk(node) {
    if (found) return;
    if (node === target) {
      if (node.nodeType === 3 /* Text */) {
        total += Math.min(offsetInTarget, node.length || 0);
      } else {
        for (let i = 0; i < offsetInTarget && i < node.childNodes.length; i++) {
          total += textLength(node.childNodes[i]);
        }
      }
      found = true;
      return;
    }
    if (node.nodeType === 3) {
      total += node.length || 0;
      return;
    }
    const children = node.childNodes || [];
    for (let i = 0; i < children.length; i++) {
      walk(children[i]);
      if (found) return;
    }
  }
}

function textLength(node) {
  if (!node) return 0;
  if (node.nodeType === 3) return node.length || 0;
  let total = 0;
  const children = node.childNodes || [];
  for (let i = 0; i < children.length; i++) total += textLength(children[i]);
  return total;
}

function firstTextNode(el) {
  if (!el) return null;
  if (el.nodeType === 3) return el;
  const children = el.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const t = firstTextNode(children[i]);
    if (t) return t;
  }
  return null;
}

// Re-export for callers that only need the lookup helper.
export { findSpanIdxForOffset };
