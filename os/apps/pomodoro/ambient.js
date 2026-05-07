/**
 * pomodoro/ambient.js — wires ambient toggles to real effects.
 *
 *   • autoMute     — body.pomodoro-mute hides .toast (CSS rule lives
 *                    in pomodoro.css). Applied during break + longBreak.
 *   • nightShell   — body.pomodoro-night-shell dims the dock + greeting
 *                    via CSS during break + longBreak. Disjoint from the
 *                    user's actual theme choice.
 *   • endChime     — synthesizes a short two-tone WebAudio bell when a
 *                    'phase' event fires (focus→break, break→focus, etc).
 *                    Lazy AudioContext, resumes on first user gesture.
 *
 * Usage from the app shell:
 *   const ambient = createAmbient();
 *   ambient.applyState(state, settings);   // every render
 *   ambient.handlePhaseEvent({from, to});  // when reducer emits 'phase'
 *   ambient.destroy();                     // on app destroy
 */

const MUTE_CLASS = 'pomodoro-mute';
const NIGHT_CLASS = 'pomodoro-night-shell';

function isBreakPhase(phase) {
  return phase === 'break' || phase === 'longBreak';
}

function setBodyClass(name, on) {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle(name, !!on);
}

/**
 * Synthesize a short bell. Two tones (440 + 660 Hz) with exponential
 * decay over 280ms. Cheap; no asset needed.
 */
function chime(audioCtx) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  for (const [freq, delay, peak] of [[660, 0, 0.18], [440, 0.04, 0.14]]) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(peak, now + delay + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.32);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.34);
  }
}

export function createAmbient() {
  let _audioCtx = null;
  let _settings = { autoMute: false, nightShell: false, endChime: false };
  let _currentPhase = 'idle';

  function ensureAudioCtx() {
    if (typeof window === 'undefined') return null;
    if (_audioCtx) return _audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { _audioCtx = new Ctor(); } catch { _audioCtx = null; }
    return _audioCtx;
  }

  return {
    applyState(state, settings) {
      _settings = settings?.ambient || _settings;
      _currentPhase = state?.phase || 'idle';
      const onBreak = isBreakPhase(_currentPhase);
      setBodyClass(MUTE_CLASS, onBreak && !!_settings.autoMute);
      setBodyClass(NIGHT_CLASS, onBreak && !!_settings.nightShell);
    },

    handlePhaseEvent(/* ev */) {
      if (!_settings.endChime) return;
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      // First user gesture might leave the context suspended — try resuming.
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      try { chime(ctx); } catch { /* ignore */ }
    },

    destroy() {
      setBodyClass(MUTE_CLASS, false);
      setBodyClass(NIGHT_CLASS, false);
      if (_audioCtx && typeof _audioCtx.close === 'function') {
        try { _audioCtx.close(); } catch { /* ignore */ }
      }
      _audioCtx = null;
    },
  };
}
