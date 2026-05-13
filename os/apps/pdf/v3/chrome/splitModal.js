/**
 * pdf/v3/chrome/splitModal.js — "Split PDF" modal.
 *
 * Single-doc operation. User enters a range expression like
 * "1-10, 15, 20-25"; preview shows N output files with M total pages.
 * Each parsed range becomes one new PDF.
 *
 * Pure UI — parser comes from ops/split.js, executor is caller-supplied.
 *
 * Target size: ≤ 180 lines.
 */

import { el } from '../../../../utils/dom.js';
import { parseRanges, totalParsedPages } from '../ops/split.js';

export function buildSplitModal({ onSplit } = {}) {
  const overlay = el('div', { class: 'pdf-modal-overlay pdf-split-overlay', role: 'dialog' });
  overlay.style.display = 'none';

  const dialog = el('div', { class: 'pdf-modal pdf-split-modal' });

  const header = el('div', { class: 'pdf-modal-h' }, [
    el('div', { class: 'pdf-modal-title' }, 'Split PDF'),
    el('div', { class: 'pdf-modal-sub' }, 'Extract page ranges into new PDFs.'),
  ]);

  const info = el('div', { class: 'pdf-split-info' });

  const inputRow = el('div', { class: 'pdf-split-input-row' });
  inputRow.appendChild(el('label', {
    class: 'pdf-split-input-label', for: 'pdf-split-ranges',
  }, 'Page ranges'));
  const rangeInput = el('input', {
    type: 'text', class: 'pdf-split-input',
    id: 'pdf-split-ranges',
    placeholder: 'e.g. 1-10, 15, 20-25',
    maxlength: '200',
  });
  inputRow.appendChild(rangeInput);

  const hint = el('div', { class: 'pdf-split-hint' },
    'Comma-separated. Use - for ranges. Out-of-range numbers are ignored.');

  const preview = el('div', { class: 'pdf-split-preview' });
  const progress = el('div', { class: 'pdf-split-progress' });
  progress.style.display = 'none';

  const footer = el('div', { class: 'pdf-modal-actions' });
  const cancelBtn = el('button', {
    type: 'button', class: 'pdf-modal-btn',
    onclick: () => close(),
  }, 'Cancel');
  const splitBtn = el('button', {
    type: 'button', class: 'pdf-modal-btn pdf-modal-btn-primary',
    onclick: () => doSplit(),
  }, 'Split');
  footer.append(cancelBtn, splitBtn);

  dialog.append(header, info, inputRow, hint, preview, progress, footer);
  overlay.appendChild(dialog);

  let totalPages = 0;
  let parsedCache = [];

  function updatePreview() {
    parsedCache = parseRanges(rangeInput.value, totalPages);
    if (!parsedCache.length) {
      preview.textContent = rangeInput.value.trim()
        ? 'No valid ranges yet — try "1-10, 15, 20-25".'
        : 'Enter ranges above to see a preview.';
      preview.classList.remove('is-ready');
      splitBtn.disabled = true;
      return;
    }
    const pages = totalParsedPages(parsedCache);
    const labels = parsedCache.map((r) => r.label).join(' · ');
    const fileNoun = parsedCache.length === 1 ? 'file' : 'files';
    preview.textContent = `Will produce ${parsedCache.length} ${fileNoun} (${pages} pages): ${labels}`;
    preview.classList.add('is-ready');
    splitBtn.disabled = false;
  }

  rangeInput.addEventListener('input', updatePreview);
  rangeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !splitBtn.disabled) {
      e.preventDefault();
      doSplit();
    }
  });

  async function doSplit() {
    if (!parsedCache.length) return;
    setBusy(true);
    progress.style.display = 'block';
    progress.textContent = 'Splitting…';
    try {
      await onSplit?.({
        ranges: parsedCache,
        onProgress: ({ done, total, label }) => {
          progress.textContent = `Extracting${label ? ` ${label}` : ''}… (${done + 1}/${total})`;
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
    splitBtn.disabled = busy || !parsedCache.length;
    cancelBtn.disabled = busy;
    rangeInput.disabled = busy;
  }

  function open({ docName, totalPages: total } = {}) {
    totalPages = Number.isFinite(total) && total > 0 ? total : 0;
    info.textContent = totalPages
      ? `${docName || 'document'} — ${totalPages} pages`
      : 'No document open';
    rangeInput.value = '';
    rangeInput.disabled = !totalPages;
    progress.style.display = 'none';
    progress.textContent = '';
    parsedCache = [];
    updatePreview();
    overlay.style.display = 'flex';
    setTimeout(() => rangeInput.focus(), 0);
  }

  function close() {
    overlay.style.display = 'none';
  }

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return { root: overlay, open, close };
}
