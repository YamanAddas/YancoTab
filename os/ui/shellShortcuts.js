/**
 * shellShortcuts.js — global keyboard shortcuts for the shell.
 *
 * Extracted from mobileShell.js, which is well over the project's file-size
 * cap. This is a self-contained chunk: one listener, one dispatch table,
 * no DOM ownership.
 *
 * | Shortcut       | Action                        | Context            |
 * |----------------|-------------------------------|--------------------|
 * | Escape         | blur field → close window     | global (2-stage)   |
 * | Ctrl+Enter     | quick-capture to Notes        | in the search box  |
 * | Ctrl+Shift+F   | toggle Focus Mode             | global             |
 * | Ctrl+K         | focus SmartSearch             | global             |
 * | Ctrl+,         | open Settings                 | global             |
 * | Ctrl+N         | new note                      | Notes is active    |
 *
 * Note on Focus Mode: while the overlay is up, FocusMode installs its own
 * CAPTURE-phase handler that owns Escape / Space / arrows and stops
 * propagation, so those never reach this bubble-phase listener. The
 * Ctrl+Shift+F branch here is effectively open-only.
 *
 */

/**
 * What should the shell's Escape do?
 *
 * The shell's Escape is a FALLBACK. It closes the focused window only
 * when nothing more specific has claimed the key:
 *
 *   'ignore' — an app handler already called preventDefault (Notes'
 *              find bar, Calculator's clear, Files' clear-selection,
 *              every popover and context menu). Before v1.10.6 the
 *              shell closed the window on top of whatever the app did,
 *              so dismissing the find bar also threw the note away.
 *              MailApp had already worked around this locally by
 *              calling stopPropagation — this generalizes its rule.
 *   'blur'   — focus is in a text field. The key that dismisses a typo
 *              must not also be the key that tears the window down, so
 *              the first Escape leaves the field and a second one
 *              closes. Focus Mode has used this two-stage rule since
 *              v1.3.0; this makes the shell agree with it.
 *   'close'  — nothing else wanted it and a window is focused.
 *   'none'   — nothing to do (home screen, no field focused).
 *
 * @param {{defaultPrevented: boolean, isInput: boolean, hasWindow: boolean}} ctx
 * @returns {'ignore'|'blur'|'close'|'none'}
 */
export function escapeAction({ defaultPrevented, isInput, hasWindow }) {
  if (defaultPrevented) return 'ignore';
  if (isInput) return 'blur';
  return hasWindow ? 'close' : 'none';
}

/**
 * Bind the global shortcut listener (see the table at the top of this file).
 *
 * @param {object} shell  MobileShell instance (needs .state and .components)
 * @param {object} kernel
 * @returns {() => void} unsubscribe
 */
export function bindShellShortcuts(shell, kernel) {
  const onKeyDown = (e) => {
    // Ignore during IME composition
    if (e.isComposing) return;

    const isInput = e.target?.tagName === 'INPUT'
      || e.target?.tagName === 'TEXTAREA'
      || e.target?.isContentEditable;
    const ctrl = e.ctrlKey || e.metaKey;

    // Escape — the shell's fallback close. See escapeAction() above for
    // why it defers to app handlers and to focused text fields.
    if (e.key === 'Escape') {
      const action = escapeAction({
        defaultPrevented: e.defaultPrevented,
        isInput,
        hasWindow: Boolean(shell.state.activePid),
      });
      if (action === 'blur') e.target.blur();
      else if (action === 'close') {
        kernel.processManager.closeProcess(shell.state.activePid);
        e.preventDefault();
      }
      return;
    }

    // Ctrl+Enter inside the search input — quick-capture as a note via the
    // existing `! prefix` path. Stays inside the isInput branch since the
    // user is actively typing in the search box.
    if (isInput && ctrl && e.key === 'Enter') {
      const searchInput = shell.components.search.input;
      if (e.target === searchInput && searchInput.value.trim()) {
        e.preventDefault();
        // Prepend '!' to trigger SmartSearch's quick-capture branch, then
        // simulate an Enter keypress on the search input
        if (!searchInput.value.startsWith('!')) {
          searchInput.value = '! ' + searchInput.value;
        }
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return;
      }
    }

    // Don't override shortcuts when typing in inputs (except Escape and
    // the Ctrl+Enter quick-capture above)
    if (isInput) return;

    // Ctrl+Shift+F — toggle Focus Mode. Shift is required because plain
    // Ctrl+F is the browser's find bar, which we must not shadow.
    if (ctrl && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      shell.components.focusMode.toggle();
      return;
    }

    // Ctrl+K / Cmd+K — focus SmartSearch
    if (ctrl && e.key === 'k') {
      e.preventDefault();
      shell.components.search.input?.focus();
      return;
    }

    // Ctrl+, — open Settings
    if (ctrl && e.key === ',') {
      e.preventDefault();
      kernel.emit('app:open', 'settings');
      return;
    }

    // Ctrl+N — new note (when Notes app is the active window)
    if (ctrl && e.key === 'n') {
      const info = kernel.processManager.getProcessInfo(shell.state.activePid);
      if (info?.name === 'notes') {
        const inst = kernel.processManager.getInstance(shell.state.activePid);
        const fn = inst?._createNote || inst?._createDocument;
        if (typeof fn === 'function') {
          e.preventDefault();
          fn.call(inst);
        }
      }
      return;
    }
  };

  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
