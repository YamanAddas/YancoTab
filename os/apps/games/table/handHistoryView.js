/**
 * handHistoryView.js — Renders the "Hand history" tab inside the salon.
 *
 * The salon's titlebar has 3 tabs: Tarneeb, Trix, Hand history. This
 * module renders the third one. History is per-game — switching to the
 * tab inside Tarneeb shows Tarneeb's history (last 50 rounds); inside
 * Trix shows Trix's (last 50 deals).
 */
import { el } from '../../../utils/dom.js';

const SUIT_GLYPH = {
  spades:   '♠',
  hearts:   '♥',
  diamonds: '♦',
  clubs:    '♣',
};

const CONTRACT_LABEL = {
  queens:   'Queens',
  hearts:   'Hearts',
  diamonds: 'Diamonds',
  king:     'King of Hearts',
  trix:     'Trix',
};

const CONTRACT_GLYPH = {
  queens:   '♛',
  hearts:   '♥',
  diamonds: '♦',
  king:     '♚',
  trix:     '✦',
};

function fmtTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function buildEmpty(label) {
  return el('div', { class: 'table-history-empty' }, [
    el('div', { class: 'table-history-empty-glyph' }, '◇'),
    el('div', { class: 'table-history-empty-line' }, `No ${label} yet`),
    el('div', { class: 'table-history-empty-sub' }, 'Finish a round and it will appear here.'),
  ]);
}

/**
 * Build the panel for Tarneeb. One row per round.
 * @param {Array} entries  newest-first list of Tarneeb hand entries
 */
export function buildTarneebHistory(entries) {
  if (!entries || entries.length === 0) return buildEmpty('rounds');

  const rows = entries.map((entry) => {
    const trump = SUIT_GLYPH[entry.trumpSuit] || '?';
    const bids = entry.bids || {};
    const tricks = entry.tricksWon || {};
    const team = entry.teamScoresAfter || {};

    const south = Number(bids.south || 0);
    const won = Number(tricks.south || 0);
    const outcome = entry.outcome === 'made' ? 'is-made' : (entry.outcome === 'failed' ? 'is-failed' : '');
    const sign = won >= south ? `+${south}` : `-${south}`;

    return el('div', { class: `table-history-row ${outcome}` }, [
      el('div', { class: 'table-history-cell-r' }, [
        el('span', { class: 'table-history-num' }, `R${entry.round || '?'}`),
        el('span', { class: 'table-history-glyph' }, trump),
      ]),
      el('div', { class: 'table-history-cell-mid' }, [
        el('div', { class: 'table-history-line' }, `You bid ${south} · won ${won}`),
        el('div', { class: 'table-history-sub' }, `Us ${team.NS ?? 0} · Them ${team.EW ?? 0}`),
      ]),
      el('div', { class: 'table-history-cell-r2' }, [
        el('span', { class: 'table-history-delta' }, sign),
        el('span', { class: 'table-history-ts' }, fmtTime(entry.ts)),
      ]),
    ]);
  });

  return el('div', { class: 'table-history-list' }, rows);
}

/**
 * Build the panel for Trix. One row per deal (kingdom + contract).
 */
export function buildTrixHistory(entries) {
  if (!entries || entries.length === 0) return buildEmpty('deals');

  const rows = entries.map((entry) => {
    const cKey = String(entry.contract || '').toLowerCase();
    const cLabel = CONTRACT_LABEL[cKey] || entry.contract || '?';
    const cGlyph = CONTRACT_GLYPH[cKey] || '◇';
    const team = entry.teamScoresAfter;
    const south = Number(entry.scoresAfter?.south || 0);

    const teamLine = team
      ? `Team A ${team.A ?? 0} · Team B ${team.B ?? 0}`
      : `Total ${south}`;

    return el('div', { class: 'table-history-row' }, [
      el('div', { class: 'table-history-cell-r' }, [
        el('span', { class: 'table-history-num' }, `K${entry.kingdom || '?'}`),
        el('span', { class: 'table-history-glyph' }, cGlyph),
      ]),
      el('div', { class: 'table-history-cell-mid' }, [
        el('div', { class: 'table-history-line' }, `${cLabel} · ${entry.kingdomOwner || '?'}`),
        el('div', { class: 'table-history-sub' }, teamLine),
      ]),
      el('div', { class: 'table-history-cell-r2' }, [
        el('span', { class: 'table-history-delta' }, formatDelta(south)),
        el('span', { class: 'table-history-ts' }, fmtTime(entry.ts)),
      ]),
    ]);
  });

  return el('div', { class: 'table-history-list' }, rows);
}

function formatDelta(n) {
  if (!Number.isFinite(n) || n === 0) return '0';
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Generic dispatcher used by TableShell. Calls the right per-game
 * builder based on `gameId`. The salon shell doesn't need to import
 * each builder.
 */
export function buildHistoryView(gameId, entries) {
  if (gameId === 'tarneeb') return buildTarneebHistory(entries);
  if (gameId === 'trix') return buildTrixHistory(entries);
  return buildEmpty('hands');
}
