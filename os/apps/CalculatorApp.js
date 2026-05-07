/**
 * CalculatorApp — "Tape" cosmic redesign (DOM rebuild).
 *
 * Two-column layout: hex keypad on the left, live tape on the right.
 * Every successful calculation appends a tape line {ts, expr, result}
 * which persists across sessions. Replaces the old popup history.
 *
 * View    in os/apps/calculator/view.js (DOM builders + constants).
 * Tape IO in os/apps/calculator/tape.js (clipboard, csv, save-to-Notes).
 *
 * Storage:
 *   • Canonical key  yancotab_calculator_v2  ({angleMode, tape})
 *   • One-shot migration from yancotab_calculator.history
 */
import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import {
  buildView, renderTapeLines,
  SCI_UNARY, MODE_DEFS, TAB_DEFS, fmtOp,
} from './calculator/view.js';
import {
  copyTape, exportTapeCsv, saveTapeToNotes,
} from './calculator/tape.js';

const STORAGE_KEY = 'yancotab_calculator_v2';
const LEGACY_KEY  = 'yancotab_calculator';
const MAX_TAPE = 50;

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
    this._mode = 'standard';
    this._activeTab = 'tape';
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
        dispatch: (action, value) => this._dispatch(action, value),
        setTab:   (id) => this._setActiveTab(id),
        setMode:  (id, soon) => this._setMode(id, soon),
        saveToNotes: () => saveTapeToNotes(this._tape, this.kernel),
        copyAll:     () => copyTape(this._tape, this.kernel),
        exportCsv:   () => exportTapeCsv(this._tape, this.kernel),
        clearTape:   () => this._clearTape(),
      },
    });
    this._refs = refs;
    this.root.appendChild(frame);
    this._renderAll();
    this._bindKeyboard();
  }

  // ─── Persistence ────────────────────────────────────────────

  _loadPersisted() {
    const saved = this.kernel.storage?.load(STORAGE_KEY);
    if (saved && typeof saved === 'object') {
      if (saved.angleMode === 'deg' || saved.angleMode === 'rad') this.state.angleMode = saved.angleMode;
      if (Array.isArray(saved.tape)) this._tape = saved.tape.slice(0, MAX_TAPE);
      return;
    }
    // One-shot legacy migration from {angleMode, history:[{expression, result}]}
    const legacy = this.kernel.storage?.load(LEGACY_KEY);
    if (legacy && typeof legacy === 'object') {
      if (legacy.angleMode === 'deg' || legacy.angleMode === 'rad') this.state.angleMode = legacy.angleMode;
      if (Array.isArray(legacy.history)) {
        this._tape = legacy.history.map((h) => ({
          ts: 0,
          expr: String(h?.expression ?? ''),
          result: String(h?.result ?? ''),
        })).filter((t) => t.expr && t.result).slice(0, MAX_TAPE);
      }
      this._persist();
    }
  }

  _persist() {
    this.kernel.storage?.save(STORAGE_KEY, {
      angleMode: this.state.angleMode,
      tape: this._tape.slice(0, MAX_TAPE),
    });
  }

  // ─── Tab + mode UI ──────────────────────────────────────────

  _setActiveTab(id) {
    if (this._activeTab === id) return;
    this._activeTab = id;
    for (const [tid, elx] of Object.entries(this._refs.tabEls)) {
      elx.classList.toggle('is-active', tid === id);
    }
    if (id === 'history' || id === 'notes') {
      const label = TAB_DEFS.find((t) => t.id === id).label;
      this.kernel.emit('toast', { message: `${label} view coming soon`, type: 'info' });
      setTimeout(() => this._setActiveTab('tape'), 800);
    }
  }

  _setMode(id, soon) {
    if (soon) {
      const label = MODE_DEFS.find((m) => m.id === id).label;
      this.kernel.emit('toast', { message: `${label} mode coming soon`, type: 'info' });
      return;
    }
    if (this._mode === id) return;
    this._mode = id;
    for (const [mid, elx] of Object.entries(this._refs.modeEls)) {
      elx.classList.toggle('is-active', mid === id);
    }
  }

  // ─── Keyboard ───────────────────────────────────────────────

  _bindKeyboard() {
    this._onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key;
      if (k >= '0' && k <= '9') { this.appendNumber(k); e.preventDefault(); }
      else if (k === '.') { this.appendDot(); e.preventDefault(); }
      else if (k === '+') { this.setOperator('+'); e.preventDefault(); }
      else if (k === '-') { this.setOperator('-'); e.preventDefault(); }
      else if (k === '*') { this.setOperator('*'); e.preventDefault(); }
      else if (k === '/') { this.setOperator('/'); e.preventDefault(); }
      else if (k === 'Enter' || k === '=') { this.calculate(); e.preventDefault(); }
      else if (k === 'Escape') { this.clear(); e.preventDefault(); }
      else if (k === 'Backspace') { this._backspace(); e.preventDefault(); }
      else if (k === '(') { this._openParen(); e.preventDefault(); }
      else if (k === ')') { this._closeParen(); e.preventDefault(); }
    };
    this.root.addEventListener('keydown', this._onKeyDown);
  }

  _backspace() {
    if (this.state.resetNext || this.state.current === 'Error') return;
    this.state.current = this.state.current.length > 1 ? this.state.current.slice(0, -1) : '0';
    this._renderDisplay();
  }

  // ─── Input dispatch ─────────────────────────────────────────

  _dispatch(action, value) {
    if (this.state.current === 'Error' && action !== 'clear') this.clear();
    switch (action) {
      case 'num':     this.appendNumber(value); break;
      case 'dot':     this.appendDot(); break;
      case 'op':      this.setOperator(value); break;
      case 'eval':    this.calculate(); break;
      case 'clear':   this.clear(); break;
      case 'negate':  this.negate(); break;
      case 'percent': this.percent(); break;
      case 'paren':   value === '(' ? this._openParen() : this._closeParen(); break;
      case 'sci':     this.handleScientific(value); break;
      case 'mem':     this.handleMemory(value); break;
    }
  }

  appendNumber(num) {
    if (this.state.resetNext) { this.state.current = '0'; this.state.resetNext = false; }
    if (this.state.current === '0') this.state.current = num;
    else if (this.state.current.length < 20) this.state.current += num;
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
    if (!Number.isFinite(prev) || !Number.isFinite(curr)) { this.setError(); return; }
    const expr = `${this.state.previous} ${fmtOp(this.state.operator)} ${this.state.current}`;
    let result;
    switch (this.state.operator) {
      case '+': result = prev + curr; break;
      case '-': result = prev - curr; break;
      case '*': result = prev * curr; break;
      case '/': if (curr === 0) { this.setError(); return; } result = prev / curr; break;
      default:  result = curr;
    }
    if (!Number.isFinite(result)) { this.setError(); return; }
    this.state.current = this.normalizeNumber(result);
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
    this.state.current = this.normalizeNumber(curr / 100);
    this.state.resetNext = true;
    this._renderDisplay();
  }

  toRadians(v) { return this.state.angleMode === 'deg' ? (v * Math.PI) / 180 : v; }

  // ─── Parens + scientific ────────────────────────────────────

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
      if (Number.isFinite(prev) && Number.isFinite(curr)) {
        let r = curr;
        switch (this.state.operator) {
          case '+': r = prev + curr; break;
          case '-': r = prev - curr; break;
          case '*': r = prev * curr; break;
          case '/': r = curr === 0 ? NaN : prev / curr; break;
        }
        if (!Number.isFinite(r)) { this.setError(); return; }
        this.state.current = this.normalizeNumber(r);
      }
    }
    const sub = this.state.current;
    const ctx = this._parenStack.pop();
    this.state.previous = ctx.previous;
    this.state.operator = ctx.operator;
    this.state.current = sub;
    this.state.resetNext = true;
    this._renderDisplay();
  }

  handleScientific(func) {
    const fn = SCI_UNARY[func];
    if (!fn) return;
    const curr = Number(this.state.current);
    if (!Number.isFinite(curr)) { this.setError(); return; }
    const res = fn(curr, this);
    if (!Number.isFinite(res)) { this.setError(); return; }
    this.state.current = this.normalizeNumber(res);
    this.state.resetNext = true;
    this._renderDisplay();
  }

  handleMemory(action) {
    const curr = Number(this.state.current);
    if (action === 'mc') this.state.memory = 0;
    else if (action === 'm+' && Number.isFinite(curr)) this.state.memory += curr;
    else if (action === 'm-' && Number.isFinite(curr)) this.state.memory -= curr;
    else if (action === 'mr') {
      this.state.current = this.normalizeNumber(this.state.memory);
      this.state.resetNext = true;
      this._renderDisplay();
    }
  }

  // ─── Number formatting + error ──────────────────────────────

  normalizeNumber(value) {
    if (!Number.isFinite(value)) return 'Error';
    const safe = Math.abs(value) < 1e-12 ? 0 : value;
    if (Math.abs(safe) >= 1e12 || (Math.abs(safe) > 0 && Math.abs(safe) < 1e-9)) {
      return Number(safe).toExponential(8).replace(/\+/, '');
    }
    return String(Number.parseFloat(Number(safe).toFixed(12)));
  }

  setError() {
    this.state.current = 'Error';
    this.state.previous = null;
    this.state.operator = null;
    this.state.resetNext = true;
    this._renderDisplay();
  }

  // ─── Tape ───────────────────────────────────────────────────

  _appendTape(entry) {
    this._tape.push(entry);
    if (this._tape.length > MAX_TAPE) this._tape.splice(0, this._tape.length - MAX_TAPE);
    this._persist();
  }

  _clearTape() {
    if (this._tape.length === 0) return;
    this._tape = [];
    this._persist();
    this._renderTape();
    this.kernel.emit('toast', { message: 'Tape cleared', type: 'info' });
  }

  _reuseResult(result) {
    if (!result || result === 'Error') return;
    this.state.current = result;
    this.state.resetNext = true;
    this._renderDisplay();
  }

  // ─── Rendering ──────────────────────────────────────────────

  _renderAll() {
    this._renderDisplay();
    this._renderTape();
  }

  _renderDisplay() {
    const { exprEl, resultEl, metaEl } = this._refs;
    const val = this.state.current;
    resultEl.textContent = val;
    resultEl.title = val;

    const depth = this._parenStack.length;
    const prefix = depth > 0 ? '( '.repeat(depth) : '';
    if (this.state.previous !== null && this.state.operator) {
      exprEl.textContent = `${prefix}${this.state.previous} ${fmtOp(this.state.operator)}`;
    } else {
      exprEl.textContent = depth > 0 ? prefix.trimEnd() : '';
    }

    metaEl.textContent = '';
    metaEl.append(
      'precision ', el('b', {}, '12'),
      ' · base ', el('b', {}, '10'),
      ' · ', el('b', {}, this.state.angleMode.toUpperCase()),
    );
  }

  _renderTape() {
    const { tapeEl, tapeCountEl } = this._refs;
    const count = this._tape.length;
    tapeCountEl.textContent = count === 0 ? 'empty' : `${count} line${count === 1 ? '' : 's'}`;
    renderTapeLines(tapeEl, this._tape, (r) => this._reuseResult(r));
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
