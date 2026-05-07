/**
 * todo/engine/migrate.js — one-shot v1 → v2 migration.
 *
 * v1 shape (yancotab_todo_v1):
 *   { lists: [{ id, name, tasks: [{ id, text, done, dueDate, position }] }] }
 *
 * v2 shape (see state.js): missions with color, tasks with priority +
 * recurring + dueAt (datetime) + completedAt, streakLog, version: 2.
 *
 * Strategy:
 *   • Preserve list ids + task ids + ordering
 *   • Each list gets a color from COLORS in declared order
 *   • Each task: keep id, text, done, position
 *     - dueDate ('YYYY-MM-DD') → dueAt ('YYYY-MM-DDTHH:MM') anchored to 17:00 local
 *     - priority: 'normal'
 *     - recurring: false
 *     - completedAt: null (we don't have v1 completion timestamps)
 *   • streakLog: empty (start fresh)
 */

import { COLORS, PRIORITIES, normalizeMission } from './state.js';

export function isV1Shape(obj) {
  return !!(obj && typeof obj === 'object' && Array.isArray(obj.lists) && !Array.isArray(obj.missions));
}

export function isV2Shape(obj) {
  return !!(obj && typeof obj === 'object' && Array.isArray(obj.missions));
}

export function migrateV1ToV2(v1) {
  if (!isV1Shape(v1)) return null;
  const lists = Array.isArray(v1.lists) ? v1.lists : [];
  const missions = lists.map((list, idx) => {
    const tasks = Array.isArray(list.tasks) ? list.tasks : [];
    return {
      id: typeof list.id === 'string' && list.id ? list.id : `m_legacy_${idx}`,
      name: (typeof list.name === 'string' && list.name.trim()) || 'Untitled',
      color: COLORS[idx % COLORS.length],
      position: (idx + 1) * 1000,
      tasks: tasks.map((t, i) => migrateTask(t, i)).filter(Boolean),
    };
  }).map((m) => normalizeMission(m, m.position));

  return {
    missions: missions.length > 0 ? missions : [
      // Empty v1 → seed with the new default mission.
      { id: 'm_default', name: 'My Tasks', color: 'accent', position: 1000, tasks: [] },
    ],
    activeMissionId: missions[0]?.id || 'm_default',
    streakLog: {},
    version: 2,
  };
}

function migrateTask(t, idx) {
  if (!t || typeof t !== 'object') return null;
  const text = typeof t.text === 'string' ? t.text.trim() : '';
  if (!text) return null;
  return {
    id: typeof t.id === 'string' && t.id ? t.id : `t_legacy_${idx}`,
    text: text.slice(0, 500),
    done: !!t.done,
    priority: PRIORITIES.includes(t.priority) ? t.priority : 'normal',
    recurring: !!t.recurring,
    dueAt: dueDateToDateTime(t.dueDate),
    completedAt: null,
    position: Number.isFinite(t.position) ? t.position : (idx + 1) * 1000,
  };
}

/**
 * '2026-05-08' → '2026-05-08T17:00' (5pm local default)
 * Returns null for malformed input or empty string.
 */
function dueDateToDateTime(dueDate) {
  if (typeof dueDate !== 'string' || !dueDate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  return `${dueDate}T17:00`;
}
