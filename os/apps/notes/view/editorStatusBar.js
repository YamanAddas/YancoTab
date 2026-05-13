/**
 * notes/view/editorStatusBar.js — bottom strip of the editor window.
 *
 * Shows three regions:
 *   - left:  word count · char count
 *   - mid :  save state ("Saving…" / "Saved 2s ago" / "Edited")
 *   - right: read time estimate, mode badge (Markdown / Plain)
 *
 * Update API:
 *   - setCounts({ words, chars })
 *   - setSaveState({ state: 'saving' | 'saved' | 'edited', ts? })
 *   - setMode('markdown' | 'plain')
 *
 * Target size: ≤ 90 lines.
 */

import { el } from '../../../utils/dom.js';

const READ_WPM = 220;

export function buildEditorStatusBar() {
  const root = el('div', { class: 'nc-editor-statusbar' });
  const left  = el('span', { class: 'nc-editor-statusbar-left' });
  const mid   = el('span', { class: 'nc-editor-statusbar-mid' });
  const right = el('span', { class: 'nc-editor-statusbar-right' });
  root.append(left, mid, right);

  let lastSavedAt = 0;
  let stateText = 'New';
  let modeText = 'Plain';
  let words = 0;
  let chars = 0;

  function render() {
    left.textContent = `${words} word${words === 1 ? '' : 's'} · ${chars} char${chars === 1 ? '' : 's'}`;
    mid.textContent = stateText;
    const mins = words > 0 ? Math.max(1, Math.round(words / READ_WPM)) : 0;
    const readPart = mins > 0 ? `~${mins} min read` : '';
    right.textContent = [readPart, modeText].filter(Boolean).join(' · ');
  }

  function setCounts({ words: w = 0, chars: c = 0 } = {}) {
    words = w; chars = c;
    render();
  }

  function setSaveState({ state, ts } = {}) {
    if (state === 'saving') stateText = 'Saving…';
    else if (state === 'saved') {
      lastSavedAt = ts || Date.now();
      stateText = 'Saved just now';
    }
    else if (state === 'edited') stateText = 'Edited';
    else stateText = '';
    render();
  }

  function setMode(m) {
    modeText = m === 'markdown' ? 'Markdown' : (m === 'preview' ? 'Preview' : 'Plain');
    render();
  }

  // Re-render "Saved just now" → "Saved Ns ago" on a 5s tick.
  const tick = setInterval(() => {
    if (!lastSavedAt) return;
    if (stateText.startsWith('Saved')) {
      const secs = Math.max(1, Math.floor((Date.now() - lastSavedAt) / 1000));
      stateText = secs < 60
        ? `Saved ${secs}s ago`
        : `Saved ${Math.floor(secs / 60)}m ago`;
      mid.textContent = stateText;
    }
  }, 5000);

  function destroy() { clearInterval(tick); }

  return { root, setCounts, setSaveState, setMode, destroy };
}
