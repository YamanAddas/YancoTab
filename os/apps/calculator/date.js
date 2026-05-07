/**
 * date.js — Date mode panel + math helpers.
 *
 * Date mode supports three operations:
 *   '+'    From + delta-units → To  (compute target date)
 *   '-'    From − delta-units → To  (compute target date)
 *   'diff' To − From → days         (compute delta in days)
 *
 * Delta units: d (day) | w (week) | mo (month) | y (year).
 *
 * Month + year rollover policy: clamp-to-month-end. Jan 31 + 1mo
 * lands on Feb 28 (or Feb 29 in a leap year). Feb 29 2024 + 1y
 * lands on Feb 28 2025.
 *
 * Date inputs are HTML <input type="date"> elements whose values
 * are ISO-format strings 'YYYY-MM-DD'. Every parse anchors the
 * date at UTC midnight via 'T00:00:00Z' so DST and local-tz drift
 * never bleed into the result.
 */
import { el } from '../../utils/dom.js';
import { formatDateLabel } from './engine.js';

const DAY_MS = 86_400_000;

// ─── Date parsing / formatting ──────────────────────────────────

/**
 * Resolve a stored date string to a Date object at UTC midnight.
 * Accepts 'today' as a sentinel for today's UTC date.
 */
export function resolveDate(value, now = new Date()) {
  if (value === 'today') {
    return new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
    ));
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(value + 'T00:00:00Z');
  }
  return null;
}

/** Format a Date as the ISO 'YYYY-MM-DD' string used by <input type="date">. */
export function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Date arithmetic ────────────────────────────────────────────

/**
 * Last day of the given UTC month. month is 0-indexed (0 = Jan).
 */
function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * date + n months, with clamp-to-month-end (matches Windows Calc /
 * Excel EDATE conventions). Never produces an invalid date.
 */
export function addMonths(date, n) {
  if (!(date instanceof Date)) return null;
  const m = Math.trunc(n);
  const targetMonth = date.getUTCMonth() + m;
  const yearShift = Math.floor(targetMonth / 12);
  const newMonth = ((targetMonth % 12) + 12) % 12;
  const newYear = date.getUTCFullYear() + yearShift;
  const day = Math.min(date.getUTCDate(), lastDayOfMonth(newYear, newMonth));
  return new Date(Date.UTC(newYear, newMonth, day));
}

/** date + n years (delegates to addMonths so leap-year clamp matches). */
export function addYears(date, n) { return addMonths(date, Math.trunc(n) * 12); }

/** date + n days (UTC math; no DST drift). */
export function addDays(date, n) {
  if (!(date instanceof Date)) return null;
  return new Date(date.getTime() + Math.trunc(n) * DAY_MS);
}

/** date + n weeks. */
export function addWeeks(date, n) { return addDays(date, Math.trunc(n) * 7); }

/**
 * Compute date + delta with the given unit. delta may be negative
 * for the '-' op (caller passes a signed number).
 */
export function applyDateDelta(date, delta, unit) {
  if (!(date instanceof Date)) return null;
  switch (unit) {
    case 'd':  return addDays(date, delta);
    case 'w':  return addWeeks(date, delta);
    case 'mo': return addMonths(date, delta);
    case 'y':  return addYears(date, delta);
    default:   return null;
  }
}

/**
 * Difference in whole UTC days between two dates: to − from.
 * Positive if to is later than from.
 */
export function diffDays(from, to) {
  if (!(from instanceof Date) || !(to instanceof Date)) return NaN;
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

// ─── Panel ──────────────────────────────────────────────────────

const UNIT_DEFS = [
  { id: 'd',  label: 'Days' },
  { id: 'w',  label: 'Weeks' },
  { id: 'mo', label: 'Months' },
  { id: 'y',  label: 'Years' },
];
const OP_DEFS = [
  { id: '+',    label: '+' },
  { id: '-',    label: '−' },
  { id: 'diff', label: 'diff' },
];

/**
 * Build the date extension panel.
 *
 * @param {object} cfg
 *   handlers — object with setFrom, setTo, setDelta, setUnit, setOp,
 *              useTodayFor, evalDate
 *   state    — {dateFrom, dateTo, dateDelta, dateDeltaUnit, dateOp}
 * @returns { panelEl, refs }
 */
export function buildDatePanel({ handlers, state }) {
  const fromInput = el('input', {
    type: 'date',
    class: 'calc-date-input',
    value: state.dateFrom === 'today' ? toIsoDate(resolveDate('today')) : state.dateFrom,
    onchange: (e) => handlers.setFrom(e.target.value),
  });
  const toInput = el('input', {
    type: 'date',
    class: 'calc-date-input',
    value: state.dateTo === 'today' ? toIsoDate(resolveDate('today')) : state.dateTo,
    onchange: (e) => handlers.setTo(e.target.value),
  });

  const deltaInput = el('input', {
    type: 'number',
    class: 'calc-date-delta-input',
    inputmode: 'numeric',
    min: '0',
    step: '1',
    value: String(state.dateDelta || 0),
    oninput: (e) => handlers.setDelta(Number(e.target.value) || 0),
  });

  const opPills = el('div', { class: 'calc-date-op-row' });
  const opEls = {};
  for (const o of OP_DEFS) {
    const pill = el('button', {
      class: 'calc-date-op' + (o.id === state.dateOp ? ' is-active' : ''),
      type: 'button',
      onclick: () => handlers.setOp(o.id),
    }, o.label);
    opEls[o.id] = pill;
    opPills.appendChild(pill);
  }

  const unitPills = el('div', { class: 'calc-date-unit-row' });
  const unitEls = {};
  for (const u of UNIT_DEFS) {
    const pill = el('button', {
      class: 'calc-date-unit' + (u.id === state.dateDeltaUnit ? ' is-active' : ''),
      type: 'button',
      onclick: () => handlers.setUnit(u.id),
    }, u.label);
    unitEls[u.id] = pill;
    unitPills.appendChild(pill);
  }

  const evalBtn = el('button', {
    class: 'calc-date-eval',
    type: 'button',
    onclick: () => handlers.evalDate(),
  }, 'Compute');

  const panelEl = el('div', { class: 'calc-date-panel' }, [
    el('div', { class: 'calc-date-section' }, [
      el('div', { class: 'calc-date-label' }, 'FROM'),
      fromInput,
      el('button', {
        class: 'calc-date-today',
        type: 'button',
        onclick: () => handlers.useTodayFor('from'),
      }, 'Today'),
    ]),
    el('div', { class: 'calc-date-section' }, [
      el('div', { class: 'calc-date-label' }, 'TO'),
      toInput,
      el('button', {
        class: 'calc-date-today',
        type: 'button',
        onclick: () => handlers.useTodayFor('to'),
      }, 'Today'),
    ]),
    el('div', { class: 'calc-date-section' }, [
      el('div', { class: 'calc-date-label' }, 'OPERATION'),
      opPills,
    ]),
    el('div', { class: 'calc-date-section' }, [
      el('div', { class: 'calc-date-label' }, 'DELTA'),
      deltaInput,
      unitPills,
    ]),
    evalBtn,
  ]);

  return { panelEl, refs: { fromInput, toInput, deltaInput, opEls, unitEls } };
}

/** Update active-state classes after op or unit changes. */
export function setActiveOp(opEls, op) {
  for (const [id, pill] of Object.entries(opEls)) pill.classList.toggle('is-active', id === op);
}

export function setActiveUnit(unitEls, unit) {
  for (const [id, pill] of Object.entries(unitEls)) pill.classList.toggle('is-active', id === unit);
}

// ─── Action helpers (close over ctx) ────────────────────────────

export function actSetFrom(ctx, isoOrToday) {
  ctx._dateFrom = isoOrToday || 'today';
  _renderDate(ctx);
  ctx._persist();
}

export function actSetTo(ctx, isoOrToday) {
  ctx._dateTo = isoOrToday || 'today';
  _renderDate(ctx);
  ctx._persist();
}

export function actSetDelta(ctx, n) {
  ctx._dateDelta = Math.max(0, Math.trunc(Number(n) || 0));
  _renderDate(ctx);
  ctx._persist();
}

export function actSetUnit(ctx, unit) {
  if (!UNIT_DEFS.find((u) => u.id === unit)) return;
  ctx._dateDeltaUnit = unit;
  setActiveUnit(ctx._refs.dateUnitEls, unit);
  _renderDate(ctx);
  ctx._persist();
}

export function actSetOp(ctx, op) {
  if (!OP_DEFS.find((o) => o.id === op)) return;
  ctx._dateOp = op;
  setActiveOp(ctx._refs.dateOpEls, op);
  _renderDate(ctx);
  ctx._persist();
}

export function actUseTodayFor(ctx, which) {
  const today = toIsoDate(resolveDate('today'));
  if (which === 'from') {
    ctx._dateFrom = 'today';
    if (ctx._refs.dateFromInput) ctx._refs.dateFromInput.value = today;
  } else {
    ctx._dateTo = 'today';
    if (ctx._refs.dateToInput) ctx._refs.dateToInput.value = today;
  }
  _renderDate(ctx);
  ctx._persist();
}

export function actEvalDate(ctx) {
  const r = computeDate(ctx);
  if (!r) return;
  ctx._appendTape({ ts: Date.now(), expr: r.expr, result: r.resultLabel });
  ctx._dateResultLabel = r.resultLabel;
  _renderDate(ctx);
  ctx._renderTape();
}

/**
 * Compute the active operation. Pure-ish — only reads ctx state.
 * Returns { expr, resultLabel } or null if invalid input.
 */
export function computeDate(ctx) {
  const from = resolveDate(ctx._dateFrom);
  const to   = resolveDate(ctx._dateTo);
  if (!from || !to) return null;
  const fromLabel = formatDateLabel(from);
  const toLabel   = formatDateLabel(to);
  const unit      = ctx._dateDeltaUnit;
  const delta     = ctx._dateDelta;
  const unitDef   = UNIT_DEFS.find((u) => u.id === unit);
  const unitLabel = unitDef ? unitDef.label.toLowerCase() : 'days';
  if (ctx._dateOp === 'diff') {
    const days = diffDays(from, to);
    if (!Number.isFinite(days)) return null;
    return {
      expr: `${toLabel} − ${fromLabel}`,
      resultLabel: `${days} day${Math.abs(days) === 1 ? '' : 's'}`,
    };
  }
  const sign = ctx._dateOp === '-' ? -1 : 1;
  const result = applyDateDelta(from, sign * delta, unit);
  if (!result) return null;
  return {
    expr: `${fromLabel} ${ctx._dateOp === '-' ? '−' : '+'} ${delta} ${unitLabel}`,
    resultLabel: formatDateLabel(result),
  };
}

/**
 * Render the date display. Updates the main result line + the
 * meta line, plus refreshes the form inputs to reflect state.
 */
export function _renderDate(ctx) {
  if (ctx._mode !== 'date') return;
  const r = computeDate(ctx);
  if (r) {
    ctx.state.current = r.resultLabel;
  } else {
    ctx.state.current = '—';
  }
  // exprEl shows the full date expression
  if (ctx._refs.exprEl) ctx._refs.exprEl.textContent = r ? r.expr : '';
  // resultEl shows the answer
  if (ctx._refs.resultEl) ctx._refs.resultEl.textContent = ctx.state.current;
  // meta line
  if (ctx._refs.metaEl) {
    ctx._refs.metaEl.textContent = '';
    ctx._refs.metaEl.append(
      'date · ', ctx._dateOp === 'diff' ? 'difference' : (ctx._dateOp === '-' ? 'subtract' : 'add'),
    );
  }
}
