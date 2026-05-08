/**
 * Tests for pdf/engine/inlineCalc.js — looksNumeric, evaluate, format.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { looksNumeric, evaluate, format } from '../os/apps/pdf/engine/inlineCalc.js';

describe('looksNumeric', () => {
  test('rejects non-strings', () => {
    assert.equal(looksNumeric(null), false);
    assert.equal(looksNumeric(undefined), false);
    assert.equal(looksNumeric(42), false);
    assert.equal(looksNumeric(''), false);
  });

  test('accepts simple expressions', () => {
    assert.equal(looksNumeric('257 / 42'), true);
    assert.equal(looksNumeric('(1 + 2) * 3'), true);
    assert.equal(looksNumeric('3.14'), true);
    assert.equal(looksNumeric('10%'), true);
    assert.equal(looksNumeric('5 × 6'), true);
    assert.equal(looksNumeric('100 ÷ 4'), true);
  });

  test('rejects letters or words', () => {
    assert.equal(looksNumeric('hello'), false);
    assert.equal(looksNumeric('eval(1+1)'), false);
    assert.equal(looksNumeric('abc + 1'), false);
  });

  test('requires at least one digit', () => {
    assert.equal(looksNumeric('+++'), false);
    assert.equal(looksNumeric('()'), false);
    assert.equal(looksNumeric('   '), false);
  });
});

describe('evaluate', () => {
  test('basic arithmetic', () => {
    assert.equal(evaluate('1 + 2').value, 3);
    assert.equal(evaluate('10 - 4').value, 6);
    assert.equal(evaluate('3 * 4').value, 12);
    assert.equal(evaluate('20 / 5').value, 4);
  });

  test('the design mock example: 257 ÷ 42 ≈ 6.12', () => {
    const r = evaluate('257 ÷ 42');
    assert.equal(r.ok, true);
    assert.ok(Math.abs(r.value - (257 / 42)) < 1e-9);
  });

  test('parens + precedence', () => {
    assert.equal(evaluate('2 + 3 * 4').value, 14);
    assert.equal(evaluate('(2 + 3) * 4').value, 20);
  });

  test('decimals', () => {
    const r = evaluate('1.5 + 2.25');
    assert.equal(r.ok, true);
    assert.equal(r.value, 3.75);
  });

  test('unary minus', () => {
    assert.equal(evaluate('-5 + 3').value, -2);
    assert.equal(evaluate('-(2 + 3)').value, -5);
  });

  test('percentage suffix', () => {
    assert.equal(evaluate('10%').value, 0.1);
    const half = evaluate('200 * 50%');
    assert.ok(half.ok);
    assert.equal(half.value, 100);
  });

  test('× and ÷ aliases', () => {
    assert.equal(evaluate('6 × 7').value, 42);
    assert.equal(evaluate('100 ÷ 4').value, 25);
  });

  test('thousands separators are ignored', () => {
    assert.equal(evaluate('1,000 + 500').value, 1500);
  });

  test('rejects non-numeric input', () => {
    const r = evaluate('hello world');
    assert.equal(r.ok, false);
  });

  test('rejects divide by zero', () => {
    const r = evaluate('10 / 0');
    assert.equal(r.ok, false);
    assert.match(r.reason, /zero/i);
  });

  test('rejects unbalanced parens', () => {
    assert.equal(evaluate('(1 + 2').ok, false);
    assert.equal(evaluate('1 + 2)').ok, false);
  });

  test('rejects empty / whitespace', () => {
    assert.equal(evaluate('').ok, false);
    assert.equal(evaluate('   ').ok, false);
  });

  test('rejects double dot in number', () => {
    assert.equal(evaluate('1.2.3').ok, false);
  });

  test('does not execute via eval-like injection', () => {
    // These should fail looksNumeric outright, not throw.
    assert.equal(evaluate('alert(1)').ok, false);
    assert.equal(evaluate('process.exit()').ok, false);
    assert.equal(evaluate('1+1; alert(1)').ok, false);
  });
});

describe('format', () => {
  test('integer with grouping', () => {
    assert.equal(format(1000), (1000).toLocaleString());
    assert.equal(format(0), '0');
    assert.equal(format(-42), '-42');
  });

  test('decimal trims trailing zeros', () => {
    assert.equal(format(6.123456), '6.1235');
    // 257/42 = 6.119047... → 6.119 after trim
    const r = evaluate('257 / 42');
    const f = format(r.value);
    assert.match(f, /^6\.119/);
  });

  test('non-finite is em-dash', () => {
    assert.equal(format(NaN), '—');
    assert.equal(format(Infinity), '—');
  });
});
