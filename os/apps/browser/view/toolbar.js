/**
 * browser/view/toolbar.js — nav buttons + URL input + add portal.
 */

import { el } from '../../../utils/dom.js';

export function buildToolbar({ onNavigate, onAddPortal, onClearHistory }) {
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

  // Add portal button
  const addBtn = el('button', { type: 'button', class: 'wh-toolbar-add' }, '+ Portal');
  addBtn.addEventListener('click', () => onAddPortal(urlInput.value));

  // Clear history (small ghost)
  const clearBtn = el('button', { type: 'button', class: 'wh-toolbar-clear', title: 'Clear history' }, '⌫');
  clearBtn.addEventListener('click', () => onClearHistory());

  root.append(navGroup, urlInput, addBtn, clearBtn);

  return {
    root,
    /** Sync URL input with state. Web search uses the user's Chrome
     *  default engine (os/services/webSearch.js), so there is no engine
     *  picker here. */
    update(state) {
      if (state.currentUrl && document.activeElement !== urlInput) {
        urlInput.value = state.currentUrl;
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
