/**
 * YancoTab v2.2 — Cosmic Starfield Background
 * Canvas-based twinkling starfield inspired by YancoHub.
 * Lightweight: runs at low FPS when idle, pauses when hidden.
 * Skips entirely when a wallpaper image is active.
 */

const DEFAULT_STAR_COUNT = 80;
const TWINKLE_SPEED = 0.003;
const FPS_FOCUSED = 60;
const FPS_BLURRED = 30;

export function initStarfield() {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height, stars, raf;
  let running = false;
  let lastFrame = 0;
  let frameInterval = 1000 / FPS_FOCUSED;

  // Check if a wallpaper image is active (not 'black' or other solid-color wallpapers)
  function hasImageWallpaper() {
    const wp = localStorage.getItem('yancotab_wallpaper') || '';
    // Solid color wallpapers (no image) — starfield should run
    const solidWallpapers = ['black', 'dark', ''];
    return !solidWallpapers.includes(wp);
  }

  // Check if starfield is disabled in settings
  function isDisabledInSettings() {
    try {
      const raw = localStorage.getItem('yancotab_starfield_enabled');
      if (raw === null) return false; // default: enabled
      return raw === 'false';
    } catch { return false; }
  }

  function shouldSkip() {
    return hasImageWallpaper() || isDisabledInSettings();
  }

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
    for (let i = 0; i < DEFAULT_STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.2 + 0.3,
        alpha: Math.random(),
        phase: Math.random() * Math.PI * 2,
        speed: TWINKLE_SPEED + Math.random() * 0.004,
        teal: Math.random() < 0.15,
      });
    }
  }

  function draw(time) {
    if (!running) return;

    // Throttle to target FPS
    const delta = time - lastFrame;
    if (delta < frameInterval) {
      raf = requestAnimationFrame(draw);
      return;
    }
    lastFrame = time - (delta % frameInterval);

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
    if (shouldSkip()) {
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = '';
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
    } else if (!shouldSkip()) {
      running = true;
      raf = requestAnimationFrame(draw);
    }
  });

  // Cap FPS when window loses focus
  window.addEventListener('focus', () => {
    frameInterval = 1000 / FPS_FOCUSED;
  });
  window.addEventListener('blur', () => {
    frameInterval = 1000 / FPS_BLURRED;
  });

  window.addEventListener('resize', () => {
    if (!running) return;
    resize();
    createStars();
  });

  // Respect reduced motion — render one static frame, no animation loop
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (shouldSkip()) { canvas.style.display = 'none'; return; }
    resize();
    createStars();
    draw(0);
    return;
  }

  start();
}
