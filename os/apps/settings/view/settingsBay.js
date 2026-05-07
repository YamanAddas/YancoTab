/**
 * settings/view/settingsBay.js — wraps an existing renderXxx() module
 * inside a console bay. Lets the 6 legacy modules ship without changes
 * by mounting their output as the bay body.
 */

import { buildBay } from './bay.js';

/**
 * @param {object} opts
 * @param {string} opts.id          — bay id (e.g. 'appearance')
 * @param {string} opts.title       — bay title
 * @param {string} opts.color       — badge color (one of cosmic palette)
 * @param {Function} opts.render    — (container, app) => void; existing renderXxx
 * @param {object} opts.app         — SettingsApp instance with shared helpers
 */
export function buildSettingsBay({ id, title, color, render, app, extraClass = '' }) {
  const bay = buildBay({ id, title, color, extraClass });

  const refresh = () => {
    bay.body.innerHTML = '';
    try {
      render(bay.body, app);
    } catch (e) {
      console.error(`[settings bay ${id}] render failed`, e);
      bay.body.innerHTML = '';
      const errEl = document.createElement('div');
      errEl.className = 'mc-bay-error';
      errEl.textContent = `Could not render ${title}.`;
      bay.body.appendChild(errEl);
    }
  };

  refresh();
  return { root: bay.root, update: refresh };
}
