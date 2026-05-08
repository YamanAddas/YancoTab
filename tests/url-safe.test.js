/**
 * Regression tests for os/utils/url.js — the URL scheme allowlist that
 * gates user-controllable navigation (shortcut modal, openUserApp,
 * "send to browser" file action). The bug this prevents is concrete:
 * a `javascript:` shortcut typed into the modal would have run code in
 * the new-tab origin and exfiltrated every localStorage value.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { isSafeUrl, isHttpUrl } = await import('../os/utils/url.js');

describe('isSafeUrl — allowlist', () => {
  test('accepts the 5 safe schemes', () => {
    assert.equal(isSafeUrl('https://example.com'), true);
    assert.equal(isSafeUrl('http://example.com:8080/path?q=1'), true);
    assert.equal(isSafeUrl('mailto:a@b.com'), true);
    assert.equal(isSafeUrl('tel:+1234567'), true);
    assert.equal(isSafeUrl('sms:+1234'), true);
  });

  test('rejects javascript: in every form', () => {
    assert.equal(isSafeUrl('javascript:alert(1)'), false);
    assert.equal(isSafeUrl('JAVASCRIPT:alert(1)'), false); // URL parser lowercases
    assert.equal(isSafeUrl('javascript://%0aalert(1)'), false);
    assert.equal(isSafeUrl('javascript:/*\n*/alert(1)'), false);
  });

  test('rejects data:, file:, blob:, intent:, vbscript:', () => {
    assert.equal(isSafeUrl('data:text/html,<script>alert(1)</script>'), false);
    assert.equal(isSafeUrl('data:text/plain,hello'), false);
    assert.equal(isSafeUrl('file:///etc/passwd'), false);
    assert.equal(isSafeUrl('blob:https://x/abc'), false);
    assert.equal(isSafeUrl('intent://x#Intent;scheme=...;end'), false);
    assert.equal(isSafeUrl('vbscript:msgbox'), false);
  });

  test('rejects chrome:, chrome-extension:, about:, view-source:', () => {
    assert.equal(isSafeUrl('chrome://settings'), false);
    assert.equal(isSafeUrl('chrome-extension://abc/xss.html'), false);
    assert.equal(isSafeUrl('about:blank'), false);
    assert.equal(isSafeUrl('view-source:https://example.com'), false);
  });

  test('rejects ftp:, ws:, wss: (not in allowlist)', () => {
    assert.equal(isSafeUrl('ftp://example.com'), false);
    assert.equal(isSafeUrl('ws://example.com'), false);
    assert.equal(isSafeUrl('wss://example.com'), false);
  });

  test('rejects malformed / empty / non-string input', () => {
    assert.equal(isSafeUrl(''), false);
    assert.equal(isSafeUrl(null), false);
    assert.equal(isSafeUrl(undefined), false);
    assert.equal(isSafeUrl(0), false);
    assert.equal(isSafeUrl({}), false);
    assert.equal(isSafeUrl('not a url'), false);
    assert.equal(isSafeUrl('://no-scheme'), false);
  });

  test('rejects relative URLs (caller should resolve first)', () => {
    assert.equal(isSafeUrl('/path'), false);
    assert.equal(isSafeUrl('./path'), false);
    assert.equal(isSafeUrl('example.com'), false);
  });
});

describe('isHttpUrl — http(s) only', () => {
  test('accepts http: and https:', () => {
    assert.equal(isHttpUrl('https://x'), true);
    assert.equal(isHttpUrl('http://x'), true);
  });

  test('rejects everything else even if isSafeUrl would accept', () => {
    assert.equal(isHttpUrl('mailto:a@b'), false);
    assert.equal(isHttpUrl('tel:+1'), false);
    assert.equal(isHttpUrl('sms:+1'), false);
    assert.equal(isHttpUrl('javascript:alert(1)'), false);
    assert.equal(isHttpUrl(''), false);
    assert.equal(isHttpUrl(null), false);
  });
});
