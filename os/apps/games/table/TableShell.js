/**
 * TableShell.js — Shared salon layout component for Tarneeb + Trix.
 *
 * Mounted by each card-game app inside its `init()`. Owns the chrome
 * (titlebar with traffic lights + game-switch tabs, left preset rail,
 * right scoresheet+banter+emote rail) and slots the host game's felt
 * content into the center.
 *
 * Architecture:
 *   • Shell is a plain class — no framework, builds DOM via el()
 *   • Game owns engine + view; shell is presentation chrome only
 *   • Cross-game tab clicks emit kernel('app:open', otherGameId)
 *   • Banter dispatcher receives reducer events from the host app
 *   • Hand history reads/writes via the host's facade
 *
 * Usage:
 *   const shell = new TableShell({...config});
 *   shell.mount(this.root);
 *   shell.update(state);              // re-renders felt slot + side rail
 *   shell.pushBanter(line);            // forwarded to dispatcher
 *   shell.setTab('felt' | 'history');
 *   shell.destroy();
 */
import { el } from '../../../utils/dom.js';
import { buildHistoryView } from './handHistoryView.js';

const EMOTES = ['👏', '🙏', '😅', '🔥', '👀'];

const SIBLING_GAMES = ['tarneeb', 'trix'];

export class TableShell {
  /**
   * @param {object} cfg
   *   kernel              — for kernel.emit('app:open', otherGameId)
   *   app                 — host App instance (for app.close, app.dispatch)
   *   gameId              — 'tarneeb' | 'trix'
   *   gameLabel           — 'Tarneeb' / 'Trix' (titlebar)
   *   presets             — array of preset descriptors {id, name, subtitle, apply}
   *   history             — facade {load(), append(entry), clear()}
   *   banter              — BanterDispatcher instance
   *   renderFelt(state)   — game-supplied: returns DOM for center area
   *   renderSidePanel?(state) — optional game-supplied right-rail extras
   *                              (rendered between scoresheet and banter)
   *   onPresetApply(p)    — game-supplied: applies preset (typically dispatch)
   *   getScoresheet(state)— game-supplied: returns DOM for scoresheet section
   *   isSetupPhase(state) — game-supplied: returns bool. Setup screen mounts
   *                          INTO the felt slot but the shell hides preset
   *                          rail + scoresheet during setup for clarity.
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.kernel = cfg.kernel;
    this.gameId = cfg.gameId;
    this.activeTab = 'felt';
    this.feed = [];
    this.root = null;
    this.refs = {};
    this._destroyed = false;

    // Wire banter onUpdate → re-render feed
    if (this.cfg.banter) {
      this._origOnUpdate = this.cfg.banter.onUpdate;
      this.cfg.banter.onUpdate = (entries) => {
        this.feed = entries;
        this._renderBanter();
        try { this._origOnUpdate?.(entries); } catch {}
      };
    }
  }

  // ── Lifecycle ──

  mount(parentEl) {
    if (!parentEl) throw new Error('TableShell.mount: parentEl required');
    this.root = el('div', { class: 'table-app-frame' }, [
      this._buildTitlebar(),
      el('div', { class: 'table-stage' }, [
        this._buildLeftRail(),
        this._buildCenter(),
        this._buildRightRail(),
      ]),
    ]);
    parentEl.appendChild(this.root);
    return this;
  }

  /** Re-render felt + scoresheet + presets based on game state. */
  update(state) {
    if (this._destroyed || !this.root) return;
    this._state = state;
    this._renderFeltSlot();
    this._renderScoresheet();
    this._renderPresets();
    this._renderHistoryTab();
    this._renderHostSidePanel();
    this._toggleSetupMode();
  }

  setTab(tab) {
    if (tab !== 'felt' && tab !== 'history') return;
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this._renderTitlebarTabs();
    this._renderTabPanels();
  }

  /** Forward to banter dispatcher (used by emote echo or system lines). */
  pushBanter(line) {
    if (this._destroyed || !this.cfg.banter) return;
    this.cfg.banter.pushSystem(line);
  }

  destroy() {
    this._destroyed = true;
    try { this.cfg.banter?.destroy(); } catch {}
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null;
    this.refs = {};
  }

  // ── DOM builders ──

  _buildTitlebar() {
    const traffic = el('div', { class: 'table-traffic' }, [
      el('i', { class: 'table-traffic-r' }),
      el('i', { class: 'table-traffic-y' }),
      el('i', { class: 'table-traffic-g' }),
    ]);
    const name = el('div', { class: 'table-name' }, [
      el('b', {}, 'the table'),
      ' / ',
      this.cfg.gameLabel || this.gameId,
    ]);
    this.refs.tabsEl = el('div', { class: 'table-tabs' });
    this._renderTitlebarTabs();
    return el('div', { class: 'table-titlebar' }, [traffic, name, this.refs.tabsEl]);
  }

  _renderTitlebarTabs() {
    if (!this.refs.tabsEl) return;
    this.refs.tabsEl.innerHTML = '';
    const tabs = [
      { id: 'tarneeb', label: 'Tarneeb', kind: 'game' },
      { id: 'trix',    label: 'Trix',    kind: 'game' },
      { id: 'history', label: 'Hand history', kind: 'panel' },
    ];
    for (const t of tabs) {
      const isActive = t.kind === 'panel'
        ? (this.activeTab === 'history')
        : (this.gameId === t.id && this.activeTab === 'felt');
      const node = el('span', {
        class: 'table-tab' + (isActive ? ' is-active' : ''),
        role: 'button',
        tabindex: '0',
        onclick: () => this._handleTabClick(t),
      }, t.label);
      this.refs.tabsEl.appendChild(node);
    }
  }

  _handleTabClick(tab) {
    if (tab.kind === 'panel') {
      this.setTab('history');
      return;
    }
    if (tab.id === this.gameId) {
      // Same game tab — go back to felt view
      this.setTab('felt');
      return;
    }
    if (SIBLING_GAMES.includes(tab.id)) {
      // Cross-game switch — let kernel close current and spawn the other
      try { this.kernel?.emit('app:open', tab.id); } catch {}
      // Best-effort close current — the new spawn will replace the window
      try { this.cfg.app?.close?.(); } catch {}
    }
  }

  _buildLeftRail() {
    this.refs.presetWrap = el('div', { class: 'table-rail-presets' });
    return el('aside', { class: 'table-rail-left' }, [
      el('h4', { class: 'table-side-h' }, 'Quick start'),
      this.refs.presetWrap,
    ]);
  }

  _renderPresets() {
    if (!this.refs.presetWrap) return;
    this.refs.presetWrap.innerHTML = '';
    const list = Array.isArray(this.cfg.presets) ? this.cfg.presets : [];
    for (const p of list) {
      const card = el('div', {
        class: 'table-preset',
        role: 'button',
        tabindex: '0',
        onclick: () => this._applyPreset(p),
      }, [
        el('div', { class: 'table-preset-name' }, p.name || p.id),
        p.subtitle ? el('div', { class: 'table-preset-sub' }, p.subtitle) : null,
      ].filter(Boolean));
      this.refs.presetWrap.appendChild(card);
    }
  }

  _applyPreset(preset) {
    if (typeof this.cfg.onPresetApply === 'function') {
      try { this.cfg.onPresetApply(preset); } catch (e) { console.error('[TableShell] preset apply failed', e); }
    } else if (typeof preset.apply === 'function' && this.cfg.app?.dispatch) {
      try { preset.apply(this.cfg.app.dispatch.bind(this.cfg.app)); } catch (e) { console.error(e); }
    }
  }

  _buildCenter() {
    this.refs.feltSlot = el('div', { class: 'table-felt-slot' });
    this.refs.historySlot = el('div', { class: 'table-history-slot', hidden: true });
    return el('div', { class: 'table-felt' }, [this.refs.feltSlot, this.refs.historySlot]);
  }

  _renderFeltSlot() {
    if (!this.refs.feltSlot || typeof this.cfg.renderFelt !== 'function') return;
    if (this.activeTab !== 'felt') return;
    this.refs.feltSlot.innerHTML = '';
    try {
      const node = this.cfg.renderFelt(this._state);
      if (node) this.refs.feltSlot.appendChild(node);
    } catch (e) {
      console.error('[TableShell] renderFelt crash', e);
      this.refs.feltSlot.appendChild(el('div', { class: 'table-felt-error' }, 'Render failed'));
    }
  }

  _renderHistoryTab() {
    if (!this.refs.historySlot) return;
    if (this.activeTab !== 'history') return;
    this.refs.historySlot.innerHTML = '';
    let entries = [];
    try { entries = this.cfg.history?.load?.() || []; } catch {}
    this.refs.historySlot.appendChild(buildHistoryView(this.gameId, entries));
  }

  _renderTabPanels() {
    if (!this.refs.feltSlot || !this.refs.historySlot) return;
    if (this.activeTab === 'felt') {
      this.refs.feltSlot.hidden = false;
      this.refs.historySlot.hidden = true;
      this._renderFeltSlot();
    } else {
      this.refs.feltSlot.hidden = true;
      this.refs.historySlot.hidden = false;
      this._renderHistoryTab();
    }
  }

  _buildRightRail() {
    this.refs.scoresheetWrap = el('div', { class: 'table-rail-scoresheet' });
    this.refs.hostSidePanel = el('div', { class: 'table-rail-host-panel' });
    this.refs.banterWrap = el('div', { class: 'table-banter' });
    this._renderBanter();
    const emoteRow = el('div', { class: 'table-emote-row' },
      EMOTES.map((emote) => el('span', {
        class: 'table-emote',
        role: 'button',
        tabindex: '0',
        onclick: () => this.cfg.banter?.sendEmote?.(emote),
      }, emote)),
    );
    return el('aside', { class: 'table-rail-right' }, [
      this.refs.scoresheetWrap,
      this.refs.hostSidePanel,
      this.refs.banterWrap,
      el('h4', { class: 'table-side-h' }, 'Quick emotes'),
      emoteRow,
    ]);
  }

  _renderScoresheet() {
    if (!this.refs.scoresheetWrap) return;
    this.refs.scoresheetWrap.innerHTML = '';
    if (typeof this.cfg.getScoresheet !== 'function') return;
    try {
      const node = this.cfg.getScoresheet(this._state);
      if (node) this.refs.scoresheetWrap.appendChild(node);
    } catch (e) {
      console.error('[TableShell] getScoresheet crash', e);
    }
  }

  _renderHostSidePanel() {
    if (!this.refs.hostSidePanel) return;
    this.refs.hostSidePanel.innerHTML = '';
    if (typeof this.cfg.renderSidePanel !== 'function') return;
    try {
      const node = this.cfg.renderSidePanel(this._state);
      if (node) this.refs.hostSidePanel.appendChild(node);
    } catch (e) {
      console.error('[TableShell] renderSidePanel crash', e);
    }
  }

  _renderBanter() {
    if (!this.refs.banterWrap) return;
    this.refs.banterWrap.innerHTML = '';
    const head = el('h4', { class: 'table-side-h' }, 'Banter');
    this.refs.banterWrap.appendChild(head);
    if (!this.feed || this.feed.length === 0) {
      this.refs.banterWrap.appendChild(
        el('div', { class: 'table-banter-empty' }, '— silent table —'),
      );
      return;
    }
    for (const entry of this.feed) {
      const role = entry.role || 'opponent';
      const msg = el('div', { class: `table-banter-msg is-${role}` }, [
        el('b', {}, entry.name || ''),
        el('span', {}, ` ${entry.text}`),
      ]);
      this.refs.banterWrap.appendChild(msg);
    }
  }

  _toggleSetupMode() {
    if (!this.root) return;
    const setup = !!(this.cfg.isSetupPhase?.(this._state));
    this.root.classList.toggle('is-setup', setup);
  }
}
