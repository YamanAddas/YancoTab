/**
 * pdf/engine/inlineCalc.js — evaluate a numeric expression copied
 * out of a PDF page.
 *
 * The Codex info panel shows an inline calc card when the user's
 * selection looks like a math expression. We deliberately don't use
 * `eval` or `Function` — the input is untrusted PDF text.
 *
 * Supports: integers, decimals, + - * / ( ), unary minus, and
 * percentage suffix (e.g. `10%` → 0.1). Whitespace is ignored.
 *
 * Implementation: a tiny shunting-yard converter to RPN, then a
 * stack evaluator. Returns:
 *   { ok: true,  value: number, expr: string }
 *   { ok: false, reason: string, expr: string }
 *
 * Pure module — no DOM, no kernel.
 */

const NUMERIC_HINT = /[\d.]/;

/**
 * looksNumeric(s) → boolean. Quick gate: contains a digit and only
 * uses characters in our supported set. Used to decide whether to
 * even attempt evaluation.
 */
export function looksNumeric(s) {
  if (typeof s !== 'string' || !s) return false;
  if (!NUMERIC_HINT.test(s)) return false;
  // Allowed chars: digits, . , + - * / x ÷ ( ) % and whitespace
  return /^[\d\s+\-*/x×÷().,%]+$/.test(s) && /\d/.test(s);
}

/**
 * evaluate(expr) → result object. See module header.
 */
export function evaluate(expr) {
  const original = String(expr || '');
  const cleaned = original
    .replace(/[×x]/g, '*')
    .replace(/÷/g, '/')
    .replace(/,/g, '');

  if (!looksNumeric(cleaned)) {
    return { ok: false, reason: 'Not a numeric expression', expr: original };
  }

  let tokens;
  try { tokens = tokenize(cleaned); }
  catch (e) { return { ok: false, reason: e.message, expr: original }; }

  let rpn;
  try { rpn = toRPN(tokens); }
  catch (e) { return { ok: false, reason: e.message, expr: original }; }

  let value;
  try { value = evalRPN(rpn); }
  catch (e) { return { ok: false, reason: e.message, expr: original }; }

  if (!Number.isFinite(value)) {
    return { ok: false, reason: 'Result is not finite', expr: original };
  }
  return { ok: true, value, expr: original };
}

/** Format the result with a sane number of decimals and locale grouping. */
export function format(value) {
  if (!Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return value.toLocaleString();
  // 4 sig figs after the decimal max, but trim trailing zeros.
  const s = value.toFixed(4).replace(/\.?0+$/, '');
  // Add grouping to the integer part.
  const [intPart, dec] = s.split('.');
  const intGrouped = Number(intPart).toLocaleString();
  return dec ? `${intGrouped}.${dec}` : intGrouped;
}

// ── tokenizer ──────────────────────────────────────────────

const OPS = new Set(['+', '-', '*', '/']);

function tokenize(s) {
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue; }
    if (ch === '(' || ch === ')') { tokens.push(ch); i++; continue; }
    if (OPS.has(ch)) { tokens.push(ch); i++; continue; }
    if (ch === '%') { tokens.push('%'); i++; continue; }
    if (ch === '.' || (ch >= '0' && ch <= '9')) {
      let num = '';
      let dotSeen = false;
      while (i < s.length && (s[i] === '.' || (s[i] >= '0' && s[i] <= '9'))) {
        if (s[i] === '.') {
          if (dotSeen) throw new Error('Bad number');
          dotSeen = true;
        }
        num += s[i++];
      }
      if (num === '.' || num === '') throw new Error('Bad number');
      tokens.push(parseFloat(num));
      continue;
    }
    throw new Error(`Unexpected '${ch}'`);
  }
  return tokens;
}

// ── shunting-yard ──────────────────────────────────────────

const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, 'u-': 3 };

function toRPN(tokens) {
  const out = [];
  const ops = [];
  let prev = null; // last emitted token type: 'num' | 'op' | '(' | ')' | null
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (typeof t === 'number') {
      out.push(t); prev = 'num'; continue;
    }
    if (t === '%') {
      // Postfix: pop the last value and divide by 100.
      if (prev !== 'num' && prev !== ')') throw new Error('Misplaced %');
      out.push('%'); continue;
    }
    if (t === '(') { ops.push(t); prev = '('; continue; }
    if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop());
      if (!ops.length) throw new Error('Unbalanced )');
      ops.pop();
      prev = ')';
      continue;
    }
    if (OPS.has(t)) {
      // Disambiguate unary minus / plus.
      const isUnary = (t === '-' || t === '+') && (prev === null || prev === 'op' || prev === '(');
      const op = isUnary ? (t === '-' ? 'u-' : 'u+') : t;
      // Unary plus is a no-op in evaluation; we still emit a sentinel.
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top === '(') break;
        if ((PREC[top] || 0) >= (PREC[op] || 0)) out.push(ops.pop());
        else break;
      }
      ops.push(op);
      prev = 'op';
      continue;
    }
    throw new Error(`Bad token: ${t}`);
  }
  while (ops.length) {
    const op = ops.pop();
    if (op === '(') throw new Error('Unbalanced (');
    out.push(op);
  }
  return out;
}

function evalRPN(rpn) {
  const stack = [];
  for (const t of rpn) {
    if (typeof t === 'number') { stack.push(t); continue; }
    if (t === '%') {
      if (!stack.length) throw new Error('Stack underflow');
      stack.push(stack.pop() / 100);
      continue;
    }
    if (t === 'u-') {
      if (!stack.length) throw new Error('Stack underflow');
      stack.push(-stack.pop());
      continue;
    }
    if (t === 'u+') continue;
    if (OPS.has(t)) {
      if (stack.length < 2) throw new Error('Stack underflow');
      const b = stack.pop();
      const a = stack.pop();
      let r;
      switch (t) {
        case '+': r = a + b; break;
        case '-': r = a - b; break;
        case '*': r = a * b; break;
        case '/':
          if (b === 0) throw new Error('Divide by zero');
          r = a / b;
          break;
      }
      stack.push(r);
      continue;
    }
    throw new Error(`Bad RPN token: ${t}`);
  }
  if (stack.length !== 1) throw new Error('Bad expression');
  return stack[0];
}
