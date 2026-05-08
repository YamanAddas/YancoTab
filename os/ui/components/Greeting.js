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
        // Cache the last rendered minute / day so the per-second tick
        // skips the date / greet-line / minute-pad reflow 59/60 times.
        this._lastMinute = -1;
        this._lastDayKey = '';
    }

    render() {
        this.root = el('div', { class: 'greeting-bar' });

        this.elements.greet = el('div', { class: 'greeting-greet' });

        // Clock is flanked by arabesque flourishes — accent-colored
        // ornamental glyphs that frame the time without competing with it.
        // Build clock as two text spans so the per-second update is a
        // single textContent write on the seconds span (not innerHTML).
        this.elements.clockMain = el('span', { class: 'greeting-clock-main' });
        this.elements.clockSec = el('span', { class: 'greeting-sec' });
        this.elements.clock = el('div', { class: 'greeting-clock' }, [
            this.elements.clockMain,
            this.elements.clockSec,
        ]);
        const clockWrap = el('div', { class: 'greeting-clock-wrap' }, [
            el('span', { class: 'greeting-flourish greeting-flourish-l', 'aria-hidden': 'true' }, '❧'),
            this.elements.clock,
            el('span', { class: 'greeting-flourish greeting-flourish-r', 'aria-hidden': 'true' }, '❧'),
        ]);

        this.elements.date = el('div', { class: 'greeting-date' });

        this.root.append(this.elements.greet, clockWrap, this.elements.date);

        this._tick();
        this._interval = setInterval(() => this._tick(), 1000);

        this._onNameChanged = () => {
            // Force greet-line re-render on next tick.
            this._lastMinute = -1;
            this._tick();
        };
        window.addEventListener('yancotab:name_changed', this._onNameChanged);

        return this.root;
    }

    _tick() {
        if (!this.root) return;

        const d = new Date();
        const minute = d.getMinutes();
        const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

        // Seconds: cheap textContent write, every tick.
        this.elements.clockSec.textContent = `·${pad(d.getSeconds())}`;

        // Minute hasn't ticked over → skip the rest. Saves ~59/60 of the
        // greet-line + date-line + getDayOfYear + leap-year math each minute.
        if (minute === this._lastMinute && dayKey === this._lastDayKey) return;
        this._lastMinute = minute;
        this._lastDayKey = dayKey;

        // Clock main: HH:MM
        this.elements.clockMain.textContent = `${pad(d.getHours())}:${pad(minute)}`;

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
