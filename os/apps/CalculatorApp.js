import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

export class CalculatorApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Calculator', id: 'calculator', icon: '🔢' };
        this.state = {
            current: '0',
            previous: null,
            operator: null,
            resetNext: false,
            memory: 0,
            angleMode: 'rad',
            secondMode: false,
        };
        this._onViewportChange = null;
    }

    async init() {
        this.root = el('div', { class: 'app-window app-calculator' });
        this.root.appendChild(this.buildLayout());
        this.updateDisplay();
        this._bindViewportTracking();
        this.syncViewportInsets();
    }

    buildLayout() {
        this.shell = el('div', { class: 'calc-shell' });

        this.display = el('div', { class: 'calc-display' }, [
            this.expressionText = el('div', { class: 'calc-expression' }, ''),
            this.displayText = el('div', { class: 'calc-display-text' }, '0'),
        ]);

        this.keypad = el('div', { class: 'calc-keypad' });

        const keys = this.getKeys();
        keys.forEach((row) => {
            const rowEl = el('div', { class: 'calc-row' });
            row.forEach((key) => {
                const btn = el('button', {
                    class: `calc-btn calc-btn-${key.type} ${key.wide ? 'calc-btn-wide' : ''}`,
                    type: 'button',
                    'data-action': key.action,
                    'data-value': key.value,
                    onclick: () => this.handleInput(key),
                }, key.label);
                rowEl.appendChild(btn);
            });
            this.keypad.appendChild(rowEl);
        });

        this.shell.appendChild(this.display);
        this.shell.appendChild(this.keypad);
        return this.shell;
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
        const layoutHeight = Math.round(window.innerHeight || document.documentElement.clientHeight || 0);
        const viewportHeight = Math.round(vv?.height ?? layoutHeight);
        const offsetTop = Math.max(0, Math.round(vv?.offsetTop ?? 0));
        // Only compensate browser UI obstruction; do not include content overflow,
        // otherwise padding can grow recursively and clip the keypad further.
        const obstruction = Math.max(0, Math.round(layoutHeight - viewportHeight - offsetTop));
        this.root.style.setProperty('--calc-bottom-obstruction', `${obstruction}px`);
    }

    getKeys() {
        return [
            [
                { label: '(', action: 'sci', value: '(', type: 'sci' },
                { label: ')', action: 'sci', value: ')', type: 'sci' },
                { label: 'mc', action: 'mem', value: 'mc', type: 'sci' },
                { label: 'm+', action: 'mem', value: 'm+', type: 'sci' },
                { label: 'm-', action: 'mem', value: 'm-', type: 'sci' },
                { label: 'mr', action: 'mem', value: 'mr', type: 'sci' },
                { label: 'AC', action: 'clear', type: 'special' },
                { label: '+/-', action: 'negate', type: 'special' },
                { label: '%', action: 'percent', type: 'special' },
                { label: '÷', action: 'op', value: '/', type: 'op' },
            ],
            [
                { label: '2nd', action: 'sci', value: '2nd', type: 'sci' },
                { label: 'x²', action: 'sci', value: 'pow2', type: 'sci' },
                { label: 'x³', action: 'sci', value: 'pow3', type: 'sci' },
                { label: 'xʸ', action: 'sci', value: 'powy', type: 'sci' },
                { label: 'eˣ', action: 'sci', value: 'exp', type: 'sci' },
                { label: '10ˣ', action: 'sci', value: '10x', type: 'sci' },
                { label: '7', action: 'num', value: '7', type: 'num' },
                { label: '8', action: 'num', value: '8', type: 'num' },
                { label: '9', action: 'num', value: '9', type: 'num' },
                { label: '×', action: 'op', value: '*', type: 'op' },
            ],
            [
                { label: '1/x', action: 'sci', value: 'inv', type: 'sci' },
                { label: '²√x', action: 'sci', value: 'sqrt', type: 'sci' },
                { label: '³√x', action: 'sci', value: 'cbrt', type: 'sci' },
                { label: 'ʸ√x', action: 'sci', value: 'yroot', type: 'sci' },
                { label: 'ln', action: 'sci', value: 'ln', type: 'sci' },
                { label: 'log₁₀', action: 'sci', value: 'log', type: 'sci' },
                { label: '4', action: 'num', value: '4', type: 'num' },
                { label: '5', action: 'num', value: '5', type: 'num' },
                { label: '6', action: 'num', value: '6', type: 'num' },
                { label: '−', action: 'op', value: '-', type: 'op' },
            ],
            [
                { label: 'x!', action: 'sci', value: 'fact', type: 'sci' },
                { label: 'sin', action: 'sci', value: 'sin', type: 'sci' },
                { label: 'cos', action: 'sci', value: 'cos', type: 'sci' },
                { label: 'tan', action: 'sci', value: 'tan', type: 'sci' },
                { label: 'e', action: 'sci', value: 'e', type: 'sci' },
                { label: 'EE', action: 'sci', value: 'ee', type: 'sci' },
                { label: '1', action: 'num', value: '1', type: 'num' },
                { label: '2', action: 'num', value: '2', type: 'num' },
                { label: '3', action: 'num', value: '3', type: 'num' },
                { label: '+', action: 'op', value: '+', type: 'op' },
            ],
            [
                { label: 'Rad', action: 'sci', value: 'rad', type: 'sci' },
                { label: 'sinh', action: 'sci', value: 'sinh', type: 'sci' },
                { label: 'cosh', action: 'sci', value: 'cosh', type: 'sci' },
                { label: 'tanh', action: 'sci', value: 'tanh', type: 'sci' },
                { label: 'π', action: 'sci', value: 'pi', type: 'sci' },
                { label: 'Rand', action: 'sci', value: 'rand', type: 'sci' },
                { label: '0', action: 'num', value: '0', type: 'num', wide: true },
                { label: '.', action: 'dot', value: '.', type: 'num' },
                { label: '=', action: 'eval', value: '=', type: 'op' },
            ],
        ];
    }

    handleInput(key) {
        if (this.state.current === 'Error' && key.action !== 'clear') {
            this.clear();
        }

        if (key.action === 'num') this.appendNumber(key.value);
        if (key.action === 'dot') this.appendDot();
        if (key.action === 'op') this.setOperator(key.value);
        if (key.action === 'eval') this.calculate();
        if (key.action === 'clear') this.clear();
        if (key.action === 'negate') this.negate();
        if (key.action === 'percent') this.percent();
        if (key.action === 'sci') this.handleScientific(key.value);
        if (key.action === 'mem') this.handleMemory(key.value);
    }

    appendNumber(num) {
        if (this.state.resetNext) {
            this.state.current = '0';
            this.state.resetNext = false;
        }

        if (this.state.current === '0') {
            this.state.current = num;
        } else {
            if (this.state.current.length >= 20) return;
            this.state.current += num;
        }
        this.updateDisplay();
    }

    appendDot() {
        if (this.state.resetNext) {
            this.state.current = '0';
            this.state.resetNext = false;
        }

        if (this.state.current.includes('e')) return;
        if (this.state.current.includes('.')) return;
        this.state.current += '.';
        this.updateDisplay();
    }

    appendExponentMarker() {
        if (this.state.resetNext) {
            this.state.current = '1';
            this.state.resetNext = false;
        }

        if (this.state.current.toLowerCase().includes('e')) return;
        this.state.current += 'e';
        this.updateDisplay();
    }

    setOperator(op) {
        if (this.state.current === '' || this.state.current === 'Error') return;

        if (this.state.previous !== null && !this.state.resetNext) {
            this.calculate();
        }

        this.state.previous = this.state.current;
        this.state.operator = op;
        this.state.resetNext = true;
        this.state.secondMode = false;
        this.updateDisplay();
    }

    calculate() {
        if (!this.state.operator || this.state.previous === null) return;

        const prev = Number(this.state.previous);
        const curr = Number(this.state.current);

        if (!Number.isFinite(prev) || !Number.isFinite(curr)) {
            this.setError();
            return;
        }

        let result = 0;
        switch (this.state.operator) {
            case '+':
                result = prev + curr;
                break;
            case '-':
                result = prev - curr;
                break;
            case '*':
                result = prev * curr;
                break;
            case '/':
                if (curr === 0) {
                    this.setError();
                    return;
                }
                result = prev / curr;
                break;
            case '^':
                result = Math.pow(prev, curr);
                break;
            case 'yroot':
                if (curr === 0) {
                    this.setError();
                    return;
                }
                result = Math.pow(prev, 1 / curr);
                break;
            default:
                result = curr;
        }

        if (!Number.isFinite(result)) {
            this.setError();
            return;
        }

        this.state.current = this.normalizeNumber(result);
        this.state.previous = null;
        this.state.operator = null;
        this.state.resetNext = true;
        this.state.secondMode = false;
        this.updateDisplay();
    }

    clear() {
        this.state.current = '0';
        this.state.previous = null;
        this.state.operator = null;
        this.state.resetNext = false;
        this.state.secondMode = false;
        this.updateDisplay();
    }

    negate() {
        if (this.state.current === '0' || this.state.current === 'Error') return;

        const v = this.state.current;
        if (v.toLowerCase().includes('e')) {
            const [mantissa, exponent = ''] = v.split(/e/i);
            if (exponent.startsWith('-')) {
                this.state.current = `${mantissa}e${exponent.slice(1)}`;
            } else if (exponent.startsWith('+')) {
                this.state.current = `${mantissa}e-${exponent.slice(1)}`;
            } else if (exponent.length > 0) {
                this.state.current = `${mantissa}e-${exponent}`;
            } else {
                this.state.current = `${mantissa}e-`;
            }
        } else {
            this.state.current = v.startsWith('-') ? v.slice(1) : `-${v}`;
        }

        this.updateDisplay();
    }

    percent() {
        const curr = Number(this.state.current);
        if (!Number.isFinite(curr)) {
            this.setError();
            return;
        }
        this.state.current = this.normalizeNumber(curr / 100);
        this.state.resetNext = true;
        this.updateDisplay();
    }

    factorial(n) {
        if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
        let result = 1;
        for (let i = 2; i <= n; i += 1) result *= i;
        return result;
    }

    toRadians(v) {
        return this.state.angleMode === 'deg' ? (v * Math.PI) / 180 : v;
    }

    fromRadians(v) {
        return this.state.angleMode === 'deg' ? (v * 180) / Math.PI : v;
    }

    handleScientific(func) {
        if (func === '(' || func === ')') {
            return;
        }

        if (func === '2nd') {
            this.state.secondMode = !this.state.secondMode;
            this.root.classList.toggle('calc-second-mode', this.state.secondMode);
            return;
        }

        if (func === 'rad') {
            this.state.angleMode = this.state.angleMode === 'rad' ? 'deg' : 'rad';
            return;
        }

        if (func === 'ee') {
            this.appendExponentMarker();
            return;
        }

        if (func === 'powy') {
            this.setOperator('^');
            return;
        }

        if (func === 'yroot') {
            this.setOperator('yroot');
            return;
        }

        const curr = Number(this.state.current);
        if (!Number.isFinite(curr)) {
            this.setError();
            return;
        }

        let res = curr;

        switch (func) {
            case 'pow2':
                res = this.state.secondMode ? Math.sqrt(curr) : Math.pow(curr, 2);
                break;
            case 'pow3':
                res = this.state.secondMode ? Math.cbrt(curr) : Math.pow(curr, 3);
                break;
            case 'exp':
                res = this.state.secondMode ? Math.log(curr) : Math.exp(curr);
                break;
            case '10x':
                res = this.state.secondMode ? Math.log10(curr) : Math.pow(10, curr);
                break;
            case 'inv':
                res = curr === 0 ? NaN : 1 / curr;
                break;
            case 'sqrt':
                res = Math.sqrt(curr);
                break;
            case 'cbrt':
                res = Math.cbrt(curr);
                break;
            case 'ln':
                res = this.state.secondMode ? Math.exp(curr) : Math.log(curr);
                break;
            case 'log':
                res = this.state.secondMode ? Math.pow(10, curr) : Math.log10(curr);
                break;
            case 'fact':
                res = this.factorial(curr);
                break;
            case 'sin':
                res = this.state.secondMode ? this.fromRadians(Math.asin(curr)) : Math.sin(this.toRadians(curr));
                break;
            case 'cos':
                res = this.state.secondMode ? this.fromRadians(Math.acos(curr)) : Math.cos(this.toRadians(curr));
                break;
            case 'tan':
                res = this.state.secondMode ? this.fromRadians(Math.atan(curr)) : Math.tan(this.toRadians(curr));
                break;
            case 'sinh':
                res = this.state.secondMode ? Math.asinh(curr) : Math.sinh(curr);
                break;
            case 'cosh':
                res = this.state.secondMode ? Math.acosh(curr) : Math.cosh(curr);
                break;
            case 'tanh':
                res = this.state.secondMode ? Math.atanh(curr) : Math.tanh(curr);
                break;
            case 'pi':
                res = Math.PI;
                break;
            case 'e':
                res = Math.E;
                break;
            case 'rand':
                res = Math.random();
                break;
            default:
                return;
        }

        if (!Number.isFinite(res)) {
            this.setError();
            return;
        }

        this.state.current = this.normalizeNumber(res);
        this.state.resetNext = true;
        this.state.secondMode = false;
        this.root.classList.remove('calc-second-mode');
        this.updateDisplay();
    }

    handleMemory(action) {
        const curr = Number(this.state.current);
        switch (action) {
            case 'mc':
                this.state.memory = 0;
                break;
            case 'm+':
                if (Number.isFinite(curr)) this.state.memory += curr;
                break;
            case 'm-':
                if (Number.isFinite(curr)) this.state.memory -= curr;
                break;
            case 'mr':
                this.state.current = this.normalizeNumber(this.state.memory);
                this.state.resetNext = true;
                this.updateDisplay();
                break;
            default:
                break;
        }
    }

    normalizeNumber(value) {
        if (!Number.isFinite(value)) return 'Error';
        const safe = Math.abs(value) < 1e-12 ? 0 : value;
        if (Math.abs(safe) >= 1e12 || (Math.abs(safe) > 0 && Math.abs(safe) < 1e-9)) {
            return Number(safe).toExponential(8).replace(/\+/, '');
        }
        const rounded = Number.parseFloat(Number(safe).toFixed(12));
        return String(rounded);
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

    _opSymbol(op) {
        const map = { '+': '+', '-': '\u2212', '*': '\u00D7', '/': '\u00F7', '^': '^', 'yroot': '\u02B8\u221A' };
        return map[op] || op || '';
    }

    updateDisplay() {
        let val = this.state.current;
        if (val !== 'Error' && val.length > 16) {
            const num = Number(val);
            if (Number.isFinite(num)) {
                val = num.toExponential(8).replace(/\+/, '');
            }
        }
        this.displayText.textContent = val;
        this.displayText.title = val;

        if (this.expressionText) {
            if (this.state.previous !== null && this.state.operator) {
                this.expressionText.textContent = `${this.state.previous} ${this._opSymbol(this.state.operator)}`;
            } else {
                this.expressionText.textContent = '';
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
        super.destroy();
    }
}
