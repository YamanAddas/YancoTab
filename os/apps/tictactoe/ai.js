/**
 * ai.js — TicTacToe AI: minimax with smart-chance gating.
 *
 * Lifted from the legacy canvas engine, simplified to a pure function
 * that takes a board snapshot and returns a move index. The AI plays
 * 'O' (the player is always 'X' in vs-AI mode).
 *
 * Difficulty acts as a probability gate over the perfect minimax move:
 *   • easy   → 15%  optimal,  85%  random legal
 *   • medium → 60%  optimal,  40%  random legal
 *   • hard   → 100% optimal (never loses)
 *
 * Pure module — no DOM, no globals. The `random` arg is injected so
 * tests can pin determinism; defaults to Math.random.
 */
import { WIN_PATTERNS, legalMoves } from './engine.js';

const SMART_CHANCE = { easy: 0.15, medium: 0.60, hard: 1.0 };

/**
 * @param {Array<''|'X'|'O'>} board    9-cell snapshot
 * @param {'easy'|'medium'|'hard'} difficulty
 * @param {() => number} [random]      injectable RNG (test seam)
 * @returns {number} legal index 0..8, or -1 if no legal move
 */
export function chooseMove(board, difficulty = 'medium', random = Math.random) {
  const empty = legalMoves(board);
  if (empty.length === 0) return -1;

  const p = SMART_CHANCE[difficulty] ?? SMART_CHANCE.medium;
  if (random() < p) {
    const best = minimax(board, 'O', 0);
    if (best.index != null && empty.includes(best.index)) return best.index;
  }
  // Fallback / "easy mode" branch — uniform random legal
  return empty[Math.floor(random() * empty.length)];
}

/**
 * Classic minimax. Returns { index, score } for the active player.
 * 'O' maximizes, 'X' minimizes (matches the legacy scoring sign).
 *
 * Score:
 *   X wins  → depth - 10  (X is opponent of the AI; lower is better for AI)
 *   O wins  → 10 - depth  (faster wins are preferred)
 *   draw    → 0
 */
export function minimax(board, player, depth) {
  if (winsFor(board, 'X')) return { score: depth - 10 };
  if (winsFor(board, 'O')) return { score: 10 - depth };
  const empty = legalMoves(board);
  if (empty.length === 0) return { score: 0 };

  let best = null;
  for (const i of empty) {
    const next = board.slice();
    next[i] = player;
    const result = minimax(next, player === 'O' ? 'X' : 'O', depth + 1);
    const move = { index: i, score: result.score };
    if (best == null) {
      best = move;
    } else if (player === 'O') {
      if (move.score > best.score) best = move;
    } else {
      if (move.score < best.score) best = move;
    }
  }
  return best;
}

function winsFor(board, mark) {
  for (const p of WIN_PATTERNS) {
    if (board[p[0]] === mark && board[p[1]] === mark && board[p[2]] === mark) return true;
  }
  return false;
}
