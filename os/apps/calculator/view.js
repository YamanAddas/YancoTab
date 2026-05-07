/**
 * view.js — Calculator ("Tape") DOM builders.
 *
 * Pure DOM. Caller owns state and passes a dispatch fn + helpers via cfg.
 * Re-entrant — _renderDisplay / _renderTape from the shell rewrite the
 * mutable text and tape area without recreating the rest of the tree.
 */
import { el } from '../../utils/dom.js';

// ─── Keypad layout (6 rows × 5 cols, 30 keys total) ───────────
//
// Row format: [label, action, value, type?]
//   action ∈ {num, dot, op, eval, clear, negate, percent, sci, mem, paren}
//   type   ∈ {undefined (number style), op, fn, clr, eq}
export const KEYPAD = [
  [['mc','mem','mc','fn'],   ['m+','mem','m+','fn'], ['m−','mem','m-','fn'], ['mr','mem','mr','fn'], ['AC','clear','','clr']],
  [['sin','sci','sin','fn'], ['cos','sci','cos','fn'], ['π','sci','pi','fn'], ['%','percent','','op'], ['÷','op','/','op']],
  [['7','num','7'],          ['8','num','8'],         ['9','num','9'],        ['×','op','*','op'],    ['x²','sci','pow2','fn']],
  [['4','num','4'],          ['5','num','5'],         ['6','num','6'],        ['−','op','-','op'],    ['√','sci','sqrt','fn']],
  [['1','num','1'],          ['2','num','2'],         ['3','num','3'],        ['+','op','+','op'],    ['±','negate','','fn']],
  // Design's `,` slot becomes `)` so parens balance.
  [['0','num','0'],          ['.','dot','','op'],     [')','paren',')','op'], ['(','paren','(','op'], ['=','eval','','eq']],
];

export const SCI_UNARY = {
  pow2: (v) => v * v,
  sqrt: (v) => Math.sqrt(v),
  sin:  (v, ctx) => Math.sin(ctx.toRadians(v)),
  cos:  (v, ctx) => Math.cos(ctx.toRadians(v)),
  pi:   () => Math.PI,
};

export const OP_SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' };

export const TAB_DEFS = [
  { id: 'tape',    label: 'Tape' },
  { id: 'history', label: 'History' },
  { id: 'notes',   label: 'Notes export' },
];

export const MODE_DEFS = [
  { id: 'standard',   label: 'Standard',   active: true },
  { id: 'programmer', label: 'Programmer', soon: true },
  { id: 'scientific', label: 'Scientific', soon: true },
  { id: 'date',       label: 'Date',       soon: true },
];

export function fmtTime(ts) {
  if (!ts) return '--:--';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export function fmtOp(op) { return OP_SYMBOLS[op] || op; }

/**
 * Build the whole Calculator app frame and return refs the shell uses
 * for re-renders.
 *
 * @param {object} cfg
 *   activeTab, mode  — initial selection
 *   handlers — { dispatch, setTab, setMode, saveToNotes, copyAll, exportCsv, clearTape }
 * @returns { frame, refs: {exprEl, resultEl, metaEl, tapeEl, tapeCountEl, tabEls, modeEls} }
 */
export function buildView(cfg) {
  const { activeTab, mode, handlers } = cfg;
  const tabEls = {};
  const modeEls = {};

  // Titlebar
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

  // Pad — display + modes + keypad
  const exprEl = el('div', { class: 'calc-display-input' });
  const resultEl = el('div', { class: 'calc-display-result' }, '0');
  const metaEl = el('div', { class: 'calc-display-meta' });
  const display = el('div', { class: 'calc-display' }, [exprEl, resultEl, metaEl]);

  const modes = el('div', { class: 'calc-modes' });
  for (const m of MODE_DEFS) {
    const pill = el('div', {
      class: 'calc-mode' + (m.id === mode ? ' is-active' : ''),
      role: 'button',
      tabindex: '0',
      onclick: () => handlers.setMode(m.id, m.soon),
    }, m.label);
    modeEls[m.id] = pill;
    modes.appendChild(pill);
  }

  const keypad = el('div', { class: 'calc-keypad' });
  for (const row of KEYPAD) {
    for (const [label, action, value, type] of row) {
      const cls = ['calc-key'];
      if (type === 'op')  cls.push('is-op');
      if (type === 'fn')  cls.push('is-fn');
      if (type === 'clr') cls.push('is-clr');
      if (type === 'eq')  cls.push('is-eq');
      keypad.appendChild(el('button', {
        class: cls.join(' '),
        type: 'button',
        'aria-label': label,
        onclick: () => handlers.dispatch(action, value),
      }, label));
    }
  }
  const pad = el('div', { class: 'calc-pad' }, [display, modes, keypad]);

  // Tape side
  const tapeCountEl = el('span', { class: 'calc-tape-count' });
  const tapeHead = el('div', { class: 'calc-tape-h' }, [
    el('span', {}, 'Tape'),
    ' · ',
    el('b', {}, 'Today'),
    tapeCountEl,
  ]);
  const tapeEl = el('div', { class: 'calc-tape' });
  const varsRow = el('div', { class: 'calc-vars-row' }, [
    el('span', { class: 'calc-vars-label' }, 'Vars'),
    el('span', { class: 'calc-var-pill is-empty' }, '+ new (soon)'),
  ]);
  const foot = el('div', { class: 'calc-tape-foot' }, [
    el('button', { class: 'calc-foot-btn', type: 'button', onclick: handlers.saveToNotes }, 'Save tape → Notes'),
    el('button', { class: 'calc-foot-btn', type: 'button', onclick: handlers.copyAll }, 'Copy all'),
    el('button', { class: 'calc-foot-btn', type: 'button', onclick: handlers.exportCsv }, 'Export .csv'),
    el('button', { class: 'calc-foot-btn is-clear', type: 'button', onclick: handlers.clearTape }, 'Clear'),
  ]);
  const side = el('div', { class: 'calc-tape-side' }, [tapeHead, tapeEl, varsRow, foot]);

  const body = el('div', { class: 'calc-body' }, [pad, side]);
  const frame = el('div', { class: 'calc-app-frame' }, [titlebar, body]);

  return {
    frame,
    refs: { exprEl, resultEl, metaEl, tapeEl, tapeCountEl, tabEls, modeEls },
  };
}

/**
 * Render the tape lines (newest-first) into the prebuilt container.
 * Caller wipes the container; we just append rows.
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
    tapeEl.appendChild(el('div', {
      class: cls,
      title: 'Tap to reuse this result',
      onclick: () => onReuse(t.result),
    }, [
      el('span', { class: 'ts' }, fmtTime(t.ts)),
      el('span', { class: 'expr' }, t.expr),
      el('span', { class: 'res' }, t.result),
    ]));
  }
}
