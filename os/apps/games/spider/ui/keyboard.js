// keyboard.js — Spider global key bindings. Mirrors the Solitaire module so
// the app shell stays under the 500-line cap. Space dispatches a DEAL (not a
// DRAW); there's no Auto-Finish in Spider (the engine auto-collects runs).

export function bindSpiderKeys(app) {
  const onKey = (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.isComposing) return;
    if (!app.root?.isConnected) return;
    switch (e.key.toLowerCase()) {
      case 'n': app._confirmAndNewGame(); e.preventDefault(); break;
      case 'u': app._undo(); e.preventDefault(); break;
      case 'r': app._redo(); e.preventDefault(); break;
      case 'h': app._showHint(); e.preventDefault(); break;
      case 'p': app._togglePause(); e.preventDefault(); break;
      case 'escape': if (app._paused) { app._resume(); e.preventDefault(); } break;
      case ' ': app._dispatch({ type: 'DEAL' }); e.preventDefault(); break;
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
