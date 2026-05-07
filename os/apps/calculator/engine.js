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
const RESERVED = new Set(['e', 'pi', 'rad', 'deg', 'in', 'today', 'd']);

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
 * Pairs (toggle):
 *   pow2  ↔ pow3
 *   sqrt  ↔ cbrt
 *   sin   ↔ asin
 *   cos   ↔ acos
 *   pi    ↔ e
 */
const SECOND_PAIRS = {
  pow2: 'pow3', pow3: 'pow2',
  sqrt: 'cbrt', cbrt: 'sqrt',
  sin:  'asin', asin: 'sin',
  cos:  'acos', acos: 'cos',
  pi:   'e',    e:    'pi',
};

export function secondOf(funcId) { return SECOND_PAIRS[funcId] || null; }

/**
 * Get the visible label for a sci function in the current 2nd-mode
 * state. The KEYPAD constant ships base-mode labels; this returns
 * the 2nd-mode override if the key has one and 2nd is active.
 */
const SECOND_LABELS = {
  pow3: 'x³',
  cbrt: '∛',
  asin: 'sin⁻¹',
  acos: 'cos⁻¹',
  e:    'e',
  // Base-mode labels for completeness:
  pow2: 'x²',
  sqrt: '√',
  sin:  'sin',
  cos:  'cos',
  pi:   'π',
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

/**
 * SCI_FNS keys are normalized function ids. When 2nd-mode is on,
 * the dispatcher maps the base id to its alt before looking up.
 */
export const SCI_FNS = {
  pow2: (v) => v * v,
  pow3: (v) => v * v * v,
  sqrt: (v) => Math.sqrt(v),
  cbrt: (v) => Math.cbrt(v),
  sin:  (v, ctx) => Math.sin(toRadians(v, ctx)),
  cos:  (v, ctx) => Math.cos(toRadians(v, ctx)),
  asin: (v, ctx) => fromRadians(Math.asin(v), ctx),
  acos: (v, ctx) => fromRadians(Math.acos(v), ctx),
  pi:   () => Math.PI,
  e:    () => Math.E,
};

function toRadians(v, ctx)   { return ctx?.angleMode === 'deg' ? (v * Math.PI) / 180 : v; }
function fromRadians(v, ctx) { return ctx?.angleMode === 'deg' ? (v * 180) / Math.PI : v; }

// ─── Operator helpers ───────────────────────────────────────────

export const OP_SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' };

export function fmtOp(op) { return OP_SYMBOLS[op] || op; }

/**
 * Pure binary op evaluator. Returns NaN on invalid (caller treats
 * NaN as Error).
 */
export function applyBinaryOp(op, a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? NaN : a / b;
    default:  return NaN;
  }
}
