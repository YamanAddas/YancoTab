/**
 * tarneebBanter.js — Levantine-flavored AI banter pack for Tarneeb.
 *
 * Lines are short, in-character utterances tied to game events. The
 * dispatcher (table/banter.js) picks one per trigger × seat with
 * non-repeat rules. 'south' (the human) never speaks — we don't put
 * words in the user's mouth. 'system' is reserved for shell messages.
 *
 * Seat names map to mock characters:
 *   north  — nadia.k  (opponent)
 *   east   — rashid    (opponent)
 *   west   — karim     (partner)
 *
 * Lines mix English + transliterated Levantine phrasing on purpose —
 * matches the YancoTab audience and the mock's tone ("walla good luck",
 * "yallah").
 */

export const TARNEEB_BANTER = {
  match_start: {
    north: ['yallah, let\'s see what you got', 'fresh deck, fresh blood', 'mashallah, a brave one'],
    east:  ['🔥', 'this hand is mine', 'i feel lucky tonight', '👀'],
    west:  ['together we ride 🙏', 'i got your back, partner', 'play smart, ya zalameh'],
  },
  deal_start: {
    north: ['hmm…', 'tough hand', 'we\'ll see'],
    east:  ['i can work with this', 'meh', 'allah kareem'],
    west:  ['take your time', 'count your spades', '🤝'],
  },
  bid_placed: {
    north: ['confident, are we?', 'ouf', 'big number'],
    east:  ['👏', 'aywa', 'put your money where your mouth is'],
    west:  ['nice', 'i trust you', 'i\'ll cover'],
  },
  bid_total: {
    north: ['let\'s see the trump', 'walla good luck', 'we got this'],
    east:  ['pfft, you\'ll need it', 'this should be fun', 'ride it to the end'],
    west:  ['inshallah we make it', 'play your suit', 'i\'m here'],
  },
  trick_won: {
    north: ['hm.', 'lucky one', 'next one\'s mine'],
    east:  ['😅', 'didn\'t see that coming', 'ok ok'],
    west:  ['👏 nice play', 'beautiful', 'just like that', '👌'],
  },
  slam: {
    north: ['…', 'that\'s rough', 'we\'ll get the next round'],
    east:  ['no way', 'how', 'mashallah'],
    west:  ['🔥🔥🔥', 'YALLA', 'we\'re unstoppable', '👏👏👏'],
  },
  bomb: {
    north: ['oof', 'too many points lost', 'painful'],
    east:  ['😬', 'i told you so', 'risky bid'],
    west:  ['it\'s ok partner', 'next round', 'shake it off'],
  },
  round_end: {
    north: ['scoreboard time', 'good round', 'okay, reset'],
    east:  ['i need a coffee', 'next deal!', 'yallah'],
    west:  ['breathe', 'we got this', 'half time'],
  },
  game_end: {
    north: ['yislamo, well played', 'good game', 'rematch?'],
    east:  ['gg', 'one more?', 'i\'ll get you next time'],
    west:  ['mabrouk 🏆', 'we did it', 'yalla again'],
  },
  emote_received: {
    north: ['👀', '😏', 'noted'],
    east:  ['😅', '🔥', 'bold'],
    west:  ['🤝', '👏', 'mhm'],
  },
};

export default TARNEEB_BANTER;
