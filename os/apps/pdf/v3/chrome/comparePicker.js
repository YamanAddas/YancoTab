/**
 * pdf/v3/chrome/comparePicker.js — "pick a second doc to compare with"
 * modal.
 *
 * Single-purpose: list every library doc except the current one, click
 * one to fire onPick(docId). Reuses the generic .pdf-modal CSS.
 *
 * Target size: ≤ 110 lines.
 */

import { el } from '../../../../utils/dom.js';

export function buildComparePicker({ onPick } = {}) {
  const overlay = el('div', { class: 'pdf-modal-overlay pdf-compare-overlay', role: 'dialog' });
  overlay.style.display = 'none';

  const dialog = el('div', { class: 'pdf-modal pdf-compare-modal' });

  const header = el('div', { class: 'pdf-modal-h' }, [
    el('div', { class: 'pdf-modal-title' }, 'Compare with…'),
    el('div', { class: 'pdf-modal-sub' }, 'Pick a second PDF to view alongside this one.'),
  ]);

  const list = el('div', { class: 'pdf-compare-list' });
  const empty = el('div', { class: 'pdf-compare-empty' });

  const footer = el('div', { class: 'pdf-modal-actions' });
  const cancelBtn = el('button', {
    type: 'button', class: 'pdf-modal-btn',
    onclick: () => close(),
  }, 'Cancel');
  footer.append(cancelBtn);

  dialog.append(header, list, empty, footer);
  overlay.appendChild(dialog);

  function open({ currentDocId, libraryDocs } = {}) {
    list.innerHTML = '';
    const candidates = (libraryDocs || []).filter((d) => d.id !== currentDocId);
    if (!candidates.length) {
      list.style.display = 'none';
      empty.style.display = 'block';
      empty.textContent = 'No other PDFs in your library yet. Import one first.';
    } else {
      list.style.display = 'flex';
      empty.style.display = 'none';
      for (const d of candidates) {
        const item = el('button', {
          type: 'button', class: 'pdf-compare-item',
          title: d.name,
          onclick: () => {
            const id = d.id;
            close();
            onPick?.(id);
          },
        });
        item.append(
          el('span', { class: 'pdf-compare-name' }, d.name),
        );
        list.appendChild(item);
      }
    }
    overlay.style.display = 'flex';
  }

  function close() {
    overlay.style.display = 'none';
  }

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return { root: overlay, open, close };
}
