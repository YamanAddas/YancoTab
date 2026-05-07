/**
 * dispatch.js — keypad action routing.
 *
 * The shell turns each keypad button click into a (action, value)
 * pair via buildView's onclick handler. routeAction walks the pair
 * through three phases:
 *   1. Error recovery — if the display is in 'Error' state, any
 *      action other than 'clear' triggers a clear first.
 *   2. Per-mode shortcut — date mode reroutes +/− and = to date
 *      handlers without touching standard arithmetic state.
 *   3. Standard handler table.
 *
 * `ctx` is the CalculatorApp instance. Keeping the table here keeps
 * the shell short and makes new modes easy to wedge in (PR-3
 * programmer, PR-4 wider date support).
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
  if (ctx._mode === 'date' && _routeDateAction(ctx, action, value)) return;
  HANDLERS[action]?.(ctx, value);
}

function _routeDateAction(ctx, action, value) {
  if (action === 'op' && (value === '+' || value === '-')) {
    ctx._dateSign = value;
    ctx._dateDelta = Math.abs(Number(ctx.state.current)) || 0;
    ctx._renderDateMode();
    return true;
  }
  if (action === 'eval') {
    ctx._evalDateMode();
    return true;
  }
  return false;
}
