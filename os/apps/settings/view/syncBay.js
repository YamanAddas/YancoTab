/**
 * settings/view/syncBay.js — terminal-style sync log.
 *
 * Reads the in-memory buffer and renders the latest 6 entries.
 * NEVER renders a key's value — only the registry key + chunks +
 * status (the engine drops values at record time as a defense in
 * depth).
 */

import { el } from '../../../utils/dom.js';
import { buildBay } from './bay.js';

export function buildSyncBay() {
  const bay = buildBay({ id: 'sync', title: 'Sync diagnostics', color: 'cool' });
  const empty = el('p', { class: 'mc-sync-empty' },
    'No recent sync events. Edit a setting to see local writes here.');
  const list = el('div', { class: 'mc-sync-list' });
  const summary = el('div', { class: 'mc-sync-summary' }, '');
  // Keys held back because they exceed chrome.storage.sync's 8KB per-item
  // cap. Until now an oversized value was split into chunks that no device
  // could reassemble, so it looked synced and was not; it is now honestly
  // local-only, and this is where that is said out loud.
  const oversize = el('div', { class: 'mc-sync-oversize' });
  bay.body.append(empty, list, summary, oversize);

  return {
    root: bay.root,
    update(buffer, status) {
      renderOversize(oversize, status);
      const entries = Array.isArray(buffer?.entries) ? buffer.entries : [];
      list.innerHTML = '';
      if (entries.length === 0) {
        empty.style.display = 'block';
        summary.textContent = '';
        return;
      }
      empty.style.display = 'none';
      for (const e of entries) {
        const row = el('div', { class: `mc-sync-row${e.ok ? '' : ' is-err'}` }, [
          el('span', { class: 'mc-sync-ts' }, formatTime(e.ts)),
          el('span', { class: 'mc-sync-verb' }, e.source === 'remote' ? 'pull' : 'push'),
          el('span', { class: 'mc-sync-key' }, e.key),
          el('span', { class: 'mc-sync-chunks' }, `${e.chunks} chunk${e.chunks === 1 ? '' : 's'}`),
          el('span', { class: 'mc-sync-status' }, e.ok ? '✓' : '✗'),
        ]);
        list.appendChild(row);
      }
      const ok = entries.filter((e) => e.ok).length;
      const total = entries.length;
      summary.textContent = `${total} recent · ${ok}/${total} ok · last ${formatTime(entries[0].ts)}`;
    },
  };
}

function renderOversize(host, status) {
  const list = Array.isArray(status?.oversizedKeys) ? status.oversizedKeys : [];
  host.innerHTML = '';
  if (list.length === 0) return;
  const cap = Math.round((status.maxSyncItemBytes || 7168) / 1024);
  host.appendChild(el('div', { class: 'mc-sync-oversize-head' },
    `${list.length} key${list.length === 1 ? '' : 's'} kept on this device only (over ${cap}KB)`));
  for (const { key, bytes } of list) {
    host.appendChild(el('div', { class: 'mc-sync-row is-warn' }, [
      el('span', { class: 'mc-sync-key' }, key),
      el('span', { class: 'mc-sync-chunks' }, `${Math.round(bytes / 1024)}KB`),
      el('span', { class: 'mc-sync-status' }, 'local'),
    ]));
  }
}

function formatTime(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return '--:--:--';
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
