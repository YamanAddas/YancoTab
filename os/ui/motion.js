// os/ui/motion.js — Cosmic Atelier motion primitives.
// Choreography helpers: staggered entrances, spring settles, reduced-motion respect.
//
// All timings are tuned for the YancoVerse feel — short, spring-eased, confident.
// Respects `prefers-reduced-motion: reduce` by collapsing durations to ~60ms and
// dropping overshoot.

export const SPRINGS = {
  soft:  'cubic-bezier(0.22, 1.20, 0.36, 1.00)',
  snap:  'cubic-bezier(0.34, 1.56, 0.64, 1.00)',
  heavy: 'cubic-bezier(0.18, 1.10, 0.32, 1.00)',
};

export function prefersReducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

function dur(ms) { return prefersReducedMotion() ? Math.min(ms, 80) : ms; }
function easing(kind) { return prefersReducedMotion() ? 'ease-out' : (SPRINGS[kind] || SPRINGS.snap); }

// Stagger a function across items with a per-item delay.
// Returns a promise that resolves after the last item has been invoked + its duration.
export function stagger(items, fn, { delayMs = 40, perDurMs = 300 } = {}) {
  const d = prefersReducedMotion() ? 0 : delayMs;
  return new Promise((resolve) => {
    let fired = 0;
    const total = items.length;
    if (total === 0) return resolve();
    items.forEach((item, i) => {
      setTimeout(() => { try { fn(item, i); } catch { /* swallow */ } fired++; if (fired === total) setTimeout(resolve, perDurMs); }, i * d);
    });
  });
}

// Animate one element from → to via Web Animations API. Returns the Animation.
// `from` and `to` are style objects. Falls back to no-op if WAAPI unavailable.
export function settle(el, from, to, { spring = 'snap', durationMs = 320 } = {}) {
  if (!el || typeof el.animate !== 'function') return null;
  const keyframes = [from, to];
  return el.animate(keyframes, {
    duration: dur(durationMs),
    easing: easing(spring),
    fill: 'both',
  });
}

// Fade + slide in. `direction` in 'up'|'down'|'left'|'right'|'none'.
export function enter(el, { direction = 'up', distancePx = 12, spring = 'snap', durationMs = 360 } = {}) {
  const offsets = { up: [0, distancePx], down: [0, -distancePx], left: [distancePx, 0], right: [-distancePx, 0], none: [0, 0] };
  const [tx, ty] = offsets[direction] || offsets.up;
  return settle(el,
    { opacity: 0, transform: `translate(${tx}px, ${ty}px) scale(0.985)` },
    { opacity: 1, transform: 'translate(0, 0) scale(1)' },
    { spring, durationMs }
  );
}

export function exit(el, { direction = 'down', distancePx = 12, spring = 'soft', durationMs = 220 } = {}) {
  const offsets = { up: [0, -distancePx], down: [0, distancePx], left: [-distancePx, 0], right: [distancePx, 0], none: [0, 0] };
  const [tx, ty] = offsets[direction] || offsets.down;
  return settle(el,
    { opacity: 1, transform: 'translate(0, 0) scale(1)' },
    { opacity: 0, transform: `translate(${tx}px, ${ty}px) scale(0.985)` },
    { spring, durationMs }
  );
}

// Translate from one rect to another (for card-move animations).
// Usage: translate(cardEl, fromRect, toRect, { durationMs: 260 })
export function translate(el, from, to, { spring = 'heavy', durationMs = 280 } = {}) {
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  return settle(el,
    { transform: `translate(${dx}px, ${dy}px)` },
    { transform: 'translate(0, 0)' },
    { spring, durationMs }
  );
}

// A small "pop" on a confirmation/success — scale bump + fade.
export function pulse(el, { scaleMax = 1.06, durationMs = 280 } = {}) {
  if (!el || typeof el.animate !== 'function') return null;
  return el.animate(
    [
      { transform: 'scale(1)' },
      { transform: `scale(${scaleMax})`, offset: 0.4 },
      { transform: 'scale(1)' },
    ],
    { duration: dur(durationMs), easing: easing('snap') }
  );
}

// Shake for illegal-move feedback. Horizontal jitter + damped.
export function shake(el, { amplitudePx = 6, durationMs = 280 } = {}) {
  if (!el || typeof el.animate !== 'function') return null;
  if (prefersReducedMotion()) return pulse(el, { scaleMax: 0.985, durationMs: 120 });
  const a = amplitudePx;
  return el.animate(
    [
      { transform: 'translateX(0)' },
      { transform: `translateX(${-a}px)` },
      { transform: `translateX(${a}px)` },
      { transform: `translateX(${-a * 0.6}px)` },
      { transform: `translateX(${a * 0.3}px)` },
      { transform: 'translateX(0)' },
    ],
    { duration: dur(durationMs), easing: 'ease-out' }
  );
}
