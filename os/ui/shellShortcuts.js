/**
 * shellShortcuts.js — global keyboard shortcuts for the shell.
 *
 * Extracted from mobileShell.js, which is well over the project's file-size
 * cap. This is a self-contained chunk: one listener, one dispatch table,
 * no DOM ownership.
 *
 * | Shortcut       | Action                        | Context            |
 * |----------------|-------------------------------|--------------------|
 * | Escape         | close app → home / blur input | global             |
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

    // Escape — close current app and go home (always active)
    if (e.key === 'Escape') {
      if (shell.state.activePid) {
        kernel.processManager.closeProcess(shell.state.activePid);
        e.preventDefault();
      } else if (isInput) {
        e.target.blur();
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
