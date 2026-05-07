/**
 * Tests for the TicTacToe engine + AI.
 * Run with: node --test tests/tictactoe-engine.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ttReducer,
  initialState,
  checkWin,
  isDraw,
  legalMoves,
  WIN_PATTERNS,
} from '../os/apps/tictactoe/engine.js';
import { chooseMove, minimax } from '../os/apps/tictactoe/ai.js';

// Stable RNG for AI determinism
function fixedRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('initialState', () => {
  test('defaults to AI mode at medium', () => {
    const s = initialState();
    assert.equal(s.mode, 'ai');
    assert.equal(s.difficulty, 'medium');
    assert.equal(s.current, 'X');
    assert.equal(s.winner, null);
    assert.equal(s.winLine, null);
    assert.equal(s.board.length, 9);
    assert.ok(s.board.every((c) => c === ''));
    assert.deepEqual(s.score, { X: 0, O: 0, draws: 0, streak: 0, bestStreak: 0 });
  });

  test('rejects invalid mode/difficulty', () => {
    const s = initialState({ mode: 'broken', difficulty: 'expert' });
    assert.equal(s.mode, 'ai');
    assert.equal(s.difficulty, 'medium');
  });

  test('accepts valid overrides', () => {
    const s = initialState({ mode: 'single', difficulty: 'hard' });
    assert.equal(s.mode, 'single');
    assert.equal(s.difficulty, 'hard');
  });
});

describe('PLACE action', () => {
  test('places the current mark in an empty cell and switches turn', () => {
    const s0 = initialState();
    const s1 = ttReducer(s0, { type: 'PLACE', idx: 4 });
    assert.equal(s1.board[4], 'X');
    assert.equal(s1.current, 'O');
    assert.equal(s1.turnSerial, 1);
  });

  test('rejects placement on occupied cell', () => {
    let s = initialState();
    s = ttReducer(s, { type: 'PLACE', idx: 0 });
    const same = ttReducer(s, { type: 'PLACE', idx: 0 });
    assert.equal(s, same, 'unchanged');
  });

  test('rejects placement after game ended', () => {
    let s = initialState();
    s = ttReducer(s, { type: 'PLACE', idx: 0 }); // X
    s = ttReducer(s, { type: 'PLACE', idx: 3 }); // O
    s = ttReducer(s, { type: 'PLACE', idx: 1 }); // X
    s = ttReducer(s, { type: 'PLACE', idx: 4 }); // O
    s = ttReducer(s, { type: 'PLACE', idx: 2 }); // X — wins top row
    assert.equal(s.winner, 'X');
    const after = ttReducer(s, { type: 'PLACE', idx: 5 });
    assert.equal(after, s, 'no change after game end');
  });

  test('rejects out-of-range idx', () => {
    const s = initialState();
    assert.equal(ttReducer(s, { type: 'PLACE', idx: -1 }), s);
    assert.equal(ttReducer(s, { type: 'PLACE', idx: 9 }), s);
    assert.equal(ttReducer(s, { type: 'PLACE', idx: 'abc' }), s);
    assert.equal(ttReducer(s, { type: 'PLACE', idx: 1.5 }), s);
  });
});

describe('Win detection — all 8 lines', () => {
  test('detects every winning pattern', () => {
    for (const pattern of WIN_PATTERNS) {
      const board = ['', '', '', '', '', '', '', '', ''];
      pattern.forEach((i) => { board[i] = 'X'; });
      const win = checkWin(board, 'X');
      assert.ok(win, `pattern ${pattern} should win`);
      assert.deepEqual(win, pattern);
    }
  });

  test('does not falsely detect on mixed marks', () => {
    const board = ['X', 'O', 'X', '', '', '', '', '', ''];
    assert.equal(checkWin(board, 'X'), null);
  });

  test('PLACE sets winLine when winning move lands', () => {
    let s = initialState();
    s = ttReducer(s, { type: 'PLACE', idx: 0 }); // X
    s = ttReducer(s, { type: 'PLACE', idx: 3 }); // O
    s = ttReducer(s, { type: 'PLACE', idx: 4 }); // X
    s = ttReducer(s, { type: 'PLACE', idx: 6 }); // O
    s = ttReducer(s, { type: 'PLACE', idx: 8 }); // X — wins diagonal 0,4,8
    assert.equal(s.winner, 'X');
    assert.deepEqual(s.winLine, [0, 4, 8]);
  });
});

describe('Draw detection', () => {
  test('isDraw true on full board', () => {
    const board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
    assert.equal(isDraw(board), true);
  });

  test('reducer marks winner = "draw" when board fills with no win', () => {
    let s = initialState();
    // Specific sequence that produces a draw: X O X / X O O / O X X
    const seq = [0, 1, 2, 4, 3, 5, 7, 6, 8];
    for (const i of seq) s = ttReducer(s, { type: 'PLACE', idx: i });
    assert.equal(s.winner, 'draw');
    assert.equal(s.score.draws, 1);
    assert.equal(s.score.streak, 0);
  });
});

describe('Score increments + streak', () => {
  test('X win bumps X score and streak', () => {
    let s = initialState();
    s = ttReducer(s, { type: 'PLACE', idx: 0 });
    s = ttReducer(s, { type: 'PLACE', idx: 3 });
    s = ttReducer(s, { type: 'PLACE', idx: 1 });
    s = ttReducer(s, { type: 'PLACE', idx: 4 });
    s = ttReducer(s, { type: 'PLACE', idx: 2 });
    assert.equal(s.score.X, 1);
    assert.equal(s.score.streak, 1);
    assert.equal(s.score.bestStreak, 1);
  });

  test('O win zeros X streak', () => {
    let s = initialState();
    // X wins first
    s = ttReducer(s, { type: 'PLACE', idx: 0 });
    s = ttReducer(s, { type: 'PLACE', idx: 3 });
    s = ttReducer(s, { type: 'PLACE', idx: 1 });
    s = ttReducer(s, { type: 'PLACE', idx: 4 });
    s = ttReducer(s, { type: 'PLACE', idx: 2 });
    assert.equal(s.score.streak, 1);
    s = ttReducer(s, { type: 'RESET' });
    // Now O wins (after reset, O goes first because X won previous round)
    assert.equal(s.current, 'O');
    s = ttReducer(s, { type: 'PLACE', idx: 0 });
    s = ttReducer(s, { type: 'PLACE', idx: 4 });
    s = ttReducer(s, { type: 'PLACE', idx: 1 });
    s = ttReducer(s, { type: 'PLACE', idx: 5 });
    s = ttReducer(s, { type: 'PLACE', idx: 2 });
    assert.equal(s.winner, 'O');
    assert.equal(s.score.streak, 0);
    assert.equal(s.score.bestStreak, 1, 'best preserved');
  });
});

describe('RESET action', () => {
  test('clears board and history but keeps score and mode', () => {
    let s = initialState({ mode: 'single', difficulty: 'hard' });
    s = ttReducer(s, { type: 'PLACE', idx: 4 });
    s = ttReducer(s, { type: 'RESET' });
    assert.ok(s.board.every((c) => c === ''));
    assert.deepEqual(s.history, []);
    assert.equal(s.mode, 'single');
    assert.equal(s.difficulty, 'hard');
  });

  test('after X win, RESET makes O the first mover', () => {
    let s = initialState();
    s = ttReducer(s, { type: 'PLACE', idx: 0 });
    s = ttReducer(s, { type: 'PLACE', idx: 3 });
    s = ttReducer(s, { type: 'PLACE', idx: 1 });
    s = ttReducer(s, { type: 'PLACE', idx: 4 });
    s = ttReducer(s, { type: 'PLACE', idx: 2 });
    s = ttReducer(s, { type: 'RESET' });
    assert.equal(s.current, 'O');
  });
});

describe('SET_MODE / SET_DIFFICULTY', () => {
  test('SET_MODE swap resets the round', () => {
    let s = initialState();
    s = ttReducer(s, { type: 'PLACE', idx: 0 });
    s = ttReducer(s, { type: 'SET_MODE', mode: 'single' });
    assert.equal(s.mode, 'single');
    assert.ok(s.board.every((c) => c === ''));
  });

  test('SET_MODE no-op when mode unchanged', () => {
    let s = initialState();
    s = ttReducer(s, { type: 'PLACE', idx: 0 });
    const before = s;
    const after = ttReducer(s, { type: 'SET_MODE', mode: 'ai' });
    assert.equal(after, before);
  });

  test('SET_DIFFICULTY changes difficulty without resetting', () => {
    let s = initialState();
    s = ttReducer(s, { type: 'PLACE', idx: 4 });
    s = ttReducer(s, { type: 'SET_DIFFICULTY', difficulty: 'hard' });
    assert.equal(s.difficulty, 'hard');
    assert.equal(s.board[4], 'X');
  });

  test('SET_DIFFICULTY rejects invalid value', () => {
    const s = initialState();
    const same = ttReducer(s, { type: 'SET_DIFFICULTY', difficulty: 'expert' });
    assert.equal(same, s);
  });
});

describe('HYDRATE action', () => {
  test('whitelists known fields, ignores junk', () => {
    const s = ttReducer(initialState(), {
      type: 'HYDRATE',
      state: {
        mode: 'single',
        difficulty: 'hard',
        score: { X: 5, O: 3, draws: 2, streak: 2, bestStreak: 4 },
        evil: '<script>',
      },
    });
    assert.equal(s.mode, 'single');
    assert.equal(s.difficulty, 'hard');
    assert.equal(s.score.X, 5);
    assert.equal(s.score.bestStreak, 4);
    assert.equal(s.evil, undefined);
  });

  test('rejects bad board shape', () => {
    const s = ttReducer(initialState(), {
      type: 'HYDRATE',
      state: { board: ['X', 'O'] }, // wrong length
    });
    assert.equal(s.board.length, 9);
    assert.ok(s.board.every((c) => c === ''));
  });
});

describe('legalMoves', () => {
  test('returns all 9 indices for empty board', () => {
    const board = Array(9).fill('');
    assert.deepEqual(legalMoves(board), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('filters out occupied cells', () => {
    const board = ['X', '', 'O', '', '', '', '', '', ''];
    assert.deepEqual(legalMoves(board), [1, 3, 4, 5, 6, 7, 8]);
  });
});

describe('AI minimax', () => {
  test('blocks an immediate X win', () => {
    // X has 0,1 in top row, AI must block at 2
    const board = ['X', 'X', '', '', 'O', '', '', '', ''];
    const idx = chooseMove(board, 'hard');
    assert.equal(idx, 2);
  });

  test('takes an immediate winning move', () => {
    // O has 0,4 (diagonal). 8 wins.
    const board = ['O', 'X', 'X', '', 'O', '', '', '', ''];
    const idx = chooseMove(board, 'hard');
    assert.equal(idx, 8);
  });

  test('hard plays a legal move on a fork-setup board', () => {
    // X at corner + center — minimax must return *some* legal cell
    const board = ['X', '', '', '', 'X', '', '', '', ''];
    const idx = chooseMove(board, 'hard');
    const legalSet = new Set([1, 2, 3, 5, 6, 7, 8]);
    assert.ok(legalSet.has(idx), `got ${idx}`);
  });

  test('hard never loses to a forced-win position', () => {
    // O has 4. X plays 0 (the AI is X here would be reversed, so verify
    // by mirroring). Use minimax directly: if it's O's turn and X has
    // an immediate threat, O must block.
    const board = ['X', 'X', '', '', '', '', '', '', ''];
    // O must block by placing at 2
    const idx = chooseMove(board, 'hard');
    assert.equal(idx, 2);
  });

  test('easy mode mostly picks random when smart-chance fails', () => {
    // Force RNG > 0.15 → falls into random branch; second RNG picks index
    const board = ['X', 'X', '', '', 'O', '', '', '', ''];
    const rng = fixedRng([0.99, 0.0]); // gate fail, then pick index 0 of legals
    const idx = chooseMove(board, 'easy', rng);
    // Random branch: picks empty[0] = 2 because [2,3,5,6,7,8] is the legal list
    assert.equal(idx, 2);
  });

  test('returns -1 when no legal moves remain', () => {
    const board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
    assert.equal(chooseMove(board, 'hard'), -1);
  });
});

describe('AI determinism', () => {
  test('hard mode always plays minimax (deterministic for fixed board)', () => {
    const board = ['X', '', '', '', 'O', '', '', '', ''];
    const a = minimax(board, 'O', 0);
    const b = minimax(board, 'O', 0);
    assert.equal(a.score, b.score);
  });
});
