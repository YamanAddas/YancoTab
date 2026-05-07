/**
 * keyboard.js — physical keyboard binding.
 *
 * Returns the bound handler so the shell can detach it on destroy.
 * Skips when focus is in an INPUT or TEXTAREA so prompts/forms keep
 * their default behavior.
 */

export function bindKeyboard(rootEl, ctx) {
  const handler = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key;
    if (k >= '0' && k <= '9') { ctx.appendNumber(k); e.preventDefault(); return; }
    if (k === '.') { ctx.appendDot(); e.preventDefault(); }
    else if (k === '+' || k === '-' || k === '*' || k === '/') { ctx.setOperator(k); e.preventDefault(); }
    else if (k === 'Enter' || k === '=') { ctx.calculate(); e.preventDefault(); }
    else if (k === 'Escape') { ctx.clear(); e.preventDefault(); }
    else if (k === 'Backspace') { ctx._backspace(); e.preventDefault(); }
    else if (k === '(') { ctx._openParen(); e.preventDefault(); }
    else if (k === ')') { ctx._closeParen(); e.preventDefault(); }
  };
  rootEl.addEventListener('keydown', handler);
  return handler;
}
