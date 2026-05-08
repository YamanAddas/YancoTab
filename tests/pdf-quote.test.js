/**
 * Tests for pdf/engine/quote.js — formatQuote, formatQuoteMarkdown.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { formatQuote, formatQuoteMarkdown } from '../os/apps/pdf/engine/quote.js';

describe('formatQuote', () => {
  test('produces title + page when both present', () => {
    const q = formatQuote({ text: 'Evaluating the outcome', docTitle: 'DOET', page: 43 });
    assert.equal(q, '“Evaluating the outcome” — DOET, p.43');
  });

  test('strips trailing .pdf from title', () => {
    const q = formatQuote({ text: 'Hi', docTitle: 'manual.pdf', page: 1 });
    assert.equal(q, '“Hi” — manual, p.1');
  });

  test('omits citation when only text is given', () => {
    assert.equal(formatQuote({ text: 'just words' }), '“just words”');
  });

  test('omits page when not finite', () => {
    const q = formatQuote({ text: 't', docTitle: 'D', page: 0 });
    assert.equal(q, '“t” — D');
  });

  test('returns empty string when text is missing/empty', () => {
    assert.equal(formatQuote({ docTitle: 'D', page: 1 }), '');
    assert.equal(formatQuote({ text: '   ', docTitle: 'D', page: 1 }), '');
    assert.equal(formatQuote(null), '');
  });

  test('joins soft-hyphen line wraps', () => {
    const q = formatQuote({ text: 'evalu-\nating the outcome', docTitle: 'D', page: 1 });
    assert.equal(q, '“evaluating the outcome” — D, p.1');
  });

  test('collapses runs of whitespace', () => {
    const q = formatQuote({ text: 'hello\n  there\nworld', docTitle: 'D', page: 1 });
    assert.equal(q, '“hello there world” — D, p.1');
  });

  test('caps quote length', () => {
    const long = 'x'.repeat(2000);
    const q = formatQuote({ text: long, docTitle: 'D', page: 1 });
    // Output includes typographic quotes plus citation; quote body is capped to 1200.
    const inner = q.replace(/^[“”"]|[“”"].*$/g, '');
    assert.ok(inner.length <= 1200);
  });
});

describe('formatQuoteMarkdown', () => {
  test('uses blockquote prefix and italicizes title', () => {
    const md = formatQuoteMarkdown({ text: 'Hello world', docTitle: 'DOET', page: 43 });
    assert.equal(md, '> Hello world\n> — *DOET*, p.43');
  });

  test('omits italic when no title', () => {
    const md = formatQuoteMarkdown({ text: 'Hello', page: 1 });
    assert.equal(md, '> Hello\n> — p.1');
  });

  test('returns empty for empty text', () => {
    assert.equal(formatQuoteMarkdown({ text: '   ' }), '');
  });
});
