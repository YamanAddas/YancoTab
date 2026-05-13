/**
 * Smoke test — every v3 module must import cleanly via the Node ESM
 * resolver. The PRODUCTION bug case this catches: a relative import
 * path that's wrong by N "../"s (e.g. ../../../utils vs ../../../../
 * utils). `node --check` is syntax-only — it doesn't resolve imports,
 * so a path bug ships green. This test does resolve them.
 *
 * Run with: node --test tests/pdf-v3-modules-load.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\//, '');
const V3_DIR = `${ROOT}os/apps/pdf/v3`;

function listJsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...listJsFiles(full));
    else if (stat.isFile() && name.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('pdf v3 modules load', () => {
  const files = listJsFiles(V3_DIR);
  // Sanity: we should have found a meaningful number of files.
  test('discovers the v3 module tree', () => {
    assert.ok(files.length >= 18, `expected ≥18 v3 .js files, found ${files.length}`);
  });

  // Generate one test per file. A module-level failure (bad import
  // path, top-level throw, missing export) shows up as a failed test
  // with the offending file name in the title.
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    test(`imports ${rel}`, async () => {
      // Convert to file:// URL so Windows backslashes don't trip the
      // ESM loader.
      const fileUrl = pathToFileURL(file).href;
      // Will throw on:
      //   - Bad relative import path (ERR_MODULE_NOT_FOUND)
      //   - Syntax error
      //   - Top-level throw (browser-only modules using DOM at module
      //     scope would fail — by convention v3 modules don't.)
      const mod = await import(fileUrl);
      assert.ok(mod, `import of ${rel} returned nothing`);
    });
  }
});
