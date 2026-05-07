/**
 * settings/view/sideRail.js — 3-section sidebar + status pill.
 *
 * Sections (Console / Trust / Account) — each with a list of items
 * that scrollIntoView the matching bay. Status pill at the bottom
 * shows the latest applied ritual.
 */

import { el } from '../../../utils/dom.js';

function colorVar(color) {
  switch (color) {
    case 'cool':   return 'var(--cool, #5aa8ff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'green':  return 'var(--green, #2dcf6a)';
    case 'dim':    return 'var(--text-dim, #3d4f63)';
    default:       return 'var(--accent, #00e5c1)';
  }
}

export const SIDEBAR_SECTIONS = [
  {
    name: 'Console',
    items: [
      { id: 'rituals',    label: 'Quick rituals',  color: 'accent' },
      { id: 'appearance', label: 'Appearance',     color: 'violet' },
      { id: 'home',       label: 'Apps & dock',    color: 'warm' },
      { id: 'apps',       label: 'Apps & data',    color: 'cool' },
      { id: 'browser',    label: 'Browser & ⌘K',   color: 'cool' },
      { id: 'games',      label: 'Games',          color: 'rose' },
      { id: 'wallpaper',  label: 'Wallpaper',      color: 'warm' },
    ],
  },
  {
    name: 'Trust',
    items: [
      { id: 'privacy',    label: 'Privacy',        color: 'accent' },
      { id: 'sync',       label: 'Sync diagnostics', color: 'cool' },
    ],
  },
  {
    name: 'Account',
    items: [
      { id: 'about',      label: 'About',          color: 'rose' },
    ],
  },
];

export function buildSideRail({ onPickItem }) {
  const root = el('aside', { class: 'mc-set-side' });

  for (const section of SIDEBAR_SECTIONS) {
    root.appendChild(el('h4', { class: 'mc-set-side-h' }, section.name.toUpperCase()));
    const list = el('div', { class: 'mc-set-side-list' });
    for (const item of section.items) {
      const btn = el('button', {
        type: 'button',
        class: 'mc-set-side-item',
        'data-target-bay': item.id,
      }, [
        el('i', { class: 'mc-set-side-ico', style: { background: colorVar(item.color) } }),
        el('span', {}, item.label),
      ]);
      btn.addEventListener('click', () => onPickItem(item.id));
      list.appendChild(btn);
    }
    root.appendChild(list);
  }

  // Status pill
  const pill = el('div', { class: 'mc-set-status' });
  pill.appendChild(el('b', {}, 'Status'));
  const pillBody = el('div', { class: 'mc-set-status-body' }, 'Idle · no recent rituals');
  pill.appendChild(pillBody);
  root.appendChild(pill);

  return {
    root,
    update({ lastRitual, lastRitualAt, lastRitualOk } = {}) {
      if (!lastRitual) {
        pillBody.textContent = 'Idle · no recent rituals';
        pill.classList.remove('is-error');
        return;
      }
      const t = formatTime(lastRitualAt);
      const status = lastRitualOk === false ? '⚠' : '✓';
      pillBody.textContent = `${status} ${capitalize(lastRitual)} mode · ${t}`;
      pill.classList.toggle('is-error', lastRitualOk === false);
    },
  };
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function formatTime(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return '—';
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
