/**
 * banter.js — AI flavor-line dispatcher for the Table salon.
 *
 * Replaces the mock's "Salon chat" with one-way pre-baked Levantine
 * flavor lines. AI seats speak in response to game events; the user
 * never types. The dispatcher is the SUBSCRIBER side — it listens to
 * reducer events the host app already emits, picks a line from the
 * per-game banter pack, and writes to a ring buffer the right rail
 * renders.
 *
 * Why this lives in a generic module (not per-game):
 *   • The pick algorithm (non-repeat, cooldown, probability gate) is
 *     game-agnostic — Tarneeb and Trix both want a Levantine seat to
 *     react when something happens.
 *   • Per-game banter PACKS are separate (tarneebBanter.js, trixBanter.js)
 *     and provide the data; this module is just the engine.
 */

const FEED_CAP = 5;
const RECENT_PER_KEY = 3;
const COOLDOWN_MS = 1500;
const EMOTE_ECHO_PROB = 0.40;
const EMOTE_ECHO_DELAY_MIN = 1000;
const EMOTE_ECHO_DELAY_MAX = 3000;

// Default fire-probability per trigger. Tuned to feel chatty-but-not-spammy.
const TRIGGER_PROB = {
  match_start:      1.00,
  deal_start:       0.55,
  bid_placed:       0.35,
  bid_total:        0.85,
  contract_picked:  0.90,
  trick_won:        0.30,
  slam:             1.00,
  bomb:             0.95,
  round_end:        0.65,
  game_end:         1.00,
  emote_received:   1.00, // gated by EMOTE_ECHO_PROB at scheduling time
};

export class BanterDispatcher {
  /**
   * @param {object} opts
   *   pack          per-game banter pack {trigger: {seat: [lines...]}}
   *   onUpdate      callback (entries) => void; fired when feed changes
   *   getName       (seat) => display name (e.g. 'karim')
   *   roleOf        (seat) => 'you' | 'partner' | 'opponent'
   *                 used for UI accent color in the feed
   *   random        () => [0,1) — injected for tests, defaults to Math.random
   *   now           () => ms — injected for tests, defaults to Date.now
   */
  constructor({ pack = {}, onUpdate, getName, roleOf, random, now } = {}) {
    this.pack = pack;
    this.onUpdate = typeof onUpdate === 'function' ? onUpdate : () => {};
    this.getName = typeof getName === 'function' ? getName : (s) => String(s);
    this.roleOf = typeof roleOf === 'function' ? roleOf : () => 'opponent';
    this.random = typeof random === 'function' ? random : Math.random;
    this.now = typeof now === 'function' ? now : () => Date.now();

    this.feed = [];          // [{ id, seat, name, role, text }]
    this.recent = new Map(); // 'trigger:seat' -> [last N lines spoken]
    this.lastSpokeAt = new Map(); // seat -> ts of last line
    this._nextId = 1;
    this._echoTimers = [];
    this._destroyed = false;
  }

  /** Replace the pack (e.g. when switching games via tabs). Resets memory. */
  setPack(pack) {
    this.pack = pack || {};
    this.recent.clear();
    this.lastSpokeAt.clear();
  }

  /** Process an array of reducer events. Multiple events may produce 0–N lines. */
  handleEvents(events) {
    if (this._destroyed || !Array.isArray(events) || events.length === 0) return;
    let changed = false;
    for (const ev of events) {
      const triggered = this._handleOne(ev);
      if (triggered) changed = true;
    }
    if (changed) this.onUpdate(this.feed.slice());
  }

  /** User tapped an emote. Push it to the feed as 'you' and maybe echo. */
  sendEmote(emote) {
    if (this._destroyed || !emote) return;
    this._push({
      seat: 'south',
      role: 'you',
      name: 'you',
      text: emote,
    });
    this.onUpdate(this.feed.slice());

    // Schedule a probabilistic echo from a random AI seat.
    if (this.random() < EMOTE_ECHO_PROB) {
      const delay = EMOTE_ECHO_DELAY_MIN +
        this.random() * (EMOTE_ECHO_DELAY_MAX - EMOTE_ECHO_DELAY_MIN);
      const t = setTimeout(() => {
        if (this._destroyed) return;
        this._echoEmote(emote);
      }, delay);
      this._echoTimers.push(t);
    }
  }

  /** Manual push (e.g. host app injecting a system line). */
  pushSystem(text) {
    if (this._destroyed || !text) return;
    this._push({ seat: 'system', role: 'opponent', name: 'system', text: String(text) });
    this.onUpdate(this.feed.slice());
  }

  /** Stop scheduled timers, drop refs. */
  destroy() {
    this._destroyed = true;
    for (const t of this._echoTimers) {
      try { clearTimeout(t); } catch {}
    }
    this._echoTimers = [];
    this.feed = [];
    this.recent.clear();
    this.lastSpokeAt.clear();
  }

  // ── Internals ──

  _handleOne(ev) {
    const trigger = mapEventToTrigger(ev);
    if (!trigger) return false;

    const prob = TRIGGER_PROB[trigger] ?? 0.5;
    if (this.random() >= prob) return false;

    const seat = pickSeatForEvent(ev, trigger);
    if (!seat || seat === 'south') return false; // 'you' is silent

    const ts = this.now();
    const last = this.lastSpokeAt.get(seat);
    if (last != null && ts - last < COOLDOWN_MS) return false;

    const line = this._pickLine(trigger, seat, ev);
    if (!line) return false;

    this.lastSpokeAt.set(seat, ts);
    this._rememberLine(trigger, seat, line);
    this._push({
      seat,
      role: this.roleOf(seat),
      name: this.getName(seat),
      text: line,
    });
    return true;
  }

  _pickLine(trigger, seat, ev) {
    const bucket = this.pack?.[trigger];
    if (!bucket) return null;
    let candidates = bucket[seat];
    if (!Array.isArray(candidates)) candidates = bucket[this.roleOf(seat)];
    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    const recentKey = `${trigger}:${seat}`;
    const recent = this.recent.get(recentKey) || [];
    const fresh = candidates.filter((line) => !recent.includes(line));
    const pool = fresh.length > 0 ? fresh : candidates;

    let line = pool[Math.floor(this.random() * pool.length)];
    if (typeof line === 'function') {
      try { line = line(ev); } catch { return null; }
    }
    return typeof line === 'string' ? line : null;
  }

  _rememberLine(trigger, seat, line) {
    const key = `${trigger}:${seat}`;
    const arr = this.recent.get(key) || [];
    arr.push(line);
    while (arr.length > RECENT_PER_KEY) arr.shift();
    this.recent.set(key, arr);
  }

  _echoEmote(emote) {
    // Pick a non-you seat at random from the pack's known seats.
    const seats = Object.keys(this.pack?.emote_received || {});
    const candidates = seats.filter((s) => s !== 'south' && s !== 'you');
    if (candidates.length === 0) return;
    const seat = candidates[Math.floor(this.random() * candidates.length)];
    const last = this.lastSpokeAt.get(seat);
    if (last != null && this.now() - last < COOLDOWN_MS) return;

    const lines = this.pack?.emote_received?.[seat];
    if (!Array.isArray(lines) || lines.length === 0) {
      // Fallback: echo the same emote back.
      this._push({
        seat,
        role: this.roleOf(seat),
        name: this.getName(seat),
        text: emote,
      });
    } else {
      const line = lines[Math.floor(this.random() * lines.length)];
      this._push({
        seat,
        role: this.roleOf(seat),
        name: this.getName(seat),
        text: line,
      });
    }
    this.lastSpokeAt.set(seat, this.now());
    this.onUpdate(this.feed.slice());
  }

  _push(entry) {
    this.feed.push({ id: this._nextId++, ...entry });
    while (this.feed.length > FEED_CAP) this.feed.shift();
  }
}

// ── Pure helpers (exported for tests) ──

export function mapEventToTrigger(ev) {
  if (!ev || typeof ev !== 'object') return null;
  switch (ev.type) {
    case 'match:start':     return 'match_start';
    case 'round:start':     return 'deal_start';
    case 'bid:placed':      return 'bid_placed';
    case 'bid:total':       return 'bid_total';
    case 'contract:picked': return 'contract_picked';
    case 'trick:won':       return 'trick_won';
    case 'slam':            return 'slam';
    case 'bomb':            return 'bomb';
    case 'round:end':       return 'round_end';
    case 'game:end':        return 'game_end';
    default:                return null;
  }
}

/**
 * Choose which seat speaks for a given event. The reducer event
 * already names a seat for `bid:placed` / `bid:total` / `slam` etc.;
 * for round/game/match events we pick a deterministic-feeling default
 * (typically the seat whose action triggered the event, or partner if
 * none is named).
 */
export function pickSeatForEvent(ev, trigger) {
  if (!ev) return null;
  switch (trigger) {
    case 'bid_placed':      return ev.seat || null;
    case 'bid_total':       return ev.winner || null;
    case 'contract_picked': return ev.seat || null;
    case 'trick_won':       return ev.winner || null;
    case 'slam':            return ev.seat || null;
    case 'bomb':            return ev.seat || null;
    case 'deal_start':      return 'east';   // mid-table chatter
    case 'match_start':     return 'west';   // partner welcomes
    case 'round_end':       return 'north';  // opponent comments
    case 'game_end':        return ev.winnerSeat || 'west';
    default:                return null;
  }
}
