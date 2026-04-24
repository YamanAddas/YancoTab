// winCascade.js — Win 3.x-style foundation cascade played on victory.
//
// For each foundation pile, rapidly spawns small card sprites that launch
// off the pile with random horizontal velocity, fall under gravity, and
// bounce off the bottom edge with energy loss — leaving a trail because
// we never clear the canvas. Classic "Microsoft Solitaire 1990" effect,
// retuned to the YancoTab palette.
//
// prefers-reduced-motion: replaced with a static gold halo that pulses
// once and fades. Same entry point, same lifecycle.

const SUIT_GLYPH = { H: '♥', D: '♦', C: '♣', S: '♠' };
const SUIT_COLOR = {
  H: '#ff4757', D: '#ff4757',        // both reds in 2-color mode
  C: '#0a0f1a', S: '#0a0f1a',
};
// Launch sources: 4 x-positions evenly distributed across the top row
// where foundations typically sit (foundations render in top-left or -right
// half depending on left-handed setting — the exact position is minor, the
// cascade sprays across the whole board anyway).
const FOUNDATIONS = ['H', 'D', 'C', 'S'];

export function playWinCascade(host) {
  if (!host) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return playReducedHalo(host);
  }

  const rect = host.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:9999;';
  host.append(canvas);
  const ctx = canvas.getContext('2d');

  const cardW = Math.max(34, Math.min(56, rect.width * 0.06));
  const cardH = cardW * 1.4;
  // Anchor each foundation to 1/4 of the way across from the corresponding
  // edge so sprites fountain from roughly where the piles sat.
  const foundationX = FOUNDATIONS.map((_, i) => rect.width * (0.15 + i * 0.23));
  const foundationY = cardH * 0.5;

  const sprites = [];
  let lastSpawn = 0;
  let fountainIdx = 0;
  const GRAVITY = 900 / 1000 / 1000;   // px per ms² — gentle at 1/1000000 scale
  const DAMPING = 0.82;                // bounce energy retention
  const SPAWN_INTERVAL = 80;           // ms between spawns
  const SPAWN_DURATION = 3200;         // stop spawning after 3.2s…
  const MAX_LIFE = 5000;               // …and clean up by 5s even if sprites linger

  function spawn(now) {
    const suit = FOUNDATIONS[fountainIdx % 4];
    fountainIdx++;
    const x = foundationX[fountainIdx % 4];
    // Random initial horizontal velocity, small upward component so the arc
    // starts rising before falling — matches the Win 3.x look where cards
    // "jump" off the pile before succumbing to gravity.
    const vx = (Math.random() * 2 - 1) * 0.6;        // ±0.6 px/ms
    const vy = -0.35 - Math.random() * 0.25;         // -0.35..-0.60 px/ms (up)
    sprites.push({
      x, y: foundationY, vx, vy,
      suit, rank: 1 + Math.floor(Math.random() * 13),
      born: now,
    });
  }

  const start = performance.now();
  const step = (now) => {
    const dt = 16;                     // fixed-step — visual effect, not physics sim
    if (now - start < SPAWN_DURATION && now - lastSpawn >= SPAWN_INTERVAL) {
      spawn(now);
      lastSpawn = now;
    }
    // Trail: instead of clearRect, paint a translucent veil so older frames
    // fade away. Tuned so older sprite positions linger ~400ms.
    ctx.fillStyle = 'rgba(6, 11, 20, 0.08)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = sprites.length - 1; i >= 0; i--) {
      const s = sprites[i];
      s.vy += GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      // Bottom bounce with energy loss — cards don't leave the board, they
      // settle at the bottom edge.
      if (s.y + cardH / 2 >= canvas.height) {
        s.y = canvas.height - cardH / 2;
        s.vy *= -DAMPING;
        s.vx *= 0.95;
        if (Math.abs(s.vy) < 0.08) s.vy = 0;
      }
      drawCard(ctx, s.x, s.y, cardW, cardH, s.suit, s.rank);
      if (now - s.born > MAX_LIFE || s.x < -cardW || s.x > canvas.width + cardW) {
        sprites.splice(i, 1);
      }
    }

    if (now - start < MAX_LIFE && (sprites.length > 0 || now - start < SPAWN_DURATION)) {
      requestAnimationFrame(step);
    } else {
      canvas.remove();
    }
  };
  requestAnimationFrame(step);
}

function drawCard(ctx, cx, cy, w, h, suit, rank) {
  const x = cx - w / 2, y = cy - h / 2;
  const r = Math.min(6, w * 0.12);
  ctx.save();
  // Card body — subtle glow so sprites read against dark board.
  ctx.shadowColor = 'rgba(0, 229, 193, 0.25)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.shadowBlur = 0;
  // Suit glyph, center.
  ctx.fillStyle = SUIT_COLOR[suit] || '#0a0f1a';
  ctx.font = `600 ${Math.round(h * 0.42)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(SUIT_GLYPH[suit] || '?', cx, cy + h * 0.02);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Reduced-motion fallback: a radial "gold halo" that pulses once and fades.
// No particles, no motion beyond opacity + scale easing — safe for the
// vestibular / seizure-prone audience the media query is designed for.
function playReducedHalo(host) {
  const halo = document.createElement('div');
  halo.style.cssText = [
    'position:absolute',
    'inset:0',
    'pointer-events:none',
    'z-index:9999',
    'background:radial-gradient(ellipse at 50% 50%, rgba(255, 215, 102, 0.35), transparent 60%)',
    'opacity:0',
    'transition:opacity 260ms ease-out',
  ].join(';');
  host.append(halo);
  requestAnimationFrame(() => { halo.style.opacity = '1'; });
  setTimeout(() => { halo.style.transition = 'opacity 900ms ease-out'; halo.style.opacity = '0'; }, 900);
  setTimeout(() => halo.remove(), 2000);
}
