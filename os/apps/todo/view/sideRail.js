/**
 * todo/view/sideRail.js — left rail: missions list + recurring + streaks.
 *
 * Built once; update(state) repaints. Recurring section is a static
 * placeholder for v1 (real recurring task scheduling lands later).
 */

import { el } from '../../../utils/dom.js';
import { COLORS } from '../engine/state.js';
import { weekConstellation } from '../engine/streaks.js';

function colorVar(color) {
  switch (color) {
    case 'cool':   return 'var(--cool, #5aa8ff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'green':  return 'var(--green, #2dcf6a)';
    default:       return 'var(--accent, #00e5c1)';
  }
}

export function buildSideRail({ onPickMission, onAddMission, onMissionContextMenu }) {
  const root = el('aside', { class: 'mc-side' });

  const missionsHead = el('div', { class: 'mc-h' }, 'MISSIONS');
  const missionsList = el('div', { class: 'mc-mlist' });

  const recurringHead = el('div', { class: 'mc-h' }, 'RECURRING');
  const recurringList = el('div', { class: 'mc-mlist mc-recurring' });
  recurringList.append(
    el('div', { class: 'mc-mitem is-static' }, [
      el('span', { class: 'mc-mitem-glyph' }, '⚡'),
      el('span', {}, 'Daily standup'),
    ]),
    el('div', { class: 'mc-mitem is-static' }, [
      el('span', { class: 'mc-mitem-glyph' }, '📅'),
      el('span', {}, 'Weekly review'),
    ]),
    el('div', { class: 'mc-mitem is-static' }, [
      el('span', { class: 'mc-mitem-glyph' }, '🌙'),
      el('span', {}, 'Evening journal'),
    ]),
  );

  const streaksHead = el('div', { class: 'mc-h' }, 'STREAKS');
  const constellation = el('div', { class: 'mc-constel' });

  root.append(missionsHead, missionsList, recurringHead, recurringList, streaksHead, constellation);

  return {
    root,
    update(state, settings = {}) {
      // ── Missions list ──
      missionsList.innerHTML = '';
      const sorted = [...state.missions].sort((a, b) => a.position - b.position);
      for (const m of sorted) {
        const openCount = m.tasks.filter((t) => !t.done).length;
        const item = el('button', {
          class: `mc-mitem${m.id === state.activeMissionId ? ' is-active' : ''}`,
          type: 'button',
          'data-mission-id': m.id,
        }, [
          el('i', { class: 'mc-mitem-ico', style: { background: colorVar(m.color) } }),
          el('span', { class: 'mc-mitem-name' }, m.name),
          openCount > 0 ? el('span', { class: 'mc-mitem-ct' }, String(openCount)) : null,
        ].filter(Boolean));
        item.addEventListener('click', () => onPickMission(m.id));
        // Long-press → context menu (rename / recolor / delete).
        let lpTimer = null;
        item.addEventListener('pointerdown', () => {
          lpTimer = setTimeout(() => onMissionContextMenu(m.id), 500);
        });
        const cancelLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
        item.addEventListener('pointerup', cancelLp);
        item.addEventListener('pointerleave', cancelLp);
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          onMissionContextMenu(m.id);
        });
        missionsList.appendChild(item);
      }
      const addBtn = el('button', { class: 'mc-mitem is-add', type: 'button' }, '+ New mission');
      addBtn.addEventListener('click', () => onAddMission());
      missionsList.appendChild(addBtn);

      // ── Streaks constellation ──
      constellation.innerHTML = '';
      const week = weekConstellation(state.streakLog, Date.now(), settings.weekStart || 'mon');
      for (const d of week) {
        const cell = el('div', {
          class: `mc-cw-day${d.isToday ? ' is-today' : ''}${d.isFuture ? ' is-future' : ''}`,
        });
        cell.appendChild(el('span', { class: 'mc-cw-lbl' }, d.label));
        const stars = el('div', { class: 'mc-cw-stars' });
        for (let i = 0; i < d.stars; i++) {
          stars.appendChild(el('i', { class: 'mc-cw-star' }));
        }
        cell.appendChild(stars);
        constellation.appendChild(cell);
      }

      // Hide unused color helper to silence the unused-import warning later.
      void COLORS;
    },
  };
}
