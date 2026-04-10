
import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

export class MemoryApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = {
            name: 'Memory',
            id: 'memory',
            icon: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#10121a'/><stop offset='1' stop-color='#7c3aed'/></linearGradient></defs><rect x='12' y='12' width='104' height='104' rx='28' fill='url(#g)'/><rect x='14' y='14' width='100' height='100' rx='26' fill='rgba(255,255,255,0.06)'/><g fill='none' stroke='rgba(255,255,255,0.92)' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'><rect x='34' y='40' width='40' height='56' rx='10'/><rect x='54' y='32' width='40' height='56' rx='10'/><path d='M74 54c-4-7-14-6-14 3 0 10 14 18 14 18s14-8 14-18c0-9-10-10-14-3z' fill='rgba(255,255,255,0.92)' stroke='none'/></g></svg>`
        };
        this.timerInterval = null;
        this.startTime = null;
        this.elapsedMs = 0;
    }

    async init() {
        this.root = el('div', { class: 'app-window app-memory' });

        // Header
        const header = el('div', { class: 'memory-header' }, [
            el('div', { class: 'memory-title' }, 'Memory'),
            el('button', { class: 'memory-close', onclick: () => this.close() }, '×')
        ]);

        this.container = el('div', { class: 'memory-content' });
        this.root.append(header, this.container);

        this.currentLevel = 'easy';
        this.bestScores = this.loadBestScores();
        this.startGame();

        // Listen for orientation changes to adapt grid
        this.orientationHandler = () => this.updateGridLayout();
        window.addEventListener('resize', this.orientationHandler);
    }

    startGame() {
        this.container.innerHTML = '';
        this.stopTimer();
        this.elapsedMs = 0;
        this.startTime = null;
        this.inputReadyAt = Date.now() + 300;
        this.root.classList.remove('memory-celebrate', 'memory-level-easy', 'memory-level-medium', 'memory-level-hard');
        this.root.classList.add(`memory-level-${this.currentLevel}`);

        // Base grid configs (portrait orientation)
        const LEVELS = {
            easy: { cols: 4, rows: 4 },
            medium: { cols: 4, rows: 5 },
            hard: { cols: 5, rows: 6 }
        };

        this.baseConfig = LEVELS[this.currentLevel];
        const totalCards = this.baseConfig.cols * this.baseConfig.rows;
        const pairs = totalCards / 2;

        // Icons: elegant, high-contrast emoji
        const icons = ['☀️', '🌙', '⭐', '💎', '🔮', '🌊', '🍃', '❄️', '🔥', '⚡', '💫', '🌸', '🎯', '♦️', '♠️'];

        // Difficulty selector
        const diffBar = el('div', { class: 'memory-difficulty' });
        ['easy', 'medium', 'hard'].forEach(level => {
            const btn = el('button', {
                class: `memory-diff-btn ${level === this.currentLevel ? 'active' : ''}`,
                onclick: () => {
                    this.currentLevel = level;
                    this.startGame();
                }
            }, level.charAt(0).toUpperCase() + level.slice(1));
            diffBar.appendChild(btn);
        });

        // Stats bar
        this.movesEl = el('span', {}, '🎯 0 moves');
        this.timerEl = el('span', {}, '⏱️ 0:00');
        this.matchesEl = el('span', {}, `✓ 0/${pairs}`);
        const statsBar = el('div', { class: 'memory-stats' }, [
            this.timerEl, this.movesEl, this.matchesEl
        ]);

        // Grid - store reference for layout updates
        this.gridEl = el('div', { class: 'memory-grid' });
        this.updateGridLayout();

        // Build deck
        let deck = [...icons.slice(0, pairs), ...icons.slice(0, pairs)];
        this.shuffle(deck);

        // Game state
        this.first = null;
        this.second = null;
        this.lock = false;
        this.matches = 0;
        this.moves = 0;
        this.pairs = pairs;
        this.cells = [];

        deck.forEach(icon => {
            const card = el('div', { class: 'memory-card' }, [
                el('div', { class: 'memory-inner' }, [
                    el('div', { class: 'memory-front' }, '?'),
                    el('div', { class: 'memory-back' }, icon)
                ])
            ]);
            card.dataset.icon = icon;
            card.onclick = () => this.handleCardClick(card);
            this.cells.push(card);
            this.gridEl.appendChild(card);
        });

        // Restart button
        const restartBtn = el('button', {
            class: 'memory-restart',
            onclick: () => this.startGame()
        }, '🔄');

        // Sidebar (for landscape layout)
        const sidebar = el('div', { class: 'memory-sidebar' }, [
            diffBar, statsBar, restartBtn
        ]);

        this.container.append(sidebar, this.gridEl);
    }

    updateGridLayout() {
        if (!this.gridEl || !this.baseConfig) return;

        const isLandscape = window.innerWidth > window.innerHeight;
        let cols, rows;

        if (isLandscape && this.baseConfig.cols !== this.baseConfig.rows) {
            // Swap cols/rows in landscape for better horizontal use
            cols = Math.max(this.baseConfig.cols, this.baseConfig.rows);
            rows = Math.min(this.baseConfig.cols, this.baseConfig.rows);
        } else {
            cols = this.baseConfig.cols;
            rows = this.baseConfig.rows;
        }

        this.gridEl.style.setProperty('--cols', cols);
        this.gridEl.style.setProperty('--rows', rows);
    }

    handleCardClick(card) {
        if (Date.now() < this.inputReadyAt) return;

        // Guards: locked, already flipped, or matched
        if (this.lock) return;
        if (card.classList.contains('is-flipped')) return;
        if (card.classList.contains('is-matched')) return;

        // Start timer on first flip
        if (!this.startTime) {
            this.startTime = Date.now();
            this.timerInterval = setInterval(() => this.updateTimer(), 100);
        }

        card.classList.add('is-flipped');

        if (!this.first) {
            this.first = card;
        } else {
            this.second = card;
            this.lock = true;
            this.moves++;
            this.updateStats();

            const icon1 = this.first.dataset.icon;
            const icon2 = this.second.dataset.icon;

            if (icon1 === icon2) {
                // Match!
                this.first.classList.add('is-matched');
                this.second.classList.add('is-matched');
                this.matches++;
                this.updateStats();
                this.first = null;
                this.second = null;
                this.lock = false;

                if (this.matches === this.pairs) {
                    this.stopTimer();
                    this.checkBestScore();
                    this.root.classList.add('memory-celebrate');
                    setTimeout(() => this.showWinModal(), 400);
                }
            } else {
                // No match - flip back
                setTimeout(() => {
                    this.first.classList.remove('is-flipped');
                    this.second.classList.remove('is-flipped');
                    this.first = null;
                    this.second = null;
                    this.lock = false;
                }, 800);
            }
        }
    }

    updateTimer() {
        this.elapsedMs = Date.now() - this.startTime;
        const secs = Math.floor(this.elapsedMs / 1000);
        const mins = Math.floor(secs / 60);
        const s = secs % 60;
        this.timerEl.textContent = `⏱️ ${mins}:${s.toString().padStart(2, '0')}`;
    }

    updateStats() {
        this.movesEl.textContent = `🎯 ${this.moves} moves`;
        this.matchesEl.textContent = `✓ ${this.matches}/${this.pairs}`;
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    showWinModal() {
        const secs = Math.floor(this.elapsedMs / 1000);
        const mins = Math.floor(secs / 60);
        const s = secs % 60;
        const timeStr = `${mins}:${s.toString().padStart(2, '0')}`;
        const best = this.bestScores[this.currentLevel];
        const bestStr = best ? `${best.moves} moves in ${best.time}` : 'None';
        const sparkles = el('div', { class: 'memory-win-sparkles' });
        for (let i = 0; i < 14; i++) {
            const spark = el('span', { class: 'memory-spark' });
            spark.style.setProperty('--spark-x', `${6 + (i * 6.4)}%`);
            spark.style.setProperty('--spark-delay', `${(i % 7) * 60}ms`);
            sparkles.appendChild(spark);
        }

        const overlay = el('div', { class: 'memory-win-overlay' }, [
            el('div', { class: 'memory-win-modal' }, [
                sparkles,
                el('div', { class: 'memory-win-title' }, '🎉 You Won!'),
                el('div', { class: 'memory-win-stats' }, [
                    `Time: ${timeStr}`, el('br'),
                    `Moves: ${this.moves}`, el('br'),
                    `Best: ${bestStr}`
                ]),
                el('button', {
                    class: 'memory-restart',
                    onclick: () => {
                        overlay.remove();
                        this.startGame();
                    }
                }, '▶️ Play Again')
            ])
        ]);

        this.root.appendChild(overlay);
    }

    loadBestScores() {
        try {
            return JSON.parse(localStorage.getItem('yancotab_memory_best') || '{}');
        } catch {
            return {};
        }
    }

    saveBestScores() {
        try {
            localStorage.setItem('yancotab_memory_best', JSON.stringify(this.bestScores));
        } catch { /* ignore storage errors */ }
    }

    checkBestScore() {
        const current = this.bestScores[this.currentLevel];
        const secs = Math.floor(this.elapsedMs / 1000);
        const mins = Math.floor(secs / 60);
        const s = secs % 60;
        const timeStr = `${mins}:${s.toString().padStart(2, '0')}`;

        if (!current || this.moves < current.moves) {
            this.bestScores[this.currentLevel] = { moves: this.moves, time: timeStr };
            this.saveBestScores();
        }
    }

    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    destroy() {
        this.stopTimer();
        if (this.orientationHandler) {
            window.removeEventListener('resize', this.orientationHandler);
        }
        super.destroy();
    }
}
