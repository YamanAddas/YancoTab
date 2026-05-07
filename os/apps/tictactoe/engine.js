/**
 * engine.js — Pure TicTacToe state machine.
 *
 * No DOM, no globals, no side effects. State + reducer over a small
 * action set; consumers (the view, the AI) read state and dispatch
 * actions back through the reducer.
 *
 * State shape:
 *   {
 *     board:      Array(9) of '' | 'X' | 'O',
 *     current:    'X' | 'O',
 *     winner:     null | 'X' | 'O' | 'draw',
 *     winLine:    null | [i, j, k]   (the 3 cell indices that won),
 *     mode:       'ai' | 'single',   ('ai' = vs AI, 'single' = local 2-player)
 *     difficulty: 'easy' | 'medium' | 'hard',
 *     score:      { X: number, O: number, draws: number, streak: number, bestStreak: number },
 *     history:    Array of move indices (for undo, future use),
 *     turnSerial: number              (incremented on each move; helps view diff)
 *   }
 *
 * Actions:
 *   { type: 'PLACE', idx: 0..8 }
 *   { type: 'RESET' }                         (resets the round, keeps score + mode + difficulty)
 *   { type: 'RESET_STATS' }                   (zeros score; keeps mode + difficulty)
 *   { type: 'SET_MODE', mode: 'ai' | 'single' }
 *   { type: 'SET_DIFFICULTY', difficulty: 'easy' | 'medium' | 'hard' }
 *   { type: 'HYDRATE', state: partial }       (load from storage)
 */

export const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],   // cols
  [0, 4, 8], [2, 4, 6],               // diagonals
];

const VALID_MODES = new Set(['ai', 'single']);
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

export function initialState({ mode = 'ai', difficulty = 'medium' } = {}) {
  return {
    board: ['', '', '', '', '', '', '', '', ''],
    current: 'X',
    winner: null,
    winLine: null,
    mode: VALID_MODES.has(mode) ? mode : 'ai',
    difficulty: VALID_DIFFICULTIES.has(difficulty) ? difficulty : 'medium',
    score: { X: 0, O: 0, draws: 0, streak: 0, bestStreak: 0 },
    history: [],
    turnSerial: 0,
  };
}

export function checkWin(board, mark) {
  for (const p of WIN_PATTERNS) {
    if (board[p[0]] === mark && board[p[1]] === mark && board[p[2]] === mark) return p;
  }
  return null;
}

export function isDraw(board) {
  return board.every((c) => c !== '');
}

export function legalMoves(board) {
  const out = [];
  for (let i = 0; i < 9; i++) if (board[i] === '') out.push(i);
  return out;
}

export function ttReducer(state, action) {
  if (!state) return initialState();
  switch (action?.type) {
    case 'PLACE': {
      const idx = Number(action.idx);
      if (!Number.isInteger(idx) || idx < 0 || idx > 8) return state;
      if (state.winner != null) return state;
      if (state.board[idx] !== '') return state;

      const board = state.board.slice();
      board[idx] = state.current;
      const history = state.history.slice();
      history.push(idx);

      // Outcome check
      const winLine = checkWin(board, state.current);
      let winner = null;
      let score = state.score;
      if (winLine) {
        winner = state.current;
        score = bumpScore(state.score, winner);
      } else if (isDraw(board)) {
        winner = 'draw';
        score = { ...state.score, draws: state.score.draws + 1, streak: 0 };
      }

      const next = winner ? state.current : (state.current === 'X' ? 'O' : 'X');
      return {
        ...state,
        board,
        current: next,
        winner,
        winLine,
        score,
        history,
        turnSerial: state.turnSerial + 1,
      };
    }

    case 'RESET': {
      // Loser of the previous round goes first; on draw, alternate by serial
      let firstMover = 'X';
      if (state.winner === 'X') firstMover = 'O';
      else if (state.winner === 'O') firstMover = 'X';
      else if (state.winner === 'draw') firstMover = state.current === 'X' ? 'O' : 'X';
      return {
        ...state,
        board: ['', '', '', '', '', '', '', '', ''],
        current: firstMover,
        winner: null,
        winLine: null,
        history: [],
        turnSerial: state.turnSerial + 1,
      };
    }

    case 'RESET_STATS':
      return {
        ...state,
        score: { X: 0, O: 0, draws: 0, streak: 0, bestStreak: 0 },
      };

    case 'SET_MODE': {
      if (!VALID_MODES.has(action.mode)) return state;
      if (action.mode === state.mode) return state;
      // Mode swap also resets the round to avoid mid-game inconsistency
      return ttReducer({ ...state, mode: action.mode }, { type: 'RESET' });
    }

    case 'SET_DIFFICULTY': {
      if (!VALID_DIFFICULTIES.has(action.difficulty)) return state;
      return { ...state, difficulty: action.difficulty };
    }

    case 'HYDRATE': {
      const incoming = action.state || {};
      const safe = initialState();
      // Whitelist hydration to known fields; never trust stored state blindly
      const out = { ...safe };
      if (Array.isArray(incoming.board) && incoming.board.length === 9) {
        out.board = incoming.board.map((c) => (c === 'X' || c === 'O' ? c : ''));
      }
      if (incoming.current === 'X' || incoming.current === 'O') out.current = incoming.current;
      if (incoming.winner === 'X' || incoming.winner === 'O' || incoming.winner === 'draw') out.winner = incoming.winner;
      if (Array.isArray(incoming.winLine) && incoming.winLine.length === 3) {
        out.winLine = incoming.winLine.map((n) => Number(n)).filter((n) => n >= 0 && n <= 8);
        if (out.winLine.length !== 3) out.winLine = null;
      }
      if (VALID_MODES.has(incoming.mode)) out.mode = incoming.mode;
      if (VALID_DIFFICULTIES.has(incoming.difficulty)) out.difficulty = incoming.difficulty;
      if (incoming.score && typeof incoming.score === 'object') {
        out.score = {
          X: Number(incoming.score.X || 0),
          O: Number(incoming.score.O || 0),
          draws: Number(incoming.score.draws || 0),
          streak: Number(incoming.score.streak || 0),
          bestStreak: Number(incoming.score.bestStreak || 0),
        };
      }
      return out;
    }

    default:
      return state;
  }
}

function bumpScore(score, winner) {
  const next = { ...score };
  next[winner] = (next[winner] || 0) + 1;
  if (winner === 'X') {
    next.streak = (next.streak || 0) + 1;
    if (next.streak > next.bestStreak) next.bestStreak = next.streak;
  } else if (winner === 'O') {
    next.streak = 0;
  }
  return next;
}
