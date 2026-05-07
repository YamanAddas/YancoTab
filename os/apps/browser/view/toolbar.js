/**
 * browser/view/toolbar.js — nav buttons + URL input + layer pills + add portal.
 */

import { el } from '../../../utils/dom.js';

const ENGINES = [
  { id: 'google', label: 'Google' },
  { id: 'duck',   label: 'DDG' },
  { id: 'bing',   label: 'Bing' },
];

export function buildToolbar({ onNavigate, onAddPortal, onPickEngine, onClearHistory }) {
  const root = el('div', { class: 'wh-toolbar' });

  // Nav cluster — back/forward/reload are stubs since we don't host
  // the page (always opens external in new tab). Reload re-renders.
  const navGroup = el('div', { class: 'wh-toolbar-nav' });
  navGroup.append(
    navBtn('←', 'Back (history)', () => {/* PR-3: navigate previous in history */}),
    navBtn('→', 'Forward', () => {/* PR-3 */}),
    navBtn('↻', 'Refresh state', () => {/* no-op; render is driven by state */}),
  );

  // URL input
  const urlInput = el('input', {
    class: 'wh-toolbar-url',
    type: 'text',
    spellcheck: 'false',
    autocomplete: 'off',
    placeholder: 'Search or enter URL — Enter to teleport',
  });
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && urlInput.value.trim()) {
      e.preventDefault();
      onNavigate(urlInput.value);
    }
  });

  // Search engine pills
  const engineGroup = el('div', { class: 'wh-toolbar-engines' });
  const engineButtons = new Map();
  for (const e of ENGINES) {
    const btn = el('button', {
      type: 'button',
      class: 'wh-toolbar-engine',
      'data-engine-id': e.id,
    }, e.label);
    btn.addEventListener('click', () => onPickEngine(e.id));
    engineButtons.set(e.id, btn);
    engineGroup.appendChild(btn);
  }

  // Add portal button
  const addBtn = el('button', { type: 'button', class: 'wh-toolbar-add' }, '+ Portal');
  addBtn.addEventListener('click', () => onAddPortal(urlInput.value));

  // Clear history (small ghost)
  const clearBtn = el('button', { type: 'button', class: 'wh-toolbar-clear', title: 'Clear history' }, '⌫');
  clearBtn.addEventListener('click', () => onClearHistory());

  root.append(navGroup, urlInput, engineGroup, addBtn, clearBtn);

  return {
    root,
    /** Sync URL input + active engine pill with state. */
    update(state, prefs) {
      if (state.currentUrl && document.activeElement !== urlInput) {
        urlInput.value = state.currentUrl;
      }
      const engineId = prefs?.searchEngine || 'google';
      for (const [id, btn] of engineButtons) {
        btn.classList.toggle('is-active', id === engineId);
      }
    },
    focusUrl() { urlInput.focus(); urlInput.select(); },
  };
}

function navBtn(glyph, title, onClick) {
  const btn = el('button', { type: 'button', class: 'wh-toolbar-nav-btn', title }, glyph);
  btn.addEventListener('click', onClick);
  return btn;
}
