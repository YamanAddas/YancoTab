// winCascade.js — confetti/particle cascade played on win.
// Pure view effect: mounts a transient canvas onto `host`, animates for 3.5s,
// then removes itself. No-op under prefers-reduced-motion.

export function playWinCascade(host) {
  if (!host) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const rect = host.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  canvas.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;z-index:9999;`;
  host.append(canvas);

  const ctx = canvas.getContext('2d');
  const colors = ['#00e5c1', '#6b5cff', '#ffd166', '#ff4757', '#ffffff'];
  const parts = [];
  for (let i = 0; i < 140; i++) {
    parts.push({
      x: rect.width * (0.2 + Math.random() * 0.6),
      y: -10 - Math.random() * 40,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      r: 3 + Math.random() * 4,
      a: Math.random() * Math.PI * 2,
      va: (Math.random() - 0.5) * 0.3,
      c: colors[i % colors.length],
    });
  }

  const start = performance.now();
  const DURATION = 3500;
  const tick = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.vy += 0.08;
      p.x += p.vx;
      p.y += p.vy;
      p.a += p.va;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      ctx.globalAlpha = Math.max(0, 1 - t / DURATION);
      ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
      ctx.restore();
    }
    if (t < DURATION) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}
