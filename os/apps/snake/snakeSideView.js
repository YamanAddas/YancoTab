/**
 * snakeSideView.js — DOM builders for the Snake "Comet" salon chrome
 * (HUD bar above the canvas + side rail).
 *
 * Pure DOM, polled by the host on a slow interval. The canvas engine
 * stays untouched — it owns the gameplay rendering. The DOM rail
 * exposes the player's score, length, time, speed, active power-ups,
 * personal-best leaderboard, and a D-pad legend.
 */
import { el } from '../../utils/dom.js';

const SLIPSTREAM_LABEL = { ghost: 'Slipstream', slow: 'Slow-Mo', magnet: 'Magnet', shield: 'Shield' };

function fmtTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function fmtNum(n) {
  if (!Number.isFinite(n)) return '0';
  return Math.floor(n).toLocaleString('en-US');
}

/**
 * Build the HUD bar that sits above the canvas (score / length / time
 * / speed pill). Re-rendered on every poll tick.
 */
export function buildHud(state) {
  const speedPill = state.speedMult && state.speedMult > 1
    ? `SPEED · ⚡ ×${state.speedMult.toFixed(1)}`
    : `SPEED · ⚡ ×1`;
  return el('div', { class: 'snk-hud' }, [
    el('span', { class: 'snk-hud-stat' }, [
      'SCORE ', el('b', {}, fmtNum(state.score)),
    ]),
    el('span', { class: 'snk-hud-stat' }, [
      'LEN ', el('b', {}, fmtNum(state.length)),
    ]),
    el('span', { class: 'snk-hud-stat' }, [
      '★ ', el('b', {}, fmtTime(state.elapsedMs)),
    ]),
    el('span', { class: 'snk-hud-speed' }, speedPill),
  ]);
}

/**
 * Build the right-rail score card + active-power-ups list + personal
 * bests + D-pad legend.
 */
export function buildSideRail(state) {
  const score = state.score || 0;
  const best = state.best || 0;
  const overBest = score - best;
  // Inside the `score >= best && best > 0` branch, overBest is always >= 0.
  const meta = score >= best && best > 0
    ? `+${fmtNum(overBest)} over personal best`
    : best > 0
      ? `Best: ${fmtNum(best)}`
      : '— first run —';
  const streakLine = state.foodsEaten > 0 ? `streak: ${state.foodsEaten} apples` : '';

  const scoreCard = el('div', { class: 'snk-score-card' }, [
    el('div', { class: 'snk-score-h' }, '★ Current run'),
    el('div', { class: 'snk-score-v' }, fmtNum(score)),
    el('div', { class: 'snk-score-meta' },
      [meta, streakLine].filter(Boolean).join(' · ')),
  ]);

  // Active power-ups (in play)
  const powerHeader = el('h4', { class: 'snk-side-h' }, 'Power-ups in play');
  const powerRows = [];
  if (Array.isArray(state.activePowers) && state.activePowers.length > 0) {
    for (const p of state.activePowers) {
      const label = SLIPSTREAM_LABEL[p.id] || p.label || p.id;
      const remainStr = Number.isFinite(p.remainingMs) ? fmtTime(p.remainingMs) : '—';
      powerRows.push(el('div', { class: `snk-power-row snk-power-${p.id}` }, [
        el('div', { class: 'snk-power-icon' }),
        el('div', { class: 'snk-power-text' }, [
          el('b', {}, label),
          ` · ${remainStr} left`,
        ]),
      ]));
    }
  } else {
    powerRows.push(el('div', { class: 'snk-side-empty' }, 'none active'));
  }

  // Personal bests (top-5 ring buffer the host maintains)
  const bestsHeader = el('h4', { class: 'snk-side-h' }, 'Personal bests');
  const bests = Array.isArray(state.personalBests) ? state.personalBests.slice(0, 5) : [];
  const bestRows = [];
  if (bests.length === 0) {
    bestRows.push(el('div', { class: 'snk-side-empty' }, '— no runs yet —'));
  } else {
    bests.forEach((entry, i) => {
      const isYou = entry.isCurrent === true;
      bestRows.push(el('div', { class: 'snk-leader-row' + (isYou ? ' is-you' : '') }, [
        el('span', { class: 'snk-leader-rk' }, `#${i + 1}`),
        el('span', { class: 'snk-leader-nm' }, entry.label || 'run'),
        el('span', { class: 'snk-leader-sc' }, fmtNum(entry.score)),
      ]));
    });
  }

  // D-pad legend
  const dpadHeader = el('h4', { class: 'snk-side-h' }, 'Controls');
  const dpad = el('div', { class: 'snk-dpad' }, [
    el('div', { class: 'snk-key snk-key-up' }, '↑'),
    el('div', { class: 'snk-key snk-key-left' }, '←'),
    el('div', { class: 'snk-key snk-key-mid' }, '⎵'),
    el('div', { class: 'snk-key snk-key-right' }, '→'),
    el('div', { class: 'snk-key snk-key-down' }, '↓'),
  ]);

  const dpadHint = el('div', { class: 'snk-dpad-hint' }, [
    '⎵ pause · trail brightens', el('br', {}),
    'Wall hit → comet shatters',
  ]);

  return el('aside', { class: 'snk-side' }, [
    scoreCard,
    powerHeader,
    ...powerRows,
    bestsHeader,
    ...bestRows,
    dpadHeader,
    dpad,
    dpadHint,
  ]);
}
