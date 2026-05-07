/**
 * pomodoro/view/attachedRow.js — "attached app" row in the Today stage.
 *
 * Stub for v1 — no app actually binds the timer yet. The row shows
 * "No app attached" and a Detach button that's disabled. The full
 * cross-app coordination (timer follows Notes, etc.) is a follow-up
 * after the design wave lands.
 */

import { el } from '../../../utils/dom.js';

export function buildAttachedRow() {
  const root = el('div', { class: 'sol-attach' });
  root.append(
    el('div', { class: 'sol-attach-hex' }, '◌'),
    el('div', { class: 'sol-attach-body' }, [
      el('b', {}, 'No app attached'),
      el('span', {}, 'Open Pomodoro from another app to bind the timer (coming soon).'),
    ]),
    el('button', { type: 'button', class: 'sol-btn', disabled: 'disabled' }, 'Detach'),
  );
  return { root };
}
