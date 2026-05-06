/**
 * GamesSettings.js — Games tab for the Settings app
 *
 * Renders card game shared settings, per-game defaults,
 * arcade theme picker, difficulty defaults, and stats/reset.
 */

import { el } from '../../utils/dom.js';

/* ── Storage keys ── */

const SOL_SETTINGS  = 'yancotab_solitaire_settings';
const SOL_STATS     = 'yancotab_solitaire_stats';
const SPIDER_SETTINGS = 'yancotab_spider_settings';
const SPIDER_STATS  = 'yancotab_spider_stats';
const NEON_KEYS = {
  snake:       'yancotab_neon_serpent',
  tictactoe:   'yancotab_neon_tactics',
  memory:      'yancotab_neon_recall',
  minesweeper: 'yancotab_neon_mines',
};
const MAHJONG_KEY  = 'yancotab_mahjong';
const TARNEEB_KEY  = 'yancotab_tarneeb';
const TRIX_KEY     = 'yancotab_trix';

const CARD_BACKS = ['nebula', 'hex', 'warp', 'aurora'];
const NEON_COLORS = {
  cyan:    '#2dd4bf',
  magenta: '#e855a0',
  gold:    '#f5b731',
  emerald: '#34d399',
};
const SCORING_MODES = ['standard', 'vegas', 'vegas-cumulative'];

/* ── Helpers ── */

function load(storage, key, fallback = {}) {
  try { return storage.load(key) || fallback; } catch { return fallback; }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ── Public entry point ── */

/**
 * @param {HTMLElement} container  — scroll div to append sections to
 * @param {object}      app       — SettingsApp instance (provides kernel, _group, _toggleRow, etc.)
 */
export function renderGames(container, app) {
  const storage = app.kernel.storage;
  const rerender = () => app._renderContent();
  const toast = (msg, type) => app.kernel.emit('toast', { message: msg, type });

  _cardGames(container, storage, app, rerender);
  _solitaire(container, storage, app, rerender);
  _spider(container, storage, app, rerender);
  _arcadeTheme(container, storage, app);
  _difficultyDefaults(container, storage, app, rerender);
  _statsAndReset(container, storage, app, toast);
}

/* ── Card Games (shared Solitaire + Spider) ── */

function _cardGames(container, storage, app, rerender) {
  const sol = load(storage, SOL_SETTINGS, { cardBack: 'nebula', fourColor: false, leftHanded: false, timed: true });
  const spider = load(storage, SPIDER_SETTINGS, { cardBack: 'nebula', fourColor: false, leftHanded: false, timed: true });

  // Card back picker — shared value (use solitaire as source of truth)
  const currentBack = sol.cardBack || 'nebula';
  const backRow = el('div', { class: 'ys-row' }, [
    el('div', { class: 'ys-info' }, [
      el('div', { class: 'ys-label' }, 'Card Back'),
      el('div', { class: 'ys-desc' }, capitalize(currentBack)),
    ]),
    _pillPicker(CARD_BACKS, currentBack, (picked) => {
      sol.cardBack = picked;
      spider.cardBack = picked;
      storage.save(SOL_SETTINGS, sol);
      storage.save(SPIDER_SETTINGS, spider);
      rerender();
    }),
  ]);

  container.appendChild(app._group('Card Games', [
    backRow,
    app._toggleRow('4-Color Suits', 'Distinct color per suit', sol.fourColor, (next) => {
      sol.fourColor = next; spider.fourColor = next;
      storage.save(SOL_SETTINGS, sol); storage.save(SPIDER_SETTINGS, spider);
    }),
    app._toggleRow('Left-Handed', 'Mirror the card layout', sol.leftHanded, (next) => {
      sol.leftHanded = next; spider.leftHanded = next;
      storage.save(SOL_SETTINGS, sol); storage.save(SPIDER_SETTINGS, spider);
    }),
    app._toggleRow('Show Timer', 'Display elapsed time while playing', sol.timed, (next) => {
      sol.timed = next; spider.timed = next;
      storage.save(SOL_SETTINGS, sol); storage.save(SPIDER_SETTINGS, spider);
    }),
  ]));
}

/* ── Solitaire-specific ── */

function _solitaire(container, storage, app, rerender) {
  const sol = load(storage, SOL_SETTINGS, { drawCount: 1, scoring: 'standard' });

  container.appendChild(app._group('Solitaire', [
    app._choiceRow('Draw 1', sol.drawCount === 1, () => { sol.drawCount = 1; storage.save(SOL_SETTINGS, sol); rerender(); }),
    app._choiceRow('Draw 3', sol.drawCount === 3, () => { sol.drawCount = 3; storage.save(SOL_SETTINGS, sol); rerender(); }),
    _divider(),
    ...SCORING_MODES.map((mode) =>
      app._choiceRow(_scoringLabel(mode), sol.scoring === mode, () => { sol.scoring = mode; storage.save(SOL_SETTINGS, sol); rerender(); })
    ),
  ]));
}

function _scoringLabel(mode) {
  if (mode === 'standard') return 'Standard Scoring';
  if (mode === 'vegas') return 'Vegas Scoring';
  return 'Vegas Cumulative';
}

/* ── Spider Solitaire ── */

function _spider(container, storage, app, rerender) {
  const sp = load(storage, SPIDER_SETTINGS, { difficulty: 1 });
  container.appendChild(app._group('Spider Solitaire', [
    app._choiceRow('1 Suit (Easy)', sp.difficulty === 1, () => { sp.difficulty = 1; storage.save(SPIDER_SETTINGS, sp); rerender(); }),
    app._choiceRow('2 Suits (Medium)', sp.difficulty === 2, () => { sp.difficulty = 2; storage.save(SPIDER_SETTINGS, sp); rerender(); }),
    app._choiceRow('4 Suits (Hard)', sp.difficulty === 4, () => { sp.difficulty = 4; storage.save(SPIDER_SETTINGS, sp); rerender(); }),
  ]));
}

/* ── Arcade Theme ── */

function _arcadeTheme(container, storage, app) {
  // Read current theme from any neon game (they should all match)
  const snakeData = load(storage, NEON_KEYS.snake, { theme: 'cyan' });
  const current = snakeData.theme || 'cyan';

  const dots = el('div', { class: 'ys-color-dots' });
  for (const [name, hex] of Object.entries(NEON_COLORS)) {
    const dot = el('button', {
      type: 'button',
      class: 'ys-color-dot' + (name === current ? ' selected' : ''),
      style: `background:${hex};`,
      title: capitalize(name),
      onclick: () => {
        // Apply to all 4 neon games
        for (const key of Object.values(NEON_KEYS)) {
          const d = load(storage, key, {});
          d.theme = name;
          storage.save(key, d);
        }
        dots.querySelectorAll('.ys-color-dot').forEach((d) => d.classList.remove('selected'));
        dot.classList.add('selected');
      },
    });
    dots.appendChild(dot);
  }

  container.appendChild(app._group('Arcade Games', [
    el('div', { class: 'ys-row' }, [
      el('div', { class: 'ys-info' }, [
        el('div', { class: 'ys-label' }, 'Theme Color'),
        el('div', { class: 'ys-desc' }, 'Shared color for Snake, TicTacToe, Memory, Minesweeper'),
      ]),
      dots,
    ]),
  ]));
}

/* ── Difficulty Defaults ── */

function _difficultyDefaults(container, storage, app, rerender) {
  const games = [
    { label: 'Minesweeper', key: NEON_KEYS.minesweeper, field: 'difficulty', options: ['easy', 'medium', 'hard'] },
    { label: 'Tic-Tac-Toe', key: NEON_KEYS.tictactoe,   field: 'difficulty', options: ['easy', 'medium', 'hard'] },
    { label: 'Memory',      key: NEON_KEYS.memory,       field: 'difficulty', options: ['easy', 'medium', 'hard'] },
    { label: 'Tarneeb',     key: TARNEEB_KEY,             field: 'difficulty', options: ['easy', 'moderate', 'hard'] },
    { label: 'Trix',        key: TRIX_KEY,                field: 'difficulty', options: ['easy', 'moderate', 'hard'] },
  ];

  const rows = games.map((g) => {
    const data = load(storage, g.key, {});
    const current = g.options.includes(data[g.field]) ? data[g.field] : g.options[0];
    return _selectRow(g.label, g.options.map(capitalize), g.options.indexOf(current), (idx) => {
      data[g.field] = g.options[idx];
      storage.save(g.key, data);
    });
  });

  container.appendChild(app._group('Difficulty Defaults', rows));
}

/* ── Stats & Reset ── */

function _statsAndReset(container, storage, app, toast) {
  const statLines = [];

  // Solitaire
  const solStats = load(storage, SOL_STATS, { played: 0, won: 0 });
  if (solStats.played) statLines.push(_statLine('Solitaire', solStats.played, solStats.won));

  // Spider
  const spStats = load(storage, SPIDER_STATS, { played: 0, won: 0 });
  if (spStats.played) statLines.push(_statLine('Spider', spStats.played, spStats.won));

  // Neon games
  for (const [name, key] of [['Snake', NEON_KEYS.snake], ['Minesweeper', NEON_KEYS.minesweeper],
    ['TicTacToe', NEON_KEYS.tictactoe], ['Memory', NEON_KEYS.memory]]) {
    const d = load(storage, key, {});
    const played = d.gamesPlayed || 0;
    const won = d.gamesWon || 0;
    if (played) statLines.push(_statLine(name, played, won));
  }

  // Card games
  for (const [name, key] of [['Mahjong', MAHJONG_KEY], ['Tarneeb', TARNEEB_KEY], ['Trix', TRIX_KEY]]) {
    const d = load(storage, key, {});
    const played = d.gamesPlayed || 0;
    const won = d.gamesWon || 0;
    if (played) statLines.push(_statLine(name, played, won));
  }

  if (!statLines.length) statLines.push(el('div', { class: 'ys-desc', style: 'padding:8px 0;' }, 'No games played yet.'));

  container.appendChild(app._group('Stats', statLines));

  container.appendChild(app._group('Data', [
    app._actionRow('Reset All Game Stats', 'Clear stats for every game', () => {
      if (!confirm('Reset all game statistics? This cannot be undone.')) return;
      // Solitaire + Spider stats
      storage.save(SOL_STATS, { played: 0, won: 0, bestTimeSec: null, bestMoves: null, bestScore: 0, currentStreak: 0, longestStreak: 0, vegasBank: 0 });
      storage.save(SPIDER_STATS, { played: 0, won: 0, bestTimeSec: { 1: null, 2: null, 4: null }, bestMoves: { 1: null, 2: null, 4: null }, bestScore: { 1: 0, 2: 0, 4: 0 }, currentStreak: 0, longestStreak: 0 });
      // Neon games — zero stats, keep settings
      for (const key of Object.values(NEON_KEYS)) {
        const d = load(storage, key, {});
        d.gamesPlayed = 0; d.gamesWon = 0; d.best = 0; d.bestCombo = 0; d.bestTimes = {}; d.bestScores = {};
        storage.save(key, d);
      }
      // Card games
      for (const key of [MAHJONG_KEY, TARNEEB_KEY, TRIX_KEY]) {
        const d = load(storage, key, {});
        d.gamesPlayed = 0; d.gamesWon = 0; d.bestTime = null;
        storage.save(key, d);
      }
      toast('Game stats reset', 'success');
    }, true),
  ]));
}

/* ── UI building blocks ── */

function _statLine(name, played, won) {
  const pct = played > 0 ? Math.round((won / played) * 100) : 0;
  return el('div', { class: 'ys-row' }, [
    el('div', { class: 'ys-label' }, name),
    el('div', { class: 'ys-desc', style: 'margin-top:0; text-align:right;' }, `${won}/${played} won (${pct}%)`),
  ]);
}

function _selectRow(label, options, selectedIdx, onChange) {
  const pills = el('div', { class: 'ys-pill-group' });
  options.forEach((opt, i) => {
    const btn = el('button', {
      type: 'button',
      class: 'ys-pill' + (i === selectedIdx ? ' selected' : ''),
      onclick: () => {
        pills.querySelectorAll('.ys-pill').forEach((p) => p.classList.remove('selected'));
        btn.classList.add('selected');
        onChange(i);
      },
    }, opt);
    pills.appendChild(btn);
  });
  return el('div', { class: 'ys-row' }, [
    el('div', { class: 'ys-label' }, label),
    pills,
  ]);
}

function _pillPicker(options, current, onChange) {
  const pills = el('div', { class: 'ys-pill-group' });
  options.forEach((opt) => {
    const btn = el('button', {
      type: 'button',
      class: 'ys-pill' + (opt === current ? ' selected' : ''),
      onclick: () => {
        pills.querySelectorAll('.ys-pill').forEach((p) => p.classList.remove('selected'));
        btn.classList.add('selected');
        onChange(opt);
      },
    }, capitalize(opt));
    pills.appendChild(btn);
  });
  return pills;
}

function _divider() {
  return el('div', { class: 'ys-divider' });
}
