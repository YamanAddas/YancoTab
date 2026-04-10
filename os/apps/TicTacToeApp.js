import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

const WIN_PATTERNS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

export class TicTacToeApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = {
            name: 'Tic-Tac-Toe',
            id: 'tictactoe',
            icon: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0f172a'/><stop offset='1' stop-color='#ec4899'/></linearGradient></defs><rect x='12' y='12' width='104' height='104' rx='28' fill='url(#g)'/><rect x='14' y='14' width='100' height='100' rx='26' fill='rgba(255,255,255,0.06)'/><g fill='none' stroke='rgba(255,255,255,0.92)' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'><path d='M44 40v48M84 40v48M40 56h48M40 72h48'/><path d='M54 62l16 16M70 62L54 78'/><circle cx='76' cy='56' r='8'/></g></svg>`
        };
        this.aiTimeout = null;
        this.aiPending = false;
    }

    async init() {
        this.root = el('div', { class: 'app-window app-tictactoe' });

        // Inject styles
        const link = el('link', { rel: 'stylesheet', href: 'css/tictactoe.css' });
        this.root.appendChild(link);

        // Header
        const header = el('div', { class: 'ttt-header' }, [
            el('div', { class: 'ttt-title' }, 'Tic-Tac-Toe'),
            el('button', { class: 'ttt-close', onclick: () => this.close() }, '×')
        ]);

        this.container = el('div', { class: 'ttt-content' });
        this.root.append(header, this.container);

        this.currentDifficulty = 'easy';
        this.startGame();

        this.orientationHandler = () => this.updateLayout();
        window.addEventListener('resize', this.orientationHandler);
    }

    startGame() {
        this.clearPendingAI();
        this.root.classList.remove('is-ai-thinking');
        this.container.innerHTML = '';
        this.inputReadyAt = Date.now() + 300;

        this.board = ['', '', '', '', '', '', '', '', ''];
        this.currentPlayer = 'X';
        this.gameOver = false;
        this.winner = null;
        this.winningCells = null;

        const diffBar = el('div', { class: 'ttt-difficulty' });
        ['easy', 'medium', 'hard'].forEach(level => {
            const btn = el('button', {
                class: `diff-btn ${level === this.currentDifficulty ? 'active' : ''}`,
                onclick: () => {
                    this.currentDifficulty = level;
                    this.startGame();
                }
            }, level.charAt(0).toUpperCase() + level.slice(1));
            diffBar.appendChild(btn);
        });

        this.statusEl = el('div', { class: 'ttt-status' }, 'Your turn (X)');

        const controls = el('div', { class: 'ttt-controls' }, [
            el('button', {
                class: 'ttt-btn',
                onclick: () => this.startGame()
            }, '🔄 New Game')
        ]);

        const sidebar = el('div', { class: 'ttt-sidebar' }, [
            diffBar, this.statusEl, controls
        ]);

        this.boardEl = el('div', { class: 'ttt-board' });
        this.winLineEl = el('div', { class: 'ttt-win-line' });
        this.boardWrapEl = el('div', { class: 'ttt-board-wrap' }, [
            this.boardEl,
            this.winLineEl
        ]);
        this.cells = [];

        for (let i = 0; i < 9; i++) {
            const cell = el('div', {
                class: 'ttt-cell',
                'aria-label': `Cell ${i + 1}`,
                onclick: () => this.handleCellClick(i)
            });
            this.cells.push(cell);
            this.boardEl.appendChild(cell);
        }

        this.container.append(sidebar, this.boardWrapEl);
    }

    updateLayout() {
        // CSS handles responsive layout for this app.
    }

    handleCellClick(index) {
        if (Date.now() < this.inputReadyAt) return;
        if (this.gameOver || this.aiPending || this.board[index] !== '') return;

        this.makeMove(index, 'X');

        if (this.checkWin('X')) {
            this.endGame('X');
            return;
        }
        if (this.checkDraw()) {
            this.endGame(null);
            return;
        }

        this.statusEl.textContent = 'AI thinking...';
        this.statusEl.style.color = '#ff6b9d';
        this.aiPending = true;
        this.root.classList.add('is-ai-thinking');

        this.aiTimeout = setTimeout(() => {
            const aiMove = this.getAIMove();
            if (aiMove !== -1) {
                this.makeMove(aiMove, 'O');

                if (this.checkWin('O')) {
                    this.endGame('O');
                } else if (this.checkDraw()) {
                    this.endGame(null);
                } else {
                    this.statusEl.textContent = 'Your turn (X)';
                    this.statusEl.style.color = '#3ec8ff';
                }
            }
            this.aiPending = false;
            this.root.classList.remove('is-ai-thinking');
            this.aiTimeout = null;
        }, 400);
    }

    makeMove(index, player) {
        this.board[index] = player;
        this.cells[index].textContent = '';
        const mark = el('span', { class: `ttt-mark ttt-mark-${player.toLowerCase()}` }, player);
        this.cells[index].appendChild(mark);
        this.cells[index].classList.add('filled', player.toLowerCase());
    }

    getAIMove() {
        const empty = this.board.map((cell, i) => cell === '' ? i : null).filter(i => i !== null);
        if (empty.length === 0) return -1;

        let smartChance = 0;
        if (this.currentDifficulty === 'easy') smartChance = 0.1;
        else if (this.currentDifficulty === 'medium') smartChance = 0.6;
        else smartChance = 1.0;

        const useSmartMove = Math.random() < smartChance;

        if (useSmartMove) {
            const bestMove = this.minimax(this.board, 'O', 0);
            return bestMove.index;
        }

        return empty[Math.floor(Math.random() * empty.length)];
    }

    minimax(board, player, depth) {
        const empty = board.map((cell, i) => cell === '' ? i : null).filter(i => i !== null);

        if (this.checkWinState(board, 'X')) return { score: depth - 10 };
        if (this.checkWinState(board, 'O')) return { score: 10 - depth };
        if (empty.length === 0) return { score: 0 };

        const moves = [];

        for (const index of empty) {
            const newBoard = [...board];
            newBoard[index] = player;

            const result = this.minimax(newBoard, player === 'O' ? 'X' : 'O', depth + 1);
            moves.push({ index, score: result.score });
        }

        if (player === 'O') {
            return moves.reduce((best, move) => move.score > best.score ? move : best);
        }

        return moves.reduce((best, move) => move.score < best.score ? move : best);
    }

    checkWin(player) {
        for (const pattern of WIN_PATTERNS) {
            if (pattern.every(i => this.board[i] === player)) {
                this.winningCells = pattern;
                return true;
            }
        }
        return false;
    }

    checkWinState(board, player) {
        return WIN_PATTERNS.some(pattern => pattern.every(i => board[i] === player));
    }

    checkDraw() {
        return this.board.every(cell => cell !== '');
    }

    endGame(winner) {
        this.gameOver = true;
        this.winner = winner;
        this.aiPending = false;
        this.root.classList.remove('is-ai-thinking');

        if (winner === 'X') {
            this.statusEl.textContent = '🎉 You Win!';
            this.statusEl.style.color = '#4ef0d9';
        } else if (winner === 'O') {
            this.statusEl.textContent = '🤖 AI Wins';
            this.statusEl.style.color = '#ff6b9d';
        } else {
            this.statusEl.textContent = '🤝 Draw!';
            this.statusEl.style.color = '#ffd93d';
        }

        if (this.winningCells) {
            this.winningCells.forEach(i => {
                this.cells[i].classList.add('win');
            });
            this.drawWinLine(this.winningCells);
        }
    }

    drawWinLine(winningCells) {
        if (!this.winLineEl) return;
        this.winLineEl.className = 'ttt-win-line';
        const lineClass = this.getWinLineClass(winningCells);
        if (!lineClass) return;
        this.winLineEl.classList.add('is-visible', lineClass);
    }

    getWinLineClass(cells) {
        const key = [...cells].sort((a, b) => a - b).join('-');
        const map = {
            '0-1-2': 'line-row-0',
            '3-4-5': 'line-row-1',
            '6-7-8': 'line-row-2',
            '0-3-6': 'line-col-0',
            '1-4-7': 'line-col-1',
            '2-5-8': 'line-col-2',
            '0-4-8': 'line-diag-main',
            '2-4-6': 'line-diag-anti'
        };
        return map[key] || null;
    }

    clearPendingAI() {
        if (!this.aiTimeout) return;
        clearTimeout(this.aiTimeout);
        this.aiTimeout = null;
        this.aiPending = false;
    }

    destroy() {
        this.clearPendingAI();
        if (this.orientationHandler) {
            window.removeEventListener('resize', this.orientationHandler);
        }
        super.destroy();
    }
}
