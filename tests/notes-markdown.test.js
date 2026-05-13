import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown, countWords } from '../os/apps/notes/engine/markdown.js';

describe('renderMarkdown — headings', () => {
  test('# H1', () => {
    assert.equal(renderMarkdown('# Hello'), '<h1>Hello</h1>');
  });
  test('## H2', () => {
    assert.equal(renderMarkdown('## World'), '<h2>World</h2>');
  });
  test('###### H6 — max depth', () => {
    assert.equal(renderMarkdown('###### Six'), '<h6>Six</h6>');
  });
  test('####### → paragraph, not h7', () => {
    assert.equal(renderMarkdown('####### Too deep'), '<p>####### Too deep</p>');
  });
});

describe('renderMarkdown — inline formatting', () => {
  test('bold', () => {
    assert.equal(renderMarkdown('say **hi** there'), '<p>say <strong>hi</strong> there</p>');
  });
  test('italic', () => {
    assert.equal(renderMarkdown('say *hi* there'), '<p>say <em>hi</em> there</p>');
  });
  test('strikethrough', () => {
    assert.equal(renderMarkdown('~~old~~'), '<p><del>old</del></p>');
  });
  test('inline code', () => {
    assert.equal(renderMarkdown('use `npm test`'), '<p>use <code>npm test</code></p>');
  });
  test('code spans protect bold inside', () => {
    assert.equal(renderMarkdown('`**not bold**`'), '<p><code>**not bold**</code></p>');
  });
});

describe('renderMarkdown — XSS safety', () => {
  test('escapes <script> tags', () => {
    const out = renderMarkdown('<script>alert(1)</script>');
    assert.ok(!out.includes('<script>'));
    assert.ok(out.includes('&lt;script&gt;'));
  });
  test('escapes attribute-style HTML', () => {
    const out = renderMarkdown('<img src=x onerror=alert(1)>');
    assert.ok(!out.includes('<img'));
    assert.ok(out.includes('&lt;img'));
  });
  test('rejects javascript: in markdown links', () => {
    // Should render as literal text, not an anchor.
    const out = renderMarkdown('[click](javascript:alert(1))');
    assert.ok(!out.includes('href="javascript:'));
  });
  test('rejects data: URLs', () => {
    const out = renderMarkdown('[click](data:text/html,<script>alert(1)</script>)');
    assert.ok(!out.includes('href="data:'));
  });
  test('accepts https URLs', () => {
    const out = renderMarkdown('[ok](https://example.com)');
    assert.ok(out.includes('href="https://example.com"'));
  });
});

describe('renderMarkdown — lists', () => {
  test('bullet list', () => {
    const out = renderMarkdown('- one\n- two\n- three');
    assert.equal(out, '<ul><li>one</li><li>two</li><li>three</li></ul>');
  });
  test('numbered list with start', () => {
    const out = renderMarkdown('3. foo\n4. bar');
    assert.ok(out.startsWith('<ol start="3">'));
    assert.ok(out.includes('<li>foo</li>'));
    assert.ok(out.includes('<li>bar</li>'));
  });
  test('GFM checkbox unchecked', () => {
    const out = renderMarkdown('- [ ] buy milk');
    assert.ok(out.includes('<input type="checkbox" disabled>'));
    assert.ok(out.includes('buy milk'));
  });
  test('GFM checkbox checked', () => {
    const out = renderMarkdown('- [x] done');
    assert.ok(out.includes('<input type="checkbox" disabled checked>'));
  });
});

describe('renderMarkdown — block elements', () => {
  test('horizontal rule', () => {
    assert.equal(renderMarkdown('---'), '<hr>');
  });
  test('blockquote', () => {
    const out = renderMarkdown('> quoted');
    assert.equal(out, '<blockquote><p>quoted</p></blockquote>');
  });
  test('fenced code block preserves contents', () => {
    const out = renderMarkdown('```js\nconst x = 1;\n```');
    assert.ok(out.includes('<pre>'));
    assert.ok(out.includes('class="language-js"'));
    assert.ok(out.includes('const x = 1;'));
  });
  test('fenced code blocks escape HTML in body', () => {
    const out = renderMarkdown('```\n<script>alert(1)</script>\n```');
    assert.ok(!out.includes('<script>'));
    assert.ok(out.includes('&lt;script&gt;'));
  });
});

describe('renderMarkdown — links and wikilinks', () => {
  test('markdown link', () => {
    const out = renderMarkdown('see [docs](https://example.com)');
    assert.ok(out.includes('<a href="https://example.com"'));
    assert.ok(out.includes('>docs</a>'));
  });
  test('auto-link bare URL', () => {
    const out = renderMarkdown('go to https://example.com now');
    assert.ok(out.includes('<a href="https://example.com"'));
  });
  test('wikilink to [[Title]]', () => {
    const out = renderMarkdown('see [[My Note]]');
    assert.ok(out.includes('class="nc-wikilink"'));
    assert.ok(out.includes('data-title="My Note"'));
    assert.ok(out.includes('[[My Note]]'));
  });
  test('strips trailing punctuation from auto-link', () => {
    const out = renderMarkdown('see https://example.com.');
    assert.ok(out.includes('href="https://example.com"'));
    assert.ok(out.includes('</a>.'));
  });
});

describe('renderMarkdown — paragraphs and edge cases', () => {
  test('empty input', () => {
    assert.equal(renderMarkdown(''), '');
    assert.equal(renderMarkdown(null), '');
    assert.equal(renderMarkdown(undefined), '');
  });
  test('plain paragraph', () => {
    assert.equal(renderMarkdown('hello world'), '<p>hello world</p>');
  });
  test('two paragraphs', () => {
    assert.equal(renderMarkdown('first\n\nsecond'), '<p>first</p><p>second</p>');
  });
  test('multi-line paragraph joins with <br>', () => {
    assert.equal(renderMarkdown('one\ntwo'), '<p>one<br>two</p>');
  });
});

describe('countWords', () => {
  test('empty', () => { assert.equal(countWords(''), 0); assert.equal(countWords('   '), 0); });
  test('single word', () => { assert.equal(countWords('hi'), 1); });
  test('multi word', () => { assert.equal(countWords('one two three'), 3); });
  test('handles newlines', () => { assert.equal(countWords('one\ntwo\nthree'), 3); });
});
