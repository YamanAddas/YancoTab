/**
 * tarneebSalonView.js — Salon-rail builders specific to Tarneeb.
 *
 * The shared TableShell exposes slots for scoresheet + side panel + felt;
 * this module owns the scoresheet markup so TarneebApp.js stays under
 * the 500-line cap. Pure DOM builders, no state — caller passes the
 * current store state plus a couple of helpers.
 */
import { el } from '../../../utils/dom.js';
import { SEATS, teamOf } from './tarneebRules.js';

/**
 * Build the right-rail scoresheet for the salon. Mirrors the mock's
 * HAND / BID / US / THEM table with the last ~7 rounds + a totals row.
 *
 * @param {object} state         Tarneeb match state
 * @param {object} helpers
 *   suitSymbol(suit) -> glyph
 */
export function buildTarneebScoresheet(state, helpers) {
  if (!state || state.phase === 'SETUP') return null;
  const suitSymbol = helpers?.suitSymbol || ((s) => s);

  const teamTotals = state.scores
    ? {
        NS: (state.scores.south || 0) + (state.scores.north || 0) + (state.teamBonus?.NS || 0),
        EW: (state.scores.east  || 0) + (state.scores.west  || 0) + (state.teamBonus?.EW || 0),
      }
    : { NS: 0, EW: 0 };

  const log = (state.roundLog || []).slice(-7);

  const headRow = el('tr', {}, [
    el('th', {}, 'HAND'),
    el('th', {}, 'BID'),
    el('th', { class: 'us' }, 'US'),
    el('th', { class: 'them' }, 'THEM'),
  ]);

  const bodyRows = log.map((r) => {
    const winner = SEATS.find((s) => Number(r.bids?.[s] || 0) > 0
      && Number(r.tricksWon?.[s] || 0) >= Number(r.bids?.[s] || 0));
    const loser = SEATS.find((s) => Number(r.bids?.[s] || 0) > 0
      && Number(r.tricksWon?.[s] || 0) < Number(r.bids?.[s] || 0));
    const bidWinner = winner || loser || null;
    const bidVal = bidWinner ? Number(r.bids[bidWinner] || 0) : 0;
    const bidSuit = suitSymbol(r.trumpSuit);
    const made = winner != null;
    const team = bidWinner ? teamOf(bidWinner) : null;
    const usDelta  = made && team === 'NS' ? `+${bidVal}` : (loser && teamOf(loser) === 'EW' ? `+${bidVal}` : '—');
    const themDelta = made && team === 'EW' ? `+${bidVal}` : (loser && teamOf(loser) === 'NS' ? `+${bidVal}` : '—');
    return el('tr', {}, [
      el('td', {}, String(r.roundNumber || '')),
      el('td', {}, `${bidSuit} ${bidVal}`),
      el('td', { class: 'us' }, usDelta),
      el('td', { class: 'them' }, themDelta),
    ]);
  });

  const totalRow = el('tr', { class: 'is-total' }, [
    el('td', {}, el('b', {}, String(state.roundNumber || ''))),
    el('td', {}, el('b', {}, suitSymbol(state.trumpSuit))),
    el('td', { class: 'us' }, el('b', {}, String(teamTotals.NS))),
    el('td', { class: 'them' }, el('b', {}, String(teamTotals.EW))),
  ]);

  return el('div', { class: 'table-scoresheet' }, [
    el('h4', { class: 'table-side-h' }, 'Scoresheet · Tarneeb'),
    el('table', {}, [
      el('thead', {}, [headRow]),
      el('tbody', {}, [...bodyRows, totalRow]),
    ]),
    el('div', { class: 'table-scoresheet-footer' }, 'First to 41 → win'),
  ]);
}

/**
 * Build the per-round history entry to push to handHistory.append().
 * Pure — caller passes the round summary (state.roundSummary) and a match id.
 */
export function buildTarneebHistoryEntry(summary, matchId) {
  if (!summary) return null;
  const winnerSeat = SEATS.find((seat) => {
    const bid = Number(summary.bids?.[seat] || 0);
    return bid > 0 && Number(summary.tricksWon?.[seat] || 0) >= bid;
  });
  return {
    match: matchId || `m-${Date.now().toString(36)}`,
    round: summary.roundNumber || 0,
    dealer: summary.dealer || '',
    trumpSuit: summary.trumpSuit || '',
    bids: { ...(summary.bids || {}) },
    tricksWon: { ...(summary.tricksWon || {}) },
    scoresAfter: { ...(summary.scoresAfter || {}) },
    teamScoresAfter: summary.teamTotalsAfter || { NS: 0, EW: 0 },
    outcome: winnerSeat ? 'made' : 'failed',
  };
}
