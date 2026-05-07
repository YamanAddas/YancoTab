/**
 * Tests for settings/engine/privacyStats.js — verifiable claims only.
 *
 * Red-team-driven: every claim here must be statically verifiable.
 * Tests confirm we don't accidentally reintroduce the discredited
 * "0 tracking pixels last 30 days" or "E2E" claims.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { privacyStats, listEndpoints, ENDPOINTS } from '../os/apps/settings/engine/privacyStats.js';

describe('endpoints', () => {
  test('lists exactly 5 known endpoints', () => {
    assert.equal(ENDPOINTS.length, 5);
  });

  test('every entry has label, host, purpose', () => {
    for (const e of ENDPOINTS) {
      assert.equal(typeof e.label, 'string', `label for ${JSON.stringify(e)}`);
      assert.equal(typeof e.host, 'string', `host for ${JSON.stringify(e)}`);
      assert.equal(typeof e.purpose, 'string', `purpose for ${JSON.stringify(e)}`);
    }
  });

  test('listEndpoints returns a copy (mutation-safe)', () => {
    const a = listEndpoints();
    const b = listEndpoints();
    assert.notStrictEqual(a, b);
    assert.deepEqual(a, b);
  });
});

describe('privacyStats', () => {
  test('returns 4 stat rows', () => {
    const out = privacyStats();
    assert.equal(out.length, 4);
  });

  test('every row has value/label/sub', () => {
    for (const row of privacyStats()) {
      assert.equal(typeof row.value, 'string');
      assert.equal(typeof row.label, 'string');
      assert.equal(typeof row.sub, 'string');
    }
  });

  test('endpoint count matches actual list', () => {
    const out = privacyStats();
    const endpointRow = out.find((r) => r.label.toLowerCase().includes('endpoint'));
    assert.ok(endpointRow);
    assert.equal(endpointRow.value, String(ENDPOINTS.length));
  });

  test('does NOT make the discredited "tracking pixels" claim', () => {
    const json = JSON.stringify(privacyStats()).toLowerCase();
    assert.equal(json.includes('tracking pixel'), false,
      'tracking pixels stat is unverifiable; do not re-introduce it');
  });

  test('does NOT claim E2E by default', () => {
    const json = JSON.stringify(privacyStats()).toLowerCase();
    assert.equal(json.includes('e2e'), false,
      'Chrome Sync is not E2E by default — do not claim it');
    assert.equal(json.includes('end-to-end encrypted'), false);
  });

  test('"100%" claim refers to local data', () => {
    const out = privacyStats();
    const local = out.find((r) => r.value === '100%');
    assert.ok(local);
    assert.match(local.label.toLowerCase(), /notes|todo|file/);
  });

  test('"0" claim is verifiable static', () => {
    const out = privacyStats();
    const zero = out.find((r) => r.value === '0');
    assert.ok(zero);
    // "0 analytics in source" is verifiable; the prior "0 tracking pixels in last 30 days" was not.
    assert.match(zero.label.toLowerCase(), /analytics|telemetry/);
  });

  test('Chrome Sync row mentions in-transit + at-rest, optional passphrase', () => {
    const out = privacyStats();
    const sync = out.find((r) => /chrome sync/i.test(r.value));
    assert.ok(sync);
    assert.match(sync.label.toLowerCase(), /transit|rest/);
    assert.match(sync.sub.toLowerCase(), /passphrase/);
  });
});
