/**
 * view.js — Calculator ("Tape") DOM builders.
 *
 * Pure DOM. Caller owns state and passes a dispatch fn + helpers via cfg.
 * Re-entrant — _renderDisplay / _renderTape from the shell rewrite the
 * mutable text and tape area without recreating the rest of the tree.
 */
import { el } from '../../utils/dom.js';
import { labelFor, formatBaseRows } from './engine.js';
import { buildSciPanel } from './scientific.js';
import { buildProgPanel } from './programmer.js';
import { buildDatePanel } from './date.js';

// ─── Keypad layout (6 rows × 5 cols, 30 keys total) ───────────
//
// Row format: [label, action, value, type?]
//   action ∈ {num, dot, op, eval, clear, negate, percent, sci, mem, paren}
//   type   ∈ {undefined (number style), op, fn, clr, eq}
//
// `sci` keys take a function id as value (pow2, sqrt, sin, cos, pi)
// — the shell remaps this id in 2nd-mode via engine.actionFor().
export const KEYPAD = [
  [['mc','mem','mc','fn'],   ['m+','mem','m+','fn'], ['m−','mem','m-','fn'], ['mr','mem','mr','fn'], ['AC','clear','','clr']],
  [['sin','sci','sin','fn'], ['cos','sci','cos','fn'], ['π','sci','pi','fn'], ['%','percent','','op'], ['÷','op','/','op']],
  [['7','num','7'],          ['8','num','8'],         ['9','num','9'],        ['×','op','*','op'],    ['x²','sci','pow2','fn']],
  [['4','num','4'],          ['5','num','5'],         ['6','num','6'],        ['−','op','-','op'],    ['√','sci','sqrt','fn']],
  [['1','num','1'],          ['2','num','2'],         ['3','num','3'],        ['+','op','+','op'],    ['±','negate','','fn']],
  [['0','num','0'],          ['.','dot','','op'],     [')','paren',')','op'], ['(','paren','(','op'], ['=','eval','','eq']],
];

export const TAB_DEFS = [
  { id: 'tape',    label: 'Tape' },
  { id: 'history', label: 'History' },
  { id: 'notes',   label: 'Notes export' },
];

export const MODE_DEFS = [
  { id: 'standard',   label: 'Standard' },
  { id: 'programmer', label: 'Programmer' },
  { id: 'scientific', label: 'Scientific' },
  { id: 'date',       label: 'Date' },
];

export const BASE_DEFS = [
  { id: 'dec', label: 'DEC' },
  { id: 'hex', label: 'HEX' },
  { id: 'oct', label: 'OCT' },
  { id: 'bin', label: 'BIN' },
];

export function fmtTime(ts) {
  if (!ts) return '--:--';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/**
 * Build the whole Calculator app frame and return refs the shell
 * uses for re-renders.
 */
export function buildView(cfg) {
  const { activeTab, mode, handlers } = cfg;
  const tabEls = {};
  const modeEls = {};
  const baseEls = {};
  const keyEls = []; // for live re-labelling in 2nd-mode

  // ── Titlebar ──
  const tabs = el('div', { class: 'calc-tabs' });
  for (const t of TAB_DEFS) {
    const tab = el('span', {
      class: 'calc-tab' + (t.id === activeTab ? ' is-active' : ''),
      role: 'button',
      tabindex: '0',
      onclick: () => handlers.setTab(t.id),
    }, t.label);
    tabEls[t.id] = tab;
    tabs.appendChild(tab);
  }
  const titlebar = el('div', { class: 'calc-titlebar' }, [
    el('div', { class: 'calc-name' }, [el('b', {}, 'calc'), ' / tape']),
    tabs,
  ]);

  // ── Display ──
  const exprEl = el('div', { class: 'calc-display-input' });
  const resultEl = el('div', { class: 'calc-display-result' }, '0');
  const metaEl = el('div', { class: 'calc-display-meta' });
  const display = el('div', { class: 'calc-display' }, [exprEl, resultEl, metaEl]);

  // ── Mode-specific panel: programmer base picker + multi-base view ──
  const baseGrid = el('div', { class: 'calc-base-grid' });
  const baseRefs = {};
  for (const b of BASE_DEFS) {
    const value = el('span', { class: 'calc-base-value' }, '0');
    const label = el('span', { class: 'calc-base-label' }, b.label);
    const row = el('button', {
      class: 'calc-base-row',
      type: 'button',
      onclick: () => handlers.setProgrammerBase(b.id),
    }, [label, value]);
    baseRefs[b.id] = { row, value };
    baseEls[b.id] = row;
    baseGrid.appendChild(row);
  }
  // Programmer panel: existing multi-base grid + new extension
  // (hex digits A-F, bitwise ops, word-size pills) wired in below.
  const progBuild = buildProgPanel({
    handlers: {
      appendHex:   (d) => handlers.appendHex(d),
      applyBitop:  (op) => handlers.applyBitop(op),
      applyNot:    () => handlers.applyNot(),
      setWidth:    (w) => handlers.setBitWidth(w),
    },
    bitWidth: cfg.bitWidth || 32,
    base: cfg.programmerBase || 'dec',
  });
  const programmerPanel = el('div', { class: 'calc-mode-panel calc-mode-programmer' }, [
    baseGrid,
    progBuild.panelEl,
  ]);
  const progRefs = progBuild;

  // Date-mode panel — full form (From / To / Op / Δ + unit)
  const dateBuild = buildDatePanel({
    handlers: {
      setFrom:    (iso) => handlers.setDateFrom(iso),
      setTo:      (iso) => handlers.setDateTo(iso),
      setDelta:   (n)   => handlers.setDateDelta(n),
      setUnit:    (u)   => handlers.setDateUnit(u),
      setOp:      (op)  => handlers.setDateOp(op),
      useTodayFor: (which) => handlers.useTodayFor(which),
      evalDate:   () => handlers.evalDate(),
    },
    state: {
      dateFrom: cfg.dateFrom || 'today',
      dateTo:   cfg.dateTo   || 'today',
      dateDelta: cfg.dateDelta || 0,
      dateDeltaUnit: cfg.dateDeltaUnit || 'd',
      dateOp: cfg.dateOp || '+',
    },
  });
  const datePanel = el('div', { class: 'calc-mode-panel calc-mode-date' }, [
    dateBuild.panelEl,
  ]);
  const dateRefs = dateBuild.refs;

  // Scientific-mode panel — full extension with all 17 fns + Rad/Deg
  const sciBuild = buildSciPanel({
    handlers: {
      toggleSecond: () => handlers.toggleSecond(),
      toggleAngle:  () => handlers.toggleAngle(),
      appendExponent: () => handlers.appendExponent(),
      applyOp: (op) => handlers.applyOp(op),
      applySci: (id) => handlers.applySci(id),
    },
    secondMode: cfg.secondMode || false,
    angleMode: cfg.angleMode || 'rad',
  });
  const sciSecondToggle = sciBuild.secondToggle;
  const sciAngleToggle = sciBuild.angleToggle;
  const sciPanelKeyEls = sciBuild.sciKeyEls;
  const sciPanel = el('div', { class: 'calc-mode-panel calc-mode-scientific' }, [
    sciBuild.panelEl,
  ]);

  // The 3 mode panels are stacked; CSS hides all but the active one.
  const modePanels = el('div', { class: 'calc-mode-panels' }, [
    programmerPanel, datePanel, sciPanel,
  ]);
  modePanels.dataset.mode = mode;

  // ── Mode pills ──
  const modes = el('div', { class: 'calc-modes' });
  for (const m of MODE_DEFS) {
    const pill = el('div', {
      class: 'calc-mode' + (m.id === mode ? ' is-active' : ''),
      role: 'button',
      tabindex: '0',
      onclick: () => handlers.setMode(m.id),
    }, m.label);
    modeEls[m.id] = pill;
    modes.appendChild(pill);
  }

  // ── Keypad ──
  const keypad = el('div', { class: 'calc-keypad' });
  for (const row of KEYPAD) {
    for (const [label, action, value, type] of row) {
      const cls = ['calc-key'];
      if (type === 'op')  cls.push('is-op');
      if (type === 'fn')  cls.push('is-fn');
      if (type === 'clr') cls.push('is-clr');
      if (type === 'eq')  cls.push('is-eq');
      const btn = el('button', {
        class: cls.join(' '),
        type: 'button',
        'aria-label': label,
        onclick: () => handlers.dispatch(action, value),
      }, label);
      // Track sci keys so the shell can re-label them when 2nd-mode toggles.
      if (action === 'sci') {
        btn.dataset.sciId = value;
        keyEls.push(btn);
      }
      keypad.appendChild(btn);
    }
  }
  const keypadWrap = el('div', { class: 'calc-keypad-wrap' }, [keypad]);
  // Bottom row: extension panel (left column, only visible in non-
  // Standard modes) + keypad. The column layout reclaims the
  // vertical space that horizontal extension rows used to eat.
  const padBottom = el('div', { class: 'calc-pad-bottom' }, [modePanels, keypadWrap]);
  const pad = el('div', { class: 'calc-pad' }, [
    display,
    modes,
    padBottom,
  ]);

  // ── Tape side ──
  const tapeHeadLabel = el('span', {}, 'Tape');
  const tapeHeadDay = el('b', {}, 'Today');
  const tapeCountEl = el('span', { class: 'calc-tape-count' });
  const tapeHead = el('div', { class: 'calc-tape-h' }, [
    tapeHeadLabel, ' · ', tapeHeadDay, tapeCountEl,
  ]);
  const tapeEl = el('div', { class: 'calc-tape' });

  const varsRowEl = el('div', { class: 'calc-vars-row' });
  const foot = el('div', { class: 'calc-tape-foot' }, [
    el('button', { class: 'calc-foot-btn', type: 'button', onclick: handlers.saveToNotes }, 'Save tape → Notes'),
    el('button', { class: 'calc-foot-btn', type: 'button', onclick: handlers.copyAll }, 'Copy all'),
    el('button', { class: 'calc-foot-btn', type: 'button', onclick: handlers.exportCsv }, 'Export .csv'),
    el('button', { class: 'calc-foot-btn is-clear', type: 'button', onclick: handlers.clearTape }, 'Clear'),
  ]);
  const side = el('div', { class: 'calc-tape-side' }, [tapeHead, tapeEl, varsRowEl, foot]);

  const body = el('div', { class: 'calc-body' }, [pad, side]);
  const frame = el('div', { class: 'calc-app-frame' }, [titlebar, body]);

  return {
    frame,
    refs: {
      exprEl, resultEl, metaEl,
      tapeEl, tapeCountEl, tapeHeadLabel, tapeHeadDay,
      varsRowEl,
      modePanels, baseRefs,
      dateFromInput: dateRefs.fromInput,
      dateToInput:   dateRefs.toInput,
      dateDeltaInput: dateRefs.deltaInput,
      dateOpEls:     dateRefs.opEls,
      dateUnitEls:   dateRefs.unitEls,
      sciSecondToggle, sciAngleToggle, sciPanelKeyEls,
      progHexKeys: progRefs.hexKeys,
      progBitOpEls: progRefs.bitOpEls,
      progWidthPills: progRefs.widthPills,
      tabEls, modeEls, baseEls, keyEls,
    },
  };
}

/**
 * Render the tape lines (newest-first) into the prebuilt container.
 */
export function renderTapeLines(tapeEl, tape, onReuse) {
  tapeEl.textContent = '';
  const count = tape.length;
  if (count === 0) {
    tapeEl.appendChild(el('div', { class: 'calc-tape-empty' }, '— no entries yet —'));
    return;
  }
  const latestIdx = count - 1;
  for (let i = latestIdx; i >= 0; i--) {
    const t = tape[i];
    const cls = 'calc-tape-line' + (i === latestIdx ? ' is-latest' : '');
    const lineCls = t.kind === 'var-def' ? cls + ' is-var-def' : cls;
    tapeEl.appendChild(el('div', {
      class: lineCls,
      title: 'Tap to reuse this result',
      onclick: () => onReuse(t.result, t),
    }, [
      el('span', { class: 'ts' }, fmtTime(t.ts)),
      el('span', { class: 'expr' }, t.expr),
      el('span', { class: 'res' }, t.result),
    ]));
  }
}

/**
 * Render the vars row pills (always visible regardless of mode).
 */
export function renderVarsRow(varsRowEl, vars, handlers) {
  varsRowEl.textContent = '';
  varsRowEl.appendChild(el('span', { class: 'calc-vars-label' }, 'Vars'));
  const names = Object.keys(vars);
  if (names.length === 0) {
    varsRowEl.appendChild(el('span', { class: 'calc-var-pill is-empty calc-var-empty' }, 'no vars yet'));
  } else {
    for (const name of names.sort()) {
      const value = vars[name];
      const pill = el('button', {
        class: 'calc-var-pill',
        type: 'button',
        title: 'Click to insert; right-click to delete',
        onclick: () => handlers.useVar(name),
        oncontextmenu: (e) => { e.preventDefault(); handlers.deleteVar(name); },
      }, [
        el('b', {}, name),
        formatVarValue(value),
      ]);
      varsRowEl.appendChild(pill);
    }
  }
  varsRowEl.appendChild(el('button', {
    class: 'calc-var-pill calc-var-add',
    type: 'button',
    onclick: () => handlers.defineVar(),
  }, '+ new'));
}

function formatVarValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US');
  return String(n);
}

/**
 * Update the programmer-mode multi-base panel from the current value.
 */
export function renderBasePanel(baseRefs, decimalStr, activeBase) {
  const rows = formatBaseRows(decimalStr);
  for (const b of ['dec', 'hex', 'oct', 'bin']) {
    const ref = baseRefs[b];
    if (!ref) continue;
    ref.value.textContent = rows[b];
    ref.row.classList.toggle('is-active', b === activeBase);
  }
}

/**
 * Re-label sci keys when 2nd-mode toggles. Pass either the base
 * keypad's keyEls or the sci panel's sciKeyEls — both have a
 * `data-sci-id` dataset entry pointing at the engine function id.
 */
export function relabelSciKeys(keyEls, secondMode) {
  for (const btn of keyEls) {
    const baseId = btn.dataset.sciId;
    if (!baseId) continue;
    btn.textContent = labelFor(baseId, secondMode);
    btn.setAttribute('aria-label', btn.textContent);
  }
}

/**
 * Render the main display (expr + result + meta line).
 *
 * @param {object} refs — view refs returned by buildView
 * @param {object} cfg
 *   current, previous, operator, parenDepth, angleMode, fmtOp,
 *   secondMode, mode
 */
export function renderDisplay(refs, cfg) {
  const { exprEl, resultEl, metaEl } = refs;
  resultEl.textContent = cfg.current;
  resultEl.title = cfg.current;

  const prefix = cfg.parenDepth > 0 ? '( '.repeat(cfg.parenDepth) : '';
  if (cfg.previous !== null && cfg.operator) {
    exprEl.textContent = `${prefix}${cfg.previous} ${cfg.fmtOp(cfg.operator)}`;
  } else {
    exprEl.textContent = cfg.parenDepth > 0 ? prefix.trimEnd() : '';
  }

  metaEl.textContent = '';
  metaEl.append(
    'precision ', el('b', {}, '12'),
    ' · base ', el('b', {}, '10'),
    ' · ', el('b', {}, cfg.angleMode.toUpperCase()),
  );
  if (cfg.secondMode) {
    metaEl.append(' · ', el('b', { class: 'calc-meta-2nd' }, '2ND'));
  }
}

// renderDateMode moved to calculator/date.js — _renderDate(ctx).
