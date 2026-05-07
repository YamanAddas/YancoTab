/**
 * trixBanter.js — Levantine-flavored AI banter pack for Trix.
 *
 * Trix has 5 contracts per kingdom × 4 owners = 20 deals per match.
 * Triggers fire on contract pick, deal start, trick won (in trick
 * contracts), layout-out (in the trix contract), kingdom rotation,
 * and game end. 'south' (the user) is silent. Names match trixRules:
 *   north  — CatByte (your partner in partners mode)
 *   east   — Zbayder-man
 *   west   — Abu Yousif
 *
 * Lines are short, in-character, mix English with transliterated
 * Levantine — same tone as the Tarneeb pack so the salon feels
 * cohesive.
 */

export const TRIX_BANTER = {
  match_start: {
    north: ['fresh kingdoms — let\'s see who falls first', 'all 4 contracts each, no escape', 'mashallah, brave one'],
    east:  ['ya zalameh, this hand is mine', '🔥', 'i love trix more than my morning coffee'],
    west:  ['take the king, take everything', 'ahla w sahla', 'careful with those queens'],
  },
  deal_start: {
    north: ['hmm…', 'this contract is rough', 'no easy outs here'],
    east:  ['i can work with this', '😏', 'allah kareem'],
    west:  ['count your hearts', '🤔', 'pace yourself'],
  },
  contract_picked: {
    north: ['bold pick', 'walla, that\'s the worst one', 'yallah let\'s ride'],
    east:  ['👀', 'why did you pick that one', 'this hand is doomed'],
    west:  ['interesting choice', 'inshallah we survive', 'classic move'],
  },
  trick_won: {
    north: ['hm.', 'unfortunate', 'ouf'],
    east:  ['😅', 'that\'s on me', 'walla i didn\'t expect that'],
    west:  ['👏 good one', 'beautiful', 'just like that'],
  },
  round_end: {
    north: ['next contract!', 'breathe', 'count your damage'],
    east:  ['🤬', 'i need water', 'allah kareem'],
    west:  ['scoreboard time', 'half time', 'shake it off'],
  },
  game_end: {
    north: ['yislamo, well played', 'good game', 'rematch?'],
    east:  ['gg', 'one more round?', 'next match is mine'],
    west:  ['mabrouk 🏆', 'salute', 'yallah again'],
  },
  emote_received: {
    north: ['👀', '😏', 'noted'],
    east:  ['😅', '🔥', 'bold'],
    west:  ['🤝', '👏', 'mhm'],
  },
};

export default TRIX_BANTER;
