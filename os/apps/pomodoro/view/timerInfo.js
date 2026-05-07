/**
 * pomodoro/view/timerInfo.js — heading copy, controls, cycle pips.
 *
 * Pure DOM builder. Returns { root, update(state, preset, history) }.
 *
 * The pip row shows N circles (N = preset.sessions). Each pip is in one
 * of three visual states:
 *   • done   — past session in this cycle
 *   • active — current session
 *   • idle   — future session
 */

import { el } from '../../../utils/dom.js';
import { todaysSessions } from '../engine/history.js';

function formatHm(ts) {
  if (!Number.isFinite(ts)) return '—';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function pillButton(label, { primary = false, onClick } = {}) {
  const cls = primary ? 'sol-btn sol-btn-primary' : 'sol-btn';
  const btn = el('button', { class: cls, type: 'button' }, label);
  if (typeof onClick === 'function') btn.addEventListener('click', onClick);
  return btn;
}

export function buildTimerInfo({ onPrimary, onExtend, onSkip, onEnd }) {
  const root = el('div', { class: 'sol-info' });

  const headingEl = el('h2', { class: 'sol-info-heading' });
  const subEl = el('p', { class: 'sol-info-sub' });

  const primaryBtn = pillButton('Start', { primary: true, onClick: onPrimary });
  const extendBtn = pillButton('+5 min', { onClick: onExtend });
  const skipBtn = pillButton('Skip break', { onClick: onSkip });
  const endBtn = pillButton('End cycle', { onClick: onEnd });

  const controls = el('div', { class: 'sol-info-controls' }, [primaryBtn, extendBtn, skipBtn, endBtn]);

  const pipRowLabel = el('span', { class: 'sol-pip-label' }, 'TODAY’S CYCLE');
  const pipRow = el('div', { class: 'sol-pip-row' }, [pipRowLabel]);

  root.append(headingEl, subEl, controls, pipRow);

  return {
    root,
    update(state, preset, history) {
      // ── Heading + sub copy ──
      const isLast = state.sessionIndex >= preset.sessions - 1 && state.phase === 'focus';
      if (state.phase === 'idle') {
        headingEl.innerHTML = `Ready when <b>you are</b>.`;
        subEl.textContent = `${preset.name} · ${preset.sessions} focus sessions, ${Math.round(preset.focusMs / 60000)} min each.`;
      } else if (state.phase === 'focus') {
        const ordinal = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][state.sessionIndex] || `${state.sessionIndex + 1}th`;
        const last = isLast ? ', long break next' : '';
        headingEl.innerHTML = `You’re in the <b>${ordinal}</b> cycle${last}.`;
        subEl.textContent = `When this session ends the shell turns to night for a ${Math.round((isLast ? preset.longBreakMs : preset.breakMs) / 60000)}-minute break.`;
      } else if (state.phase === 'break') {
        headingEl.innerHTML = `Break time. <b>Stretch.</b>`;
        subEl.textContent = `Stars are out, dock dims, notifications restored. Next focus picks up the cycle from session ${state.sessionIndex + 1}.`;
      } else if (state.phase === 'longBreak') {
        headingEl.innerHTML = `Cycle complete. <b>Long break.</b>`;
        subEl.textContent = `${Math.round(preset.longBreakMs / 60000)} minutes. After this you’re back to idle — ready to start a fresh cycle.`;
      }

      // ── Buttons ──
      if (state.phase === 'idle') {
        primaryBtn.textContent = 'Start';
      } else if (state.paused) {
        primaryBtn.textContent = 'Resume';
      } else {
        primaryBtn.textContent = 'Pause';
      }

      // Disable contextual buttons.
      extendBtn.disabled = state.phase !== 'focus';
      skipBtn.disabled = !(state.phase === 'break' || state.phase === 'longBreak');
      endBtn.disabled = state.phase === 'idle';

      // ── Cycle pips ──
      // Clear any old pips (preserve the label).
      while (pipRow.children.length > 1) pipRow.removeChild(pipRow.lastChild);
      const today = todaysSessions(history);
      // First N completed-focus entries from today serve as pip labels.
      const completedFocusToday = today.filter((e) => e.kind === 'focus' && e.completed);

      for (let i = 0; i < preset.sessions; i++) {
        const isDone = i < state.sessionIndex;
        const isActive = i === state.sessionIndex && state.phase !== 'idle';
        let cls = 'sol-pip';
        if (isDone) cls += ' is-done';
        else if (isActive) cls += ' is-active';

        let label = '—';
        if (isDone) {
          // Use the start time of the i-th completed focus today, if available.
          const e = completedFocusToday[i];
          if (e && Number.isFinite(e.startedAt)) label = formatHm(e.startedAt);
        } else if (isActive && Number.isFinite(state.startedAt)) {
          label = formatHm(state.startedAt);
        } else {
          label = String(i + 1);
        }

        const dot = el('div', { class: 'sol-pip-dot' }, isDone ? '✓' : String(i + 1));
        const lbl = el('span', { class: 'sol-pip-time' }, label);
        const pip = el('div', { class: cls }, [dot, lbl]);
        pipRow.appendChild(pip);
      }
    },
  };
}
