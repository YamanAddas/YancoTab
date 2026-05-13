/**
 * notes/view/editorFindBar.js — inline find-in-note bar.
 *
 * Triggered via Ctrl+F. Slides in below the title. Shows a query
 * input, prev / next buttons, a counter, and a close X.
 *
 * Highlighting strategy: since <textarea> can't paint background
 * colors on a sub-range, we use selection. As the user types, we
 * find all match offsets in textarea.value. The current match is
 * SELECTED in the textarea (so the browser scrolls it into view
 * and shows the native selection box). Up / Down step through.
 *
 * Target size: ≤ 130 lines.
 */

import { el } from '../../../utils/dom.js';

export function buildEditorFindBar({ getTextarea } = {}) {
  const root = el('div', { class: 'nc-editor-findbar', role: 'search' });
  root.style.display = 'none';

  const input = el('input', {
    type: 'text', class: 'nc-editor-find-input',
    placeholder: 'Find in note…', spellcheck: 'false', autocomplete: 'off',
  });
  const counter = el('span', { class: 'nc-editor-find-counter' }, '');
  const prevBtn = el('button', { type: 'button', class: 'nc-editor-find-btn', title: 'Previous (Shift+Enter)' }, '↑');
  const nextBtn = el('button', { type: 'button', class: 'nc-editor-find-btn', title: 'Next (Enter)' }, '↓');
  const closeBtn = el('button', { type: 'button', class: 'nc-editor-find-btn nc-editor-find-close', title: 'Close (Esc)' }, '✕');

  root.append(input, counter, prevBtn, nextBtn, closeBtn);

  let matches = [];   // array of {start, end}
  let cursor = -1;

  function compute() {
    const ta = getTextarea?.();
    const q = input.value;
    matches = [];
    if (!ta || !q) {
      cursor = -1;
      renderCounter();
      return;
    }
    const hay = ta.value;
    const needle = q.toLowerCase();
    const lower = hay.toLowerCase();
    let from = 0;
    while (from <= lower.length) {
      const idx = lower.indexOf(needle, from);
      if (idx < 0) break;
      matches.push({ start: idx, end: idx + needle.length });
      from = idx + Math.max(1, needle.length);
    }
    cursor = matches.length ? 0 : -1;
    renderCounter();
    revealCurrent();
  }

  function renderCounter() {
    if (!matches.length) {
      counter.textContent = input.value ? '0/0' : '';
    } else {
      counter.textContent = `${cursor + 1}/${matches.length}`;
    }
    prevBtn.disabled = matches.length < 2;
    nextBtn.disabled = matches.length < 2;
  }

  function revealCurrent() {
    const ta = getTextarea?.();
    if (!ta || cursor < 0) return;
    const m = matches[cursor];
    if (!m) return;
    try {
      ta.focus({ preventScroll: false });
      ta.setSelectionRange(m.start, m.end);
      // Make sure it's scrolled into view — setSelectionRange usually
      // does this but be defensive on different browsers.
      ta.scrollTop = Math.max(0, ta.scrollTop);
    } catch { /* ignore */ }
  }

  function step(dir) {
    if (!matches.length) return;
    cursor = (cursor + dir + matches.length) % matches.length;
    renderCounter();
    revealCurrent();
  }

  input.addEventListener('input', compute);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')   { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); hide(); }
  });
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  closeBtn.addEventListener('click', hide);

  function show(prefill = '') {
    root.style.display = 'flex';
    input.value = prefill || input.value || '';
    compute();
    setTimeout(() => { try { input.focus(); input.select(); } catch { /* ignore */ } }, 0);
  }
  function hide() {
    root.style.display = 'none';
    // Return focus to the textarea so typing continues smoothly.
    try { getTextarea?.()?.focus(); } catch { /* ignore */ }
  }
  function isOpen() {
    return root.style.display !== 'none';
  }
  function refresh() {
    if (isOpen()) compute();
  }

  return { root, show, hide, isOpen, refresh };
}
