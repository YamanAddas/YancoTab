/**
 * mahjongSideView.js — Right-rail and bottom-bar builders for Mahjong.
 *
 * Pure DOM builders. Caller passes the game + UI state and a handlers
 * object; the builders never reach back into the host app instance
 * directly. Keeps MahjongApp.js under the 500-line cap by hosting the
 * salon-rail markup here.
 */
import { el } from '../../../utils/dom.js';

const LAYOUTS = [
  { id: 'turtle',   label: 'TURTLE · 144',   enabled: true  },
  { id: 'pyramid',  label: 'PYRAMID · 120',  enabled: false },
  { id: 'fortress', label: 'FORTRESS · 168', enabled: false },
  { id: 'daily',    label: 'DAILY ✦',         enabled: false },
];

/** Top of board — 4 layout pills. Only TURTLE enabled in v1. */
export function buildLayoutPicker(activeId, onPick) {
  return el('div', { class: 'mj-layout-picker' }, LAYOUTS.map((l) => {
    const props = {
      class: 'mj-lp'
        + (l.id === activeId ? ' is-active' : '')
        + (!l.enabled ? ' is-disabled' : ''),
      role: 'button',
      tabindex: l.enabled ? '0' : '-1',
      title: l.enabled ? l.label : `${l.label} · coming soon`,
      onclick: () => { if (l.enabled) onPick?.(l.id); else onPick?.('__disabled', l.id); },
    };
    return el('span', props, l.label);
  }));
}

/** Top-right pill on the board — current match count. */
export function buildMatchCounter(matchedPairs, totalPairs) {
  return el('div', { class: 'mj-match-counter' }, [
    'matched ',
    el('b', {}, String(matchedPairs)),
    ` / ${totalPairs} pairs`,
  ]);
}

/**
 * Bottom-of-board glass bar with timer + free-pairs + tiles-left
 * stats and the 4 action buttons.
 */
export function buildShuffleBar({ timeStr, freePairs, tilesLeft, comboStreak, handlers }) {
  const stat = (label, value) => el('span', { class: 'mj-sb-stat' }, [
    `${label} `, el('b', {}, String(value)),
  ]);
  const btn = (label, onClick, opts = {}) => el('button', {
    class: 'mj-sb-btn' + (opts.primary ? ' is-primary' : '') + (opts.disabled ? ' is-disabled' : ''),
    disabled: !!opts.disabled,
    onclick: opts.disabled ? null : onClick,
    title: opts.title || label,
  }, label);

  return el('div', { class: 'mj-shuffle-bar' }, [
    el('span', { class: 'mj-sb-time' }, [
      el('span', { class: 'mj-sb-time-icon' }, '⏱'),
      el('b', {}, timeStr),
    ]),
    stat('free pairs', freePairs),
    stat('left', tilesLeft),
    comboStreak > 1 ? stat('combo', `×${comboStreak}`) : null,
    el('div', { class: 'mj-sb-spacer' }),
    btn('↺ Undo', handlers.onUndo, { disabled: !handlers.canUndo, title: 'Undo last match' }),
    btn('⌖ Hint', handlers.onHint, { title: 'Highlight a legal pair' }),
    btn('⇆ Shuffle', handlers.onShuffle, { title: 'Reshuffle remaining tiles' }),
    btn('⟳ New', handlers.onNew, { primary: true, title: 'Start a new game' }),
  ].filter(Boolean));
}

/* ── Right rail ─────────────────────────────────────────────── */

const TILE_COLOR_CLASS = {
  // dragon ranks 0/1/2 → red/green/blue per design package
  'dragon-0': 'is-red',
  'dragon-1': 'is-green',
  'dragon-2': 'is-blue',
};

function miniTileFor(tile) {
  const colorClass = TILE_COLOR_CLASS[tile.matchGroup]
    ?? (tile.suit === 'bamboo' ? 'is-green' : '');
  return el('span', { class: `mj-mini-tile ${colorClass}`.trim() }, tile.icon);
}

/**
 * Build the side rail. `state` is `{ matched, total, recent, stats }`
 * where `recent` is `[{ pair: [tile, tile], score, time }]` newest-first
 * and `stats` is `{ comboStreak, bestComboStreak, bestClearStr,
 * hintsUsed, hintsLimit, shufflesUsed, shufflesLimit }`.
 */
export function buildSideRail(state) {
  const recentBlock = el('div', { class: 'mj-side-block' }, [
    el('h4', { class: 'mj-side-h' }, 'Recent matches'),
    state.recent.length === 0
      ? el('div', { class: 'mj-side-empty' }, '— no matches yet —')
      : el('div', { class: 'mj-side-rows' },
          state.recent.slice(0, 5).map((entry) => el('div', { class: 'mj-set-row' }, [
            el('span', { class: 'mj-set-pair' }, [
              miniTileFor(entry.pair[0]),
              miniTileFor(entry.pair[1]),
            ]),
            el('span', { class: 'mj-set-lab' }, `+${entry.score} · ${entry.time}`),
          ]))),
  ]);

  const statRow = (label, value, accent = false) => el('div', { class: 'mj-set-row mj-set-row-stat' }, [
    el('span', { class: 'mj-set-stat-label' }, label),
    el('span', { class: 'mj-set-stat-value' + (accent ? ' is-accent' : '') }, value),
  ]);
  const statsBlock = el('div', { class: 'mj-side-block' }, [
    el('h4', { class: 'mj-side-h' }, 'Stats'),
    statRow('Combo streak', `×${state.stats.comboStreak}`, state.stats.comboStreak >= 2),
    statRow('Best combo',   `×${state.stats.bestComboStreak}`),
    statRow('Best clear',   state.stats.bestClearStr || '—'),
    statRow('Hints used',   `${state.stats.hintsUsed} / ${state.stats.hintsLimit}`),
    statRow('Shuffles',     `${state.stats.shufflesUsed} / ${state.stats.shufflesLimit}`),
  ]);

  const dailyCard = el('div', { class: 'mj-daily-card' }, [
    el('div', { class: 'mj-daily-title' }, '★ Daily Stoneworks'),
    el('div', { class: 'mj-daily-body' }, 'Today\'s tile set: 144 · seed locked'),
  ]);

  return el('aside', { class: 'mj-side' }, [recentBlock, statsBlock, dailyCard]);
}

/** Build a single mini-tile for the icon label fallback (used by tests). */
export function buildMiniTile(tile) { return miniTileFor(tile); }
