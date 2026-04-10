
import { App } from '../../core/App.js';
import { el } from '../../utils/dom.js';

export class MinesweeperApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = {
            name: 'Minesweeper',
            id: 'minesweeper',
            icon: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0b1320'/><stop offset='1' stop-color='#f59e0b'/></linearGradient></defs><rect x='12' y='12' width='104' height='104' rx='28' fill='url(#g)'/><rect x='14' y='14' width='100' height='100' rx='26' fill='rgba(255,255,255,0.06)'/><g fill='none' stroke='rgba(255,255,255,0.92)' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'><circle cx='60' cy='70' r='18'/><path d='M72 56l10-10'/><path d='M84 40h8'/><path d='M84 40v-8'/><path d='M92 40l-6 6'/><path d='M52 62l-10-10'/></g></svg>`
        };

        this.difficulties = {
            beginner: { rows: 9, cols: 9, mines: 10 },
            intermediate: { rows: 16, cols: 16, mines: 40 },
            expert: { rows: 16, cols: 30, mines: 99 }
        };

        this.currentDifficulty = 'beginner';
    }

    async init() {
        this.root = el('div', { class: 'app-window app-minesweeper' });

        // Inject styles
        const link = el('link', { rel: 'stylesheet', href: 'css/minesweeper.css' });
        this.root.appendChild(link);

        // Header
        const header = el('div', { class: 'ms-header' }, [
            el('div', { class: 'ms-title' }, 'Minesweeper'),
            el('button', { class: 'ms-close', onclick: () => this.close() }, '×')
        ]);

        this.container = el('div', { class: 'ms-content' });
        this.root.append(header, this.container);

        this.startGame();

        // Handle resize if needed (CSS handles most, but expert grid might need tweaks)
        // this.orientationHandler = () => ...
    }

    startGame() {
        this.container.innerHTML = '';
        this.gameOver = false;
        this.firstClick = true;
        this.flags = 0;
        this.config = this.difficulties[this.currentDifficulty];
        this.grid = []; // Array of { mine, revealed, flagged, count }

        // Difficulty Selector
        const diffBar = el('div', { class: 'ms-difficulty' });
        Object.keys(this.difficulties).forEach(level => {
            const btn = el('button', {
                class: `diff-btn ${level === this.currentDifficulty ? 'active' : ''}`,
                onclick: () => {
                    this.currentDifficulty = level;
                    this.startGame();
                }
            }, level);
            diffBar.appendChild(btn);
        });

        // Status Bar
        this.mineCounter = el('div', {}, `💣 ${this.config.mines}`);
        this.timerEl = el('div', {}, '⏱️ 000');
        const statusBar = el('div', { class: 'ms-status' }, [this.mineCounter, this.timerEl]);

        // Controls
        const controls = el('div', { class: 'ms-sidebar' }, [
            diffBar, statusBar,
            el('button', { class: 'ms-btn', onclick: () => this.startGame() }, '😊 New Game')
        ]);

        // Board
        this.boardEl = el('div', { class: 'ms-board' });
        this.boardEl.style.setProperty('--rows', this.config.rows);
        this.boardEl.style.setProperty('--cols', this.config.cols);
        this.boardEl.style.gridTemplateColumns = `repeat(${this.config.cols}, var(--size))`;
        this.boardEl.style.gridTemplateRows = `repeat(${this.config.rows}, var(--size))`;

        // Create Grid Logic
        const total = this.config.rows * this.config.cols;
        for (let i = 0; i < total; i++) {
            this.grid.push({
                mine: false,
                revealed: false,
                flagged: false,
                count: 0,
                index: i
            });

            const cell = el('div', { class: 'ms-cell' });
            cell.dataset.index = i;

            // Interaction Handlers (Touch + Mouse)
            this.setupCellInteractions(cell, i);

            this.boardEl.appendChild(cell);
        }

        // Wrapper for fitting grid
        const boardWrapper = el('div', { class: 'ms-board-wrapper' }, [this.boardEl]);

        this.container.append(controls, boardWrapper);

        // Initial fit
        this.fitGrid();

        // Resize Listener
        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.resizeObserver = new ResizeObserver(() => this.fitGrid());
        this.resizeObserver.observe(this.container);

        this.startTime = null;
        this.stopTimer();
    }

    fitGrid() {
        if (!this.boardEl || !this.container) return;

        // Get available space in the board wrapper
        const wrapper = this.container.querySelector('.ms-board-wrapper');
        if (!wrapper) return;

        const rect = wrapper.getBoundingClientRect();
        const availableWidth = Math.max(40, rect.width - 16);
        const availableHeight = Math.max(40, rect.height - 16);
        const { rows, cols } = this.config;
        const isLandscape = window.innerWidth > window.innerHeight;
        const rotatePortraitExpert = !isLandscape && this.currentDifficulty === 'expert';

        // Calculate max possible cell size
        const fitW = rotatePortraitExpert ? availableHeight : availableWidth;
        const fitH = rotatePortraitExpert ? availableWidth : availableHeight;
        const sizeW = fitW / cols;
        const sizeH = fitH / rows;
        const maxCellSize = isLandscape ? 34 : 42;
        const preferredMin = this.currentDifficulty === 'expert' ? 9 : 12;
        let size = Math.floor(Math.min(sizeW, sizeH, maxCellSize));
        size = Math.max(preferredMin, size);
        if (size > sizeW || size > sizeH) {
            size = Math.floor(Math.min(sizeW, sizeH));
        }
        size = Math.max(6, size);

        // Set CSS variable for dynamic sizing
        this.boardEl.style.setProperty('--cell-size', `${size}px`);

        // Update Grid Props
        this.boardEl.style.setProperty('--rows', rows);
        this.boardEl.style.setProperty('--cols', cols);
        this.boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--size))`;
        this.boardEl.style.gridTemplateRows = `repeat(${rows}, var(--size))`;
        this.root.classList.toggle('is-landscape', isLandscape);
        this.root.classList.toggle('rotate-expert', rotatePortraitExpert);
    }

    setupCellInteractions(cell, index) {
        let longPressTimer;
        const longPressDuration = 500;

        const handleStart = (e) => {
            if (this.gameOver || this.grid[index].revealed) return;
            longPressTimer = setTimeout(() => {
                this.toggleFlag(index);
                if (navigator.vibrate) navigator.vibrate(50);
            }, longPressDuration);
        };

        const handleEnd = (e) => {
            clearTimeout(longPressTimer);
        };

        const handleClick = (e) => {
            // If valid click (not after a long press trigger)
            if (!this.grid[index].flagged && !this.gameOver) {
                this.reveal(index);
            }
        };

        const handleRightClick = (e) => {
            e.preventDefault();
            this.toggleFlag(index);
        };

        cell.addEventListener('mousedown', handleStart);
        cell.addEventListener('touchstart', handleStart, { passive: true });
        cell.addEventListener('mouseup', handleEnd);
        cell.addEventListener('touchend', handleEnd);
        cell.addEventListener('click', handleClick);
        cell.addEventListener('contextmenu', handleRightClick);
    }

    toggleFlag(index) {
        if (this.gameOver || this.grid[index].revealed) return;

        const cellData = this.grid[index];
        cellData.flagged = !cellData.flagged;

        const el = this.boardEl.children[index];
        if (cellData.flagged) {
            el.classList.add('flagged');
            el.textContent = '🚩';
            this.flags++;
        } else {
            el.classList.remove('flagged');
            el.textContent = '';
            this.flags--;
        }

        this.mineCounter.textContent = `💣 ${this.config.mines - this.flags}`;
    }

    reveal(index) {
        if (this.gameOver || this.grid[index].flagged || this.grid[index].revealed) return;

        // First click safety
        if (this.firstClick) {
            this.firstClick = false;
            this.placeMines(index); // Ensure clicked index is safe
            this.startTimer();
        }

        const cellData = this.grid[index];
        cellData.revealed = true;

        const el = this.boardEl.children[index];
        el.classList.add('revealed');

        if (cellData.mine) {
            this.explode(index);
            return;
        }

        if (cellData.count > 0) {
            el.textContent = cellData.count;
            el.dataset.val = cellData.count;
        } else {
            // Flood fill
            this.getNeighbors(index).forEach(n => {
                if (!this.grid[n].revealed) this.reveal(n);
            });
        }

        this.checkWin();
    }

    placeMines(safeIndex) {
        let minesPlaced = 0;
        const total = this.grid.length;

        // Safe zone: clicked cell + all 8 neighbors
        const safeZone = new Set([safeIndex, ...this.getNeighbors(safeIndex)]);

        while (minesPlaced < this.config.mines) {
            const idx = Math.floor(Math.random() * total);
            if (!safeZone.has(idx) && !this.grid[idx].mine) {
                this.grid[idx].mine = true;
                minesPlaced++;
            }
        }

        // Calculate counts
        for (let i = 0; i < total; i++) {
            if (!this.grid[i].mine) {
                const neighbors = this.getNeighbors(i);
                this.grid[i].count = neighbors.filter(n => this.grid[n].mine).length;
            }
        }
    }

    getNeighbors(index) {
        const { rows, cols } = this.config;
        const row = Math.floor(index / cols);
        const col = index % cols;
        const neighbors = [];

        for (let r = row - 1; r <= row + 1; r++) {
            for (let c = col - 1; c <= col + 1; c++) {
                if (r >= 0 && r < rows && c >= 0 && c < cols && !(r === row && c === col)) {
                    neighbors.push(r * cols + c);
                }
            }
        }
        return neighbors;
    }

    explode(index) {
        this.gameOver = true;
        this.stopTimer();
        const el = this.boardEl.children[index];
        el.textContent = '💥';
        el.style.backgroundColor = 'red';

        // Reveal all mines
        this.grid.forEach((cell, i) => {
            if (cell.mine) {
                const mineEl = this.boardEl.children[i];
                mineEl.classList.add('mine');
                mineEl.textContent = '💣';
            }
        });

        this.mineCounter.textContent = '💀 DEAD';
    }

    checkWin() {
        const safeCells = this.grid.length - this.config.mines;
        const revealedCount = this.grid.filter(c => c.revealed).length;

        if (revealedCount === safeCells) {
            this.gameOver = true;
            this.stopTimer();
            this.mineCounter.textContent = '🎉 WIN!';

            // Flag all mines
            this.grid.forEach((cell, i) => {
                if (cell.mine && !cell.flagged) {
                    this.boardEl.children[i].textContent = '🚩';
                    this.boardEl.children[i].classList.add('flagged');
                }
            });
        }
    }

    startTimer() {
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            const delta = Math.floor((Date.now() - this.startTime) / 1000);
            this.timerEl.textContent = `⏱️ ${delta.toString().padStart(3, '0')}`;
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
    }

    destroy() {
        this.stopTimer();
        if (this.resizeObserver) this.resizeObserver.disconnect();
        super.destroy();
    }
}
