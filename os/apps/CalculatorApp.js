/** CalculatorApp — "Tape" redesign shell. Pure helpers in calculator/*.js. */
import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { buildView, renderTapeLines, renderVarsRow, relabelSciKeys,
         renderDisplay, renderDateMode } from './calculator/view.js';
import { copyTape, exportTapeCsv, saveTapeToNotes } from './calculator/tape.js';
import { renderHistory } from './calculator/historyView.js';
import { renderNotesExport } from './calculator/notesExportView.js';
import { normalizeNumber, applyBinaryOp, fmtOp, SCI_FNS, NULLARY_SCI,
         actionFor, addDaysToToday, formatDateLabel } from './calculator/engine.js';
import { toggleSecondMode, toggleAngleMode,
         appendExponentMarker } from './calculator/scientific.js';
import { makeProgState,
         actRender       as progRender,
         actAppendDigit  as progAppendDigit,
         actAppendHex    as progAppendHex,
         actSetOp        as progSetOp,
         actEval         as progEval,
         actNot          as progNot,
         actNegate       as progNegate,
         actClear        as progClear,
         actBackspace    as progBackspace,
         actSetBase      as progSetBase,
         actSetWidth     as progSetWidth } from './calculator/programmer.js';
import { loadCalculatorState, saveCalculatorState,
         MAX_TAPE } from './calculator/persistence.js';
import { actDefineVar as defineVarAction,
         actUseVar    as useVarAction,
         actDeleteVar as deleteVarAction } from './calculator/vars.js';
import { routeAction } from './calculator/dispatch.js';
import { bindKeyboard } from './calculator/keyboard.js';

function css(href) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  return l;
}

export class CalculatorApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Calculator', id: 'calculator', icon: '🔢' };
    this._resetState();
    this._parenStack = [];
    this._tape = [];
    this._vars = {};
    this._mode = 'standard';
    this._secondMode = false;
    this._programmerBase = 'dec';
    this._bitWidth = 32;
    this._prog = makeProgState();
    this._activeTab = 'tape';
    this._dateDelta = 0;     // session-only — magnitude of days
    this._dateSign = '+';    // '+' or '-' for date mode
    this._dateResultLabel = '';
    this._styleLinks = [];
    this._onKeyDown = null;
  }

  _resetState() {
    this.state = {
      current: '0',
      previous: null,
      operator: null,
      resetNext: false,
      memory: 0,
      angleMode: 'rad',
    };
  }

  async init() {
    this._styleLinks = [css('css/calculator.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));

    this._loadPersisted();
    this.root = el('div', { class: 'app-window app-calculator', tabindex: '0' });

    const { frame, refs } = buildView({
      activeTab: this._activeTab,
      mode: this._mode,
      secondMode: this._secondMode,
      angleMode: this.state.angleMode,
      bitWidth: this._bitWidth,
      programmerBase: this._programmerBase,
      handlers: {
        dispatch:    (action, value) => this._dispatch(action, value),
        setTab:      (id) => this._setActiveTab(id),
        setMode:     (id) => this._setMode(id),
        setProgrammerBase: (id) => this._setProgrammerBase(id),
        setBitWidth: (w) => this._setBitWidth(w),
        toggleSecond: () => this._toggleSecond(),
        toggleAngle: () => this._toggleAngle(),
        appendExponent: () => this._appendExponent(),
        applyOp:     (op) => this.setOperator(op),
        applySci:    (id) => this.handleScientific(this._resolveSciFunc(id)),
        appendHex:   (d) => this._progAppendHex(d),
        applyBitop:  (op) => this._progSetOp(op),
        applyNot:    () => this._progNot(),
        defineVar:   () => this._defineVar(),
        useVar:      (n) => this._useVar(n),
        deleteVar:   (n) => this._deleteVar(n),
        saveToNotes: () => saveTapeToNotes(this._tape, this.kernel),
        copyAll:     () => copyTape(this._tape, this.kernel),
        exportCsv:   () => exportTapeCsv(this._tape, this.kernel),
        clearTape:   () => this._clearTape(),
      },
    });
    this._refs = refs;
    this.root.appendChild(frame);

    // Apply initial mode/2nd state to the dom
    this._applyModeClass();
    if (this._secondMode) {
      relabelSciKeys(refs.keyEls, true);
      relabelSciKeys(refs.sciPanelKeyEls, true);
    }
    this._renderAll();
    this._bindKeyboard();
  }

  _loadPersisted() {
    const s = loadCalculatorState(this.kernel);
    this.state.angleMode = s.angleMode;
    this._tape = s.tape;
    this._vars = s.vars;
    this._mode = s.mode;
    this._secondMode = s.secondMode;
    this._programmerBase = s.programmerBase;
    this._bitWidth = s.bitWidth;
    // Restore the programmer value as a BigInt; persistence stores
    // it as a decimal string so JSON survives chrome.storage.sync.
    try { this._prog.value = BigInt(s.programmerValue || '0'); }
    catch { this._prog.value = 0n; }
  }

  _persist() {
    saveCalculatorState(this.kernel, {
      angleMode: this.state.angleMode,
      tape: this._tape,
      vars: this._vars,
      mode: this._mode,
      secondMode: this._secondMode,
      programmerBase: this._programmerBase,
      bitWidth: this._bitWidth,
      programmerValue: this._prog.value.toString(10),
    });
  }

  _setActiveTab(id) {
    if (this._activeTab === id) return;
    this._activeTab = id;
    for (const [tid, elx] of Object.entries(this._refs.tabEls)) {
      elx.classList.toggle('is-active', tid === id);
    }
    this._refs.tapeHeadLabel.textContent = id === 'history' ? 'History' : id === 'notes' ? 'Notes export' : 'Tape';
    this._renderRightPanel();
  }

  _renderRightPanel() {
    const { tapeEl, tapeCountEl, tapeHeadDay } = this._refs;
    if (this._activeTab === 'history') {
      tapeHeadDay.textContent = 'all days';
      tapeCountEl.textContent = `${this._tape.length} entries`;
      renderHistory(tapeEl, this._tape, (r) => this._reuseResult(r));
    } else if (this._activeTab === 'notes') {
      tapeHeadDay.textContent = 'saved';
      tapeCountEl.textContent = '';
      renderNotesExport(tapeEl, this.kernel);
    } else {
      tapeHeadDay.textContent = 'Today';
      this._renderTape();
    }
  }

  _setMode(id) {
    if (this._mode === id) return;
    // Mode switch always clears pending state to avoid mixing
    // Number-mode and (PR-3) BigInt-mode arithmetic. Toast only if
    // we're actually discarding work, not on a clean state.
    const hadPending = this.state.previous !== null
      || this.state.operator !== null
      || this._parenStack.length > 0;
    this._mode = id;
    this.clear();
    if (hadPending) {
      this.kernel.emit('toast', { message: 'Cleared on mode change', type: 'info' });
    }
    for (const [mid, elx] of Object.entries(this._refs.modeEls)) {
      elx.classList.toggle('is-active', mid === id);
    }
    this._applyModeClass();
    if (id !== 'scientific' && this._secondMode) {
      this._secondMode = false;
      relabelSciKeys(this._refs.keyEls, false);
      this._refs.sciSecondToggle?.classList.remove('is-active');
    }
    if (id === 'date') this._renderDateMode();
    if (id === 'programmer') this._renderProgrammerMode();
    this._persist();
  }

  _applyModeClass() {
    this._refs.modePanels.dataset.mode = this._mode;
    this.root.dataset.calcMode = this._mode;
  }

  _toggleSecond()    { toggleSecondMode(this, relabelSciKeys); }
  _toggleAngle()     { toggleAngleMode(this); }
  _appendExponent()  { appendExponentMarker(this); }

  _setProgrammerBase(base) { progSetBase(this, base); }
  _setBitWidth(w)          { progSetWidth(this, w); }
  _renderProgrammerMode()  { progRender(this); }
  _progAppendDigit(d)      { progAppendDigit(this, d); }
  _progAppendHex(letter)   { progAppendHex(this, letter); }
  _progSetOp(op)           { progSetOp(this, op); }
  _progEval()              { progEval(this); }
  _progNot()               { progNot(this); }
  _progNegate()            { progNegate(this); }
  _progClear()             { progClear(this); }
  _progBackspace()         { progBackspace(this); }

  _renderDateMode() {
    if (this._mode !== 'date') return;
    renderDateMode(this._refs, {
      today: formatDateLabel(new Date()),
      sign: this._dateSign,
      delta: this._dateDelta,
      resultLabel: this._dateResultLabel,
    });
  }

  _defineVar()       { return defineVarAction(this); }
  _useVar(name)      { useVarAction(this, name); }
  _deleteVar(name)   { deleteVarAction(this, name); }

  _bindKeyboard() {
    this._onKeyDown = bindKeyboard(this.root, this);
  }

  _backspace() {
    if (this.state.resetNext || this.state.current === 'Error') return;
    this.state.current = this.state.current.length > 1 ? this.state.current.slice(0, -1) : '0';
    this._renderDisplay();
  }

  _dispatch(action, value) {
    routeAction(this, action, value);
  }

  /** Resolve a sci function id through the current 2nd-mode state. */
  _resolveSciFunc(funcId) {
    return actionFor(funcId, this._secondMode);
  }

  appendNumber(num) {
    if (this.state.resetNext) { this.state.current = '0'; this.state.resetNext = false; }
    if (this.state.current === '0') this.state.current = num;
    else if (this.state.current.length < 20) this.state.current += num;
    if (this._mode === 'date') {
      this._dateDelta = Math.abs(Number(this.state.current)) || 0;
      this._renderDateMode();
    }
    this._renderDisplay();
  }

  appendDot() {
    if (this.state.resetNext) { this.state.current = '0'; this.state.resetNext = false; }
    if (this.state.current.includes('.')) return;
    // No decimals after an exponent marker — '1e3.5' isn't a valid number.
    if (this.state.current.toLowerCase().includes('e')) return;
    this.state.current += '.';
    this._renderDisplay();
  }

  setOperator(op) {
    if (this.state.current === '' || this.state.current === 'Error') return;
    if (this.state.previous !== null && !this.state.resetNext) this.calculate();
    this.state.previous = this.state.current;
    this.state.operator = op;
    this.state.resetNext = true;
    this._renderDisplay();
  }

  calculate() {
    while (this._parenStack.length > 0) this._closeParen();
    if (!this.state.operator || this.state.previous === null) return;
    const prev = Number(this.state.previous);
    const curr = Number(this.state.current);
    const expr = `${this.state.previous} ${fmtOp(this.state.operator)} ${this.state.current}`;
    const result = applyBinaryOp(this.state.operator, prev, curr);
    if (!Number.isFinite(result)) { this.setError(); return; }
    this.state.current = normalizeNumber(result);
    this._appendTape({ ts: Date.now(), expr, result: this.state.current });
    this.state.previous = null;
    this.state.operator = null;
    this.state.resetNext = true;
    this._renderAll();
  }

  clear() {
    this.state.current = '0';
    this.state.previous = null;
    this.state.operator = null;
    this.state.resetNext = false;
    this._parenStack = [];
    if (this._mode === 'date') {
      this._dateDelta = 0;
      this._dateResultLabel = '';
      this._renderDateMode();
    }
    this._renderDisplay();
  }

  negate() {
    if (this.state.current === '0' || this.state.current === 'Error') return;
    const v = this.state.current;
    // If the current input is in EE entry (has an 'e'), flip the
    // exponent's sign instead of the mantissa's sign.
    const eIdx = v.toLowerCase().indexOf('e');
    if (eIdx >= 0) {
      const m = v.slice(0, eIdx);
      const exp = v.slice(eIdx + 1);
      if (exp.startsWith('-'))      this.state.current = `${m}e${exp.slice(1)}`;
      else if (exp.startsWith('+')) this.state.current = `${m}e-${exp.slice(1)}`;
      else                          this.state.current = `${m}e-${exp}`;
    } else {
      this.state.current = v.startsWith('-') ? v.slice(1) : `-${v}`;
    }
    this._renderDisplay();
  }

  percent() {
    const curr = Number(this.state.current);
    if (!Number.isFinite(curr)) { this.setError(); return; }
    this.state.current = normalizeNumber(curr / 100);
    this.state.resetNext = true;
    this._renderDisplay();
  }

  _evalDateMode() {
    const days = (this._dateSign === '-' ? -1 : 1) * this._dateDelta;
    const r = addDaysToToday(days);
    this._dateResultLabel = r.label;
    const expr = `today ${this._dateSign === '-' ? '−' : '+'} ${this._dateDelta}d`;
    this._appendTape({ ts: Date.now(), expr, result: r.label });
    this._renderDateMode();
    this._renderTape();
  }

  _openParen() {
    this._parenStack.push({
      previous: this.state.previous,
      operator: this.state.operator,
      current: this.state.current,
    });
    this.state.previous = null;
    this.state.operator = null;
    this.state.current = '0';
    this.state.resetNext = false;
    this._renderDisplay();
  }

  _closeParen() {
    if (this._parenStack.length === 0) return;
    if (this.state.operator && this.state.previous !== null) {
      const prev = Number(this.state.previous);
      const curr = Number(this.state.current);
      const r = applyBinaryOp(this.state.operator, prev, curr);
      if (!Number.isFinite(r)) { this.setError(); return; }
      this.state.current = normalizeNumber(r);
    }
    const sub = this.state.current;
    const ctx = this._parenStack.pop();
    this.state.previous = ctx.previous;
    this.state.operator = ctx.operator;
    this.state.current = sub;
    this.state.resetNext = true;
    this._renderDisplay();
  }

  handleScientific(funcId) {
    const fn = SCI_FNS[funcId];
    if (!fn) return;
    // Nullary (constants + Rand) ignore the operand
    if (NULLARY_SCI.has(funcId)) {
      this.state.current = normalizeNumber(fn(undefined, this.state));
      this.state.resetNext = true;
      this._renderDisplay();
      return;
    }
    const curr = Number(this.state.current);
    if (!Number.isFinite(curr)) { this.setError(); return; }
    const res = fn(curr, this.state);
    if (!Number.isFinite(res)) { this.setError(); return; }
    this.state.current = normalizeNumber(res);
    this.state.resetNext = true;
    this._renderDisplay();
  }

  handleMemory(action) {
    const curr = Number(this.state.current);
    if (action === 'mc') this.state.memory = 0;
    else if (action === 'm+' && Number.isFinite(curr)) this.state.memory += curr;
    else if (action === 'm-' && Number.isFinite(curr)) this.state.memory -= curr;
    else if (action === 'mr') {
      this.state.current = normalizeNumber(this.state.memory);
      this.state.resetNext = true;
      this._renderDisplay();
    }
  }

  setError() {
    this.state.current = 'Error';
    this.state.previous = null;
    this.state.operator = null;
    this.state.resetNext = true;
    this._renderDisplay();
  }

  _appendTape(entry) {
    this._tape.push(entry);
    if (this._tape.length > MAX_TAPE) this._tape.splice(0, this._tape.length - MAX_TAPE);
    this._persist();
  }

  _clearTape() {
    if (this._tape.length === 0) return;
    this._tape = [];
    this._persist();
    this._renderRightPanel();
    this.kernel.emit('toast', { message: 'Tape cleared', type: 'info' });
  }

  _reuseResult(result) {
    if (!result || result === 'Error') return;
    // Date results aren't numeric — skip
    if (/[A-Za-z]/.test(String(result))) return;
    this.state.current = String(result);
    this.state.resetNext = true;
    this._renderDisplay();
  }

  _renderAll() {
    this._renderDisplay();
    this._renderRightPanel();
    this._renderVars();
  }

  _renderDisplay() {
    renderDisplay(this._refs, {
      current: this.state.current,
      previous: this.state.previous,
      operator: this.state.operator,
      parenDepth: this._parenStack.length,
      angleMode: this.state.angleMode,
      secondMode: this._secondMode,
      fmtOp,
    });
    // NOTE: programmer mode owns its own value; the multi-base
    // panel + state.current are kept in sync by progRender(), so
    // we don't call back into it from here (would recurse).
  }

  _renderTape() {
    const { tapeEl, tapeCountEl } = this._refs;
    const count = this._tape.length;
    tapeCountEl.textContent = count === 0 ? 'empty' : `${count} line${count === 1 ? '' : 's'}`;
    if (this._activeTab === 'tape') {
      renderTapeLines(tapeEl, this._tape, (r) => this._reuseResult(r));
    } else if (this._activeTab === 'history') {
      renderHistory(tapeEl, this._tape, (r) => this._reuseResult(r));
    }
  }

  _renderVars() {
    renderVarsRow(this._refs.varsRowEl, this._vars, {
      defineVar: () => this._defineVar(),
      useVar:    (n) => this._useVar(n),
      deleteVar: (n) => this._deleteVar(n),
    });
  }

  destroy() {
    if (this._onKeyDown) {
      this.root.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._styleLinks) {
      for (const l of this._styleLinks) l.remove();
      this._styleLinks = [];
    }
    super.destroy();
  }
}
