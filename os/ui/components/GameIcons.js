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
// These sit inside .bubbly-icon-content which provides the rounded rect + glass.
// So these are just the interior artwork, viewBox 0 0 100 100.
// ──────────────────────────────────────────────────

export const GAME_ICONS = {

  snake: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
    <!-- green snake body with apple -->
    <path d="M22 65c0-18 14-30 28-28 10 1 16 8 22 4 5-3 6-10 2-14" fill="none" stroke="#4ade80" stroke-width="10" stroke-linecap="round"/>
    <path d="M22 65c0-18 14-30 28-28 10 1 16 8 22 4 5-3 6-10 2-14" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="10" stroke-linecap="round"/>
    <!-- head -->
    <circle cx="72" cy="27" r="8" fill="#4ade80"/>
    <circle cx="75" cy="24" r="2.5" fill="#0f172a"/>
    <circle cx="75.8" cy="23.3" r="1" fill="rgba(255,255,255,0.8)"/>
    <!-- tongue -->
    <path d="M80 28l6 2M80 28l6-1" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/>
    <!-- red apple -->
    <circle cx="32" cy="38" r="8" fill="#ef4444"/>
    <ellipse cx="32" cy="38" rx="8" ry="8" fill="#ef4444"/>
    <path d="M32 30c2-5 6-6 8-4" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    <!-- leaf -->
    <ellipse cx="37" cy="28" rx="3" ry="2" fill="#22c55e" transform="rotate(-20 37 28)"/>
    <!-- body pattern dots -->
    <circle cx="36" cy="60" r="2" fill="rgba(255,255,255,0.15)"/>
    <circle cx="48" cy="48" r="2" fill="rgba(255,255,255,0.15)"/>
    <circle cx="60" cy="44" r="2" fill="rgba(255,255,255,0.15)"/>
  </svg>`,

  memory: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
    <!-- two cards side by side -->
    <g transform="rotate(-6 35 55)">
      <rect x="14" y="22" width="36" height="50" rx="8" fill="rgba(139,92,246,0.35)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
      <text x="32" y="54" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="28" font-weight="bold">?</text>
    </g>
    <g transform="rotate(6 65 55)">
      <rect x="50" y="22" width="36" height="50" rx="8" fill="rgba(59,130,246,0.35)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
      <text x="68" y="54" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="28" font-weight="bold">?</text>
    </g>
    <!-- sparkle / match indicator -->
    <path d="M50 16l2.5 5 5 2.5-5 2.5-2.5 5-2.5-5-5-2.5 5-2.5z" fill="rgba(250,204,21,0.85)"/>
    <path d="M76 76l2 3.5 3.5 2-3.5 2-2 3.5-2-3.5-3.5-2 3.5-2z" fill="rgba(255,255,255,0.4)"/>
  </svg>`,

  tictactoe: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
    <!-- grid -->
    <line x1="40" y1="20" x2="40" y2="80" stroke="rgba(255,255,255,0.35)" stroke-width="4" stroke-linecap="round"/>
    <line x1="62" y1="20" x2="62" y2="80" stroke="rgba(255,255,255,0.35)" stroke-width="4" stroke-linecap="round"/>
    <line x1="18" y1="40" x2="82" y2="40" stroke="rgba(255,255,255,0.35)" stroke-width="4" stroke-linecap="round"/>
    <line x1="18" y1="62" x2="82" y2="62" stroke="rgba(255,255,255,0.35)" stroke-width="4" stroke-linecap="round"/>
    <!-- X in top-left -->
    <path d="M24 26l10 10M34 26l-10 10" stroke="#f472b6" stroke-width="5" stroke-linecap="round"/>
    <!-- O in center -->
    <circle cx="51" cy="51" r="8" fill="none" stroke="#38bdf8" stroke-width="5"/>
    <!-- X in bottom-right -->
    <path d="M67 67l10 10M77 67l-10 10" stroke="#f472b6" stroke-width="5" stroke-linecap="round"/>
    <!-- O in top-right -->
    <circle cx="72" cy="30" r="7" fill="none" stroke="#38bdf8" stroke-width="4.5"/>
  </svg>`,

  minesweeper: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
    <!-- grid cells background -->
    <rect x="15" y="15" width="70" height="70" rx="10" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
    <!-- bomb -->
    <circle cx="50" cy="48" r="16" fill="#1e1e2e"/>
    <circle cx="50" cy="48" r="14" fill="#2d2d3e"/>
    <!-- spikes -->
    <line x1="50" y1="28" x2="50" y2="22" stroke="#1e1e2e" stroke-width="4" stroke-linecap="round"/>
    <line x1="50" y1="68" x2="50" y2="74" stroke="#1e1e2e" stroke-width="4" stroke-linecap="round"/>
    <line x1="30" y1="48" x2="24" y2="48" stroke="#1e1e2e" stroke-width="4" stroke-linecap="round"/>
    <line x1="70" y1="48" x2="76" y2="48" stroke="#1e1e2e" stroke-width="4" stroke-linecap="round"/>
    <line x1="36" y1="34" x2="32" y2="30" stroke="#1e1e2e" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="64" y1="34" x2="68" y2="30" stroke="#1e1e2e" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="36" y1="62" x2="32" y2="66" stroke="#1e1e2e" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="64" y1="62" x2="68" y2="66" stroke="#1e1e2e" stroke-width="3.5" stroke-linecap="round"/>
    <!-- highlight -->
    <circle cx="44" cy="42" r="4" fill="rgba(255,255,255,0.25)"/>
    <!-- flag in corner -->
    <line x1="22" y1="78" x2="22" y2="68" stroke="rgba(255,255,255,0.6)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M22 68l10 4-10 4z" fill="#ef4444"/>
  </svg>`,

  solitaire: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
    <!-- stacked cards fan -->
    <rect x="18" y="18" width="40" height="56" rx="8" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" transform="rotate(-12 38 46)"/>
    <rect x="26" y="16" width="40" height="56" rx="8" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5" transform="rotate(-4 46 44)"/>
    <rect x="34" y="14" width="40" height="56" rx="8" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.28)" stroke-width="1.5" transform="rotate(4 54 42)"/>
    <!-- front card content: Ace of Spades -->
    <text x="40" y="32" fill="rgba(255,255,255,0.9)" font-size="14" font-weight="bold">A</text>
    <!-- big spade -->
    <path d="M58 40c0-10 12-14 12-22 0-5-5-7-8-5-1-5-7-5-8 0-3-2-8 0-8 5 0 8 12 12 12 22z" fill="rgba(255,255,255,0.85)" transform="translate(-4,20) scale(0.75)"/>
    <path d="M53 62h6c-1 4-3 6-6 9 1-3 1-6 0-9z" fill="rgba(255,255,255,0.85)" transform="translate(-2,6) scale(0.6)"/>
    <!-- green felt glow -->
    <circle cx="50" cy="80" r="18" fill="rgba(34,197,94,0.15)" filter="blur(4px)"/>
  </svg>`,

  spider: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
    <!-- spider body -->
    <ellipse cx="50" cy="56" rx="14" ry="16" fill="#1a1a2e" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
    <circle cx="50" cy="38" r="10" fill="#1a1a2e" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
    <!-- legs -->
    <path d="M40 48c-6-3-14-2-18 4" stroke="rgba(255,255,255,0.4)" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M60 48c6-3 14-2 18 4" stroke="rgba(255,255,255,0.4)" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M38 56c-8 0-16 2-20 8" stroke="rgba(255,255,255,0.35)" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M62 56c8 0 16 2 20 8" stroke="rgba(255,255,255,0.35)" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M40 65c-6 4-12 10-14 18" stroke="rgba(255,255,255,0.3)" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M60 65c6 4 12 10 14 18" stroke="rgba(255,255,255,0.3)" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M42 72c-4 5-8 12-8 18" stroke="rgba(255,255,255,0.25)" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M58 72c4 5 8 12 8 18" stroke="rgba(255,255,255,0.25)" stroke-width="3" stroke-linecap="round" fill="none"/>
    <!-- eyes -->
    <circle cx="46" cy="35" r="3" fill="#ef4444"/>
    <circle cx="54" cy="35" r="3" fill="#ef4444"/>
    <circle cx="46" cy="34.5" r="1.2" fill="rgba(255,255,255,0.8)"/>
    <circle cx="54" cy="34.5" r="1.2" fill="rgba(255,255,255,0.8)"/>
    <!-- red hourglass marking -->
    <path d="M45 55l5-5 5 5-5 5z" fill="#ef4444" opacity="0.85"/>
  </svg>`,

  mahjong: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
    <!-- back tile (3D stack effect) -->
    <rect x="28" y="22" width="44" height="56" rx="8" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)" stroke-width="1.5" transform="translate(4,4)"/>
    <rect x="28" y="22" width="44" height="56" rx="8" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" transform="translate(2,2)"/>
    <!-- front tile -->
    <rect x="28" y="22" width="44" height="56" rx="8" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.28)" stroke-width="2"/>
    <!-- Chinese character "中" (zhong/center - the red dragon) -->
    <text x="50" y="60" text-anchor="middle" fill="#ef4444" font-size="32" font-weight="bold" font-family="serif">中</text>
    <!-- subtle frame inside tile -->
    <rect x="34" y="28" width="32" height="44" rx="4" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  </svg>`,

  tarneeb: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
    <!-- 4 fanned cards representing partnership play -->
    <rect x="20" y="24" width="32" height="46" rx="7" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.14)" stroke-width="1.5" transform="rotate(-18 36 47)"/>
    <rect x="28" y="22" width="32" height="46" rx="7" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" transform="rotate(-6 44 45)"/>
    <rect x="40" y="22" width="32" height="46" rx="7" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" transform="rotate(6 56 45)"/>
    <rect x="48" y="24" width="32" height="46" rx="7" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.14)" stroke-width="1.5" transform="rotate(18 64 47)"/>
    <!-- big spade (trump suit symbol) -->
    <path d="M50 30c0-8 10-11 10-18 0-5-7-7-10-3-3-4-10-2-10 3 0 7 10 10 10 18z"
          fill="rgba(255,255,255,0.88)"/>
    <path d="M48 30h4c-0.5 3-2 5-4 7 0.5-2 0.8-5 0-7z" fill="rgba(255,255,255,0.88)"/>
    <!-- crown (bid winner indicator) -->
    <path d="M34 78l5-10 5 6 6-6 6 6 5-6 5 10z" fill="#fbbf24" opacity="0.85"/>
    <circle cx="50" cy="84" r="2.5" fill="#fbbf24" opacity="0.6"/>
    <!-- Arabic-feel accent line -->
    <path d="M30 72h40" stroke="rgba(255,215,0,0.3)" stroke-width="1" stroke-dasharray="2 3"/>
  </svg>`,

  trix: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
    <!-- 4 quadrant grid (representing the 4 kingdoms) -->
    <rect x="16" y="16" width="68" height="68" rx="12" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
    <line x1="50" y1="20" x2="50" y2="80" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
    <line x1="20" y1="50" x2="80" y2="50" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
    <!-- top-left: heart with X (no hearts) -->
    <path d="M30 35c0-4 4-6 6-4 2-2 6 0 6 4 0 5-6 8-6 12-0-4-6-7-6-12z" fill="#ef4444"/>
    <path d="M27 30l12 16" stroke="rgba(255,255,255,0.7)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M39 30l-12 16" stroke="rgba(255,255,255,0.7)" stroke-width="2.5" stroke-linecap="round"/>
    <!-- top-right: diamond with X (no diamonds) -->
    <path d="M66 28l6 9-6 9-6-9z" fill="#ef4444"/>
    <path d="M59 31l14 12" stroke="rgba(255,255,255,0.7)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M73 31l-14 12" stroke="rgba(255,255,255,0.7)" stroke-width="2.5" stroke-linecap="round"/>
    <!-- bottom-left: Queen crown with X (no queens) -->
    <path d="M27 60l3-6 4 4 4-4 4 4 3-6v8h-18z" fill="#fbbf24"/>
    <path d="M25 56l16 16" stroke="rgba(255,255,255,0.6)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M41 56l-16 16" stroke="rgba(255,255,255,0.6)" stroke-width="2.5" stroke-linecap="round"/>
    <!-- bottom-right: card stack with X (no tricks) -->
    <rect x="59" y="56" width="14" height="18" rx="3" fill="rgba(56,189,248,0.5)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
    <rect x="62" y="54" width="14" height="18" rx="3" fill="rgba(56,189,248,0.7)" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
    <path d="M58 53l20 20" stroke="rgba(255,255,255,0.6)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M78 53l-20 20" stroke="rgba(255,255,255,0.6)" stroke-width="2.5" stroke-linecap="round"/>
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
