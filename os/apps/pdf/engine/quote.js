/**
 * pdf/engine/quote.js — format a selected passage + citation.
 *
 * Output forms:
 *   formatQuote({ text, docTitle, page })
 *     → "<text>" — <docTitle>, p.<page>
 *
 *   formatQuoteMarkdown(...)
 *     → > <text>\n> — *<docTitle>*, p.<page>
 *
 * Pure module — no DOM, no kernel.
 */

const MAX_QUOTE_LEN = 1200; // arbitrary cap to keep clipboard sane

function clean(s) {
  // Collapse PDF text-layer whitespace (line wraps, hyphenation
  // glitches) into single spaces. Preserve paragraph breaks if any.
  return String(s || '')
    .replace(/-\n/g, '')          // soft-hyphen line wrap
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_QUOTE_LEN);
}

function trimTitle(s) {
  return String(s || '').trim().replace(/\.pdf$/i, '').slice(0, 200);
}

export function formatQuote(args) {
  const a = args || {};
  const t = clean(a.text);
  if (!t) return '';
  const title = trimTitle(a.docTitle);
  const pageStr = Number.isFinite(a.page) && a.page >= 1 ? `p.${Math.floor(a.page)}` : '';
  const cite = [title, pageStr].filter(Boolean).join(', ');
  return cite ? `“${t}” — ${cite}` : `“${t}”`;
}

export function formatQuoteMarkdown(args) {
  const a = args || {};
  const t = clean(a.text);
  if (!t) return '';
  const title = trimTitle(a.docTitle);
  const pageStr = Number.isFinite(a.page) && a.page >= 1 ? `p.${Math.floor(a.page)}` : '';
  const cite = title ? `*${title}*${pageStr ? `, ${pageStr}` : ''}` : pageStr;
  const head = `> ${t}`;
  return cite ? `${head}\n> — ${cite}` : head;
}
