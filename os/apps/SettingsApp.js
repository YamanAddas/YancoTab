import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { renderAppearance } from './settings/AppearanceSettings.js';
import { renderHome } from './settings/HomeSettings.js';
import { renderGames } from './settings/GamesSettings.js';
import { renderApps } from './settings/AppsSettings.js';
import { renderBrowser } from './settings/BrowserSettings.js';
import { renderAbout } from './settings/AboutSettings.js';

export class SettingsApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Settings', id: 'settings', icon: '⚙️' };
    this.state = { activeCategory: 'appearance' };
  }

  async init() {
    this.root = el('div', { class: 'app-window ys-settings-app' });

    const sidebar = el('div', { class: 'ys-sidebar' });
    this.contentArea = el('div', { class: 'ys-content' });

    this.categories = [
      { id: 'appearance', label: 'Appearance', icon: '🎨' },
      { id: 'homescreen', label: 'Home', icon: '📱' },
      { id: 'games', label: 'Games', icon: '🎮' },
      { id: 'apps', label: 'Apps', icon: '📦' },
      { id: 'browser', label: 'Browser', icon: '🌐' },
      { id: 'about', label: 'About', icon: 'ℹ️' },
    ];

    this.categories.forEach((cat) => {
      const btn = el('button', {
        type: 'button',
        class: `ys-nav-item ${this.state.activeCategory === cat.id ? 'active' : ''}`,
        onclick: () => {
          this.state.activeCategory = cat.id;
          this._updateSidebar(sidebar);
          this._renderContent();
        },
      }, [
        el('span', { class: 'ys-nav-icon' }, cat.icon),
        el('span', {}, cat.label),
      ]);
      sidebar.appendChild(btn);
    });

    this.sidebar = sidebar;
    this.root.append(sidebar, this.contentArea);
    this._renderContent();
  }

  _updateSidebar(sidebar) {
    Array.from(sidebar.children).forEach((child, i) => {
      const isActive = this.categories[i].id === this.state.activeCategory;
      child.classList.toggle('active', isActive);
      if (isActive && typeof child.scrollIntoView === 'function') {
        child.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    });
  }

  _renderContent() {
    this.contentArea.innerHTML = '';
    const titles = {
      appearance: 'Appearance', homescreen: 'Home Screen', games: 'Games',
      apps: 'Apps', browser: 'Browser', about: 'About',
    };
    const header = el('div', { class: 'ys-header' }, [
      el('div', { class: 'ys-title' }, titles[this.state.activeCategory] || 'Settings'),
      el('button', { type: 'button', class: 'ys-btn', onclick: () => this.close() }, 'Done'),
    ]);
    const scroll = el('div', { class: 'ys-scroll' });

    switch (this.state.activeCategory) {
      case 'appearance': renderAppearance(scroll, this); break;
      case 'homescreen': renderHome(scroll, this); break;
      case 'games': renderGames(scroll, this); break;
      case 'apps': renderApps(scroll, this); break;
      case 'browser': renderBrowser(scroll, this); break;
      case 'about': renderAbout(scroll, this); break;
      default: renderAppearance(scroll, this);
    }
    this.contentArea.append(header, scroll);
  }

  /* ── Shared UI builders (used by all settings modules) ── */

  _group(title, children) {
    return el('section', { class: 'ys-group' }, [
      el('div', { class: 'ys-group-title' }, title),
      el('div', { class: 'ys-card' }, children),
    ]);
  }

  _toggleRow(label, desc, isOn, onToggle) {
    const toggle = el('button', {
      type: 'button', class: `ys-toggle ${isOn ? 'on' : ''}`, 'aria-pressed': String(isOn),
    }, [el('span', { class: 'ys-toggle-knob' })]);
    toggle.onclick = () => {
      const next = !toggle.classList.contains('on');
      toggle.classList.toggle('on', next);
      toggle.setAttribute('aria-pressed', String(next));
      onToggle(next);
    };
    return el('div', { class: 'ys-row' }, [
      el('div', { class: 'ys-info' }, [
        el('div', { class: 'ys-label' }, label),
        ...(desc ? [el('div', { class: 'ys-desc' }, desc)] : []),
      ]),
      toggle,
    ]);
  }

  _choiceRow(label, isSelected, onSelect) {
    return el('button', { type: 'button', class: 'ys-choice', onclick: onSelect }, [
      el('div', { class: 'ys-label' }, label),
      el('div', { class: 'ys-check', style: isSelected ? '' : 'visibility:hidden;' }, '✓'),
    ]);
  }

  _actionRow(label, desc, action, isDanger = false) {
    return el('button', { type: 'button', class: 'ys-action', onclick: action }, [
      el('div', { class: 'ys-info' }, [
        el('div', { class: `ys-label ${isDanger ? 'is-danger' : ''}` }, label),
        ...(desc ? [el('div', { class: 'ys-desc' }, desc)] : []),
      ]),
      el('div', { class: 'ys-chevron' }, '›'),
    ]);
  }

  _dataRow(label, value) {
    return el('div', { class: 'ys-row' }, [
      el('div', { class: 'ys-label' }, label),
      el('div', { class: 'ys-desc', style: 'margin-top:0; text-align:right;' }, value),
    ]);
  }

  _infoRow(label, text) {
    return el('div', { class: 'ys-row' }, [
      el('div', { class: 'ys-info' }, [
        el('div', { class: 'ys-label' }, label),
        el('div', { class: 'ys-desc' }, text),
      ]),
    ]);
  }

  _aboutRow(label, value) {
    return el('div', { class: 'ys-about-row' }, [
      el('div', { class: 'ys-about-key' }, label),
      el('div', { class: 'ys-about-value' }, value),
    ]);
  }
}
