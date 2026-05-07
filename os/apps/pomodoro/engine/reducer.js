/**
 * pomodoro/engine/reducer.js — pure transition function.
 *
 *   apply(state, action, preset, now) → { state, events }
 *
 * Reducer never reads the clock itself — `now` is always a parameter.
 * `events` is an array of side-effect intents the view should fire:
 *   { type: 'toast',    message, kind }
 *   { type: 'activity', label }
 *   { type: 'phase',    from, to, sessionIndex }
 *   { type: 'sessionLogged', entry }
 *
 * Action types:
 *   START                        — idle → focus, anchor cycleStartedAt
 *   PAUSE                        — capture remaining
 *   RESUME                       — re-anchor startedAt
 *   TICK                         — advance phase if remaining ≤ 0; rollover dayKey
 *   EXTEND { ms }                — push the deadline out by N ms (focus only)
 *   SKIP_BREAK                   — break|longBreak → next focus or idle
 *   END_CYCLE                    — any → idle
 *   CHANGE_PRESET { presetId }   — only allowed when idle
 *   TOGGLE_SKY_OVERRIDE          — manual day/night preview
 *   CLEAR_SKY_OVERRIDE
 */

import { phaseDurationMs, todayKey } from './state.js';

function clone(s) { return { ...s }; }

function pushEvent(events, ev) { events.push(ev); }

/**
 * Roll over the day counter if the calendar day changed since dayKey.
 * Pure; returns the (possibly new) state.
 */
function maybeRollDay(state, now) {
  const tk = todayKey(now);
  if (tk === state.dayKey) return state;
  return { ...state, dayKey: tk, sessionsToday: 0 };
}

/**
 * Advance focus → break / longBreak / idle and return events.
 */
function advanceFromFocus(state, preset, now, events) {
  const sessionIndex = state.sessionIndex + 1;
  const isLast = sessionIndex >= preset.sessions;
  const sessionsToday = (state.sessionsToday || 0) + 1;

  pushEvent(events, {
    type: 'sessionLogged',
    entry: {
      kind: 'focus',
      presetId: state.presetId,
      startedAt: state.startedAt,
      endedAt: now,
      durationMs: preset.focusMs,
      completed: true,
    },
  });
  pushEvent(events, {
    type: 'activity',
    label: `Pomodoro · session ${sessionIndex} complete`,
  });

  if (isLast) {
    pushEvent(events, { type: 'toast', message: `Cycle complete · long break ${Math.round(preset.longBreakMs / 60000)} min`, kind: 'success' });
    pushEvent(events, { type: 'phase', from: 'focus', to: 'longBreak', sessionIndex });
    return {
      ...state,
      phase: 'longBreak',
      sessionIndex,
      sessionsToday,
      startedAt: now,
      paused: false,
      pausedRemainingMs: 0,
      manualSkyOverride: null,
    };
  }

  pushEvent(events, { type: 'toast', message: `Focus complete · take a ${Math.round(preset.breakMs / 60000)} min break`, kind: 'success' });
  pushEvent(events, { type: 'phase', from: 'focus', to: 'break', sessionIndex });
  return {
    ...state,
    phase: 'break',
    sessionIndex,
    sessionsToday,
    startedAt: now,
    paused: false,
    pausedRemainingMs: 0,
    manualSkyOverride: null,
  };
}

/**
 * Advance break → next focus, or longBreak → idle.
 */
function advanceFromBreak(state, preset, now, events) {
  if (state.phase === 'longBreak') {
    pushEvent(events, { type: 'toast', message: 'Cycle complete · ready when you are', kind: 'info' });
    pushEvent(events, { type: 'phase', from: 'longBreak', to: 'idle', sessionIndex: 0 });
    return {
      ...state,
      phase: 'idle',
      sessionIndex: 0,
      startedAt: null,
      cycleStartedAt: null,
      paused: false,
      pausedRemainingMs: 0,
      manualSkyOverride: null,
    };
  }
  // break → next focus
  pushEvent(events, { type: 'toast', message: 'Break over · back to focus', kind: 'info' });
  pushEvent(events, { type: 'phase', from: 'break', to: 'focus', sessionIndex: state.sessionIndex });
  return {
    ...state,
    phase: 'focus',
    startedAt: now,
    paused: false,
    pausedRemainingMs: 0,
    manualSkyOverride: null,
  };
}

export function apply(state, action, preset, now = Date.now()) {
  const events = [];
  if (!state || !action || !action.type || !preset) {
    return { state: state || null, events };
  }

  let s = maybeRollDay(state, now);

  switch (action.type) {
    case 'START': {
      if (s.phase !== 'idle') return { state: s, events };
      s = {
        ...s,
        phase: 'focus',
        sessionIndex: 0,
        startedAt: now,
        cycleStartedAt: now,
        paused: false,
        pausedRemainingMs: 0,
        manualSkyOverride: null,
      };
      pushEvent(events, { type: 'activity', label: `Pomodoro · cycle started · ${preset.name}` });
      pushEvent(events, { type: 'phase', from: 'idle', to: 'focus', sessionIndex: 0 });
      return { state: s, events };
    }

    case 'PAUSE': {
      if (s.phase === 'idle' || s.paused) return { state: s, events };
      const dur = phaseDurationMs(s.phase, preset);
      const elapsed = Number.isFinite(s.startedAt) ? Math.max(0, now - s.startedAt) : 0;
      const rem = Math.max(0, dur - elapsed);
      return {
        state: { ...s, paused: true, pausedRemainingMs: rem },
        events,
      };
    }

    case 'RESUME': {
      if (s.phase === 'idle' || !s.paused) return { state: s, events };
      const dur = phaseDurationMs(s.phase, preset);
      const newStartedAt = now - (dur - s.pausedRemainingMs);
      return {
        state: { ...s, paused: false, pausedRemainingMs: 0, startedAt: newStartedAt },
        events,
      };
    }

    case 'TICK': {
      if (s.phase === 'idle' || s.paused) return { state: s, events };
      const dur = phaseDurationMs(s.phase, preset);
      const elapsed = Number.isFinite(s.startedAt) ? now - s.startedAt : 0;
      if (elapsed < dur) return { state: s, events };
      // Phase expired → advance.
      if (s.phase === 'focus') return { state: advanceFromFocus(s, preset, now, events), events };
      return { state: advanceFromBreak(s, preset, now, events), events };
    }

    case 'EXTEND': {
      if (s.phase !== 'focus' || !Number.isFinite(action.ms) || action.ms <= 0) return { state: s, events };
      // Extension just pushes startedAt back; if paused, add to pausedRemaining.
      if (s.paused) {
        return { state: { ...s, pausedRemainingMs: s.pausedRemainingMs + action.ms }, events };
      }
      pushEvent(events, { type: 'toast', message: `Extended by ${Math.round(action.ms / 60000)} min`, kind: 'info' });
      return { state: { ...s, startedAt: s.startedAt + action.ms }, events };
    }

    case 'SKIP_BREAK': {
      if (s.phase !== 'break' && s.phase !== 'longBreak') return { state: s, events };
      // Log the unfinished break for history
      pushEvent(events, {
        type: 'sessionLogged',
        entry: {
          kind: s.phase,
          presetId: s.presetId,
          startedAt: s.startedAt,
          endedAt: now,
          durationMs: phaseDurationMs(s.phase, preset),
          completed: false,
        },
      });
      return { state: advanceFromBreak(s, preset, now, events), events };
    }

    case 'END_CYCLE': {
      if (s.phase === 'idle') return { state: s, events };
      // If we were mid-focus and the user ended early, log a partial.
      if (s.phase === 'focus' && Number.isFinite(s.startedAt)) {
        const elapsed = Math.max(0, now - s.startedAt);
        if (elapsed > 0) {
          pushEvent(events, {
            type: 'sessionLogged',
            entry: {
              kind: 'focus',
              presetId: s.presetId,
              startedAt: s.startedAt,
              endedAt: now,
              durationMs: elapsed,
              completed: false,
            },
          });
        }
      }
      pushEvent(events, { type: 'toast', message: 'Cycle ended', kind: 'info' });
      pushEvent(events, { type: 'phase', from: s.phase, to: 'idle', sessionIndex: 0 });
      return {
        state: {
          ...s,
          phase: 'idle',
          sessionIndex: 0,
          startedAt: null,
          cycleStartedAt: null,
          paused: false,
          pausedRemainingMs: 0,
          manualSkyOverride: null,
        },
        events,
      };
    }

    case 'CHANGE_PRESET': {
      if (s.phase !== 'idle') return { state: s, events };
      if (!action.presetId || typeof action.presetId !== 'string') return { state: s, events };
      if (action.presetId === s.presetId) return { state: s, events };
      return { state: { ...s, presetId: action.presetId }, events };
    }

    case 'TOGGLE_SKY_OVERRIDE': {
      // Cycles: null → 'night' → 'day' → null (handy for the "tap sky" behavior)
      const cur = s.manualSkyOverride;
      const next = cur === null ? 'night' : cur === 'night' ? 'day' : null;
      return { state: { ...s, manualSkyOverride: next }, events };
    }

    case 'CLEAR_SKY_OVERRIDE': {
      if (!s.manualSkyOverride) return { state: s, events };
      return { state: { ...s, manualSkyOverride: null }, events };
    }

    default:
      return { state: s, events };
  }
}
