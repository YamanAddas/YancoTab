/**
 * CalculatorApp — "Tape" redesign shell. Coordinates state, dispatch,
 * rendering. Modes: Standard / Scientific (2nd-toggle) / Programmer
 * (multi-base) / Date (today ± Nd). Pure helpers in calculator/*.js.
 * Storage: yancotab_calculator_v3 (auto-migrates v2 and legacy v1).
 */
import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import {
  buildView, renderTapeLines, renderVarsRow, renderBasePanel, relabelSciKeys,
  renderDisplay, renderDateMode,
} from './calculator/view.js';
import {
  copyTape, exportTapeCsv, saveTapeToNotes,
} from './calculator/tape.js';
import { renderHistory } from './calculator/historyView.js';
import { renderNotesExport } from './calculator/notesExportView.js';
import {
  normalizeNumber, applyBinaryOp, fmtOp,
  SCI_FNS, actionFor,
  addDaysToToday, formatDateLabel,
} from './calculator/engine.js';
import {
  loadCalculatorState, saveCalculatorState, MAX_TAPE,
} from './calculator/persistence.js';
import { promptDefineVar } from './calculator/vars.js';
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
      handlers: {
        dispatch:    (action, value) => this._dispatch(action, value),
        setTab:      (id) => this._setActiveTab(id),
        setMode:     (id) => this._setMode(id),
        setProgrammerBase: (id) => this._setProgrammerBase(id),
        toggleSecond: () => this._toggleSecond(),
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
    if (this._secondMode) relabelSciKeys(refs.keyEls, true);
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
  }

  _persist() {
    saveCalculatorState(this.kernel, {
      angleMode: this.state.angleMode,
      tape: this._tape,
      vars: this._vars,
      mode: this._mode,
      secondMode: this._secondMode,
      programmerBase: this._programmerBase,
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

  _toggleSecond() {
    this._secondMode = !this._secondMode;
    this._refs.sciSecondToggle.classList.toggle('is-active', this._secondMode);
    relabelSciKeys(this._refs.keyEls, this._secondMode);
    this._persist();
  }

  _setProgrammerBase(base) {
    if (this._programmerBase === base) return;
    this._programmerBase = base;
    this._renderProgrammerMode();
    this._persist();
  }

  _renderProgrammerMode() {
    if (this._mode !== 'programmer') return;
    renderBasePanel(this._refs.baseRefs, this.state.current, this._programmerBase);
  }

  _renderDateMode() {
    if (this._mode !== 'date') return;
    renderDateMode(this._refs, {
      today: formatDateLabel(new Date()),
      sign: this._dateSign,
      delta: this._dateDelta,
      resultLabel: this._dateResultLabel,
    });
  }

  async _defineVar() {
    const r = await promptDefineVar({ kernel: this.kernel, defaultValue: this.state.current });
    if (!r) return;
    this._vars[r.name] = r.value;
    this._appendTape(r.tapeEntry);
    this._persist();
    this._renderVars();
    this._renderTape();
    this.kernel.emit('toast', { message: `${r.name} stored`, type: 'success' });
  }

  _useVar(name) {
    const v = this._vars[name];
    if (!Number.isFinite(v)) return;
    this.state.current = normalizeNumber(v);
    this.state.resetNext = true;
    this._renderDisplay();
    this.kernel.emit('toast', { message: `${name} = ${this.state.current}`, type: 'info' });
  }

  _deleteVar(name) {
    if (!(name in this._vars)) return;
    delete this._vars[name];
    this._persist();
    this._renderVars();
    this.kernel.emit('toast', { message: `${name} deleted`, type: 'info' });
  }

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
    this.state.current = v.startsWith('-') ? v.slice(1) : `-${v}`;
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
    // Constants (pi, e) ignore the operand
    if (funcId === 'pi' || funcId === 'e') {
      this.state.current = normalizeNumber(fn());
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
    if (this._mode === 'programmer') this._renderProgrammerMode();
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
