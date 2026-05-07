/**
 * engine.js — Calculator pure helpers.
 *
 * No DOM. Side-effect-free (except where noted). Tested in
 * tests/calculator-engine.test.js.
 */

// ─── Number formatting ──────────────────────────────────────────

export function normalizeNumber(value) {
  if (!Number.isFinite(value)) return 'Error';
  const safe = Math.abs(value) < 1e-12 ? 0 : value;
  if (Math.abs(safe) >= 1e12 || (Math.abs(safe) > 0 && Math.abs(safe) < 1e-9)) {
    return Number(safe).toExponential(8).replace(/\+/, '');
  }
  return String(Number.parseFloat(Number(safe).toFixed(12)));
}

// ─── Base conversion (Programmer mode) ──────────────────────────

const BASE_RADIX = { dec: 10, hex: 16, oct: 8, bin: 2 };

/**
 * Convert a normalized decimal numeric string into a representation
 * in the given base. Non-integer or negative values are returned as
 * the original decimal string (HEX/OCT/BIN are integer-only).
 */
export function toBase(decimalStr, base) {
  if (base === 'dec') return decimalStr;
  if (decimalStr === 'Error') return '—';
  const num = Number(decimalStr);
  if (!Number.isFinite(num)) return '—';
  if (!Number.isInteger(num) || num < 0) return '—';
  const radix = BASE_RADIX[base];
  if (!radix) return decimalStr;
  return num.toString(radix).toUpperCase();
}

/**
 * Format a value for display in the given base. Always returns a
 * string. Used to populate the multi-base panel rows.
 */
export function formatBaseRows(decimalStr) {
  return {
    dec: toBase(decimalStr, 'dec'),
    hex: toBase(decimalStr, 'hex'),
    oct: toBase(decimalStr, 'oct'),
    bin: toBase(decimalStr, 'bin'),
  };
}

// ─── Variables ──────────────────────────────────────────────────

const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,15}$/;

export function isValidVarName(name) {
  return typeof name === 'string' && VAR_NAME_RE.test(name);
}

/** Reserved identifiers that conflict with built-ins. */
const RESERVED = new Set([
  'e', 'pi', 'rad', 'deg', 'in', 'today', 'd',
  // Scientific function names — adding a var with these names
  // would shadow the function, so block them at definition time.
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'ln', 'log', 'exp', 'fact', 'abs', 'inv', 'rand',
  'mod', 'and', 'or', 'xor', 'not', 'lsh', 'rsh',
]);

export function isReservedVarName(name) {
  return RESERVED.has(String(name).toLowerCase());
}

/**
 * Sanitize a vars dictionary loaded from storage. Drops any entry
 * with an invalid name or non-finite value.
 */
export function sanitizeVars(vars) {
  if (!vars || typeof vars !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(vars)) {
    if (!isValidVarName(k) || isReservedVarName(k)) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[k] = n;
  }
  return out;
}

// ─── Date math (Date mode) ──────────────────────────────────────

const DAY_MS = 86_400_000;

/** Truncate a Date to the start of its UTC day. */
function startOfUtcDay(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * today + days (or - days) → Date.
 * @returns {{ ts: number, label: string }}
 */
export function addDaysToToday(days, today = new Date()) {
  const t = startOfUtcDay(today);
  const ts = t + Math.trunc(days) * DAY_MS;
  return { ts, label: formatDateLabel(new Date(ts)) };
}

/**
 * Format a date as "04 Aug 2026" — short, deterministic, no locale.
 */
export function formatDateLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = months[date.getUTCMonth()];
  const yy = date.getUTCFullYear();
  return `${dd} ${mm} ${yy}`;
}

// ─── History grouping ───────────────────────────────────────────

/**
 * Group tape entries by day (UTC). Returns an array of
 * { dayLabel, dayKey, entries[] } in newest-first order.
 *
 * dayLabel: "Today", "Yesterday", or "dd Mon yyyy"
 */
export function groupTapeByDay(tape, now = Date.now()) {
  if (!Array.isArray(tape) || tape.length === 0) return [];
  const today = startOfUtcDay(new Date(now));
  const yesterday = today - DAY_MS;
  const groups = new Map();
  // Walk chronologically so each group's entries end up newest-first
  // when we reverse below.
  for (const t of tape) {
    if (!t || typeof t !== 'object') continue;
    const ts = Number(t.ts) || 0;
    const dayKey = ts > 0 ? startOfUtcDay(new Date(ts)) : 0;
    if (!groups.has(dayKey)) groups.set(dayKey, []);
    groups.get(dayKey).push(t);
  }
  const result = [];
  // Sort day keys descending (newest day first)
  const days = Array.from(groups.keys()).sort((a, b) => b - a);
  for (const dayKey of days) {
    let dayLabel;
    if (dayKey === 0)              dayLabel = 'Earlier';
    else if (dayKey === today)     dayLabel = 'Today';
    else if (dayKey === yesterday) dayLabel = 'Yesterday';
    else                           dayLabel = formatDateLabel(new Date(dayKey));
    // Newest entry first within the day
    const entries = groups.get(dayKey).slice().reverse();
    result.push({ dayKey, dayLabel, entries });
  }
  return result;
}

// ─── Scientific 2nd-mode key remapping ──────────────────────────

/**
 * Map a sci function id to its 2nd-mode alternate, or null if none.
 *
 * Pairs cover both base-keypad sci keys and sci-panel keys. The
 * 2nd-mode toggle relabels both surfaces in sync.
 */
const SECOND_PAIRS = {
  // Base keypad
  pow2: 'pow3',  pow3:  'pow2',
  sqrt: 'cbrt',  cbrt:  'sqrt',
  sin:  'asin',  asin:  'sin',
  cos:  'acos',  acos:  'cos',
  pi:   'e',     e:     'pi',
  // Sci panel — only inverse trig/hyperbolic since ln/log/exp/tenx
  // are all directly visible on the panel and don't need a 2nd swap
  tan:  'atan',  atan:  'tan',
  sinh: 'asinh', asinh: 'sinh',
  cosh: 'acosh', acosh: 'cosh',
  tanh: 'atanh', atanh: 'tanh',
};

export function secondOf(funcId) { return SECOND_PAIRS[funcId] || null; }

/**
 * Visible label for a sci function in either base or 2nd-mode state.
 * The KEYPAD / SCI_PANEL constants ship the base label; this looks
 * up the 2nd-mode override if 2nd is active.
 */
const SECOND_LABELS = {
  // Base-mode
  pow2: 'x²', sqrt: '√',
  sin:  'sin', cos: 'cos', tan: 'tan',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  ln:   'ln', log: 'log',
  pi:   'π', e: 'e',
  // 2nd-mode
  pow3: 'x³', cbrt: '∛',
  asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹',
  asinh:'sinh⁻¹', acosh:'cosh⁻¹', atanh:'tanh⁻¹',
  exp:  'eˣ', tenx: '10ˣ',
};

export function labelFor(funcId, secondMode) {
  if (!secondMode) return SECOND_LABELS[funcId] || funcId;
  const alt = secondOf(funcId);
  return SECOND_LABELS[alt] || alt || funcId;
}

export function actionFor(funcId, secondMode) {
  if (!secondMode) return funcId;
  return secondOf(funcId) || funcId;
}

// ─── Scientific function table ──────────────────────────────────

/** Factorial with strict integer + range cap. Caller treats NaN as Error. */
export function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/**
 * SCI_FNS keys are normalized function ids. When 2nd-mode is on,
 * the dispatcher maps the base id to its alt via secondOf() before
 * lookup. Constants (pi, e) ignore the operand argument.
 *
 * Trig / hyperbolic ops respect ctx.angleMode ('rad' | 'deg').
 * Rand uses ctx.rng (defaults to Math.random) so tests can pin it.
 */
export const SCI_FNS = {
  // Powers / roots
  pow2: (v) => v * v,
  pow3: (v) => v * v * v,
  sqrt: (v) => Math.sqrt(v),
  cbrt: (v) => Math.cbrt(v),
  // Trig
  sin:  (v, ctx) => Math.sin(toRadians(v, ctx)),
  cos:  (v, ctx) => Math.cos(toRadians(v, ctx)),
  tan:  (v, ctx) => Math.tan(toRadians(v, ctx)),
  asin: (v, ctx) => fromRadians(Math.asin(v), ctx),
  acos: (v, ctx) => fromRadians(Math.acos(v), ctx),
  atan: (v, ctx) => fromRadians(Math.atan(v), ctx),
  // Hyperbolic
  sinh:  (v) => Math.sinh(v),
  cosh:  (v) => Math.cosh(v),
  tanh:  (v) => Math.tanh(v),
  asinh: (v) => Math.asinh(v),
  acosh: (v) => Math.acosh(v),
  atanh: (v) => Math.atanh(v),
  // Logs / exponentials
  ln:   (v) => Math.log(v),
  log:  (v) => Math.log10(v),
  exp:  (v) => Math.exp(v),
  tenx: (v) => Math.pow(10, v),
  // Other unary
  fact: (v) => factorial(v),
  inv:  (v) => v === 0 ? NaN : 1 / v,
  abs:  (v) => Math.abs(v),
  // Constants
  pi:   () => Math.PI,
  e:    () => Math.E,
  // Rand: 0 ≤ r < 1, deterministic via ctx.rng for tests
  rand: (_v, ctx) => (ctx?.rng || Math.random)(),
};

/**
 * Function ids that ignore their operand (constants + Rand).
 * Caller uses this to skip the "needs current value" check.
 */
export const NULLARY_SCI = new Set(['pi', 'e', 'rand']);

function toRadians(v, ctx)   { return ctx?.angleMode === 'deg' ? (v * Math.PI) / 180 : v; }
function fromRadians(v, ctx) { return ctx?.angleMode === 'deg' ? (v * 180) / Math.PI : v; }

// ─── Operator helpers ───────────────────────────────────────────

export const OP_SYMBOLS = {
  '+': '+', '-': '−', '*': '×', '/': '÷',
  '^': '^', yroot: 'ʸ√', mod: 'mod',
  and: 'AND', or: 'OR', xor: 'XOR',
  lsh: '≪', rsh: '≫',
};

export function fmtOp(op) { return OP_SYMBOLS[op] || op; }

/**
 * Pure binary op evaluator over Number. Returns NaN on invalid
 * (caller treats NaN as Error).
 *
 * `^` is power, `yroot` is the y-th root (a^(1/b)), `mod` is the
 * mathematical (Knuth) modulo so it returns sign-of-divisor for
 * negative operands.
 *
 * Bitwise ops (and/or/xor/lsh/rsh) are NOT handled here — those
 * route through applyBigIntOp() in programmer mode where word-size
 * masking matters.
 */
export function applyBinaryOp(op, a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  switch (op) {
    case '+':     return a + b;
    case '-':     return a - b;
    case '*':     return a * b;
    case '/':     return b === 0 ? NaN : a / b;
    case '^':     return Math.pow(a, b);
    case 'yroot': return b === 0 ? NaN : Math.pow(a, 1 / b);
    case 'mod':   return b === 0 ? NaN : a - Math.floor(a / b) * b;
    default:      return NaN;
  }
}

// ─── Programmer mode (BigInt) ───────────────────────────────────

/**
 * Maximum length of a programmerValue string we'll accept from
 * storage. 64 hex chars = 256 bits, comfortably above the 64-bit
 * cap. Decimal can be longer; pick a uniform string-length limit
 * to bound BigInt parse cost.
 */
export const MAX_PROGRAMMER_LENGTH = 80;

const VALID_BIT_WIDTHS = new Set([8, 16, 32, 64]);

export function isValidBitWidth(w) { return VALID_BIT_WIDTHS.has(w); }

/**
 * Mask a BigInt to the given word width as an UNSIGNED value. The
 * shell uses this after every bitwise op so HEX/OCT/BIN display
 * stays unsigned (two's-complement bit pattern).
 */
export function maskUnsigned(bigValue, width) {
  if (!isValidBitWidth(width)) return bigValue;
  return BigInt.asUintN(width, bigValue);
}

/**
 * Pure BigInt op evaluator. All ops result in an unsigned value of
 * the given width. Returns null on invalid input.
 *
 * @param {'and'|'or'|'xor'|'lsh'|'rsh'|'mod'|'+'|'-'|'*'|'/'} op
 * @param {bigint} a
 * @param {bigint} b
 * @param {number} width  8 | 16 | 32 | 64
 * @returns {bigint|null}
 */
export function applyBigIntOp(op, a, b, width) {
  if (typeof a !== 'bigint' || typeof b !== 'bigint') return null;
  if (!isValidBitWidth(width)) return null;
  let r;
  switch (op) {
    case 'and': r = a & b; break;
    case 'or':  r = a | b; break;
    case 'xor': r = a ^ b; break;
    case 'lsh': r = a << b; break;
    case 'rsh': r = a >> b; break;
    case 'mod': if (b === 0n) return null; r = a % b; break;
    case '+':   r = a + b; break;
    case '-':   r = a - b; break;
    case '*':   r = a * b; break;
    case '/':   if (b === 0n) return null; r = a / b; break;
    default:    return null;
  }
  return maskUnsigned(r, width);
}

/**
 * NOT for programmer mode — bitwise complement masked to width.
 */
export function applyBigIntNot(a, width) {
  if (typeof a !== 'bigint' || !isValidBitWidth(width)) return null;
  return maskUnsigned(~a, width);
}

/**
 * Parse a string in the given base into a BigInt. Returns null on
 * invalid input. Strips spaces and a leading `+`/`-` for DEC. The
 * parser is bounded by MAX_PROGRAMMER_LENGTH so an attacker-supplied
 * 1MB hex string can't hang us via O(n²) BigInt parse.
 */
export function parseBigIntInBase(str, base) {
  if (typeof str !== 'string') return null;
  const cleaned = str.replace(/\s+/g, '');
  if (cleaned.length === 0 || cleaned.length > MAX_PROGRAMMER_LENGTH) return null;
  try {
    switch (base) {
      case 'dec': {
        if (!/^-?\d+$/.test(cleaned)) return null;
        return BigInt(cleaned);
      }
      case 'hex': {
        const m = cleaned.replace(/^0x/i, '');
        if (!/^[0-9A-Fa-f]+$/.test(m)) return null;
        return BigInt('0x' + m);
      }
      case 'oct': {
        const m = cleaned.replace(/^0o/i, '');
        if (!/^[0-7]+$/.test(m)) return null;
        return BigInt('0o' + m);
      }
      case 'bin': {
        const m = cleaned.replace(/^0b/i, '');
        if (!/^[01]+$/.test(m)) return null;
        return BigInt('0b' + m);
      }
      default: return null;
    }
  } catch {
    return null;
  }
}

/**
 * Format a BigInt in the given base (uppercase for hex).
 *
 * Programmer mode stores values as the unsigned bit pattern (0 to
 * 2^width − 1). Display contract:
 *   • HEX / OCT / BIN — raw bit pattern via .toString(radix)
 *   • DEC             — signed two's-complement interpretation via
 *                       BigInt.asIntN(width). So 0xFF at 8-bit
 *                       displays as '-1' in DEC, matching the
 *                       convention in Windows Calc and DevToys.
 *
 * If width is omitted/invalid, DEC falls back to the raw .toString.
 */
export function formatBigIntInBase(bigValue, base, width) {
  if (typeof bigValue !== 'bigint') return '—';
  if (base === 'dec') {
    if (isValidBitWidth(width)) return BigInt.asIntN(width, bigValue).toString(10);
    return bigValue.toString(10);
  }
  if (!isValidBitWidth(width)) return '—';
  const masked = maskUnsigned(bigValue, width);
  switch (base) {
    case 'hex': return masked.toString(16).toUpperCase();
    case 'oct': return masked.toString(8);
    case 'bin': return masked.toString(2);
    default:    return '—';
  }
}

/**
 * Sanitize a programmerValue string read from storage. Caps length
 * and rejects anything that won't parse as a decimal BigInt.
 */
export function sanitizeProgrammerValue(str) {
  if (typeof str !== 'string') return '0';
  const trimmed = str.slice(0, MAX_PROGRAMMER_LENGTH);
  const parsed = parseBigIntInBase(trimmed, 'dec');
  if (parsed == null) return '0';
  return parsed.toString(10);
}
