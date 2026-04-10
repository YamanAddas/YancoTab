/**
 * YancoTab v2.0 — Cosmic Starfield Background
 * Canvas-based twinkling starfield inspired by YancoHub.
 * Lightweight: runs at low FPS when idle, pauses when hidden.
 */

const STAR_COUNT = 120;
const TWINKLE_SPEED = 0.003;

export function initStarfield() {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height, stars, raf;
  let running = true;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function createStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.2 + 0.3,
        alpha: Math.random(),
        phase: Math.random() * Math.PI * 2,
        speed: TWINKLE_SPEED + Math.random() * 0.004,
        // Some stars are teal-tinted
        teal: Math.random() < 0.15,
      });
    }
  }

  function draw(time) {
    if (!running) return;

    ctx.clearRect(0, 0, width, height);

    for (const s of stars) {
      s.alpha = 0.3 + 0.7 * ((Math.sin(time * s.speed + s.phase) + 1) / 2);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);

      if (s.teal) {
        ctx.fillStyle = `rgba(0, 229, 193, ${s.alpha * 0.6})`;
      } else {
        ctx.fillStyle = `rgba(200, 214, 229, ${s.alpha * 0.5})`;
      }

      ctx.fill();
    }

    raf = requestAnimationFrame(draw);
  }

  function start() {
    resize();
    createStars();
    running = true;
    raf = requestAnimationFrame(draw);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
  }

  // Pause when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
    } else {
      running = true;
      raf = requestAnimationFrame(draw);
    }
  });

  window.addEventListener('resize', () => {
    resize();
    createStars();
  });

  // Respect reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    resize();
    createStars();
    // Draw once, static
    draw(0);
    return;
  }

  start();
}
