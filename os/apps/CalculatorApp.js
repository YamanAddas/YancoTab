import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

const STORAGE_KEY = 'yancotab_calculator';
const MAX_HISTORY = 20;

// Compact key definitions: [label, action, value, type, wide?]
const KEY_ROWS = [
    [['(','sci','(','sci'],[')', 'sci',')','sci'],['mc','mem','mc','sci'],['m+','mem','m+','sci'],['m-','mem','m-','sci'],['mr','mem','mr','sci'],['AC','clear',,'special'],['+/-','negate',,'special'],['%','percent',,'special'],['÷','op','/','op']],
    [['2nd','sci','2nd','sci'],['x²','sci','pow2','sci'],['x³','sci','pow3','sci'],['xʸ','sci','powy','sci'],['eˣ','sci','exp','sci'],['10ˣ','sci','10x','sci'],['7','num','7','num'],['8','num','8','num'],['9','num','9','num'],['×','op','*','op']],
    [['1/x','sci','inv','sci'],['²√x','sci','sqrt','sci'],['³√x','sci','cbrt','sci'],['ʸ√x','sci','yroot','sci'],['ln','sci','ln','sci'],['log₁₀','sci','log','sci'],['4','num','4','num'],['5','num','5','num'],['6','num','6','num'],['−','op','-','op']],
    [['x!','sci','fact','sci'],['sin','sci','sin','sci'],['cos','sci','cos','sci'],['tan','sci','tan','sci'],['e','sci','e','sci'],['EE','sci','ee','sci'],['1','num','1','num'],['2','num','2','num'],['3','num','3','num'],['+','op','+','op']],
    [['Rad','sci','rad','sci'],['sinh','sci','sinh','sci'],['cosh','sci','cosh','sci'],['tanh','sci','tanh','sci'],['π','sci','pi','sci'],['Rand','sci','rand','sci'],['0','num','0','num',1],['.','dot','.','num'],['=','eval','=','op']],
];

// Unary scientific function lookup: func → (curr, secondMode, ctx) => result
const SCI_UNARY = {
    pow2:  (v, s2) => s2 ? Math.sqrt(v) : v * v,
    pow3:  (v, s2) => s2 ? Math.cbrt(v) : v * v * v,
    exp:   (v, s2) => s2 ? Math.log(v) : Math.exp(v),
    '10x': (v, s2) => s2 ? Math.log10(v) : Math.pow(10, v),
    inv:   (v) => v === 0 ? NaN : 1 / v,
    sqrt:  (v) => Math.sqrt(v),
    cbrt:  (v) => Math.cbrt(v),
    ln:    (v, s2) => s2 ? Math.exp(v) : Math.log(v),
    log:   (v, s2) => s2 ? Math.pow(10, v) : Math.log10(v),
    fact:  (v, _, ctx) => ctx.factorial(v),
    sin:   (v, s2, ctx) => s2 ? ctx.fromRadians(Math.asin(v)) : Math.sin(ctx.toRadians(v)),
    cos:   (v, s2, ctx) => s2 ? ctx.fromRadians(Math.acos(v)) : Math.cos(ctx.toRadians(v)),
    tan:   (v, s2, ctx) => s2 ? ctx.fromRadians(Math.atan(v)) : Math.tan(ctx.toRadians(v)),
    sinh:  (v, s2) => s2 ? Math.asinh(v) : Math.sinh(v),
    cosh:  (v, s2) => s2 ? Math.acosh(v) : Math.cosh(v),
    tanh:  (v, s2) => s2 ? Math.atanh(v) : Math.tanh(v),
    pi:    () => Math.PI,
    e:     () => Math.E,
    rand:  () => Math.random(),
};

const OP_SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^', yroot: 'ʸ√' };

export class CalculatorApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Calculator', id: 'calculator', icon: '🔢' };
        this._resetState();
        this._parenStack = [];
        this._history = [];
        this._historyOpen = false;
        this._onViewportChange = null;
        this._onKeyDown = null;
    }

    _resetState() {
        this.state = { current: '0', previous: null, operator: null, resetNext: false, memory: 0, angleMode: 'rad', secondMode: false };
    }

    async init() {
        this._loadPersisted();
        this.root = el('div', { class: 'app-window app-calculator', tabindex: '0' });
        this.root.appendChild(this._buildLayout());
        this.updateDisplay();
        this._bindViewportTracking();
        this.syncViewportInsets();
        this._bindKeyboard();
    }

    _loadPersisted() {
        const saved = this.kernel.storage?.load(STORAGE_KEY);
        if (saved && typeof saved === 'object') {
            if (saved.angleMode === 'deg' || saved.angleMode === 'rad') this.state.angleMode = saved.angleMode;
            if (Array.isArray(saved.history)) this._history = saved.history.slice(0, MAX_HISTORY);
        }
    }

    _persist() {
        this.kernel.storage?.save(STORAGE_KEY, { angleMode: this.state.angleMode, history: this._history });
    }

    _buildLayout() {
        this.shell = el('div', { class: 'calc-shell' });
        const copyBtn = el('button', { class: 'calc-copy-btn', type: 'button', title: 'Copy result', onclick: () => this._copyResult() }, '\u{1F4CB}');
        const histBtn = el('button', { class: 'calc-hist-btn', type: 'button', title: 'History', onclick: () => this._toggleHistory() }, '\u{1F552}');
        this.display = el('div', { class: 'calc-display' }, [
            el('div', { class: 'calc-display-actions' }, [copyBtn, histBtn]),
            this.expressionText = el('div', { class: 'calc-expression' }, ''),
            this.displayText = el('div', { class: 'calc-display-text' }, '0'),
        ]);
        this.historyPanel = el('div', { class: 'calc-history-panel' });
        this.historyPanel.style.display = 'none';
        this.keypad = el('div', { class: 'calc-keypad' });
        for (const row of KEY_ROWS) {
            const rowEl = el('div', { class: 'calc-row' });
            for (const [label, action, value, type, wide] of row) {
                const key = { label, action, value, type, wide };
                rowEl.appendChild(el('button', {
                    class: `calc-btn calc-btn-${type}${wide ? ' calc-btn-wide' : ''}`,
                    type: 'button', 'data-action': action, 'data-value': value || '',
                    onclick: () => this.handleInput(key),
                }, label));
            }
            this.keypad.appendChild(rowEl);
        }
        this.shell.append(this.display, this.historyPanel, this.keypad);
        return this.shell;
    }

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
            else if (k === '(') { this.handleScientific('('); e.preventDefault(); }
            else if (k === ')') { this.handleScientific(')'); e.preventDefault(); }
        };
        this.root.addEventListener('keydown', this._onKeyDown);
    }

    _backspace() {
        if (this.state.resetNext || this.state.current === 'Error') return;
        this.state.current = this.state.current.length > 1 ? this.state.current.slice(0, -1) : '0';
        this.updateDisplay();
    }

    _copyResult() {
        const text = this.state.current;
        navigator.clipboard.writeText(text).then(() => {
            this.kernel.emit('toast', { message: 'Copied!', type: 'success' });
        }).catch(() => {
            this.kernel.emit('toast', { message: 'Copy failed', type: 'error' });
        });
    }

    _toggleHistory() {
        this._historyOpen = !this._historyOpen;
        this.historyPanel.style.display = this._historyOpen ? 'block' : 'none';
        if (this._historyOpen) this._renderHistory();
    }

    _renderHistory() {
        this.historyPanel.textContent = '';
        if (this._history.length === 0) {
            this.historyPanel.appendChild(el('div', { class: 'calc-history-empty' }, 'No history yet'));
            return;
        }
        for (let i = this._history.length - 1; i >= 0; i--) {
            const h = this._history[i];
            const item = el('div', { class: 'calc-history-item', onclick: () => {
                this.state.current = h.result;
                this.state.resetNext = true;
                this.updateDisplay();
            } }, [
                el('div', { class: 'calc-history-expr' }, h.expression),
                el('div', { class: 'calc-history-result' }, `= ${h.result}`),
            ]);
            this.historyPanel.appendChild(item);
        }
    }

    _bindViewportTracking() {
        this._onViewportChange = () => this.syncViewportInsets();
        const vv = window.visualViewport;
        vv?.addEventListener('resize', this._onViewportChange);
        vv?.addEventListener('scroll', this._onViewportChange);
        window.addEventListener('resize', this._onViewportChange);
        window.addEventListener('orientationchange', this._onViewportChange);
    }

    syncViewportInsets() {
        const vv = window.visualViewport;
        const lh = Math.round(window.innerHeight || document.documentElement.clientHeight || 0);
        const vh = Math.round(vv?.height ?? lh);
        const ot = Math.max(0, Math.round(vv?.offsetTop ?? 0));
        const obs = Math.max(0, Math.round(lh - vh - ot));
        this.root.style.setProperty('--calc-bottom-obstruction', `${obs}px`);
    }

    handleInput(key) {
        if (this.state.current === 'Error' && key.action !== 'clear') this.clear();
        const dispatch = {
            num: () => this.appendNumber(key.value),
            dot: () => this.appendDot(),
            op: () => this.setOperator(key.value),
            eval: () => this.calculate(),
            clear: () => this.clear(),
            negate: () => this.negate(),
            percent: () => this.percent(),
            sci: () => this.handleScientific(key.value),
            mem: () => this.handleMemory(key.value),
        };
        dispatch[key.action]?.();
    }

    appendNumber(num) {
        if (this.state.resetNext) { this.state.current = '0'; this.state.resetNext = false; }
        if (this.state.current === '0') this.state.current = num;
        else if (this.state.current.length < 20) this.state.current += num;
        this.updateDisplay();
    }

    appendDot() {
        if (this.state.resetNext) { this.state.current = '0'; this.state.resetNext = false; }
        if (this.state.current.includes('e') || this.state.current.includes('.')) return;
        this.state.current += '.';
        this.updateDisplay();
    }

    appendExponentMarker() {
        if (this.state.resetNext) { this.state.current = '1'; this.state.resetNext = false; }
        if (this.state.current.toLowerCase().includes('e')) return;
        this.state.current += 'e';
        this.updateDisplay();
    }

    setOperator(op) {
        if (this.state.current === '' || this.state.current === 'Error') return;
        if (this.state.previous !== null && !this.state.resetNext) this.calculate();
        this.state.previous = this.state.current;
        this.state.operator = op;
        this.state.resetNext = true;
        this.state.secondMode = false;
        this.updateDisplay();
    }

    calculate() {
        if (!this.state.operator || this.state.previous === null) return;
        const prev = Number(this.state.previous), curr = Number(this.state.current);
        if (!Number.isFinite(prev) || !Number.isFinite(curr)) { this.setError(); return; }
        const expr = `${this.state.previous} ${OP_SYMBOLS[this.state.operator] || this.state.operator} ${this.state.current}`;
        let result;
        switch (this.state.operator) {
            case '+': result = prev + curr; break;
            case '-': result = prev - curr; break;
            case '*': result = prev * curr; break;
            case '/': if (curr === 0) { this.setError(); return; } result = prev / curr; break;
            case '^': result = Math.pow(prev, curr); break;
            case 'yroot': if (curr === 0) { this.setError(); return; } result = Math.pow(prev, 1 / curr); break;
            default: result = curr;
        }
        if (!Number.isFinite(result)) { this.setError(); return; }
        this.state.current = this.normalizeNumber(result);
        this._history.push({ expression: expr, result: this.state.current });
        if (this._history.length > MAX_HISTORY) this._history.shift();
        this.state.previous = null;
        this.state.operator = null;
        this.state.resetNext = true;
        this.state.secondMode = false;
        this._persist();
        if (this._historyOpen) this._renderHistory();
        this.updateDisplay();
    }

    clear() {
        this.state.current = '0';
        this.state.previous = null;
        this.state.operator = null;
        this.state.resetNext = false;
        this.state.secondMode = false;
        this._parenStack = [];
        this.updateDisplay();
    }

    negate() {
        if (this.state.current === '0' || this.state.current === 'Error') return;
        const v = this.state.current;
        if (v.toLowerCase().includes('e')) {
            const [m, exp = ''] = v.split(/e/i);
            if (exp.startsWith('-')) this.state.current = `${m}e${exp.slice(1)}`;
            else if (exp.startsWith('+')) this.state.current = `${m}e-${exp.slice(1)}`;
            else if (exp.length > 0) this.state.current = `${m}e-${exp}`;
            else this.state.current = `${m}e-`;
        } else {
            this.state.current = v.startsWith('-') ? v.slice(1) : `-${v}`;
        }
        this.updateDisplay();
    }

    percent() {
        const curr = Number(this.state.current);
        if (!Number.isFinite(curr)) { this.setError(); return; }
        this.state.current = this.normalizeNumber(curr / 100);
        this.state.resetNext = true;
        this.updateDisplay();
    }

    factorial(n) {
        if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
        let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
    }

    toRadians(v) { return this.state.angleMode === 'deg' ? (v * Math.PI) / 180 : v; }
    fromRadians(v) { return this.state.angleMode === 'deg' ? (v * 180) / Math.PI : v; }

    handleScientific(func) {
        // Parentheses — push/pop calculator context
        if (func === '(') {
            this._parenStack.push({ previous: this.state.previous, operator: this.state.operator, current: this.state.current });
            this.state.previous = null;
            this.state.operator = null;
            this.state.current = '0';
            this.state.resetNext = false;
            this.updateDisplay();
            return;
        }
        if (func === ')') {
            if (this._parenStack.length === 0) return;
            if (this.state.operator && this.state.previous !== null) this.calculate();
            const sub = this.state.current;
            const ctx = this._parenStack.pop();
            this.state.previous = ctx.previous;
            this.state.operator = ctx.operator;
            this.state.current = sub;
            this.state.resetNext = true;
            this.updateDisplay();
            return;
        }
        if (func === '2nd') {
            this.state.secondMode = !this.state.secondMode;
            this.root.classList.toggle('calc-second-mode', this.state.secondMode);
            return;
        }
        if (func === 'rad') {
            this.state.angleMode = this.state.angleMode === 'rad' ? 'deg' : 'rad';
            this._persist();
            return;
        }
        if (func === 'ee') { this.appendExponentMarker(); return; }
        if (func === 'powy') { this.setOperator('^'); return; }
        if (func === 'yroot') { this.setOperator('yroot'); return; }

        const curr = Number(this.state.current);
        if (!Number.isFinite(curr)) { this.setError(); return; }

        const fn = SCI_UNARY[func];
        if (!fn) return;
        const res = fn(curr, this.state.secondMode, this);
        if (!Number.isFinite(res)) { this.setError(); return; }

        this.state.current = this.normalizeNumber(res);
        this.state.resetNext = true;
        this.state.secondMode = false;
        this.root.classList.remove('calc-second-mode');
        this.updateDisplay();
    }

    handleMemory(action) {
        const curr = Number(this.state.current);
        if (action === 'mc') this.state.memory = 0;
        else if (action === 'm+' && Number.isFinite(curr)) this.state.memory += curr;
        else if (action === 'm-' && Number.isFinite(curr)) this.state.memory -= curr;
        else if (action === 'mr') {
            this.state.current = this.normalizeNumber(this.state.memory);
            this.state.resetNext = true;
            this.updateDisplay();
        }
    }

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
        this.state.secondMode = false;
        this.root.classList.remove('calc-second-mode');
        this.updateDisplay();
    }

    updateDisplay() {
        let val = this.state.current;
        if (val !== 'Error' && val.length > 16) {
            const num = Number(val);
            if (Number.isFinite(num)) val = num.toExponential(8).replace(/\+/, '');
        }
        this.displayText.textContent = val;
        this.displayText.title = val;
        if (this.expressionText) {
            const depth = this._parenStack.length;
            let prefix = depth > 0 ? '('.repeat(depth) + ' ' : '';
            if (this.state.previous !== null && this.state.operator) {
                this.expressionText.textContent = `${prefix}${this.state.previous} ${OP_SYMBOLS[this.state.operator] || this.state.operator}`;
            } else {
                this.expressionText.textContent = depth > 0 ? prefix.trim() : '';
            }
        }
        const len = val.length;
        if (len > 12) this.displayText.style.fontSize = 'clamp(28px, 7vw, 36px)';
        else if (len > 9) this.displayText.style.fontSize = 'clamp(34px, 9vw, 48px)';
        else this.displayText.style.fontSize = '';
    }

    destroy() {
        const vv = window.visualViewport;
        if (this._onViewportChange) {
            vv?.removeEventListener('resize', this._onViewportChange);
            vv?.removeEventListener('scroll', this._onViewportChange);
            window.removeEventListener('resize', this._onViewportChange);
            window.removeEventListener('orientationchange', this._onViewportChange);
            this._onViewportChange = null;
        }
        if (this._onKeyDown) {
            this.root.removeEventListener('keydown', this._onKeyDown);
            this._onKeyDown = null;
        }
        super.destroy();
    }
}
