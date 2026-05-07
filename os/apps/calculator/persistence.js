/**
 * persistence.js — Calculator storage I/O.
 *
 * Loads from canonical v4 key, walking the migration chain v4 → v3 →
 * v2 → v1 on first read. Writes always target v4.
 *
 * v4 envelope (additive over v3):
 *   { angleMode, tape, vars, mode, secondMode, programmerBase,
 *     bitWidth, programmerValue,
 *     dateFrom, dateTo, dateDelta, dateDeltaUnit, dateOp }
 */
import { sanitizeVars, sanitizeProgrammerValue, isValidBitWidth } from './engine.js';

export const STORAGE_KEY    = 'yancotab_calculator_v4';
export const LEGACY_KEY_V3  = 'yancotab_calculator_v3';
export const LEGACY_KEY_V2  = 'yancotab_calculator_v2';
export const LEGACY_KEY_V1  = 'yancotab_calculator';
export const MAX_TAPE = 50;

const VALID_MODES = ['standard', 'scientific', 'programmer', 'date'];
const VALID_BASES = ['dec', 'hex', 'oct', 'bin'];
const VALID_DELTA_UNITS = ['d', 'w', 'mo', 'y'];
const VALID_DATE_OPS = ['+', '-', 'diff'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULTS = {
  angleMode: 'rad',
  tape: [],
  vars: {},
  mode: 'standard',
  secondMode: false,
  programmerBase: 'dec',
  // PR-3 (programmer) — defaults are inert until the mode opens
  bitWidth: 32,
  programmerValue: '0',
  // PR-4 (date) — 'today' is a sentinel that resolves to today's
  // UTC date at render time, so saved state doesn't go stale.
  dateFrom: 'today',
  dateTo: 'today',
  dateDelta: 0,
  dateDeltaUnit: 'd',
  dateOp: '+',
};

/**
 * Load + normalize an envelope from kernel.storage. Returns the
 * default shape if no saved data exists. Triggers a migration write
 * if the data came from a legacy key, so the next load takes the
 * canonical path directly.
 */
export function loadCalculatorState(kernel) {
  const v4 = kernel.storage?.load(STORAGE_KEY);
  if (v4 && typeof v4 === 'object') return _normalize(v4);

  const v3 = kernel.storage?.load(LEGACY_KEY_V3);
  if (v3 && typeof v3 === 'object') {
    const out = _normalize(v3);
    saveCalculatorState(kernel, out);
    return out;
  }

  const v2 = kernel.storage?.load(LEGACY_KEY_V2);
  if (v2 && typeof v2 === 'object') {
    const out = _normalize({ angleMode: v2.angleMode, tape: v2.tape });
    saveCalculatorState(kernel, out);
    return out;
  }

  const v1 = kernel.storage?.load(LEGACY_KEY_V1);
  if (v1 && typeof v1 === 'object') {
    const tape = Array.isArray(v1.history) ? v1.history.map((h) => ({
      ts: 0,
      expr: String(h?.expression ?? ''),
      result: String(h?.result ?? ''),
    })).filter((t) => t.expr && t.result) : [];
    const out = _normalize({ angleMode: v1.angleMode, tape });
    saveCalculatorState(kernel, out);
    return out;
  }

  return _normalize({});
}

export function saveCalculatorState(kernel, s) {
  kernel.storage?.save(STORAGE_KEY, _normalize(s));
}

/**
 * Normalize an arbitrary blob into a valid v4 envelope. Every field
 * has a default so partial saves (e.g. a v3 envelope with no
 * programmer fields) come back fully populated.
 */
function _normalize(obj) {
  const out = { ...DEFAULTS };
  if (obj.angleMode === 'deg' || obj.angleMode === 'rad') out.angleMode = obj.angleMode;
  if (Array.isArray(obj.tape)) out.tape = obj.tape.slice(0, MAX_TAPE);
  out.vars = sanitizeVars(obj.vars);
  if (typeof obj.mode === 'string' && VALID_MODES.includes(obj.mode)) out.mode = obj.mode;
  if (typeof obj.secondMode === 'boolean') out.secondMode = obj.secondMode;
  if (typeof obj.programmerBase === 'string' && VALID_BASES.includes(obj.programmerBase)) {
    out.programmerBase = obj.programmerBase;
  }
  if (Number.isInteger(obj.bitWidth) && isValidBitWidth(obj.bitWidth)) out.bitWidth = obj.bitWidth;
  out.programmerValue = sanitizeProgrammerValue(obj.programmerValue);
  if (typeof obj.dateFrom === 'string' && (obj.dateFrom === 'today' || ISO_DATE_RE.test(obj.dateFrom))) {
    out.dateFrom = obj.dateFrom;
  }
  if (typeof obj.dateTo === 'string' && (obj.dateTo === 'today' || ISO_DATE_RE.test(obj.dateTo))) {
    out.dateTo = obj.dateTo;
  }
  if (Number.isFinite(obj.dateDelta)) out.dateDelta = Math.max(0, Math.trunc(obj.dateDelta));
  if (typeof obj.dateDeltaUnit === 'string' && VALID_DELTA_UNITS.includes(obj.dateDeltaUnit)) {
    out.dateDeltaUnit = obj.dateDeltaUnit;
  }
  if (typeof obj.dateOp === 'string' && VALID_DATE_OPS.includes(obj.dateOp)) out.dateOp = obj.dateOp;
  return out;
}
