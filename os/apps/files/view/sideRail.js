/**
 * files/view/sideRail.js — Smart rooms + Folders (children of /home)
 * + Fuel gauge.
 *
 * Tags section from the mock is dropped in v1 — no tag system in fs
 * yet. Will be re-introduced when we ship tags.
 */

import { el } from '../../../utils/dom.js';
import { buildFuelGauge } from './fuelGauge.js';

const SMART_DEFS = [
  { id: 'recent',    label: 'Recent',    tone: 'accent' },
  { id: 'pinned',    label: 'Pinned',    tone: 'accent' },
  { id: 'heavy',     label: 'Heavy',     tone: 'warm' },
  { id: 'forgotten', label: 'Forgotten', tone: 'dim' },
];

function tonePip(tone) {
  switch (tone) {
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'cool':   return 'var(--cool, #5aa8ff)';
    case 'dim':    return 'var(--text-dim, #6e6e73)';
    default:       return 'var(--accent, #00e5c1)';
  }
}

export function buildSideRail({ onPickSmart, onPickFolder } = {}) {
  const root = el('aside', { class: 'fv-side' });

  const smartHead = el('h4', { class: 'fv-side-h' }, 'SMART ROOMS');
  const smartList = el('div', { class: 'fv-side-list' });

  const folderHead = el('h4', { class: 'fv-side-h' }, 'FOLDERS');
  const folderList = el('div', { class: 'fv-side-list' });
  const folderEmpty = el('p', { class: 'fv-side-empty' }, 'No folders yet — create one in /home.');
  folderEmpty.style.display = 'none';

  const fuel = buildFuelGauge();
  const fuelWrap = el('div', { class: 'fv-fuel-wrap' }, [fuel.root]);

  root.append(smartHead, smartList, folderHead, folderList, folderEmpty, fuelWrap);

  return {
    root,
    update({ counts, folders, breakdown, activeSmart, activeFolderPath }) {
      // ── Smart rooms ──
      smartList.innerHTML = '';
      for (const def of SMART_DEFS) {
        const isActive = activeSmart === def.id;
        const item = el('button', {
          type: 'button',
          class: `fv-side-item${isActive ? ' is-active' : ''}`,
          'data-smart': def.id,
        }, [
          el('i', { class: 'fv-side-pip', style: { background: tonePip(def.tone) } }),
          el('span', { class: 'fv-side-label' }, def.label),
          el('span', { class: 'fv-side-ct' }, String((counts && counts[def.id]) || 0)),
        ]);
        item.addEventListener('click', () => onPickSmart?.(def.id));
        smartList.appendChild(item);
      }

      // ── Folders ──
      folderList.innerHTML = '';
      const fs = Array.isArray(folders) ? folders : [];
      folderEmpty.style.display = fs.length ? 'none' : '';
      for (const f of fs) {
        const isActive = activeFolderPath === f.path;
        const item = el('button', {
          type: 'button',
          class: `fv-side-item${isActive ? ' is-active' : ''}`,
          'data-folder-path': f.path,
        }, [
          el('i', { class: 'fv-side-pip', style: { background: tonePip(f.tone) } }),
          el('span', { class: 'fv-side-label' }, f.name),
          f.count != null ? el('span', { class: 'fv-side-ct' }, String(f.count)) : null,
        ].filter(Boolean));
        item.addEventListener('click', () => onPickFolder?.(f.path));
        folderList.appendChild(item);
      }

      // ── Fuel gauge ──
      fuel.update(breakdown);
    },
  };
}
