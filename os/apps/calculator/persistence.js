/**
 * persistence.js — Calculator storage I/O.
 *
 * Loads from canonical v3 key, migrating from v2/v1 legacy keys on
 * first read. Writes always target v3.
 */
import { sanitizeVars } from './engine.js';

export const STORAGE_KEY = 'yancotab_calculator_v3';
export const LEGACY_KEY_V2 = 'yancotab_calculator_v2';
export const LEGACY_KEY_V1 = 'yancotab_calculator';
export const MAX_TAPE = 50;

const VALID_MODES = ['standard', 'scientific', 'programmer', 'date'];
const VALID_BASES = ['dec', 'hex', 'oct', 'bin'];

const DEFAULTS = {
  angleMode: 'rad',
  tape: [],
  vars: {},
  mode: 'standard',
  secondMode: false,
  programmerBase: 'dec',
};

/**
 * Load + normalize an envelope from kernel.storage. Returns the
 * default shape if no saved data exists. Triggers a migration write
 * if the data came from a legacy key.
 *
 * @param {object} kernel
 * @returns {{ angleMode, tape, vars, mode, secondMode, programmerBase }}
 */
export function loadCalculatorState(kernel) {
  const v3 = kernel.storage?.load(STORAGE_KEY);
  if (v3 && typeof v3 === 'object') return _normalize(v3);

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
  kernel.storage?.save(STORAGE_KEY, {
    angleMode: s.angleMode,
    tape: Array.isArray(s.tape) ? s.tape.slice(0, MAX_TAPE) : [],
    vars: s.vars || {},
    mode: s.mode,
    secondMode: !!s.secondMode,
    programmerBase: s.programmerBase,
  });
}

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
  return out;
}
