/**
 * badges/badgeModel.js — what an app icon should advertise. Pure.
 *
 * Two badge kinds, chosen by what the user actually needs to know:
 *
 *   count — the number matters   → Todo ("3 things waiting")
 *   dot   — only the state matters → Pomodoro (running), Clock (armed)
 *
 * A count of alarms would be noise; that a *single* alarm is armed is the
 * whole message. Conversely a dot on Todo would hide the difference
 * between one task and thirty.
 *
 * This module is also the single definition of "how many open todos are
 * there" — StatusBar's activity pill reads the same function, so the pill
 * and the icon can never disagree. Two independent counters drifting apart
 * is exactly how the v1.1.1 TodoWidget bug happened.
 */

/** Cap beyond which a count renders as "99+" rather than overflowing the pill. */
export const COUNT_CAP = 99;

/**
 * Undone tasks across EVERY mission, not just the active one — the icon
 * speaks for the whole app, so hiding another list's work would be a lie.
 */
export function countOpenTodos(todoState) {
  if (!todoState || !Array.isArray(todoState.missions)) return 0;
  let n = 0;
  for (const m of todoState.missions) {
    if (!m || !Array.isArray(m.tasks)) continue;
    for (const t of m.tasks) if (t && !t.done) n++;
  }
  return n;
}

/** Alarms the user has actually armed. A disabled alarm is not pending. */
export function countActiveAlarms(clockState) {
  if (!clockState || !Array.isArray(clockState.alarms)) return 0;
  return clockState.alarms.filter((a) => a && a.enabled).length;
}

/**
 * True only while a session is actively counting down. A paused timer is
 * not "running" — a dot that pulses through a pause would be lying about
 * whether time is passing.
 */
export function isTimerRunning(pomodoroState) {
  if (!pomodoroState || typeof pomodoroState !== 'object') return false;
  return pomodoroState.phase !== 'idle'
    && pomodoroState.phase !== undefined
    && !pomodoroState.paused;
}

/** Count → pill text. Zero yields '' so callers can treat it as "no badge". */
export function formatBadgeCount(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n > COUNT_CAP ? `${COUNT_CAP}+` : String(Math.floor(n));
}

/**
 * computeBadges({ todo, clock, pomodoro }) → { [appId]: descriptor }
 *
 * Only apps that should currently show something appear in the result, so
 * the caller can treat "absent" as "clear the badge" without special cases.
 *
 * descriptor: { kind: 'count', text } | { kind: 'dot', tone }
 */
export function computeBadges({ todo, clock, pomodoro } = {}) {
  const out = {};

  const todoText = formatBadgeCount(countOpenTodos(todo));
  if (todoText) out.todo = { kind: 'count', text: todoText, tone: 'alert' };

  if (isTimerRunning(pomodoro)) out.pomodoro = { kind: 'dot', tone: 'active' };

  if (countActiveAlarms(clock) > 0) out.clock = { kind: 'dot', tone: 'warn' };

  return out;
}

/**
 * Stable string form of a descriptor, used to decide whether the DOM needs
 * touching at all. The badge painter re-runs on every grid mutation, so a
 * cheap equality check is what stops it rewriting nodes it just wrote (and
 * re-triggering its own MutationObserver).
 */
export function badgeSignature(descriptor) {
  if (!descriptor) return '';
  return descriptor.kind === 'count'
    ? `count:${descriptor.text}:${descriptor.tone || ''}`
    : `dot:${descriptor.tone || ''}`;
}
