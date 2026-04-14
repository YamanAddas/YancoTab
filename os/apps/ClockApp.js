import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

/**
 * Clock App — Aurora v2
 * Premium redesign: segmented control, digital/analog toggle,
 * centisecond stopwatch, SVG timer ring, clean world list.
 */
export class ClockApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Clock', id: 'clock', icon: '\u{1F552}' };
        this.storeKey = 'yancotab_clock_v3';
        this.state = this.loadState();
        this.activeTab = 'world';
        this.intervals = [];
        this.rafId = null;
        this.searchTimer = null;
        this.cityDb = this.buildCityDb();
        this.lastStopwatchSave = 0;
        this.lastTimerSave = 0;
        this.editingAlarmId = null;
        this.dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        this.dayShort = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    }

    async init() {
        this.root = el('div', { class: 'app-window clk' });

        // Segmented control
        this.segmented = el('div', { class: 'clk-seg' });
        this.renderSegmented();

        // Content
        this.content = el('div', { class: 'clk-content' });

        this.root.append(this.segmented, this.content);
        this.renderTab();
        this.startUpdates();

        this.onClockUpdate = () => {
            this.state = this.loadState();
            if (this.activeTab === 'world') this.renderWorld();
        };
        window.addEventListener('yancotab:clock_update', this.onClockUpdate);
    }

    // ── Segmented Control ────────────────────────────────────
    renderSegmented() {
        this.segmented.innerHTML = '';
        const tabs = [
            { id: 'world', label: 'World' },
            { id: 'alarm', label: 'Alarm' },
            { id: 'stopwatch', label: 'Stopwatch' },
            { id: 'timer', label: 'Timer' },
        ];
        tabs.forEach(t => {
            const btn = el('button', {
                class: `clk-seg__btn ${this.activeTab === t.id ? 'is-active' : ''}`,
                onclick: () => this.switchTab(t.id),
            }, t.label);
            this.segmented.appendChild(btn);
        });
    }

    switchTab(id) {
        if (this.activeTab === id) return;
        this.activeTab = id;
        this.renderSegmented();
        this.renderTab();
    }

    renderTab() {
        this.content.classList.add('is-switching');
        this.cancelRAF();
        requestAnimationFrame(() => {
            this.content.innerHTML = '';
            this.content.className = `clk-content is-switching`;
            if (this.activeTab === 'world') this.renderWorld();
            else if (this.activeTab === 'alarm') this.renderAlarms();
            else if (this.activeTab === 'stopwatch') this.renderStopwatch();
            else if (this.activeTab === 'timer') this.renderTimer();
            requestAnimationFrame(() => this.content.classList.remove('is-switching'));
        });
    }

    // ── World Tab ────────────────────────────────────────────
    renderWorld() {
        this.content.innerHTML = '';
        const now = new Date();

        // Hero clock
        const hero = el('div', { class: 'clk-hero' });
        this.renderHeroClock(hero, now);

        // Toggle: Digital / Analog
        const isAnalog = this.state.mainClockStyle === 'analog';
        const toggle = el('div', { class: 'clk-face-toggle' }, [
            el('button', {
                class: `clk-face-toggle__btn ${!isAnalog ? 'is-active' : ''}`,
                onclick: () => { this.state.mainClockStyle = 'digital'; this.saveState(); this.renderWorld(); },
            }, 'Digital'),
            el('button', {
                class: `clk-face-toggle__btn ${isAnalog ? 'is-active' : ''}`,
                onclick: () => { this.state.mainClockStyle = 'analog'; this.saveState(); this.renderWorld(); },
            }, 'Analog'),
        ]);

        // World clocks section
        const sectionHeader = el('div', { class: 'clk-section-header' }, [
            el('span', { class: 'clk-section-title' }, 'World Clocks'),
            el('div', { class: 'clk-section-actions' }, [
                el('button', {
                    class: `clk-tool-btn ${this.state.use24h ? 'is-active' : ''}`,
                    onclick: () => { this.state.use24h = !this.state.use24h; this.saveState(); this.renderWorld(); },
                }, this.state.use24h ? '24H' : '12H'),
                el('button', {
                    class: 'clk-add-btn',
                    onclick: () => this.toggleSearchField(),
                }, '+ Add'),
            ]),
        ]);

        // Search (hidden by default)
        this.searchContainer = el('div', { class: 'clk-search' });
        this.searchContainer.style.display = 'none';
        const suggestBox = el('div', { class: 'clk-suggestions' });
        const input = el('input', {
            class: 'clk-search__input',
            type: 'text',
            placeholder: 'Search city or timezone...',
            style: 'font-size: 16px;',
            oninput: (e) => this.queueSearch(e.target.value, suggestBox),
            onkeyup: (e) => { if (e.key === 'Enter') this.addWorldFromInput(e.target.value, suggestBox); },
        });
        this.worldInput = input;
        this.searchContainer.append(input, suggestBox);

        // World list
        this.worldList = el('div', { class: 'clk-world-list' });
        this.renderWorldList(now);

        this.content.append(hero, toggle, sectionHeader, this.searchContainer, this.worldList);
    }

    toggleSearchField() {
        if (!this.searchContainer) return;
        const visible = this.searchContainer.style.display !== 'none';
        this.searchContainer.style.display = visible ? 'none' : 'flex';
        if (!visible && this.worldInput) {
            this.worldInput.value = '';
            setTimeout(() => this.worldInput.focus(), 50);
        }
    }

    renderHeroClock(container, now) {
        container.innerHTML = '';
        const isAnalog = this.state.mainClockStyle === 'analog';

        if (isAnalog) {
            const canvas = el('canvas', { class: 'clk-analog', width: '240', height: '240' });
            container.appendChild(canvas);
            this.drawAnalog(now, canvas);
            // Pill below analog
            const { time, ampm } = this.formatTimeParts(now);
            container.appendChild(el('div', { class: 'clk-analog-pill' }, `${time} ${ampm}`.trim()));
            this.startAnalogRAF(canvas);
        } else {
            const { time, ampm } = this.formatTimeParts(now);
            // Split time into hours:minutes and seconds
            const parts = time.split(':');
            let hm, sec;
            if (parts.length === 3) {
                hm = parts[0] + ':' + parts[1];
                sec = parts[2];
            } else {
                hm = time;
                sec = '';
            }

            const timeWrap = el('div', { class: 'clk-hero__time' }, [
                el('span', { class: 'clk-hero__hm', 'data-role': 'hm' }, hm),
                sec ? el('span', { class: 'clk-hero__sec', 'data-role': 'sec' }, ':' + sec) : null,
                ampm ? el('span', { class: 'clk-hero__ampm' }, ampm) : null,
            ].filter(Boolean));

            const dateEl = el('div', { class: 'clk-hero__date', 'data-role': 'main-date' }, this.formatMainDate(now));
            container.append(timeWrap, dateEl);
        }
    }

    startAnalogRAF(canvas) {
        this.cancelRAF();
        const tick = () => {
            this.drawAnalog(new Date(), canvas);
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    drawAnalog(now, canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width, h = canvas.height;
        const r = Math.min(w, h) / 2 - 12;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.translate(w / 2, h / 2);

        // Face
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(8, 16, 28, 0.92)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0, 229, 193, 0.2)';
        ctx.stroke();

        // Hour indices (lume dots)
        for (let i = 0; i < 12; i++) {
            const angle = (Math.PI / 6) * i - Math.PI / 2;
            const x = Math.cos(angle) * (r - 16);
            const y = Math.sin(angle) * (r - 16);

            ctx.beginPath();
            if (i % 3 === 0) {
                // Major indices — teal rectangles
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate((Math.PI / 6) * i);
                ctx.fillStyle = 'rgba(0, 229, 193, 0.85)';
                ctx.fillRect(-2, -8, 4, 16);
                ctx.restore();
            } else {
                // Minor indices — small dots
                ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 229, 193, 0.4)';
                ctx.fill();
            }
        }

        // Minute ticks
        for (let i = 0; i < 60; i++) {
            if (i % 5 === 0) continue;
            const angle = (Math.PI / 30) * i - Math.PI / 2;
            const x1 = Math.cos(angle) * (r - 4);
            const y1 = Math.sin(angle) * (r - 4);
            const x2 = Math.cos(angle) * (r - 8);
            const y2 = Math.sin(angle) * (r - 8);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.stroke();
        }

        const hour = now.getHours() % 12;
        const minute = now.getMinutes();
        const second = now.getSeconds();
        const ms = now.getMilliseconds();
        const smoothSecond = second + ms / 1000;

        // Hour hand
        ctx.save();
        ctx.rotate((Math.PI / 6) * hour + (Math.PI / 360) * minute);
        ctx.beginPath();
        ctx.moveTo(-2, 10);
        ctx.lineTo(-3.5, 0);
        ctx.lineTo(0, -r * 0.45);
        ctx.lineTo(3.5, 0);
        ctx.lineTo(2, 10);
        ctx.closePath();
        ctx.fillStyle = 'rgba(200, 214, 229, 0.95)';
        ctx.fill();
        ctx.restore();

        // Minute hand
        ctx.save();
        ctx.rotate((Math.PI / 30) * minute + (Math.PI / 1800) * second);
        ctx.beginPath();
        ctx.moveTo(-1.5, 14);
        ctx.lineTo(-2.5, 0);
        ctx.lineTo(0, -r * 0.7);
        ctx.lineTo(2.5, 0);
        ctx.lineTo(1.5, 14);
        ctx.closePath();
        ctx.fillStyle = 'rgba(200, 214, 229, 0.9)';
        ctx.fill();
        ctx.restore();

        // Second hand — smooth sweep
        ctx.save();
        ctx.rotate((Math.PI / 30) * smoothSecond);
        ctx.beginPath();
        ctx.moveTo(0, 20);
        ctx.lineTo(0, -r * 0.82);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#00e5c1';
        ctx.stroke();
        // Counterweight circle
        ctx.beginPath();
        ctx.arc(0, 14, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#00e5c1';
        ctx.fill();
        ctx.restore();

        // Center cap
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#00e5c1';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#0a101c';
        ctx.fill();

        ctx.restore();
    }

    renderWorldList(now = new Date()) {
        if (!this.worldList) return;
        this.worldList.innerHTML = '';
        if (!this.state.worldClocks.length) {
            this.worldList.appendChild(el('div', { class: 'clk-empty' }, 'No world clocks added yet.'));
            return;
        }
        this.state.worldClocks.forEach((wc, index) => {
            const offset = this.getOffsetLabel(wc.tz, now);
            const time = this.formatWorldTime(wc.tz, now);

            const actions = el('div', { class: 'clk-world-row__actions' });
            // Pin
            actions.appendChild(el('button', {
                class: `clk-icon-btn ${wc.pinned ? 'is-active' : ''}`,
                title: wc.pinned ? 'Unpin' : 'Pin',
                onclick: (e) => { e.stopPropagation(); this.toggleWorldPin(wc.tz); },
            }, '\u2605'));
            // Move up
            if (index > 0) {
                actions.appendChild(el('button', {
                    class: 'clk-icon-btn',
                    title: 'Move up',
                    onclick: (e) => { e.stopPropagation(); this.moveWorldClock(wc.tz, -1); },
                }, '\u2191'));
            }
            // Move down
            if (index < this.state.worldClocks.length - 1) {
                actions.appendChild(el('button', {
                    class: 'clk-icon-btn',
                    title: 'Move down',
                    onclick: (e) => { e.stopPropagation(); this.moveWorldClock(wc.tz, 1); },
                }, '\u2193'));
            }
            // Remove
            actions.appendChild(el('button', {
                class: 'clk-icon-btn clk-icon-btn--danger',
                title: 'Remove',
                onclick: (e) => { e.stopPropagation(); this.removeWorldClock(wc.tz); },
            }, '\u00d7'));

            const row = el('div', { class: 'clk-world-row' }, [
                el('div', { class: 'clk-world-row__left' }, [
                    el('span', { class: 'clk-world-row__city' }, wc.label),
                    wc.pinned ? el('span', { class: 'clk-world-row__pin-badge' }, 'Pinned') : null,
                    el('span', { class: 'clk-world-row__offset' }, offset),
                ].filter(Boolean)),
                el('div', { class: 'clk-world-row__right' }, [
                    el('span', { class: 'clk-world-row__time', 'data-tz': wc.tz }, time),
                    actions,
                ]),
            ]);
            this.worldList.appendChild(row);
        });
    }

    updateWorldTimes(now = new Date()) {
        const isAnalog = this.state.mainClockStyle === 'analog';

        if (!isAnalog) {
            // Update digital hero
            const { time, ampm } = this.formatTimeParts(now);
            const parts = time.split(':');
            let hm, sec;
            if (parts.length === 3) { hm = parts[0] + ':' + parts[1]; sec = parts[2]; }
            else { hm = time; sec = ''; }

            const hmEl = this.content.querySelector('[data-role="hm"]');
            const secEl = this.content.querySelector('[data-role="sec"]');
            if (hmEl) hmEl.textContent = hm;
            if (secEl) secEl.textContent = ':' + sec;

            const dateEl = this.content.querySelector('[data-role="main-date"]');
            if (dateEl) dateEl.textContent = this.formatMainDate(now);
        }

        // Update analog pill
        const pill = this.content.querySelector('.clk-analog-pill');
        if (pill) {
            const { time, ampm } = this.formatTimeParts(now);
            pill.textContent = `${time} ${ampm}`.trim();
        }

        // Update world times
        this.content.querySelectorAll('.clk-world-row__time').forEach(timeEl => {
            const tz = timeEl.dataset.tz;
            if (tz) timeEl.textContent = this.formatWorldTime(tz, now);
        });
    }

    // ── Alarm Tab ────────────────────────────────────────────
    renderAlarms() {
        this.content.innerHTML = '';
        const alarmAudio = this.normalizeAlarmAudio(this.state.alarmAudio);
        this.state.alarmAudio = alarmAudio;

        const wrap = el('div', { class: 'clk-alarm' });

        // Next alarm summary
        const summary = this.getNextAlarmSummary();
        wrap.appendChild(el('div', { class: 'clk-alarm__next' }, summary));

        // Alarm list
        const list = el('div', { class: 'clk-alarm__list' });
        this.state.alarms.forEach((alarm, i) => {
            const timeStr = this.formatAlarmTime(alarm.time);
            const dayStr = this.formatDaySummary(alarm.days);

            const row = el('div', { class: `clk-alarm-row ${alarm.enabled ? '' : 'is-disabled'}` });

            const left = el('div', { class: 'clk-alarm-row__left' }, [
                el('span', { class: 'clk-alarm-row__time' }, timeStr.time),
                el('span', { class: 'clk-alarm-row__ampm' }, timeStr.ampm),
            ]);

            const mid = el('div', { class: 'clk-alarm-row__mid' }, [
                el('span', { class: 'clk-alarm-row__label' }, alarm.label || 'Alarm'),
                el('span', { class: 'clk-alarm-row__days' }, dayStr),
            ]);

            const toggle = el('button', {
                class: `clk-toggle ${alarm.enabled ? 'is-on' : ''}`,
                onclick: (e) => {
                    e.stopPropagation();
                    alarm.enabled = !alarm.enabled;
                    this.saveState();
                    this.renderAlarms();
                },
            }, [el('div', { class: 'clk-toggle__knob' })]);

            row.append(left, mid, toggle);
            row.onclick = (e) => {
                if (e.target.closest('.clk-toggle')) return;
                this.editingAlarmId = this.editingAlarmId === alarm.id ? null : alarm.id;
                this.renderAlarms();
            };
            list.appendChild(row);

            // Inline editor
            if (this.editingAlarmId === alarm.id) {
                list.appendChild(this.buildAlarmEditor(alarm, i));
            }
        });
        wrap.appendChild(list);

        // Add alarm button
        wrap.appendChild(el('button', {
            class: 'clk-alarm__add',
            onclick: () => {
                this.state.alarms.push(this.normalizeAlarm({
                    id: `alarm-${Date.now()}`,
                    time: '07:00',
                    label: 'Alarm',
                    enabled: true,
                    days: [0, 1, 2, 3, 4, 5, 6],
                    snoozeMins: 9,
                }));
                this.editingAlarmId = this.state.alarms[this.state.alarms.length - 1].id;
                this.saveState();
                this.renderAlarms();
            },
        }, '+ New Alarm'));

        // Sound & snooze footer
        const footer = el('div', { class: 'clk-alarm__footer' }, [
            el('div', { class: 'clk-alarm__setting' }, [
                el('span', {}, 'Sound'),
                el('select', {
                    class: 'clk-select',
                    onchange: (e) => { this.state.alarmAudio.tone = e.target.value; this.saveState(); this.previewAlarmSound(); },
                }, ['pulse', 'chime', 'soft'].map(t =>
                    el('option', { value: t, ...(alarmAudio.tone === t ? { selected: '' } : {}) },
                        t.charAt(0).toUpperCase() + t.slice(1))
                )),
            ]),
            el('div', { class: 'clk-alarm__setting' }, [
                el('span', {}, 'Volume'),
                el('input', {
                    class: 'clk-range',
                    type: 'range',
                    min: '0.05',
                    max: '1',
                    step: '0.05',
                    value: String(alarmAudio.volume),
                    oninput: (e) => { this.state.alarmAudio.volume = parseFloat(e.target.value); this.saveState(); },
                }),
            ]),
        ]);
        wrap.appendChild(footer);

        this.content.appendChild(wrap);
    }

    formatAlarmTime(timeStr) {
        const [h, m] = (timeStr || '07:00').split(':').map(Number);
        if (this.state.use24h) {
            return { time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, ampm: '' };
        }
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return { time: `${h12}:${String(m).padStart(2, '0')}`, ampm: period };
    }

    buildAlarmEditor(alarm, index) {
        const editor = el('div', { class: 'clk-alarm-editor' });

        const inputs = el('div', { class: 'clk-alarm-editor__inputs' }, [
            el('input', { class: 'clk-input', type: 'time', value: alarm.time || '07:00' }),
            el('input', { class: 'clk-input', type: 'text', value: alarm.label || 'Alarm', placeholder: 'Label' }),
        ]);

        // Day selector
        const daySet = new Set(Array.isArray(alarm.days) ? alarm.days : [0, 1, 2, 3, 4, 5, 6]);
        const dayRow = el('div', { class: 'clk-alarm-editor__days' });
        this.dayNames.forEach((d, idx) => {
            const chip = el('button', {
                class: `clk-day-chip ${daySet.has(idx) ? 'is-active' : ''}`,
                onclick: () => {
                    if (daySet.has(idx)) daySet.delete(idx); else daySet.add(idx);
                    chip.classList.toggle('is-active', daySet.has(idx));
                },
            }, d);
            dayRow.appendChild(chip);
        });

        // Snooze
        const snoozeRow = el('div', { class: 'clk-alarm-editor__snooze' }, [
            el('span', {}, 'Snooze'),
            el('select', { class: 'clk-select' },
                [1, 3, 5, 9, 10, 15, 30].map(m =>
                    el('option', { value: String(m), ...(alarm.snoozeMins === m ? { selected: '' } : {}) }, `${m} min`)
                )
            ),
        ]);

        const actions = el('div', { class: 'clk-alarm-editor__actions' }, [
            el('button', {
                class: 'clk-btn clk-btn--danger',
                onclick: () => {
                    this.state.alarms.splice(index, 1);
                    this.editingAlarmId = null;
                    this.saveState();
                    this.renderAlarms();
                },
            }, 'Delete'),
            el('button', {
                class: 'clk-btn clk-btn--primary',
                onclick: () => {
                    const timeInput = editor.querySelector('input[type="time"]');
                    const labelInput = editor.querySelector('input[type="text"]');
                    const snoozeSelect = editor.querySelector('.clk-alarm-editor__snooze select');
                    alarm.time = timeInput.value;
                    alarm.label = labelInput.value;
                    alarm.days = Array.from(daySet).sort((a, b) => a - b);
                    alarm.snoozeMins = parseInt(snoozeSelect.value) || 9;
                    this.editingAlarmId = null;
                    this.saveState();
                    this.renderAlarms();
                },
            }, 'Save'),
        ]);

        editor.append(inputs, dayRow, snoozeRow, actions);
        return editor;
    }

    // ── Stopwatch Tab ────────────────────────────────────────
    renderStopwatch() {
        this.content.innerHTML = '';
        const elapsed = this.getStopwatchElapsed();
        const wrap = el('div', { class: 'clk-stopwatch' });

        // Display with centiseconds
        const display = el('div', { class: 'clk-sw-display' });
        this.renderStopwatchTime(display, elapsed);
        wrap.appendChild(display);

        // Controls
        const startBtn = el('button', {
            class: `clk-circle-btn ${this.state.stopwatch.running ? 'clk-circle-btn--stop' : 'clk-circle-btn--start'}`,
            onclick: () => {
                const now = Date.now();
                if (this.state.stopwatch.running) {
                    this.syncStopwatchElapsed(now);
                    this.state.stopwatch.running = false;
                    this.state.stopwatch.lastStart = null;
                } else {
                    this.state.stopwatch.running = true;
                    this.state.stopwatch.lastStart = now;
                }
                this.saveState();
                this.renderStopwatch();
            },
        }, this.state.stopwatch.running ? 'Stop' : 'Start');

        const lapLabel = this.state.stopwatch.running ? 'Lap' : 'Reset';
        const lapBtn = el('button', {
            class: 'clk-circle-btn clk-circle-btn--secondary',
            onclick: () => {
                if (this.state.stopwatch.running) {
                    const now = Date.now();
                    const elapsedNow = this.syncStopwatchElapsed(now);
                    this.state.stopwatch.laps.push(elapsedNow);
                    this.saveState();
                    this.renderStopwatch();
                } else {
                    this.state.stopwatch = { elapsed: 0, running: false, laps: [], lastStart: null };
                    this.saveState();
                    this.renderStopwatch();
                }
            },
        }, lapLabel);

        // Disable reset when no elapsed time and not running
        if (!this.state.stopwatch.running && elapsed === 0) {
            lapBtn.disabled = true;
            lapBtn.classList.add('is-disabled');
        }

        wrap.appendChild(el('div', { class: 'clk-controls' }, [lapBtn, startBtn]));

        // Laps
        if (this.state.stopwatch.laps.length > 0) {
            const lapsSection = el('div', { class: 'clk-laps' });
            lapsSection.appendChild(el('div', { class: 'clk-laps__header' }, [
                el('span', {}, 'Lap'),
                el('span', {}, 'Split'),
                el('span', {}, 'Total'),
            ]));

            const laps = this.state.stopwatch.laps;
            // Compute splits
            const splits = laps.map((cumulative, i) => i === 0 ? cumulative : cumulative - laps[i - 1]);
            const bestSplit = Math.min(...splits);
            const worstSplit = Math.max(...splits);

            [...laps].reverse().forEach((cumulative, revIdx) => {
                const i = laps.length - 1 - revIdx;
                const split = splits[i];
                let rowClass = 'clk-laps__row';
                if (splits.length > 1) {
                    if (split === bestSplit) rowClass += ' clk-laps__row--best';
                    else if (split === worstSplit) rowClass += ' clk-laps__row--worst';
                }

                lapsSection.appendChild(el('div', { class: rowClass }, [
                    el('span', {}, `Lap ${i + 1}`),
                    el('span', { class: 'clk-mono' }, this.formatDurationMs(split)),
                    el('span', { class: 'clk-mono' }, this.formatDurationMs(cumulative)),
                ]));
            });
            wrap.appendChild(lapsSection);
        }

        this.content.appendChild(wrap);

        // Start RAF for live updates if running
        if (this.state.stopwatch.running) {
            this.startStopwatchRAF();
        }
    }

    renderStopwatchTime(container, ms) {
        const { h, m, s, cs } = this.splitMs(ms);
        container.innerHTML = '';
        container.appendChild(el('span', { class: 'clk-sw-display__main' },
            `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`));
        container.appendChild(el('span', { class: 'clk-sw-display__cs' }, `.${String(cs).padStart(2, '0')}`));
    }

    startStopwatchRAF() {
        this.cancelRAF();
        const display = this.content.querySelector('.clk-sw-display');
        if (!display) return;
        const tick = () => {
            if (!this.state.stopwatch.running) return;
            const elapsed = this.getStopwatchElapsed();
            this.renderStopwatchTime(display, elapsed);
            this.rafId = requestAnimationFrame(tick);

            // Periodic save
            const now = Date.now();
            if (!this.lastStopwatchSave || now - this.lastStopwatchSave > 5000) {
                this.lastStopwatchSave = now;
                this.saveState();
            }
        };
        this.rafId = requestAnimationFrame(tick);
    }

    // ── Timer Tab ────────────────────────────────────────────
    renderTimer() {
        this.content.innerHTML = '';
        const remaining = this.syncTimerRemaining();
        const duration = this.state.timer.duration || 300;
        const fraction = duration > 0 ? Math.max(0, remaining / duration) : 0;
        const wrap = el('div', { class: 'clk-timer' });

        // Presets
        const presets = el('div', { class: 'clk-timer__presets' });
        [1, 3, 5, 10, 15, 30].forEach(m => {
            presets.appendChild(el('button', {
                class: `clk-pill ${this.state.timer.duration === m * 60 && !this.state.timer.running ? 'is-active' : ''}`,
                onclick: () => {
                    this.state.timer.duration = m * 60;
                    this.state.timer.remaining = m * 60;
                    this.state.timer.running = false;
                    this.state.timer.endsAt = null;
                    this.saveState();
                    this.renderTimer();
                },
            }, `${m}m`));
        });
        wrap.appendChild(presets);

        // Ring + time display
        const ringWrap = el('div', { class: 'clk-timer__ring-wrap' });
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'clk-timer__ring');
        svg.setAttribute('viewBox', '0 0 200 200');

        // Track
        const track = document.createElementNS(svgNS, 'circle');
        track.setAttribute('cx', '100');
        track.setAttribute('cy', '100');
        track.setAttribute('r', '88');
        track.setAttribute('fill', 'none');
        track.setAttribute('stroke', 'rgba(255,255,255,0.06)');
        track.setAttribute('stroke-width', '6');

        // Progress arc
        const circumference = 2 * Math.PI * 88;
        const arc = document.createElementNS(svgNS, 'circle');
        arc.setAttribute('cx', '100');
        arc.setAttribute('cy', '100');
        arc.setAttribute('r', '88');
        arc.setAttribute('fill', 'none');
        arc.setAttribute('stroke', 'var(--accent, #00e5c1)');
        arc.setAttribute('stroke-width', '6');
        arc.setAttribute('stroke-linecap', 'round');
        arc.setAttribute('stroke-dasharray', String(circumference));
        arc.setAttribute('stroke-dashoffset', String(circumference * (1 - fraction)));
        arc.setAttribute('transform', 'rotate(-90 100 100)');
        arc.setAttribute('class', 'clk-timer__arc');

        svg.append(track, arc);
        ringWrap.appendChild(svg);

        // Time inside ring
        const timeDisplay = el('div', { class: 'clk-timer__time', 'data-role': 'timer-display' },
            this.formatDuration(remaining * 1000));
        ringWrap.appendChild(timeDisplay);

        // Done state
        if (remaining <= 0 && !this.state.timer.running && this.state.timer.duration > 0 && this.state.timer.remaining <= 0) {
            timeDisplay.textContent = 'Done!';
            timeDisplay.classList.add('is-done');
        }

        wrap.appendChild(ringWrap);

        // Controls
        const isRunning = this.state.timer.running;
        const startBtn = el('button', {
            class: `clk-circle-btn ${isRunning ? 'clk-circle-btn--stop' : 'clk-circle-btn--start'}`,
            onclick: () => {
                const now = Date.now();
                if (isRunning) {
                    this.syncTimerRemaining(now);
                    this.state.timer.running = false;
                    this.state.timer.endsAt = null;
                } else {
                    if (this.state.timer.remaining <= 0) this.state.timer.remaining = this.state.timer.duration;
                    this.state.timer.running = true;
                    this.state.timer.endsAt = now + this.state.timer.remaining * 1000;
                }
                this.saveState();
                this.renderTimer();
            },
        }, isRunning ? 'Pause' : 'Start');

        const cancelBtn = el('button', {
            class: 'clk-circle-btn clk-circle-btn--secondary',
            onclick: () => {
                this.state.timer.remaining = this.state.timer.duration;
                this.state.timer.running = false;
                this.state.timer.endsAt = null;
                this.saveState();
                this.renderTimer();
            },
        }, 'Reset');

        wrap.appendChild(el('div', { class: 'clk-controls' }, [cancelBtn, startBtn]));

        this.content.appendChild(wrap);

        if (isRunning) this.startTimerRAF();
    }

    startTimerRAF() {
        this.cancelRAF();
        const tick = () => {
            if (!this.state.timer.running) return;
            const nowMs = Date.now();
            const remaining = this.syncTimerRemaining(nowMs);

            const display = this.content.querySelector('[data-role="timer-display"]');
            if (display) display.textContent = this.formatDuration(remaining * 1000);

            // Update arc
            const duration = this.state.timer.duration || 1;
            const fraction = Math.max(0, remaining / duration);
            const arc = this.content.querySelector('.clk-timer__arc');
            if (arc) {
                const circumference = 2 * Math.PI * 88;
                arc.setAttribute('stroke-dashoffset', String(circumference * (1 - fraction)));
            }

            // Periodic save
            if (!this.lastTimerSave || nowMs - this.lastTimerSave > 5000) {
                this.lastTimerSave = nowMs;
                this.saveState();
            }

            if (remaining <= 0) {
                this.state.timer.running = false;
                this.state.timer.endsAt = null;
                this.saveState();
                this.renderTimer();
                this.notify('Timer complete!');
                return;
            }

            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    // ── Update Loop ──────────────────────────────────────────
    startUpdates() {
        const tick = setInterval(() => {
            const now = new Date();
            if (this.activeTab === 'world') {
                this.updateWorldTimes(now);
            }
            this.setThemeByTime(now);
        }, 1000);
        this.intervals.push(tick);
    }

    // ── Helpers ──────────────────────────────────────────────
    cancelRAF() {
        if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    }

    splitMs(ms) {
        const total = Math.max(0, ms);
        const cs = Math.floor((total % 1000) / 10);
        const totalSec = Math.floor(total / 1000);
        const s = totalSec % 60;
        const m = Math.floor((totalSec % 3600) / 60);
        const h = Math.floor(totalSec / 3600);
        return { h, m, s, cs };
    }

    formatDurationMs(ms) {
        const { h, m, s, cs } = this.splitMs(ms);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    }

    formatDuration(ms) {
        const totalSec = Math.max(0, Math.floor(ms / 1000));
        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        if (hrs > 0) return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    formatTimeParts(now) {
        const parts = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric', minute: '2-digit', second: '2-digit',
            hour12: !this.state.use24h,
        }).formatToParts(now);
        const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value || '';
        const time = parts.filter(p => p.type !== 'dayPeriod').map(p => p.value).join('').trim();
        return { time, ampm: dayPeriod };
    }

    formatMainDate(now) {
        return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(now);
    }

    formatWorldTime(tz, now) {
        try {
            return new Intl.DateTimeFormat('en-US', {
                hour: '2-digit', minute: '2-digit', hour12: !this.state.use24h, timeZone: tz,
            }).format(now);
        } catch (_) { return '--:--'; }
    }

    getOffsetLabel(tz, now) {
        try {
            const target = new Date(now.toLocaleString('en-US', { timeZone: tz }));
            const diffMin = Math.round((target - now) / 60000);
            const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
            const localDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const dayDiff = Math.round((targetDate - localDate) / 86400000);
            const day = dayDiff === 1 ? 'Tomorrow' : dayDiff === -1 ? 'Yesterday' : dayDiff === 0 ? 'Today' : `${dayDiff}d`;
            const sign = diffMin >= 0 ? '+' : '-';
            const abs = Math.abs(diffMin);
            const h = Math.floor(abs / 60);
            const m = abs % 60;
            const offset = m ? `${sign}${h}h ${m}m` : `${sign}${h}h`;
            return `${day} \u00b7 GMT${offset}`;
        } catch (_) { return '\u2014'; }
    }

    // ── State ────────────────────────────────────────────────
    loadState() {
        try {
            const raw = localStorage.getItem(this.storeKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                parsed.mainClockStyle = parsed.mainClockStyle || 'digital';
                // Normalize legacy skin values to digital/analog
                if (!['digital', 'analog'].includes(parsed.mainClockStyle)) {
                    parsed.mainClockStyle = parsed.mainClockStyle === 'digital' ? 'digital' : 'analog';
                }
                parsed.worldClocks = Array.isArray(parsed.worldClocks)
                    ? parsed.worldClocks.map(w => this.normalizeWorldClock(w)).filter(Boolean) : [];
                parsed.alarms = Array.isArray(parsed.alarms) ? parsed.alarms.map(a => this.normalizeAlarm(a)) : [];
                return parsed;
            }
        } catch (_) { /* ignore */ }
        return {
            use24h: false,
            mainClockStyle: 'digital',
            alarmAudio: { tone: 'pulse', volume: 0.45 },
            worldClocks: [],
            alarms: [],
            stopwatch: { elapsed: 0, running: false, laps: [], lastStart: null },
            timer: { duration: 300, remaining: 300, running: false, endsAt: null },
            sunTimes: null,
            weatherCode: null,
            weatherFxEnabled: false,
        };
    }

    saveState() {
        try { localStorage.setItem(this.storeKey, JSON.stringify(this.state)); } catch (_) { /* ignore */ }
    }

    // ── World clock CRUD ─────────────────────────────────────
    addWorldClock(label, tz) {
        const normalized = this.normalizeWorldClock({ label, tz, pinned: false });
        if (!normalized) return false;
        if (this.state.worldClocks.some(w => w.tz === normalized.tz)) {
            this.notify('City already added');
            return false;
        }
        this.state.worldClocks = this.sortWorldClocksByPin([normalized, ...this.state.worldClocks.map(w => this.normalizeWorldClock(w)).filter(Boolean)]);
        this.saveState();
        this.renderWorldList();
        return true;
    }

    removeWorldClock(tz) {
        this.state.worldClocks = this.state.worldClocks.filter(w => w.tz !== tz);
        this.saveState();
        this.renderWorldList();
    }

    moveWorldClock(tz, direction) {
        const i = this.state.worldClocks.findIndex(w => w.tz === tz);
        if (i < 0) return;
        const next = i + direction;
        if (next < 0 || next >= this.state.worldClocks.length) return;
        const copy = [...this.state.worldClocks];
        [copy[i], copy[next]] = [copy[next], copy[i]];
        this.state.worldClocks = copy;
        this.saveState();
        this.renderWorldList();
    }

    toggleWorldPin(tz) {
        const i = this.state.worldClocks.findIndex(w => w.tz === tz);
        if (i < 0) return;
        const copy = [...this.state.worldClocks];
        copy[i] = { ...copy[i], pinned: !copy[i].pinned };
        this.state.worldClocks = this.sortWorldClocksByPin(copy);
        this.saveState();
        this.renderWorldList();
    }

    sortWorldClocksByPin(list = this.state.worldClocks) {
        const pins = [], rest = [];
        list.forEach(item => { if (item.pinned) pins.push(item); else rest.push(item); });
        return [...pins, ...rest];
    }

    // ── Search ───────────────────────────────────────────────
    queueSearch(term, box) {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.searchTimeZones(term, box), 250);
    }

    async searchTimeZones(term, box) {
        const query = term.trim();
        if (query.length < 2) { box.classList.remove('is-open'); box.innerHTML = ''; return; }

        try {
            const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                const results = Array.isArray(data?.results) ? data.results : [];
                const mapped = results.filter(r => r.timezone).map(r => ({
                    name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
                    tz: r.timezone,
                }));
                if (mapped.length) { this.renderSuggestionList(mapped, box); return; }
            }
        } catch (_) { /* ignore */ }

        const lower = query.toLowerCase();
        const items = this.cityDb
            .map(c => ({ ...c, score: this.fuzzyScore(c, lower) }))
            .filter(c => c.score > 0.25)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);
        this.renderSuggestionList(items, box);
    }

    renderSuggestionList(items, box) {
        box.innerHTML = '';
        if (!items.length) { box.classList.remove('is-open'); return; }
        items.forEach(({ name, tz }) => {
            box.appendChild(el('button', {
                class: 'clk-suggestion',
                onclick: () => {
                    this.addWorldClock(name, tz);
                    box.classList.remove('is-open');
                    box.innerHTML = '';
                    if (this.worldInput) this.worldInput.value = '';
                    if (this.searchContainer) this.searchContainer.style.display = 'none';
                },
            }, `${name} \u2014 ${tz}`));
        });
        box.classList.add('is-open');
    }

    fuzzyScore(city, q) {
        const name = city.name.toLowerCase();
        const tz = city.tz.toLowerCase();
        if (name.includes(q)) return 1 - name.indexOf(q) / name.length;
        if (tz.includes(q)) return 0.7 - tz.indexOf(q) / tz.length;
        return 0;
    }

    addWorldFromInput(value, box) {
        const term = value.trim();
        if (!term) return;
        const fuzzy = this.cityDb.find(c => c.name.toLowerCase() === term.toLowerCase());
        if (fuzzy) {
            this.addWorldClock(fuzzy.name, fuzzy.tz);
            box.classList.remove('is-open'); box.innerHTML = '';
            if (this.worldInput) this.worldInput.value = '';
            return;
        }
        const partial = this.cityDb.find(c =>
            c.name.toLowerCase().includes(term.toLowerCase()) || c.tz.toLowerCase().includes(term.toLowerCase())
        );
        if (partial) {
            this.addWorldClock(partial.name, partial.tz);
            box.classList.remove('is-open'); box.innerHTML = '';
            if (this.worldInput) this.worldInput.value = '';
            return;
        }
        if (term.includes('/')) {
            try {
                new Intl.DateTimeFormat('en-US', { timeZone: term }).format(new Date());
                this.addWorldClock(term.split('/').pop().replace(/_/g, ' '), term);
                box.classList.remove('is-open'); box.innerHTML = '';
                if (this.worldInput) this.worldInput.value = '';
            } catch (_) { this.notify('Unknown timezone'); }
        }
    }

    // ── Alarm helpers ────────────────────────────────────────
    normalizeAlarm(alarm) {
        const days = Array.isArray(alarm?.days)
            ? alarm.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b)
            : [0, 1, 2, 3, 4, 5, 6];
        return {
            id: alarm?.id || `alarm-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            time: typeof alarm?.time === 'string' ? alarm.time : '07:00',
            label: typeof alarm?.label === 'string' ? alarm.label : 'Alarm',
            enabled: alarm?.enabled !== false,
            days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
            snoozeMins: Number.isFinite(Number(alarm?.snoozeMins)) ? Math.max(1, Math.min(30, Number(alarm.snoozeMins))) : 9,
            snoozedUntil: Number.isFinite(Number(alarm?.snoozedUntil)) ? Number(alarm.snoozedUntil) : null,
            lastTriggerKey: typeof alarm?.lastTriggerKey === 'string' ? alarm.lastTriggerKey : '',
        };
    }

    normalizeAlarmAudio(audio) {
        const tone = typeof audio?.tone === 'string' ? audio.tone : 'pulse';
        const allowed = ['pulse', 'chime', 'soft'];
        return {
            tone: allowed.includes(tone) ? tone : 'pulse',
            volume: Number.isFinite(Number(audio?.volume)) ? Math.max(0.05, Math.min(1, Number(audio.volume))) : 0.45,
        };
    }

    normalizeWorldClock(entry) {
        if (!entry || typeof entry !== 'object' || !entry.tz) return null;
        return {
            label: entry.label || entry.tz.split('/').pop().replace(/_/g, ' '),
            tz: entry.tz,
            pinned: entry.pinned === true,
        };
    }

    previewAlarmSound() {
        const audio = this.normalizeAlarmAudio(this.state.alarmAudio);
        this.state.alarmAudio = audio;
        this.saveState();
        const clock = this.kernel?.getService?.('clock');
        if (clock && typeof clock.playAlarmSound === 'function') clock.playAlarmSound(audio);
    }

    getNextAlarmSummary() {
        const now = new Date();
        let nextAlarm = null;
        this.state.alarms.forEach(alarm => {
            if (!alarm.enabled) return;
            const next = this.getNextAlarmDate(alarm, now);
            if (!next) return;
            if (!nextAlarm || next < nextAlarm) nextAlarm = next;
        });
        if (!nextAlarm) return 'No upcoming alarms';
        const diff = nextAlarm - now;
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        let inStr = '';
        if (hours > 0) inStr += `${hours}h `;
        inStr += `${mins}m`;
        return `Next alarm in ${inStr}`;
    }

    getNextAlarmDate(alarm, fromDate) {
        if (alarm.snoozedUntil && alarm.snoozedUntil > fromDate.getTime()) return new Date(alarm.snoozedUntil);
        const [h, m] = (alarm.time || '07:00').split(':').map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
        for (let i = 0; i < 8; i += 1) {
            const candidate = new Date(fromDate);
            candidate.setHours(0, 0, 0, 0);
            candidate.setDate(candidate.getDate() + i);
            if (!alarm.days.includes(candidate.getDay())) continue;
            candidate.setHours(h, m, 0, 0);
            if (candidate > fromDate) return candidate;
        }
        return null;
    }

    formatDaySummary(days) {
        if (!Array.isArray(days) || !days.length) return 'Never';
        if (days.length === 7) return 'Every day';
        const wk = [1, 2, 3, 4, 5];
        if (wk.every(d => days.includes(d)) && days.length === 5) return 'Weekdays';
        const wknd = [0, 6];
        if (wknd.every(d => days.includes(d)) && days.length === 2) return 'Weekends';
        return days.map(d => this.dayNames[d] || '').join(' ');
    }

    // ── Stopwatch/Timer helpers ──────────────────────────────
    getStopwatchElapsed(nowMs = Date.now()) {
        const sw = this.state.stopwatch || {};
        const base = Number.isFinite(sw.elapsed) ? Math.max(0, sw.elapsed) : 0;
        if (!sw.running || !Number.isFinite(sw.lastStart)) return base;
        return base + Math.max(0, nowMs - sw.lastStart);
    }

    syncStopwatchElapsed(nowMs = Date.now()) {
        const elapsed = this.getStopwatchElapsed(nowMs);
        this.state.stopwatch.elapsed = elapsed;
        if (this.state.stopwatch.running) this.state.stopwatch.lastStart = nowMs;
        return elapsed;
    }

    getTimerRemainingSeconds(nowMs = Date.now()) {
        const timer = this.state.timer || {};
        const remaining = Number.isFinite(timer.remaining) ? Math.max(0, timer.remaining) : 0;
        if (!timer.running || !Number.isFinite(timer.endsAt)) return remaining;
        return Math.max(0, Math.round((timer.endsAt - nowMs) / 1000));
    }

    syncTimerRemaining(nowMs = Date.now()) {
        if (!this.state.timer.running) return this.getTimerRemainingSeconds(nowMs);
        if (!Number.isFinite(this.state.timer.endsAt)) {
            this.state.timer.endsAt = nowMs + Math.max(0, this.state.timer.remaining) * 1000;
        }
        const remaining = this.getTimerRemainingSeconds(nowMs);
        this.state.timer.remaining = remaining;
        return remaining;
    }

    // ── Theming ──────────────────────────────────────────────
    setThemeByTime(now) {
        const theme = this.resolveThemeBySun(now);
        if (this.root) this.root.dataset.clockTheme = theme;
    }

    resolveThemeBySun(now) {
        const sun = this.state.sunTimes;
        if (sun && typeof sun.sunrise === 'string' && typeof sun.sunset === 'string') {
            const sunrise = new Date(sun.sunrise).getTime();
            const sunset = new Date(sun.sunset).getTime();
            const current = now.getTime();
            if (Number.isFinite(sunrise) && Number.isFinite(sunset) && sunset > sunrise) {
                const dawnStart = sunrise - 45 * 60 * 1000;
                const dawnEnd = sunrise + 45 * 60 * 1000;
                const sunsetStart = sunset - 70 * 60 * 1000;
                const sunsetEnd = sunset + 40 * 60 * 1000;
                const eveningEnd = sunset + 150 * 60 * 1000;
                if (current < dawnStart) return 'night';
                if (current < dawnEnd) return 'dawn';
                if (current < sunsetStart) return current < new Date(now).setHours(12, 0, 0, 0) ? 'morning' : 'afternoon';
                if (current < sunsetEnd) return 'sunset';
                if (current < eveningEnd) return 'evening';
                return 'night';
            }
        }
        const hour = now.getHours();
        if (hour >= 5 && hour < 7) return 'dawn';
        if (hour >= 7 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 20) return 'sunset';
        if (hour >= 20 && hour < 22) return 'evening';
        return 'night';
    }

    notify(message) {
        window.dispatchEvent(new CustomEvent('yancotab:notify', { detail: { message } }));
    }

    // ── City Database ────────────────────────────────────────
    buildCityDb() {
        return [
            ['Louisville, KY', 'America/New_York'],
            ['New York', 'America/New_York'], ['Boston', 'America/New_York'], ['Washington', 'America/New_York'],
            ['Miami', 'America/New_York'], ['Chicago', 'America/Chicago'], ['Dallas', 'America/Chicago'],
            ['Denver', 'America/Denver'], ['Los Angeles', 'America/Los_Angeles'], ['San Francisco', 'America/Los_Angeles'],
            ['Seattle', 'America/Los_Angeles'], ['Vancouver', 'America/Vancouver'], ['Toronto', 'America/Toronto'],
            ['Montreal', 'America/Toronto'], ['Mexico City', 'America/Mexico_City'], ['Bogota', 'America/Bogota'],
            ['Lima', 'America/Lima'], ['Santiago', 'America/Santiago'], ['Buenos Aires', 'America/Argentina/Buenos_Aires'],
            ['Sao Paulo', 'America/Sao_Paulo'], ['Rio de Janeiro', 'America/Sao_Paulo'],
            ['London', 'Europe/London'], ['Paris', 'Europe/Paris'], ['Berlin', 'Europe/Berlin'],
            ['Madrid', 'Europe/Madrid'], ['Rome', 'Europe/Rome'], ['Istanbul', 'Europe/Istanbul'],
            ['Cairo', 'Africa/Cairo'], ['Johannesburg', 'Africa/Johannesburg'], ['Nairobi', 'Africa/Nairobi'],
            ['Dubai', 'Asia/Dubai'], ['Riyadh', 'Asia/Riyadh'], ['Amman', 'Asia/Amman'], ['Damascus', 'Asia/Damascus'],
            ['Tokyo', 'Asia/Tokyo'], ['Seoul', 'Asia/Seoul'], ['Beijing', 'Asia/Shanghai'],
            ['Singapore', 'Asia/Singapore'], ['Hong Kong', 'Asia/Hong_Kong'], ['Bangkok', 'Asia/Bangkok'],
            ['Sydney', 'Australia/Sydney'], ['Melbourne', 'Australia/Melbourne'], ['Auckland', 'Pacific/Auckland'],
            ['Honolulu', 'Pacific/Honolulu'], ['Anchorage', 'America/Anchorage'],
        ].map(([name, tz]) => ({ name, tz }));
    }

    // ── Cleanup ──────────────────────────────────────────────
    destroy() {
        this.cancelRAF();
        this.intervals.forEach(i => clearInterval(i));
        this.intervals = [];
        if (this.onClockUpdate) window.removeEventListener('yancotab:clock_update', this.onClockUpdate);
        super.destroy();
    }
}
