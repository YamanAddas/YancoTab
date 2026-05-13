/**
 * pdf/v3/render/highlightRender.js — apply offset-based highlights to a
 * rendered pdf.js TextLayer.
 *
 * Replaces v2's `view/applyHighlights.js`. The v2 module re-found
 * stored text by normalized substring matching, which broke on
 * hyphenated line breaks, ligatures, and glyph-fragment spans. v3
 * stores {pageStartCharOffset, pageEndCharOffset} into a per-page flat
 * text stream (built by pageTextIndex.js), and this module rebuilds a
 * DOM Range for each highlight from those offsets — same approach
 * Mozilla's reference viewer uses.
 *
 * Wrapping strategy:
 *   For each segment (one per touched span), we split the span's text
 *   into up-to-three pieces (before / inside / after) and replace the
 *   inside piece with a <mark class="pdf-hl pdf-hl-yellow"> wrapper.
 *   The split is done on the underlying text node, NOT via
 *   range.surroundContents (which throws if the range crosses element
 *   boundaries — which it can inside a span that has nested nodes).
 *
 * Idempotency:
 *   On re-apply, we clear all .pdf-hl wrappers first and rebuild. This
 *   keeps the code simple at the cost of a small DOM churn on re-render.
 *   Phase B accepts the churn; an incremental updater can land later.
 *
 * Target size: ≤ 300 lines.
 */

import { segmentByOffsets } from '../select/offsetRanges.js';

const HL_TAG = 'mark';
const HL_BASE_CLASS = 'pdf-hl';

/**
 * @param {HTMLElement} textLayerEl  the .cx-text-layer / .pdf-textlayer div
 * @param {Object} pageIndex          the pageTextIndex.js index
 * @param {Array<Object>} highlights  list of v3 highlight annotations
 *                                     with offsets + color + kind
 */
export function applyHighlights(textLayerEl, pageIndex, highlights) {
  if (!textLayerEl || !pageIndex) return;
  clearHighlights(textLayerEl);
  if (!Array.isArray(highlights) || highlights.length === 0) return;

  const spans = textLayerEl.querySelectorAll('span');
  if (spans.length === 0) return;

  // Process in order so later highlights paint over earlier ones at
  // identical positions (deterministic z-stacking).
  for (const h of highlights) {
    if (!Number.isFinite(h.pageStartCharOffset) || !Number.isFinite(h.pageEndCharOffset)) continue;
    const segs = segmentByOffsets(pageIndex, h.pageStartCharOffset, h.pageEndCharOffset);
    if (segs.length === 0) continue;
    for (const seg of segs) {
      const span = spans[seg.spanIdx];
      if (!span) continue;
      wrapSpanRange(span, seg.startInSpan, seg.endInSpan, h);
    }
  }
}

/**
 * Remove all highlight wrappers from a text layer. Used both before a
 * re-apply and on page unmount.
 */
export function clearHighlights(textLayerEl) {
  if (!textLayerEl) return;
  const marks = textLayerEl.querySelectorAll(`${HL_TAG}.${HL_BASE_CLASS}`);
  marks.forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize?.();
  });
}

/**
 * Wrap a sub-range of a single <span>'s text in a <mark>.
 *
 * Pdf.js renders each text item as ONE direct text-node child of the
 * span. We work against that text node. If startInSpan / endInSpan
 * land outside its bounds (because the span had nested wrappers from
 * a prior highlight), we walk the descendants to find the text node
 * containing those positions.
 *
 * Class shape:
 *   <mark class="pdf-hl pdf-hl-yellow pdf-hl-kind-highlight"
 *         data-ann-id="42">
 */
function wrapSpanRange(span, startInSpan, endInSpan, highlight) {
  if (endInSpan <= startInSpan) return;
  const text = collectText(span);
  if (text.length === 0) return;
  const start = Math.max(0, Math.min(startInSpan, text.length));
  const end = Math.max(start, Math.min(endInSpan, text.length));
  if (end <= start) return;

  // Find the text node(s) corresponding to [start, end). Pdf.js's
  // default render puts ALL of the span's text in a single text-node
  // child. After a prior wrap, the text may have been split across a
  // <mark> + sibling text nodes — we walk in order, accumulating
  // offsets, and split each text node we cross.
  let cursor = 0;
  const nodes = collectTextNodes(span);
  let startNode = null, startOffset = 0;
  let endNode = null, endOffset = 0;

  for (const node of nodes) {
    const len = node.length;
    const nodeStart = cursor;
    const nodeEnd = cursor + len;
    if (!startNode && start >= nodeStart && start <= nodeEnd) {
      startNode = node;
      startOffset = start - nodeStart;
    }
    if (start <= nodeEnd && end <= nodeEnd && end >= nodeStart) {
      endNode = node;
      endOffset = end - nodeStart;
    }
    cursor = nodeEnd;
    if (endNode) break;
  }
  if (!startNode || !endNode) return;

  const range = (startNode.ownerDocument || document).createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);

  const mark = (startNode.ownerDocument || document).createElement(HL_TAG);
  mark.className = `${HL_BASE_CLASS} ${HL_BASE_CLASS}-${highlight.color || 'yellow'} ${HL_BASE_CLASS}-kind-${highlight.kind || 'highlight'}`;
  if (Number.isFinite(highlight.id)) mark.dataset.annId = String(highlight.id);

  try {
    // Range.surroundContents throws on partial-node boundaries; fall
    // back to extract + wrap.
    range.surroundContents(mark);
  } catch {
    const frag = range.extractContents();
    mark.appendChild(frag);
    range.insertNode(mark);
  }
}

function collectText(el) {
  if (!el) return '';
  if (el.nodeType === 3) return el.nodeValue || '';
  let s = '';
  const children = el.childNodes || [];
  for (let i = 0; i < children.length; i++) s += collectText(children[i]);
  return s;
}

function collectTextNodes(root) {
  const out = [];
  walk(root);
  return out;
  function walk(node) {
    if (!node) return;
    if (node.nodeType === 3) { out.push(node); return; }
    if (node.nodeType !== 1) return;
    const children = node.childNodes || [];
    for (let i = 0; i < children.length; i++) walk(children[i]);
  }
}
