/**
 * WindowTray.js — the taskbar chip row for open windows.
 *
 * One chip per window (app name + close ×). Click focuses/restores;
 * minimized windows render dimmed with a hollow indicator dot. The tray
 * is the only recovery surface for minimized windows whose app isn't in
 * the dock (Calculator, Mail, …), so it mounts as a SIBLING of the app
 * layer — the layer gets display:none when everything is minimized, and
 * the tray must not share that fate.
 *
 * Renders purely from `wm:changed` payloads; holds no window state of
 * its own. Hidden entirely while no windows exist.
 */

import { el } from '../../utils/dom.js';

export class WindowTray {
  constructor(kernel, wm) {
    this.kernel = kernel;
    this.wm = wm;
    // role=group, not toolbar — toolbar mandates roving-tabindex arrow
    // navigation, and plain Tab between a handful of chips is the more
    // honest contract here.
    this.root = el('div', { class: 'wm-tray', role: 'group', 'aria-label': 'Open windows', hidden: true });
    this._chips = new Map(); // pid → chip element
  }

  init() {
    this.kernel.on('wm:changed', ({ windows } = {}) => this._render(windows || []));
  }

  _render(windows) {
    this.root.hidden = windows.length === 0;
    document.body.classList.toggle('has-tray', windows.length > 0);

    const seen = new Set();
    for (const win of windows) {
      seen.add(win.pid);
      let chip = this._chips.get(win.pid);
      if (!chip) {
        chip = this._buildChip(win);
        this._chips.set(win.pid, chip);
        this.root.appendChild(chip);
      }
      chip.classList.toggle('is-minimized', win.minimized);
      chip.classList.toggle('is-focused', win.focused);
      chip.querySelector('.wm-chip-label').textContent = win.name;
      const main = chip.querySelector('.wm-chip-main');
      main.setAttribute('aria-pressed', String(win.focused));
      // The minimized state is otherwise conveyed only by CSS dimming.
      main.setAttribute('aria-label', win.minimized ? `${win.name}, minimized` : win.name);
    }
    for (const [pid, chip] of this._chips) {
      if (!seen.has(pid)) {
        chip.remove();
        this._chips.delete(pid);
      }
    }
  }

  _buildChip(win) {
    // Two sibling buttons in a wrapper — a button must not nest a button.
    const main = el('button', {
      type: 'button',
      class: 'wm-chip-main',
    }, [
      el('span', { class: 'wm-chip-dot', 'aria-hidden': 'true' }),
      el('span', { class: 'wm-chip-label' }, win.name),
    ]);
    main.addEventListener('click', () => this.wm.restore(win.pid));

    const closeBtn = el('button', {
      type: 'button',
      class: 'wm-chip-close',
      'aria-label': `Close ${win.name}`,
    }, '×');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pm = this.kernel.processManager;
      if (!pm.closeProcess(win.pid)) pm.kill(win.pid);
    });

    return el('div', {
      class: 'wm-chip',
      'data-pid': String(win.pid),
    }, [main, closeBtn]);
  }
}
