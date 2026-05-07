/**
 * view.js — Memory ("Mirror") DOM builders.
 *
 * Pure DOM. Caller passes engine state + a dispatch fn. Re-entrant —
 * safe to call on every reducer tick.
 */
import { el } from '../../utils/dom.js';
import { DIFFICULTIES, ORBS } from './engine.js';

const ORB_DISPLAY = {
  amber:  { name: 'Solar' },
  cyan:   { name: 'Cyan' },
  rose:   { name: 'Coral' },
  violet: { name: 'Nebula' },
  green:  { name: 'Verdant' },
  blue:   { name: 'Aqua' },
};

const DIFF_TABS = [
  { id: 'easy',     short: '4×4', label: 'Easy' },
  { id: 'standard', short: '4×6', label: 'Standard' },
  { id: 'hard',     short: '6×6', label: 'Hard' },
];

function fmtTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/**
 * Build the entire Memory app frame.
 *
 * @param {object} cfg
 *   state         — current engine state
 *   elapsedMs     — wall-clock since startedAt (for the live timer)
 *   dispatch      — (action) => void
 *   onClose       — () => void
 */
export function buildView(cfg) {
  return el('div', { class: 'mem-app-frame' }, [
    buildTitlebar(cfg),
    el('div', { class: 'mem-stage' }, [
      buildBoardArea(cfg),
      buildSideRail(cfg),
    ]),
  ]);
}

function buildTitlebar() {
  return el('div', { class: 'mem-titlebar' }, [
    el('div', { class: 'mem-name' }, 'Memory'),
  ]);
}

function buildBoardArea(cfg) {
  return el('div', { class: 'mem-board-area' }, [
    buildHud(cfg),
    el('div', { class: 'mem-grid-wrap' }, [buildGrid(cfg)]),
    buildBottomBar(cfg),
  ]);
}

function buildHud(cfg) {
  const { state, elapsedMs, dispatch } = cfg;
  // Difficulty pills above the grid (mirrors the Stoneworks pattern)
  const diffPills = DIFF_TABS.map((d) => el('span', {
    class: 'mem-theme-lp' + (d.id === state.difficulty ? ' is-active' : ''),
    role: 'button', tabindex: '0',
    onclick: () => dispatch({ type: 'SET_DIFFICULTY', difficulty: d.id, now: Date.now() }),
  }, `${d.short} · ${d.label.toUpperCase()}`));

  return el('div', { class: 'mem-theme-bar' }, [
    ...diffPills,
    el('span', { class: 'mem-stat' }, [
      '⏱ ', el('b', {}, fmtTime(elapsedMs || 0)),
    ]),
    el('span', { class: 'mem-stat' }, [
      'moves ', el('b', {}, String(state.moves)),
    ]),
    el('span', { class: 'mem-stat' }, [
      'streak ', el('b', {}, `×${state.comboStreak}`),
    ]),
  ]);
}

function buildGrid(cfg) {
  const { state, dispatch } = cfg;
  const cfgD = DIFFICULTIES[state.difficulty] || DIFFICULTIES.standard;
  // Set CSS custom properties so the grid container can compute its
  // own aspect-ratio (cols × 3) / (rows × 4) and fit within the
  // available board area without overflowing.
  const grid = el('div', {
    class: 'mem-grid',
    style: {
      gridTemplateColumns: `repeat(${cfgD.cols}, 1fr)`,
      gridTemplateRows: `repeat(${cfgD.rows}, 1fr)`,
      aspectRatio: `${cfgD.cols * 3} / ${cfgD.rows * 4}`,
    },
  });

  for (const card of state.cards) {
    const isFlipped = card.faceUp || card.matched;
    const cls = ['mem-card'];
    if (isFlipped) cls.push('is-flipped');
    if (card.matched) cls.push('is-matched');
    const cardEl = el('div', {
      class: cls.join(' '),
      role: 'button',
      tabindex: state.locked ? '-1' : '0',
      'data-idx': String(card.id),
      'aria-label': `Card ${card.id + 1}${isFlipped ? ` (${ORB_DISPLAY[card.orb]?.name || card.orb})` : ''}`,
      onclick: () => {
        if (state.locked) return;
        dispatch({ type: 'FLIP', idx: card.id, now: Date.now() });
      },
    }, [
      el('div', { class: 'mem-card-back' }, [
        el('span', { class: 'mem-card-glyph' }, '✦'),
      ]),
      el('div', { class: 'mem-card-face' }, [
        el('div', { class: `mem-orb mem-orb-${card.orb}` }),
      ]),
    ]);
    grid.appendChild(cardEl);
  }
  return grid;
}

function buildBottomBar({ state }) {
  const total = state.pairsTotal || 1;
  const found = state.pairsFound || 0;
  const pct = Math.round((found / total) * 100);
  const bestStr = state.bestTimeMs?.[state.difficulty] != null
    ? fmtTime(state.bestTimeMs[state.difficulty])
    : '—';
  return el('div', { class: 'mem-bottom-bar' }, [
    el('span', { class: 'mem-bottom-label' }, [
      'pulse line follows your eye · ',
      el('b', {}, String(found)),
      ` / ${total} pairs found`,
    ]),
    el('div', { class: 'mem-pulse-track' }, [
      el('i', { style: { width: `${pct}%` } }),
    ]),
    el('span', { class: 'mem-bottom-label' }, [
      'best ', el('b', {}, bestStr),
    ]),
  ]);
}

/* ── Right rail ────────────────────────────────────────────── */

function buildSideRail(cfg) {
  const { state } = cfg;
  return el('aside', { class: 'mem-side' }, [
    buildStreakCard(state),
    buildFoundPairs(state),
    buildDifficultyPicker(cfg),
    buildModeNote(),
  ]);
}

function buildStreakCard(state) {
  const meta = state.comboStreak >= 2
    ? `${state.comboStreak} matches in a row · multiplier active`
    : state.comboStreak === 1
      ? 'first match — keep it going'
      : 'find a pair to start a combo';
  return el('div', { class: 'mem-streak-card' }, [
    el('div', { class: 'mem-streak-h' }, '★ Combo streak'),
    el('div', { class: 'mem-streak-v' }, `×${state.comboStreak}`),
    el('div', { class: 'mem-streak-meta' }, meta),
  ]);
}

function buildFoundPairs(state) {
  const header = el('h4', { class: 'mem-side-h' }, 'Found pairs');
  if (!state.foundLog || state.foundLog.length === 0) {
    return el('div', { class: 'mem-side-block' }, [
      header,
      el('div', { class: 'mem-side-empty' }, '— no matches yet —'),
    ]);
  }
  // Show found pairs newest-first; up to 5
  const seenCounts = {};
  const rows = state.foundLog.slice(0, 6).map((entry) => {
    seenCounts[entry.orb] = (seenCounts[entry.orb] || 0) + 1;
    const display = ORB_DISPLAY[entry.orb] || { name: entry.orb };
    const suffix = seenCounts[entry.orb] > 1 ? ` ${'I'.repeat(seenCounts[entry.orb])}` : '';
    return el('div', { class: 'mem-legend-row is-matched' }, [
      el('span', { class: `mem-legend-orb mem-orb-${entry.orb}` }),
      el('span', { class: 'mem-legend-name' }, display.name + suffix),
      el('span', { class: 'mem-legend-time' }, fmtTime(entry.ts)),
    ]);
  });
  return el('div', { class: 'mem-side-block' }, [header, ...rows]);
}

function buildDifficultyPicker({ state, dispatch }) {
  const header = el('h4', { class: 'mem-side-h' }, 'Difficulty');
  const tiles = DIFF_TABS.map((d) => el('div', {
    class: 'mem-diff-tile' + (d.id === state.difficulty ? ' is-active' : ''),
    role: 'button', tabindex: '0',
    onclick: () => dispatch({ type: 'SET_DIFFICULTY', difficulty: d.id, now: Date.now() }),
  }, [
    el('b', {}, d.short),
    d.label,
  ]));
  return el('div', { class: 'mem-side-block' }, [
    header,
    el('div', { class: 'mem-diff-pick' }, tiles),
  ]);
}

function buildModeNote() {
  return el('div', { class: 'mem-mode-note' }, [
    el('b', {}, 'Mirror mode: '),
    'glowing orbs — find matching pairs before they flip back.',
  ]);
}

/**
 * Build the post-game win overlay. Returns null if not won.
 */
export function buildWinOverlay(state, dispatch) {
  if (state.phase !== 'won') return null;
  const elapsed = state.finishedAt && state.startedAt
    ? state.finishedAt - state.startedAt
    : 0;
  const isBest = state.bestTimeMs?.[state.difficulty] === elapsed;
  return el('div', { class: 'mem-overlay' }, [
    el('div', { class: 'mem-overlay-title' }, 'Cleared'),
    el('div', { class: 'mem-overlay-sub' }, [
      `Time: ${fmtTime(elapsed)}`,
      el('br', {}),
      `Moves: ${state.moves}  ·  Best combo: ×${state.bestComboStreak}`,
      isBest ? el('div', { class: 'mem-overlay-best' }, '★ NEW BEST') : null,
    ].filter(Boolean)),
    el('button', {
      class: 'mem-overlay-btn',
      onclick: () => dispatch({ type: 'NEW_GAME', now: Date.now() }),
    }, '▶ Play again'),
  ]);
}
