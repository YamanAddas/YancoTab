/**
 * GameIcons.js — Single Source of Truth for all game icons
 *
 * Three exports:
 *   GAME_ICONS     – Full-size SVGs (used by SmartIcon for home screen / folder overlay)
 *   GAME_MINI_ICONS – Compact SVGs (used by FolderIcon for 2×2 folder preview thumbnails)
 *   GAME_METADATA_ICONS – 128×128 app-icon-style SVGs (used by App metadata)
 *
 * Design language:
 *   - Rounded-rect background with gradient (like iOS app icons)
 *   - Each game has a unique, instantly recognizable symbol
 *   - Bold, clean shapes that read well at 20px AND 60px
 *   - Consistent glass/glow treatment
 */

// ──────────────────────────────────────────────────
// FULL-SIZE ICONS — rendered inside SmartIcon's bubbly wrapper
// These sit inside .hex-icon-content which provides the rounded rect + glass.
// So these are just the interior artwork, viewBox 0 0 64 64.
//
// Updated for the Liquid Glass design pass — photoreal cards, ivory tiles,
// pixel-game sprites. Each icon is recognizable from real game references.
// Gradient IDs prefixed with "gi-" to keep them unique on the page.
// ──────────────────────────────────────────────────

export const GAME_ICONS = {

  // Solitaire — green felt + 3 fanned card-backs + Ace of Spades on top
  solitaire: `<svg class="game-svg" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <radialGradient id="gi-solitaire-felt" cx="0.5" cy="0.4" r="0.8">
        <stop offset="0" stop-color="#1d8a3a"/><stop offset="1" stop-color="#0a3a18"/>
      </radialGradient>
      <linearGradient id="gi-solitaire-back" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d22a3a"/><stop offset="1" stop-color="#7a0c1a"/>
      </linearGradient>
    </defs>
    <circle cx="32" cy="34" r="26" fill="url(#gi-solitaire-felt)" opacity="0.55"/>
    <g transform="translate(20 36) rotate(-22)"><rect x="-9" y="-15" width="18" height="26" rx="2.4" fill="url(#gi-solitaire-back)"/></g>
    <g transform="translate(32 38)"><rect x="-9" y="-15" width="18" height="26" rx="2.4" fill="url(#gi-solitaire-back)"/></g>
    <g transform="translate(44 36) rotate(22)"><rect x="-9" y="-15" width="18" height="26" rx="2.4" fill="url(#gi-solitaire-back)"/></g>
    <g transform="translate(32 30) rotate(-4)">
      <rect x="-12" y="-16" width="24" height="32" rx="3" fill="#fffdf7" stroke="#9a917a" stroke-width="0.6"/>
      <text x="-9" y="-7" font-family="Georgia, serif" font-size="7" font-weight="700" fill="#0c0c0c">A</text>
      <text x="0" y="6" font-family="Georgia, serif" font-size="14" fill="#0c0c0c" text-anchor="middle">♠</text>
    </g>
  </svg>`,

  // Spider — 3 face-down stacks + cobweb hint + tiny spider
  spider: `<svg class="game-svg" viewBox="0 0 64 64" aria-hidden="true">
    <g stroke="#c8d6e5" stroke-width="0.4" fill="none" opacity="0.45">
      <path d="M4 4 Q 14 8 18 18 M4 4 Q 8 14 18 18 M4 4 L18 18"/>
      <path d="M60 4 Q 50 8 46 18 M60 4 Q 56 14 46 18 M60 4 L46 18"/>
    </g>
    <g transform="translate(8 16)">
      <rect x="0" y="0" width="14" height="20" rx="2" fill="#3a0a14"/>
      <rect x="0" y="6" width="14" height="20" rx="2" fill="#3a0a14"/>
      <rect x="0" y="12" width="14" height="22" rx="2" fill="#fffdf7"/>
      <text x="7" y="30" font-family="Georgia, serif" font-size="8" fill="#0c0c0c" text-anchor="middle">♠</text>
    </g>
    <g transform="translate(25 12)">
      <rect x="0" y="0" width="14" height="20" rx="2" fill="#3a0a14"/>
      <rect x="0" y="6" width="14" height="20" rx="2" fill="#3a0a14"/>
      <rect x="0" y="12" width="14" height="20" rx="2" fill="#3a0a14"/>
      <rect x="0" y="18" width="14" height="24" rx="2" fill="#fffdf7"/>
      <text x="7" y="37" font-family="Georgia, serif" font-size="8" fill="#c5152e" text-anchor="middle">♥</text>
    </g>
    <g transform="translate(42 16)">
      <rect x="0" y="0" width="14" height="20" rx="2" fill="#3a0a14"/>
      <rect x="0" y="6" width="14" height="22" rx="2" fill="#fffdf7"/>
      <text x="7" y="24" font-family="Georgia, serif" font-size="8" fill="#0c0c0c" text-anchor="middle">♣</text>
    </g>
    <g transform="translate(32 50)">
      <ellipse cx="0" cy="0" rx="2.2" ry="2.6" fill="#0c0c0c"/>
      <circle cx="0" cy="-2.5" r="1.4" fill="#0c0c0c"/>
    </g>
  </svg>`,

  // Mahjong — ivory tile with bold red 中 (zhong / red dragon)
  mahjong: `<svg class="game-svg" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="gi-mahjong-tile" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff8e0"/><stop offset="0.6" stop-color="#f0e0a8"/><stop offset="1" stop-color="#c4ad6a"/>
      </linearGradient>
    </defs>
    <g transform="translate(22 22)">
      <path d="M0 6 L0 32 L6 38 L36 38 L36 12 L30 6 Z" fill="#3a2d12"/>
      <rect x="0" y="0" width="30" height="32" rx="2.5" fill="url(#gi-mahjong-tile)" stroke="#1a1306" stroke-width="0.6"/>
      <text x="15" y="22" font-family="'PingFang SC','Heiti TC','SimHei',serif" font-size="20" font-weight="800" fill="#c5152e" text-anchor="middle">中</text>
    </g>
  </svg>`,

  // Snake — pixel snake body forming an L on dark playfield + red apple
  snake: `<svg class="game-svg" viewBox="0 0 64 64" aria-hidden="true" shape-rendering="crispEdges">
    <rect x="6" y="6" width="52" height="52" rx="3" fill="#020a16" stroke="#0a3a25" stroke-width="0.8"/>
    <g fill="#3dffa6" stroke="#063b22" stroke-width="0.4">
      <rect x="14" y="14" width="8" height="8" rx="1.4"/>
      <rect x="22" y="14" width="8" height="8" rx="1.4"/>
      <rect x="30" y="14" width="8" height="8" rx="1.4"/>
      <rect x="38" y="14" width="8" height="8" rx="1.4"/>
      <rect x="38" y="22" width="8" height="8" rx="1.4"/>
      <rect x="30" y="30" width="8" height="8" rx="1.4"/>
      <rect x="22" y="38" width="8" height="8" rx="1.4"/>
      <rect x="14" y="46" width="8" height="8" rx="1.4"/>
      <rect x="22" y="46" width="8" height="8" rx="1.4"/>
      <rect x="30" y="46" width="8" height="8" rx="1.4"/>
      <rect x="38" y="46" width="8" height="8" rx="1.4"/>
    </g>
    <rect x="46" y="46" width="8" height="8" rx="1.4" fill="#33ffaa"/>
    <rect x="50" y="48" width="2" height="2" fill="#0c0c0c"/>
    <circle cx="50" cy="18" r="3.2" fill="#e02030"/>
  </svg>`,

  // Memory — 3 cards, two face-down with ?, one flipped showing star
  memory: `<svg class="game-svg" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="gi-memory-back" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3a5cd2"/><stop offset="1" stop-color="#0e1e58"/>
      </linearGradient>
    </defs>
    <g transform="translate(14 32) rotate(-10)">
      <rect x="-10" y="-14" width="20" height="28" rx="3" fill="url(#gi-memory-back)"/>
      <text x="0" y="5" font-family="Georgia, serif" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">?</text>
    </g>
    <g transform="translate(32 30) rotate(2)">
      <rect x="-10" y="-15" width="20" height="30" rx="3" fill="url(#gi-memory-back)"/>
      <text x="0" y="5" font-family="Georgia, serif" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">?</text>
    </g>
    <g transform="translate(50 32) rotate(10)">
      <rect x="-10" y="-14" width="20" height="28" rx="3" fill="#fffdf7"/>
      <path d="M0 -8 L2.4 -2.4 L8 -2 L3.6 1.6 L5 7 L0 4 L-5 7 L-3.6 1.6 L-8 -2 L-2.4 -2.4 Z" fill="#00e5c1"/>
    </g>
  </svg>`,

  // Minesweeper — gray cell grid with revealed numbers + mine + flag
  minesweeper: `<svg class="game-svg" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="6" y="6" width="52" height="52" rx="3" fill="#5a6070"/>
    <rect x="10" y="10" width="14" height="14" rx="1" fill="#bdc3cc"/>
    <text x="17" y="21" font-family="Georgia, serif" font-size="10" font-weight="800" fill="#1f3acf" text-anchor="middle">1</text>
    <rect x="25" y="10" width="14" height="14" rx="1" fill="#d8dde6"/>
    <rect x="40" y="10" width="14" height="14" rx="1" fill="#d8dde6"/>
    <path d="M45 13 L45 21" stroke="#0c0c0c" stroke-width="1"/>
    <path d="M45 13 L51 15 L45 17 Z" fill="#c5152e"/>
    <rect x="10" y="25" width="14" height="14" rx="1" fill="#bdc3cc"/>
    <text x="17" y="36" font-family="Georgia, serif" font-size="10" font-weight="800" fill="#0a8a3a" text-anchor="middle">2</text>
    <rect x="25" y="25" width="14" height="14" rx="1" fill="#c5152e"/>
    <circle cx="32" cy="32" r="4.5" fill="#1d2434"/>
    <rect x="40" y="25" width="14" height="14" rx="1" fill="#bdc3cc"/>
    <text x="47" y="36" font-family="Georgia, serif" font-size="10" font-weight="800" fill="#c5152e" text-anchor="middle">3</text>
    <rect x="10" y="40" width="14" height="14" rx="1" fill="#d8dde6"/>
    <rect x="25" y="40" width="14" height="14" rx="1" fill="#bdc3cc"/>
    <text x="32" y="51" font-family="Georgia, serif" font-size="10" font-weight="800" fill="#1f3acf" text-anchor="middle">1</text>
    <rect x="40" y="40" width="14" height="14" rx="1" fill="#d8dde6"/>
  </svg>`,

  // Tic-Tac-Toe — engraved grid with multiple X's and ringed O
  tictactoe: `<svg class="game-svg" viewBox="0 0 64 64" aria-hidden="true">
    <g stroke="#c8d6e5" stroke-width="3" stroke-linecap="round">
      <line x1="26" y1="8" x2="26" y2="56"/>
      <line x1="42" y1="8" x2="42" y2="56"/>
      <line x1="8" y1="26" x2="56" y2="26"/>
      <line x1="8" y1="42" x2="56" y2="42"/>
    </g>
    <g stroke="#00e5c1" stroke-width="3.4" stroke-linecap="round">
      <line x1="13" y1="13" x2="22" y2="22"/>
      <line x1="22" y1="13" x2="13" y2="22"/>
    </g>
    <circle cx="50" cy="50" r="6" fill="none" stroke="#c5152e" stroke-width="3.4"/>
  </svg>`,

  // Tarneeb — 3-card fan with raised K♠ trump on top
  tarneeb: `<svg class="game-svg" viewBox="0 0 64 64" aria-hidden="true">
    <g transform="translate(32 40)">
      <g transform="rotate(-26)">
        <rect x="-10" y="-22" width="20" height="32" rx="2.4" fill="#fffdf5" stroke="#9a917a" stroke-width="0.5"/>
        <text x="0" y="-2" font-family="Georgia, serif" font-size="9" fill="#c5152e" text-anchor="middle">♥</text>
      </g>
      <g transform="rotate(-12)">
        <rect x="-10" y="-24" width="20" height="32" rx="2.4" fill="#fffdf5"/>
        <text x="0" y="-3" font-family="Georgia, serif" font-size="9" fill="#0c0c0c" text-anchor="middle">♣</text>
      </g>
      <g transform="rotate(20)">
        <rect x="-10" y="-23" width="20" height="32" rx="2.4" fill="#fffdf5"/>
        <text x="0" y="-3" font-family="Georgia, serif" font-size="9" fill="#0c0c0c" text-anchor="middle">♦</text>
      </g>
      <g transform="translate(0 -3)">
        <rect x="-12" y="-27" width="24" height="36" rx="3" fill="#fffdf5" stroke="#3a3220" stroke-width="0.7"/>
        <text x="0" y="-2" font-family="Georgia, serif" font-size="14" font-weight="700" fill="#0c0c0c" text-anchor="middle">♠</text>
      </g>
    </g>
  </svg>`,

  // Trix — 3-card fan with raised A♦ trump on top
  trix: `<svg class="game-svg" viewBox="0 0 64 64" aria-hidden="true">
    <g transform="translate(32 40)">
      <g transform="rotate(-26)">
        <rect x="-10" y="-22" width="20" height="32" rx="2.4" fill="#fffdf5"/>
        <text x="0" y="-2" font-family="Georgia, serif" font-size="9" fill="#0c0c0c" text-anchor="middle">♣</text>
      </g>
      <g transform="rotate(-12)">
        <rect x="-10" y="-24" width="20" height="32" rx="2.4" fill="#fffdf5"/>
        <text x="0" y="-3" font-family="Georgia, serif" font-size="9" fill="#c5152e" text-anchor="middle">♥</text>
      </g>
      <g transform="rotate(20)">
        <rect x="-10" y="-23" width="20" height="32" rx="2.4" fill="#fffdf5"/>
        <text x="0" y="-3" font-family="Georgia, serif" font-size="9" fill="#0c0c0c" text-anchor="middle">♠</text>
      </g>
      <g transform="translate(0 -3)">
        <rect x="-12" y="-27" width="24" height="36" rx="3" fill="#fffdf5" stroke="#3a3220" stroke-width="0.7"/>
        <path d="M0 -10 L7 -2 L0 6 L-7 -2 Z" fill="#c5152e"/>
      </g>
    </g>
  </svg>`,

};


// ──────────────────────────────────────────────────
// MINI ICONS — for FolderIcon 2×2 preview (must be clear at ~24px)
// These are self-contained with their own dark circular background.
// ──────────────────────────────────────────────────

export const GAME_MINI_ICONS = {

  snake: `<svg viewBox="0 0 40 40"><defs><linearGradient id="ms" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#064e3b"/><stop offset="1" stop-color="#166534"/></linearGradient></defs><rect rx="9" width="40" height="40" fill="url(#ms)"/><path d="M10 26c4-12 16-14 22-6" stroke="#4ade80" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="30" cy="16" r="2.5" fill="#4ade80"/><circle cx="31" cy="15.5" r="1" fill="#064e3b"/><circle cx="12" cy="14" r="3.5" fill="#ef4444"/></svg>`,

  memory: `<svg viewBox="0 0 40 40"><defs><linearGradient id="mm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e1b4b"/><stop offset="1" stop-color="#6d28d9"/></linearGradient></defs><rect rx="9" width="40" height="40" fill="url(#mm)"/><rect x="5" y="8" width="13" height="18" rx="3" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/><rect x="22" y="8" width="13" height="18" rx="3" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/><text x="11.5" y="21" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="11" font-weight="bold">?</text><text x="28.5" y="21" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="11" font-weight="bold">?</text><path d="M18 32l2-3 2 3-2 3z" fill="#fbbf24" opacity="0.7"/></svg>`,

  tictactoe: `<svg viewBox="0 0 40 40"><defs><linearGradient id="mt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e1b2e"/><stop offset="1" stop-color="#be185d"/></linearGradient></defs><rect rx="9" width="40" height="40" fill="url(#mt)"/><line x1="16" y1="8" x2="16" y2="32" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/><line x1="26" y1="8" x2="26" y2="32" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/><line x1="6" y1="16" x2="34" y2="16" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/><line x1="6" y1="26" x2="34" y2="26" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/><path d="M8 9l5 5M13 9l-5 5" stroke="#f472b6" stroke-width="2.5" stroke-linecap="round"/><circle cx="30" cy="30" r="4" fill="none" stroke="#38bdf8" stroke-width="2.5"/></svg>`,

  minesweeper: `<svg viewBox="0 0 40 40"><defs><linearGradient id="mw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c1917"/><stop offset="1" stop-color="#b45309"/></linearGradient></defs><rect rx="9" width="40" height="40" fill="url(#mw)"/><circle cx="20" cy="20" r="8" fill="#1e1e2e"/><line x1="20" y1="10" x2="20" y2="7" stroke="#1e1e2e" stroke-width="3" stroke-linecap="round"/><line x1="20" y1="30" x2="20" y2="33" stroke="#1e1e2e" stroke-width="3" stroke-linecap="round"/><line x1="10" y1="20" x2="7" y2="20" stroke="#1e1e2e" stroke-width="3" stroke-linecap="round"/><line x1="30" y1="20" x2="33" y2="20" stroke="#1e1e2e" stroke-width="3" stroke-linecap="round"/><circle cx="17" cy="17" r="2" fill="rgba(255,255,255,0.3)"/></svg>`,

  solitaire: `<svg viewBox="0 0 40 40"><defs><linearGradient id="mso" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#064e3b"/><stop offset="1" stop-color="#16a34a"/></linearGradient></defs><rect rx="9" width="40" height="40" fill="url(#mso)"/><rect x="8" y="8" width="16" height="22" rx="3" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" stroke-width="1" transform="rotate(-8 16 19)"/><rect x="16" y="6" width="16" height="22" rx="3" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.35)" stroke-width="1" transform="rotate(5 24 17)"/><text x="20" y="19" fill="rgba(255,255,255,0.9)" font-size="10" font-weight="bold">A</text><path d="M28 25c0-3 4-4 4-7 0-2-3-2-4-1-1-1-4-1-4 1 0 3 4 4 4 7z" fill="rgba(255,255,255,0.85)"/></svg>`,

  spider: `<svg viewBox="0 0 40 40"><defs><linearGradient id="msp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c1917"/><stop offset="1" stop-color="#991b1b"/></linearGradient></defs><rect rx="9" width="40" height="40" fill="url(#msp)"/><ellipse cx="20" cy="22" rx="6" ry="7" fill="#1a1a2e" stroke="rgba(255,255,255,0.15)" stroke-width="1"/><circle cx="20" cy="14" r="4.5" fill="#1a1a2e" stroke="rgba(255,255,255,0.12)" stroke-width="1"/><path d="M16 19l-6-3M24 19l6-3M15 23l-7 1M25 23l7 1M16 27l-5 5M24 27l5 5" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-linecap="round"/><circle cx="18" cy="13" r="1.5" fill="#ef4444"/><circle cx="22" cy="13" r="1.5" fill="#ef4444"/></svg>`,

  mahjong: `<svg viewBox="0 0 40 40"><defs><linearGradient id="mmj" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#134e4a"/><stop offset="1" stop-color="#0d9488"/></linearGradient></defs><rect rx="9" width="40" height="40" fill="url(#mmj)"/><rect x="10" y="7" width="20" height="26" rx="4" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/><text x="20" y="26" text-anchor="middle" fill="#ef4444" font-size="16" font-weight="bold" font-family="serif">中</text></svg>`,

  tarneeb: `<svg viewBox="0 0 40 40"><defs><linearGradient id="mta" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e1b4b"/><stop offset="1" stop-color="#3730a3"/></linearGradient></defs><rect rx="9" width="40" height="40" fill="url(#mta)"/><rect x="6" y="10" width="12" height="16" rx="3" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.2)" stroke-width="0.8" transform="rotate(-10 12 18)"/><rect x="22" y="10" width="12" height="16" rx="3" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.2)" stroke-width="0.8" transform="rotate(10 28 18)"/><path d="M20 14c0-4 5-5 5-8 0-2-3-3-5-1-2-2-5-1-5 1 0 3 5 4 5 8z" fill="rgba(255,255,255,0.85)"/><path d="M13 32l2-4 2 3 3-3 3 3 2-3 2 4z" fill="#fbbf24" opacity="0.8"/></svg>`,

  trix: `<svg viewBox="0 0 40 40"><defs><linearGradient id="mtx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2e1065"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect rx="9" width="40" height="40" fill="url(#mtx)"/><line x1="20" y1="5" x2="20" y2="35" stroke="rgba(255,255,255,0.12)" stroke-width="1"/><line x1="5" y1="20" x2="35" y2="20" stroke="rgba(255,255,255,0.12)" stroke-width="1"/><path d="M10 12c0-2 2-3 2-1 0-2 2-1 2 1 0 2-2 3-2 5-0-2-2-3-2-5z" fill="#ef4444" opacity="0.9"/><path d="M29 10l2.5 4-2.5 4-2.5-4z" fill="#ef4444" opacity="0.9"/><path d="M8 27l2-3 1.5 2 2-2 2 2 1.5-2 2 3z" fill="#fbbf24" opacity="0.8"/><rect x="25" y="24" width="6" height="8" rx="1.5" fill="rgba(56,189,248,0.5)" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/></svg>`,

};
