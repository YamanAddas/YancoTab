/**
 * view.js — DOM builder for the cosmic TicTacToe redesign.
 *
 * Produces the entire app frame: titlebar with mode tabs, oval board
 * with squircle cells (hex-clip corner bezels), status line, score
 * strip, action row, and the SVG win-line overlay.
 *
 * Pure DOM — caller passes the current state + a dispatch fn. No
 * subscriptions, no closures over the app instance beyond what's
 * passed via the host config.
 */
import { el } from '../../utils/dom.js';
import { buildWinLine } from './winLine.js';

function tapGuard(handler, { movePx = 12 } = {}) {
  let sx = 0, sy = 0, moved = false;
  return {
    onpointerdown(e) { moved = false; sx = e.clientX; sy = e.clientY;
      try { e.currentTarget?.setPointerCapture?.(e.pointerId); } catch {} },
    onpointermove(e) { if (Math.abs(e.clientX - sx) > movePx || Math.abs(e.clientY - sy) > movePx) moved = true; },
    onpointerup(e) {
      try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch {}
      if (moved) return; try { e.preventDefault(); } catch {} handler();
    },
    onpointercancel(e) { try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch {} },
    onclick(e) { try { e.preventDefault(); } catch {} handler(); },
  };
}

const MODE_TABS = [
  { id: 'ai',     label: 'vs AI' },
  { id: 'single', label: 'Single' },
  { id: 'stats',  label: 'Stats',  isPanel: true },
];

const DIFF_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/**
 * Build the entire app frame for the host root. Returns the root node;
 * caller appends it to its app-window. Re-entrant — safe to call on
 * every state change (no event listeners that need cleanup).
 *
 * @param {object} cfg
 *   state       — current engine state
 *   dispatch    — (action) => void
 *   onClose     — () => void (called when user clicks Exit)
 *   activeTab   — 'felt' | 'stats'
 *   onSetTab    — (tab) => void (host owns active tab)
 *   onModeTab   — (mode) => void (called when user clicks vs AI / Single)
 */
export function buildView(cfg) {
  const { activeTab = 'felt' } = cfg;
  const frame = el('div', { class: 'ttt-app-frame' }, [
    buildTitlebar(cfg),
    activeTab === 'stats'
      ? buildStatsPanel(cfg)
      : buildPlayPanel(cfg),
  ]);
  return frame;
}

function buildTitlebar(cfg) {
  const { state, activeTab, onSetTab, onModeTab } = cfg;
  const name = el('div', { class: 'ttt-name' }, 'Tic-Tac-Toe');
  const tabs = el('div', { class: 'ttt-tabs' });
  for (const t of MODE_TABS) {
    let isActive;
    if (t.isPanel) isActive = activeTab === 'stats';
    else isActive = activeTab === 'felt' && state.mode === t.id;
    const handler = () => {
      if (t.isPanel) onSetTab?.('stats');
      else { onSetTab?.('felt'); onModeTab?.(t.id); }
    };
    tabs.appendChild(el('span', {
      class: 'ttt-tab' + (isActive ? ' is-active' : ''),
      role: 'button', tabindex: '0',
      onclick: handler,
    }, t.label));
  }
  return el('div', { class: 'ttt-titlebar' }, [name, tabs]);
}

function buildPlayPanel(cfg) {
  const { state } = cfg;
  return el('div', { class: 'ttt-play' }, [
    buildStatusLine(cfg),
    buildBoardOval(cfg),
    buildScoreStrip(state),
    buildActionRow(cfg),
  ]);
}

function buildStatusLine({ state }) {
  let text;
  if (state.winner === 'X') text = state.mode === 'ai' ? 'You win!' : 'X wins!';
  else if (state.winner === 'O') text = state.mode === 'ai' ? 'AI wins.' : 'O wins!';
  else if (state.winner === 'draw') text = 'Draw.';
  else if (state.mode === 'ai' && state.current === 'O') text = 'AI thinking…';
  else text = `${state.current} to play`;
  return el('div', { class: 'ttt-status' }, [
    el('span', { class: 'ttt-status-pulse' }),
    el('span', { class: 'ttt-status-text' }, text),
  ]);
}

function buildBoardOval(cfg) {
  const { state, dispatch } = cfg;
  const oval = el('div', { class: 'ttt-board-oval' });
  const grid = el('div', { class: 'ttt-grid', role: 'grid', 'aria-label': 'Tic-Tac-Toe board' });
  const isLocked = state.winner != null
    || (state.mode === 'ai' && state.current === 'O');

  for (let i = 0; i < 9; i++) {
    const mark = state.board[i];
    const isWinCell = state.winLine?.includes(i);
    const playable = !mark && !isLocked;
    const cell = el('div', {
      class: 'ttt-cell'
        + (mark ? ` is-${mark.toLowerCase()}` : '')
        + (isWinCell ? ' is-win' : '')
        + (playable ? ' is-playable' : ''),
      role: 'gridcell',
      tabindex: playable ? '0' : '-1',
      'data-idx': String(i),
      'aria-label': mark ? `${mark} at cell ${i + 1}` : `Empty cell ${i + 1}`,
    }, [
      el('span', { class: 'ttt-cell-bezel' }),
      mark ? el('span', { class: 'ttt-mark' }, mark) : null,
    ].filter(Boolean));
    if (playable) {
      const guard = tapGuard(() => dispatch({ type: 'PLACE', idx: i }));
      Object.assign(cell, guard);
    }
    grid.appendChild(cell);
  }

  oval.appendChild(grid);
  if (state.winLine) oval.appendChild(buildWinLine(state.winLine));
  return oval;
}

function buildScoreStrip(state) {
  const labels = state.mode === 'ai'
    ? { X: 'You', O: 'AI' }
    : { X: 'X', O: 'O' };
  return el('div', { class: 'ttt-scorestrip' }, [
    chip(labels.X, state.score.X, 'is-you'),
    chip(labels.O, state.score.O, 'is-them'),
    chip('Draws', state.score.draws, ''),
    chip('Streak', state.score.streak, 'is-streak'),
  ]);
}

function chip(label, value, cls) {
  return el('div', { class: `ttt-chip ${cls || ''}`.trim() }, [
    el('span', { class: 'ttt-chip-label' }, label),
    el('span', { class: 'ttt-chip-value' }, String(value)),
  ]);
}

function buildActionRow(cfg) {
  const { state, dispatch, onClose } = cfg;
  const newGameBtn = el('button', {
    class: 'ttt-action ttt-action-primary',
    onclick: () => dispatch({ type: 'RESET' }),
  }, state.winner ? 'New round' : 'Restart');

  const diffWrap = el('div', { class: 'ttt-diff' }, [
    el('span', { class: 'ttt-diff-label' }, 'AI'),
    ...['easy', 'medium', 'hard'].map((d) => el('button', {
      class: 'ttt-diff-btn' + (state.difficulty === d ? ' is-active' : ''),
      disabled: state.mode !== 'ai',
      onclick: () => dispatch({ type: 'SET_DIFFICULTY', difficulty: d }),
    }, DIFF_LABELS[d])),
  ]);

  const exitBtn = el('button', {
    class: 'ttt-action',
    onclick: () => onClose?.(),
  }, 'Exit');

  return el('div', { class: 'ttt-actions' }, [diffWrap, newGameBtn, exitBtn]);
}

function buildStatsPanel(cfg) {
  const { state, dispatch } = cfg;
  const wins = state.score.X;
  const losses = state.score.O;
  const draws = state.score.draws;
  const total = wins + losses + draws;
  const rate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return el('div', { class: 'ttt-stats' }, [
    el('h3', { class: 'ttt-stats-title' }, 'Stats'),
    el('div', { class: 'ttt-stats-grid' }, [
      statBlock('Wins', wins, 'is-you'),
      statBlock('Losses', losses, 'is-them'),
      statBlock('Draws', draws, ''),
      statBlock('Win rate', total > 0 ? `${rate}%` : '—', ''),
      statBlock('Current streak', state.score.streak, ''),
      statBlock('Best streak', state.score.bestStreak, 'is-streak'),
    ]),
    el('div', { class: 'ttt-stats-meta' }, `Mode: ${state.mode === 'ai' ? 'vs AI' : 'Single (local 2P)'} · Difficulty: ${DIFF_LABELS[state.difficulty]}`),
    el('button', {
      class: 'ttt-action ttt-action-danger',
      onclick: () => {
        if (typeof window !== 'undefined' && window.confirm) {
          if (!window.confirm('Reset all stats? This cannot be undone.')) return;
        }
        dispatch({ type: 'RESET_STATS' });
      },
    }, 'Reset stats'),
  ]);
}

function statBlock(label, value, cls) {
  return el('div', { class: `ttt-stat-block ${cls || ''}`.trim() }, [
    el('div', { class: 'ttt-stat-value' }, String(value)),
    el('div', { class: 'ttt-stat-label' }, label),
  ]);
}
