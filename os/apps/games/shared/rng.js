export function randInt(maxExclusive) {
  const max = maxExclusive | 0;
  if (max <= 1) return 0;
  const hasCrypto = typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function';
  if (!hasCrypto) return Math.floor(Math.random() * max);

  // Rejection sampling to avoid modulo bias
  const range = 0x100000000; // 2^32
  const limit = range - (range % max);
  const buf = new Uint32Array(1);
  let x;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

export function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Mulberry32 — tiny, fast, deterministic PRNG. Returns { next, nextInt, shuffle }.
export function seededMulberry32(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
  const nextInt = (maxExclusive) => {
    const m = maxExclusive | 0;
    if (m <= 1) return 0;
    return Math.floor(next() * m);
  };
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = nextInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return { next, nextInt, shuffle };
}

export function dailySeed(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return (y * 10000 + m * 100 + d) >>> 0;
}
