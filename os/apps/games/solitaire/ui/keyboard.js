// keyboard.js — Solitaire global key bindings. Extracted from SolitaireApp
// so the app shell stays comfortably under the 500-line cap.
//
// Keys are bound to the window (not the app root) so they fire even when
// focus is on a button elsewhere in the shell; we early-return on form
// fields, IME composition, and when the app root has been detached.

export function bindSolitaireKeys(app) {
  const onKey = (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.isComposing) return;
    if (!app.root?.isConnected) return;
    switch (e.key.toLowerCase()) {
      case 'n': app._confirmAndNewGame(); e.preventDefault(); break;
      case 'u': app._undo(); e.preventDefault(); break;
      case 'r': app._redo(); e.preventDefault(); break;
      case 'h': app._showHint(); e.preventDefault(); break;
      case 'a': app._autoFinish(); e.preventDefault(); break;
      case 'p': app._togglePause(); e.preventDefault(); break;
      case 'escape': if (app._paused) { app._resume(); e.preventDefault(); } break;
      case ' ': app._dispatch({ type: 'DRAW' }); e.preventDefault(); break;
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
