/**
 * notes/engine/listAutoContinue.js — pure function that decides what
 * to do when the user presses Enter inside a list line.
 *
 * Input: { value, selectionStart, selectionEnd } from the textarea.
 * Output: either { handled: false } (let the browser do default) or
 *         { handled: true, value, selectionStart, selectionEnd } with
 *         the new textarea state.
 *
 * Two behaviors:
 *   a) Caret at end of a non-empty list line  →  insert a new line with
 *      the same prefix (and renumber if ordered).
 *   b) Caret at end of an EMPTY list line     →  strip the prefix and
 *      end the list.
 *
 * Supported prefixes:
 *   - "- ", "* ", "+ "
 *   - "- [ ] ", "- [x] ", "- [X] "
 *   - "1. ", "12. ", etc.
 *
 * Target size: ≤ 110 lines.
 */

const BULLET_RE = /^(\s*)([-*+])\s(\[[\sxX]\]\s)?(.*)$/;
const NUMBER_RE = /^(\s*)(\d+)\.\s(.*)$/;

export function handleListEnter({ value, selectionStart, selectionEnd } = {}) {
  if (typeof value !== 'string') return { handled: false };
  if (selectionStart !== selectionEnd) return { handled: false };
  const caret = selectionStart;
  if (typeof caret !== 'number' || caret < 0 || caret > value.length) {
    return { handled: false };
  }

  // Find the start of the line the caret is on.
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const lineEnd = value.indexOf('\n', caret);
  const line = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);

  // Caret must be at the END of the current line (otherwise the user
  // is editing mid-line; let Enter behave normally).
  if (caret !== lineStart + line.length) return { handled: false };

  // Bullet ("-", "*", "+") with optional checkbox.
  const bullet = line.match(BULLET_RE);
  if (bullet) {
    const [, indent, marker, checkbox, content] = bullet;
    if (content.trim() === '') {
      // Empty list item → strip the line entirely + drop out of the list.
      return replaceLine(value, lineStart, line, '', caret);
    }
    const prefix = `${indent}${marker} ${checkbox ? '[ ] ' : ''}`;
    return insertNewLine(value, caret, prefix);
  }

  // Numbered "1. " style.
  const num = line.match(NUMBER_RE);
  if (num) {
    const [, indent, digits, content] = num;
    if (content.trim() === '') {
      return replaceLine(value, lineStart, line, '', caret);
    }
    const next = String(Number(digits) + 1);
    const prefix = `${indent}${next}. `;
    return insertNewLine(value, caret, prefix);
  }

  return { handled: false };
}

function insertNewLine(value, caret, prefix) {
  const before = value.slice(0, caret);
  const after = value.slice(caret);
  const inserted = `\n${prefix}`;
  return {
    handled: true,
    value: before + inserted + after,
    selectionStart: caret + inserted.length,
    selectionEnd: caret + inserted.length,
  };
}

function replaceLine(value, lineStart, oldLine, newLine, caret) {
  const before = value.slice(0, lineStart);
  const after = value.slice(lineStart + oldLine.length);
  const newValue = before + newLine + after;
  const newCaret = lineStart + newLine.length;
  // Suppress the bare Enter that triggered this — caller does NOT
  // insert an additional newline after we strip the prefix.
  return {
    handled: true,
    value: newValue,
    selectionStart: newCaret,
    selectionEnd: newCaret,
  };
}
