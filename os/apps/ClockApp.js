import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

/**
 * Clock App v0.8 — Premium Redesign
 *
 * Structure:
 * - Header: Title + Close Button
 * - Content: Main View Area
 * - TabBar: Bottom Navigation
 */
export class ClockApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Clock', id: 'clock', icon: '🕒' };
        this.storeKey = 'yancotab_clock_v3';
        this.state = this.loadState();
        this.activeTab = 'world';
        this.intervals = [];
        this.searchTimer = null;
        this.cityDb = this.buildCityDb();
        this.lastStopwatchSave = 0;
        this.lastTimerSave = 0;
        this.dayShort = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        // Skin Switcher State
        this.skinOrder = ['digital', 'analog', 'swiss', 'classic'];
        this.currentSkinIndex = this.skinOrder.indexOf(this.state.mainClockStyle || 'digital');
        if (this.currentSkinIndex === -1) this.currentSkinIndex = 0;
    }

    async init() {
        this.root = el('div', { class: 'app-window app-clock-v3' });

        // Header
        const header = el('div', { class: 'clock-header' }, [
            el('div', { class: 'clock-title' }, 'Clock'),
            el('button', { class: 'clock-close', onclick: () => this.close(), title: 'Close' }, '✕')
        ]);

        // Content
        this.content = el('div', { class: 'clock-content' });

        // Tab Bar
        this.tabBar = el('div', { class: 'clock-tab-bar' });
        this.renderTabBar();

        this.root.append(header, this.content, this.tabBar);
        this.renderTab();
        this.startUpdates();

        this.onClockUpdate = () => {
            this.state = this.loadState();
            if (this.activeTab === 'world') this.renderWorld();
        };
        window.addEventListener('yancotab:clock_update', this.onClockUpdate);
    }

    renderTabBar() {
        this.tabBar.innerHTML = '';
        const tabs = [
            { id: 'world', label: 'World', icon: '🌐' },
            { id: 'alarm', label: 'Alarms', icon: '⏰' },
            { id: 'stopwatch', label: 'Stopwatch', icon: '⏱️' },
            { id: 'timer', label: 'Timer', icon: '⏲️' }
        ];

        tabs.forEach(tab => {
            const btn = el('button', {
                class: `clock-tab-btn ${this.activeTab === tab.id ? 'is-active' : ''}`,
                onclick: () => this.switchTab(tab.id)
            }, [
                el('span', { class: 'clock-tab-icon' }, tab.icon),
                el('span', { class: 'clock-tab-label' }, tab.label)
            ]);
            this.tabBar.appendChild(btn);
        });
    }

    switchTab(id) {
        if (this.activeTab === id) return;
        this.activeTab = id;
        this.renderTabBar();
        this.renderTab();
    }

    renderTab() {
        this.content.classList.add('is-switching');
        requestAnimationFrame(() => {
            this.content.innerHTML = '';
            this.content.className = `clock-content view-${this.activeTab} is-switching`;

            if (this.activeTab === 'world') this.renderWorld();
            else if (this.activeTab === 'alarm') this.renderAlarms();
            else if (this.activeTab === 'stopwatch') this.renderStopwatch();
            else if (this.activeTab === 'timer') this.renderTimer();

            requestAnimationFrame(() => this.content.classList.remove('is-switching'));
        });
    }

    loadState() {
        try {
            const raw = localStorage.getItem(this.storeKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                parsed.mainClockStyle = parsed.mainClockStyle || 'digital';
                parsed.worldClocks = Array.isArray(parsed.worldClocks)
                    ? parsed.worldClocks.map((w) => this.normalizeWorldClock(w)).filter(Boolean)
                    : [];
                parsed.alarms = Array.isArray(parsed.alarms) ? parsed.alarms.map((a) => this.normalizeAlarm(a)) : [];
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
            timer: { duration: 300, remaining: 300, running: false, endsAt: null }
        };
    }

    saveState() {
        localStorage.setItem(this.storeKey, JSON.stringify(this.state));
    }

    normalizeWorldClock(w) {
        if (!w || typeof w !== 'object') return null;
        return {
            label: w.label || 'Unknown',
            tz: w.tz || 'UTC',
            pinned: !!w.pinned
        };
    }

    normalizeAlarm(a) {
        if (!a || typeof a !== 'object') return null;
        return {
            id: a.id || `alarm-${Date.now()}-${Math.random()}`,
            time: a.time || '00:00',
            label: a.label || 'Alarm',
            enabled: !!a.enabled,
            days: Array.isArray(a.days) ? a.days : [],
            snoozeMins: Number(a.snoozeMins) || 9
        };
    }

    normalizeAlarmAudio(a) {
        if (!a || typeof a !== 'object') return { tone: 'pulse', volume: 0.45 };
        return {
            tone: typeof a.tone === 'string' ? a.tone : 'pulse',
            volume: Number.isFinite(Number(a.volume)) ? Math.max(0.05, Math.min(1, Number(a.volume))) : 0.45
        };
    }

    startUpdates() {
        const tick = setInterval(() => {
            const now = new Date();
            if (this.activeTab === 'world') {
                this.updateWorldTimes(now);
                // Update Main Clock Face if needed
                if (this.state.mainClockStyle !== 'digital') {
                    const canvas = this.content.querySelector('canvas');
                    if (canvas) this.drawMainAnalog(now, canvas, this.state.mainClockStyle);
                } else {
                    const digital = this.content.querySelector('.clock-main-time');
                    if (digital) digital.textContent = this.formatMainTime(now);
                }
            }
            if (this.activeTab === 'stopwatch' && this.state.stopwatch.running) this.updateStopwatch(now);
            if (this.activeTab === 'timer' && this.state.timer.running) this.updateTimer(now);
            this.setThemeByTime(now);
        }, 1000);
        this.intervals.push(tick);
    }

    setThemeByTime(now) {
        const h = now.getHours();
        const theme = (h >= 6 && h < 18) ? 'day' : 'night';
        if (this.root.dataset.clockTheme !== theme) {
            this.root.dataset.clockTheme = theme;
        }
    }

    /* ---------- World Clock ---------- */
    renderWorld() {
        this.content.innerHTML = '';
        const now = new Date();

        // 1. Carousel
        const prevBtn = el('button', { class: 'clock-skin-nav prev', onclick: () => this.cycleSkin(-1) }, '‹');
        const nextBtn = el('button', { class: 'clock-skin-nav next', onclick: () => this.cycleSkin(1) }, '›');

        const faceContainer = el('div', { class: 'clock-face-container' });
        this.renderMainFaceInto(faceContainer, now);

        const carousel = el('div', { class: 'clock-carousel' }, [
            prevBtn, faceContainer, nextBtn
        ]);

        // 2. Tools
        const tools = el('div', { class: 'clock-tools' }, [
            el('button', {
                class: `clock-tool-btn ${this.state.use24h ? 'is-active' : ''}`,
                onclick: () => {
                    this.state.use24h = !this.state.use24h;
                    this.saveState();
                    this.renderWorld();
                }
            }, this.state.use24h ? '24H' : '12H')
        ]);

        // 3. List Section
        const searchBox = el('div', { class: 'clock-search-container' });
        const suggestBox = el('div', { class: 'clock-suggestions' });
        const input = el('input', {
            class: 'clock-search-input',
            type: 'text',
            placeholder: 'Add City',
            style: 'font-size: 16px;',
            oninput: (e) => this.queueSearch(e.target.value, suggestBox),
            onkeyup: (e) => { if (e.key === 'Enter') this.addWorldFromInput(e.target.value, suggestBox); }
        });
        this.worldInput = input;
        searchBox.append(el('span', { class: 'search-icon' }, '🔍'), input, suggestBox);

        this.worldList = el('div', { class: 'clock-world-list' });
        this.renderWorldList();

        const listContainer = el('div', { class: 'clock-list-section' }, [
            searchBox,
            this.worldList
        ]);

        this.content.append(carousel, tools, listContainer);
    }

    cycleSkin(dir) {
        this.currentSkinIndex = (this.currentSkinIndex + dir + this.skinOrder.length) % this.skinOrder.length;
        this.state.mainClockStyle = this.skinOrder[this.currentSkinIndex];
        this.saveState();

        const container = this.content.querySelector('.clock-face-container');
        if (container) {
            container.innerHTML = '';
            this.renderMainFaceInto(container, new Date());
        }
    }

    renderMainFaceInto(container, now) {
        const style = this.state.mainClockStyle;
        const face = el('div', { class: `clock-main-face clock-main-face-${style}` });

        if (['analog', 'classic', 'swiss'].includes(style)) {
            const canvas = el('canvas', { class: 'clock-main-analog', width: '260', height: '260' });
            face.appendChild(canvas);
            this.drawMainAnalog(now, canvas, style);
            // Digital pill below analog
            const { time, ampm } = this.formatTimeParts(now);
            face.appendChild(el('div', { class: 'clock-face-pill' }, `${time} ${ampm}`));
        } else {
            // Digital
            const { time, ampm } = this.formatTimeParts(now);
            const timeEl = el('div', { class: 'clock-main-time-wrap' }, [
                el('span', { class: 'clock-time-text' }, time),
                ampm ? el('span', { class: 'clock-ampm-text' }, ampm) : null
            ]);

            face.appendChild(timeEl);
            face.appendChild(el('div', { class: 'clock-main-date' }, this.formatMainDate(now)));
        }
        container.appendChild(face);
    }

    formatTimeParts(now) {
        const parts = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric', minute: '2-digit', second: '2-digit',
            hour12: !this.state.use24h
        }).formatToParts(now);

        const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value || '';
        // Reconstruct time part without dayPeriod and trimming whitespace
        const time = parts
            .filter(p => p.type !== 'dayPeriod')
            .map(p => p.value)
            .join('')
            .trim();

        return { time, ampm: dayPeriod };
    }

    formatMainTime(now) {
        const { time, ampm } = this.formatTimeParts(now);
        return `${time} ${ampm}`.trim();
    }

    formatMainDate(now) {
        return new Intl.DateTimeFormat('en-US', {
            weekday: 'long', month: 'short', day: 'numeric'
        }).format(now);
    }

    renderWorldList() {
        this.worldList.innerHTML = '';
        const now = new Date();
        if (!this.state.worldClocks.length) {
            this.worldList.appendChild(el('div', { class: 'clock-empty' }, 'No world clocks yet. Search and tap a result to add.'));
            return;
        }
        this.state.worldClocks.forEach((wc, index) => {
            const pinBtn = el('button', {
                class: `clock-world-pin ${wc.pinned ? 'is-active' : ''}`,
                title: wc.pinned ? 'Unpin' : 'Pin',
                onclick: () => this.toggleWorldPin(wc.tz)
            }, '★');
            const upBtn = el('button', {
                class: 'clock-world-move',
                title: 'Move up',
                onclick: () => this.moveWorldClock(wc.tz, -1)
            }, '↑');
            upBtn.disabled = index === 0;
            const downBtn = el('button', {
                class: 'clock-world-move',
                title: 'Move down',
                onclick: () => this.moveWorldClock(wc.tz, 1)
            }, '↓');
            downBtn.disabled = index === this.state.worldClocks.length - 1;
            const row = el('div', { class: 'clock-world-row' }, [
                el('div', { class: 'clock-world-city' }, [
                    el('span', { class: 'clock-world-city-name' }, wc.label),
                    wc.pinned ? el('span', { class: 'clock-world-pin-badge' }, 'Pinned') : null
                ].filter(Boolean)),
                el('div', { class: 'clock-world-meta' }, this.getOffsetLabel(wc.tz, now)),
                el('div', { class: 'clock-world-time', 'data-tz': wc.tz }, this.formatWorldTime(wc.tz, now)),
                el('div', { class: 'clock-world-actions' }, [
                    pinBtn,
                    upBtn,
                    downBtn,
                    el('button', { class: 'clock-world-remove', onclick: () => this.removeWorldClock(wc.tz) }, '×')
                ])
            ]);
            this.worldList.appendChild(row);
        });
    }

    updateWorldTimes(now = new Date()) {
        const style = this.state.mainClockStyle || 'digital';

        // Update Digital Face
        const timeWrap = this.content.querySelector('.clock-main-time-wrap');
        if (timeWrap && !['analog', 'classic', 'swiss'].includes(style)) {
            const { time, ampm } = this.formatTimeParts(now);
            const timeText = timeWrap.querySelector('.clock-time-text');
            const ampmText = timeWrap.querySelector('.clock-ampm-text');
            if (timeText) timeText.textContent = time;
            if (ampmText) {
                ampmText.textContent = ampm;
                ampmText.style.display = ampm ? 'inline' : 'none';
            } else if (ampm) {
                // If it mistakenly didn't exist (e.g. switched modes), reconstruct
                // This is a simple update loop; full re-render handles structural changes
            }
        }

        // Update Analog Pill
        const pill = this.content.querySelector('.clock-face-pill');
        if (pill) {
            const { time, ampm } = this.formatTimeParts(now);
            pill.textContent = `${time} ${ampm}`;
        }

        const mainDate = this.content.querySelector('.clock-main-date');
        if (mainDate) mainDate.textContent = this.formatMainDate(now);

        if (['analog', 'classic', 'swiss'].includes(style)) {
            const canvas = this.content.querySelector('.clock-main-analog');
            if (canvas) this.drawMainAnalog(now, canvas, style);
        }

        this.content.querySelectorAll('.clock-world-time').forEach(el => {
            const tz = el.dataset.tz;
            el.textContent = this.formatWorldTime(tz, now);
        });
    }

    createStyleButton(id, label) {
        return el('button', {
            class: `clock-main-style-btn ${(this.state.mainClockStyle || 'digital') === id ? 'is-active' : ''}`,
            type: 'button',
            onclick: () => {
                this.state.mainClockStyle = id;
                this.saveState();
                this.renderWorld();
            }
        }, label);
    }

    renderMainFace(now, style) {
        const face = el('div', { class: `clock-main-face clock-main-face-${style}` });
        if (['analog', 'classic', 'swiss'].includes(style)) {
            const canvas = el('canvas', { class: 'clock-main-analog', width: '220', height: '220', 'data-role': 'main-analog' });
            face.appendChild(canvas);
            this.drawMainAnalog(now, canvas, style);
            face.appendChild(el('div', { class: 'clock-main-date', 'data-role': 'main-date' }, this.formatMainDate(now)));
            return face;
        }
        face.appendChild(el('div', { class: 'clock-main-time', 'data-role': 'main-time' }, this.formatMainTime(now)));
        face.appendChild(el('div', { class: 'clock-main-date', 'data-role': 'main-date' }, this.formatMainDate(now)));
        return face;
    }

    drawMainAnalog(now, canvas, mode = 'analog') {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        const r = Math.min(w, h) / 2 - 10;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.translate(w / 2, h / 2);

        // Face
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = mode === 'classic'
            ? 'rgba(18, 15, 12, 0.9)'
            : mode === 'swiss'
                ? 'rgba(236, 243, 249, 0.96)'
                : 'rgba(6, 20, 34, 0.85)';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = mode === 'swiss'
            ? 'rgba(30, 40, 52, 0.35)'
            : mode === 'classic'
                ? 'rgba(218, 194, 151, 0.45)'
                : 'rgba(160, 220, 255, 0.45)';
        ctx.stroke();

        // Ticks
        for (let i = 0; i < 12; i++) {
            ctx.save();
            ctx.rotate((Math.PI / 6) * i);
            ctx.beginPath();
            ctx.moveTo(0, -r + 12);
            ctx.lineTo(0, -r + 26);
            ctx.lineWidth = mode === 'swiss' ? 2 : 3;
            ctx.strokeStyle = mode === 'swiss'
                ? 'rgba(25, 33, 44, 0.8)'
                : mode === 'classic'
                    ? 'rgba(240, 224, 188, 0.65)'
                    : 'rgba(210, 240, 255, 0.6)';
            ctx.stroke();
            ctx.restore();
        }

        if (mode === 'classic') {
            ctx.fillStyle = 'rgba(242, 226, 194, 0.8)';
            ctx.font = '15px "Times New Roman", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const romans = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
            romans.forEach((roman, i) => {
                const a = (Math.PI / 6) * i - Math.PI / 2;
                const x = Math.cos(a) * (r - 34);
                const y = Math.sin(a) * (r - 34);
                ctx.fillText(roman, x, y);
            });
        }

        const hour = now.getHours() % 12;
        const minute = now.getMinutes();
        const second = now.getSeconds();

        // Hour hand
        ctx.save();
        ctx.rotate((Math.PI / 6) * hour + (Math.PI / 360) * minute);
        ctx.beginPath();
        ctx.moveTo(0, 8);
        ctx.lineTo(0, -r * 0.45);
        ctx.lineWidth = mode === 'swiss' ? 5 : 6;
        ctx.strokeStyle = mode === 'swiss' ? '#202935' : mode === 'classic' ? '#e7d2a6' : '#7ef6e5';
        ctx.stroke();
        ctx.restore();

        // Minute hand
        ctx.save();
        ctx.rotate((Math.PI / 30) * minute + (Math.PI / 1800) * second);
        ctx.beginPath();
        ctx.moveTo(0, 12);
        ctx.lineTo(0, -r * 0.7);
        ctx.lineWidth = mode === 'swiss' ? 3 : 4;
        ctx.strokeStyle = mode === 'swiss' ? '#2b3948' : mode === 'classic' ? '#d9bb82' : '#5ac6ff';
        ctx.stroke();
        ctx.restore();

        // Second hand
        ctx.save();
        ctx.rotate((Math.PI / 30) * second);
        ctx.beginPath();
        ctx.moveTo(0, 14);
        ctx.lineTo(0, -r * 0.78);
        ctx.lineWidth = 2;
        ctx.strokeStyle = mode === 'swiss' ? '#e44848' : '#ffffff';
        ctx.stroke();
        ctx.restore();

        // Center
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fillStyle = mode === 'swiss' ? '#2b3948' : mode === 'classic' ? '#e7d2a6' : '#d4f5ff';
        ctx.fill();
        ctx.restore();
    }

    formatWorldTime(tz, now) {
        try {
            return new Intl.DateTimeFormat('en-US', {
                hour: '2-digit', minute: '2-digit', hour12: !this.state.use24h, timeZone: tz
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
            return `${day} · GMT${offset}`;
        } catch (_) { return '—'; }
    }

    removeWorldClock(tz) {
        this.state.worldClocks = this.state.worldClocks.filter(w => w.tz !== tz);
        this.saveState();
        this.renderWorldList();
    }

    moveWorldClock(tz, direction) {
        const i = this.state.worldClocks.findIndex((w) => w.tz === tz);
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
        const i = this.state.worldClocks.findIndex((w) => w.tz === tz);
        if (i < 0) return;
        const copy = [...this.state.worldClocks];
        copy[i] = { ...copy[i], pinned: !copy[i].pinned };
        this.state.worldClocks = this.sortWorldClocksByPin(copy);
        this.saveState();
        this.renderWorldList();
    }

    addWorldFromInput(value, box) {
        const term = value.trim();
        if (!term) return;
        const fuzzy = this.cityDb.find(c => c.name.toLowerCase() === term.toLowerCase());
        if (fuzzy) {
            this.addWorldClock(fuzzy.name, fuzzy.tz);
            box.classList.remove('is-open');
            box.innerHTML = '';
            if (this.worldInput) this.worldInput.value = '';
            return;
        }
        const partial = this.cityDb.find((c) =>
            c.name.toLowerCase().includes(term.toLowerCase()) || c.tz.toLowerCase().includes(term.toLowerCase())
        );
        if (partial) {
            this.addWorldClock(partial.name, partial.tz);
            box.classList.remove('is-open');
            box.innerHTML = '';
            if (this.worldInput) this.worldInput.value = '';
            return;
        }
        if (term.includes('/')) {
            try {
                new Intl.DateTimeFormat('en-US', { timeZone: term }).format(new Date());
                this.addWorldClock(term.split('/').pop().replace(/_/g, ' '), term);
                box.classList.remove('is-open');
                box.innerHTML = '';
                if (this.worldInput) this.worldInput.value = '';
            } catch (_) {
                this.notify('Unknown timezone');
            }
        }
    }

    queueSearch(term, box) {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.searchTimeZones(term, box), 250);
    }

    async searchTimeZones(term, box) {
        const query = term.trim();
        if (query.length < 2) { box.classList.remove('is-open'); box.innerHTML = ''; return; }

        // Remote geocode
        try {
            const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                const results = Array.isArray(data?.results) ? data.results : [];
                const mapped = results.filter(r => r.timezone).map(r => ({
                    name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
                    tz: r.timezone
                }));
                if (mapped.length) { this.renderSuggestionList(mapped, box); return; }
            }
        } catch (_) { /* ignore */ }

        // Fallback fuzzy
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
            const btn = el('button', {
                class: 'clock-suggestion',
                onclick: () => {
                    this.addWorldClock(name, tz);
                    box.classList.remove('is-open');
                    box.innerHTML = '';
                    if (this.worldInput) this.worldInput.value = '';
                }
            }, `${name} — ${tz}`);
            box.appendChild(btn);
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

    /* ---------- Alarms ---------- */
    renderAlarms() {
        this.content.innerHTML = '';
        const alarmAudio = this.normalizeAlarmAudio(this.state.alarmAudio);
        this.state.alarmAudio = alarmAudio;

        // Alarm List Container
        const list = el('div', { class: 'clock-alarm-list' });

        // Header / Summary
        const summary = el('div', { class: 'clock-alarm-summary' }, [
            el('h3', {}, 'Alarms'),
            el('p', {}, this.getNextAlarmSummary())
        ]);

        list.appendChild(summary);

        // List Items
        this.state.alarms.forEach((alarm, i) => {
            const row = el('div', { class: 'clock-alarm-row' }, [
                el('div', { class: 'clock-alarm-time' }, alarm.time),
                el('div', { class: 'clock-alarm-meta' }, [
                    el('div', { class: 'clock-alarm-label' }, alarm.label || 'Alarm'),
                    el('div', { class: 'clock-alarm-days' }, this.formatDaySummary(alarm.days))
                ]),
                el('div', { class: 'clock-alarm-controls' }, [
                    el('button', {
                        class: `clock-toggle-switch ${alarm.enabled ? 'is-on' : ''}`,
                        onclick: (e) => {
                            e.stopPropagation();
                            alarm.enabled = !alarm.enabled;
                            this.saveState();
                            this.renderAlarms();
                        }
                    }, el('div', { class: 'toggle-knob' }))
                ])
            ]);

            row.onclick = (e) => {
                if (e.target.closest('.clock-toggle-switch')) return;
                this.editingAlarmId = this.editingAlarmId === alarm.id ? null : alarm.id;
                this.renderAlarms();
            };

            list.appendChild(row);

            if (this.editingAlarmId === alarm.id) {
                list.appendChild(this.buildAlarmEditor(alarm, i));
            }
        });

        // Add Button (Floating or Bottom List)
        const addRow = this.buildAddAlarmRow();
        list.appendChild(addRow);

        this.content.appendChild(list);
    }

    buildAddAlarmRow() {
        const timeInput = el('input', { class: 'clock-input', type: 'time', value: '07:00' });
        const labelInput = el('input', { class: 'clock-input', placeholder: 'Label' });
        const addBtn = el('button', {
            class: 'clock-btn primary full-width',
            onclick: () => {
                this.state.alarms.push(this.normalizeAlarm({
                    id: `alarm-${Date.now()}`,
                    time: timeInput.value,
                    label: labelInput.value || 'Alarm',
                    enabled: true,
                    days: [0, 1, 2, 3, 4, 5, 6],
                    snoozeMins: 9
                }));
                this.saveState();
                this.renderAlarms();
            }
        }, '+ Add Alarm');

        return el('div', { class: 'clock-add-section' }, [
            el('div', { class: 'clock-add-inputs' }, [timeInput, labelInput]),
            addBtn
        ]);
    }

    buildAlarmEditor(alarm, index) {
        const editor = el('div', { class: 'clock-alarm-editor' });
        const timeInput = el('input', { class: 'clock-input', type: 'time', value: alarm.time || '07:00' });
        const labelInput = el('input', { class: 'clock-input', value: alarm.label || 'Alarm' });

        // Days
        const daySet = new Set(Array.isArray(alarm.days) ? alarm.days : [0, 1, 2, 3, 4, 5, 6]);
        const dayRow = el('div', { class: 'clock-day-row' });
        this.dayShort.forEach((d, idx) => {
            const chip = el('button', {
                class: `clock-day-chip ${daySet.has(idx) ? 'is-active' : ''}`,
                onclick: () => {
                    if (daySet.has(idx)) daySet.delete(idx); else daySet.add(idx);
                    chip.classList.toggle('is-active', daySet.has(idx));
                }
            }, d);
            dayRow.appendChild(chip);
        });

        const actions = el('div', { class: 'clock-editor-actions' }, [
            el('button', {
                class: 'clock-btn danger',
                onclick: () => {
                    this.state.alarms.splice(index, 1);
                    this.editingAlarmId = null;
                    this.saveState();
                    this.renderAlarms();
                }
            }, 'Delete'),
            el('button', {
                class: 'clock-btn primary',
                onclick: () => {
                    alarm.time = timeInput.value;
                    alarm.label = labelInput.value;
                    alarm.days = Array.from(daySet).sort((a, b) => a - b);
                    this.editingAlarmId = null;
                    this.saveState();
                    this.renderAlarms();
                }
            }, 'Save')
        ]);

        editor.append(dayRow, el('div', { class: 'clock-editor-inputs' }, [timeInput, labelInput]), actions);
        return editor;
    }

    /* ---------- Stopwatch ---------- */
    /* ---------- Stopwatch ---------- */
    renderStopwatch() {
        this.content.innerHTML = '';
        const elapsed = this.getStopwatchElapsed();

        const display = el('div', { class: 'clock-display-large' }, this.formatDuration(elapsed));

        // Controls
        const startBtn = el('button', {
            class: `clock-circle-btn ${this.state.stopwatch.running ? 'stop' : 'start'}`,
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
            }
        }, this.state.stopwatch.running ? 'Stop' : 'Start');

        const lapBtn = el('button', {
            class: 'clock-circle-btn secondary',
            onclick: () => {
                if (this.state.stopwatch.running) {
                    const now = Date.now();
                    const elapsedNow = this.syncStopwatchElapsed(now);
                    this.state.stopwatch.laps.push(elapsedNow);
                    this.saveState();
                    this.renderStopwatch();
                } else {
                    // Reset
                    this.state.stopwatch = { elapsed: 0, running: false, laps: [], lastStart: null };
                    this.saveState();
                    this.renderStopwatch();
                }
            }
        }, this.state.stopwatch.running ? 'Lap' : 'Reset');

        const controls = el('div', { class: 'clock-controls-row' }, [lapBtn, startBtn]);

        // Laps
        const lapsList = el('div', { class: 'clock-laps-list' });
        [...this.state.stopwatch.laps].reverse().forEach((lap, i) => {
            const idx = this.state.stopwatch.laps.length - i;
            lapsList.appendChild(el('div', { class: 'clock-lap-item' }, [
                el('span', {}, `Lap ${idx}`),
                el('span', { class: 'mono' }, this.formatDuration(lap))
            ]));
        });

        this.content.append(display, controls, lapsList);
    }

    updateStopwatch(nowDate = new Date()) {
        if (!this.state.stopwatch.running) return;
        const nowMs = nowDate.getTime();
        const elapsed = this.syncStopwatchElapsed(nowMs);
        const display = this.content.querySelector('.clock-display-large');
        if (display) display.textContent = this.formatDuration(elapsed);
        if (!this.lastStopwatchSave || nowMs - this.lastStopwatchSave > 5000) {
            this.lastStopwatchSave = nowMs;
            this.saveState();
        }
    }

    /* ---------- Timer ---------- */
    renderTimer() {
        this.content.innerHTML = '';
        const remaining = this.syncTimerRemaining();

        // Progress Ring (Visual Only for now, could be canvas)
        const display = el('div', { class: 'clock-display-large clock-timer-display' }, this.formatDuration(remaining * 1000));

        // Controls
        const startBtn = el('button', {
            class: `clock-circle-btn ${this.state.timer.running ? 'stop' : 'start'}`,
            onclick: () => {
                const now = Date.now();
                if (this.state.timer.running) {
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
            }
        }, this.state.timer.running ? 'Pause' : 'Start');

        const cancelBtn = el('button', {
            class: 'clock-circle-btn secondary',
            onclick: () => {
                this.state.timer.remaining = this.state.timer.duration;
                this.state.timer.running = false;
                this.state.timer.endsAt = null;
                this.saveState();
                this.renderTimer();
            }
        }, 'Reset');

        const controls = el('div', { class: 'clock-controls-row' }, [cancelBtn, startBtn]);

        // Quick Adds
        const quickAdd = el('div', { class: 'clock-timer-presets' },
            [1, 5, 10, 15].map(m => el('button', {
                class: 'clock-pill-btn',
                onclick: () => {
                    this.state.timer.duration = m * 60;
                    this.state.timer.remaining = m * 60;
                    this.state.timer.running = false;
                    this.state.timer.endsAt = null;
                    this.saveState();
                    this.renderTimer();
                }
            }, `+${m}m`))
        );

        this.content.append(display, controls, quickAdd);
    }

    updateTimer(nowDate = new Date()) {
        const nowMs = nowDate.getTime();
        if (!this.state.timer.running) return;
        this.syncTimerRemaining(nowMs);
        if (!this.lastTimerSave || nowMs - this.lastTimerSave > 5000) {
            this.lastTimerSave = nowMs;
            this.saveState();
        }
        const display = this.content.querySelector('.clock-timer-display');
        if (display) display.textContent = this.formatDuration(this.state.timer.remaining * 1000);
        if (this.state.timer.remaining <= 0) {
            this.state.timer.running = false;
            this.state.timer.endsAt = null;
            this.saveState();
            alert('Timer Complete!');
        }
    }

    /* ---------- Helpers ---------- */
    setupDepthFx() {
        if (!this.root) return;
        this.teardownDepthFx();
        if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            this.resetDepthFxVars();
            return;
        }

        const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
        const queueFromPoint = (clientX, clientY, pressed = false) => {
            const rect = this.root.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const nx = clamp((clientX - rect.left) / rect.width, 0, 1) - 0.5;
            const ny = clamp((clientY - rect.top) / rect.height, 0, 1) - 0.5;

            if (this.depthRaf) cancelAnimationFrame(this.depthRaf);
            this.depthRaf = requestAnimationFrame(() => {
                this.depthRaf = null;
                this.root.style.setProperty('--clock-card-tilt-x', `${(ny * -6.5).toFixed(2)}deg`);
                this.root.style.setProperty('--clock-card-tilt-y', `${(nx * 8).toFixed(2)}deg`);
                this.root.style.setProperty('--clock-shift-soft-x', `${(nx * 2).toFixed(2)}px`);
                this.root.style.setProperty('--clock-shift-soft-y', `${(ny * 2).toFixed(2)}px`);
                this.root.style.setProperty('--clock-shift-mid-x', `${(nx * 5).toFixed(2)}px`);
                this.root.style.setProperty('--clock-shift-mid-y', `${(ny * 5).toFixed(2)}px`);
                this.root.style.setProperty('--clock-shift-strong-x', `${(nx * 9).toFixed(2)}px`);
                this.root.style.setProperty('--clock-shift-strong-y', `${(ny * 9).toFixed(2)}px`);
                this.root.style.setProperty('--clock-orb-shift-x', `${(nx * 18).toFixed(2)}px`);
                this.root.style.setProperty('--clock-orb-shift-y', `${(ny * 14).toFixed(2)}px`);
                this.root.style.setProperty('--clock-glow-x', `${(50 + nx * 42).toFixed(2)}%`);
                this.root.style.setProperty('--clock-glow-y', `${(28 + ny * 28).toFixed(2)}%`);
                this.root.classList.toggle('is-pressing', pressed);
            });
        };

        const resetSoon = () => {
            this.root.classList.remove('is-pressing');
            this.resetDepthFxVars();
        };

        const onPointerMove = (e) => queueFromPoint(e.clientX, e.clientY);
        const onPointerDown = (e) => queueFromPoint(e.clientX, e.clientY, true);
        const onPointerUp = () => this.root.classList.remove('is-pressing');
        const onPointerLeave = () => resetSoon();
        const onTouchMove = (e) => {
            const t = e.touches && e.touches[0];
            if (t) queueFromPoint(t.clientX, t.clientY);
        };
        const onTouchStart = (e) => {
            const t = e.touches && e.touches[0];
            if (t) queueFromPoint(t.clientX, t.clientY, true);
        };
        const onTouchEnd = () => resetSoon();

        this.root.addEventListener('pointermove', onPointerMove);
        this.root.addEventListener('pointerdown', onPointerDown);
        this.root.addEventListener('pointerup', onPointerUp);
        this.root.addEventListener('pointercancel', onPointerLeave);
        this.root.addEventListener('pointerleave', onPointerLeave);
        this.root.addEventListener('touchstart', onTouchStart, { passive: true });
        this.root.addEventListener('touchmove', onTouchMove, { passive: true });
        this.root.addEventListener('touchend', onTouchEnd, { passive: true });
        this.root.addEventListener('touchcancel', onTouchEnd, { passive: true });

        this.depthCleanup = () => {
            this.root.removeEventListener('pointermove', onPointerMove);
            this.root.removeEventListener('pointerdown', onPointerDown);
            this.root.removeEventListener('pointerup', onPointerUp);
            this.root.removeEventListener('pointercancel', onPointerLeave);
            this.root.removeEventListener('pointerleave', onPointerLeave);
            this.root.removeEventListener('touchstart', onTouchStart);
            this.root.removeEventListener('touchmove', onTouchMove);
            this.root.removeEventListener('touchend', onTouchEnd);
            this.root.removeEventListener('touchcancel', onTouchEnd);
        };
        this.resetDepthFxVars();
    }

    resetDepthFxVars() {
        if (!this.root) return;
        this.root.style.setProperty('--clock-card-tilt-x', '0deg');
        this.root.style.setProperty('--clock-card-tilt-y', '0deg');
        this.root.style.setProperty('--clock-shift-soft-x', '0px');
        this.root.style.setProperty('--clock-shift-soft-y', '0px');
        this.root.style.setProperty('--clock-shift-mid-x', '0px');
        this.root.style.setProperty('--clock-shift-mid-y', '0px');
        this.root.style.setProperty('--clock-shift-strong-x', '0px');
        this.root.style.setProperty('--clock-shift-strong-y', '0px');
        this.root.style.setProperty('--clock-orb-shift-x', '0px');
        this.root.style.setProperty('--clock-orb-shift-y', '0px');
        this.root.style.setProperty('--clock-glow-x', '50%');
        this.root.style.setProperty('--clock-glow-y', '28%');
    }

    teardownDepthFx() {
        if (this.depthRaf) {
            cancelAnimationFrame(this.depthRaf);
            this.depthRaf = null;
        }
        if (this.depthCleanup) {
            this.depthCleanup();
            this.depthCleanup = null;
        }
    }

    setThemeByTime(now) {
        const theme = this.resolveThemeBySun(now);
        this.root.dataset.clockTheme = theme;
        this.updateSkyLayer(theme);
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
                const noon = new Date(now);
                noon.setHours(12, 0, 0, 0);
                if (current < dawnStart) return 'night';
                if (current < dawnEnd) return 'dawn';
                if (current < sunsetStart) return current < noon.getTime() ? 'morning' : 'afternoon';
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

    updateSkyLayer(phase) {
        if (!this.skyLayer) return;
        this.skyLayer.dataset.phase = phase || 'night';
        if (!this.state.weatherFxEnabled) {
            this.skyLayer.dataset.weather = 'off';
            return;
        }
        this.skyLayer.dataset.weather = this.getWeatherBucket(this.state.weatherCode);
    }

    getWeatherBucket(code) {
        if (!Number.isFinite(code)) return 'clear';
        if ([45, 48].includes(code)) return 'fog';
        if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
        if ([95, 96, 99].includes(code)) return 'storm';
        if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
        if ([1, 2, 3].includes(code)) return 'cloudy';
        return 'clear';
    }

    async refreshSkyWeather() {
        if (this.weatherFetchInFlight) return;
        const coords = this.getWeatherCoords();
        if (!coords) {
            this.lastWeatherFetch = Date.now();
            return;
        }
        this.weatherFetchInFlight = true;
        try {
            const needsWeather = this.state.weatherFxEnabled;
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=sunrise,sunset&forecast_days=1&timezone=auto${needsWeather ? '&current=weather_code' : ''}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                let changed = false;
                const code = Number(data?.current?.weather_code);
                if (needsWeather && Number.isFinite(code) && this.state.weatherCode !== code) {
                    this.state.weatherCode = code;
                    changed = true;
                }
                const sunrise = data?.daily?.sunrise?.[0];
                const sunset = data?.daily?.sunset?.[0];
                const sunDate = data?.daily?.time?.[0];
                if (typeof sunrise === 'string' && typeof sunset === 'string') {
                    const nextSun = { date: sunDate || sunrise.slice(0, 10), sunrise, sunset };
                    const prev = this.state.sunTimes || {};
                    if (prev.date !== nextSun.date || prev.sunrise !== nextSun.sunrise || prev.sunset !== nextSun.sunset) {
                        this.state.sunTimes = nextSun;
                        changed = true;
                    }
                }
                if (changed) {
                    this.saveState();
                }
            }
        } catch (_) {
            // Keep last known sky state on network failures.
        } finally {
            this.lastWeatherFetch = Date.now();
            this.weatherFetchInFlight = false;
            this.updateSkyLayer(this.root.dataset.clockTheme || 'night');
        }
    }

    getWeatherCoords() {
        try {
            const legacy = JSON.parse(localStorage.getItem('yancotab_weather_v1') || 'null');
            if (legacy && Number.isFinite(Number(legacy.lat)) && Number.isFinite(Number(legacy.lon))) {
                return { lat: Number(legacy.lat), lon: Number(legacy.lon) };
            }
        } catch (_) { /* ignore */ }
        try {
            const state = JSON.parse(localStorage.getItem('yancotabWeatherState') || 'null');
            const loc = state?.currentLocation;
            if (loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon))) {
                return { lat: Number(loc.lat), lon: Number(loc.lon) };
            }
        } catch (_) { /* ignore */ }
        return null;
    }

    normalizeAlarm(alarm) {
        const days = Array.isArray(alarm?.days)
            ? alarm.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b)
            : [0, 1, 2, 3, 4, 5, 6];
        return {
            id: alarm?.id || `alarm-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            time: typeof alarm?.time === 'string' ? alarm.time : '07:00',
            label: typeof alarm?.label === 'string' ? alarm.label : 'Alarm',
            enabled: alarm?.enabled !== false,
            days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
            snoozeMins: Number.isFinite(Number(alarm?.snoozeMins)) ? Math.max(1, Math.min(30, Number(alarm.snoozeMins))) : 9,
            snoozedUntil: Number.isFinite(Number(alarm?.snoozedUntil)) ? Number(alarm.snoozedUntil) : null,
            lastTriggerKey: typeof alarm?.lastTriggerKey === 'string' ? alarm.lastTriggerKey : ''
        };
    }

    normalizeAlarmAudio(audio) {
        const tone = typeof audio?.tone === 'string' ? audio.tone : 'pulse';
        const allowed = ['pulse', 'chime', 'soft'];
        return {
            tone: allowed.includes(tone) ? tone : 'pulse',
            volume: Number.isFinite(Number(audio?.volume)) ? Math.max(0.05, Math.min(1, Number(audio.volume))) : 0.45
        };
    }

    normalizeWorldClock(entry) {
        if (!entry || typeof entry !== 'object' || !entry.tz) return null;
        return {
            label: entry.label || entry.tz.split('/').pop().replace(/_/g, ' '),
            tz: entry.tz,
            pinned: entry.pinned === true
        };
    }

    sortWorldClocksByPin(list = this.state.worldClocks) {
        const pins = [];
        const rest = [];
        list.forEach((item) => {
            if (item.pinned) pins.push(item); else rest.push(item);
        });
        return [...pins, ...rest];
    }

    addWorldClock(label, tz) {
        const normalized = this.normalizeWorldClock({ label, tz, pinned: false });
        if (!normalized) return false;
        if (this.state.worldClocks.some((w) => w.tz === normalized.tz)) {
            this.notify('City already added');
            return false;
        }
        this.state.worldClocks = this.sortWorldClocksByPin([normalized, ...this.state.worldClocks.map((w) => this.normalizeWorldClock(w)).filter(Boolean)]);
        this.saveState();
        this.renderWorldList();
        return true;
    }

    previewAlarmSound() {
        const audio = this.normalizeAlarmAudio(this.state.alarmAudio);
        this.state.alarmAudio = audio;
        this.saveState();
        const clock = this.kernel?.getService?.('clock');
        if (clock && typeof clock.playAlarmSound === 'function') {
            clock.playAlarmSound(audio);
        }
    }

    notify(message) {
        window.dispatchEvent(new CustomEvent('yancotab:notify', { detail: { message } }));
    }

    getNextForAlarmLabel(alarm) {
        const next = this.getNextAlarmDate(alarm, new Date());
        if (!next) return 'Next: —';
        return `Next: ${next.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: !this.state.use24h })}`;
    }

    getNextAlarmSummary() {
        const now = new Date();
        let nextAlarm = null;
        this.state.alarms.forEach((alarm) => {
            if (!alarm.enabled) return;
            const next = this.getNextAlarmDate(alarm, now);
            if (!next) return;
            if (!nextAlarm || next < nextAlarm) nextAlarm = next;
        });
        if (!nextAlarm) return 'No upcoming alarms';
        return `Next alarm: ${nextAlarm.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: !this.state.use24h })}`;
    }

    getNextAlarmDate(alarm, fromDate) {
        if (alarm.snoozedUntil && alarm.snoozedUntil > fromDate.getTime()) {
            return new Date(alarm.snoozedUntil);
        }
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
        if (wk.every((d) => days.includes(d)) && days.length === 5) return 'Weekdays';
        return days.map((d) => this.dayShort[d] || '').join(' ');
    }

    formatDuration(ms) {
        const totalSec = Math.max(0, Math.floor(ms / 1000));
        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    getStopwatchElapsed(nowMs = Date.now()) {
        const stopwatch = this.state.stopwatch || {};
        const base = Number.isFinite(stopwatch.elapsed) ? Math.max(0, stopwatch.elapsed) : 0;
        if (!stopwatch.running || !Number.isFinite(stopwatch.lastStart)) return base;
        return base + Math.max(0, nowMs - stopwatch.lastStart);
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
        if (!timer.running) return remaining;
        if (!Number.isFinite(timer.endsAt)) return remaining;
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



    buildCityDb() {
        const cities = [
            ['Louisville, KY', 'America/New_York'], // requested
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
            ['Honolulu', 'Pacific/Honolulu'], ['Anchorage', 'America/Anchorage']
        ];
        return cities.map(([name, tz]) => ({ name, tz }));
    }

    destroy() {
        if (this.teardownDepthFx) this.teardownDepthFx();
        this.intervals.forEach((i) => clearInterval(i));
        this.intervals = [];
        if (this.onClockUpdate) window.removeEventListener('yancotab:clock_update', this.onClockUpdate);
        super.destroy();
    }
}
