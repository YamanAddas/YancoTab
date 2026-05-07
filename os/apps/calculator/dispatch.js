/**
 * dispatch.js — keypad action routing.
 *
 * The shell turns each keypad button click into a (action, value)
 * pair via buildView's onclick handler. routeAction walks the pair
 * through these phases:
 *   1. Error recovery — if the display is in 'Error' state, any
 *      action other than 'clear' triggers a clear first.
 *   2. Per-mode shortcut — date and programmer modes intercept
 *      relevant actions and route to their own handlers.
 *   3. Standard handler table for non-intercepted actions.
 */

const HANDLERS = {
  num:     (ctx, v) => ctx.appendNumber(v),
  dot:     (ctx) => ctx.appendDot(),
  op:      (ctx, v) => ctx.setOperator(v),
  eval:    (ctx) => ctx.calculate(),
  clear:   (ctx) => ctx.clear(),
  negate:  (ctx) => ctx.negate(),
  percent: (ctx) => ctx.percent(),
  paren:   (ctx, v) => v === '(' ? ctx._openParen() : ctx._closeParen(),
  sci:     (ctx, v) => ctx.handleScientific(ctx._resolveSciFunc(v)),
  mem:     (ctx, v) => ctx.handleMemory(v),
};

export function routeAction(ctx, action, value) {
  if (ctx.state.current === 'Error' && action !== 'clear') ctx.clear();
  if (ctx._mode === 'programmer' && _routeProgrammerAction(ctx, action, value)) return;
  if (ctx._mode === 'date' && _routeDateAction(ctx, action, value)) return;
  HANDLERS[action]?.(ctx, value);
}

/**
 * Date mode is form-driven (date pickers + delta input + op pills),
 * so the keypad's role is limited: digits feed the delta input,
 * +/- toggle op direction, = evaluates. Anything else is a no-op
 * to avoid surprising the user.
 */
function _routeDateAction(ctx, action, value) {
  if (action === 'eval') { ctx._evalDateMode(); return true; }
  // Numeric input updates the delta input via the date.js helper
  if (action === 'num') {
    const cur = Number(ctx._refs.dateDeltaInput?.value || 0);
    const next = cur * 10 + Number(value);
    ctx._dateDelta = next;
    if (ctx._refs.dateDeltaInput) ctx._refs.dateDeltaInput.value = String(next);
    ctx._renderDateMode();
    return true;
  }
  if (action === 'op' && (value === '+' || value === '-')) {
    ctx._dateOp = value;
    ctx._renderDateMode();
    return true;
  }
  if (action === 'clear') {
    ctx._dateDelta = 0;
    if (ctx._refs.dateDeltaInput) ctx._refs.dateDeltaInput.value = '0';
    ctx._renderDateMode();
    return true;
  }
  // Other actions are no-ops in date mode
  return action === 'sci' || action === 'mem' || action === 'paren' || action === 'percent' || action === 'negate' || action === 'dot';
}

/**
 * Programmer mode reroutes most actions to BigInt-mode handlers.
 * Returns true if the action was consumed; false to fall through
 * to standard handling (e.g. when programmer mode chooses to defer
 * an unsupported action with a toast).
 */
function _routeProgrammerAction(ctx, action, value) {
  switch (action) {
    case 'num':     ctx._progAppendDigit(value); return true;
    case 'op':      ctx._progSetOp(value); return true;
    case 'eval':    ctx._progEval(); return true;
    case 'clear':   ctx._progClear(); return true;
    case 'negate':  ctx._progNegate(); return true;
    case 'percent': ctx._progSetOp('mod'); return true;
    case 'dot':
      // No decimals in programmer mode — silently consume.
      return true;
    case 'paren':
      // Parens grouping for programmer ops is out of scope for this PR.
      ctx.kernel.emit('toast', { message: 'Parens disabled in programmer mode', type: 'info' });
      return true;
    case 'sci':
      ctx.kernel.emit('toast', { message: 'Sci functions disabled in programmer mode', type: 'info' });
      return true;
    case 'mem':
      ctx.kernel.emit('toast', { message: 'Memory disabled in programmer mode', type: 'info' });
      return true;
    default:
      return false;
  }
}
