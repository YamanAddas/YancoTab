/**
 * TodoApp — Mission Control redesign.
 *
 * 3-column layout: side rail (missions + recurring + streaks) | stage
 * (4 launchpad pads + intraday timeline) | review rail (mission %,
 * week stats, blurb). Title bar tabs (Launchpad/Today/Week/Review)
 * are wired in PR-2 only for Launchpad — the rest become real later.
 */

import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { showConfirm, showPrompt, showAlert } from '../ui/components/YancoModal.js';
import { loadState, saveState, subscribe } from './todo/persistence.js';
import { getActiveMission, COLORS } from './todo/engine/state.js';
import * as intent from './todo/intents.js';
import { buildSideRail } from './todo/view/sideRail.js';
import { buildLaunchpad } from './todo/view/launchpad.js';
import { buildReviewRail } from './todo/view/reviewRail.js';
import { buildTodayTab } from './todo/view/todayTab.js';
import { buildWeekTab } from './todo/view/weekTab.js';
import { buildReviewTab } from './todo/view/reviewTab.js';

const TABS = ['Launchpad', 'Today', 'Week', 'Review'];

function css(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  return link;
}

function colorVar(color) {
  switch (color) {
    case 'cool':   return 'var(--cool, #5aa8ff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'green':  return 'var(--green, #2dcf6a)';
    default:       return 'var(--accent, #00e5c1)';
  }
}

export class TodoApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Todo', id: 'todo', icon: '✅' };
    this._state = null;
    this._unsubscribe = null;
    this._activeTab = 'Launchpad';
    this._views = {};
    this._styleLinks = [];
    this._tickHandle = null;
  }

  async init() {
    this._styleLinks = [css('css/todo.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));

    this._state = loadState(this.kernel);
    this._unsubscribe = subscribe(this.kernel, (s) => {
      this._state = s;
      this._renderAll();
    });

    this.root = el('div', { class: 'app-window app-todo', tabindex: '0' });
    this.root.appendChild(this._buildFrame());
    this._renderAll();

    // 1-minute tick refreshes the relative time labels (in 14m → in 13m, etc).
    this._tickHandle = setInterval(() => this._renderAll(), 60_000);
  }

  _buildFrame() {
    // Title bar (tabs only — WindowChrome owns controls + title)
    const titlebar = el('div', { class: 'mc-titlebar' });
    const tabs = el('div', { class: 'mc-tabs' });
    for (const name of TABS) {
      const tab = el('button', {
        type: 'button',
        class: `mc-tab${name === this._activeTab ? ' is-active' : ''}`,
        'data-tab': name,
      }, name);
      tab.addEventListener('click', () => this._setTab(name));
      tabs.appendChild(tab);
    }
    titlebar.appendChild(tabs);

    // Side rail
    this._views.side = buildSideRail({
      onPickMission: (id) => this._setActiveMission(id),
      onAddMission: () => this._addMission(),
      onMissionContextMenu: (id) => this._missionContextMenu(id),
    });

    // Launchpad (stage)
    this._views.launchpad = buildLaunchpad({
      onAddTask: (padId, text) => this._addTaskToPad(padId, text),
      onDropTask: (taskId, padId) => this._dropTaskOnPad(taskId, padId),
      onToggle: (taskId) => this._toggleTask(taskId),
      onDelete: (taskId) => this._deleteTask(taskId),
      onOpenEditor: (taskId) => this._openEditor(taskId),
    });

    // Review rail
    this._views.review = buildReviewRail();

    // Today tab — cross-mission actionable + intraday timeline
    this._views.todayTab = buildTodayTab({
      onToggle: (mid, tid) => this._toggleTaskIn(mid, tid),
      onOpenEditor: (mid, tid) => this._openEditorIn(mid, tid),
      onDelete: (mid, tid) => this._deleteTaskIn(mid, tid),
    });
    this._views.todayTab.root.classList.add('mc-tab-panel');
    this._views.todayTab.root.style.display = 'none';

    // Week tab
    this._views.weekTab = buildWeekTab({
      onToggle: (mid, tid) => this._toggleTaskIn(mid, tid),
      onOpenEditor: (mid, tid) => this._openEditorIn(mid, tid),
    });
    this._views.weekTab.root.classList.add('mc-tab-panel');
    this._views.weekTab.root.style.display = 'none';

    // Review tab
    this._views.reviewTab = buildReviewTab();
    this._views.reviewTab.root.classList.add('mc-tab-panel');
    this._views.reviewTab.root.style.display = 'none';

    const stage = el('div', { class: 'mc-stage' }, [
      this._views.launchpad.root,
      this._views.todayTab.root,
      this._views.weekTab.root,
      this._views.reviewTab.root,
    ]);
    this._views.stage = stage;

    const layout = el('div', { class: 'mc-layout' }, [
      this._views.side.root,
      stage,
      this._views.review.root,
    ]);
    return el('div', { class: 'mc-frame' }, [titlebar, layout]);
  }

  // ── Tab switching ────────────────────────────────────────

  _setTab(name) {
    if (this._activeTab === name) return;
    this._activeTab = name;
    this._renderTabState();
  }

  _renderTabState() {
    for (const t of this.root.querySelectorAll('[data-tab]')) {
      t.classList.toggle('is-active', t.dataset.tab === this._activeTab);
    }
    const panels = {
      // Launchpad uses CSS `display: grid`; the others use flex. We
      // pass empty-string to clear the inline override and let the
      // stylesheet decide (and explicit 'none' to hide inactive).
      Launchpad: { node: this._views.launchpad.root,    activeDisplay: '' },
      Today:     { node: this._views.todayTab.root,      activeDisplay: 'flex' },
      Week:      { node: this._views.weekTab.root,       activeDisplay: 'flex' },
      Review:    { node: this._views.reviewTab.root,     activeDisplay: 'flex' },
    };
    for (const [name, { node, activeDisplay }] of Object.entries(panels)) {
      if (!node) continue;
      node.style.display = name === this._activeTab ? activeDisplay : 'none';
    }
  }

  // ── State + actions ──────────────────────────────────────

  _commit(nextState) {
    if (nextState === this._state) return;
    this._state = nextState;
    saveState(this.kernel, nextState);
    this._renderAll();
  }

  _setActiveMission(id) {
    this._commit(intent.setActiveMission(this._state, id));
  }

  async _addMission() {
    const name = await showPrompt('New Mission', 'Mission name:');
    if (!name || !name.trim()) return;
    // Pick the next color in rotation.
    const used = this._state.missions.map((m) => m.color);
    const color = COLORS.find((c) => !used.includes(c)) || COLORS[this._state.missions.length % COLORS.length];
    this._commit(intent.addMission(this._state, { name, color }));
  }

  async _missionContextMenu(id) {
    const m = this._state.missions.find((x) => x.id === id);
    if (!m) return;
    const newName = await showPrompt(`Rename "${m.name}"`, 'New name (or empty to delete):', m.name);
    if (newName === null) return;
    if (newName.trim() === '') {
      if (this._state.missions.length <= 1) {
        await showAlert('Cannot delete', 'You must keep at least one mission.');
        return;
      }
      const ok = await showConfirm('Delete mission', `Delete "${m.name}" and ${m.tasks.length} task(s)?`, { danger: true });
      if (!ok) return;
      this._commit(intent.deleteMission(this._state, id));
    } else {
      this._commit(intent.renameMission(this._state, id, newName));
    }
  }

  _addTaskToPad(padId, text) {
    const mission = getActiveMission(this._state);
    if (!mission) return;
    const patch = padDefaults(padId);
    this._commit(intent.addTask(this._state, mission.id, { text, ...patch }));
  }

  _dropTaskOnPad(taskId, padId) {
    const mission = getActiveMission(this._state);
    if (!mission) return;
    const patch = padDropPatch(padId);
    if (!patch) return;
    this._commit(intent.updateTask(this._state, mission.id, taskId, patch));
  }

  _toggleTask(taskId) {
    const mission = getActiveMission(this._state);
    if (!mission) return;
    this._commit(intent.toggleDone(this._state, mission.id, taskId));
  }

  async _deleteTask(taskId) {
    const mission = getActiveMission(this._state);
    if (!mission) return;
    this._commit(intent.deleteTask(this._state, mission.id, taskId));
  }

  // Cross-mission variants used by the Today / Week / Review tabs
  // where the rocket may belong to a different mission than the active.
  _toggleTaskIn(missionId, taskId) {
    this._commit(intent.toggleDone(this._state, missionId, taskId));
  }
  _deleteTaskIn(missionId, taskId) {
    this._commit(intent.deleteTask(this._state, missionId, taskId));
  }
  async _openEditorIn(missionId, taskId) {
    const m = this._state.missions.find((x) => x.id === missionId);
    const t = m?.tasks.find((x) => x.id === taskId);
    if (!m || !t) return;
    const newText = await showPrompt('Edit task', 'Task text:', t.text);
    if (newText === null) return;
    if (newText.trim() === '') {
      const ok = await showConfirm('Delete task', 'Empty text — delete this task?', { danger: true });
      if (ok) this._commit(intent.deleteTask(this._state, missionId, taskId));
      return;
    }
    this._commit(intent.setText(this._state, missionId, taskId, newText));
  }

  async _openEditor(taskId) {
    const mission = getActiveMission(this._state);
    if (!mission) return;
    const t = mission.tasks.find((x) => x.id === taskId);
    if (!t) return;
    const newText = await showPrompt('Edit task', 'Task text:', t.text);
    if (newText === null) return;
    if (newText.trim() === '') {
      const ok = await showConfirm('Delete task', 'Empty text — delete this task?', { danger: true });
      if (ok) this._commit(intent.deleteTask(this._state, mission.id, taskId));
      return;
    }
    this._commit(intent.setText(this._state, mission.id, taskId, newText));
  }

  // ── Render ───────────────────────────────────────────────

  _renderAll() {
    if (!this.root || !this._state) return;
    const mission = getActiveMission(this._state);
    const now = Date.now();
    this._views.side.update(this._state);
    this._views.launchpad.update(mission, now);
    this._views.review.update(this._state);
    this._views.todayTab.update(this._state, now);
    this._views.weekTab.update(this._state, {}, now);
    this._views.reviewTab.update(this._state, {}, now);
    this._renderTabState();
    // Tint the active mission's color via a CSS variable on the frame.
    if (mission) {
      this.root.style.setProperty('--mc-mission-color', colorVar(mission.color));
    }
  }

  destroy() {
    if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null; }
    if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
    if (this._styleLinks) {
      for (const l of this._styleLinks) l.remove();
      this._styleLinks = [];
    }
    super.destroy();
  }
}

// ── Pad-level intent helpers ───────────────────────────────

function todayAt(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString().slice(0, 16); // 'YYYY-MM-DDTHH:MM'
}

function tomorrowAt(hour) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function padDefaults(padId) {
  switch (padId) {
    case 'today':     return { dueAt: todayAt(17), priority: 'normal' };
    case 'launching': return { dueAt: todayAt(17), priority: 'high' };
    case 'queue':     return { dueAt: tomorrowAt(17), priority: 'normal' };
    case 'hangar':
    default:          return { dueAt: null, priority: 'normal' };
  }
}

function padDropPatch(padId) {
  switch (padId) {
    case 'hangar':    return { priority: 'normal', dueAt: null };
    case 'queue':     return { priority: 'normal', dueAt: tomorrowAt(17) };
    case 'today':     return { priority: 'normal', dueAt: todayAt(17) };
    case 'launching': return { priority: 'high' };
    default:          return null;
  }
}
