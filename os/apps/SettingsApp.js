/**
 * SettingsApp — Mission Console redesign.
 *
 * Layout: 220px sidebar (Console / Trust / Account + status pill) +
 * stage with multiple console "bays" stacked vertically. Title bar
 * has 4 tabs (Console / Privacy / Sync / About) that filter which
 * bays are visible.
 *
 * The 6 legacy renderXxx modules (AppearanceSettings, AppsSettings,
 * BrowserSettings, GamesSettings, HomeSettings, AboutSettings) keep
 * working as-is — they call `app._toggleRow(...)` etc., which we
 * delegate to the new components.js builders.
 */

import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { renderAppearance } from './settings/AppearanceSettings.js';
import { renderHome } from './settings/HomeSettings.js';
import { renderGames } from './settings/GamesSettings.js';
import { renderApps } from './settings/AppsSettings.js';
import { renderBrowser } from './settings/BrowserSettings.js';
import { renderAbout } from './settings/AboutSettings.js';

import * as components from './settings/components.js';
import { buildSideRail } from './settings/view/sideRail.js';
import { buildRituals } from './settings/view/rituals.js';
import { buildSettingsBay } from './settings/view/settingsBay.js';
import { buildPrivacyBay } from './settings/view/privacyBay.js';
import { buildSyncBay } from './settings/view/syncBay.js';

import { apply as applyRitual, getRitual, RITUALS } from './settings/engine/rituals.js';
import { makeBuffer, record as recordSync } from './settings/engine/syncLog.js';
import { loadState as loadConsoleState, saveState as saveConsoleState } from './settings/persistence.js';

const TABS = ['Console', 'Privacy', 'Sync', 'About'];

// Keys we subscribe to for the sync diagnostics buffer. Curated set
// — not the entire registry (that would be ~25 listeners). The
// "interesting" user-data keys are enough to demo the log.
const SYNC_OBSERVE_KEYS = [
  'yancotab_notes_meta_v2',
  'yancotab_todo_v2',
  'yancotab_browser_v2',
  'yancotab_pomodoro_v1',
  'yancotab_pomodoro_settings_v1',
  'yancotab_pomodoro_history_v1',
  'yancotab_clock_v3',
  'yancotab_theme_mode',
  'yancotab_widgets',
  'yancotab_quick_links',
  'yancotab_user_name',
  'yancotab_settings_console_v1',
];

function css(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  return link;
}

export class SettingsApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Settings', id: 'settings', icon: '⚙️' };
    this._activeTab = 'Console';
    this._views = {};
    this._bays = new Map();
    this._consoleState = null;
    this._syncBuffer = makeBuffer();
    this._unsubs = [];
    this._styleLinks = [];
  }

  async init() {
    this._styleLinks = [css('css/settings.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));

    this._consoleState = loadConsoleState(this.kernel);

    this.root = el('div', { class: 'app-window app-settings-console', tabindex: '0' });
    this.root.appendChild(this._buildFrame());

    this._subscribeToStorage();
    this._renderAll();
  }

  destroy() {
    for (const off of this._unsubs) {
      try { off(); } catch { /* ignore */ }
    }
    this._unsubs = [];
    if (this._styleLinks) {
      for (const l of this._styleLinks) l.remove();
      this._styleLinks = [];
    }
    super.destroy();
  }

  // ── Shared helpers exposed for the legacy renderXxx modules ───
  // They call `app._group(...)`, `app._toggleRow(...)`, etc. We
  // delegate to the components.js builders so existing modules keep
  // working with no changes.
  _group(t, c)        { return components.group(t, c); }
  _toggleRow(l, d, on, cb) { return components.toggleRow(l, d, on, cb); }
  _choiceRow(l, sel, cb)   { return components.choiceRow(l, sel, cb); }
  _actionRow(l, d, a, dn)  { return components.actionRow(l, d, a, dn); }
  _dataRow(l, v)           { return components.dataRow(l, v); }
  _infoRow(l, t)           { return components.infoRow(l, t); }
  _aboutRow(l, v)          { return components.aboutRow(l, v); }
  _renderContent() {
    // Legacy hook some modules call to "rerender" — we just refresh
    // every bay; cheap.
    this._renderAll();
  }

  // ── Frame build ────────────────────────────────────────────────

  _buildFrame() {
    // Title bar (tabs only).
    const titlebar = el('div', { class: 'mc-set-titlebar' });
    const tabs = el('div', { class: 'mc-set-tabs' });
    for (const name of TABS) {
      const t = el('button', {
        type: 'button',
        class: `mc-set-tab${name === this._activeTab ? ' is-active' : ''}`,
        'data-tab': name,
      }, name);
      t.addEventListener('click', () => this._setTab(name));
      tabs.appendChild(t);
    }
    titlebar.appendChild(tabs);

    // Side rail
    this._views.sideRail = buildSideRail({
      onPickItem: (id) => this._scrollToBay(id),
    });

    // Ritual cards
    this._views.rituals = buildRituals({
      onApplyRitual: (id) => this._applyRitual(id),
    });

    // Build the bays in the order they appear on the Console tab.
    const grid = el('div', { class: 'mc-bays' });
    this._addBay(grid, 'appearance', { tab: 'Console' },
      buildSettingsBay({ id: 'appearance', title: 'Appearance', color: 'violet',
        render: renderAppearance, app: this }));
    this._addBay(grid, 'home', { tab: 'Console' },
      buildSettingsBay({ id: 'home', title: 'Apps & dock', color: 'warm',
        render: renderHome, app: this }));
    this._addBay(grid, 'apps', { tab: 'Console' },
      buildSettingsBay({ id: 'apps', title: 'Apps & data', color: 'cool',
        render: renderApps, app: this }));
    this._addBay(grid, 'browser', { tab: 'Console' },
      buildSettingsBay({ id: 'browser', title: 'Browser & ⌘K', color: 'cool',
        render: renderBrowser, app: this }));
    this._addBay(grid, 'games', { tab: 'Console' },
      buildSettingsBay({ id: 'games', title: 'Games', color: 'rose',
        render: renderGames, app: this }));
    this._addBay(grid, 'privacy', { tab: 'Privacy' }, buildPrivacyBay());
    this._addBay(grid, 'sync', { tab: 'Sync' }, buildSyncBay());
    this._addBay(grid, 'about', { tab: 'About' },
      buildSettingsBay({ id: 'about', title: 'About', color: 'rose',
        render: renderAbout, app: this, extraClass: 'mc-bay-about' }));

    const stage = el('div', { class: 'mc-set-stage' }, [this._views.rituals.root, grid]);
    this._views.stage = stage;

    const layout = el('div', { class: 'mc-set-layout' }, [this._views.sideRail.root, stage]);
    return el('div', { class: 'mc-set-frame' }, [titlebar, layout]);
  }

  _addBay(container, id, meta, view) {
    container.appendChild(view.root);
    this._bays.set(id, { view, meta });
  }

  // ── Tabs + scroll ──────────────────────────────────────────────

  _setTab(name) {
    if (this._activeTab === name) return;
    this._activeTab = name;
    this._renderTabState();
  }

  _renderTabState() {
    for (const t of this.root.querySelectorAll('[data-tab]')) {
      t.classList.toggle('is-active', t.dataset.tab === this._activeTab);
    }
    // Filter visible bays by their `tab` meta. The Quick rituals row
    // shows on Console only.
    this._views.rituals.root.style.display = this._activeTab === 'Console' ? '' : 'none';
    for (const [, { view, meta }] of this._bays) {
      const visible = meta.tab === this._activeTab;
      view.root.style.display = visible ? '' : 'none';
    }
  }

  _scrollToBay(id) {
    const entry = this._bays.get(id);
    if (!entry) return;
    // If the bay belongs to a different tab, switch to that tab first.
    if (entry.meta.tab !== this._activeTab) {
      this._setTab(entry.meta.tab);
    }
    // Then scroll. Defer one frame so the display: '' takes effect.
    requestAnimationFrame(() => {
      entry.view.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ── Ritual application ────────────────────────────────────────

  _applyRitual(id) {
    const ritual = getRitual(id);
    if (!ritual) return;
    const result = applyRitual(ritual, this.kernel.storage);

    if (result.ok) {
      this.kernel.emit('toast', {
        message: `${ritual.name} applied`,
        type: 'success',
      });
      // Side-effects: fire any open/reorder intents the ritual
      // declared. These are NOT atomic with the writes — by the time
      // they run, the write already committed.
      for (const sx of (ritual.sideEffects || [])) {
        if (sx.type === 'open' && sx.appId) {
          this.kernel.emit('app:open', sx.appId);
        }
        // 'reorderDockGamesFirst' — PR-3: dispatch to the dock state.
      }
      // Tell apps to reconcile from storage.
      const changedKeys = result.changedKeys || result.applied || [];
      try {
        window.dispatchEvent(new CustomEvent('yancotab:settings-changed', {
          detail: { keys: changedKeys },
        }));
      } catch { /* ignore */ }
    } else {
      this.kernel.emit('toast', {
        message: `${ritual.name} failed${result.restored ? ' · rolled back' : ''}`,
        type: 'error',
      });
    }

    // Update the status pill regardless of outcome.
    this._consoleState = {
      lastRitual: id,
      lastRitualAt: Date.now(),
      lastRitualOk: !!result.ok,
    };
    saveConsoleState(this.kernel, this._consoleState);
    this._renderAll();
  }

  // ── Sync log subscription ─────────────────────────────────────

  _subscribeToStorage() {
    if (!this.kernel?.storage?.subscribe) return;
    for (const key of SYNC_OBSERVE_KEYS) {
      try {
        const off = this.kernel.storage.subscribe(key, (event) => {
          // Drop oldValue/newValue at the boundary as defense in depth.
          this._syncBuffer = recordSync(this._syncBuffer, {
            key: event?.key || key,
            source: event?.source || 'local',
            chunks: 1,
          });
          const syncBay = this._bays.get('sync');
          if (syncBay) syncBay.view.update(this._syncBuffer);
        });
        if (typeof off === 'function') this._unsubs.push(off);
      } catch { /* ignore — key may not be registered */ }
    }
  }

  // ── Render ────────────────────────────────────────────────────

  _renderAll() {
    if (!this.root) return;
    this._views.sideRail.update(this._consoleState);
    // The bay update functions have different signatures:
    //   • sync bay  — takes the sync buffer
    //   • settings bays — refresh their legacy module
    //   • privacy bay  — refresh static facts (no arg)
    // We dispatch by id so we hand each one the right thing.
    for (const [id, { view }] of this._bays) {
      if (typeof view.update !== 'function') continue;
      try {
        if (id === 'sync') view.update(this._syncBuffer);
        else view.update();
      } catch { /* ignore */ }
    }
    this._renderTabState();
  }
}
