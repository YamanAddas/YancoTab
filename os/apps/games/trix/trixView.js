/** trixView.js — extracted DOM-building panels for TrixApp. */
import { el } from '../../../utils/dom.js';
import { SEAT_NAMES, CONTRACTS, SEATS, legalLayoutPlays, TEAMS, TEAM_NAMES } from './trixRules.js';
import { Card } from '../cardEngine/Card.js';

export function tapGuard(handler, { movePx = 12 } = {}) {
  let sx = 0, sy = 0, moved = false;
  return {
    onpointerdown(e) { moved = false; sx = e.clientX; sy = e.clientY; try { e.currentTarget?.setPointerCapture?.(e.pointerId); } catch { /* best-effort */ } },
    onpointermove(e) { if (Math.abs(e.clientX - sx) > movePx || Math.abs(e.clientY - sy) > movePx) moved = true; },
    onpointerup(e) { try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch { /* best-effort */ } if (moved) return; try { e.preventDefault(); } catch { /* best-effort */ } handler(e); },
    onpointercancel(e) { try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch { /* best-effort */ } },
    onclick(e) { try { e.preventDefault(); } catch { /* best-effort */ } handler(e); },
  };
}

export function cardKey(card) { return `${card?.suit || 'x'}-${card?.rank || '0'}`; }

export const CONTRACT_META = {
  king:     { icon: '\u{1F451}', title: 'King of Hearts', goal: 'Avoid taking K♥', score: '−75 / −150' },
  queens:   { icon: '\u{1F478}', title: 'Queens', goal: 'Avoid taking queens', score: '−25 each' },
  diamonds: { icon: '\u{1F48E}', title: 'Diamonds', goal: 'Avoid taking diamonds', score: '−10 each' },
  ltoosh:   { icon: '\u{1FAA4}', title: 'Ltoosh', goal: 'Avoid taking tricks', score: '−15/trick' },
  trix:     { icon: '\u{1F9E9}', title: 'Trix (Layout)', goal: 'Lay sequences from J', score: '+200→+50' },
};

export function renderCardStatic(app, card, opts = null) {
  const c = new Card(card.suit, card.rank); c.flip(true);
  const node = c.element; node.classList.add('trix-card');
  try {
    node.dataset.cardKey = cardKey(card);
    if (opts?.seat) node.dataset.seat = opts.seat;
    if (opts?.zone) node.dataset.zone = opts.zone;
    const a = app._anim;
    if (a && a.seat === opts?.seat && a.zone === opts?.zone && a.cardKey === cardKey(card)) node.classList.add('is-place-anim');
  } catch { /* best-effort */ }
  return node;
}

export function buildSetupScreen(app) {
  const rerender = () => { app._savePrefs(); app.render(app.store.getState()); };
  const mb = (m, label) => el('button', {
    class: 'trix-setup-btn' + (app._setupMode === m ? ' is-active' : ''),
    onclick: () => { app._setupMode = m; rerender(); },
  }, label);
  const db = (d, label) => el('button', {
    class: 'trix-setup-btn' + (app._setupDiff === d ? ' is-active' : ''),
    onclick: () => { app._setupDiff = d; rerender(); },
  }, label);
  const rb = (r, label) => el('button', {
    class: 'trix-setup-btn' + (app._setupRules === r ? ' is-active' : ''),
    onclick: () => { app._setupRules = r; rerender(); },
  }, label);
  const teamInfo = app._setupMode === 'partners'
    ? el('div', { class: 'trix-setup-teams' }, [
        el('div', { class: 'trix-setup-team' }, 'Team A: You + CatByte'),
        el('div', { class: 'trix-setup-team' }, 'Team B: Zbayder-man + Abu Yousif'),
      ])
    : el('div', { class: 'trix-setup-teams' }, [el('div', { class: 'trix-setup-team' }, '4 players, individual scores')]);

  return el('div', { class: 'trix-setup' }, [
    el('div', { class: 'trix-setup-title' }, '\u{1F0A1} TRIX'),
    el('div', { class: 'trix-setup-section' }, [
      el('div', { class: 'trix-setup-label' }, 'Mode'),
      el('div', { class: 'trix-setup-row' }, [mb('single', '\u{1F464} Single'), mb('partners', '\u{1F465} Partners')]),
    ]),
    teamInfo,
    el('div', { class: 'trix-setup-section' }, [
      el('div', { class: 'trix-setup-label' }, 'Difficulty'),
      el('div', { class: 'trix-setup-row' }, [db('easy', '\u{1F7E2} Easy'), db('moderate', '\u{1F7E1} Moderate'), db('hard', '\u{1F534} Hard')]),
    ]),
    el('div', { class: 'trix-setup-section' }, [
      el('div', { class: 'trix-setup-label' }, 'Ruleset'),
      el('div', { class: 'trix-setup-row' }, [rb('classic', 'Classic'), rb('jawaker2025', 'Jawaker 2025')]),
    ]),
    el('div', { class: 'trix-setup-actions' }, [
      el('button', {
        class: 'trix-setup-start',
        onclick: () => {
          app._scorePrefLocked = false;
          app._syncAdaptivePrefs({ force: true });
          app.dispatch({
            type: 'START_MATCH',
            mode: app._setupMode,
            difficulty: app._setupDiff,
            ruleProfile: app._setupRules,
          });
        },
      }, '▶ Start Game'),
      el('button', { class: 'trix-action-btn', onclick: () => app.close() }, 'Exit'),
    ]),
  ]);
}

export function buildHud(app, state) {
  const ownerName = state.kingdomOwner ? SEAT_NAMES[state.kingdomOwner] : '—';
  const cName = state.currentContract ? state.currentContract.name : (state.phase === 'KINGDOM_PICK_CONTRACT' ? 'Choose…' : '—');
  const turnName = state.turn ? SEAT_NAMES[state.turn] : '—';
  const diffIcon = state.difficulty === 'easy' ? '\u{1F7E2}' : state.difficulty === 'hard' ? '\u{1F534}' : '\u{1F7E1}';
  const profile = state.ruleProfile === 'jawaker2025' ? 'Jawaker 2025' : 'Classic';

  const r1 = [
    el('div', { class: 'trix-chip is-strong' }, `K${state.kingdomNumber}/4`),
    el('div', { class: 'trix-chip' }, ownerName),
    el('div', { class: 'trix-chip' }, diffIcon),
    el('div', { class: 'trix-chip' }, profile),
  ];
  if (state.mode === 'partners') r1.push(el('div', { class: 'trix-chip is-partner' }, '\u{1F465}'));

  const r2 = [
    el('div', { class: 'trix-chip' }, cName),
    el('div', { class: 'trix-chip trix-chip-turn' }, `Turn: ${turnName}`),
  ];
  if (app._statusText) r2.push(el('div', { class: 'trix-chip trix-chip-status' }, app._statusText));

  const acts = el('div', { class: 'trix-actions' }, [
    el('button', { class: 'trix-action-btn', onclick: () => app._toggleScoreDensity() }, app._scoreCompact ? 'View: Full' : 'View: Compact'),
    el('button', { class: 'trix-action-btn', onclick: () => { app._modal = 'scoresheet'; app.render(app.store.getState()); } }, 'Score'),
    el('button', { class: 'trix-action-btn', onclick: () => { app._modal = 'rules'; app.render(app.store.getState()); } }, 'Rules'),
    el('button', { class: 'trix-action-btn', onclick: () => app.close() }, 'Exit'),
    el('button', { class: 'trix-action-btn is-danger', onclick: () => app.dispatch({ type: 'RESET_MATCH' }) }, 'Reset'),
  ]);

  return el('div', { class: 'trix-hud' }, [
    el('div', { class: 'trix-hud-row trix-hud-row-1' }, r1),
    el('div', { class: 'trix-hud-row trix-hud-row-2' }, r2),
    acts,
  ]);
}

export function buildContractBlurb(app, state) {
  const cid = state.currentContract?.id;
  if (!cid) return el('div', { class: 'trix-subhint' }, 'Waiting for game selection…');
  const m = app._contractHint(cid, state);
  return el('div', { class: 'trix-subhint' }, `${m.icon} ${m.goal}  •  ${m.score}`);
}

export function buildScoreStrip(app, state) {
  const compact = !!app._scoreCompact;

  if (state.mode === 'partners') {
    if (compact) {
      const makeCompactTeam = (id, label) => {
        const total = state.teamScores?.[id] ?? 0;
        const turnHere = TEAMS[id]?.includes(state.turn);
        return el('div', { class: 'trix-scoreitem is-team is-compact' + (turnHere ? ' is-turn' : '') + (id === 'A' ? ' is-you' : '') }, [
          el('span', { class: 'trix-scoreitem-name' }, label),
          el('span', { class: 'trix-scoreitem-score' }, String(total)),
        ]);
      };
      return el('div', { class: 'trix-scorestrip is-compact' }, [
        makeCompactTeam('A', 'Us'),
        makeCompactTeam('B', 'Them'),
        el('div', { class: 'trix-scoreitem is-compact is-meta' }, [
          el('span', { class: 'trix-scoreitem-name' }, 'You'),
          el('span', { class: 'trix-scoreitem-score' }, String(state.scores?.south ?? 0)),
          el('span', { class: 'trix-scoreitem-cards' }, `${state.hands?.south?.length ?? 0} cards`),
        ]),
      ]);
    }

    const ti = (id) => {
      const seats = TEAMS[id];
      const total = state.teamScores?.[id] ?? 0;
      const names = TEAM_NAMES[id] || seats.map(s => SEAT_NAMES[s]).join('+');
      const ht = seats.includes(state.turn);
      return el('div', { class: 'trix-scoreitem is-team' + (ht ? ' is-turn' : '') + (id === 'A' ? ' is-you' : '') }, [
        el('span', { class: 'trix-scoreitem-name' }, `${id}: ${names}`),
        el('span', { class: 'trix-scoreitem-score' }, String(total)),
      ]);
    };
    return el('div', { class: 'trix-scorestrip' + (compact ? ' is-compact' : '') }, [ti('A'), ti('B')]);
  }

  const item = (seat) => el('div', {
    class: 'trix-scoreitem' + (seat === 'south' ? ' is-you' : '') + (state.turn === seat ? ' is-turn' : ''),
  }, [
    el('span', { class: 'trix-scoreitem-name' }, SEAT_NAMES[seat]),
    el('span', { class: 'trix-scoreitem-score' }, String(state.scores?.[seat] ?? 0)),
    compact ? null : el('span', { class: 'trix-scoreitem-cards' }, `(${state.hands?.[seat]?.length ?? 0})`),
  ]);
  return el('div', { class: 'trix-scorestrip' + (compact ? ' is-compact' : '') }, SEATS.map(item));
}

export function buildRevealed2sBadge(app, state) {
  if (state.mode !== 'partners' || !state.revealed2s) return null;
  const items = [];
  for (const seat of SEATS) {
    const twos = state.revealed2s[seat];
    if (!twos?.length) continue;
    items.push(el('span', { class: 'trix-r2-item' }, `${SEAT_NAMES[seat]}: ${twos.map(c => '2' + app._suitSymbol(c.suit)).join(' ')}`));
  }
  if (!items.length) return null;
  return el('div', { class: 'trix-revealed2s' }, [el('span', { class: 'trix-r2-label' }, '\u{1F0CF} 2s: '), ...items]);
}

export function buildContractPickerBar(app, state) {
  if (state.phase !== 'KINGDOM_PICK_CONTRACT' || state.kingdomOwner !== 'south') return null;
  const owner = state.kingdomOwner;
  const rem = new Set(state.contractsRemaining[owner] || []);
  const btn = (c) => {
    const en = rem.has(c.id);
    const m = app._contractHint(c.id, state);
    const props = tapGuard(() => { app.dispatch({ type: 'PICK_CONTRACT', seat: owner, contractId: c.id }); });
    return el('button', { class: 'trix-contract-btn' + (en ? '' : ' is-disabled'), disabled: !en, ...props }, [
      el('div', { class: 'trix-contract-btn-icon' }, m.icon),
      el('div', { class: 'trix-contract-btn-title' }, m.title),
    ]);
  };
  return el('div', { class: 'trix-contract-bar' }, [
    el('div', { class: 'trix-contract-bar-title' }, 'Choose a game'),
    el('div', { class: 'trix-contract-bar-row' }, CONTRACTS.map(btn)),
  ]);
}

export function buildCenterTable(app, state) {
  const area = el('div', { class: 'trix-table' });

  if (state.phase === 'TRICK_PLAY' || (app._trickHold && Date.now() < (app._trickHold.until || 0))) {
    const at = Array.isArray(state.trick) ? state.trick : [];
    const ha = (app._trickHold && Date.now() < (app._trickHold.until || 0) && Array.isArray(app._trickHold.trick));
    const ht = ha ? app._trickHold.trick : [];
    const show = at.length ? at : ht;
    const ws = ha ? app._trickHold.winner : null;
    const slots = ['north', 'east', 'south', 'west'].map(seat => {
      const t = show.find(x => x.seat === seat);
      return el('div', { class: 'trix-slot trix-slot-' + seat }, [
        el('div', { class: 'trix-seat-banner' + (state.turn === seat ? ' is-turn' : '') + (ws === seat ? ' is-winner' : '') }, SEAT_NAMES[seat]),
        el('div', { class: 'trix-slot-card' }, [
          t ? renderCardStatic(app, t.card, { seat, zone: 'trick' }) : el('div', { class: 'trix-slot-empty' }, ''),
        ]),
      ]);
    });
    area.appendChild(el('div', { class: 'trix-trick-grid' }, slots));
    return area;
  }

  if (state.phase === 'TRIX_LAYOUT_PLAY') {
    area.appendChild(buildLayoutTable(app, state));
    const r2 = buildRevealed2sBadge(app, state);
    if (r2) area.appendChild(r2);
    return area;
  }

  if (state.phase === 'GAME_END') {
    area.appendChild(buildGameEndView(app, state));
    return area;
  }

  area.appendChild(el('div', { class: 'trix-placeholder' }, 'Waiting…'));
  return area;
}

function buildGameEndView(app, state) {
  const lines = [];
  if (state.mode === 'partners') {
    const a = state.teamScores?.A ?? 0, b = state.teamScores?.B ?? 0;
    const winner = a > b ? 'Team A' : b > a ? 'Team B' : 'Tie';
    lines.push(el('div', { class: 'trix-end-title' }, `\u{1F3C6} ${winner} wins!`));
    lines.push(el('div', { class: 'trix-end-line' }, `Team A: ${a} | Team B: ${b}`));
  } else {
    const sorted = SEATS.slice().sort((a, b) => (state.scores[b] || 0) - (state.scores[a] || 0));
    lines.push(el('div', { class: 'trix-end-title' }, `\u{1F3C6} ${SEAT_NAMES[sorted[0]]} wins!`));
    for (const s of sorted) lines.push(el('div', { class: 'trix-end-line' }, `${SEAT_NAMES[s]}: ${state.scores[s]}`));
  }
  lines.push(el('button', { class: 'trix-setup-start', onclick: () => app.dispatch({ type: 'RESET_MATCH' }) }, 'New Game'));
  return el('div', { class: 'trix-end' }, lines);
}

function buildLayoutTable(app, state) {
  const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
  const row = (suit) => {
    const st = state.layoutBySuit?.[suit] || { started: false, low: 11, high: 11 };
    const started = st.started === true;
    const lo = started && st.low > 2 ? st.low - 1 : (started ? null : 11);
    const hi = started ? ((st.high === 13) ? 1 : (st.high === 1 ? null : st.high + 1)) : 11;
    const cnt = started ? layoutCountForSuit(st) : 0;
    const prog = Math.min(100, Math.round((cnt / 13) * 100));
    return el('div', { class: 'trix-layout-compact-row' }, [
      el('div', { class: 'trix-layout-compact-suit ' + suit }, [el('div', { class: 'trix-layout-suit-icon' }, app._suitSymbol(suit))]),
      el('div', { class: 'trix-layout-compact-info' }, [
        !started ? el('div', { class: 'trix-layout-compact-next' }, 'J to start')
          : el('div', { class: 'trix-layout-compact-next' }, `${lo ? app._rankLabel(lo) : '—'} / ${hi ? app._rankLabel(hi) : '—'}`),
        el('div', { class: 'trix-layout-compact-bar' }, [el('div', { class: 'trix-layout-compact-barfill', style: `width:${prog}%` }, '')]),
      ]),
    ]);
  };
  return el('div', { class: 'trix-layout-compact' }, [el('div', { class: 'trix-layout-title' }, 'Trix Layout'), ...suits.map(row)]);
}

function layoutCountForSuit(st) {
  if (!st?.started) return 0;
  const down = Math.max(0, 11 - (st.low ?? 11));
  const up = st.high === 1 ? 3 : Math.max(0, (st.high ?? 11) - 11);
  return 1 + down + up;
}

export function buildHandView(app, state) {
  const seat = 'south';
  const hand = state.hands[seat] || [];
  const trickArr = Array.isArray(state.trick) ? state.trick : [];
  const ledSuit = trickArr[0]?.card?.suit || null;
  const layoutLegal = state.phase === 'TRIX_LAYOUT_PLAY'
    ? new Set(legalLayoutPlays(hand, state.layoutBySuit).map((c) => cardKey(c)))
    : new Set();

  const canPlay = (card) => {
    if (app._trickHold && Date.now() < (app._trickHold.until || 0)) return false;
    if (state.phase === 'TRICK_PLAY' && state.turn === seat) {
      const hasLed = ledSuit && hand.some(c => c.suit === ledSuit);
      if (!ledSuit) return true;
      return hasLed ? (card.suit === ledSuit) : true;
    }
    if (state.phase === 'TRIX_LAYOUT_PLAY' && state.turn === seat) return layoutLegal.has(cardKey(card));
    return false;
  };

  const cardBtn = (card) => {
    const en = canPlay(card);
    const p = tapGuard(() => {
      if (!en) return;
      if (state.phase === 'TRICK_PLAY') app.dispatch({ type: 'PLAY_CARD', seat, card });
      else if (state.phase === 'TRIX_LAYOUT_PLAY') app.dispatch({ type: 'LAYOUT_PLAY', seat, card });
    });
    return el('button', { class: 'trix-hand-card' + (en ? '' : ' is-disabled'), disabled: !en, ...p }, [renderCardStatic(app, card)]);
  };

  const hasLM = layoutLegal.size > 0;
  const children = [
    el('div', { class: 'trix-hand-title' }, 'Your hand'),
    el('div', { class: 'trix-hand-row' }, hand.map(cardBtn)),
  ];
  if (state.phase === 'TRIX_LAYOUT_PLAY') {
    children.push(el('button', {
      class: 'trix-pass',
      onclick: () => app.dispatch({ type: 'LAYOUT_PASS', seat }),
      disabled: !(state.phase === 'TRIX_LAYOUT_PLAY' && state.turn === seat && !hasLM),
    }, 'Pass'));
  }
  return el('div', { class: 'trix-hand' }, children);
}

export function buildScoresheetModal(app, state) {
  if (app._modal !== 'scoresheet') return null;
  const close = () => { app._modal = null; app.render(app.store.getState()); };
  const seats = ['south', 'east', 'north', 'west'];
  const log = Array.isArray(state.dealLog) ? state.dealLog : [];
  const lookup = new Map();
  for (const e of log) lookup.set(`${e.kingdomNumber}:${e.contractId}`, e);
  const fmt = (n) => { const v = Number(n || 0); if (!v) return '—'; return v > 0 ? `+${v}` : `${v}`; };

  const dealRow = (label, contractId, kn) => {
    const e = lookup.get(`${kn}:${contractId}`) || null;
    const d = e?.deltas || {};
    const cell = (s) => el('div', { class: 'trix-sheet-cell' + ((d[s] || 0) > 0 ? ' is-pos' : (d[s] || 0) < 0 ? ' is-neg' : '') }, fmt(d[s]));
    return el('div', { class: 'trix-sheet-grid trix-sheet-row' }, [
      el('div', { class: 'trix-sheet-cell is-label' }, label), cell('south'), cell('east'), cell('north'), cell('west'),
    ]);
  };

  const colHead = el('div', { class: 'trix-sheet-grid trix-sheet-head' }, [
    el('div', { class: 'trix-sheet-cell is-label' }, ''),
    ...seats.map(s => el('div', { class: 'trix-sheet-cell is-head' }, SEAT_NAMES[s])),
  ]);

  const kb = (k) => el('div', { class: 'trix-kingdom-block' }, [
    el('div', { class: 'trix-kingdom-block-title' }, `Kingdom ${k}`),
    dealRow('King♥', 'king', k), dealRow('Queens', 'queens', k), dealRow('Dia', 'diamonds', k),
    dealRow('Ltoosh', 'ltoosh', k), dealRow('Trix', 'trix', k),
  ]);

  const playerTotals = el('div', { class: 'trix-sheet-grid trix-sheet-total' }, [
    el('div', { class: 'trix-sheet-cell is-label' }, 'Player'),
    ...seats.map(s => el('div', { class: 'trix-sheet-cell is-head' }, String(state.scores[s] ?? 0))),
  ]);

  const sections = [
    el('div', { class: 'trix-modal-head' }, [
      el('div', { class: 'trix-modal-title2' }, 'Scoresheet'),
      el('button', { class: 'trix-modal-x', onclick: close }, '✕'),
    ]),
    colHead, kb(1), kb(2), kb(3), kb(4), playerTotals,
  ];

  if (state.mode === 'partners') {
    const tA = state.teamScores?.A ?? 0, tB = state.teamScores?.B ?? 0;
    sections.push(el('div', { class: 'trix-sheet-teamrow' }, [
      el('div', { class: 'trix-sheet-teamcell' + (tA >= tB ? ' is-lead' : '') }, `Team A: ${tA}`),
      el('div', { class: 'trix-sheet-teamcell' + (tB > tA ? ' is-lead' : '') }, `Team B: ${tB}`),
    ]));
  }

  return el('div', { class: 'trix-modal', onclick: (e) => { if (e.target?.classList?.contains('trix-modal')) close(); } }, [
    el('div', { class: 'trix-modal-panel trix-sheet' }, sections),
  ]);
}

export function buildRulesModal(app, state) {
  if (app._modal !== 'rules') return null;
  const close = () => { app._modal = null; app.render(app.store.getState()); };
  const cid = state.currentContract?.id;
  const meta = cid ? app._contractHint(cid, state) : null;
  const profile = state.ruleProfile || 'classic';
  const rules = {
    king: profile === 'jawaker2025'
      ? ['Follow suit.', 'Taking K♥ = −75.', 'If doubled, taker gets −150 and doubler gets +75 unless self-captured.', 'Doubling is closed in Jawaker 2025 profile.']
      : ['Follow suit.', 'Taking K♥ = −75.', 'Tadbeel: taker gets −150 and doubler gets +75 unless self-captured.'],
    queens: profile === 'jawaker2025'
      ? ['Each queen = −25.', 'Doubled queen = −50 to taker and +25 to doubler unless self-captured.', 'Follow suit; highest wins.']
      : ['Each queen = −25.', 'Follow suit; highest wins.'],
    diamonds: ['Each diamond = −10.', 'Follow suit; highest wins.'],
    ltoosh: ['Each trick = −15.', 'Follow suit; highest wins.'],
    trix: ['Play J to start suits.', 'Build down to 2, up to A.', '1st: +200, 2nd: +150, 3rd: +100, 4th: +50.'],
  };
  let body;
  if (!cid) {
    body = el('div', { class: 'trix-rules' }, 'No game selected yet.');
  } else {
    const lines = (rules[cid] || []).map(l => el('li', {}, l));
    if (state.mode === 'partners' && cid === 'trix') lines.push(el('li', { class: 'trix-rules-partner' }, 'Partners: After 1st round, all 2s revealed.'));
    body = el('div', { class: 'trix-rules' }, [
      el('div', { class: 'trix-rules-title' }, `${meta.icon} ${meta.title}`),
      el('ul', {}, lines),
    ]);
  }
  return el('div', { class: 'trix-modal', onclick: (e) => { if (e.target?.classList?.contains('trix-modal')) close(); } }, [
    el('div', { class: 'trix-modal-panel trix-rules-panel' }, [
      el('div', { class: 'trix-modal-head' }, [
        el('div', { class: 'trix-modal-title2' }, 'Rules'),
        el('button', { class: 'trix-modal-x', onclick: close }, '✕'),
      ]),
      el('div', { class: 'trix-rules-profile' }, `Profile: ${profile === 'jawaker2025' ? 'Jawaker 2025' : 'Classic'}`),
      body,
    ]),
  ]);
}

export function buildDoublingModal(app, state) {
  if (state.phase !== 'DOUBLING_DECISION') return null;
  const opts = Array.isArray(state.doubling?.options) ? state.doubling.options : [];
  const chosen = new Set(opts.map((o) => o.key));
  const submit = (withDoubles) => app.dispatch({
    type: 'SET_DOUBLES',
    doubledKeys: withDoubles ? Array.from(chosen) : [],
  });
  const title = state.currentContract?.id === 'queens' ? 'Queens Doubling' : 'Tadbeel (Double)';
  const subtitle = opts.length
    ? `Your cards: ${opts.map((o) => app._doubleCardLabel(o.key)).join(', ')}`
    : 'No doubling options';
  const info = state.doubling?.closed
    ? 'Closed doubling enabled: selection is private.'
    : 'Open doubling: selection is visible in scoring.';

  return el('div', { class: 'trix-modal' }, [
    el('div', { class: 'trix-modal-panel trix-tadbeel' }, [
      el('div', { class: 'trix-modal-title2' }, title),
      el('div', { class: 'trix-tadbeel-sub' }, subtitle),
      el('div', { class: 'trix-tadbeel-sub' }, info),
      el('div', { class: 'trix-tadbeel-actions' }, [
        el('button', { class: 'trix-tadbeel-btn is-primary', onclick: () => submit(true) }, 'Double'),
        el('button', { class: 'trix-tadbeel-btn', onclick: () => submit(false) }, 'Continue'),
      ]),
    ]),
  ]);
}
