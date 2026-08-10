/**
 * FocusMode.js — the desktop, collapsed to one thing.
 *
 * Hides the grid, dock, search, widgets, folders and status bar, and
 * leaves a clock, a single task, and the Pomodoro ring. Entered with
 * `> focus`, Ctrl+Shift+F, or the Today-bar affordance; left with
 * Escape or the exit button.
 *
 * Why it persists across reloads: a new tab opens dozens of times a day.
 * If a focus session is running, every one of those should reinforce it
 * rather than drop the user into a grid of games. Exit is one key away.
 *
 * Ownership boundaries:
 *   • Task data belongs to `todo/persistence.js` — every write routes
 *     through the v2 reducer helpers so streaks and completedAt stay
 *     consistent with TodoApp's own writes.
 *   • Timer data belongs to `pomodoro/effects.js` — every mutation goes
 *     through runPomodoro, which is the single writer for the live state
 *     AND the session history. The phase machine is not reimplemented here.
 *   • Only `yancotab_focus_v1` (active + pinned task) is ours.
 *
 * Concurrency: PomodoroApp and PomodoroWidget also tick, and all three now
 * route through runPomodoro, which re-reads storage before applying TICK.
 * Whichever fires first advances the phase; the others load the advanced
 * state and no-op. (That invariant used to be asserted here but was false
 * for PomodoroApp, which applied TICK to a cached copy — the reason a
 * naive fix would have double-logged every session. effects.js enforces
 * it now.)
 */

import { buildFocusView, RING_CIRCUMFERENCE } from './focus/focusView.js';
import * as intent from '../../apps/pomodoro/intents.js';
import { getPreset } from '../../apps/pomodoro/engine/presets.js';
import { runPomodoro, activePreset } from '../../apps/pomodoro/effects.js';
import { remainingMs } from '../../apps/pomodoro/engine/state.js';
import {
  loadState as loadPomodoro,
  loadSettings as loadPomodoroSettings,
} from '../../apps/pomodoro/persistence.js';
import {
  loadState as loadTodo,
  getOpenTasks,
  quickToggleTask,
  quickAddTask,
} from '../../apps/todo/persistence.js';
import {
  normalizeFocusState,
  pickFocusTask,
  cycleFocusTask,
  formatMMSS,
  formatElapsed,
  focusPhaseLabel,
  ringProgress,
  isRunning,
} from './focus/focusSession.js';

const FOCUS_KEY = 'yancotab_focus_v1';

function pad(n) { return String(n).padStart(2, '0'); }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export class FocusMode {
  constructor(kernel, shell = null) {
    this.kernel = kernel;
    this.shell = shell;
    this.root = null;
    this.els = {};
    this._interval = null;
    this._onKeyDown = null;
    // kernel.on() returns an unsubscribe function; there is no kernel.off().
    this._unsubTodo = null;
    this._state = normalizeFocusState(this._loadFocus());
    // Cached so the per-second repaint skips the date/label reflow.
    this._lastMinute = -1;
    this._lastTaskId = undefined;
  }

  // ── persistence (ours) ─────────────────────────────────────────

  _loadFocus() {
    try { return this.kernel?.storage?.load?.(FOCUS_KEY); } catch { return null; }
  }

  _saveFocus() {
    try { this.kernel?.storage?.save?.(FOCUS_KEY, this._state); } catch { /* ignore */ }
  }

  // ── lifecycle ──────────────────────────────────────────────────

  isActive() { return !!this._state.active; }

  /** Called at boot: re-enter if the last session never exited. */
  restore() {
    if (this._state.active) this.enter({ persist: false });
  }

  enter({ persist = true } = {}) {
    if (this.root) return;

    // Focus Mode collapses everything. Windows are minimized rather than
    // closed — a focus session should not destroy open work; it survives
    // in the window tray for after. Fallback to closing the active app
    // for any context where the window manager isn't mounted.
    if (this.shell?.wm) {
      try { this.shell.wm.minimizeAll(); } catch { /* ignore */ }
    } else {
      const pid = this.shell?.state?.activePid;
      if (pid) {
        try { this.kernel.processManager.closeProcess(pid); } catch { /* ignore */ }
      }
    }

    this._state.active = true;
    if (persist || !Number.isFinite(this._state.enteredAt)) {
      this._state.enteredAt = Date.now();
    }
    this._saveFocus();

    document.body.classList.add('focus-active');
    this._build();
    this._paint();

    // Move keyboard focus into the overlay. The trigger (status-bar
    // button, search box) is about to become visibility:hidden, which
    // would silently drop focus to <body>; anchoring on the exit button
    // gives Tab a starting point inside the dialog. Safe with the
    // capture-phase key handler: Space/Enter are intercepted there
    // before button activation semantics apply.
    this.els.exit?.focus?.();

    this._interval = setInterval(() => this._tick(), 1000);

    // Capture phase so Escape reaches us before mobileShell's handler,
    // which would otherwise treat it as "close the active app".
    this._onKeyDown = (e) => this._handleKey(e);
    document.addEventListener('keydown', this._onKeyDown, true);

    // A completion in the Todo app or the Today widget must move the
    // focus task on immediately, not on the next second's tick.
    this._unsubTodo = this.kernel.on?.('todo:changed', () => {
      this._lastTaskId = undefined;
      this._paint();
    }) || null;

    this.kernel.emit?.('focus:changed', { active: true });
  }

  exit() {
    if (!this.root) {
      // Keep the persisted flag honest even if we were never mounted.
      if (this._state.active) { this._state.active = false; this._saveFocus(); }
      return;
    }

    this._state.active = false;
    this._state.enteredAt = null;
    this._saveFocus();

    if (this._interval) { clearInterval(this._interval); this._interval = null; }
    if (this._onKeyDown) { document.removeEventListener('keydown', this._onKeyDown, true); this._onKeyDown = null; }
    if (this._unsubTodo) { this._unsubTodo(); this._unsubTodo = null; }

    document.body.classList.remove('focus-active');
    this.root.remove();
    this.root = null;
    this.els = {};
    this._lastMinute = -1;
    this._lastTaskId = undefined;

    this.kernel.emit?.('focus:changed', { active: false });
  }

  toggle() { this.isActive() && this.root ? this.exit() : this.enter(); }

  destroy() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
    if (this._onKeyDown) { document.removeEventListener('keydown', this._onKeyDown, true); this._onKeyDown = null; }
    if (this._unsubTodo) { this._unsubTodo(); this._unsubTodo = null; }
    document.body.classList.remove('focus-active');
    this.root?.remove();
    this.root = null;
  }

  // ── DOM ────────────────────────────────────────────────────────

  _build() {
    const { root, els } = buildFocusView({
      onToggleTimer:  () => this._toggleTimer(),
      onCompleteTask: () => this._completeTask(),
      onCycleTask:    (dir) => this._cycleTask(dir),
      onAddTask:      (text) => this._addTask(text),
      onExit:         () => this.exit(),
    });
    this.root = root;
    this.els = els;
    document.body.appendChild(this.root);
  }

  // ── timer ──────────────────────────────────────────────────────

  /**
   * Which preset governs the running cycle. Keyed off the STATE's
   * presetId first (the preset the cycle actually started with), falling
   * back to settings — see activePreset() in pomodoro/effects.js.
   */
  _preset(state = null) {
    try {
      return activePreset(state || loadPomodoro(this.kernel), loadPomodoroSettings(this.kernel));
    } catch { return getPreset('classic'); }
  }

  /**
   * Every Pomodoro mutation goes through the shared writer. This used to
   * inline the reducer and forward only 'toast' and 'activity' — silently
   * dropping 'sessionLogged', so a session completed inside Focus Mode
   * (which is the entire point of Focus Mode) never reached history, and
   * dropping 'phase', so the end chime never sounded here either.
   */
  _dispatch(action) {
    return runPomodoro(this.kernel, action).state;
  }

  _toggleTimer() {
    const s = loadPomodoro(this.kernel);
    if (s.phase === 'idle') this._dispatch(intent.start());
    else if (s.paused) this._dispatch(intent.resume());
    else this._dispatch(intent.pause());
    this._paint();
  }

  // ── task ───────────────────────────────────────────────────────

  _openTasks() {
    try { return getOpenTasks(loadTodo(this.kernel)); } catch { return []; }
  }

  _completeTask() {
    const current = pickFocusTask(this._openTasks(), this._state.taskId);
    if (!current) return;
    quickToggleTask(this.kernel, current.id);
    // Drop the pin — it points at a task that is no longer open, and
    // pickFocusTask would fall through to first-open anyway.
    this._state.taskId = null;
    this._saveFocus();
    this.kernel.emit?.('toast', { message: 'Task done', type: 'success' });
    this._lastTaskId = undefined;
    this._paint();
  }

  _cycleTask(dir) {
    const open = this._openTasks();
    if (open.length < 2) return;
    const current = pickFocusTask(open, this._state.taskId);
    this._state.taskId = cycleFocusTask(open, current?.id, dir);
    this._saveFocus();
    this._lastTaskId = undefined;
    this._paint();
  }

  _addTask(text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    quickAddTask(this.kernel, clean);
    this.els.taskInput.value = '';
    // Pin whatever landed at the top so the just-typed task is the one
    // shown, rather than an older open task with a lower position.
    const open = this._openTasks();
    const match = open.find((t) => t.text === clean);
    this._state.taskId = match ? match.id : null;
    this._saveFocus();
    this._lastTaskId = undefined;
    this._paint();
  }

  // ── keyboard ───────────────────────────────────────────────────

  _handleKey(e) {
    if (e.isComposing) return;
    const t = e.target;
    const isInput = t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable;

    if (e.key === 'Escape') {
      if (isInput) { t.blur(); }
      else { this.exit(); }
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (isInput) return;

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault(); e.stopPropagation();
      this._toggleTimer();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation();
      this._cycleTask(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      this._cycleTask(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      this._completeTask();
    }
  }

  // ── paint ──────────────────────────────────────────────────────

  _tick() {
    if (!this.root) return;
    // Same TICK the app dispatches — advances the phase when the deadline
    // passes and rolls the day counter over at midnight.
    this._dispatch(intent.tick());
    this._paint();
  }

  _paint() {
    if (!this.root) return;

    const now = new Date();
    const minute = now.getMinutes();
    this.els.clock.textContent = `${pad(now.getHours())}:${pad(minute)}`;
    if (minute !== this._lastMinute) {
      this._lastMinute = minute;
      this.els.date.textContent =
        `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
    }

    // Timer. Load the state first so the preset resolves off the running
    // cycle's own presetId rather than whatever settings currently say.
    const pomo = loadPomodoro(this.kernel);
    const preset = this._preset(pomo);
    const nowMs = Date.now();
    // remainingMs already handles the idle and paused branches; deriving
    // it back out of ringProgress would just lose precision.
    this.els.ringTime.textContent = formatMMSS(remainingMs(pomo, preset, nowMs));
    this.els.phase.textContent = focusPhaseLabel(pomo, preset);

    const fill = this.root.querySelector('.fm-ring-fill');
    if (fill) {
      const offset = RING_CIRCUMFERENCE * (1 - ringProgress(pomo, preset, nowMs));
      fill.setAttribute('stroke-dashoffset', offset.toFixed(2));
    }
    const onBreak = pomo.phase === 'break' || pomo.phase === 'longBreak';
    this.root.classList.toggle('is-running', isRunning(pomo));
    this.root.classList.toggle('is-break', onBreak);
    this.root.classList.toggle('is-paused', !!pomo.paused);

    // Task — only rebuild the text when the shown task actually changes.
    const open = this._openTasks();
    const task = pickFocusTask(open, this._state.taskId);
    const shownId = task ? task.id : null;
    if (shownId !== this._lastTaskId) {
      this._lastTaskId = shownId;
      this.els.taskCard.hidden = !task;
      this.els.taskEmpty.hidden = !!task;
      if (task) {
        this.els.taskText.textContent = task.text;
        this.els.taskNext.hidden = open.length < 2;
      }
    }

    this.els.elapsed.textContent = formatElapsed(this._state.enteredAt, nowMs);
  }
}
