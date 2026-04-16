/**
 * SnakeApp — "Neon Serpent"
 *
 * Full-canvas immersive snake game with:
 *  - 3D neon tube visuals (Canvas2D radial gradients)
 *  - Smooth interpolated movement between grid cells
 *  - Hex grid background with floating particles
 *  - Combo system with floating score text
 *  - 4 power-ups: Ghost, Slow-Mo, Magnet, Shield
 *  - Tiered food: Regular, Golden, Diamond
 *  - Particle effects on eat / death / tail trail
 *  - Swipe + keyboard controls (no D-pad shell)
 *  - Progressive speed (no difficulty selector)
 *  - High score + settings persistence (localStorage)
 *  - Quick restart from game over
 */
import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

/* ── Constants ── */
const LS_KEY   = 'yancotab_neon_serpent';
const CELL     = 20;

const COLORS = {
    cyan:    { h: 174, s: 72, main: '#2dd4bf', rgb: '45,212,191'  },
    magenta: { h: 330, s: 75, main: '#e855a0', rgb: '232,85,160'  },
    gold:    { h: 45,  s: 90, main: '#f5b731', rgb: '245,183,49'  },
    emerald: { h: 155, s: 70, main: '#34d399', rgb: '52,211,153'  },
};

const FOOD_TIERS = [
    { id: 'regular', color: '#5eead4', glow: '#2dd4bf', points: 10,  lifespan: Infinity, spawnChance: 1   },
    { id: 'golden',  color: '#fbbf24', glow: '#f59e0b', points: 30,  lifespan: 480,      spawnChance: 0   },
    { id: 'diamond', color: '#e0e7ff', glow: '#a78bfa', points: 50,  lifespan: 300,      spawnChance: 0   },
];

const POWERUP_TYPES = [
    { id: 'ghost',  icon: '\uD83D\uDC7B', color: '#c084fc', label: 'Ghost',   duration: 360 },
    { id: 'slow',   icon: '\u23F3',       color: '#60a5fa', label: 'Slow-Mo', duration: 300 },
    { id: 'magnet', icon: '\uD83E\uDDF2', color: '#fbbf24', label: 'Magnet',  duration: 300 },
    { id: 'shield', icon: '\uD83D\uDEE1\uFE0F', color: '#4ade80', label: 'Shield',  duration: Infinity },
];

/* ── App Shell ── */
export class SnakeApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = {
            name: 'Snake',
            id: 'snake',
            icon: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0b1320'/><stop offset='1' stop-color='#1565c0'/></linearGradient></defs><rect x='12' y='12' width='104' height='104' rx='28' fill='url(#g)'/><rect x='14' y='14' width='100' height='100' rx='26' fill='rgba(255,255,255,0.06)'/><g fill='none' stroke='rgba(255,255,255,0.92)' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'><path d='M40 78c0 10 10 18 24 18s24-8 24-18-10-18-24-18-24-8-24-18 10-18 24-18 24 8 24 18'/><circle cx='86' cy='38' r='4' fill='rgba(255,255,255,0.92)' stroke='none'/></g></svg>`
        };
        this.game = null;
    }

    async init() {
        this.root = el('div', { class: 'app-window app-snake' });
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'snake-canvas';
        this.canvas.tabIndex = 0;
        this.root.appendChild(this.canvas);

        this.game = new NeonSerpent(this.canvas, () => this._checkResize());

        /* Poll until root is in the DOM and visible, then start the game loop.
           ResizeObserver doesn't fire for elements not yet in the document. */
        this._pollStart();
    }

    _pollStart() {
        const r = this.root.getBoundingClientRect();
        if (r.width >= 40 && r.height >= 40) {
            this._resize();
            this.game.start();
            this.canvas.focus();
            /* Now observe for future resizes */
            this._ro = new ResizeObserver(() => this._resize());
            this._ro.observe(this.root);
        } else {
            setTimeout(() => this._pollStart(), 50);
        }
    }

    /** Called from game loop every frame — handles initial sizing when root enters DOM */
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
   NeonSerpent — Core game engine
   ════════════════════════════════════════════════════════════════ */
class NeonSerpent {
    constructor(canvas, onFrame) {
        this.cv = canvas;
        this.ctx = canvas.getContext('2d');
        this._onFrame = onFrame;       // called every frame for resize check
        this.W = canvas.width;
        this.H = canvas.height;
        this.cols = 10; this.rows = 10;

        /* State */
        this.state    = 'MENU';        // MENU | SETTINGS | PLAYING | GAMEOVER
        this.running  = false;
        this.paused   = false;
        this.tick      = 0;            // global frame counter
        this.gameTick  = 0;            // game-specific frame counter (for spawns)

        /* Snake */
        this.snake     = [];
        this.dir       = { x: 1, y: 0 };
        this.nextDir   = { x: 1, y: 0 };
        this.interp    = 0;            // 0→1 interpolation between ticks
        this.prevSnake = [];           // snapshot for interpolation

        /* Speed */
        this.baseSpeed   = 110;       // ms per move at start
        this.speed       = 110;
        this.minSpeed    = 48;        // speed cap
        this.foodsEaten  = 0;

        /* Score + combo */
        this.score     = 0;
        this.combo     = 0;
        this.comboTimer = 0;          // frames remaining
        this.COMBO_WINDOW = 240;      // 4 seconds at 60fps
        this.multipliers = [1, 1.5, 2, 3, 5];

        /* Food */
        this.foods      = [];         // [{x, y, tier, life}]
        this.bonusCooldown = 0;

        /* Power-ups */
        this.powerups      = [];      // on-field [{x, y, type, life}]
        this.activePowers  = {};      // {ghost: framesLeft, ...}
        this.powerCooldown = 0;

        /* Particles */
        this.particles  = [];
        this.floatTexts = [];         // [{x, y, text, color, life, maxLife}]

        /* Persistence */
        this._loadSave();

        /* Input */
        this._bindInput();

        /* Timing */
        this.lastMove = 0;
        this.lastFrame = 0;
    }

    /* ── Save / Load ── */
    _loadSave() {
        try {
            const d = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
            this.best       = d.best       || 0;
            this.bestCombo  = d.bestCombo  || 0;
            this.gamesPlayed = d.gamesPlayed || 0;
            this.theme      = COLORS[d.theme] ? d.theme : 'cyan';
            this.wallMode   = !!d.wallMode;
        } catch {
            this.best = 0; this.bestCombo = 0; this.gamesPlayed = 0;
            this.theme = 'cyan'; this.wallMode = false;
        }
    }
    _save() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({
                best: this.best, bestCombo: this.bestCombo,
                gamesPlayed: this.gamesPlayed,
                theme: this.theme, wallMode: this.wallMode,
            }));
        } catch { /* ignore */ }
    }

    get themeColor() { return COLORS[this.theme]; }

    /* ── Input ── */
    _bindInput() {
        /* Clickable regions populated by each draw call */
        this._buttons = [];

        /* Keyboard */
        this.cv.addEventListener('keydown', e => {
            const k = e.key;
            if (this.state === 'PLAYING') {
                if (this.paused) {
                    if (k === ' ' || k === 'p' || k === 'Escape') this.paused = false;
                    else if (k === 'q' || k === 'm') this.state = 'MENU';
                } else {
                    if (k === 'ArrowUp'    || k === 'w') this._setDir(0, -1);
                    else if (k === 'ArrowDown'  || k === 's') this._setDir(0, 1);
                    else if (k === 'ArrowLeft'  || k === 'a') this._setDir(-1, 0);
                    else if (k === 'ArrowRight' || k === 'd') this._setDir(1, 0);
                    else if (k === ' ' || k === 'p') this.paused = true;
                    else if (k === 'Escape') this.paused = true;
                }
                e.preventDefault();
            } else if (this.state === 'MENU') {
                if (k === ' ' || k === 'Enter') this._startGame();
                else if (k === 's') this.state = 'SETTINGS';
                e.preventDefault();
            } else if (this.state === 'SETTINGS') {
                if (k === 'Escape' || k === 'Backspace') this.state = 'MENU';
                else if (k === 't') this._cycleTheme();
                else if (k === 'w' || k === 'm') { this.wallMode = !this.wallMode; this._save(); }
                e.preventDefault();
            } else if (this.state === 'GAMEOVER') {
                if (k === ' ' || k === 'Enter') this._startGame();
                else if (k === 'Escape' || k === 'm') this.state = 'MENU';
                e.preventDefault();
            }
        });

        /* Swipe + Tap */
        let sx = 0, sy = 0, st = 0, moved = false;
        this.cv.addEventListener('pointerdown', e => {
            sx = e.clientX; sy = e.clientY; st = Date.now(); moved = false;
            this.cv.focus();
        });
        this.cv.addEventListener('pointermove', e => {
            const dx = e.clientX - sx, dy = e.clientY - sy;
            if (Math.abs(dx) > 15 || Math.abs(dy) > 15) moved = true;
        });
        this.cv.addEventListener('pointerup', e => {
            const dx = e.clientX - sx, dy = e.clientY - sy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const elapsed = Date.now() - st;

            if (dist > 20 && this.state === 'PLAYING' && !this.paused) {
                /* Swipe direction */
                if (Math.abs(dx) > Math.abs(dy)) {
                    this._setDir(dx > 0 ? 1 : -1, 0);
                } else {
                    this._setDir(0, dy > 0 ? 1 : -1);
                }
            } else if (!moved && elapsed < 300) {
                /* Tap — check button hit areas first */
                const r = this.cv.getBoundingClientRect();
                const tx = e.clientX - r.left, ty = e.clientY - r.top;
                const hit = this._hitButton(tx, ty);
                if (hit) {
                    hit();
                } else if (this.state === 'PLAYING' && !this.paused) {
                    /* Tap on game area (not a button) = pause */
                    this.paused = true;
                }
            }
        });
    }

    _setDir(dx, dy) {
        if (this.state !== 'PLAYING' || this.paused) return;
        if (dx !== 0 && this.dir.x !== 0) return;
        if (dy !== 0 && this.dir.y !== 0) return;
        this.nextDir = { x: dx, y: dy };
    }

    /** Register a tappable button region during draw. action is a callback. */
    _addButton(x, y, w, h, action) {
        this._buttons.push({ x, y, w, h, action });
    }

    /** Check tap position against registered buttons. Returns action or null. */
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

    /* ── Game Control ── */
    start() {
        this.running = true;
        this.lastFrame = performance.now();
        this._scheduleLoop();
    }

    _scheduleLoop() {
        /* Use rAF when available and tab is visible, fall back to setTimeout */
        if (document.hidden) {
            setTimeout(() => this._loop(performance.now()), 16);
        } else {
            requestAnimationFrame(t => this._loop(t));
        }
    }
    stop() { this.running = false; }

    resize(w, h) {
        this.W = w; this.H = h;
        this.cols = Math.max(8, Math.floor(w / CELL));
        this.rows = Math.max(8, Math.floor(h / CELL));
        /* Clamp snake & food */
        for (const s of this.snake) { s.x = ((s.x % this.cols) + this.cols) % this.cols; s.y = ((s.y % this.rows) + this.rows) % this.rows; }
        this.prevSnake = this.snake.map(s => ({ ...s }));
        this.foods = this.foods.filter(f => f.x < this.cols && f.y < this.rows);
        this.powerups = this.powerups.filter(p => p.x < this.cols && p.y < this.rows);
    }

    _startGame() {
        const cx = Math.floor(this.cols / 2);
        const cy = Math.floor(this.rows / 2);
        this.snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
        this.prevSnake = this.snake.map(s => ({ ...s }));
        this.dir = { x: 1, y: 0 };
        this.nextDir = { x: 1, y: 0 };
        this.interp = 0;
        this.score = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.foodsEaten = 0;
        this.speed = this.baseSpeed;
        this.foods = [];
        this.powerups = [];
        this.activePowers = {};
        this.particles = [];
        this.floatTexts = [];
        this.powerCooldown = 600 + Math.random() * 600; // 10-20s
        this.bonusCooldown  = 720 + Math.random() * 720;
        this.gameTick = 0;
        this.state = 'PLAYING';
        this.paused = false;
        this._spawnFood('regular');
    }

    _die() {
        this.state = 'GAMEOVER';
        this.gamesPlayed++;
        const isNew = this.score > this.best;
        if (isNew) this.best = this.score;
        if (this.combo > this.bestCombo) this.bestCombo = this.combo;
        this._isNewBest = isNew;
        this._save();

        /* Death particles */
        for (const seg of this.snake) {
            const px = seg.x * CELL + CELL / 2;
            const py = seg.y * CELL + CELL / 2;
            for (let j = 0; j < 4; j++) {
                const angle = Math.random() * Math.PI * 2;
                const spd = 1.5 + Math.random() * 3;
                this.particles.push({
                    x: px, y: py,
                    vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                    life: 40 + Math.random() * 20, maxLife: 60,
                    color: this.themeColor.main, size: 3 + Math.random() * 2,
                });
            }
        }
        /* Screen flash */
        this._flashAlpha = 0.4;
        if (navigator.vibrate) navigator.vibrate(80);
    }

    /* ── Spawning ── */
    _spawnFood(tierId) {
        const tier = FOOD_TIERS.find(t => t.id === tierId);
        const pos = this._findEmpty();
        if (!pos) return;
        this.foods.push({ x: pos.x, y: pos.y, tier, life: tier.lifespan, born: this.tick });
    }

    _spawnPowerup() {
        const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
        const pos = this._findEmpty();
        if (!pos) return;
        this.powerups.push({ x: pos.x, y: pos.y, type, life: 480 }); // 8s
    }

    _findEmpty() {
        for (let tries = 0; tries < 200; tries++) {
            const x = Math.floor(Math.random() * this.cols);
            const y = Math.floor(Math.random() * this.rows);
            if (this.snake.some(s => s.x === x && s.y === y)) continue;
            if (this.foods.some(f => f.x === x && f.y === y)) continue;
            if (this.powerups.some(p => p.x === x && p.y === y)) continue;
            return { x, y };
        }
        return null;
    }

    /* ── Main Loop ── */
    _loop(now) {
        if (!this.running) return;
        try {
        if (this._onFrame) this._onFrame();
        const dt = now - this.lastFrame;
        this.lastFrame = now;
        this.tick++;

        if (this.state === 'PLAYING' && !this.paused) {
            /* Accumulate time for move */
            this.lastMove += dt;
            const effectiveSpeed = this.activePowers.slow ? this.speed / 0.6 : this.speed;

            /* Interpolation factor */
            this.interp = Math.min(this.lastMove / effectiveSpeed, 1);

            if (this.lastMove >= effectiveSpeed) {
                this.lastMove -= effectiveSpeed;
                this._update();
                this.interp = 0;
            }
        }

        /* Update particles & float texts always */
        this._updateParticles();

        /* Flash decay */
        if (this._flashAlpha > 0) this._flashAlpha -= 0.015;

        this.render();
        } catch (e) { console.error('[NeonSerpent]', e); }
        this._scheduleLoop();
    }

    /* ── Game Update (one tick) ── */
    _update() {
        this.gameTick++;

        /* Snapshot for interpolation */
        this.prevSnake = this.snake.map(s => ({ ...s }));

        this.dir = { ...this.nextDir };
        const head = { x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y };

        /* Wall handling */
        if (this.wallMode) {
            if (head.x < 0 || head.x >= this.cols || head.y < 0 || head.y >= this.rows) {
                this._die(); return;
            }
        } else {
            if (head.x < 0) head.x = this.cols - 1;
            if (head.x >= this.cols) head.x = 0;
            if (head.y < 0) head.y = this.rows - 1;
            if (head.y >= this.rows) head.y = 0;
        }

        /* Self collision (skip index 0 which is current head, not yet shifted) */
        const selfHit = this.snake.some((s, i) => i > 0 && s.x === head.x && s.y === head.y);
        if (selfHit) {
            if (this.activePowers.ghost) {
                /* Ghost: pass through */
            } else if (this.activePowers.shield) {
                delete this.activePowers.shield;
                this._emitParticles(head.x * CELL + CELL / 2, head.y * CELL + CELL / 2, '#4ade80', 10);
                this.floatTexts.push({ x: head.x * CELL + CELL / 2, y: head.y * CELL, text: 'SHIELD!', color: '#4ade80', life: 60, maxLife: 60 });
            } else {
                this._die(); return;
            }
        }

        this.snake.unshift(head);

        /* Food check */
        let ate = false;
        this.foods = this.foods.filter(f => {
            if (f.x === head.x && f.y === head.y) {
                ate = true;
                this.foodsEaten++;
                /* Combo */
                if (this.comboTimer > 0) {
                    this.combo = Math.min(this.combo + 1, this.multipliers.length - 1);
                } else {
                    this.combo = 0;
                }
                this.comboTimer = this.COMBO_WINDOW;
                const mult = this.multipliers[this.combo];
                const pts = Math.round(f.tier.points * mult);
                this.score += pts;

                /* Float text */
                const ftColor = this.combo >= 2 ? '#fbbf24' : this.themeColor.main;
                const ftText = this.combo > 0 ? `+${pts} x${mult}` : `+${pts}`;
                this.floatTexts.push({ x: f.x * CELL + CELL / 2, y: f.y * CELL, text: ftText, color: ftColor, life: 50, maxLife: 50 });

                /* Particles */
                this._emitParticles(f.x * CELL + CELL / 2, f.y * CELL + CELL / 2, f.tier.glow, 14);

                /* Haptic */
                if (navigator.vibrate) navigator.vibrate(15);
                return false;
            }
            return true;
        });

        if (!ate) {
            this.snake.pop();
        } else {
            /* Ensure always one regular food */
            if (!this.foods.some(f => f.tier.id === 'regular')) this._spawnFood('regular');

            /* Speed up every 5 foods */
            if (this.foodsEaten % 5 === 0 && this.speed > this.minSpeed) {
                this.speed = Math.max(this.minSpeed, this.speed - 5);
            }
        }

        /* Combo timer */
        if (this.comboTimer > 0) {
            this.comboTimer--;
            if (this.comboTimer <= 0) this.combo = 0;
        }

        /* Tick down food lifespans */
        this.foods = this.foods.filter(f => {
            if (f.life !== Infinity) {
                f.life--;
                if (f.life <= 0) return false;
            }
            return true;
        });
        /* Ensure regular food exists */
        if (!this.foods.some(f => f.tier.id === 'regular')) this._spawnFood('regular');

        /* Bonus food cooldown */
        this.bonusCooldown--;
        if (this.bonusCooldown <= 0 && this.foods.length < 4) {
            const r = Math.random();
            this._spawnFood(r < 0.3 ? 'diamond' : 'golden');
            this.bonusCooldown = 720 + Math.random() * 720;
        }

        /* Power-up field tick */
        this.powerups = this.powerups.filter(p => {
            if (p.x === head.x && p.y === head.y) {
                this.activePowers[p.type.id] = p.type.duration;
                this._emitParticles(p.x * CELL + CELL / 2, p.y * CELL + CELL / 2, p.type.color, 10);
                this.floatTexts.push({ x: p.x * CELL + CELL / 2, y: p.y * CELL, text: p.type.label + '!', color: p.type.color, life: 50, maxLife: 50 });
                if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
                return false;
            }
            p.life--;
            return p.life > 0;
        });

        /* Power-up spawn cooldown */
        this.powerCooldown--;
        if (this.powerCooldown <= 0 && this.powerups.length === 0) {
            this._spawnPowerup();
            this.powerCooldown = 600 + Math.random() * 600;
        }

        /* Tick down active powers */
        for (const k of Object.keys(this.activePowers)) {
            if (this.activePowers[k] !== Infinity) {
                this.activePowers[k]--;
                if (this.activePowers[k] <= 0) delete this.activePowers[k];
            }
        }

        /* Magnet effect: drift food toward head */
        if (this.activePowers.magnet) {
            for (const f of this.foods) {
                if (f.x < head.x) f.x++;
                else if (f.x > head.x) f.x--;
                if (f.y < head.y) f.y++;
                else if (f.y > head.y) f.y--;
            }
        }

        /* Tail trail particles */
        const tail = this.snake[this.snake.length - 1];
        if (Math.random() < 0.4) {
            this.particles.push({
                x: tail.x * CELL + CELL / 2 + (Math.random() - 0.5) * 6,
                y: tail.y * CELL + CELL / 2 + (Math.random() - 0.5) * 6,
                vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
                life: 20 + Math.random() * 15, maxLife: 35,
                color: this.themeColor.main, size: 2,
            });
        }
    }

    /* ── Particles ── */
    _emitParticles(px, py, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 1 + Math.random() * 3;
            this.particles.push({
                x: px, y: py,
                vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                life: 30 + Math.random() * 20, maxLife: 50,
                color, size: 2 + Math.random() * 3,
            });
        }
    }
    _updateParticles() {
        this.particles = this.particles.filter(p => {
            p.x += p.vx; p.y += p.vy;
            p.vx *= 0.97; p.vy *= 0.97;
            p.life--;
            return p.life > 0;
        });
        this.floatTexts = this.floatTexts.filter(f => {
            f.y -= 0.8;
            f.life--;
            return f.life > 0;
        });
    }

    /* ════════════════════════════════════════════════════════════
       RENDERING
       ════════════════════════════════════════════════════════════ */
    render() {
        const ctx = this.ctx;
        ctx.save();
        this._buttons = [];  // clear button hit areas each frame

        /* ── Background ── */
        this._drawBackground(ctx);

        if (this.state === 'MENU')          this._drawMenu(ctx);
        else if (this.state === 'SETTINGS') this._drawSettings(ctx);
        else if (this.state === 'PLAYING')  this._drawGame(ctx);
        else if (this.state === 'GAMEOVER') this._drawGame(ctx), this._drawGameOver(ctx);

        /* Particles (always on top) */
        this._drawParticles(ctx);
        this._drawFloatTexts(ctx);

        /* Screen flash */
        if (this._flashAlpha > 0) {
            ctx.fillStyle = `rgba(255,60,60,${this._flashAlpha})`;
            ctx.fillRect(0, 0, this.W, this.H);
        }

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

        /* Floating ambient particles */
        ctx.fillStyle = `rgba(${tc.rgb}, 0.08)`;
        const t = this.tick * 0.008;
        for (let i = 0; i < 30; i++) {
            const px = ((Math.sin(t + i * 2.1) * 0.5 + 0.5) * this.W + i * 47) % this.W;
            const py = ((Math.cos(t * 0.7 + i * 1.3) * 0.5 + 0.5) * this.H + i * 31) % this.H;
            ctx.beginPath();
            ctx.arc(px, py, 1 + Math.sin(t + i) * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /* ── Game Rendering ── */
    _drawGame(ctx) {
        const tc = this.themeColor;

        /* Wall glow if wall mode */
        if (this.wallMode) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ff4444';
            ctx.strokeStyle = 'rgba(255, 68, 68, 0.3)';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, this.cols * CELL - 2, this.rows * CELL - 2);
            ctx.shadowBlur = 0;
        }

        /* ── Food ── */
        for (const f of this.foods) {
            const fx = f.x * CELL + CELL / 2;
            const fy = f.y * CELL + CELL / 2;
            const pulse = 0.85 + Math.sin(this.tick * 0.08 + f.born) * 0.15;
            const r = (CELL / 2 - 2) * pulse;

            /* Glow */
            ctx.shadowBlur = 18;
            ctx.shadowColor = f.tier.glow;

            /* Orb */
            const orbGrad = ctx.createRadialGradient(fx - r * 0.3, fy - r * 0.3, 0, fx, fy, r);
            orbGrad.addColorStop(0, '#fff');
            orbGrad.addColorStop(0.3, f.tier.color);
            orbGrad.addColorStop(1, f.tier.glow);
            ctx.fillStyle = orbGrad;
            ctx.beginPath();
            ctx.arc(fx, fy, r, 0, Math.PI * 2);
            ctx.fill();

            /* Lifespan indicator for bonus foods */
            if (f.life !== Infinity && f.life < 180) {
                const blink = Math.sin(this.tick * 0.2) > 0;
                if (!blink) {
                    ctx.globalAlpha = 0.3;
                    ctx.fillStyle = '#000';
                    ctx.beginPath();
                    ctx.arc(fx, fy, r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }
            ctx.shadowBlur = 0;
        }

        /* ── Power-ups on field ── */
        for (const p of this.powerups) {
            const px = p.x * CELL + CELL / 2;
            const py = p.y * CELL + CELL / 2;
            const bounce = Math.sin(this.tick * 0.06) * 2;

            ctx.shadowBlur = 12;
            ctx.shadowColor = p.type.color;
            ctx.fillStyle = `rgba(0,0,0,0.4)`;
            ctx.beginPath();
            ctx.arc(px, py + bounce, CELL / 2 - 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = p.type.color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.font = '14px system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(p.type.icon, px, py + bounce);
        }

        /* ── Snake (3D tube) ── */
        const ghost = !!this.activePowers.ghost;
        const shield = !!this.activePowers.shield;
        const t = this.interp;

        for (let i = this.snake.length - 1; i >= 0; i--) {
            const cur = this.snake[i];
            const prev = this.prevSnake[i] || cur;

            /* Interpolated position */
            let ix = prev.x + (cur.x - prev.x) * t;
            let iy = prev.y + (cur.y - prev.y) * t;

            /* Handle wrapping interpolation */
            if (Math.abs(cur.x - prev.x) > 1) ix = cur.x;
            if (Math.abs(cur.y - prev.y) > 1) iy = cur.y;

            const cx = ix * CELL + CELL / 2;
            const cy = iy * CELL + CELL / 2;

            /* Gradient factor (head=0, tail=1) */
            const gf = i / Math.max(this.snake.length - 1, 1);
            const segR = (CELL / 2 - 1) * (1 - gf * 0.2);

            if (ghost) ctx.globalAlpha = i === 0 ? 0.8 : 0.35;

            if (i === 0) {
                /* ── Head ── */
                const hGrad = ctx.createRadialGradient(cx - segR * 0.3, cy - segR * 0.4, 0, cx, cy, segR * 1.2);
                hGrad.addColorStop(0, '#fff');
                hGrad.addColorStop(0.25, tc.main);
                hGrad.addColorStop(1, this._darken(tc.main, 0.5));
                ctx.fillStyle = hGrad;
                ctx.shadowBlur = 20;
                ctx.shadowColor = tc.main;
                ctx.beginPath();
                ctx.arc(cx, cy, segR + 1, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;

                /* Visor eye */
                const eyeOff = segR * 0.35;
                let ex = cx + this.dir.x * eyeOff;
                let ey = cy + this.dir.y * eyeOff;
                if (this.dir.x === 0 && this.dir.y === 0) ex = cx + eyeOff;

                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.ellipse(ex, ey, segR * 0.35, segR * 0.25, Math.atan2(this.dir.y, this.dir.x), 0, Math.PI * 2);
                ctx.fill();

                /* Eye glow */
                ctx.fillStyle = `rgba(${tc.rgb}, 0.9)`;
                ctx.beginPath();
                ctx.arc(ex + this.dir.x * 1.5, ey + this.dir.y * 1.5, 2.5, 0, Math.PI * 2);
                ctx.fill();

                /* Shield visual */
                if (shield) {
                    ctx.strokeStyle = 'rgba(74, 222, 128, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#4ade80';
                    ctx.beginPath();
                    /* Hexagonal shield */
                    for (let s = 0; s < 6; s++) {
                        const a = Math.PI / 3 * s - Math.PI / 6 + this.tick * 0.02;
                        const sx2 = cx + (segR + 5) * Math.cos(a);
                        const sy2 = cy + (segR + 5) * Math.sin(a);
                        s === 0 ? ctx.moveTo(sx2, sy2) : ctx.lineTo(sx2, sy2);
                    }
                    ctx.closePath();
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }
            } else {
                /* ── Body segment (3D cylinder) ── */
                const hue = tc.h;
                const sat = tc.s - gf * 20;
                const lit = 55 - gf * 20;
                const segColor = `hsl(${hue}, ${sat}%, ${lit}%)`;
                const segDark  = `hsl(${hue}, ${sat}%, ${lit * 0.4}%)`;
                const segLight = `hsl(${hue}, ${Math.min(100, sat + 10)}%, ${Math.min(90, lit + 25)}%)`;

                const bGrad = ctx.createRadialGradient(cx - segR * 0.3, cy - segR * 0.35, 0, cx, cy + segR * 0.2, segR * 1.1);
                bGrad.addColorStop(0, segLight);
                bGrad.addColorStop(0.5, segColor);
                bGrad.addColorStop(1, segDark);

                ctx.fillStyle = bGrad;
                ctx.shadowBlur = 6;
                ctx.shadowColor = `rgba(${tc.rgb}, 0.3)`;
                ctx.beginPath();
                ctx.arc(cx, cy, segR, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            if (ghost) ctx.globalAlpha = 1;
        }

        /* ── HUD ── */
        this._drawHUD(ctx);

        /* Pause overlay */
        if (this.paused) this._drawPause(ctx);
    }

    /* ── HUD ── */
    _drawHUD(ctx) {
        const tc = this.themeColor;
        ctx.save();

        /* Glass bar at top */
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        const barH = 36;
        ctx.fillRect(0, 0, this.W, barH);
        ctx.fillStyle = `rgba(${tc.rgb}, 0.08)`;
        ctx.fillRect(0, barH - 1, this.W, 1);

        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        const yc = barH / 2;

        /* Score */
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${this.score.toLocaleString()}`, 12, yc);

        /* Combo */
        if (this.combo > 0 && this.comboTimer > 0) {
            const cf = this.comboTimer / this.COMBO_WINDOW;
            ctx.fillStyle = `rgba(251, 191, 36, ${0.5 + cf * 0.5})`;
            ctx.font = 'bold 12px system-ui, sans-serif';
            ctx.fillText(`x${this.multipliers[this.combo]}`, 12 + ctx.measureText(`${this.score.toLocaleString()}`).width + 8, yc);
        }

        /* Best */
        ctx.textAlign = 'right';
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillStyle = this.score > this.best && this.best > 0 ? '#fbbf24' : 'rgba(255,255,255,0.4)';
        const bestLabel = this.score > this.best && this.best > 0 ? '\u2605 NEW BEST' : `\u2605 ${this.best.toLocaleString()}`;
        ctx.fillText(bestLabel, this.W - 12, yc);

        /* Active power-ups (icons with countdown arcs) */
        let px = this.W - 12;
        const powers = Object.entries(this.activePowers);
        if (powers.length > 0) {
            px = this.W / 2;
            ctx.textAlign = 'center';
            for (const [id, frames] of powers) {
                const pType = POWERUP_TYPES.find(p => p.id === id);
                if (!pType) continue;
                const iconY = barH + 16;
                ctx.font = '16px system-ui';
                ctx.fillStyle = '#fff';
                ctx.fillText(pType.icon, px, iconY);

                if (frames !== Infinity) {
                    const frac = frames / pType.duration;
                    ctx.strokeStyle = pType.color;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(px, iconY, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
                    ctx.stroke();
                }
                px += 32;
            }
        }

        /* Speed indicator (bottom-right thin bar) */
        const speedFrac = 1 - (this.speed - this.minSpeed) / (this.baseSpeed - this.minSpeed);
        const barW = 60, barY2 = this.H - 8;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(this.W - barW - 8, barY2, barW, 3);
        ctx.fillStyle = `rgba(${tc.rgb}, 0.6)`;
        ctx.fillRect(this.W - barW - 8, barY2, barW * speedFrac, 3);

        ctx.restore();
    }

    /* ── Shared: draw a rounded-rect button and register its hit area ── */
    _drawBtn(ctx, label, cx, cy, w, h, opts = {}) {
        const tc = this.themeColor;
        const x = cx - w / 2, y = cy - h / 2;
        const r = opts.radius || 10;
        const primary = opts.primary !== false;

        /* Background */
        ctx.fillStyle = primary
            ? `rgba(${tc.rgb}, 0.15)`
            : 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fill();

        /* Border */
        ctx.strokeStyle = primary
            ? `rgba(${tc.rgb}, 0.35)`
            : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        /* Label */
        ctx.font = opts.font || 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = primary ? '#fff' : 'rgba(255,255,255,0.6)';
        ctx.fillText(label, cx, cy);

        /* Register hit area */
        if (opts.action) this._addButton(x, y, w, h, opts.action);
    }

    /* ── Menu ── */
    _drawMenu(ctx) {
        const tc = this.themeColor;
        ctx.save();

        /* Overlay */
        ctx.fillStyle = 'rgba(3,8,16,0.85)';
        ctx.fillRect(0, 0, this.W, this.H);

        const cx = this.W / 2, cy = this.H / 2;

        /* Title */
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.min(42, this.W * 0.09)}px system-ui, sans-serif`;
        ctx.shadowBlur = 30;
        ctx.shadowColor = tc.main;
        ctx.fillStyle = tc.main;
        const titleY = cy - this.H * 0.22;
        ctx.fillText('NEON SERPENT', cx, titleY);
        ctx.shadowBlur = 0;

        /* Subtitle */
        const glowA = 0.4 + Math.sin(this.tick * 0.04) * 0.3;
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = `rgba(${tc.rgb}, ${glowA})`;
        ctx.fillText('\u{1F40D} YancoTab Snake', cx, titleY + 32);

        /* High score */
        if (this.best > 0) {
            ctx.font = 'bold 15px system-ui, sans-serif';
            ctx.fillStyle = '#fbbf24';
            ctx.fillText(`\u2605 Best: ${this.best.toLocaleString()}`, cx, cy - this.H * 0.06);
        }

        /* PLAY button */
        const btnW = Math.min(180, this.W * 0.5);
        this._drawBtn(ctx, '\u25B6  PLAY', cx, cy + 10, btnW, 48, {
            action: () => this._startGame(),
            font: 'bold 18px system-ui, sans-serif',
        });

        /* SETTINGS button */
        this._drawBtn(ctx, '\u2699  Settings', cx, cy + 70, btnW, 40, {
            primary: false,
            action: () => { this.state = 'SETTINGS'; },
            font: '14px system-ui, sans-serif',
        });

        /* Controls hint */
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.textAlign = 'center';
        ctx.fillText('Swipe or Arrow Keys to move', cx, this.H - 30);

        ctx.restore();
    }

    /* ── Settings ── */
    _drawSettings(ctx) {
        const tc = this.themeColor;
        ctx.save();

        /* Overlay */
        ctx.fillStyle = 'rgba(3,8,16,0.9)';
        ctx.fillRect(0, 0, this.W, this.H);

        const cx = this.W / 2;

        /* Title */
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('SETTINGS', cx, 50);

        /* ── Theme section ── */
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

            /* Dot */
            ctx.fillStyle = isActive ? c.main : `rgba(${c.rgb}, 0.35)`;
            ctx.beginPath();
            ctx.arc(dx, dotY, isActive ? 10 : 7, 0, Math.PI * 2);
            ctx.fill();

            /* Active ring */
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

            /* Label below dot */
            ctx.font = '10px system-ui, sans-serif';
            ctx.fillStyle = isActive ? c.main : 'rgba(255,255,255,0.3)';
            ctx.fillText(keys[i].charAt(0).toUpperCase() + keys[i].slice(1), dx, dotY + 24);

            /* Hit area for each dot */
            this._addButton(dx - 18, dotY - 18, 36, 50, () => {
                this.theme = keys[i];
                this._save();
            });
        }

        /* ── Wall mode ── */
        const wallY = dotY + 70;
        const wallBtnW = Math.min(220, this.W * 0.6);
        const wallLabel = this.wallMode
            ? '\uD83E\uDDF1  Walls: ON  (edges kill)'
            : '\uD83D\uDD04  Walls: OFF  (wrap around)';
        const wallColor = this.wallMode ? '#ff6b6b' : 'rgba(255,255,255,0.5)';

        /* Wall button background */
        const wx = cx - wallBtnW / 2, wh = 42;
        ctx.fillStyle = this.wallMode ? 'rgba(255,80,80,0.12)' : 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.roundRect(wx, wallY - wh / 2, wallBtnW, wh, 8);
        ctx.fill();
        ctx.strokeStyle = this.wallMode ? 'rgba(255,80,80,0.3)' : 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = wallColor;
        ctx.fillText(wallLabel, cx, wallY);

        this._addButton(wx, wallY - wh / 2, wallBtnW, wh, () => {
            this.wallMode = !this.wallMode;
            this._save();
        });

        /* ── Back button ── */
        const backY = this.H - 60;
        this._drawBtn(ctx, '\u2190  Back', cx, backY, 120, 40, {
            primary: false,
            action: () => { this.state = 'MENU'; },
            font: '14px system-ui, sans-serif',
        });

        /* Keyboard hints */
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillText('[T] Theme \u00B7 [W] Walls \u00B7 [Esc] Back', cx, this.H - 20);

        ctx.restore();
    }

    /* ── Pause ── */
    _drawPause(ctx) {
        ctx.save();
        ctx.fillStyle = 'rgba(3,8,16,0.6)';
        ctx.fillRect(0, 0, this.W, this.H);

        const cx = this.W / 2, cy = this.H / 2;
        const btnW = Math.min(170, this.W * 0.45);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 28px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.themeColor.main;
        ctx.fillText('\u23F8 PAUSED', cx, cy - 55);
        ctx.shadowBlur = 0;

        /* Resume button */
        this._drawBtn(ctx, '\u25B6  Resume', cx, cy + 5, btnW, 44, {
            action: () => { this.paused = false; },
            font: 'bold 16px system-ui, sans-serif',
        });

        /* Menu button */
        this._drawBtn(ctx, '\u2190  Menu', cx, cy + 60, btnW, 38, {
            primary: false,
            action: () => { this.state = 'MENU'; this.paused = false; },
            font: '14px system-ui, sans-serif',
        });

        ctx.restore();
    }

    /* ── Game Over ── */
    _drawGameOver(ctx) {
        ctx.save();

        /* Overlay */
        const grad = ctx.createRadialGradient(this.W / 2, this.H / 2, 0, this.W / 2, this.H / 2, this.W * 0.6);
        grad.addColorStop(0, 'rgba(40,8,8,0.85)');
        grad.addColorStop(1, 'rgba(10,2,2,0.95)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.W, this.H);

        const cx = this.W / 2, cy = this.H / 2;
        const btnW = Math.min(170, this.W * 0.45);

        /* Title */
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.min(38, this.W * 0.08)}px system-ui, sans-serif`;
        ctx.fillStyle = '#ff6b6b';
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#ff3b30';
        ctx.fillText('GAME OVER', cx, cy - 80);
        ctx.shadowBlur = 0;

        /* Score */
        ctx.font = 'bold 28px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(this.score.toLocaleString(), cx, cy - 35);

        /* New best */
        if (this._isNewBest) {
            ctx.font = 'bold 14px system-ui, sans-serif';
            ctx.fillStyle = '#fbbf24';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#fbbf24';
            ctx.fillText('\u2B50 NEW BEST!', cx, cy - 10);
            ctx.shadowBlur = 0;
        }

        /* Stats */
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        const statsY = cy + 15;
        ctx.fillText(`Foods: ${this.foodsEaten}  \u00B7  Max Combo: x${this.multipliers[Math.min(this.combo, this.multipliers.length - 1)]}  \u00B7  Length: ${this.snake.length}`, cx, statsY);

        /* Retry button */
        this._drawBtn(ctx, '\u21BB  Retry', cx, cy + 60, btnW, 44, {
            action: () => this._startGame(),
            font: 'bold 16px system-ui, sans-serif',
        });

        /* Menu button */
        this._drawBtn(ctx, '\u2190  Menu', cx, cy + 115, btnW, 38, {
            primary: false,
            action: () => { this.state = 'MENU'; },
            font: '14px system-ui, sans-serif',
        });

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
            ctx.font = `bold ${12 + (1 - a) * 4}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = f.color;
            ctx.shadowBlur = 8;
            ctx.shadowColor = f.color;
            ctx.fillText(f.text, f.x, f.y);
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
    }

    /* ── Helpers ── */
    _darken(hex, factor) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgb(${Math.floor(r * factor)},${Math.floor(g * factor)},${Math.floor(b * factor)})`;
    }
}
