/**
 * MemoryApp — "Neon Recall"
 *
 * Full-canvas immersive memory card game with:
 *  - Neon card visuals with smooth flip animations
 *  - Glowing emoji symbols on card faces
 *  - Particle bursts on match, shake on mismatch
 *  - 3 difficulties: Easy 4×3, Medium 4×4, Hard 5×4
 *  - Combo system: consecutive matches earn bonus
 *  - Moves + timer tracking, best scores per difficulty
 *  - Hex grid background with floating particles
 *  - Keyboard cursor + tap controls
 *  - Proper state machine & button system (lessons from Snake/Minesweeper)
 */
import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

/* ── Constants ── */
const LS_KEY = 'yancotab_neon_recall';

const COLORS = {
    cyan:    { h: 174, s: 72, main: '#2dd4bf', rgb: '45,212,191'  },
    magenta: { h: 330, s: 75, main: '#e855a0', rgb: '232,85,160'  },
    gold:    { h: 45,  s: 90, main: '#f5b731', rgb: '245,183,49'  },
    emerald: { h: 155, s: 70, main: '#34d399', rgb: '52,211,153'  },
};

const DIFFICULTIES = {
    easy:   { label: 'Easy',   cols: 4, rows: 3, pairs: 6  },
    medium: { label: 'Medium', cols: 4, rows: 4, pairs: 8  },
    hard:   { label: 'Hard',   cols: 5, rows: 4, pairs: 10 },
};

/* Emoji symbols for card faces — visually distinct, render well on canvas */
const SYMBOLS = [
    '☀️', '🌙', '⭐', '💎', '🔮', '🌊',
    '❄️', '🔥', '⚡', '💫', '🌸', '🎯',
    '♦️', '🍀', '🦋',
];

/* ── App Shell ── */
export class MemoryApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = {
            name: 'Memory',
            id: 'memory',
            icon: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#10121a'/><stop offset='1' stop-color='#7c3aed'/></linearGradient></defs><rect x='12' y='12' width='104' height='104' rx='28' fill='url(#g)'/><rect x='14' y='14' width='100' height='100' rx='26' fill='rgba(255,255,255,0.06)'/><g fill='none' stroke='rgba(255,255,255,0.92)' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'><rect x='34' y='40' width='40' height='56' rx='10'/><rect x='54' y='32' width='40' height='56' rx='10'/><path d='M74 54c-4-7-14-6-14 3 0 10 14 18 14 18s14-8 14-18c0-9-10-10-14-3z' fill='rgba(255,255,255,0.92)' stroke='none'/></g></svg>`
        };
        this.game = null;
    }

    async init() {
        this.root = el('div', { class: 'app-window app-memory' });
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'memory-canvas';
        this.canvas.tabIndex = 0;
        Object.assign(this.canvas.style, {
            width: '100%', height: '100%', display: 'block', outline: 'none',
        });
        this.root.appendChild(this.canvas);

        this.game = new NeonRecall(this.canvas, () => this._checkResize());
        this._pollStart();
    }

    _pollStart() {
        const r = this.root.getBoundingClientRect();
        if (r.width >= 40 && r.height >= 40) {
            this._resize();
            this.game.start();
            this.canvas.focus();
            this._ro = new ResizeObserver(() => this._resize());
            this._ro.observe(this.root);
        } else {
            setTimeout(() => this._pollStart(), 50);
        }
    }

    _checkResize() {
        const r = this.root.getBoundingClientRect();
        const w = Math.floor(r.width), h = Math.floor(r.height);
        if (w < 40 || h < 40) return;
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
            this.game.resize(w, h);
        }
    }

    _resize() {
        this._checkResize();
        this.canvas.focus();
    }

    destroy() {
        if (this._ro) this._ro.disconnect();
        if (this.game) this.game.stop();
        super.destroy();
    }
}


/* ════════════════════════════════════════════════════════════════
   NeonRecall — Core game engine
   ════════════════════════════════════════════════════════════════ */
class NeonRecall {
    constructor(canvas, onFrame) {
        this.cv = canvas;
        this.ctx = canvas.getContext('2d');
        this._onFrame = onFrame;
        this.W = canvas.width;
        this.H = canvas.height;

        /* State machine */
        this.state = 'MENU'; // MENU | SETTINGS | PLAYING | WIN

        /* Animation */
        this.running = false;
        this.tick = 0;

        /* Game config */
        this.difficulty = 'easy';

        /* Card state */
        this.cards = [];       // [{symbol, faceUp, matched, flipAnim, shakeTick, matchTick, index}]
        this.cols = 4;
        this.rows = 3;
        this.firstPick = -1;   // index of first flipped card
        this.secondPick = -1;  // index of second flipped card
        this.locked = false;   // input locked during mismatch reveal
        this.lockUntil = 0;    // tick when lock releases

        /* Stats */
        this.moves = 0;
        this.matchCount = 0;
        this.totalPairs = 6;
        this.combo = 0;        // consecutive matches
        this.timerStart = 0;
        this.timerElapsed = 0;
        this.timerRunning = false;

        /* Grid rendering */
        this.cardW = 60;
        this.cardH = 80;
        this.cardGap = 8;
        this.gridOffX = 0;
        this.gridOffY = 0;
        this.HUD_HEIGHT = 44;

        /* Keyboard cursor */
        this.cursorIdx = -1;

        /* Hover */
        this.hoverIdx = -1;

        /* Particles & effects */
        this.particles = [];
        this.floatTexts = [];

        /* Persistence */
        this._loadSave();
        this._bindInput();

        this.lastFrame = 0;
    }

    /* ── Save / Load ── */
    _loadSave() {
        try {
            const d = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
            this.theme = COLORS[d.theme] ? d.theme : 'cyan';
            this.bestScores = d.bestScores || {};
            this.gamesPlayed = d.gamesPlayed || 0;
            this.gamesWon = d.gamesWon || 0;
            if (DIFFICULTIES[d.difficulty]) this.difficulty = d.difficulty;
        } catch {
            this.theme = 'cyan';
            this.bestScores = {};
            this.gamesPlayed = 0;
            this.gamesWon = 0;
        }
    }
    _save() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({
                theme: this.theme,
                bestScores: this.bestScores,
                gamesPlayed: this.gamesPlayed,
                gamesWon: this.gamesWon,
                difficulty: this.difficulty,
            }));
        } catch { /* ignore */ }
    }

    get themeColor() { return COLORS[this.theme]; }

    /* ── Input ── */
    _bindInput() {
        this._buttons = [];

        /* Keyboard — stopPropagation prevents mobileShell from closing app */
        this.cv.addEventListener('keydown', e => {
            const k = e.key;
            let handled = false;

            if (this.state === 'PLAYING') {
                if (k === 'ArrowUp') { this._moveCursor(-this.cols); handled = true; }
                else if (k === 'ArrowDown') { this._moveCursor(this.cols); handled = true; }
                else if (k === 'ArrowLeft') { this._moveCursor(-1); handled = true; }
                else if (k === 'ArrowRight') { this._moveCursor(1); handled = true; }
                else if (k === ' ' || k === 'Enter') {
                    if (this.cursorIdx >= 0) this._flipCard(this.cursorIdx);
                    handled = true;
                }
                else if (k === 'Escape') { this.state = 'MENU'; handled = true; }
            } else if (this.state === 'MENU') {
                if (k === ' ' || k === 'Enter') { this._startGame(); handled = true; }
                else if (k === 's') { this.state = 'SETTINGS'; handled = true; }
                else if (k === '1') { this.difficulty = 'easy'; this._save(); handled = true; }
                else if (k === '2') { this.difficulty = 'medium'; this._save(); handled = true; }
                else if (k === '3') { this.difficulty = 'hard'; this._save(); handled = true; }
            } else if (this.state === 'SETTINGS') {
                if (k === 'Escape' || k === 'Backspace') { this.state = 'MENU'; handled = true; }
                else if (k === 't') { this._cycleTheme(); handled = true; }
            } else if (this.state === 'WIN') {
                if (k === ' ' || k === 'Enter') { this._startGame(); handled = true; }
                else if (k === 'Escape' || k === 'm') { this.state = 'MENU'; handled = true; }
            }

            /* Always consume keys when canvas is focused to prevent shell interference */
            if (handled || k === 'Escape') { e.preventDefault(); e.stopPropagation(); }
        });

        /* Mouse move for hover */
        this.cv.addEventListener('mousemove', e => {
            if (this.state !== 'PLAYING') { this.hoverIdx = -1; return; }
            const r = this.cv.getBoundingClientRect();
            this.hoverIdx = this._pixelToCard(e.clientX - r.left, e.clientY - r.top);
        });
        this.cv.addEventListener('mouseleave', () => { this.hoverIdx = -1; });

        /* Tap / Click */
        let sx = 0, sy = 0, st = 0;
        this.cv.addEventListener('pointerdown', e => {
            sx = e.clientX; sy = e.clientY; st = Date.now();
            this.cv.focus();
        });
        this.cv.addEventListener('pointerup', e => {
            const dx = e.clientX - sx, dy = e.clientY - sy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const elapsed = Date.now() - st;

            if (dist > 15 || elapsed >= 300) return;

            const r = this.cv.getBoundingClientRect();
            const tx = e.clientX - r.left, ty = e.clientY - r.top;

            /* Check buttons first */
            const hit = this._hitButton(tx, ty);
            if (hit) { hit(); return; }

            /* Then check card clicks */
            if (this.state === 'PLAYING') {
                const idx = this._pixelToCard(tx, ty);
                if (idx >= 0) this._flipCard(idx);
            }
        });
    }

    /* Button system */
    _addButton(x, y, w, h, action) {
        this._buttons.push({ x, y, w, h, action });
    }
    _hitButton(tx, ty) {
        for (const b of this._buttons) {
            if (tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h) return b.action;
        }
        return null;
    }

    _cycleTheme() {
        const keys = Object.keys(COLORS);
        this.theme = keys[(keys.indexOf(this.theme) + 1) % keys.length];
        this._save();
    }

    /* Cursor navigation */
    _moveCursor(delta) {
        const total = this.cols * this.rows;
        if (this.cursorIdx < 0) { this.cursorIdx = 0; return; }
        let next = this.cursorIdx + delta;
        if (next < 0) next = 0;
        if (next >= total) next = total - 1;
        this.cursorIdx = next;
    }

    /* Map pixel to card index */
    _pixelToCard(px, py) {
        const gx = px - this.gridOffX;
        const gy = py - this.gridOffY;
        if (gx < 0 || gy < 0) return -1;
        const col = Math.floor(gx / (this.cardW + this.cardGap));
        const row = Math.floor(gy / (this.cardH + this.cardGap));
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
        /* Check we're actually on the card, not the gap */
        const localX = gx - col * (this.cardW + this.cardGap);
        const localY = gy - row * (this.cardH + this.cardGap);
        if (localX > this.cardW || localY > this.cardH) return -1;
        return row * this.cols + col;
    }

    /* ── Game Control ── */
    start() {
        this.running = true;
        this.lastFrame = performance.now();
        this._scheduleLoop();
    }
    _scheduleLoop() {
        if (document.hidden) {
            setTimeout(() => this._loop(performance.now()), 16);
        } else {
            requestAnimationFrame(t => this._loop(t));
        }
    }
    stop() { this.running = false; }

    resize(w, h) {
        this.W = w; this.H = h;
        this._calcGrid();
    }

    /* Calculate card size and grid position to fit */
    _calcGrid() {
        const pad = 12;
        const topSpace = this.HUD_HEIGHT + pad;
        const availW = this.W - pad * 2;
        const availH = this.H - topSpace - pad;

        /* Try to fit cards with gaps */
        const fitW = (availW - (this.cols - 1) * this.cardGap) / this.cols;
        const fitH = (availH - (this.rows - 1) * this.cardGap) / this.rows;

        /* Card aspect ratio ~3:4 */
        let cw = Math.floor(Math.min(fitW, fitH * 0.75, 80));
        cw = Math.max(30, cw);
        let ch = Math.floor(cw * 1.33);
        if (ch > fitH) {
            ch = Math.floor(fitH);
            cw = Math.floor(ch * 0.75);
        }
        cw = Math.max(30, cw);
        ch = Math.max(40, ch);

        this.cardW = cw;
        this.cardH = ch;
        this.cardGap = Math.max(4, Math.floor(Math.min(cw, ch) * 0.1));

        const gridW = this.cols * cw + (this.cols - 1) * this.cardGap;
        const gridH = this.rows * ch + (this.rows - 1) * this.cardGap;
        this.gridOffX = Math.floor((this.W - gridW) / 2);
        this.gridOffY = Math.floor(topSpace + (availH - gridH) / 2);
    }

    /* ── Start Game ── */
    _startGame() {
        const diff = DIFFICULTIES[this.difficulty];
        this.cols = diff.cols;
        this.rows = diff.rows;
        this.totalPairs = diff.pairs;
        this.moves = 0;
        this.matchCount = 0;
        this.combo = 0;
        this.firstPick = -1;
        this.secondPick = -1;
        this.locked = false;
        this.lockUntil = 0;
        this.timerStart = 0;
        this.timerElapsed = 0;
        this.timerRunning = false;
        this.particles = [];
        this.floatTexts = [];
        this.cursorIdx = 0;
        this.hoverIdx = -1;

        /* Build and shuffle deck */
        const symbols = SYMBOLS.slice(0, this.totalPairs);
        const deck = [...symbols, ...symbols];
        this._shuffle(deck);

        this.cards = deck.map((symbol, i) => ({
            symbol,
            faceUp: false,
            matched: false,
            flipAnim: 0,     // 0=face-down, 1=face-up (animated 0→1 or 1→0)
            flipDir: 0,      // 1=flipping up, -1=flipping down, 0=idle
            shakeTick: -1,    // tick when shake started (-1 = no shake)
            matchTick: -1,    // tick when matched (-1 = not matched)
            index: i,
        }));

        this._calcGrid();
        this.state = 'PLAYING';
        this.gamesPlayed++;
        this._save();
    }

    _shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    /* ── Card Flip Logic ── */
    _flipCard(idx) {
        if (this.state !== 'PLAYING') return;
        if (this.locked) return;
        if (idx < 0 || idx >= this.cards.length) return;

        const card = this.cards[idx];
        if (card.faceUp || card.matched) return;

        /* Start timer on first flip */
        if (!this.timerRunning) {
            this.timerStart = performance.now();
            this.timerRunning = true;
        }

        /* Flip face up */
        card.faceUp = true;
        card.flipDir = 1;
        card.flipAnim = 0;
        if (navigator.vibrate) navigator.vibrate(10);

        if (this.firstPick < 0) {
            /* First card of pair */
            this.firstPick = idx;
        } else {
            /* Second card of pair */
            this.secondPick = idx;
            this.moves++;
            this.locked = true;

            const c1 = this.cards[this.firstPick];
            const c2 = this.cards[this.secondPick];

            if (c1.symbol === c2.symbol) {
                /* Match! */
                this._onMatch(this.firstPick, this.secondPick);
            } else {
                /* Mismatch — show briefly then flip back */
                this.lockUntil = this.tick + 50; // ~0.8 sec
            }
        }
    }

    _onMatch(i1, i2) {
        const c1 = this.cards[i1];
        const c2 = this.cards[i2];
        c1.matched = true;
        c2.matched = true;
        c1.matchTick = this.tick;
        c2.matchTick = this.tick;
        this.matchCount++;
        this.combo++;

        /* Particles on both cards */
        const tc = this.themeColor;
        for (const idx of [i1, i2]) {
            const { x, y } = this._cardCenter(idx);
            this._emitParticles(x, y, tc.main, 12);
        }

        /* Float text */
        const { x, y } = this._cardCenter(i2);
        const comboText = this.combo > 1 ? ` x${this.combo}` : '';
        this.floatTexts.push({
            x, y: y - 20, text: `Match!${comboText}`,
            color: this.combo > 2 ? '#fbbf24' : tc.main,
            life: 50, maxLife: 50,
        });

        if (navigator.vibrate) navigator.vibrate([15, 30, 15]);

        this.firstPick = -1;
        this.secondPick = -1;
        this.locked = false;

        /* Check win */
        if (this.matchCount >= this.totalPairs) {
            this._onWin();
        }
    }

    _onMismatchFlipBack() {
        const c1 = this.cards[this.firstPick];
        const c2 = this.cards[this.secondPick];
        c1.faceUp = false;
        c1.flipDir = -1;
        c1.flipAnim = 1;
        c1.shakeTick = this.tick;
        c2.faceUp = false;
        c2.flipDir = -1;
        c2.flipAnim = 1;
        c2.shakeTick = this.tick;
        this.combo = 0; // reset combo on mismatch
        this.firstPick = -1;
        this.secondPick = -1;
        this.locked = false;
    }

    _onWin() {
        this.state = 'WIN';
        this.timerRunning = false;
        this.gamesWon++;

        /* Check best score */
        const key = this.difficulty;
        const current = this.bestScores[key];
        this._isNewBest = !current || this.moves < current.moves ||
            (this.moves === current.moves && this.timerElapsed < current.time);
        if (this._isNewBest) {
            this.bestScores[key] = { moves: this.moves, time: this.timerElapsed };
        }
        this._save();

        /* Celebration particles */
        for (let i = 0; i < 80; i++) {
            const px = Math.random() * this.W;
            const py = Math.random() * this.H * 0.7;
            const colors = ['#2dd4bf', '#e855a0', '#f5b731', '#34d399', '#a78bfa', '#fbbf24'];
            this.particles.push({
                x: px, y: py,
                vx: (Math.random() - 0.5) * 5,
                vy: -2 - Math.random() * 4,
                life: 70 + Math.random() * 70, maxLife: 140,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 2 + Math.random() * 3,
            });
        }
    }

    _cardCenter(idx) {
        const col = idx % this.cols;
        const row = Math.floor(idx / this.cols);
        return {
            x: this.gridOffX + col * (this.cardW + this.cardGap) + this.cardW / 2,
            y: this.gridOffY + row * (this.cardH + this.cardGap) + this.cardH / 2,
        };
    }

    /* ── Particles ── */
    _emitParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 1 + Math.random() * 3;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                life: 35 + Math.random() * 25, maxLife: 60,
                color, size: 1.5 + Math.random() * 2.5,
            });
        }
    }
    _updateParticles() {
        this.particles = this.particles.filter(p => {
            p.x += p.vx; p.y += p.vy;
            p.vx *= 0.96; p.vy *= 0.96;
            p.vy += 0.02;
            p.life--;
            return p.life > 0;
        });
        this.floatTexts = this.floatTexts.filter(f => {
            f.y -= 0.8;
            f.life--;
            return f.life > 0;
        });
    }

    /* ── Main Loop ── */
    _loop(now) {
        if (!this.running) return;
        try {
            if (this._onFrame) this._onFrame();
            this.tick++;

            /* Timer */
            if (this.timerRunning) {
                this.timerElapsed = Math.floor((now - this.timerStart) / 1000);
            }

            /* Mismatch lock expiry */
            if (this.locked && this.lockUntil > 0 && this.tick >= this.lockUntil) {
                this._onMismatchFlipBack();
                this.lockUntil = 0;
            }

            /* Animate card flips */
            for (const card of this.cards) {
                if (card.flipDir !== 0) {
                    card.flipAnim += card.flipDir * 0.08;
                    if (card.flipAnim >= 1) { card.flipAnim = 1; card.flipDir = 0; }
                    if (card.flipAnim <= 0) { card.flipAnim = 0; card.flipDir = 0; }
                }
            }

            this._updateParticles();
            this.render();
        } catch (e) { console.error('[NeonRecall]', e); }
        this._scheduleLoop();
    }

    /* ════════════════════════════════════════════════════════════
       RENDERING
       ════════════════════════════════════════════════════════════ */
    render() {
        const ctx = this.ctx;
        ctx.save();
        this._buttons = [];

        this._drawBackground(ctx);

        if (this.state === 'MENU')          this._drawMenu(ctx);
        else if (this.state === 'SETTINGS') this._drawSettings(ctx);
        else if (this.state === 'PLAYING')  this._drawGameScreen(ctx);
        else if (this.state === 'WIN')      this._drawGameScreen(ctx), this._drawWin(ctx);

        this._drawParticles(ctx);
        this._drawFloatTexts(ctx);
        ctx.restore();
    }

    /* ── Background ── */
    _drawBackground(ctx) {
        const tc = this.themeColor;
        const bg = ctx.createLinearGradient(0, 0, 0, this.H);
        bg.addColorStop(0, '#030810');
        bg.addColorStop(0.5, '#060e1a');
        bg.addColorStop(1, '#040a12');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.W, this.H);

        const glow = ctx.createRadialGradient(this.W * 0.3, this.H * 0.2, 0, this.W * 0.3, this.H * 0.2, this.W * 0.6);
        glow.addColorStop(0, `rgba(${tc.rgb}, 0.04)`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, this.W, this.H);

        /* Hex grid */
        const hexR = 22, hexW = hexR * Math.sqrt(3), hexH = hexR * 2;
        ctx.strokeStyle = `rgba(${tc.rgb}, 0.04)`;
        ctx.lineWidth = 0.5;
        for (let row = -1; row < this.H / (hexH * 0.75) + 1; row++) {
            for (let col = -1; col < this.W / hexW + 1; col++) {
                const cx = col * hexW + (row % 2 ? hexW / 2 : 0);
                const cy = row * hexH * 0.75;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = Math.PI / 3 * i - Math.PI / 6;
                    i === 0 ? ctx.moveTo(cx + hexR * Math.cos(a), cy + hexR * Math.sin(a))
                            : ctx.lineTo(cx + hexR * Math.cos(a), cy + hexR * Math.sin(a));
                }
                ctx.closePath();
                ctx.stroke();
            }
        }

        /* Floating particles */
        ctx.fillStyle = `rgba(${tc.rgb}, 0.08)`;
        const t = this.tick * 0.008;
        for (let i = 0; i < 25; i++) {
            const px = ((Math.sin(t + i * 2.1) * 0.5 + 0.5) * this.W + i * 47) % this.W;
            const py = ((Math.cos(t * 0.7 + i * 1.3) * 0.5 + 0.5) * this.H + i * 31) % this.H;
            ctx.beginPath();
            ctx.arc(px, py, 1 + Math.sin(t + i) * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /* ── Shared button helper ── */
    _drawBtn(ctx, label, cx, cy, w, h, opts = {}) {
        const tc = this.themeColor;
        const x = cx - w / 2, y = cy - h / 2;
        const r = opts.radius || 10;
        const primary = opts.primary !== false;

        ctx.fillStyle = primary ? `rgba(${tc.rgb}, 0.15)` : 'rgba(255,255,255,0.06)';
        ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();

        ctx.strokeStyle = primary ? `rgba(${tc.rgb}, 0.35)` : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1.5; ctx.stroke();

        ctx.font = opts.font || 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = primary ? '#fff' : 'rgba(255,255,255,0.6)';
        ctx.fillText(label, cx, cy);

        if (opts.action) this._addButton(x, y, w, h, opts.action);
    }

    /* ── Menu ── */
    _drawMenu(ctx) {
        const tc = this.themeColor;
        ctx.save();
        ctx.fillStyle = 'rgba(3,8,16,0.85)';
        ctx.fillRect(0, 0, this.W, this.H);

        const cx = this.W / 2, cy = this.H / 2;

        /* Title */
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.min(38, this.W * 0.09)}px system-ui, sans-serif`;
        ctx.shadowBlur = 30; ctx.shadowColor = tc.main; ctx.fillStyle = tc.main;
        const titleY = cy - this.H * 0.28;
        ctx.fillText('NEON RECALL', cx, titleY);
        ctx.shadowBlur = 0;

        /* Subtitle */
        const glowA = 0.4 + Math.sin(this.tick * 0.04) * 0.3;
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = `rgba(${tc.rgb}, ${glowA})`;
        ctx.fillText('\u{1F0CF} YancoTab Memory', cx, titleY + 30);

        /* Difficulty selector */
        const diffY = cy - this.H * 0.10;
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText('DIFFICULTY', cx, diffY - 22);

        const diffKeys = Object.keys(DIFFICULTIES);
        const diffBtnW = Math.min(80, this.W * 0.2);
        const diffSpacing = diffBtnW + 8;
        const diffStartX = cx - (diffKeys.length - 1) * diffSpacing / 2;

        for (let i = 0; i < diffKeys.length; i++) {
            const dk = diffKeys[i];
            const d = DIFFICULTIES[dk];
            const bx = diffStartX + i * diffSpacing;
            const isActive = dk === this.difficulty;

            const btnX = bx - diffBtnW / 2, btnY = diffY - 16, btnH = 32;
            ctx.fillStyle = isActive ? `rgba(${tc.rgb}, 0.18)` : 'rgba(255,255,255,0.04)';
            ctx.beginPath(); ctx.roundRect(btnX, btnY, diffBtnW, btnH, 6); ctx.fill();
            ctx.strokeStyle = isActive ? `rgba(${tc.rgb}, 0.4)` : 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1; ctx.stroke();

            ctx.font = isActive ? 'bold 13px system-ui, sans-serif' : '13px system-ui, sans-serif';
            ctx.fillStyle = isActive ? tc.main : 'rgba(255,255,255,0.45)';
            ctx.fillText(d.label, bx, diffY);

            ctx.font = '9px system-ui, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillText(`${d.pairs} pairs`, bx, diffY + 14);

            this._addButton(btnX, btnY, diffBtnW, btnH, () => {
                this.difficulty = dk;
                this._save();
            });
        }

        /* Best score */
        const bestY = cy + this.H * 0.02;
        const best = this.bestScores[this.difficulty];
        if (best) {
            ctx.font = 'bold 14px system-ui, sans-serif';
            ctx.fillStyle = '#fbbf24';
            ctx.fillText(`\u2605 Best: ${best.moves} moves in ${this._formatTime(best.time)}`, cx, bestY);
        }

        /* PLAY button */
        const btnW = Math.min(180, this.W * 0.5);
        const playY = cy + this.H * 0.10;
        this._drawBtn(ctx, '\u25B6  PLAY', cx, playY, btnW, 48, {
            action: () => this._startGame(),
            font: 'bold 18px system-ui, sans-serif',
        });

        /* SETTINGS button */
        this._drawBtn(ctx, '\u2699  Settings', cx, playY + 60, btnW, 40, {
            primary: false,
            action: () => { this.state = 'SETTINGS'; },
            font: '14px system-ui, sans-serif',
        });

        /* Hint */
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillText('Tap cards to flip \u00B7 Match all pairs', cx, this.H - 30);

        ctx.restore();
    }

    /* ── Settings ── */
    _drawSettings(ctx) {
        const tc = this.themeColor;
        ctx.save();
        ctx.fillStyle = 'rgba(3,8,16,0.9)';
        ctx.fillRect(0, 0, this.W, this.H);
        const cx = this.W / 2;

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('SETTINGS', cx, 50);

        /* Theme */
        const themeY = 120;
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('THEME', cx, themeY);

        const keys = Object.keys(COLORS);
        const dotSpacing = 48;
        const startX = cx - (keys.length - 1) * dotSpacing / 2;
        const dotY = themeY + 32;

        for (let i = 0; i < keys.length; i++) {
            const c = COLORS[keys[i]];
            const dx = startX + i * dotSpacing;
            const isActive = keys[i] === this.theme;

            ctx.fillStyle = isActive ? c.main : `rgba(${c.rgb}, 0.35)`;
            ctx.beginPath(); ctx.arc(dx, dotY, isActive ? 10 : 7, 0, Math.PI * 2); ctx.fill();
            if (isActive) {
                ctx.strokeStyle = c.main; ctx.lineWidth = 2;
                ctx.shadowBlur = 12; ctx.shadowColor = c.main;
                ctx.beginPath(); ctx.arc(dx, dotY, 15, 0, Math.PI * 2); ctx.stroke();
                ctx.shadowBlur = 0;
            }
            ctx.font = '10px system-ui, sans-serif';
            ctx.fillStyle = isActive ? c.main : 'rgba(255,255,255,0.3)';
            ctx.fillText(keys[i].charAt(0).toUpperCase() + keys[i].slice(1), dx, dotY + 24);
            this._addButton(dx - 18, dotY - 18, 36, 50, () => { this.theme = keys[i]; this._save(); });
        }

        /* Stats */
        const statsY = dotY + 80;
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('STATS', cx, statsY);
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(`Games: ${this.gamesPlayed}  |  Wins: ${this.gamesWon}`, cx, statsY + 24);

        /* Best scores */
        const bestY = statsY + 50;
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText('BEST SCORES', cx, bestY);
        const diffKeys = Object.keys(DIFFICULTIES);
        for (let i = 0; i < diffKeys.length; i++) {
            const dk = diffKeys[i];
            const best = this.bestScores[dk];
            ctx.font = '12px system-ui, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            const txt = best ? `${best.moves} moves / ${this._formatTime(best.time)}` : '---';
            ctx.fillText(`${DIFFICULTIES[dk].label}: ${txt}`, cx, bestY + 22 + i * 20);
        }

        /* Back */
        this._drawBtn(ctx, '\u2190  Back', cx, this.H - 60, 120, 40, {
            primary: false, action: () => { this.state = 'MENU'; }, font: '14px system-ui, sans-serif',
        });
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillText('[T] Theme \u00B7 [Esc] Back', cx, this.H - 20);
        ctx.restore();
    }

    /* ── Game Screen ── */
    _drawGameScreen(ctx) {
        this._drawHUD(ctx);
        this._drawCards(ctx);
    }

    /* ── HUD ── */
    _drawHUD(ctx) {
        const tc = this.themeColor;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, this.W, this.HUD_HEIGHT);
        ctx.fillStyle = `rgba(${tc.rgb}, 0.08)`;
        ctx.fillRect(0, this.HUD_HEIGHT - 1, this.W, 1);

        const yc = this.HUD_HEIGHT / 2;

        /* Matches (left) */
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = tc.main;
        ctx.fillText(`\u2714 ${this.matchCount}/${this.totalPairs}`, 12, yc);

        /* Moves + Combo (center) */
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = 'bold 13px system-ui, sans-serif';
        let centerText = `${this.moves} moves`;
        if (this.combo > 1) centerText += ` \u00B7 x${this.combo}`;
        ctx.fillText(centerText, this.W / 2, yc);

        /* Timer (right-ish) */
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText(`\u23F1 ${this._formatTime(this.timerElapsed)}`, this.W - 78, yc);

        /* Menu button (far right) */
        const menuBtnW = 56, menuBtnH = 26;
        const menuBtnX = this.W - menuBtnW - 8;
        const menuBtnY = yc - menuBtnH / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath(); ctx.roundRect(menuBtnX, menuBtnY, menuBtnW, menuBtnH, 6); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.textAlign = 'center';
        ctx.fillText('Menu', menuBtnX + menuBtnW / 2, yc);
        this._addButton(menuBtnX, menuBtnY, menuBtnW, menuBtnH, () => { this.state = 'MENU'; });

        ctx.restore();
    }

    /* ── Cards ── */
    _drawCards(ctx) {
        const tc = this.themeColor;
        const cw = this.cardW, ch = this.cardH, gap = this.cardGap;

        for (let i = 0; i < this.cards.length; i++) {
            const card = this.cards[i];
            const col = i % this.cols;
            const row = Math.floor(i / this.cols);
            let x = this.gridOffX + col * (cw + gap);
            let y = this.gridOffY + row * (ch + gap);

            const isHover = i === this.hoverIdx && !card.faceUp && !card.matched;
            const isCursor = i === this.cursorIdx;

            /* Shake animation */
            if (card.shakeTick >= 0) {
                const elapsed = this.tick - card.shakeTick;
                if (elapsed < 15) {
                    x += Math.sin(elapsed * 1.2) * 4 * (1 - elapsed / 15);
                } else {
                    card.shakeTick = -1;
                }
            }

            /* Flip animation (scale X to simulate 3D flip) */
            const flipT = card.flipAnim; // 0=face-down, 1=face-up
            const scaleX = Math.abs(Math.cos(flipT * Math.PI)); // 1→0→1 as flipT goes 0→1
            const showFace = flipT > 0.5; // show face when past halfway

            ctx.save();

            /* Match glow */
            if (card.matched) {
                const matchAge = this.tick - card.matchTick;
                const glowAlpha = Math.max(0, 0.3 - matchAge * 0.003);
                if (glowAlpha > 0) {
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = tc.main;
                }
            }

            /* Draw card with horizontal scale for flip effect */
            const cx = x + cw / 2;
            const cy = y + ch / 2;
            ctx.translate(cx, cy);
            ctx.scale(Math.max(0.02, scaleX), 1);

            const drawW = cw, drawH = ch;
            const dx = -drawW / 2, dy = -drawH / 2;
            const radius = Math.min(8, cw * 0.12);

            if (showFace || card.matched) {
                /* Face side (matched or flipped up) */
                const faceGrad = ctx.createLinearGradient(dx, dy, dx, dy + drawH);
                if (card.matched) {
                    faceGrad.addColorStop(0, `rgba(${tc.rgb}, 0.12)`);
                    faceGrad.addColorStop(1, `rgba(${tc.rgb}, 0.06)`);
                } else {
                    faceGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
                    faceGrad.addColorStop(1, 'rgba(255,255,255,0.03)');
                }
                ctx.fillStyle = faceGrad;
                ctx.beginPath(); ctx.roundRect(dx, dy, drawW, drawH, radius); ctx.fill();

                ctx.strokeStyle = card.matched
                    ? `rgba(${tc.rgb}, 0.35)`
                    : 'rgba(255,255,255,0.12)';
                ctx.lineWidth = 1; ctx.stroke();

                /* Symbol */
                const fontSize = Math.floor(Math.min(cw, ch) * 0.45);
                ctx.font = `${fontSize}px system-ui, sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = '#fff';
                ctx.fillText(card.symbol, 0, 2);
            } else {
                /* Back side (face down) */
                const backGrad = ctx.createLinearGradient(dx, dy, dx + drawW, dy + drawH);
                backGrad.addColorStop(0, `rgba(${tc.rgb}, 0.12)`);
                backGrad.addColorStop(1, `rgba(${tc.rgb}, 0.05)`);
                ctx.fillStyle = backGrad;
                ctx.beginPath(); ctx.roundRect(dx, dy, drawW, drawH, radius); ctx.fill();

                ctx.strokeStyle = `rgba(${tc.rgb}, 0.20)`;
                ctx.lineWidth = 1; ctx.stroke();

                /* Card back pattern — diamond */
                ctx.strokeStyle = `rgba(${tc.rgb}, 0.12)`;
                ctx.lineWidth = 0.8;
                const patR = Math.min(cw, ch) * 0.22;
                ctx.beginPath();
                ctx.moveTo(0, -patR); ctx.lineTo(patR, 0);
                ctx.lineTo(0, patR); ctx.lineTo(-patR, 0);
                ctx.closePath(); ctx.stroke();

                /* Inner dot */
                ctx.fillStyle = `rgba(${tc.rgb}, 0.15)`;
                ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
            }

            ctx.restore();

            /* Hover glow (drawn without transform) */
            if (isHover) {
                ctx.strokeStyle = `rgba(${tc.rgb}, 0.3)`;
                ctx.lineWidth = 1.5;
                ctx.shadowBlur = 6; ctx.shadowColor = tc.main;
                ctx.beginPath(); ctx.roundRect(x - 1, y - 1, cw + 2, ch + 2, radius + 1); ctx.stroke();
                ctx.shadowBlur = 0;
            }

            /* Cursor highlight */
            if (isCursor) {
                ctx.strokeStyle = tc.main;
                ctx.lineWidth = 2;
                ctx.shadowBlur = 8; ctx.shadowColor = tc.main;
                ctx.beginPath(); ctx.roundRect(x - 2, y - 2, cw + 4, ch + 4, radius + 2); ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }
    }

    /* ── Win overlay ── */
    _drawWin(ctx) {
        const tc = this.themeColor;
        ctx.save();
        ctx.fillStyle = 'rgba(3,8,16,0.55)';
        ctx.fillRect(0, 0, this.W, this.H);
        const cx = this.W / 2, cy = this.H / 2;

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.min(42, this.W * 0.1)}px system-ui, sans-serif`;
        ctx.shadowBlur = 30; ctx.shadowColor = tc.main; ctx.fillStyle = tc.main;
        ctx.fillText('PERFECT!', cx, cy - this.H * 0.18);
        ctx.shadowBlur = 0;

        /* Stats */
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${this.moves} moves  \u00B7  ${this._formatTime(this.timerElapsed)}`, cx, cy - this.H * 0.06);

        if (this._isNewBest) {
            const pulse = 0.7 + Math.sin(this.tick * 0.08) * 0.3;
            ctx.font = 'bold 14px system-ui, sans-serif';
            ctx.fillStyle = `rgba(251, 191, 36, ${pulse})`;
            ctx.fillText('\u2605 NEW BEST! \u2605', cx, cy + this.H * 0.01);
        }

        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`${DIFFICULTIES[this.difficulty].label}  |  Won ${this.gamesWon} of ${this.gamesPlayed}`, cx, cy + this.H * 0.06);

        const btnW = Math.min(180, this.W * 0.5);
        this._drawBtn(ctx, '\u25B6  Play Again', cx, cy + this.H * 0.15, btnW, 48, {
            action: () => this._startGame(), font: 'bold 17px system-ui, sans-serif',
        });
        this._drawBtn(ctx, '\u2190  Menu', cx, cy + this.H * 0.25, btnW, 40, {
            primary: false, action: () => { this.state = 'MENU'; }, font: '14px system-ui, sans-serif',
        });

        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillText('[Space] Play Again \u00B7 [Esc] Menu', cx, this.H - 20);
        ctx.restore();
    }

    /* ── Particles ── */
    _drawParticles(ctx) {
        for (const p of this.particles) {
            const a = p.life / p.maxLife;
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
    _drawFloatTexts(ctx) {
        for (const f of this.floatTexts) {
            const a = f.life / f.maxLife;
            ctx.globalAlpha = a;
            ctx.font = 'bold 14px system-ui, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowBlur = 6; ctx.shadowColor = f.color;
            ctx.fillStyle = f.color;
            ctx.fillText(f.text, f.x, f.y);
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
    }

    /* ── Helpers ── */
    _formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}
