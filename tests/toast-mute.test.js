/**
 * toast-mute.test.js — Pomodoro auto-mute must silence chatter, never
 * alerts.
 * Run with: node --test tests/toast-mute.test.js
 *
 * `body.pomodoro-mute` is a GLOBAL suppression: it hides toasts from
 * every app, not just Pomodoro's, and autoMute defaults to ON. Before
 * v1.10.5 it hid all of them, so a break could swallow "Save failed",
 * "Storage full — could not save wallpaper" or "Blocked unsafe URL" —
 * the toast being the only evidence the user ever gets that the thing
 * they just did did not happen.
 *
 * The invariant now: error + warning always render; success + info are
 * suppressible. Both halves matter — an exemption that leaked to every
 * type would quietly delete the feature.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { isAlertToast, ALERT_TYPES, ALERT_CLASS } from '../os/ui/components/toastSeverity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('the severity split', () => {
  test('failures and refusals are alerts', () => {
    assert.equal(isAlertToast('error'), true);
    assert.equal(isAlertToast('warning'), true);
  });

  test('confirmations are routine — the mute must still work', () => {
    assert.equal(isAlertToast('success'), false);
    assert.equal(isAlertToast('info'), false);
  });

  test('unknown and malformed types default to routine', () => {
    // Toast.show() defaults type to 'info', so an unknown value is
    // chatter by construction. Defaulting the other way would let any
    // typo pierce the mute and hollow the feature out.
    for (const t of [undefined, null, '', 'ERROR', 'Error', 'danger', 0, {}, []]) {
      assert.equal(isAlertToast(t), false, `type ${JSON.stringify(t)} must not be an alert`);
    }
  });

  test('the alert set is exactly error + warning', () => {
    assert.deepEqual([...ALERT_TYPES].sort(), ['error', 'warning']);
  });
});

describe('Toast.js applies the marker', () => {
  const src = read('os/ui/components/Toast.js');

  test('the pill class is driven by the predicate, not a hardcoded type', () => {
    assert.match(src, /isAlertToast\(type\)/,
      'Toast.js must decide the alert class via isAlertToast()');
    assert.match(src, /ALERT_CLASS/,
      'Toast.js must use the shared class constant, not a literal');
  });

  test('errors keep their assertive announcement', () => {
    // Independent of the mute: role="alert" is what interrupts speech.
    assert.match(src, /type === 'error'[\s\S]{0,120}role:\s*'alert'/,
      'error toasts must still carry role="alert"');
  });
});

describe('the mute rule', () => {
  const css = read('css/pomodoro.css');
  const rule = css.match(/body\.pomodoro-mute[^{]*\{[^}]*display:\s*none[^}]*\}/);

  test('a mute rule exists and exempts alerts', () => {
    assert.ok(rule, 'no body.pomodoro-mute display:none rule found');
    assert.match(rule[0], new RegExp(`:not\\(\\.${ALERT_CLASS}\\)`),
      `the mute rule must exempt .${ALERT_CLASS}`);
  });

  test('it still hides the routine pill', () => {
    assert.match(rule[0], /\.toast-pill/,
      'the mute must still target .toast-pill or it does nothing');
  });

  test('it does NOT hide the container', () => {
    // The container is the parent of every pill and carries the
    // aria-live region. Hiding it would hide the exempt alerts too and
    // stop them being announced — the exact bug this suite exists for.
    const muteRules = [...css.matchAll(/body\.pomodoro-mute[^{]*\{[^}]*\}/g)].map((m) => m[0]);
    for (const r of muteRules) {
      if (!/display:\s*none/.test(r)) continue;
      assert.ok(!/\.toast-container/.test(r),
        `a mute rule hides .toast-container, which would hide exempt alerts too:\n${r}`);
    }
  });
});
