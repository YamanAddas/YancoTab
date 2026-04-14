/**
 * AppIcons.js — Rich Colored Animated SVG Icons
 *
 * Each icon has its own unique color palette, layered gradients,
 * depth effects, and CSS-driven animations. Designed to feel premium
 * and alive inside hexagonal containers on cosmic dark backgrounds.
 */

export const PHOSPHOR_ICONS = {

  /* ── Calculator: dark slate + orange accents ── */
  calculator: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="calc-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a3f47"/><stop offset="1" stop-color="#1a1d22"/>
      </linearGradient>
      <linearGradient id="calc-display" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a3038"/><stop offset="1" stop-color="#1c2026"/>
      </linearGradient>
      <linearGradient id="calc-orange" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff9f43"/><stop offset="1" stop-color="#ee5a24"/>
      </linearGradient>
    </defs>
    <rect x="10" y="6" width="44" height="52" rx="8" fill="url(#calc-bg)" stroke="rgba(255,255,255,0.1)" stroke-width="0.8"/>
    <rect x="14" y="10" width="36" height="14" rx="4" fill="url(#calc-display)"/>
    <text x="46" y="21" fill="#e0e6ed" font-family="sans-serif" font-size="10" text-anchor="end" font-weight="600">247</text>
    <!-- button grid -->
    <rect x="14" y="28" width="7" height="6" rx="1.5" fill="#4a5058" opacity="0.9"/>
    <rect x="23" y="28" width="7" height="6" rx="1.5" fill="#4a5058" opacity="0.9"/>
    <rect x="32" y="28" width="7" height="6" rx="1.5" fill="#4a5058" opacity="0.9"/>
    <rect x="41" y="28" width="9" height="6" rx="1.5" fill="url(#calc-orange)"/>
    <rect x="14" y="36" width="7" height="6" rx="1.5" fill="#5a6068"/>
    <rect x="23" y="36" width="7" height="6" rx="1.5" fill="#5a6068"/>
    <rect x="32" y="36" width="7" height="6" rx="1.5" fill="#5a6068"/>
    <rect x="41" y="36" width="9" height="6" rx="1.5" fill="url(#calc-orange)"/>
    <rect x="14" y="44" width="7" height="6" rx="1.5" fill="#5a6068"/>
    <rect x="23" y="44" width="7" height="6" rx="1.5" fill="#5a6068"/>
    <rect x="32" y="44" width="7" height="6" rx="1.5" fill="#5a6068"/>
    <rect x="41" y="44" width="9" height="6" rx="1.5" fill="url(#calc-orange)"/>
    <!-- shine -->
    <rect x="10" y="6" width="44" height="52" rx="8" fill="url(#calc-bg)" opacity="0" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>
    <path d="M14 8 C24 6, 36 6, 50 8" stroke="rgba(255,255,255,0.12)" stroke-width="1" fill="none" stroke-linecap="round"/>
  </svg>`,

  /* ── Browser: vivid blue globe with green land, rotating ring ── */
  browser: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="globe-sea" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#4facfe"/><stop offset="1" stop-color="#0072ff"/>
      </linearGradient>
      <linearGradient id="globe-land" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#56ab2f"/><stop offset="1" stop-color="#2e8b57"/>
      </linearGradient>
      <radialGradient id="globe-shine" cx="0.35" cy="0.3" r="0.5">
        <stop offset="0" stop-color="rgba(255,255,255,0.45)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
      <clipPath id="globe-clip"><circle cx="32" cy="32" r="22"/></clipPath>
    </defs>
    <!-- ocean -->
    <circle cx="32" cy="32" r="22" fill="url(#globe-sea)"/>
    <!-- landmasses -->
    <g clip-path="url(#globe-clip)">
      <ellipse cx="28" cy="22" rx="10" ry="8" fill="url(#globe-land)" opacity="0.85" transform="rotate(-15 28 22)"/>
      <ellipse cx="38" cy="38" rx="8" ry="12" fill="url(#globe-land)" opacity="0.75" transform="rotate(10 38 38)"/>
      <ellipse cx="18" cy="40" rx="6" ry="4" fill="url(#globe-land)" opacity="0.65"/>
      <!-- grid lines -->
      <ellipse cx="32" cy="32" rx="14" ry="22" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.6"/>
      <ellipse cx="32" cy="32" rx="8" ry="22" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="0.5"/>
      <line x1="10" y1="26" x2="54" y2="26" stroke="rgba(255,255,255,0.10)" stroke-width="0.5"/>
      <line x1="10" y1="38" x2="54" y2="38" stroke="rgba(255,255,255,0.10)" stroke-width="0.5"/>
    </g>
    <!-- shine -->
    <circle cx="32" cy="32" r="22" fill="url(#globe-shine)"/>
    <!-- ring -->
    <ellipse cx="32" cy="32" rx="28" ry="10" fill="none" stroke="rgba(100,180,255,0.5)" stroke-width="1.2" transform="rotate(-20 32 32)" class="globe-ring"/>
    <!-- border -->
    <circle cx="32" cy="32" r="22" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.8"/>
  </svg>`,

  /* ── Settings: chrome gear with slow spin ── */
  settings: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gear-metal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#c0c8d0"/><stop offset="0.5" stop-color="#8a9aaa"/><stop offset="1" stop-color="#c0c8d0"/>
      </linearGradient>
      <radialGradient id="gear-center" cx="0.45" cy="0.4" r="0.5">
        <stop offset="0" stop-color="#dde4ea"/><stop offset="1" stop-color="#8898a8"/>
      </radialGradient>
      <filter id="gear-shadow"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.4)"/></filter>
    </defs>
    <g filter="url(#gear-shadow)" class="gear-spin">
      <!-- gear body -->
      <path d="M32 8 L36 8 L37 14 C38.5 14.5 40 15.2 41.3 16.1 L46.5 13 L49.5 16 L46.5 21.2
               C47.4 22.5 48 24 48.5 25.5 L54 26.5 L54 30.5 L48.5 31.5 C48 33 47.4 34.5 46.5 35.8
               L49.5 41 L46.5 44 L41.3 40.9 C40 41.8 38.5 42.5 37 43 L36 49 L32 49 L31 43
               C29.5 42.5 28 41.8 26.7 40.9 L21.5 44 L18.5 41 L21.5 35.8 C20.6 34.5 20 33 19.5 31.5
               L14 30.5 L14 26.5 L19.5 25.5 C20 24 20.6 22.5 21.5 21.2 L18.5 16 L21.5 13 L26.7 16.1
               C28 15.2 29.5 14.5 31 14 Z"
            fill="url(#gear-metal)" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
      <!-- center hub -->
      <circle cx="34" cy="28.5" r="8" fill="url(#gear-center)" stroke="rgba(255,255,255,0.2)" stroke-width="0.5"/>
      <circle cx="34" cy="28.5" r="4" fill="none" stroke="rgba(100,120,140,0.5)" stroke-width="1"/>
      <!-- highlight -->
      <path d="M22 16 C28 12, 38 12, 46 16" stroke="rgba(255,255,255,0.25)" stroke-width="0.8" fill="none" stroke-linecap="round"/>
    </g>
  </svg>`,

  /* ── Weather: gradient sky + golden sun + fluffy cloud ── */
  weather: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="wx-sun" cx="0.4" cy="0.4" r="0.6">
        <stop offset="0" stop-color="#ffe259"/><stop offset="0.6" stop-color="#ffa751"/><stop offset="1" stop-color="#ff7b00"/>
      </radialGradient>
      <radialGradient id="wx-sun-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="rgba(255,200,50,0.5)"/><stop offset="1" stop-color="rgba(255,150,0,0)"/>
      </radialGradient>
      <linearGradient id="wx-cloud" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d4e4f7"/>
      </linearGradient>
      <filter id="wx-cloud-shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,50,100,0.25)"/></filter>
    </defs>
    <!-- sun glow -->
    <circle cx="42" cy="18" r="18" fill="url(#wx-sun-glow)" class="sun-pulse"/>
    <!-- sun rays -->
    <g class="sun-spin" style="transform-origin:42px 18px">
      <line x1="42" y1="4" x2="42" y2="8" stroke="#ffb347" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>
      <line x1="52" y1="8" x2="49.5" y2="11" stroke="#ffb347" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
      <line x1="56" y1="18" x2="52" y2="18" stroke="#ffb347" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>
      <line x1="52" y1="28" x2="49.5" y2="25" stroke="#ffb347" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
      <line x1="32" y1="8" x2="34.5" y2="11" stroke="#ffb347" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
    </g>
    <!-- sun body -->
    <circle cx="42" cy="18" r="9" fill="url(#wx-sun)"/>
    <circle cx="39" cy="15" r="4" fill="rgba(255,255,255,0.25)"/>
    <!-- cloud -->
    <g filter="url(#wx-cloud-shadow)" class="cloud-float">
      <path d="M14 44 C14 44, 8 44, 8 38 C8 33, 13 31, 16 32 C17 27, 22 24, 28 26 C30 22, 36 20, 40 24
               C44 21, 50 23, 50 28 C54 28, 56 32, 54 36 C56 38, 56 42, 52 44 Z"
            fill="url(#wx-cloud)"/>
      <!-- cloud highlight -->
      <path d="M16 34 C20 30, 30 26, 40 28" stroke="rgba(255,255,255,0.6)" stroke-width="1" fill="none" stroke-linecap="round"/>
    </g>
  </svg>`,

  /* ── Notes: warm amber notepad with pencil ── */
  notes: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="note-page" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fef9e7"/><stop offset="1" stop-color="#f5e6b8"/>
      </linearGradient>
      <linearGradient id="note-header" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#f39c12"/><stop offset="1" stop-color="#e67e22"/>
      </linearGradient>
      <linearGradient id="note-pencil" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f1c40f"/><stop offset="1" stop-color="#d4a20a"/>
      </linearGradient>
      <filter id="note-shadow"><feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.25)"/></filter>
    </defs>
    <!-- shadow page behind -->
    <rect x="16" y="10" width="34" height="44" rx="4" fill="rgba(200,180,140,0.3)" transform="rotate(3 32 32)"/>
    <!-- main page -->
    <g filter="url(#note-shadow)">
      <rect x="13" y="8" width="34" height="46" rx="4" fill="url(#note-page)"/>
      <!-- header strip -->
      <rect x="13" y="8" width="34" height="10" rx="4" fill="url(#note-header)"/>
      <rect x="13" y="14" width="34" height="4" fill="url(#note-header)"/>
      <!-- spiral holes -->
      <circle cx="16" cy="12" r="1.5" fill="#d4a20a" opacity="0.6"/>
      <circle cx="22" cy="12" r="1.5" fill="#d4a20a" opacity="0.6"/>
      <circle cx="28" cy="12" r="1.5" fill="#d4a20a" opacity="0.6"/>
      <circle cx="34" cy="12" r="1.5" fill="#d4a20a" opacity="0.6"/>
      <circle cx="40" cy="12" r="1.5" fill="#d4a20a" opacity="0.6"/>
      <!-- text lines -->
      <line x1="17" y1="24" x2="40" y2="24" stroke="#c4a87c" stroke-width="0.7" opacity="0.6"/>
      <line x1="17" y1="29" x2="43" y2="29" stroke="#c4a87c" stroke-width="0.7" opacity="0.6"/>
      <line x1="17" y1="34" x2="38" y2="34" stroke="#c4a87c" stroke-width="0.7" opacity="0.6"/>
      <line x1="17" y1="39" x2="42" y2="39" stroke="#c4a87c" stroke-width="0.7" opacity="0.6"/>
      <line x1="17" y1="44" x2="30" y2="44" stroke="#c4a87c" stroke-width="0.7" opacity="0.6"/>
      <!-- written text suggestion -->
      <path d="M18 23 C22 22, 26 24, 30 23 C34 22, 37 23, 39 23" stroke="#5a4e3c" stroke-width="0.8" fill="none" opacity="0.5"/>
      <path d="M18 28 C24 27, 30 29, 36 28 C40 27, 42 28, 43 28" stroke="#5a4e3c" stroke-width="0.8" fill="none" opacity="0.5"/>
      <path d="M18 33 C22 32, 28 34, 33 33 C36 32, 37 33, 38 33" stroke="#5a4e3c" stroke-width="0.8" fill="none" opacity="0.4"/>
    </g>
    <!-- pencil -->
    <g transform="translate(40,36) rotate(30)">
      <rect x="0" y="0" width="4" height="20" rx="0.5" fill="url(#note-pencil)"/>
      <polygon points="0,20 4,20 2,24" fill="#2c3e50"/>
      <rect x="0" y="0" width="4" height="3" rx="0.5" fill="#e74c3c"/>
      <rect x="0.5" y="18" width="3" height="2" fill="#d4a20a"/>
    </g>
  </svg>`,

  /* ── Files: blue folder with paper, 3D perspective ── */
  files: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="folder-back" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2980b9"/><stop offset="1" stop-color="#1a5276"/>
      </linearGradient>
      <linearGradient id="folder-front" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5dade2"/><stop offset="1" stop-color="#2e86c1"/>
      </linearGradient>
      <linearGradient id="folder-tab" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#3498db"/><stop offset="1" stop-color="#2980b9"/>
      </linearGradient>
      <filter id="folder-shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.3)"/></filter>
    </defs>
    <!-- back panel -->
    <g filter="url(#folder-shadow)">
      <rect x="8" y="14" width="48" height="38" rx="4" fill="url(#folder-back)"/>
      <!-- tab -->
      <path d="M8 18 L8 14 Q8 10, 12 10 L26 10 Q28 10, 29 12 L32 18 Z" fill="url(#folder-tab)"/>
      <!-- paper peeking out -->
      <rect x="14" y="18" width="30" height="26" rx="2" fill="#f0f4f8" opacity="0.9"/>
      <line x1="18" y1="24" x2="38" y2="24" stroke="#c8d6e5" stroke-width="0.8"/>
      <line x1="18" y1="28" x2="36" y2="28" stroke="#c8d6e5" stroke-width="0.8"/>
      <line x1="18" y1="32" x2="32" y2="32" stroke="#c8d6e5" stroke-width="0.8"/>
      <!-- front panel -->
      <rect x="6" y="22" width="52" height="32" rx="4" fill="url(#folder-front)" opacity="0.95"/>
      <!-- front shine -->
      <path d="M10 24 C20 22, 40 22, 54 24" stroke="rgba(255,255,255,0.3)" stroke-width="1" fill="none" stroke-linecap="round"/>
      <!-- fold detail -->
      <line x1="6" y1="28" x2="58" y2="28" stroke="rgba(0,0,0,0.08)" stroke-width="0.5"/>
    </g>
  </svg>`,

  /* ── Maps: folded map with colorful sections + red pin ── */
  maps: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="map-land" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a8e063"/><stop offset="1" stop-color="#56ab2f"/>
      </linearGradient>
      <linearGradient id="map-sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#67b8ff"/><stop offset="1" stop-color="#2b62ff"/>
      </linearGradient>
      <linearGradient id="map-pin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff5b5b"/><stop offset="1" stop-color="#d81b60"/>
      </linearGradient>
      <linearGradient id="map-paper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f8f4e8"/><stop offset="1" stop-color="#e8dfc8"/>
      </linearGradient>
      <filter id="map-shadow"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="rgba(0,0,0,0.3)"/></filter>
      <filter id="pin-shadow"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="rgba(0,0,0,0.4)"/></filter>
    </defs>
    <!-- folded map -->
    <g filter="url(#map-shadow)">
      <path d="M6 10 L18 6 L32 10 L46 6 L58 10 L58 50 L46 54 L32 50 L18 54 L6 50 Z" fill="url(#map-paper)" stroke="rgba(180,170,150,0.4)" stroke-width="0.5"/>
      <!-- sections -->
      <path d="M8 12 L18 8 L18 52 L8 48 Z" fill="url(#map-sea)" opacity="0.8"/>
      <path d="M18 8 L32 12 L32 50 L18 52 Z" fill="url(#map-land)" opacity="0.85"/>
      <path d="M32 12 L46 8 L46 52 L32 50 Z" fill="url(#map-sea)" opacity="0.75"/>
      <path d="M46 8 L56 12 L56 48 L46 52 Z" fill="url(#map-land)" opacity="0.7"/>
      <!-- fold lines -->
      <line x1="18" y1="8" x2="18" y2="52" stroke="rgba(0,0,0,0.12)" stroke-width="0.5"/>
      <line x1="32" y1="10" x2="32" y2="50" stroke="rgba(0,0,0,0.12)" stroke-width="0.5"/>
      <line x1="46" y1="8" x2="46" y2="52" stroke="rgba(0,0,0,0.12)" stroke-width="0.5"/>
      <!-- road -->
      <path d="M12 30 C18 25, 24 35, 30 28 C36 22, 42 32, 52 26" stroke="rgba(255,255,255,0.6)" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-dasharray="2 1.5"/>
    </g>
    <!-- pin -->
    <g filter="url(#pin-shadow)" class="pin-bounce">
      <path d="M34 16 C34 11, 38 8, 42 8 C46 8, 50 11, 50 16 C50 22, 42 30, 42 30 C42 30, 34 22, 34 16 Z" fill="url(#map-pin)"/>
      <circle cx="42" cy="15.5" r="3.5" fill="rgba(255,255,255,0.7)"/>
      <!-- pin shadow on map -->
      <ellipse cx="42" cy="32" rx="4" ry="1.5" fill="rgba(0,0,0,0.15)"/>
    </g>
  </svg>`,

  /* ── Photos: overlapping polaroids with landscape scene ── */
  photos: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="photo-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#74b9ff"/><stop offset="0.6" stop-color="#a29bfe"/><stop offset="1" stop-color="#dfe6e9"/>
      </linearGradient>
      <linearGradient id="photo-mt" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#636e72"/><stop offset="1" stop-color="#2d3436"/>
      </linearGradient>
      <linearGradient id="photo-grass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#00b894"/><stop offset="1" stop-color="#00a381"/>
      </linearGradient>
      <radialGradient id="photo-sun" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffeaa7"/><stop offset="1" stop-color="#fdcb6e"/>
      </radialGradient>
      <filter id="photo-shadow"><feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.3)"/></filter>
    </defs>
    <!-- back polaroid -->
    <g transform="translate(4,6) rotate(-8 28 28)" filter="url(#photo-shadow)">
      <rect x="6" y="4" width="36" height="42" rx="3" fill="#f5f5f0"/>
      <rect x="9" y="7" width="30" height="28" rx="2" fill="#c8d6e5"/>
    </g>
    <!-- front polaroid with scene -->
    <g transform="translate(10,4)" filter="url(#photo-shadow)">
      <rect x="6" y="6" width="40" height="46" rx="3" fill="#fafaf5"/>
      <rect x="9" y="9" width="34" height="30" rx="2" fill="url(#photo-sky)" overflow="hidden"/>
      <!-- sun -->
      <circle cx="36" cy="16" r="5" fill="url(#photo-sun)" class="sun-pulse"/>
      <!-- mountains -->
      <polygon points="9,39 20,22 28,32 32,26 43,39" fill="url(#photo-mt)" opacity="0.8"/>
      <polygon points="15,39 28,28 43,39" fill="#4a6741" opacity="0.6"/>
      <!-- snow caps -->
      <polygon points="20,22 22,25 18,25" fill="rgba(255,255,255,0.7)"/>
      <polygon points="32,26 34,29 30,29" fill="rgba(255,255,255,0.6)"/>
      <!-- grass -->
      <rect x="9" y="35" width="34" height="4" rx="0" fill="url(#photo-grass)" opacity="0.9"/>
      <!-- caption area -->
      <rect x="14" y="42" width="20" height="2" rx="1" fill="#ddd" opacity="0.5"/>
    </g>
  </svg>`,

  /* ── Todo: clipboard with checkmarks ── */
  todo: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="todo-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1a3a4a"/><stop offset="1" stop-color="#0d2030"/>
      </linearGradient>
      <linearGradient id="todo-clip" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a4a5a"/><stop offset="1" stop-color="#1a3040"/>
      </linearGradient>
    </defs>
    <!-- Board -->
    <rect x="12" y="10" width="40" height="48" rx="5" fill="url(#todo-bg)" stroke="rgba(255,255,255,0.1)" stroke-width="0.8"/>
    <!-- Clip -->
    <rect x="24" y="6" width="16" height="10" rx="3" fill="url(#todo-clip)" stroke="rgba(0,229,193,0.3)" stroke-width="0.8"/>
    <rect x="28" y="8" width="8" height="4" rx="2" fill="#0d2030"/>
    <!-- Check rows -->
    <rect x="18" y="22" width="8" height="8" rx="2" fill="rgba(0,229,193,0.15)" stroke="rgba(0,229,193,0.4)" stroke-width="0.8"/>
    <polyline points="20,26 22,28.5 26,23.5" fill="none" stroke="#00e5c1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="30" y="24" width="18" height="2" rx="1" fill="rgba(255,255,255,0.4)"/>
    <rect x="30" y="28" width="12" height="1.5" rx="0.75" fill="rgba(255,255,255,0.15)"/>
    <rect x="18" y="34" width="8" height="8" rx="2" fill="rgba(0,229,193,0.15)" stroke="rgba(0,229,193,0.4)" stroke-width="0.8"/>
    <polyline points="20,38 22,40.5 26,35.5" fill="none" stroke="#00e5c1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="30" y="36" width="16" height="2" rx="1" fill="rgba(255,255,255,0.4)"/>
    <rect x="30" y="40" width="10" height="1.5" rx="0.75" fill="rgba(255,255,255,0.15)"/>
    <!-- Unchecked row -->
    <rect x="18" y="46" width="8" height="8" rx="2" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" stroke-width="0.8"/>
    <rect x="30" y="48" width="14" height="2" rx="1" fill="rgba(255,255,255,0.25)"/>
    <rect x="30" y="52" width="8" height="1.5" rx="0.75" fill="rgba(255,255,255,0.1)"/>
  </svg>`,

};
