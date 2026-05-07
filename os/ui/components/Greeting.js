/**
 * Greeting.js — Hero block: small mono greet line + giant live clock + day-of-year date.
 *
 * Mirrors the design's "Liquid Glass" hero where the clock is the focal point
 * and the greeting/date are mono-spaced support text.
 *
 * Tick cadence:
 *   • 1s — updates HH:MM·SS in the clock and the greet line (handles the
 *     midnight-rollover and afternoon-to-evening transitions cleanly).
 *   • Re-renders fully when the user changes their name in Settings via the
 *     existing `yancotab:name_changed` event.
 */
import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad(n) { return String(n).padStart(2, '0'); }

function getPartOfDay(hour) {
    if (hour < 5)  return 'Late night';
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Late evening';
}

function getDayOfYear(d) {
    return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}

export class Greeting {
    constructor() {
        this.root = null;
        this.elements = {};
        this._interval = null;
        this._onNameChanged = null;
    }

    render() {
        this.root = el('div', { class: 'greeting-bar' });

        this.elements.greet = el('div', { class: 'greeting-greet' });

        // Clock is flanked by arabesque flourishes — accent-colored
        // ornamental glyphs that frame the time without competing with it.
        this.elements.clock = el('div', { class: 'greeting-clock' });
        const clockWrap = el('div', { class: 'greeting-clock-wrap' }, [
            el('span', { class: 'greeting-flourish greeting-flourish-l', 'aria-hidden': 'true' }, '❧'),
            this.elements.clock,
            el('span', { class: 'greeting-flourish greeting-flourish-r', 'aria-hidden': 'true' }, '❧'),
        ]);

        this.elements.date = el('div', { class: 'greeting-date' });

        this.root.append(this.elements.greet, clockWrap, this.elements.date);

        this._tick();
        this._interval = setInterval(() => this._tick(), 1000);

        this._onNameChanged = () => this._tick();
        window.addEventListener('yancotab:name_changed', this._onNameChanged);

        return this.root;
    }

    _tick() {
        if (!this.root) return;

        const d = new Date();
        const h = pad(d.getHours());
        const m = pad(d.getMinutes());
        const s = pad(d.getSeconds());

        // Clock: HH:MM in big numerals, ·SS in accent color
        this.elements.clock.innerHTML = `${h}:${m}<span class="greeting-sec">·${s}</span>`;

        // Greet line: "Wednesday · Good afternoon, Yaman"
        const name = kernel.storage?.load('yancotab_user_name') || '';
        const partOfDay = getPartOfDay(d.getHours());
        const greetText = name ? `${partOfDay}, ${name}` : partOfDay;
        this.elements.greet.textContent = `${DAYS[d.getDay()]} · ${greetText}`;

        // Date line: "May 06 · Week 19 · Day 126 of 365"
        const dayOfYear = getDayOfYear(d);
        const week = Math.ceil(dayOfYear / 7);
        const yearLength = ((d.getFullYear() % 4 === 0 && d.getFullYear() % 100 !== 0) || d.getFullYear() % 400 === 0) ? 366 : 365;
        this.elements.date.textContent = `${MONTHS[d.getMonth()]} ${pad(d.getDate())} · Week ${week} · Day ${dayOfYear} of ${yearLength}`;
    }

    destroy() {
        if (this._interval) clearInterval(this._interval);
        if (this._onNameChanged) window.removeEventListener('yancotab:name_changed', this._onNameChanged);
        if (this.root) this.root.remove();
    }
}
