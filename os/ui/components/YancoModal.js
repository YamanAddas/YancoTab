/**
 * YancoModal.js — Styled modal dialogs
 *
 * Drop-in replacements for native confirm(), prompt(), alert().
 * All three return Promises and use glass-effect cards that
 * match the YancoVerse aesthetic.
 *
 * Usage:
 *   import { showConfirm, showPrompt, showAlert } from './YancoModal.js';
 *   const yes = await showConfirm('Reset?', 'This cannot be undone.', { danger: true });
 *   const name = await showPrompt('Rename', 'Enter new name:', currentName);
 *   await showAlert('Done', 'Export complete.');
 */

/**
 * Show a confirm dialog.
 * @param {string} title
 * @param {string} [body]
 * @param {{ danger?: boolean, confirmLabel?: string, cancelLabel?: string }} [opts]
 * @returns {Promise<boolean>}
 */
export function showConfirm(title, body = '', opts = {}) {
  return _modal({
    title,
    body,
    type: 'confirm',
    danger: opts.danger,
    confirmLabel: opts.confirmLabel || (opts.danger ? 'Delete' : 'Confirm'),
    cancelLabel: opts.cancelLabel || 'Cancel',
  });
}

/**
 * Show a prompt dialog with a text input.
 * @param {string} title
 * @param {string} [body]
 * @param {string} [defaultValue]
 * @param {{ confirmLabel?: string, cancelLabel?: string, placeholder?: string }} [opts]
 * @returns {Promise<string|null>} — input value or null if cancelled
 */
export function showPrompt(title, body = '', defaultValue = '', opts = {}) {
  return _modal({
    title,
    body,
    type: 'prompt',
    defaultValue,
    confirmLabel: opts.confirmLabel || 'OK',
    cancelLabel: opts.cancelLabel || 'Cancel',
    placeholder: opts.placeholder || '',
  });
}

/**
 * Show an alert dialog (single OK button).
 * @param {string} title
 * @param {string} [body]
 * @returns {Promise<void>}
 */
export function showAlert(title, body = '') {
  return _modal({
    title,
    body,
    type: 'alert',
    confirmLabel: 'OK',
  });
}

/* ── Internal builder ── */

function _modal(config) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'ym-backdrop';

    const card = document.createElement('div');
    card.className = 'ym-card';

    // Title
    const h = document.createElement('h3');
    h.className = 'ym-title';
    h.textContent = config.title;
    card.appendChild(h);

    // Body
    if (config.body) {
      const p = document.createElement('p');
      p.className = 'ym-body';
      p.textContent = config.body;
      card.appendChild(p);
    }

    // Input (prompt only)
    let input = null;
    if (config.type === 'prompt') {
      input = document.createElement('input');
      input.className = 'ym-input';
      input.type = 'text';
      input.value = config.defaultValue || '';
      if (config.placeholder) input.placeholder = config.placeholder;
      card.appendChild(input);
    }

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'ym-actions';

    const dismiss = (result) => {
      backdrop.classList.remove('ym-visible');
      setTimeout(() => {
        backdrop.remove();
        resolve(result);
      }, 150);
    };

    if (config.type !== 'alert') {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ym-btn ym-btn--cancel';
      cancelBtn.textContent = config.cancelLabel;
      cancelBtn.onclick = () => dismiss(config.type === 'prompt' ? null : false);
      actions.appendChild(cancelBtn);
    }

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'ym-btn ' + (config.danger ? 'ym-btn--danger' : 'ym-btn--confirm');
    confirmBtn.textContent = config.confirmLabel;
    confirmBtn.onclick = () => {
      if (config.type === 'prompt') dismiss(input.value);
      else if (config.type === 'confirm') dismiss(true);
      else dismiss(undefined);
    };
    actions.appendChild(confirmBtn);
    card.appendChild(actions);

    // Keyboard
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (config.type === 'alert') dismiss(undefined);
        else dismiss(config.type === 'prompt' ? null : false);
      } else if (e.key === 'Enter') {
        e.stopPropagation();
        if (config.type === 'prompt') dismiss(input.value);
        else if (config.type === 'confirm') dismiss(true);
        else dismiss(undefined);
      }
    };

    backdrop.addEventListener('keydown', onKey);
    backdrop.setAttribute('tabindex', '-1');

    // Click outside to cancel (not for alerts)
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) {
        if (config.type === 'alert') dismiss(undefined);
        else dismiss(config.type === 'prompt' ? null : false);
      }
    });

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    // Trigger enter animation
    requestAnimationFrame(() => {
      backdrop.classList.add('ym-visible');
      if (input) {
        input.focus();
        input.select();
      } else {
        backdrop.focus();
      }
    });
  });
}
