/**
 * todo/intents.js — view-side action helpers.
 *
 * Pure mutation helpers operating on the v2 state shape. The shell
 * applies them, then persists + repaints. None of them mutate the
 * input — they always return a new state.
 */

import { newId, todayKey } from './engine/state.js';
import { bumpStreak } from './engine/streaks.js';

const PRIORITIES = ['low', 'normal', 'high'];

function clone(s) {
  // Deep-ish copy — missions array swap, then map missions, then map their tasks.
  return {
    ...s,
    missions: s.missions.map((m) => ({ ...m, tasks: m.tasks.map((t) => ({ ...t })) })),
  };
}

function findMission(state, missionId) {
  return state.missions.find((m) => m.id === missionId);
}

export function setActiveMission(state, missionId) {
  if (!findMission(state, missionId)) return state;
  return { ...state, activeMissionId: missionId };
}

export function addMission(state, { name, color = 'accent' }) {
  if (!name || !name.trim()) return state;
  const next = clone(state);
  const maxPos = next.missions.reduce((m, x) => Math.max(m, x.position), 0);
  const m = {
    id: newId('m'),
    name: name.trim().slice(0, 60),
    color,
    position: maxPos + 1000,
    tasks: [],
  };
  next.missions.push(m);
  next.activeMissionId = m.id;
  return next;
}

export function renameMission(state, missionId, name) {
  if (!name || !name.trim()) return state;
  const next = clone(state);
  const m = findMission(next, missionId);
  if (!m) return state;
  m.name = name.trim().slice(0, 60);
  return next;
}

export function recolorMission(state, missionId, color) {
  const next = clone(state);
  const m = findMission(next, missionId);
  if (!m) return state;
  m.color = color;
  return next;
}

export function deleteMission(state, missionId) {
  if (state.missions.length <= 1) return state;
  const next = {
    ...state,
    missions: state.missions.filter((m) => m.id !== missionId).map((m) => ({ ...m })),
  };
  if (next.activeMissionId === missionId) {
    next.activeMissionId = next.missions[0].id;
  }
  return next;
}

export function addTask(state, missionId, { text, dueAt = null, priority = 'normal' }) {
  if (!text || !text.trim()) return state;
  const next = clone(state);
  const m = findMission(next, missionId);
  if (!m) return state;
  const maxPos = m.tasks.reduce((mx, t) => Math.max(mx, t.position), 0);
  m.tasks.push({
    id: newId('t'),
    text: text.trim().slice(0, 500),
    done: false,
    priority: PRIORITIES.includes(priority) ? priority : 'normal',
    recurring: false,
    dueAt,
    completedAt: null,
    position: maxPos + 1000,
  });
  return next;
}

export function updateTask(state, missionId, taskId, patch) {
  const next = clone(state);
  const m = findMission(next, missionId);
  if (!m) return state;
  const t = m.tasks.find((x) => x.id === taskId);
  if (!t) return state;
  Object.assign(t, patch);
  return next;
}

/**
 * toggleDone — flips done; on flip-to-done, stamps completedAt and
 * bumps the streakLog. On flip-to-open, clears completedAt (does NOT
 * decrement the streak — once the day's victory is logged, it sticks).
 */
export function toggleDone(state, missionId, taskId, now = Date.now()) {
  const next = clone(state);
  const m = findMission(next, missionId);
  if (!m) return state;
  const t = m.tasks.find((x) => x.id === taskId);
  if (!t) return state;
  t.done = !t.done;
  if (t.done) {
    t.completedAt = new Date(now).toISOString();
    next.streakLog = bumpStreak(next.streakLog, now);
  } else {
    t.completedAt = null;
  }
  return next;
}

export function deleteTask(state, missionId, taskId) {
  const next = clone(state);
  const m = findMission(next, missionId);
  if (!m) return state;
  m.tasks = m.tasks.filter((t) => t.id !== taskId);
  return next;
}

export function clearArchive(state, missionId) {
  // Remove done tasks whose completedAt is older than today (archive bucket).
  const next = clone(state);
  const m = findMission(next, missionId);
  if (!m) return state;
  const today = todayKey();
  m.tasks = m.tasks.filter((t) => {
    if (!t.done) return true;
    const c = t.completedAt ? todayKey(Date.parse(t.completedAt)) : null;
    return c === today; // keep today's done
  });
  return next;
}

export function setPriority(state, missionId, taskId, priority) {
  if (!PRIORITIES.includes(priority)) return state;
  return updateTask(state, missionId, taskId, { priority });
}

export function setDueAt(state, missionId, taskId, dueAt) {
  return updateTask(state, missionId, taskId, { dueAt: dueAt || null });
}

export function setText(state, missionId, taskId, text) {
  if (!text || !text.trim()) return state;
  return updateTask(state, missionId, taskId, { text: text.trim().slice(0, 500) });
}
