/**
 * pdf/v3/chrome/mergeModal.js — "Merge PDFs" modal.
 *
 * Dialog flow:
 *   1. Opens with the current doc pre-populated as the first source row.
 *   2. User clicks "Add from library" → picker subview lists all library
 *      docs (excluding already-selected). Click to add.
 *   3. Rows can be re-ordered via up/down arrows or drag handles.
 *   4. Output name field defaults to "Merged.pdf"; user can edit.
 *   5. Merge button → fires onMerge({ docIds, outputName }) and shows
 *      a progress strip until the caller dismisses.
 *
 * Pure UI — no pdf-lib, no IDB. Caller supplies the merge implementation.
 *
 * Target size: ≤ 280 lines.
 */

import { el } from '../../../../utils/dom.js';

export function buildMergeModal({ onMerge } = {}) {
  const overlay = el('div', { class: 'pdf-modal-overlay pdf-merge-overlay', role: 'dialog' });
  overlay.style.display = 'none';

  const dialog = el('div', { class: 'pdf-modal pdf-merge-modal', 'aria-labelledby': 'pdf-merge-title' });

  const header = el('div', { class: 'pdf-modal-h' }, [
    el('div', { class: 'pdf-modal-title', id: 'pdf-merge-title' }, 'Merge PDFs'),
    el('div', { class: 'pdf-modal-sub' }, 'Combine multiple PDFs into a single document.'),
  ]);

  const sourcesList = el('div', { class: 'pdf-merge-sources' });
  const addRow = el('button', {
    type: 'button',
    class: 'pdf-merge-add-btn',
    onclick: () => openPicker(),
  }, '+ Add from library');

  const nameRow = el('div', { class: 'pdf-merge-name-row' }, [
    el('label', { class: 'pdf-merge-name-label', for: 'pdf-merge-name' }, 'Output name'),
  ]);
  const nameInput = el('input', {
    type: 'text', class: 'pdf-merge-name-input',
    id: 'pdf-merge-name', placeholder: 'Merged.pdf',
    value: 'Merged.pdf', maxlength: '128',
  });
  nameRow.appendChild(nameInput);

  const progress = el('div', { class: 'pdf-merge-progress' });
  progress.style.display = 'none';

  const footer = el('div', { class: 'pdf-modal-actions' });
  const cancelBtn = el('button', {
    type: 'button', class: 'pdf-modal-btn',
    onclick: () => close(),
  }, 'Cancel');
  const mergeBtn = el('button', {
    type: 'button', class: 'pdf-modal-btn pdf-modal-btn-primary',
    onclick: () => doMerge(),
  }, 'Merge');
  footer.append(cancelBtn, mergeBtn);

  dialog.append(header, sourcesList, addRow, nameRow, progress, footer);
  overlay.appendChild(dialog);

  // Picker subview (hidden until "Add from library" is clicked)
  const pickerOverlay = el('div', { class: 'pdf-merge-picker' });
  pickerOverlay.style.display = 'none';
  const pickerHeader = el('div', { class: 'pdf-modal-h' }, [
    el('div', { class: 'pdf-modal-title' }, 'Add a PDF'),
  ]);
  const pickerList = el('div', { class: 'pdf-merge-picker-list' });
  const pickerCloseRow = el('div', { class: 'pdf-modal-actions' });
  pickerCloseRow.appendChild(el('button', {
    type: 'button', class: 'pdf-modal-btn',
    onclick: () => { pickerOverlay.style.display = 'none'; },
  }, 'Cancel'));
  pickerOverlay.append(pickerHeader, pickerList, pickerCloseRow);
  dialog.appendChild(pickerOverlay);

  // State
  let docs = [];          // [{id, name}] in chosen order
  let libraryDocs = [];   // [{id, name}] (full list from caller)

  function renderSources() {
    sourcesList.innerHTML = '';
    docs.forEach((d, i) => {
      const row = el('div', { class: 'pdf-merge-row', 'data-id': d.id });
      const ordinal = el('span', { class: 'pdf-merge-row-ordinal' }, String(i + 1));
      const name = el('span', { class: 'pdf-merge-row-name' }, d.name);
      const ctrls = el('div', { class: 'pdf-merge-row-ctrls' });
      ctrls.appendChild(el('button', {
        type: 'button', class: 'pdf-merge-row-btn', title: 'Move up',
        disabled: i === 0,
        onclick: () => move(i, -1),
      }, '↑'));
      ctrls.appendChild(el('button', {
        type: 'button', class: 'pdf-merge-row-btn', title: 'Move down',
        disabled: i === docs.length - 1,
        onclick: () => move(i, 1),
      }, '↓'));
      const removeBtn = el('button', {
        type: 'button', class: 'pdf-merge-row-btn pdf-merge-row-rm',
        title: 'Remove', onclick: () => remove(i),
      }, '×');
      // Don't let user remove the last entry — modal becomes meaningless.
      if (docs.length <= 1) removeBtn.disabled = true;
      ctrls.appendChild(removeBtn);
      row.append(ordinal, name, ctrls);
      sourcesList.appendChild(row);
    });
    mergeBtn.disabled = docs.length < 2;
  }

  function move(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= docs.length) return;
    const tmp = docs[idx];
    docs[idx] = docs[j];
    docs[j] = tmp;
    renderSources();
  }

  function remove(idx) {
    docs.splice(idx, 1);
    renderSources();
  }

  function openPicker() {
    const selectedIds = new Set(docs.map((d) => d.id));
    const candidates = libraryDocs.filter((d) => !selectedIds.has(d.id));
    pickerList.innerHTML = '';
    if (!candidates.length) {
      pickerList.appendChild(el('div', { class: 'pdf-merge-picker-empty' },
        'All library docs are already in the list.'));
    } else {
      for (const d of candidates) {
        const item = el('button', {
          type: 'button', class: 'pdf-merge-picker-item',
          title: d.name,
          onclick: () => {
            docs.push({ id: d.id, name: d.name });
            renderSources();
            pickerOverlay.style.display = 'none';
          },
        });
        item.append(
          el('span', { class: 'pdf-merge-picker-name' }, d.name),
        );
        pickerList.appendChild(item);
      }
    }
    pickerOverlay.style.display = 'flex';
  }

  async function doMerge() {
    if (docs.length < 2) return;
    const outputName = (nameInput.value || 'Merged.pdf').trim() || 'Merged.pdf';
    setBusy(true);
    progress.style.display = 'block';
    progress.textContent = 'Merging…';
    try {
      await onMerge?.({
        docIds: docs.map((d) => d.id),
        outputName: outputName.endsWith('.pdf') ? outputName : `${outputName}.pdf`,
        onProgress: ({ step, done, total }) => {
          const verbs = { reading: 'Reading', copying: 'Copying', saving: 'Saving' };
          progress.textContent = `${verbs[step] || 'Working'}… (${done + 1}/${total})`;
        },
      });
      close();
    } catch (e) {
      progress.textContent = `Failed: ${e?.message || e}`;
    } finally {
      setBusy(false);
    }
  }

  function setBusy(busy) {
    mergeBtn.disabled = busy;
    cancelBtn.disabled = busy;
    addRow.disabled = busy;
    for (const r of sourcesList.querySelectorAll('button')) r.disabled = busy;
  }

  function open({ currentDoc, libraryDocs: lib } = {}) {
    libraryDocs = Array.isArray(lib) ? lib : [];
    docs = [];
    if (currentDoc) docs.push({ id: currentDoc.id, name: currentDoc.name });
    nameInput.value = 'Merged.pdf';
    progress.style.display = 'none';
    progress.textContent = '';
    pickerOverlay.style.display = 'none';
    renderSources();
    overlay.style.display = 'flex';
    setTimeout(() => nameInput.focus(), 0);
  }

  function close() {
    overlay.style.display = 'none';
  }

  // Esc dismiss
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return { root: overlay, open, close };
}
