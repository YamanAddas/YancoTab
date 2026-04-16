/**
 * MinesweeperApp — "Neon Mines"
 *
 * Full-canvas immersive minesweeper with:
 *  - 3D neon cell visuals (Canvas2D gradients & glow)
 *  - Ripple-cascade reveal animations
 *  - Neon-colored numbers (1–8 each distinct)
 *  - Particle effects on reveal / explosion / win
 *  - Hex grid background with floating particles
 *  - 3 difficulties: Easy 9×9, Medium 16×16, Hard 30×16
 *  - Keyboard cursor navigation + tap/click reveal + long-press/right-click flag
 *  - Proper state machine & button system (lessons from Snake)
 *  - First click always safe
 *  - Best times + theme persistence (localStorage)
 */
import { App } from '../../core/App.js';
import { el } from '../../utils/dom.js';

/* ── Constants ── */
const LS_KEY = 'yancotab_neon_mines';

const COLORS = {
    cyan:    { h: 174, s: 72, main: '#2dd4bf', rgb: '45,212,191'  },
    magenta: { h: 330, s: 75, main: '#e855a0', rgb: '232,85,160'  },
    gold:    { h: 45,  s: 90, main: '#f5b731', rgb: '245,183,49'  },
    emerald: { h: 155, s: 70, main: '#34d399', rgb: '52,211,153'  },
};

const DIFFICULTIES = {
    easy:   { label: 'Easy',   cols: 9,  rows: 9,  mines: 10 },
    medium: { label: 'Medium', cols: 16, rows: 16, mines: 40 },
    hard:   { label: 'Hard',   cols: 30, rows: 16, mines: 99 },
};

/* Neon colors for each number 1–8 */
const NUM_COLORS = [
    null,              // 0 unused
    '#2dd4bf',         // 1 cyan
    '#34d399',         // 2 emerald
    '#e855a0',         // 3 magenta
    '#a78bfa',         // 4 purple
    '#f5b731',         // 5 gold
    '#5eead4',         // 6 teal
    '#f472b6',         // 7 pink
    '#e2e8f0',         // 8 silver
];

/* ── App Shell ── */
export class MinesweeperApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = {
            name: 'Minesweeper',
            id: 'minesweeper',
            icon: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0b1320'/><stop offset='1' stop-color='#f59e0b'/></linearGradient></defs><rect x='12' y='12' width='104' height='104' rx='28' fill='url(#g)'/><rect x='14' y='14' width='100' height='100' rx='26' fill='rgba(255,255,255,0.06)'/><g fill='none' stroke='rgba(255,255,255,0.92)' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'><circle cx='60' cy='70' r='18'/><path d='M72 56l10-10'/><path d='M84 40h8'/><path d='M84 40v-8'/><path d='M92 40l-6 6'/><path d='M52 62l-10-10'/></g></svg>`
        };
        this.game = null;
    }

    async init() {
        this.root = el('div', { class: 'app-window app-minesweeper' });
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'minesweeper-canvas';
        this.canvas.tabIndex = 0;
        Object.assign(this.canvas.style, {
            width: '100%', height: '100%', display: 'block', outline: 'none',
        });
        this.root.appendChild(this.canvas);

        this.game = new NeonMines(this.canvas, () => this._checkResize());
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
   NeonMines — Core game engine
   ════════════════════════════════════════════════════════════════ */
class NeonMines {
    constructor(canvas, onFrame) {
        this.cv = canvas;
        this.ctx = canvas.getContext('2d');
        this._onFrame = onFrame;
        this.W = canvas.width;
        this.H = canvas.height;

        /* State machine */
        this.state = 'MENU'; // MENU | SETTINGS | PLAYING | GAMEOVER | WIN

        /* Animation */
        this.running = false;
        this.tick = 0;

        /* Grid state */
        this.difficulty = 'easy';
        this.grid = [];      // flat array of { mine, revealed, flagged, count, revealTick }
        this.cols = 9;
        this.rows = 9;
        this.mineCount = 10;
        this.firstClick = true;
        this.flagCount = 0;

        /* Timer */
        this.timerStart = 0;
        this.timerElapsed = 0; // seconds
        this.timerRunning = false;

        /* Cell rendering */
        this.cellSize = 30;
        this.gridOffX = 0;
        this.gridOffY = 0;
        this.HUD_HEIGHT = 44;

        /* Keyboard cursor */
        this.cursorR = -1;
        this.cursorC = -1;

        /* Hover */
        this.hoverR = -1;
        this.hoverC = -1;

        /* Particles & effects */
        this.particles = [];
        this.floatTexts = [];
        this._flashAlpha = 0;

        /* Persistence */
        this._loadSave();
        this._bindInput();

        /* Timing */
        this.lastFrame = 0;
    }

    /* ── Save / Load ── */
    _loadSave() {
        try {
            const d = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
            this.theme = COLORS[d.theme] ? d.theme : 'cyan';
            this.bestTimes = d.bestTimes || {};
            this.gamesPlayed = d.gamesPlayed || 0;
            this.gamesWon = d.gamesWon || 0;
            if (DIFFICULTIES[d.difficulty]) this.difficulty = d.difficulty;
        } catch {
            this.theme = 'cyan';
            this.bestTimes = {};
            this.gamesPlayed = 0;
            this.gamesWon = 0;
        }
    }
    _save() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({
                theme: this.theme,
                bestTimes: this.bestTimes,
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

        /* Keyboard — stopPropagation prevents mobileShell from closing app on Escape */
        this.cv.addEventListener('keydown', e => {
            const k = e.key;
            let handled = false;

            if (this.state === 'PLAYING') {
                if (k === 'ArrowUp' || k === 'w') { this._moveCursor(-1, 0); handled = true; }
                else if (k === 'ArrowDown' || k === 's') { this._moveCursor(1, 0); handled = true; }
                else if (k === 'ArrowLeft' || k === 'a') { this._moveCursor(0, -1); handled = true; }
                else if (k === 'ArrowRight' || k === 'd') { this._moveCursor(0, 1); handled = true; }
                else if (k === ' ' || k === 'Enter') {
                    if (this.cursorR >= 0 && this.cursorC >= 0) this._revealCell(this.cursorR, this.cursorC);
                    handled = true;
                }
                else if (k === 'f') {
                    if (this.cursorR >= 0 && this.cursorC >= 0) this._toggleFlag(this.cursorR, this.cursorC);
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
            } else if (this.state === 'GAMEOVER' || this.state === 'WIN') {
                if (k === ' ' || k === 'Enter') { this._startGame(); handled = true; }
                else if (k === 'Escape' || k === 'm') { this.state = 'MENU'; handled = true; }
            }

            /* Always consume Escape when canvas is focused to prevent shell closing app */
            if (handled || k === 'Escape') { e.preventDefault(); e.stopPropagation(); }
        });

        /* Mouse move for hover */
        this.cv.addEventListener('mousemove', e => {
            if (this.state !== 'PLAYING') { this.hoverR = -1; this.hoverC = -1; return; }
            const r = this.cv.getBoundingClientRect();
            const mx = e.clientX - r.left, my = e.clientY - r.top;
            const cell = this._pixelToCell(mx, my);
            this.hoverR = cell ? cell.r : -1;
            this.hoverC = cell ? cell.c : -1;
        });
        this.cv.addEventListener('mouseleave', () => {
            this.hoverR = -1; this.hoverC = -1;
        });

        /* Tap / Click / Long-press / Right-click */
        let sx = 0, sy = 0, st = 0, longTimer = null, didLong = false;

        this.cv.addEventListener('pointerdown', e => {
            sx = e.clientX; sy = e.clientY; st = Date.now(); didLong = false;
            this.cv.focus();

            if (this.state === 'PLAYING') {
                const r = this.cv.getBoundingClientRect();
                const cell = this._pixelToCell(e.clientX - r.left, e.clientY - r.top);
                if (cell) {
                    longTimer = setTimeout(() => {
                        didLong = true;
                        this._toggleFlag(cell.r, cell.c);
                        if (navigator.vibrate) navigator.vibrate(30);
                    }, 400);
                }
            }
        });

        this.cv.addEventListener('pointermove', e => {
            const dx = e.clientX - sx, dy = e.clientY - sy;
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                clearTimeout(longTimer);
                longTimer = null;
            }
        });

        this.cv.addEventListener('pointerup', e => {
            clearTimeout(longTimer);
            longTimer = null;
            const elapsed = Date.now() - st;
            const dx = e.clientX - sx, dy = e.clientY - sy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (didLong || dist > 15) return; // already handled as long-press or drag

            if (elapsed < 300) {
                /* Short tap — check buttons first */
                const r = this.cv.getBoundingClientRect();
                const tx = e.clientX - r.left, ty = e.clientY - r.top;
                const hit = this._hitButton(tx, ty);
                if (hit) {
                    hit();
                } else if (this.state === 'PLAYING') {
                    const cell = this._pixelToCell(tx, ty);
                    if (cell) {
                        this._revealCell(cell.r, cell.c);
                    }
                }
            }
        });

        /* Right-click = flag */
        this.cv.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (this.state !== 'PLAYING') return;
            const r = this.cv.getBoundingClientRect();
            const cell = this._pixelToCell(e.clientX - r.left, e.clientY - r.top);
            if (cell) this._toggleFlag(cell.r, cell.c);
        });
    }

    /* Button system (same as Snake) */
    _addButton(x, y, w, h, action) {
        this._buttons.push({ x, y, w, h, action });
    }
    _hitButton(tx, ty) {
        for (const b of this._buttons) {
            if (tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h) {
                return b.action;
            }
        }
        return null;
    }

    _cycleTheme() {
        const keys = Object.keys(COLORS);
        this.theme = keys[(keys.indexOf(this.theme) + 1) % keys.length];
        this._save();
    }

    /* Cursor navigation */
    _moveCursor(dr, dc) {
        if (this.cursorR < 0) { this.cursorR = 0; this.cursorC = 0; return; }
        this.cursorR = Math.max(0, Math.min(this.rows - 1, this.cursorR + dr));
        this.cursorC = Math.max(0, Math.min(this.cols - 1, this.cursorC + dc));
    }

    /* Map pixel to grid cell */
    _pixelToCell(px, py) {
        const gx = px - this.gridOffX;
        const gy = py - this.gridOffY;
        if (gx < 0 || gy < 0) return null;
        const c = Math.floor(gx / this.cellSize);
        const r = Math.floor(gy / this.cellSize);
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
        return { r, c };
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

    /* Calculate cell size to fit the grid */
    _calcGrid() {
        const pad = 12;
        const topSpace = this.HUD_HEIGHT + pad;
        const availW = this.W - pad * 2;
        const availH = this.H - topSpace - pad;

        const fitW = availW / this.cols;
        const fitH = availH / this.rows;
        this.cellSize = Math.floor(Math.min(fitW, fitH, 44));
        this.cellSize = Math.max(12, this.cellSize);

        const gridW = this.cols * this.cellSize;
        const gridH = this.rows * this.cellSize;
        this.gridOffX = Math.floor((this.W - gridW) / 2);
        this.gridOffY = Math.floor(topSpace + (availH - gridH) / 2);
    }

    /* ── Start Game ── */
    _startGame() {
        const diff = DIFFICULTIES[this.difficulty];
        this.cols = diff.cols;
        this.rows = diff.rows;
        this.mineCount = diff.mines;
        this.firstClick = true;
        this.flagCount = 0;
        this.timerStart = 0;
        this.timerElapsed = 0;
        this.timerRunning = false;
        this.particles = [];
        this.floatTexts = [];
        this._flashAlpha = 0;
        this.cursorR = Math.floor(this.rows / 2);
        this.cursorC = Math.floor(this.cols / 2);
        this.hoverR = -1;
        this.hoverC = -1;

        /* Initialize empty grid */
        this.grid = [];
        for (let i = 0; i < this.rows * this.cols; i++) {
            this.grid.push({
                mine: false, revealed: false, flagged: false,
                count: 0, revealTick: -1,
            });
        }

        this._calcGrid();
        this.state = 'PLAYING';
    }

    /* Place mines after first click (safe zone around click) */
    _placeMines(safeR, safeC) {
        const safeSet = new Set();
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = safeR + dr, nc = safeC + dc;
                if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                    safeSet.add(nr * this.cols + nc);
                }
            }
        }

        let placed = 0;
        const total = this.rows * this.cols;
        while (placed < this.mineCount) {
            const idx = Math.floor(Math.random() * total);
            if (!safeSet.has(idx) && !this.grid[idx].mine) {
                this.grid[idx].mine = true;
                placed++;
            }
        }

        /* Calculate neighbor counts */
        for (let i = 0; i < total; i++) {
            if (this.grid[i].mine) continue;
            const r = Math.floor(i / this.cols), c = i % this.cols;
            let count = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                        if (this.grid[nr * this.cols + nc].mine) count++;
                    }
                }
            }
            this.grid[i].count = count;
        }
    }

    /* ── Cell Interactions ── */
    _revealCell(r, c) {
        if (this.state !== 'PLAYING') return;
        const idx = r * this.cols + c;
        const cell = this.grid[idx];
        if (cell.revealed || cell.flagged) return;

        /* First click: place mines and start timer */
        if (this.firstClick) {
            this.firstClick = false;
            this._placeMines(r, c);
            this.timerStart = performance.now();
            this.timerRunning = true;
        }

        /* Reveal this cell */
        cell.revealed = true;
        cell.revealTick = this.tick;

        if (cell.mine) {
            this._explode(r, c);
            return;
        }

        /* Particles on reveal */
        const px = this.gridOffX + c * this.cellSize + this.cellSize / 2;
        const py = this.gridOffY + r * this.cellSize + this.cellSize / 2;
        if (cell.count > 0) {
            this._emitParticles(px, py, NUM_COLORS[cell.count], 4);
        }

        /* Cascade reveal for empty cells (BFS with staggered timing) */
        if (cell.count === 0) {
            this._cascadeReveal(r, c);
        }

        this._checkWin();
    }

    _cascadeReveal(startR, startC) {
        const queue = [];
        /* Find neighbors of the starting cell */
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = startR + dr, nc = startC + dc;
                if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                    const ni = nr * this.cols + nc;
                    if (!this.grid[ni].revealed && !this.grid[ni].flagged) {
                        queue.push({ r: nr, c: nc, dist: 1 });
                    }
                }
            }
        }

        const visited = new Set([startR * this.cols + startC]);

        while (queue.length > 0) {
            const { r, c, dist } = queue.shift();
            const idx = r * this.cols + c;
            if (visited.has(idx)) continue;
            visited.add(idx);

            const cell = this.grid[idx];
            if (cell.revealed || cell.flagged || cell.mine) continue;

            cell.revealed = true;
            cell.revealTick = this.tick + dist * 2; // stagger animation

            /* Continue cascading for empty cells */
            if (cell.count === 0) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                            const ni = nr * this.cols + nc;
                            if (!visited.has(ni)) {
                                queue.push({ r: nr, c: nc, dist: dist + 1 });
                            }
                        }
                    }
                }
            }
        }
    }

    _toggleFlag(r, c) {
        if (this.state !== 'PLAYING') return;
        const cell = this.grid[r * this.cols + c];
        if (cell.revealed) return;

        cell.flagged = !cell.flagged;
        this.flagCount += cell.flagged ? 1 : -1;

        if (cell.flagged && navigator.vibrate) navigator.vibrate(15);
    }

    _explode(r, c) {
        this.state = 'GAMEOVER';
        this.timerRunning = false;
        this.gamesPlayed++;
        this._explodedCell = { r, c };
        this._save();

        /* Reveal all mines with staggered timing */
        const cx = c, cy = r;
        for (let i = 0; i < this.grid.length; i++) {
            if (this.grid[i].mine) {
                const mr = Math.floor(i / this.cols), mc = i % this.cols;
                const dist = Math.abs(mr - cy) + Math.abs(mc - cx);
                this.grid[i].revealTick = this.tick + dist * 3;
                this.grid[i].revealed = true;
            }
        }

        /* Explosion particles */
        const px = this.gridOffX + c * this.cellSize + this.cellSize / 2;
        const py = this.gridOffY + r * this.cellSize + this.cellSize / 2;
        this._emitParticles(px, py, '#ff4444', 30);
        this._emitParticles(px, py, '#fbbf24', 20);

        this._flashAlpha = 0.4;
        if (navigator.vibrate) navigator.vibrate(80);
    }

    _checkWin() {
        const totalSafe = this.rows * this.cols - this.mineCount;
        let revealed = 0;
        for (const cell of this.grid) {
            if (cell.revealed && !cell.mine) revealed++;
        }
        if (revealed === totalSafe) {
            this.state = 'WIN';
            this.timerRunning = false;
            this.gamesPlayed++;
            this.gamesWon++;

            /* Check best time */
            const time = this.timerElapsed;
            const key = this.difficulty;
            this._isNewBest = !this.bestTimes[key] || time < this.bestTimes[key];
            if (this._isNewBest) {
                this.bestTimes[key] = time;
            }
            this._save();

            /* Auto-flag all mines */
            for (const cell of this.grid) {
                if (cell.mine && !cell.flagged) cell.flagged = true;
            }

            /* Win particles burst */
            for (let i = 0; i < 60; i++) {
                const px = Math.random() * this.W;
                const py = Math.random() * this.H * 0.6;
                const colors = ['#2dd4bf', '#e855a0', '#f5b731', '#34d399', '#a78bfa', '#fbbf24'];
                this.particles.push({
                    x: px, y: py,
                    vx: (Math.random() - 0.5) * 4,
                    vy: -1 - Math.random() * 3,
                    life: 60 + Math.random() * 60, maxLife: 120,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    size: 2 + Math.random() * 3,
                });
            }
        }
    }

    /* ── Particles ── */
    _emitParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 1 + Math.random() * 3;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                life: 30 + Math.random() * 25, maxLife: 55,
                color, size: 1.5 + Math.random() * 2.5,
            });
        }
    }
    _updateParticles() {
        this.particles = this.particles.filter(p => {
            p.x += p.vx; p.y += p.vy;
            p.vx *= 0.96; p.vy *= 0.96;
            p.vy += 0.02; // slight gravity
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

            /* Update timer */
            if (this.timerRunning) {
                this.timerElapsed = Math.floor((now - this.timerStart) / 1000);
            }

            this._updateParticles();

            if (this._flashAlpha > 0) this._flashAlpha -= 0.012;

            this.render();
        } catch (e) { console.error('[NeonMines]', e); }
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

        if (this.state === 'MENU')               this._drawMenu(ctx);
        else if (this.state === 'SETTINGS')      this._drawSettings(ctx);
        else if (this.state === 'PLAYING')       this._drawGameScreen(ctx);
        else if (this.state === 'GAMEOVER')      this._drawGameScreen(ctx), this._drawGameOver(ctx);
        else if (this.state === 'WIN')           this._drawGameScreen(ctx), this._drawWin(ctx);

        /* Particles on top */
        this._drawParticles(ctx);
        this._drawFloatTexts(ctx);

        /* Flash */
        if (this._flashAlpha > 0) {
            ctx.fillStyle = `rgba(255,60,60,${this._flashAlpha})`;
            ctx.fillRect(0, 0, this.W, this.H);
        }

        ctx.restore();
    }

    /* ── Background (hex grid + ambient particles, like Snake) ── */
    _drawBackground(ctx) {
        const tc = this.themeColor;
        const bg = ctx.createLinearGradient(0, 0, 0, this.H);
        bg.addColorStop(0, '#030810');
        bg.addColorStop(0.5, '#060e1a');
        bg.addColorStop(1, '#040a12');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.W, this.H);

        /* Ambient glow */
        const glow = ctx.createRadialGradient(this.W * 0.3, this.H * 0.2, 0, this.W * 0.3, this.H * 0.2, this.W * 0.6);
        glow.addColorStop(0, `rgba(${tc.rgb}, 0.04)`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, this.W, this.H);

        /* Hex grid */
        const hexR = 22;
        const hexW = hexR * Math.sqrt(3);
        const hexH = hexR * 2;
        ctx.strokeStyle = `rgba(${tc.rgb}, 0.04)`;
        ctx.lineWidth = 0.5;
        for (let row = -1; row < this.H / (hexH * 0.75) + 1; row++) {
            for (let col = -1; col < this.W / hexW + 1; col++) {
                const cx = col * hexW + (row % 2 ? hexW / 2 : 0);
                const cy = row * hexH * 0.75;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = Math.PI / 3 * i - Math.PI / 6;
                    const px = cx + hexR * Math.cos(a);
                    const py = cy + hexR * Math.sin(a);
                    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
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

    /* ── Shared button helper (same pattern as Snake) ── */
    _drawBtn(ctx, label, cx, cy, w, h, opts = {}) {
        const tc = this.themeColor;
        const x = cx - w / 2, y = cy - h / 2;
        const r = opts.radius || 10;
        const primary = opts.primary !== false;

        ctx.fillStyle = primary ? `rgba(${tc.rgb}, 0.15)` : 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fill();

        ctx.strokeStyle = primary ? `rgba(${tc.rgb}, 0.35)` : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = opts.font || 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
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
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.min(40, this.W * 0.09)}px system-ui, sans-serif`;
        ctx.shadowBlur = 30;
        ctx.shadowColor = tc.main;
        ctx.fillStyle = tc.main;
        const titleY = cy - this.H * 0.28;
        ctx.fillText('NEON MINES', cx, titleY);
        ctx.shadowBlur = 0;

        /* Subtitle */
        const glowA = 0.4 + Math.sin(this.tick * 0.04) * 0.3;
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = `rgba(${tc.rgb}, ${glowA})`;
        ctx.fillText('\u{1F4A3} YancoTab Minesweeper', cx, titleY + 30);

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
            ctx.beginPath();
            ctx.roundRect(btnX, btnY, diffBtnW, btnH, 6);
            ctx.fill();
            ctx.strokeStyle = isActive ? `rgba(${tc.rgb}, 0.4)` : 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.font = isActive ? 'bold 13px system-ui, sans-serif' : '13px system-ui, sans-serif';
            ctx.fillStyle = isActive ? tc.main : 'rgba(255,255,255,0.45)';
            ctx.fillText(d.label, bx, diffY);

            /* Grid size hint */
            ctx.font = '9px system-ui, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillText(`${d.cols}×${d.rows}`, bx, diffY + 14);

            this._addButton(btnX, btnY, diffBtnW, btnH, () => {
                this.difficulty = dk;
                this._save();
            });
        }

        /* Best times */
        const bestY = cy + this.H * 0.02;
        const bestTime = this.bestTimes[this.difficulty];
        if (bestTime != null) {
            ctx.font = 'bold 14px system-ui, sans-serif';
            ctx.fillStyle = '#fbbf24';
            ctx.fillText(`\u2605 Best: ${this._formatTime(bestTime)}`, cx, bestY);
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

        /* Controls hint */
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillText('Tap to reveal \u00B7 Long-press to flag', cx, this.H - 30);

        ctx.restore();
    }

    /* ── Settings ── */
    _drawSettings(ctx) {
        const tc = this.themeColor;
        ctx.save();

        ctx.fillStyle = 'rgba(3,8,16,0.9)';
        ctx.fillRect(0, 0, this.W, this.H);

        const cx = this.W / 2;

        /* Title */
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('SETTINGS', cx, 50);

        /* Theme section */
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
            ctx.beginPath();
            ctx.arc(dx, dotY, isActive ? 10 : 7, 0, Math.PI * 2);
            ctx.fill();

            if (isActive) {
                ctx.strokeStyle = c.main;
                ctx.lineWidth = 2;
                ctx.shadowBlur = 12;
                ctx.shadowColor = c.main;
                ctx.beginPath();
                ctx.arc(dx, dotY, 15, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            ctx.font = '10px system-ui, sans-serif';
            ctx.fillStyle = isActive ? c.main : 'rgba(255,255,255,0.3)';
            ctx.fillText(keys[i].charAt(0).toUpperCase() + keys[i].slice(1), dx, dotY + 24);

            this._addButton(dx - 18, dotY - 18, 36, 50, () => {
                this.theme = keys[i];
                this._save();
            });
        }

        /* Stats section */
        const statsY = dotY + 80;
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('STATS', cx, statsY);

        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(`Games: ${this.gamesPlayed}  |  Wins: ${this.gamesWon}`, cx, statsY + 24);

        /* Best times */
        const bestY = statsY + 50;
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText('BEST TIMES', cx, bestY);

        const diffKeys = Object.keys(DIFFICULTIES);
        for (let i = 0; i < diffKeys.length; i++) {
            const dk = diffKeys[i];
            const label = DIFFICULTIES[dk].label;
            const time = this.bestTimes[dk];
            ctx.font = '12px system-ui, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText(`${label}: ${time != null ? this._formatTime(time) : '---'}`, cx, bestY + 22 + i * 20);
        }

        /* Back button */
        const backY = this.H - 60;
        this._drawBtn(ctx, '\u2190  Back', cx, backY, 120, 40, {
            primary: false,
            action: () => { this.state = 'MENU'; },
            font: '14px system-ui, sans-serif',
        });

        /* Keyboard hints */
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillText('[T] Theme \u00B7 [Esc] Back', cx, this.H - 20);

        ctx.restore();
    }

    /* ── Game Screen (HUD + Grid) ── */
    _drawGameScreen(ctx) {
        this._drawHUD(ctx);
        this._drawGrid(ctx);
    }

    /* ── HUD ── */
    _drawHUD(ctx) {
        const tc = this.themeColor;
        ctx.save();

        /* Glass bar */
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, this.W, this.HUD_HEIGHT);
        ctx.fillStyle = `rgba(${tc.rgb}, 0.08)`;
        ctx.fillRect(0, this.HUD_HEIGHT - 1, this.W, 1);

        const yc = this.HUD_HEIGHT / 2;

        /* Mine counter (left) */
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff6b6b';
        const remaining = this.mineCount - this.flagCount;
        ctx.fillText(`\u{1F4A3} ${remaining}`, 12, yc);

        /* Timer (center) */
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText(`\u23F1 ${this._formatTime(this.timerElapsed)}`, this.W / 2, yc);

        /* Menu button (right) */
        const menuBtnW = 60, menuBtnH = 28;
        const menuBtnX = this.W - menuBtnW - 8;
        const menuBtnY = yc - menuBtnH / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.roundRect(menuBtnX, menuBtnY, menuBtnW, menuBtnH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        ctx.fillText('Menu', menuBtnX + menuBtnW / 2, yc);
        this._addButton(menuBtnX, menuBtnY, menuBtnW, menuBtnH, () => {
            this.state = 'MENU';
        });

        /* Difficulty label */
        ctx.textAlign = 'left';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = `rgba(${tc.rgb}, 0.4)`;
        const mineTextW = ctx.measureText(`\u{1F4A3} ${remaining}`).width;
        ctx.fillText(DIFFICULTIES[this.difficulty].label, 16 + mineTextW + 8, yc);

        ctx.restore();
    }

    /* ── Grid Rendering ── */
    _drawGrid(ctx) {
        const tc = this.themeColor;
        const cs = this.cellSize;
        const ox = this.gridOffX;
        const oy = this.gridOffY;

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = this.grid[r * this.cols + c];
                const x = ox + c * cs;
                const y = oy + r * cs;
                const isHover = r === this.hoverR && c === this.hoverC;
                const isCursor = r === this.cursorR && c === this.cursorC;

                /* Reveal animation progress (0 → 1) */
                let revealAnim = 1;
                if (cell.revealed && cell.revealTick >= 0) {
                    const frames = this.tick - cell.revealTick;
                    revealAnim = Math.min(1, frames / 12);
                }

                if (cell.revealed) {
                    this._drawRevealedCell(ctx, x, y, cs, cell, revealAnim);
                } else {
                    this._drawHiddenCell(ctx, x, y, cs, cell, isHover, isCursor);
                }
            }
        }

        /* Grid border */
        const gridW = this.cols * cs, gridH = this.rows * cs;
        ctx.strokeStyle = `rgba(${tc.rgb}, 0.15)`;
        ctx.lineWidth = 1;
        ctx.strokeRect(ox - 0.5, oy - 0.5, gridW + 1, gridH + 1);
    }

    _drawHiddenCell(ctx, x, y, cs, cell, isHover, isCursor) {
        const tc = this.themeColor;
        const pad = 1;

        /* Cell background — glass effect */
        const grad = ctx.createLinearGradient(x, y, x, y + cs);
        grad.addColorStop(0, 'rgba(255,255,255,0.06)');
        grad.addColorStop(1, 'rgba(255,255,255,0.02)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2, 3);
        ctx.fill();

        /* Border */
        ctx.strokeStyle = `rgba(${tc.rgb}, 0.10)`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        /* Hover glow */
        if (isHover && !cell.flagged) {
            ctx.fillStyle = `rgba(${tc.rgb}, 0.08)`;
            ctx.fill();
            ctx.strokeStyle = `rgba(${tc.rgb}, 0.25)`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        /* Keyboard cursor highlight */
        if (isCursor) {
            ctx.strokeStyle = tc.main;
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 6;
            ctx.shadowColor = tc.main;
            ctx.beginPath();
            ctx.roundRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2, 3);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        /* Flag */
        if (cell.flagged) {
            const flagPulse = 0.9 + Math.sin(this.tick * 0.06) * 0.1;
            ctx.font = `${Math.floor(cs * 0.5 * flagPulse)}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ff6b6b';
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#ff4444';
            ctx.fillText('\u{1F6A9}', x + cs / 2, y + cs / 2);
            ctx.shadowBlur = 0;
        }
    }

    _drawRevealedCell(ctx, x, y, cs, cell, anim) {
        const pad = 1;

        /* Animation: scale from center */
        ctx.save();
        if (anim < 1) {
            const scale = 0.6 + anim * 0.4;
            const cx = x + cs / 2, cy = y + cs / 2;
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.translate(-cx, -cy);
            ctx.globalAlpha = anim;
        }

        /* Revealed background — darker */
        ctx.fillStyle = cell.mine ? 'rgba(255,50,50,0.15)' : 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.roundRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2, 3);
        ctx.fill();

        /* Border */
        ctx.strokeStyle = cell.mine ? 'rgba(255,50,50,0.2)' : 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        if (cell.mine) {
            /* Mine */
            const isExploded = this._explodedCell &&
                this._explodedCell.r === Math.round((y - this.gridOffY) / cs) &&
                this._explodedCell.c === Math.round((x - this.gridOffX) / cs);

            if (isExploded) {
                ctx.fillStyle = 'rgba(255,50,50,0.4)';
                ctx.fill();
            }

            /* Mine icon */
            const pulse = 0.85 + Math.sin(this.tick * 0.1) * 0.15;
            const mineR = cs * 0.25 * pulse;
            const cx = x + cs / 2, cy = y + cs / 2;

            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(cx, cy, mineR, 0, Math.PI * 2);
            ctx.fill();

            /* Spikes */
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 8; i++) {
                const a = Math.PI / 4 * i;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * mineR * 0.7, cy + Math.sin(a) * mineR * 0.7);
                ctx.lineTo(cx + Math.cos(a) * mineR * 1.5, cy + Math.sin(a) * mineR * 1.5);
                ctx.stroke();
            }

            /* Highlight */
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.arc(cx - mineR * 0.3, cy - mineR * 0.3, mineR * 0.25, 0, Math.PI * 2);
            ctx.fill();

            if (isExploded) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#ff4444';
                ctx.strokeStyle = 'rgba(255,80,80,0.5)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(cx, cy, mineR + 4, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        } else if (cell.count > 0) {
            /* Number */
            const color = NUM_COLORS[cell.count] || '#fff';
            const fontSize = Math.max(10, Math.floor(cs * 0.55));
            ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 8;
            ctx.shadowColor = color;
            ctx.fillStyle = color;
            ctx.fillText(cell.count, x + cs / 2, y + cs / 2 + 1);
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }

    /* ── Game Over overlay ── */
    _drawGameOver(ctx) {
        ctx.save();

        ctx.fillStyle = 'rgba(3,8,16,0.65)';
        ctx.fillRect(0, 0, this.W, this.H);

        const cx = this.W / 2, cy = this.H / 2;

        /* Title */
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.min(48, this.W * 0.1)}px system-ui, sans-serif`;
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#ff4444';
        ctx.fillStyle = '#ff6b6b';
        ctx.fillText('BOOM!', cx, cy - this.H * 0.15);
        ctx.shadowBlur = 0;

        /* Stats */
        ctx.font = '14px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`Time: ${this._formatTime(this.timerElapsed)}  |  ${DIFFICULTIES[this.difficulty].label}`, cx, cy - this.H * 0.04);

        /* Cells revealed */
        let revealed = 0;
        for (const cell of this.grid) if (cell.revealed && !cell.mine) revealed++;
        const totalSafe = this.rows * this.cols - this.mineCount;
        ctx.fillText(`Cleared: ${revealed} / ${totalSafe} cells`, cx, cy + this.H * 0.02);

        /* Buttons */
        const btnW = Math.min(170, this.W * 0.45);
        this._drawBtn(ctx, '\u{1F504}  Retry', cx, cy + this.H * 0.12, btnW, 46, {
            action: () => this._startGame(),
            font: 'bold 16px system-ui, sans-serif',
        });
        this._drawBtn(ctx, '\u2190  Menu', cx, cy + this.H * 0.22, btnW, 40, {
            primary: false,
            action: () => { this.state = 'MENU'; },
            font: '14px system-ui, sans-serif',
        });

        /* Keyboard hints */
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillText('[Space] Retry \u00B7 [Esc] Menu', cx, this.H - 20);

        ctx.restore();
    }

    /* ── Win overlay ── */
    _drawWin(ctx) {
        const tc = this.themeColor;
        ctx.save();

        ctx.fillStyle = 'rgba(3,8,16,0.55)';
        ctx.fillRect(0, 0, this.W, this.H);

        const cx = this.W / 2, cy = this.H / 2;

        /* Title */
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.min(44, this.W * 0.1)}px system-ui, sans-serif`;
        ctx.shadowBlur = 30;
        ctx.shadowColor = tc.main;
        ctx.fillStyle = tc.main;
        ctx.fillText('CLEARED!', cx, cy - this.H * 0.18);
        ctx.shadowBlur = 0;

        /* Time */
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(`\u23F1 ${this._formatTime(this.timerElapsed)}`, cx, cy - this.H * 0.06);

        /* New best */
        if (this._isNewBest) {
            const pulse = 0.7 + Math.sin(this.tick * 0.08) * 0.3;
            ctx.font = 'bold 14px system-ui, sans-serif';
            ctx.fillStyle = `rgba(251, 191, 36, ${pulse})`;
            ctx.fillText('\u2605 NEW BEST TIME! \u2605', cx, cy + this.H * 0.01);
        }

        /* Stats */
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`${DIFFICULTIES[this.difficulty].label}  |  Won ${this.gamesWon} of ${this.gamesPlayed}`, cx, cy + this.H * 0.06);

        /* Buttons */
        const btnW = Math.min(180, this.W * 0.5);
        this._drawBtn(ctx, '\u25B6  Play Again', cx, cy + this.H * 0.15, btnW, 48, {
            action: () => this._startGame(),
            font: 'bold 17px system-ui, sans-serif',
        });
        this._drawBtn(ctx, '\u2190  Menu', cx, cy + this.H * 0.25, btnW, 40, {
            primary: false,
            action: () => { this.state = 'MENU'; },
            font: '14px system-ui, sans-serif',
        });

        /* Keyboard hints */
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
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    _drawFloatTexts(ctx) {
        for (const f of this.floatTexts) {
            const a = f.life / f.maxLife;
            ctx.globalAlpha = a;
            ctx.font = 'bold 14px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 6;
            ctx.shadowColor = f.color;
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

    _darken(hex, amount) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgb(${Math.round(r * amount)},${Math.round(g * amount)},${Math.round(b * amount)})`;
    }
}
