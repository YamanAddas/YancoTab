/**
 * todo/engine/state.js — data shape + factory, pure.
 *
 * v2 shape (yancotab_todo_v2):
 *   {
 *     missions: [{ id, name, color, position, tasks: [Task] }],
 *     activeMissionId: string | null,
 *     streakLog: { 'YYYY-MM-DD': number },
 *     version: 2,
 *   }
 *
 * Task:
 *   {
 *     id,         text,         done,
 *     priority:   'low' | 'normal' | 'high',
 *     recurring:  boolean,
 *     dueAt:      ISO datetime string | null,
 *     completedAt: ISO datetime string | null,
 *     position:   number (sort within mission),
 *   }
 *
 * Reducer never mutates state; helpers below build the shape and
 * normalize incoming data to it.
 */

export const COLORS = ['accent', 'cool', 'warm', 'violet', 'rose', 'green'];
export const PRIORITIES = ['low', 'normal', 'high'];

export function newId(prefix = 't') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function todayKey(now = Date.now()) {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function makeTask({ text, dueAt = null, priority = 'normal', recurring = false, position = 1000 } = {}) {
  return {
    id: newId('t'),
    text: String(text || '').trim(),
    done: false,
    priority: PRIORITIES.includes(priority) ? priority : 'normal',
    recurring: !!recurring,
    dueAt: typeof dueAt === 'string' && dueAt ? dueAt : null,
    completedAt: null,
    position: Number.isFinite(position) ? position : 1000,
  };
}

export function makeMission({ name = 'Untitled', color = 'accent', position = 1000 } = {}) {
  return {
    id: newId('m'),
    name: String(name).trim().slice(0, 60) || 'Untitled',
    color: COLORS.includes(color) ? color : 'accent',
    position: Number.isFinite(position) ? position : 1000,
    tasks: [],
  };
}

export function makeInitialState() {
  const m = makeMission({ name: 'My Tasks', color: 'accent', position: 1000 });
  return {
    missions: [m],
    activeMissionId: m.id,
    streakLog: {},
    version: 2,
  };
}

/**
 * Normalize a task from storage. Drops unknown fields, fills missing.
 * Pure; never throws on garbage input.
 */
export function normalizeTask(t, fallbackPos = 1000) {
  if (!t || typeof t !== 'object') return null;
  const text = typeof t.text === 'string' ? t.text : '';
  if (!text.trim()) return null;
  return {
    id: typeof t.id === 'string' && t.id ? t.id : newId('t'),
    text: text.slice(0, 500),
    done: !!t.done,
    priority: PRIORITIES.includes(t.priority) ? t.priority : 'normal',
    recurring: !!t.recurring,
    dueAt: typeof t.dueAt === 'string' && t.dueAt ? t.dueAt : null,
    completedAt: typeof t.completedAt === 'string' && t.completedAt ? t.completedAt : null,
    position: Number.isFinite(t.position) ? t.position : fallbackPos,
  };
}

export function normalizeMission(m, fallbackPos = 1000) {
  if (!m || typeof m !== 'object') return null;
  const name = typeof m.name === 'string' && m.name.trim() ? m.name.trim().slice(0, 60) : 'Untitled';
  const tasks = Array.isArray(m.tasks)
    ? m.tasks.map((t, i) => normalizeTask(t, (i + 1) * 1000)).filter(Boolean)
    : [];
  return {
    id: typeof m.id === 'string' && m.id ? m.id : newId('m'),
    name,
    color: COLORS.includes(m.color) ? m.color : 'accent',
    position: Number.isFinite(m.position) ? m.position : fallbackPos,
    tasks,
  };
}

export function normalizeState(s) {
  if (!s || typeof s !== 'object') return makeInitialState();
  const missions = Array.isArray(s.missions)
    ? s.missions.map((m, i) => normalizeMission(m, (i + 1) * 1000)).filter(Boolean)
    : [];
  if (missions.length === 0) return makeInitialState();
  const activeMissionId = missions.find((m) => m.id === s.activeMissionId)?.id || missions[0].id;
  const streakLog = (s.streakLog && typeof s.streakLog === 'object' && !Array.isArray(s.streakLog))
    ? Object.fromEntries(
        Object.entries(s.streakLog).filter(
          ([k, v]) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(v) && v >= 0
        )
      )
    : {};
  return {
    missions,
    activeMissionId,
    streakLog,
    version: 2,
  };
}

/** Lookup helpers. */
export function getMission(state, id) {
  return state?.missions?.find((m) => m.id === id) || null;
}

export function getActiveMission(state) {
  return state ? getMission(state, state.activeMissionId) || state.missions?.[0] || null : null;
}
