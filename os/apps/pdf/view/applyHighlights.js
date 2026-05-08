/**
 * pdf/view/applyHighlights.js — re-apply stored highlights to a
 * rendered pdf.js text layer.
 *
 * Approach: for each stored highlight, walk spans starting at every
 * candidate position. Concatenate normalized text until the
 * highlight text appears as a substring. Wrap that span run in
 * `<mark class="cx-hl cx-hl-<color>">`.
 *
 * False-positive resistant because we require the FULL highlight
 * text to appear as a substring of the concatenated spans, not the
 * other way around.
 */

const MAX_SPAN_RUN = 80; // hard cap so a missing match doesn't burn O(n²)

export function applyHighlights(textLayerEl, highlights) {
  if (!textLayerEl || !Array.isArray(highlights) || highlights.length === 0) return;
  const spans = Array.from(textLayerEl.querySelectorAll('span'));
  if (spans.length === 0) return;

  // Skip already-highlighted spans on subsequent calls.
  for (const h of highlights) {
    const target = normalize(h.text);
    if (!target || target.length < 2) continue;
    const color = h.color || 'accent';

    let cursor = 0;
    while (cursor < spans.length) {
      const startIdx = cursor;
      let acc = '';
      let matched = -1;
      for (let end = startIdx; end < spans.length && end - startIdx < MAX_SPAN_RUN; end++) {
        const s = spans[end];
        if (s.dataset.cxHl) break;
        const txt = normalize(s.textContent);
        if (!txt) {
          // Empty span; just continue.
          continue;
        }
        const next = acc ? `${acc} ${txt}` : txt;
        // If we've drifted off the start of the target, abort this run early.
        if (!matchesPrefix(next, target)) break;
        acc = next;
        if (acc.includes(target)) { matched = end; break; }
      }
      if (matched >= 0) {
        for (let i = startIdx; i <= matched; i++) {
          const s = spans[i];
          s.classList.add('cx-hl', `cx-hl-${color}`);
          s.dataset.cxHl = '1';
        }
        cursor = matched + 1;
      } else {
        cursor = startIdx + 1;
      }
    }
  }
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Does `target` start with any suffix of `acc`? In other words —
 * could `acc` still be a prefix of a future match? This lets us
 * abort runs that have already drifted past the target's start.
 *
 * Example: target = "evaluating the outcome", acc so far = "and we are evaluating".
 * The function checks whether "evaluating" is a prefix of target — yes,
 * so keep going.
 */
function matchesPrefix(acc, target) {
  if (acc.length === 0 || target.length === 0) return true;
  if (acc.length <= target.length) {
    // Find the longest acc-suffix that is a prefix of target.
    // For simplicity: check whether target starts with the LAST WORD onwards
    // of acc — that catches the common case where the run started just
    // before the target.
    if (target.includes(acc)) return true;
    const lastSpace = acc.lastIndexOf(' ');
    if (lastSpace >= 0) {
      const tail = acc.slice(lastSpace + 1);
      if (target.startsWith(tail)) return true;
    } else if (target.startsWith(acc)) return true;
    return false;
  }
  // acc longer than target — only useful if target is contained.
  return acc.includes(target);
}
