/**
 * TicTacToeApp — "Neon Tactics"
 *
 * Full-canvas immersive tic-tac-toe with:
 *  - Animated neon X lines & O arc-sweep with glow
 *  - Glowing grid lines & glass cells
 *  - Animated win line with particle trail
 *  - AI with minimax (Easy / Medium / Hard)
 *  - Score & win-streak tracking (localStorage)
 *  - Particle effects on place / win / loss
 *  - Hex grid background + floating ambient particles
 *  - Keyboard cursor navigation + tap/click
 *  - Proper state machine & button system
 *  - Escape stopPropagation (prevents shell from closing app)
 */
import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

/* ── Constants ── */
const LS_KEY = 'yancotab_neon_tactics';

const COLORS = {
    cyan:    { h: 174, s: 72, main: '#2dd4bf', rgb: '45,212,191'  },
    magenta: { h: 330, s: 75, main: '#e855a0', rgb: '232,85,160'  },
    gold:    { h: 45,  s: 90, main: '#f5b731', rgb: '245,183,49'  },
    emerald: { h: 155, s: 70, main: '#34d399', rgb: '52,211,153'  },
};

const WIN_PATTERNS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8],   // cols
    [0, 4, 8], [2, 4, 6],               // diags
];

/* ── App Shell ── */
export class TicTacToeApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = {
            name: 'Tic-Tac-Toe',
            id: 'tictactoe',
            icon: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0f172a'/><stop offset='1' stop-color='#ec4899'/></linearGradient></defs><rect x='12' y='12' width='104' height='104' rx='28' fill='url(#g)'/><rect x='14' y='14' width='100' height='100' rx='26' fill='rgba(255,255,255,0.06)'/><g fill='none' stroke='rgba(255,255,255,0.92)' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'><path d='M44 40v48M84 40v48M40 56h48M40 72h48'/><path d='M54 62l16 16M70 62L54 78'/><circle cx='76' cy='56' r='8'/></g></svg>`
        };
        this.game = null;
    }

    async init() {
        this.root = el('div', { class: 'app-window app-tictactoe' });
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'tictactoe-canvas';
        this.canvas.tabIndex = 0;
        Object.assign(this.canvas.style, {
            width: '100%', height: '100%', display: 'block', outline: 'none',
            background: '#030810',
        });
        this.root.appendChild(this.canvas);

        this.game = new NeonTactics(this.canvas, () => this._checkResize());
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
   NeonTactics — Core game engine
   ════════════════════════════════════════════════════════════════ */
class NeonTactics {
    constructor(canvas, onFrame) {
        this.cv = canvas;
        this.ctx = canvas.getContext('2d');
        this._onFrame = onFrame;
        this.W = canvas.width;
        this.H = canvas.height;

        /* State machine */
        this.state = 'MENU'; // MENU | SETTINGS | PLAYING | WIN | GAMEOVER | DRAW

        /* Animation */
        this.running = false;
        this.tick = 0;

        /* Board: 9 cells, each { mark: ''|'X'|'O', placedTick: -1 } */
        this.board = [];
        this.cursor = 4;    // center cell
        this.hover = -1;
        this.winCells = null;
        this.winTick = -1;

        /* AI */
        this.difficulty = 'medium';
        this.aiPending = false;
        this.aiDelay = 0;

        /* Score */
        this.playerWins = 0;
        this.aiWins = 0;
        this.draws = 0;
        this.streak = 0;
        this.bestStreak = 0;

        /* Grid geometry */
        this.gridX = 0;
        this.gridY = 0;
        this.cellSize = 80;
        this.HUD_HEIGHT = 44;

        /* Effects */
        this.particles = [];
        this._flashAlpha = 0;
        this._flashRGB = '255,60,60';

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
            if (d.difficulty && ['easy', 'medium', 'hard'].includes(d.difficulty)) {
                this.difficulty = d.difficulty;
            }
            this.playerWins = d.playerWins || 0;
            this.aiWins = d.aiWins || 0;
            this.draws = d.draws || 0;
            this.streak = d.streak || 0;
            this.bestStreak = d.bestStreak || 0;
        } catch {
            this.theme = 'cyan';
        }
    }
    _save() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({
                theme: this.theme,
                difficulty: this.difficulty,
                playerWins: this.playerWins,
                aiWins: this.aiWins,
                draws: this.draws,
                streak: this.streak,
                bestStreak: this.bestStreak,
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

            if (this.state === 'PLAYING' && !this.aiPending) {
                const row = Math.floor(this.cursor / 3);
                const col = this.cursor % 3;
                if (k === 'ArrowUp' || k === 'w') {
                    this.cursor = Math.max(0, row - 1) * 3 + col; handled = true;
                } else if (k === 'ArrowDown' || k === 's') {
                    this.cursor = Math.min(2, row + 1) * 3 + col; handled = true;
                } else if (k === 'ArrowLeft' || k === 'a') {
                    this.cursor = row * 3 + Math.max(0, col - 1); handled = true;
                } else if (k === 'ArrowRight' || k === 'd') {
                    this.cursor = row * 3 + Math.min(2, col + 1); handled = true;
                } else if (k === ' ' || k === 'Enter') {
                    this._playerMove(this.cursor); handled = true;
                } else if (k === 'Escape') {
                    this.state = 'MENU'; handled = true;
                }
            } else if (this.state === 'PLAYING' && this.aiPending) {
                if (k === 'Escape') { this.state = 'MENU'; this.aiPending = false; handled = true; }
            } else if (this.state === 'MENU') {
                if (k === ' ' || k === 'Enter') { this._startGame(); handled = true; }
                else if (k === 's') { this.state = 'SETTINGS'; handled = true; }
                else if (k === '1') { this.difficulty = 'easy'; this._save(); handled = true; }
                else if (k === '2') { this.difficulty = 'medium'; this._save(); handled = true; }
                else if (k === '3') { this.difficulty = 'hard'; this._save(); handled = true; }
            } else if (this.state === 'SETTINGS') {
                if (k === 'Escape' || k === 'Backspace') { this.state = 'MENU'; handled = true; }
                else if (k === 't') { this._cycleTheme(); handled = true; }
            } else if (this.state === 'WIN' || this.state === 'GAMEOVER' || this.state === 'DRAW') {
                if (k === ' ' || k === 'Enter') { this._startGame(); handled = true; }
                else if (k === 'Escape' || k === 'm') { this.state = 'MENU'; handled = true; }
            }

            /* Always consume Escape when canvas is focused to prevent shell closing app */
            if (handled || k === 'Escape') { e.preventDefault(); e.stopPropagation(); }
        });

        /* Mouse hover */
        this.cv.addEventListener('mousemove', e => {
            if (this.state !== 'PLAYING' || this.aiPending) { this.hover = -1; return; }
            const r = this.cv.getBoundingClientRect();
            this.hover = this._pixelToCell(e.clientX - r.left, e.clientY - r.top);
        });
        this.cv.addEventListener('mouseleave', () => { this.hover = -1; });

        /* Tap / Click */
        let sx = 0, sy = 0, st = 0;

        this.cv.addEventListener('pointerdown', e => {
            sx = e.clientX; sy = e.clientY; st = Date.now();
            this.cv.focus();
        });

        this.cv.addEventListener('pointerup', e => {
            const elapsed = Date.now() - st;
            const dx = e.clientX - sx, dy = e.clientY - sy;
            if (Math.sqrt(dx * dx + dy * dy) > 15 || elapsed > 500) return;

            const r = this.cv.getBoundingClientRect();
            const tx = e.clientX - r.left, ty = e.clientY - r.top;
            const hit = this._hitButton(tx, ty);
            if (hit) {
                hit();
            } else if (this.state === 'PLAYING' && !this.aiPending) {
                const cell = this._pixelToCell(tx, ty);
                if (cell >= 0) this._playerMove(cell);
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

    _pixelToCell(px, py) {
        const gx = px - this.gridX;
        const gy = py - this.gridY;
        if (gx < 0 || gy < 0) return -1;
        const col = Math.floor(gx / this.cellSize);
        const row = Math.floor(gy / this.cellSize);
        if (row < 0 || row > 2 || col < 0 || col > 2) return -1;
        return row * 3 + col;
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

    _calcGrid() {
        const pad = 16;
        const topSpace = this.HUD_HEIGHT + pad;
        const availW = this.W - pad * 2;
        const availH = this.H - topSpace - pad;
        this.cellSize = Math.floor(Math.min(availW / 3, availH / 3, 130));
        this.cellSize = Math.max(40, this.cellSize);
        const gridW = this.cellSize * 3;
        const gridH = this.cellSize * 3;
        this.gridX = Math.floor((this.W - gridW) / 2);
        this.gridY = Math.floor(topSpace + (availH - gridH) / 2);
    }

    /* ── Start Game ── */
    _startGame() {
        this.board = [];
        for (let i = 0; i < 9; i++) {
            this.board.push({ mark: '', placedTick: -1 });
        }
        this.aiPending = false;
        this.winCells = null;
        this.winTick = -1;
        this.cursor = 4;
        this.hover = -1;
        this.particles = [];
        this._flashAlpha = 0;
        this._calcGrid();
        this.state = 'PLAYING';
    }

    /* ── Player Move ── */
    _playerMove(index) {
        if (this.board[index].mark !== '') return;
        this._placeMove(index, 'X');

        const win = this._checkWin('X');
        if (win) { this._handleWin('X', win); return; }
        if (this._isDraw()) { this._handleDraw(); return; }

        /* Queue AI move with small delay */
        this.aiPending = true;
        this.aiDelay = this.tick + 18 + Math.floor(Math.random() * 14);
    }

    _placeMove(index, mark) {
        this.board[index].mark = mark;
        this.board[index].placedTick = this.tick;

        /* Particles on placement */
        const col = index % 3, row = Math.floor(index / 3);
        const px = this.gridX + col * this.cellSize + this.cellSize / 2;
        const py = this.gridY + row * this.cellSize + this.cellSize / 2;
        const color = mark === 'X' ? this.themeColor.main : '#e855a0';
        this._emitParticles(px, py, color, 8);
    }

    /* ── AI ── */
    _doAIMove() {
        const move = this._getAIMove();
        if (move < 0) return;
        this._placeMove(move, 'O');
        this.aiPending = false;

        const win = this._checkWin('O');
        if (win) { this._handleWin('O', win); return; }
        if (this._isDraw()) { this._handleDraw(); }
    }

    _getAIMove() {
        const empty = this.board.map((c, i) => c.mark === '' ? i : null).filter(i => i !== null);
        if (empty.length === 0) return -1;

        let smartChance;
        if (this.difficulty === 'easy') smartChance = 0.15;
        else if (this.difficulty === 'medium') smartChance = 0.6;
        else smartChance = 1.0;

        if (Math.random() < smartChance) {
            return this._minimax(this.board.map(c => c.mark), 'O', 0).index;
        }
        return empty[Math.floor(Math.random() * empty.length)];
    }

    _minimax(board, player, depth) {
        const empty = board.map((c, i) => c === '' ? i : null).filter(i => i !== null);

        if (this._checkWinState(board, 'X')) return { score: depth - 10 };
        if (this._checkWinState(board, 'O')) return { score: 10 - depth };
        if (empty.length === 0) return { score: 0 };

        const moves = [];
        for (const i of empty) {
            const nb = [...board];
            nb[i] = player;
            const result = this._minimax(nb, player === 'O' ? 'X' : 'O', depth + 1);
            moves.push({ index: i, score: result.score });
        }

        return player === 'O'
            ? moves.reduce((best, m) => m.score > best.score ? m : best)
            : moves.reduce((best, m) => m.score < best.score ? m : best);
    }

    /* ── Win / Draw ── */
    _checkWin(mark) {
        for (const p of WIN_PATTERNS) {
            if (p.every(i => this.board[i].mark === mark)) return p;
        }
        return null;
    }

    _checkWinState(board, mark) {
        return WIN_PATTERNS.some(p => p.every(i => board[i] === mark));
    }

    _isDraw() {
        return this.board.every(c => c.mark !== '');
    }

    _handleWin(winner, cells) {
        this.winCells = cells;
        this.winTick = this.tick;

        if (winner === 'X') {
            this.state = 'WIN';
            this.playerWins++;
            this.streak++;
            if (this.streak > this.bestStreak) this.bestStreak = this.streak;

            /* Win particles burst */
            for (let i = 0; i < 50; i++) {
                const px = Math.random() * this.W;
                const py = Math.random() * this.H * 0.7;
                const colors = ['#2dd4bf', '#e855a0', '#f5b731', '#34d399', '#a78bfa'];
                this.particles.push({
                    x: px, y: py,
                    vx: (Math.random() - 0.5) * 5,
                    vy: -1 - Math.random() * 4,
                    life: 60 + Math.random() * 60, maxLife: 120,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    size: 2 + Math.random() * 3,
                });
            }
        } else {
            this.state = 'GAMEOVER';
            this.aiWins++;
            this.streak = 0;
            this._flashAlpha = 0.3;
            this._flashRGB = '255,60,60';
            if (navigator.vibrate) navigator.vibrate(60);
        }
        this._save();
    }

    _handleDraw() {
        this.state = 'DRAW';
        this.draws++;
        this.streak = 0;
        this._flashAlpha = 0.15;
        this._flashRGB = '245,183,49';
        this._save();
    }

    /* ── Particles ── */
    _emitParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 1 + Math.random() * 3;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                life: 25 + Math.random() * 20, maxLife: 45,
                color, size: 1.5 + Math.random() * 2,
            });
        }
    }

    _updateParticles() {
        this.particles = this.particles.filter(p => {
            p.x += p.vx; p.y += p.vy;
            p.vx *= 0.96; p.vy *= 0.96;
            p.vy += 0.03;
            p.life--;
            return p.life > 0;
        });
    }

    /* ── Main Loop ── */
    _loop(now) {
        if (!this.running) return;
        try {
            if (this._onFrame) this._onFrame();
            this.tick++;

            /* AI move timing */
            if (this.aiPending && this.state === 'PLAYING' && this.tick >= this.aiDelay) {
                this._doAIMove();
            }

            this._updateParticles();
            if (this._flashAlpha > 0) this._flashAlpha -= 0.008;

            this.render();
        } catch (e) { console.error('[NeonTactics]', e); }
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
        else if (this.state === 'WIN')      { this._drawGameScreen(ctx); this._drawOverlay(ctx, 'WIN'); }
        else if (this.state === 'GAMEOVER') { this._drawGameScreen(ctx); this._drawOverlay(ctx, 'GAMEOVER'); }
        else if (this.state === 'DRAW')     { this._drawGameScreen(ctx); this._drawOverlay(ctx, 'DRAW'); }

        /* Particles on top */
        this._drawParticles(ctx);

        /* Screen flash */
        if (this._flashAlpha > 0) {
            ctx.fillStyle = `rgba(${this._flashRGB},${this._flashAlpha})`;
            ctx.fillRect(0, 0, this.W, this.H);
        }

        ctx.restore();
    }

    /* ── Background (hex grid + ambient particles, shared neon style) ── */
    _drawBackground(ctx) {
        const tc = this.themeColor;
        const bg = ctx.createLinearGradient(0, 0, 0, this.H);
        bg.addColorStop(0, '#030810');
        bg.addColorStop(0.5, '#060e1a');
        bg.addColorStop(1, '#040a12');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.W, this.H);

        /* Ambient glow */
        const glow = ctx.createRadialGradient(
            this.W * 0.3, this.H * 0.2, 0,
            this.W * 0.3, this.H * 0.2, this.W * 0.6
        );
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

    /* ── Shared button helper ── */
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
        ctx.fillText('NEON TACTICS', cx, titleY);
        ctx.shadowBlur = 0;

        /* Subtitle */
        const glowA = 0.4 + Math.sin(this.tick * 0.04) * 0.3;
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = `rgba(${tc.rgb}, ${glowA})`;
        ctx.fillText('\u2716 YancoTab Tic-Tac-Toe \u25CB', cx, titleY + 30);

        /* Difficulty selector */
        const diffY = cy - this.H * 0.10;
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText('AI DIFFICULTY', cx, diffY - 22);

        const diffKeys = ['easy', 'medium', 'hard'];
        const diffLabels = ['Easy', 'Medium', 'Hard'];
        const diffBtnW = Math.min(80, this.W * 0.2);
        const diffSpacing = diffBtnW + 8;
        const diffStartX = cx - (diffKeys.length - 1) * diffSpacing / 2;

        for (let i = 0; i < diffKeys.length; i++) {
            const dk = diffKeys[i];
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
            ctx.fillText(diffLabels[i], bx, diffY);

            this._addButton(btnX, btnY, diffBtnW, btnH, () => {
                this.difficulty = dk;
                this._save();
            });
        }

        /* Score summary */
        const scoreY = cy + this.H * 0.01;
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`W ${this.playerWins}  \u00B7  L ${this.aiWins}  \u00B7  D ${this.draws}`, cx, scoreY);

        if (this.bestStreak > 0) {
            ctx.font = 'bold 12px system-ui, sans-serif';
            ctx.fillStyle = '#fbbf24';
            ctx.fillText(`\u2605 Best Streak: ${this.bestStreak}`, cx, scoreY + 20);
        }

        /* PLAY button */
        const btnW = Math.min(180, this.W * 0.5);
        const playY = cy + this.H * 0.12;
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

        /* Keyboard hints */
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillText('Arrows + Space to play \u00B7 You are X', cx, this.H - 30);

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
        ctx.fillText('RECORD', cx, statsY);

        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(`Wins: ${this.playerWins}  |  Losses: ${this.aiWins}  |  Draws: ${this.draws}`, cx, statsY + 24);

        const total = this.playerWins + this.aiWins + this.draws;
        if (total > 0) {
            const winPct = Math.round(this.playerWins / total * 100);
            ctx.fillText(`Win Rate: ${winPct}%  |  Best Streak: ${this.bestStreak}`, cx, statsY + 44);
        }

        /* Reset stats */
        const resetY = statsY + 80;
        this._drawBtn(ctx, 'Reset Stats', cx, resetY, 120, 36, {
            primary: false,
            action: () => {
                this.playerWins = 0; this.aiWins = 0; this.draws = 0;
                this.streak = 0; this.bestStreak = 0;
                this._save();
            },
            font: '12px system-ui, sans-serif',
        });

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

    /* ── Game Screen ── */
    _drawGameScreen(ctx) {
        this._drawHUD(ctx);
        this._drawGrid(ctx);
        this._drawMarks(ctx);
        if (this.winCells) this._drawWinLine(ctx);
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

        /* Score left */
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillStyle = tc.main;
        ctx.fillText(`You ${this.playerWins}`, 12, yc - 8);
        ctx.fillStyle = '#e855a0';
        ctx.fillText(`AI ${this.aiWins}`, 12, yc + 8);

        /* Turn indicator center */
        ctx.textAlign = 'center';
        ctx.font = 'bold 14px system-ui, sans-serif';
        if (this.state === 'PLAYING') {
            if (this.aiPending) {
                const dots = '.'.repeat(1 + Math.floor(this.tick / 15) % 3);
                ctx.fillStyle = '#e855a0';
                ctx.fillText(`AI thinking${dots}`, this.W / 2, yc);
            } else {
                ctx.fillStyle = tc.main;
                ctx.fillText('Your turn (X)', this.W / 2, yc);
            }
        }

        /* Streak right */
        if (this.streak > 0) {
            ctx.textAlign = 'right';
            ctx.font = 'bold 12px system-ui, sans-serif';
            ctx.fillStyle = '#fbbf24';
            ctx.fillText(`\u{1F525} ${this.streak}`, this.W - 70, yc);
        }

        /* Menu button (right) */
        const menuBtnW = 55, menuBtnH = 26;
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
            this.aiPending = false;
        });

        ctx.restore();
    }

    /* ── Grid ── */
    _drawGrid(ctx) {
        const tc = this.themeColor;
        const cs = this.cellSize;
        const gx = this.gridX, gy = this.gridY;

        /* Cell backgrounds */
        for (let i = 0; i < 9; i++) {
            const row = Math.floor(i / 3), col = i % 3;
            const x = gx + col * cs, y = gy + row * cs;
            const isEmpty = this.board[i].mark === '';
            const isHover = i === this.hover && isEmpty;
            const isCursor = i === this.cursor && !this.aiPending && this.state === 'PLAYING';

            /* Glass cell */
            const grad = ctx.createLinearGradient(x, y, x, y + cs);
            grad.addColorStop(0, isHover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)');
            grad.addColorStop(1, 'rgba(255,255,255,0.01)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(x + 2, y + 2, cs - 4, cs - 4, 8);
            ctx.fill();

            /* Hover glow */
            if (isHover) {
                ctx.strokeStyle = `rgba(${tc.rgb}, 0.3)`;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            /* Cursor highlight */
            if (isCursor) {
                ctx.strokeStyle = tc.main;
                ctx.lineWidth = 2;
                ctx.shadowBlur = 8;
                ctx.shadowColor = tc.main;
                ctx.beginPath();
                ctx.roundRect(x + 2, y + 2, cs - 4, cs - 4, 8);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            /* AI thinking pulse on empty cells */
            if (this.aiPending && isEmpty) {
                const pulse = 0.02 + Math.sin(this.tick * 0.06 + i * 0.5) * 0.02;
                ctx.fillStyle = `rgba(232,85,160, ${pulse})`;
                ctx.beginPath();
                ctx.roundRect(x + 2, y + 2, cs - 4, cs - 4, 8);
                ctx.fill();
            }
        }

        /* Grid lines — neon glow */
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(${tc.rgb}, 0.35)`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = `rgba(${tc.rgb}, 0.3)`;

        const pad = 8;
        /* Vertical lines */
        for (let c = 1; c < 3; c++) {
            const x = gx + c * cs;
            ctx.beginPath();
            ctx.moveTo(x, gy + pad);
            ctx.lineTo(x, gy + 3 * cs - pad);
            ctx.stroke();
        }
        /* Horizontal lines */
        for (let r = 1; r < 3; r++) {
            const y = gy + r * cs;
            ctx.beginPath();
            ctx.moveTo(gx + pad, y);
            ctx.lineTo(gx + 3 * cs - pad, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    /* ── X and O Marks ── */
    _drawMarks(ctx) {
        const cs = this.cellSize;
        const gx = this.gridX, gy = this.gridY;

        for (let i = 0; i < 9; i++) {
            const cell = this.board[i];
            if (cell.mark === '') continue;

            const row = Math.floor(i / 3), col = i % 3;
            const cx = gx + col * cs + cs / 2;
            const cy = gy + row * cs + cs / 2;

            /* Animation progress 0→1 (~0.25s) */
            const frames = this.tick - cell.placedTick;
            const anim = Math.min(1, frames / 15);

            const isWinCell = this.winCells && this.winCells.includes(i);
            const winPulse = isWinCell ? 0.85 + Math.sin(this.tick * 0.08) * 0.15 : 1;

            if (cell.mark === 'X') {
                this._drawX(ctx, cx, cy, cs * 0.3 * winPulse, anim, isWinCell);
            } else {
                this._drawO(ctx, cx, cy, cs * 0.3 * winPulse, anim, isWinCell);
            }
        }
    }

    _drawX(ctx, cx, cy, size, anim, glow) {
        const tc = this.themeColor;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(3, size * 0.18);
        ctx.strokeStyle = tc.main;
        ctx.shadowBlur = glow ? 20 : 10;
        ctx.shadowColor = glow ? tc.main : `rgba(${tc.rgb}, 0.5)`;

        /* Line 1: top-left → bottom-right (first half of animation) */
        const a1 = Math.min(1, anim * 2);
        if (a1 > 0) {
            ctx.beginPath();
            ctx.moveTo(cx - size, cy - size);
            ctx.lineTo(cx - size + 2 * size * a1, cy - size + 2 * size * a1);
            ctx.stroke();
        }

        /* Line 2: top-right → bottom-left (second half of animation) */
        const a2 = Math.min(1, Math.max(0, anim * 2 - 1));
        if (a2 > 0) {
            ctx.beginPath();
            ctx.moveTo(cx + size, cy - size);
            ctx.lineTo(cx + size - 2 * size * a2, cy - size + 2 * size * a2);
            ctx.stroke();
        }

        ctx.restore();
    }

    _drawO(ctx, cx, cy, radius, anim, glow) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(3, radius * 0.18);
        ctx.strokeStyle = '#e855a0';
        ctx.shadowBlur = glow ? 20 : 10;
        ctx.shadowColor = glow ? '#e855a0' : 'rgba(232,85,160,0.5)';

        /* Arc sweep animation */
        const endAngle = -Math.PI / 2 + Math.PI * 2 * anim;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, -Math.PI / 2, endAngle);
        ctx.stroke();

        ctx.restore();
    }

    /* ── Win Line ── */
    _drawWinLine(ctx) {
        if (!this.winCells || this.winTick < 0) return;

        const frames = this.tick - this.winTick;
        const lineAnim = Math.min(1, frames / 20);
        if (lineAnim <= 0) return;

        const cs = this.cellSize;
        const gx = this.gridX, gy = this.gridY;

        /* Cell centers */
        const s = this.winCells[0], e = this.winCells[2];
        const sr = Math.floor(s / 3), sc = s % 3;
        const er = Math.floor(e / 3), ec = e % 3;
        const sx = gx + sc * cs + cs / 2, sy = gy + sr * cs + cs / 2;
        const ex = gx + ec * cs + cs / 2, ey = gy + er * cs + cs / 2;

        /* Animated line endpoint */
        const curX = sx + (ex - sx) * lineAnim;
        const curY = sy + (ey - sy) * lineAnim;

        /* Color based on winner */
        const winner = this.board[this.winCells[0]].mark;
        const color = winner === 'X' ? this.themeColor.main : '#e855a0';
        const rgb = winner === 'X' ? this.themeColor.rgb : '232,85,160';

        ctx.save();
        ctx.lineCap = 'round';

        /* Glow trail (wider, translucent) */
        ctx.lineWidth = 10;
        ctx.strokeStyle = `rgba(${rgb}, 0.2)`;
        ctx.shadowBlur = 30;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(curX, curY);
        ctx.stroke();

        /* Core line */
        ctx.lineWidth = 4;
        ctx.strokeStyle = color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(curX, curY);
        ctx.stroke();

        ctx.restore();

        /* Emit particles at the tip while drawing */
        if (lineAnim < 1 && frames % 2 === 0) {
            this._emitParticles(curX, curY, color, 2);
        }
    }

    /* ── Result Overlays ── */
    _drawOverlay(ctx, type) {
        ctx.save();

        ctx.fillStyle = 'rgba(3,8,16,0.6)';
        ctx.fillRect(0, 0, this.W, this.H);

        const cx = this.W / 2, cy = this.H / 2;
        const tc = this.themeColor;

        let title, titleColor, shadowColor;
        if (type === 'WIN') {
            title = 'YOU WIN!';
            titleColor = tc.main;
            shadowColor = tc.main;
        } else if (type === 'GAMEOVER') {
            title = 'AI WINS';
            titleColor = '#ff6b6b';
            shadowColor = '#ff4444';
        } else {
            title = "IT'S A DRAW";
            titleColor = '#fbbf24';
            shadowColor = '#f59e0b';
        }

        /* Title */
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.min(44, this.W * 0.1)}px system-ui, sans-serif`;
        ctx.shadowBlur = 30;
        ctx.shadowColor = shadowColor;
        ctx.fillStyle = titleColor;
        ctx.fillText(title, cx, cy - this.H * 0.12);
        ctx.shadowBlur = 0;

        /* Score line */
        ctx.font = '14px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`W ${this.playerWins}  \u00B7  L ${this.aiWins}  \u00B7  D ${this.draws}`, cx, cy - this.H * 0.02);

        /* Streak info */
        if (type === 'WIN' && this.streak > 1) {
            ctx.font = 'bold 14px system-ui, sans-serif';
            ctx.fillStyle = '#fbbf24';
            ctx.fillText(`\u{1F525} ${this.streak} win streak!`, cx, cy + this.H * 0.04);
        }
        if (type === 'WIN' && this.streak === this.bestStreak && this.bestStreak > 1) {
            const pulse = 0.7 + Math.sin(this.tick * 0.08) * 0.3;
            ctx.font = 'bold 12px system-ui, sans-serif';
            ctx.fillStyle = `rgba(251,191,36,${pulse})`;
            ctx.fillText('\u2605 NEW BEST STREAK! \u2605', cx, cy + this.H * 0.09);
        }

        /* Buttons */
        const btnW = Math.min(180, this.W * 0.5);
        this._drawBtn(ctx, '\u{1F504}  Play Again', cx, cy + this.H * 0.16, btnW, 48, {
            action: () => this._startGame(),
            font: 'bold 17px system-ui, sans-serif',
        });
        this._drawBtn(ctx, '\u2190  Menu', cx, cy + this.H * 0.26, btnW, 40, {
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

    /* ── Particles Render ── */
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
}
