/**
 * keyboard.js — physical keyboard binding.
 *
 * Routes keys through ctx._dispatch() so per-mode handlers (date,
 * programmer) get the same routing as the on-screen keypad. A-F in
 * programmer + HEX bypass dispatch and call _progAppendHex directly
 * since 'hex' isn't an action the keypad emits.
 *
 * Returns the bound handler so the shell can detach it on destroy.
 * Skips when focus is in an INPUT or TEXTAREA so prompts/forms keep
 * their default behavior.
 */

export function bindKeyboard(rootEl, ctx) {
  const handler = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key;
    if (k >= '0' && k <= '9') { ctx._dispatch('num', k); e.preventDefault(); return; }
    if (ctx._mode === 'programmer' && ctx._programmerBase === 'hex'
        && /^[a-fA-F]$/.test(k)) {
      ctx._progAppendHex(k.toUpperCase());
      e.preventDefault();
      return;
    }
    if (k === '.') { ctx._dispatch('dot'); e.preventDefault(); }
    else if (k === '+' || k === '-' || k === '*' || k === '/') { ctx._dispatch('op', k); e.preventDefault(); }
    else if (k === 'Enter' || k === '=') { ctx._dispatch('eval'); e.preventDefault(); }
    else if (k === 'Escape') { ctx._dispatch('clear'); e.preventDefault(); }
    else if (k === 'Backspace') {
      if (ctx._mode === 'programmer') ctx._progBackspace();
      else ctx._backspace();
      e.preventDefault();
    }
    else if (k === '(') { ctx._dispatch('paren', '('); e.preventDefault(); }
    else if (k === ')') { ctx._dispatch('paren', ')'); e.preventDefault(); }
  };
  rootEl.addEventListener('keydown', handler);
  return handler;
}
