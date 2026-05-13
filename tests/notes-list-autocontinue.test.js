import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { handleListEnter } from '../os/apps/notes/engine/listAutoContinue.js';

describe('handleListEnter — no-op cases', () => {
  test('not in a list line', () => {
    const r = handleListEnter({
      value: 'just some text', selectionStart: 14, selectionEnd: 14,
    });
    assert.equal(r.handled, false);
  });

  test('caret not at end of line', () => {
    // value: "- foo\n", caret at position 3 (inside "foo")
    const r = handleListEnter({
      value: '- foo', selectionStart: 3, selectionEnd: 3,
    });
    assert.equal(r.handled, false);
  });

  test('selection range is non-empty', () => {
    const r = handleListEnter({
      value: '- foo', selectionStart: 2, selectionEnd: 5,
    });
    assert.equal(r.handled, false);
  });
});

describe('handleListEnter — bullet lists', () => {
  test('continue bullet list at end of line', () => {
    const r = handleListEnter({
      value: '- foo', selectionStart: 5, selectionEnd: 5,
    });
    assert.equal(r.handled, true);
    assert.equal(r.value, '- foo\n- ');
    assert.equal(r.selectionStart, 8);
    assert.equal(r.selectionEnd, 8);
  });

  test('continue * marker', () => {
    const r = handleListEnter({
      value: '* item', selectionStart: 6, selectionEnd: 6,
    });
    assert.equal(r.handled, true);
    assert.equal(r.value, '* item\n* ');
  });

  test('continue + marker', () => {
    const r = handleListEnter({
      value: '+ item', selectionStart: 6, selectionEnd: 6,
    });
    assert.equal(r.handled, true);
    assert.equal(r.value, '+ item\n+ ');
  });

  test('preserves indentation', () => {
    const r = handleListEnter({
      value: '  - nested', selectionStart: 10, selectionEnd: 10,
    });
    assert.equal(r.handled, true);
    assert.equal(r.value, '  - nested\n  - ');
  });

  test('empty bullet item → exit list', () => {
    // "- " followed by an empty line (caret at end of "- ")
    const r = handleListEnter({
      value: '- ', selectionStart: 2, selectionEnd: 2,
    });
    assert.equal(r.handled, true);
    assert.equal(r.value, '');
    assert.equal(r.selectionStart, 0);
  });

  test('empty bullet on second line of a list', () => {
    const r = handleListEnter({
      value: '- foo\n- ', selectionStart: 8, selectionEnd: 8,
    });
    assert.equal(r.handled, true);
    assert.equal(r.value, '- foo\n');
    assert.equal(r.selectionStart, 6);
  });
});

describe('handleListEnter — checkboxes', () => {
  test('continue with empty checkbox', () => {
    const r = handleListEnter({
      value: '- [ ] task', selectionStart: 10, selectionEnd: 10,
    });
    assert.equal(r.handled, true);
    assert.equal(r.value, '- [ ] task\n- [ ] ');
  });

  test('continue after a checked box (new box is unchecked)', () => {
    const r = handleListEnter({
      value: '- [x] done', selectionStart: 10, selectionEnd: 10,
    });
    assert.equal(r.handled, true);
    assert.equal(r.value, '- [x] done\n- [ ] ');
  });

  test('empty checkbox line → exit list', () => {
    const r = handleListEnter({
      value: '- [ ] ', selectionStart: 6, selectionEnd: 6,
    });
    assert.equal(r.handled, true);
    assert.equal(r.value, '');
  });
});

describe('handleListEnter — numbered lists', () => {
  test('continue with incremented number', () => {
    const r = handleListEnter({
      value: '1. first', selectionStart: 8, selectionEnd: 8,
    });
    assert.equal(r.handled, true);
    assert.equal(r.value, '1. first\n2. ');
  });

  test('preserves multi-digit numbers', () => {
    const r = handleListEnter({
      value: '12. twelve', selectionStart: 10, selectionEnd: 10,
    });
    assert.equal(r.handled, true);
    assert.equal(r.value, '12. twelve\n13. ');
  });

  test('empty numbered item → exit list', () => {
    const r = handleListEnter({
      value: '1. ', selectionStart: 3, selectionEnd: 3,
    });
    assert.equal(r.handled, true);
    assert.equal(r.value, '');
  });

  test('continue mid-document', () => {
    const r = handleListEnter({
      value: 'intro\n\n1. first', selectionStart: 15, selectionEnd: 15,
    });
    assert.equal(r.handled, true);
    assert.equal(r.value, 'intro\n\n1. first\n2. ');
  });
});

describe('handleListEnter — defensive', () => {
  test('handles missing args', () => {
    assert.equal(handleListEnter({}).handled, false);
    assert.equal(handleListEnter().handled, false);
  });
  test('rejects non-string value', () => {
    assert.equal(handleListEnter({ value: 123, selectionStart: 0, selectionEnd: 0 }).handled, false);
  });
});
