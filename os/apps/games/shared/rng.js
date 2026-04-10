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
