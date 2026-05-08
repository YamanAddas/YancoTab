/**
 * Regression test for REGISTRY duplicate-key detection.
 *
 * JavaScript object literals silently allow duplicate keys — the second
 * declaration shadows the first, no error, no warning. AppStorage's
 * REGISTRY is a 700-line literal with 70+ entries, and we shipped
 * v1.1.0 with `yancotab_starfield_enabled` declared twice (lines 194 +
 * 250) for who knows how long. Both entries had identical shape so it
 * was harmless — but a future regression where the duplicates differ
 * (different default, different validator) would silently use whichever
 * came last and corrupt user data.
 *
 * This test parses the source file (not the imported object — by then
 * the duplicate is already gone) and asserts every `yancotab_*` key
 * appears exactly once.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = resolve(__dirname, '../os/services/appStorage.js');

describe('AppStorage REGISTRY — source-level integrity', () => {
  test('every top-level yancotab_* key is declared exactly once', () => {
    const src = readFileSync(SRC, 'utf8');
    // Match top-level REGISTRY entries: 4 spaces of indent, identifier, ': {'.
    // The 4-space indent excludes nested object keys (those have ≥8 spaces).
    const re = /^ {4}(yancotab[A-Za-z0-9_]*): \{$/gm;
    const counts = new Map();
    let m;
    while ((m = re.exec(src)) !== null) {
      counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    }
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1);
    assert.deepEqual(
      duplicates,
      [],
      `Duplicate REGISTRY keys found:\n${duplicates.map(([k, n]) => `  ${k} declared ${n}×`).join('\n')}`
    );
    // Sanity floor — make sure the regex actually matched something.
    assert.ok(counts.size > 30, `Regex captured only ${counts.size} keys; check the pattern`);
  });
});
