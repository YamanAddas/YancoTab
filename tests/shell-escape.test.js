/**
 * shell-escape.test.js — the shell's Escape is a fallback, not a
 * pre-emption.
 * Run with: node --test tests/shell-escape.test.js
 *
 * Before v1.10.6 the shell closed the focused window on ANY Escape,
 * ahead of both the app and the focused text field. Two live
 * consequences, both reproduced in the browser before the fix:
 *
 *   • Calculator's own handler clears the display on Escape and calls
 *     preventDefault — the shell then closed the window on top of it,
 *     so the clear was never visible. Same shape for Notes' find bar
 *     (dismissing the bar threw the note's window away), Files'
 *     clear-selection, and every popover/context menu.
 *   • Typing in Notes' search field and pressing Escape out of habit
 *     closed the whole window.
 *
 * MailApp had already worked around this locally by calling
 * stopPropagation only when it had something to cancel; escapeAction
 * generalizes that rule for every app.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { escapeAction } from '../os/ui/shellShortcuts.js';

const act = (o) => escapeAction({
  defaultPrevented: false, isInput: false, hasWindow: false, ...o,
});

describe('an app that handled Escape wins', () => {
  test('preventDefault means the shell keeps its hands off', () => {
    assert.equal(act({ defaultPrevented: true, hasWindow: true }), 'ignore');
  });

  test('it wins even with a field focused', () => {
    // A find-bar input dismissing itself must not also lose its field.
    assert.equal(act({ defaultPrevented: true, isInput: true, hasWindow: true }), 'ignore');
  });

  test('it wins on the home screen too', () => {
    assert.equal(act({ defaultPrevented: true }), 'ignore');
  });
});

describe('a focused text field blurs first', () => {
  test('Escape in a field with a window open blurs, it does not close', () => {
    // The regression this suite exists for.
    assert.equal(act({ isInput: true, hasWindow: true }), 'blur');
  });

  test('a second Escape — field now blurred — closes the window', () => {
    assert.equal(act({ isInput: false, hasWindow: true }), 'close');
  });

  test('Escape in the home search bar blurs and closes nothing', () => {
    assert.equal(act({ isInput: true, hasWindow: false }), 'blur');
  });
});

describe('the plain fallback', () => {
  test('closes the focused window when nothing else claimed the key', () => {
    assert.equal(act({ hasWindow: true }), 'close');
  });

  test('does nothing on a bare home screen', () => {
    assert.equal(act({}), 'none');
  });

  test('never closes when no window is focused', () => {
    // shell.state.activePid is null when every window is minimized, so
    // Escape must not reach into the tray and kill a hidden window.
    for (const isInput of [true, false]) {
      assert.notEqual(act({ isInput, hasWindow: false }), 'close');
    }
  });
});

describe('the wiring uses the predicate', () => {
  test('bindShellShortcuts routes Escape through escapeAction', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(
      new URL('../os/ui/shellShortcuts.js', import.meta.url), 'utf8'));
    assert.match(src, /escapeAction\(\{[\s\S]{0,200}defaultPrevented:\s*e\.defaultPrevented/,
      'the Escape branch must consult escapeAction with the real event state');
    assert.doesNotMatch(src, /if \(e\.key === 'Escape'\)[\s\S]{0,200}closeProcess[\s\S]{0,80}else if \(isInput\)/,
      'the old close-before-blur ordering must not come back');
  });
});
