// os/ui/sfx.js — Cosmic Atelier WebAudio palette.
// Synthesized, not sampled — keeps the extension under the 10MB store cap
// and avoids decoding latency on first interaction.
//
// Usage:
//   import { sfx } from '/os/ui/sfx.js';
//   sfx.play('tick');          // card flip, snap
//   sfx.play('chime');         // UI confirm
//   sfx.play('swoosh');        // card move
//   sfx.play('win');           // victory cascade
//   sfx.play('fail');          // illegal move
//   sfx.setEnabled(false);     // user preference
//   sfx.setVolume(0.5);
//
// Respects user preferences via kernel.storage:
//   yancotab_sfx_enabled : boolean (default true)
//   yancotab_sfx_volume  : 0..1    (default 0.6)
//
// Lazy-constructs AudioContext on first play (browser autoplay policy).

const DEFAULT_VOLUME = 0.6;

function now(ctx) { return ctx.currentTime; }

// ── Tone primitives ────────────────────────────────────────────────

function tone(ctx, { freq, type = 'sine', start = 0, dur = 0.12, peak = 0.5, attack = 0.005, release = 0.08, slideTo = null, dest }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now(ctx) + start);
  if (slideTo != null) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, now(ctx) + start + dur);
  }
  gain.gain.setValueAtTime(0.0001, now(ctx) + start);
  gain.gain.exponentialRampToValueAtTime(peak, now(ctx) + start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now(ctx) + start + dur + release);
  osc.connect(gain).connect(dest);
  osc.start(now(ctx) + start);
  osc.stop(now(ctx) + start + dur + release + 0.02);
}

function noiseBurst(ctx, { start = 0, dur = 0.08, peak = 0.18, freq = 1200, q = 6, dest }) {
  const bufSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now(ctx) + start);
  gain.gain.exponentialRampToValueAtTime(peak, now(ctx) + start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now(ctx) + start + dur);
  src.connect(filter).connect(gain).connect(dest);
  src.start(now(ctx) + start);
  src.stop(now(ctx) + start + dur + 0.02);
}

// ── Cues ────────────────────────────────────────────────────────────

const CUES = {
  tick(ctx, dest) {
    noiseBurst(ctx, { dur: 0.04, peak: 0.22, freq: 2200, q: 8, dest });
    tone(ctx, { freq: 880, type: 'triangle', dur: 0.05, peak: 0.12, release: 0.04, dest });
  },
  chime(ctx, dest) {
    tone(ctx, { freq: 880, type: 'sine', dur: 0.18, peak: 0.22, release: 0.22, dest });
    tone(ctx, { freq: 1320, type: 'sine', start: 0.02, dur: 0.22, peak: 0.14, release: 0.30, dest });
  },
  swoosh(ctx, dest) {
    noiseBurst(ctx, { dur: 0.18, peak: 0.14, freq: 1400, q: 2, dest });
    tone(ctx, { freq: 520, slideTo: 180, type: 'sawtooth', dur: 0.18, peak: 0.06, release: 0.10, dest });
  },
  win(ctx, dest) {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C E G C
    notes.forEach((f, i) => {
      tone(ctx, { freq: f, type: 'triangle', start: i * 0.09, dur: 0.16, peak: 0.26, release: 0.35, dest });
      tone(ctx, { freq: f * 2, type: 'sine', start: i * 0.09, dur: 0.16, peak: 0.10, release: 0.35, dest });
    });
  },
  fail(ctx, dest) {
    tone(ctx, { freq: 220, slideTo: 140, type: 'square', dur: 0.16, peak: 0.14, release: 0.08, dest });
    noiseBurst(ctx, { dur: 0.10, peak: 0.10, freq: 600, q: 3, dest });
  },
};

// ── Manager ─────────────────────────────────────────────────────────

class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = DEFAULT_VOLUME;
  }

  _ensure() {
    if (this.ctx) return true;
    try {
      const AC = typeof AudioContext !== 'undefined' ? AudioContext : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      return true;
    } catch { return false; }
  }

  play(cue) {
    if (!this.enabled) return;
    if (!this._ensure()) return;
    const fn = CUES[cue];
    if (!fn) return;
    // resume on first gesture if suspended
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    try { fn(this.ctx, this.master); } catch { /* swallow */ }
  }

  setEnabled(v) { this.enabled = !!v; }
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.master) this.master.gain.value = this.volume;
  }

  // Bind to kernel.storage for persistent prefs. Call once at boot.
  async bindStorage(storage) {
    if (!storage) return;
    try {
      const enabled = await storage.get('yancotab_sfx_enabled');
      if (enabled !== undefined && enabled !== null) this.enabled = !!enabled;
      const vol = await storage.get('yancotab_sfx_volume');
      if (typeof vol === 'number') this.setVolume(vol);
    } catch { /* first boot — use defaults */ }
  }
}

export const sfx = new Sfx();
