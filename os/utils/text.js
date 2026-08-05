/**
 * os/utils/text.js — display-text hygiene.
 *
 * Every label the user types and the product later renders back to them
 * gets stripped of characters that corrupt a list visually. Labels render
 * through `textContent`, so none of this is an XSS control — it is display
 * integrity. A pasted RLO visually reverses the rest of the row, and
 * zero-width characters make two different entries look identical, which
 * turns "remove the duplicate" into a guess.
 *
 * Extracted from mail/persistence.js when quick links needed the same
 * treatment. Two copies of a sanitizer is how one of them silently falls
 * behind the other.
 */

const STRIPPED_RANGES = [
  [0x0000, 0x001f], // C0 controls, incl. newline and tab
  [0x007f, 0x009f], // DEL + C1 controls
  [0x200b, 0x200b], // ZWSP — the "two labels look identical" character
  [0x200e, 0x200f], // LRM / RLM
  [0x202a, 0x202e], // bidi embedding + override (RLO is the nasty one)
  [0x2066, 0x2069], // bidi isolates
];

/*
 * NOT stripped, deliberately: U+200C ZWNJ and U+200D ZWJ.
 *
 * The range this was extracted from ran 200b–200f in one span, which swept
 * up both. They are not invisible tricks — they are text-shaping characters:
 * ZWJ is what joins 👨‍👩‍👧 into one family glyph, and ZWNJ controls Arabic
 * and Persian letter joining. Stripping them silently mangles a legitimate
 * label into three separate emoji or a misspelt word.
 *
 * The characters that actually cause the two problems in the docblock above
 * are ZWSP (invisible duplicate) and the bidi overrides (visual reversal),
 * and those are still stripped.
 */

/**
 * Strip control/invisible/bidi-override characters, trim, and clamp.
 *
 * Iterates by code POINT (for..of over a string), so astral characters —
 * emoji, which users do put in labels — survive intact rather than being
 * split into surrogate halves.
 *
 * @param {*} raw
 * @param {number} maxLen
 * @returns {string} always a string, never null
 */
export function sanitizeDisplayText(raw, maxLen = 60) {
  if (typeof raw !== 'string') return '';
  let out = '';
  for (const ch of raw) {
    const cp = ch.codePointAt(0);
    if (STRIPPED_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)) continue;
    out += ch;
  }
  return out.trim().slice(0, maxLen);
}
