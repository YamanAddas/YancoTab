/**
 * trixSalonView.js — Salon-rail builders specific to Trix.
 *
 * The shared TableShell exposes a scoresheet slot in the right rail
 * and a history-tab renderer. Trix's scoring is different from
 * Tarneeb (per-deal deltas, not bid+made/failed) so this module owns
 * the Trix-specific shape. Pure DOM builders.
 */
import { el } from '../../../utils/dom.js';
import { SEATS, SEAT_NAMES } from './trixRules.js';

const CONTRACT_GLYPH = {
  king:     '♚',
  queens:   '♛',
  diamonds: '♦',
  ltoosh:   '✚',
  trix:     '✦',
};
const CONTRACT_LABEL = {
  king:     'King♥',
  queens:   'Queens',
  diamonds: 'Diamonds',
  ltoosh:   'Ltoosh',
  trix:     'Trix',
};

function fmt(n) {
  const v = Number(n || 0);
  if (!v) return '0';
  return v > 0 ? `+${v}` : String(v);
}

/**
 * Build the right-rail scoresheet for Trix. Shows the last 6 deals
 * (kingdom + contract + your delta + your running total) plus a
 * totals row across all 4 seats. In partners mode adds team totals.
 */
export function buildTrixScoresheet(state) {
  if (!state || state.phase === 'SETUP') return null;
  const log = Array.isArray(state.dealLog) ? state.dealLog : [];
  const recent = log.slice(-6);

  const headRow = el('tr', {}, [
    el('th', {}, 'K'),
    el('th', {}, 'CONTRACT'),
    el('th', { class: 'us' }, 'YOU'),
    el('th', {}, 'TOT'),
  ]);

  const bodyRows = recent.map((entry) => {
    const cKey = String(entry.contractId || '').toLowerCase();
    const glyph = CONTRACT_GLYPH[cKey] || '◇';
    const label = CONTRACT_LABEL[cKey] || entry.contractId || '?';
    const delta = entry.deltas?.south || 0;
    const total = entry.totals?.south || 0;
    const cls = delta > 0 ? 'is-pos' : (delta < 0 ? 'is-neg' : '');
    return el('tr', {}, [
      el('td', {}, String(entry.kingdomNumber || '')),
      el('td', {}, `${glyph} ${label}`),
      el('td', { class: `us ${cls}` }, fmt(delta)),
      el('td', {}, String(total)),
    ]);
  });

  const seatTotals = el('tr', { class: 'is-total' }, [
    el('td', { colspan: '2' }, el('b', {}, 'Totals')),
    el('td', { class: 'us' }, el('b', {}, String(state.scores?.south || 0))),
    el('td', {}, el('b', {}, ''),
    ),
  ]);

  const blocks = [
    el('div', { class: 'table-scoresheet' }, [
      el('h4', { class: 'table-side-h' }, 'Scoresheet · Trix'),
      recent.length === 0
        ? el('div', { class: 'table-scoresheet-empty' }, 'No deals yet')
        : el('table', {}, [
            el('thead', {}, [headRow]),
            el('tbody', {}, [...bodyRows, seatTotals]),
          ]),
      el('div', { class: 'table-scoresheet-footer' }, kingdomFooter(state)),
    ]),
  ];

  if (state.mode === 'partners') {
    const a = state.teamScores?.A || 0;
    const b = state.teamScores?.B || 0;
    blocks.push(
      el('div', { class: 'table-scoresheet table-scoresheet-teams' }, [
        el('h4', { class: 'table-side-h' }, 'Teams'),
        el('div', { class: 'table-team-row' }, [
          el('span', {}, 'You + CatByte'),
          el('b', { class: 'us' }, String(a)),
        ]),
        el('div', { class: 'table-team-row' }, [
          el('span', {}, 'Zbayder + Yousif'),
          el('b', { class: 'them' }, String(b)),
        ]),
      ]),
    );
  } else {
    // Single-player mode: show all 4 seat totals
    blocks.push(
      el('div', { class: 'table-scoresheet table-scoresheet-teams' }, [
        el('h4', { class: 'table-side-h' }, 'All seats'),
        ...SEATS.map((s) => el('div', { class: 'table-team-row' }, [
          el('span', {}, SEAT_NAMES[s] || s),
          el('b', { class: s === 'south' ? 'us' : '' }, String(state.scores?.[s] || 0)),
        ])),
      ]),
    );
  }

  return el('div', { class: 'table-trix-scoresheet-wrap' }, blocks);
}

function kingdomFooter(state) {
  const k = state.kingdomNumber || 1;
  return `Kingdom ${k} of 4`;
}

/**
 * Build a Trix hand-history entry from the last logged deal in
 * state.dealLog. Returns null if the log is empty. Used by TrixApp's
 * round:end handler to push to the persistent history.
 */
export function buildTrixHistoryEntry(state) {
  if (!state) return null;
  const log = Array.isArray(state.dealLog) ? state.dealLog : [];
  const last = log[log.length - 1];
  if (!last) return null;
  return {
    match: state.matchId || `m-${Date.now().toString(36)}`,
    kingdom: last.kingdomNumber || 0,
    contract: last.contractId || '',
    kingdomOwner: last.kingdomOwner || '',
    dealer: last.kingdomOwner || '',
    scoresAfter: { ...(last.totals || {}) },
    teamScoresAfter: last.teamTotals ? { ...last.teamTotals } : null,
  };
}
