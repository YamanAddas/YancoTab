I have full context. Producing the design doc now.

---

# YancoTab — Premium Liquid Glass Polish Pass (v1.0.x)

**Owner:** Yaman | **Mode:** Architect — Design only, no implementation | **Target:** Pre-CWS visual elevation, no version bump

## 0. Tradeoffs surfaced up front (read before the doc)

1. **Specular sweep on 18 hex icons is fine — but only because we use `transition: opacity` on a CSS-only pseudo, not JS listeners.** No per-icon listeners are added. The sweep is `::before` with `opacity: 0 → 1` driven by `:hover`. Cost: 18 extra elements with `clip-path` + a transitioned linear-gradient. On Pixel 6 / iPhone 13 this stays within budget. But: **`backdrop-filter` on every hex is the real risk** — 18 nested blurs on the home grid is ~50ms of paint on Android low-tier. **Mitigation: gate the per-hex `backdrop-filter` behind `body:not(.reduced-effects):not(.is-mobile)`** — mobile + low-end gets the gradient + edge highlights but no blur. Visually 92% of the effect, 5% of the cost.
2. **"Photoreal cards" inside 2KB SVGs is achievable but ~1.5KB realistically per icon.** Real card faces with rank+suit+stacked geometry compress well as inline SVG (path data is repetitive). I've drafted all 9 below — 6 land at 1.0–1.6KB, 3 (Solitaire / Spider / Tarneeb) are 1.7–1.9KB. **All under the 2KB cap.** No need to bump it.
3. **Light-mode polish needs separate per-token recipes — not a free pass.** Specular highlights that read well on `#060b14` look like dirty smudges on `#f5f5f7`. The light-mode glass recipe inverts the highlight gradient (dark instead of white) and uses warmer cast shadows. Documented in §8 — but **the light-mode pass is realistically a separate verification round** before signing off. Recommend Phase 6 = "Light-mode QA pass" as its own gate.
4. **The owner already has good infrastructure.** `--yv-glass`, `--yv-platform`, `--depth-1..5`, `--spring-soft/snap/heavy`, `--specular`, `--inner-glow` already exist in `tokens.css` (lines 113–158). This polish pass mostly **wires existing tokens to surfaces that don't use them yet**, plus adds a small "liquid glass" recipe layer. Not a token-system rewrite.
5. **Game icon redraws are the only fully-new artwork.** Everything else is a CSS treatment swap.
6. **No new files needed except `css/glass.css`.** Token additions go in `tokens.css`. Per-surface treatments go in their existing CSS files (shell.css, home.css, window-chrome.css, modal.css, settings.css). Game SVGs replace the strings in `GameIcons.js` in place. **Zero JS file size impact.** SmartIcon.js stays 250 lines.

---

## 1. Token additions / changes

**Insert into `D:\YancoTab\css\tokens.css`** as a new block, **after** the existing "Specular highlight" line (~line 158), **before** the "Legacy Aliases" comment (~line 160). Keep dark mode in `:root`, mirror in `body.theme-light`.

```css
/* ── Liquid Glass Recipe (premium 2026 polish pass) ──
   Composable layers — combine via background: var(--lg-tint), var(--lg-sheen);
   Every "polished" surface uses the same vocabulary. */

/* Tints — semi-opaque base behind the sheen */
--lg-tint-deep:    rgba(8, 20, 36, 0.55);   /* hex icon body */
--lg-tint-card:    rgba(8, 18, 32, 0.55);   /* widget card body */
--lg-tint-pill:    rgba(6, 14, 24, 0.50);   /* search, toast, dock */
--lg-tint-modal:   rgba(10, 18, 32, 0.78);  /* modal cards (less translucent — must read on busy backdrops) */

/* Sheens — multi-stop linear gradient, top-light highlight */
--lg-sheen:        linear-gradient(165deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 25%, transparent 45%);
--lg-sheen-soft:   linear-gradient(165deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 30%, transparent 55%);
--lg-spotlight:    radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.18), transparent 50%);

/* Edge — top inner highlight + bottom inner shadow + accent ring */
--lg-edge:         inset 0 1.5px 0 rgba(255,255,255,0.42), inset 0 -1.5px 0 rgba(0,0,0,0.32);
--lg-edge-soft:    inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.18);
--lg-ring-accent:  inset 0 0 0 1px rgba(var(--accent-rgb), 0.55);
--lg-ring-glow:    inset 0 0 24px rgba(var(--accent-rgb), 0.10);

/* Cast shadow — soft halo under floating surfaces (separate ::after element) */
--lg-cast:         radial-gradient(ellipse, rgba(var(--accent-rgb), 0.45), transparent 70%);
--lg-cast-deep:    radial-gradient(ellipse, rgba(var(--accent-rgb), 0.60), transparent 70%);

/* Backdrop blur with saturation — single layer per surface */
--lg-blur:         blur(8px) saturate(1.4);
--lg-blur-card:    blur(20px) saturate(1.3);
--lg-blur-modal:   blur(32px) saturate(1.5);

/* Specular sweep — animated translateX gradient (composable) */
--lg-sweep:        linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%);

/* ── Motion Vocabulary (canonical names — every transition references these) ── */
/* Snappy: utility, toggles, X buttons, ctx menu items, toast dismiss */
--motion-snappy:    120ms cubic-bezier(0.4, 0, 0.2, 1);
/* Cinematic: app open/close, modal entry, boot, window chrome, scrim fades */
--motion-cinematic: 380ms cubic-bezier(0.22, 1.20, 0.36, 1.00);
/* Spring: hex icons, dock items, widget cards on hover, settings toggle knob */
--motion-spring:    550ms cubic-bezier(0.34, 1.56, 0.64, 1.00);

/* Reduced-effects fallbacks (used inside .reduced-effects scope) */
--motion-snappy-reduced:    80ms ease-out;
--motion-cinematic-reduced: 200ms ease-out;
--motion-spring-reduced:    160ms ease-out;
```

**Mirror block for `body.theme-light` (insert at end of light theme block, ~line 286, before scrollbar override):**

```css
body.theme-light {
  /* Liquid Glass — light mode (inverted highlight, warm cast) */
  --lg-tint-deep:    rgba(255, 255, 255, 0.62);
  --lg-tint-card:    rgba(255, 255, 255, 0.65);
  --lg-tint-pill:    rgba(255, 255, 255, 0.58);
  --lg-tint-modal:   rgba(255, 255, 255, 0.92);

  /* Light-mode sheen: dark top edge instead of white (white-on-white = invisible) */
  --lg-sheen:        linear-gradient(165deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.02) 25%, transparent 45%);
  --lg-sheen-soft:   linear-gradient(165deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.01) 30%, transparent 55%);
  --lg-spotlight:    radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.50), transparent 50%);

  --lg-edge:         inset 0 1.5px 0 rgba(255,255,255,0.85), inset 0 -1.5px 0 rgba(0,0,0,0.10);
  --lg-edge-soft:    inset 0 1px 0 rgba(255,255,255,0.60), inset 0 -1px 0 rgba(0,0,0,0.06);
  --lg-ring-accent:  inset 0 0 0 1px rgba(var(--accent-rgb), 0.30);
  --lg-ring-glow:    inset 0 0 24px rgba(var(--accent-rgb), 0.05);

  --lg-cast:         radial-gradient(ellipse, rgba(var(--accent-rgb), 0.20), transparent 70%);
  --lg-cast-deep:    radial-gradient(ellipse, rgba(var(--accent-rgb), 0.30), transparent 70%);

  /* Specular sweep stays white but lower alpha */
  --lg-sweep:        linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.40) 50%, transparent 70%);
}
```

**Note:** Motion tokens are theme-independent. Same curves both modes.

---

## 2. CSS module layout

**Decision: extend `tokens.css` for the recipe layer + add `css/glass.css` for the consumed-surface treatments.** Rationale:

- `tokens.css` stays a vocabulary file (variables only, no selectors). The new `--lg-*` vars belong there.
- A dedicated `css/glass.css` (~250 lines projected) holds the polish overrides for hex icons, search, dock, widgets, modals, toasts, buttons. Loads **after** all per-component CSS in `index.html` so it can win specificity without `!important`.
- **Existing files we touch (small, surgical edits — not rewrites):**
  - `shell.css` — remove the old `.hex-icon::before` outer-bloom and `.hex-icon-content` flat gradient (replaced by glass.css). ~30 lines deleted.
  - `home.css` — `.widget-card` background swap (~10 lines changed).
  - `window-chrome.css` — titlebar gets new sheen layer (~5 lines).
  - `modal.css` — backdrop blur tier-up + card sheen (~15 lines).
  - `settings.css` — `.ys-toggle` knob gets edge highlight, `.ys-btn` gets polished gradient (~20 lines).

**`index.html` load order (verify this order is preserved):**
```
tokens.css → reset.css → shell.css → home.css → cards.css → window-chrome.css → modal.css → settings.css → ... → glass.css (LAST)
```

If `glass.css` isn't last, the polish overrides won't apply cleanly. **This is the one structural change** to `index.html`: append one `<link>` at the end of the existing CSS block.

---

## 3. SmartIcon.js + hex container changes

### Strategy: **zero JS changes.** All polish is CSS-only.

The current `SmartIcon.js` (250 lines) already builds:
```
<div class="hex-icon app-icon-{appId}">
  <div class="hex-ring"/>           ← inner accent ring
  <div class="hex-icon-content"/>   ← clipped content layer
  <div class="hex-platform"/>       ← floor cast shadow
</div>
```

The "D — Liquid Glass" variant maps to this structure cleanly:
- `.hex-icon::before` → specular sweep (currently used for outer bloom — **repurpose**)
- `.hex-icon::after` → glass reflection (currently `--yv-glass` — **upgrade to `--lg-sheen`**)
- `.hex-icon-content` → tinted layer with backdrop-filter + edge inset shadows
- `.hex-ring` → keep as accent ring (no change needed)
- `.hex-platform` → keep, but swap to `--lg-cast` for richer halo

### CSS to insert in `glass.css` (replaces the relevant `shell.css` selectors)

```css
/* ── Liquid Glass Hex Icon (Section 1 D variant) ── */

/* Outer specular sweep — opacity-driven, NO JS listener.
   Sweeps left→right across the hex on hover. Single CSS-only effect per icon. */
.hex-icon::before {
  content: '';
  position: absolute;
  inset: 0;
  clip-path: var(--hex-clip);
  background: var(--lg-sweep);
  opacity: 0;
  transform: translateX(-30%);
  transition:
    opacity var(--motion-cinematic),
    transform var(--motion-cinematic);
  pointer-events: none;
  z-index: 5; /* above content, below label */
  /* Override: remove old outer-bloom blur/inset/filter */
  filter: none;
}

.hex-icon:hover::before,
.hex-icon:focus-visible::before {
  opacity: 1;
  transform: translateX(20%);
}

/* Inner content — liquid glass body.
   Category color (set inline by SmartIcon → getCategoryColor()) provides the
   accent tint. We layer the sheen + spotlight on top. */
.hex-icon-content {
  /* Existing: background-color is set inline by SmartIcon via getCategoryColor.
     We compose the sheen + spotlight as background-images on top of that. */
  background-image:
    var(--lg-sheen),
    var(--lg-spotlight);
  background-color: var(--lg-tint-deep); /* fallback if inline override is removed */
  /* The inline background-color from SmartIcon wins here — that's intentional.
     The category tint is the base color; sheen + spotlight are the gloss. */

  /* Edge highlights via inset shadows (work fine through clip-path) */
  box-shadow:
    var(--lg-edge),
    var(--lg-ring-accent),
    var(--lg-ring-glow);
}

/* Backdrop blur — desktop only, gated to avoid 18× paint cost on mobile */
@media (hover: hover) and (pointer: fine) {
  body:not(.reduced-effects) .hex-icon-content {
    -webkit-backdrop-filter: var(--lg-blur);
    backdrop-filter: var(--lg-blur);
  }
}

/* Glass reflection layer — upgraded sheen */
.hex-icon::after {
  background: var(--lg-sheen-soft);
  /* (keeps existing inset/clip-path/z-index) */
}

/* Floor cast shadow — richer halo */
.hex-platform {
  background: var(--lg-cast);
  filter: blur(10px);
  width: 80%;
  height: 14px;
  bottom: -16px;
}

.app-icon:hover .hex-platform,
.m-app-item:hover .hex-platform {
  background: var(--lg-cast-deep);
  width: 90%;
  bottom: -20px;
}

/* Spring motion (Section 5: app launchers → spring) */
.app-icon,
.m-app-item {
  transition: transform var(--motion-spring);
}

.app-icon:hover,
.m-app-item:hover {
  transform: translateY(-8px) scale(1.06); /* Slightly less than the lab's tilt — tilt on grid icons gets nauseating at 18 simultaneous */
}

.app-icon:active,
.m-app-item:active {
  transform: scale(0.94);
  transition: transform var(--motion-snappy); /* Snappy press, springy release */
}
```

### What gets DELETED from `shell.css` (so we don't double-style):

- Lines 290–311: old `.hex-icon::before` outer bloom (replaced)
- Lines 333–342: old `.hex-icon::after` glass reflection (background updated)
- Lines 344–366: `.hex-platform` width/height/blur (values updated)
- Line 373: `.hex-icon-content`'s flat `background:` line (now compositional)

**Net shell.css impact:** ~40 lines removed, replaced by ~80 lines in glass.css. Total CSS size grows ~40 lines. Well under any limit (CSS uncapped).

### Risk: inline `style.backgroundColor` from SmartIcon

`SmartIcon.js` line 49 sets `style: { backgroundColor: catColor }` on `.hex-icon-content`. **This wins over `background-color:` in CSS but does NOT win over `background-image:`.** The `--lg-sheen` + `--lg-spotlight` will paint on top of the category tint as intended. Verified by CSS spec — `background-image` and `background-color` are separate longhands. **No JS change needed.**

---

## 4. GameIcons.js redraw — all 9 SVGs

All SVGs use viewBox `0 0 100 100`, render inside `.hex-icon-content`. Each is a single `<svg>` template literal replacing the existing entry in `GAME_ICONS` (lines 22–187 of `GameIcons.js`). **GAME_MINI_ICONS and GAME_METADATA_ICONS are untouched in v1** — they ship in folder thumbnails and app metadata, where redraw isn't visible enough to matter for the polish pass. Flag for v2 if owner agrees.

Color philosophy: **suit reds use `#c5152e` (matches the design lab's `solitaire-photo .card.heart`), suit blacks use `#0c0c0c`. Card bodies are vertical white-to-warm-cream gradients (`#ffffff → #f4f4f4`), 0.5px inset stroke, drop-shadow on the front card.** Background is transparent — the hex liquid-glass shell shows through.

### Ace of Spades on top — Solitaire (≈1.7KB)

```javascript
solitaire: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="sl-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f0eee6"/></linearGradient>
    <filter id="sl-s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="rgba(0,0,0,0.55)"/></filter>
  </defs>
  <!-- back card: 3 of clubs, rotated -14° -->
  <g transform="rotate(-14 32 60)"><rect x="14" y="32" width="36" height="50" rx="5" fill="url(#sl-c)" stroke="rgba(0,0,0,0.18)" stroke-width="0.5"/>
    <text x="18" y="44" fill="#0c0c0c" font-family="Georgia,serif" font-weight="700" font-size="11">3</text>
    <text x="18" y="55" fill="#0c0c0c" font-family="Georgia,serif" font-size="13">♣</text>
    <text x="46" y="74" fill="#0c0c0c" font-family="Georgia,serif" font-size="13" text-anchor="end" transform="rotate(180 32 60)">♣</text></g>
  <!-- middle card: 2 of hearts, rotated -2° -->
  <g transform="rotate(-2 50 56)"><rect x="32" y="26" width="36" height="50" rx="5" fill="url(#sl-c)" stroke="rgba(0,0,0,0.18)" stroke-width="0.5"/>
    <text x="36" y="38" fill="#c5152e" font-family="Georgia,serif" font-weight="700" font-size="11">2</text>
    <text x="36" y="49" fill="#c5152e" font-family="Georgia,serif" font-size="13">♥</text></g>
  <!-- front card: Ace of Spades, rotated 10° with drop-shadow -->
  <g transform="rotate(10 68 50)" filter="url(#sl-s)"><rect x="48" y="18" width="38" height="52" rx="5.5" fill="url(#sl-c)" stroke="rgba(0,0,0,0.20)" stroke-width="0.5"/>
    <text x="52" y="32" fill="#0c0c0c" font-family="Georgia,serif" font-weight="700" font-size="13">A</text>
    <text x="52" y="44" fill="#0c0c0c" font-family="Georgia,serif" font-size="14">♠</text>
    <!-- centered big spade -->
    <path d="M67 36c0-7 9-9 9-15 0-3.5-4.5-5-7-3-1-3.5-7-3.5-8 0-2.5-2-7 0-7 4 0 6 9 9 9 15z M64 50h6c-1 3-2.5 4.5-5 6 0.6-1.8 0.6-4 0-6z" fill="#0c0c0c"/>
  </g>
</svg>`,
```

### Two card columns + spider hint — Spider (≈1.8KB)

```javascript
spider: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="sp-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f0eee6"/></linearGradient>
    <filter id="sp-s"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.5)"/></filter>
  </defs>
  <!-- left column: 3 cards stepped down -->
  <g filter="url(#sp-s)">
    <rect x="16" y="14" width="28" height="38" rx="4" fill="url(#sp-c)" stroke="rgba(0,0,0,0.18)" stroke-width="0.5"/>
    <rect x="16" y="26" width="28" height="38" rx="4" fill="url(#sp-c)" stroke="rgba(0,0,0,0.18)" stroke-width="0.5"/>
    <rect x="16" y="38" width="28" height="42" rx="4" fill="url(#sp-c)" stroke="rgba(0,0,0,0.20)" stroke-width="0.6"/>
    <text x="20" y="50" fill="#c5152e" font-family="Georgia,serif" font-weight="700" font-size="9">5</text>
    <text x="20" y="58" fill="#c5152e" font-family="Georgia,serif" font-size="10">♥</text>
  </g>
  <!-- right column -->
  <g filter="url(#sp-s)">
    <rect x="56" y="14" width="28" height="38" rx="4" fill="url(#sp-c)" stroke="rgba(0,0,0,0.18)" stroke-width="0.5"/>
    <rect x="56" y="28" width="28" height="42" rx="4" fill="url(#sp-c)" stroke="rgba(0,0,0,0.20)" stroke-width="0.6"/>
    <text x="60" y="42" fill="#0c0c0c" font-family="Georgia,serif" font-weight="700" font-size="9">K</text>
    <text x="60" y="51" fill="#0c0c0c" font-family="Georgia,serif" font-size="10">♠</text>
  </g>
  <!-- spider web hint — 3 strands from top corner -->
  <g stroke="rgba(255,255,255,0.35)" stroke-width="0.6" fill="none">
    <path d="M50 4 L20 22 M50 4 L50 16 M50 4 L80 22"/>
    <path d="M30 13 Q50 18 70 13" /><path d="M25 18 Q50 24 75 18"/>
  </g>
  <!-- tiny spider in center seam -->
  <circle cx="50" cy="22" r="3" fill="#1a1a1a"/><circle cx="50" cy="18" r="2" fill="#1a1a1a"/>
  <path d="M47 22 L42 24 M53 22 L58 24 M48 24 L44 28 M52 24 L56 28" stroke="#1a1a1a" stroke-width="0.8" stroke-linecap="round"/>
</svg>`,
```

### Stacked tiles, red dragon top — Mahjong (≈1.2KB)

```javascript
mahjong: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="mj-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#faf6e8"/><stop offset="1" stop-color="#e8dfc8"/></linearGradient>
    <linearGradient id="mj-side" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8bfa8"/><stop offset="1" stop-color="#9a917e"/></linearGradient>
    <filter id="mj-s"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="rgba(0,0,0,0.5)"/></filter>
  </defs>
  <!-- back tile (offset back-right) -->
  <g transform="translate(8,-6)">
    <path d="M30 22 L66 22 L70 26 L70 78 L66 82 L30 82 L26 78 L26 26 Z" fill="url(#mj-side)"/>
    <rect x="30" y="22" width="36" height="56" rx="3" fill="url(#mj-t)" stroke="rgba(0,0,0,0.15)" stroke-width="0.4"/>
  </g>
  <!-- front tile with 3D side -->
  <g filter="url(#mj-s)">
    <path d="M22 26 L58 26 L62 30 L62 82 L58 86 L22 86 L18 82 L18 30 Z" fill="url(#mj-side)"/>
    <rect x="22" y="26" width="36" height="56" rx="3" fill="url(#mj-t)" stroke="rgba(0,0,0,0.20)" stroke-width="0.5"/>
    <!-- 中 (red dragon) -->
    <text x="40" y="64" text-anchor="middle" fill="#c5152e" font-size="36" font-weight="700" font-family="serif">中</text>
    <rect x="26" y="30" width="28" height="48" rx="2" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="0.5"/>
  </g>
</svg>`,
```

### Two face-down ? cards — Memory (≈1.0KB)

```javascript
memory: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="mm-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e3a8a"/><stop offset="1" stop-color="#0f1e4a"/></linearGradient>
    <linearGradient id="mm-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f0eee6"/></linearGradient>
    <filter id="mm-s"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="rgba(0,0,0,0.5)"/></filter>
  </defs>
  <!-- back card (face-down, blue pattern) -->
  <g transform="rotate(-8 32 50)" filter="url(#mm-s)">
    <rect x="14" y="22" width="36" height="52" rx="5" fill="url(#mm-b)" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>
    <rect x="18" y="26" width="28" height="44" rx="3" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="0.6"/>
    <text x="32" y="56" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-family="Georgia,serif" font-weight="700" font-size="22">?</text>
  </g>
  <!-- front card (face-down, slight overlap, white bg) -->
  <g transform="rotate(8 68 50)" filter="url(#mm-s)">
    <rect x="50" y="22" width="36" height="52" rx="5" fill="url(#mm-c)" stroke="rgba(0,0,0,0.20)" stroke-width="0.5"/>
    <rect x="54" y="26" width="28" height="44" rx="3" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="0.5"/>
    <text x="68" y="56" text-anchor="middle" fill="#1e3a8a" font-family="Georgia,serif" font-weight="700" font-size="22">?</text>
  </g>
</svg>`,
```

### Pixel snake forming S + apple — Snake (≈1.2KB)

```javascript
snake: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="sn-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#16a34a"/></linearGradient>
    <linearGradient id="sn-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef4444"/><stop offset="1" stop-color="#b91c1c"/></linearGradient>
    <filter id="sn-s"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="rgba(0,0,0,0.45)"/></filter>
  </defs>
  <!-- pixel snake body — 8 segments forming an S (gradient cells) -->
  <g filter="url(#sn-s)">
    <rect x="26" y="22" width="11" height="11" rx="1.5" fill="url(#sn-b)"/>
    <rect x="38" y="22" width="11" height="11" rx="1.5" fill="url(#sn-b)"/>
    <rect x="50" y="22" width="11" height="11" rx="1.5" fill="url(#sn-b)"/>
    <rect x="50" y="34" width="11" height="11" rx="1.5" fill="url(#sn-b)"/>
    <rect x="50" y="46" width="11" height="11" rx="1.5" fill="url(#sn-b)"/>
    <rect x="38" y="46" width="11" height="11" rx="1.5" fill="url(#sn-b)"/>
    <rect x="26" y="46" width="11" height="11" rx="1.5" fill="url(#sn-b)"/>
    <rect x="26" y="58" width="11" height="11" rx="1.5" fill="url(#sn-b)"/>
    <rect x="26" y="70" width="11" height="11" rx="1.5" fill="url(#sn-b)"/>
    <!-- head with eye -->
    <rect x="38" y="70" width="11" height="11" rx="1.5" fill="url(#sn-b)" stroke="rgba(0,0,0,0.25)" stroke-width="0.5"/>
    <circle cx="44" cy="74" r="1.5" fill="#0a0f1a"/>
    <circle cx="44.5" cy="73.5" r="0.5" fill="rgba(255,255,255,0.8)"/>
  </g>
  <!-- red apple top-right -->
  <g filter="url(#sn-s)">
    <circle cx="74" cy="32" r="9" fill="url(#sn-a)"/>
    <ellipse cx="71" cy="29" rx="2.5" ry="1.5" fill="rgba(255,255,255,0.4)"/>
    <path d="M74 23 Q76 19 79 19" stroke="#0d4d2c" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="79" cy="20" rx="2.5" ry="1.5" fill="#22c55e" transform="rotate(20 79 20)"/>
  </g>
  <!-- pixel grid hint -->
  <g stroke="rgba(255,255,255,0.05)" stroke-width="0.4" fill="none"><line x1="18" y1="18" x2="86" y2="18"/><line x1="18" y1="86" x2="86" y2="86"/></g>
</svg>`,
```

### Mine sphere with spikes + red flag — Minesweeper (≈1.3KB)

```javascript
minesweeper: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <radialGradient id="mn-b" cx="0.35" cy="0.32" r="0.6"><stop offset="0" stop-color="#5a5a6a"/><stop offset="0.6" stop-color="#1e1e2e"/><stop offset="1" stop-color="#0a0a14"/></radialGradient>
    <linearGradient id="mn-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef4444"/><stop offset="1" stop-color="#991b1b"/></linearGradient>
    <filter id="mn-s"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="rgba(0,0,0,0.55)"/></filter>
  </defs>
  <!-- subtle 3x3 grid background -->
  <g stroke="rgba(255,255,255,0.08)" stroke-width="0.6" fill="none">
    <rect x="14" y="14" width="72" height="72" rx="6"/>
    <line x1="38" y1="14" x2="38" y2="86"/><line x1="62" y1="14" x2="62" y2="86"/>
    <line x1="14" y1="38" x2="86" y2="38"/><line x1="14" y1="62" x2="86" y2="62"/>
  </g>
  <!-- 8 spikes radiating from mine -->
  <g stroke="#1e1e2e" stroke-width="3.5" stroke-linecap="round">
    <line x1="50" y1="28" x2="50" y2="20"/><line x1="50" y1="72" x2="50" y2="80"/>
    <line x1="28" y1="50" x2="20" y2="50"/><line x1="72" y1="50" x2="80" y2="50"/>
    <line x1="34" y1="34" x2="28" y2="28"/><line x1="66" y1="34" x2="72" y2="28"/>
    <line x1="34" y1="66" x2="28" y2="72"/><line x1="66" y1="66" x2="72" y2="72"/>
  </g>
  <!-- mine sphere -->
  <g filter="url(#mn-s)"><circle cx="50" cy="50" r="20" fill="url(#mn-b)"/>
    <circle cx="42" cy="42" r="5" fill="rgba(255,255,255,0.28)"/>
    <circle cx="44" cy="44" r="2" fill="rgba(255,255,255,0.5)"/></g>
  <!-- red flag in bottom-left grid cell -->
  <g filter="url(#mn-s)">
    <line x1="22" y1="82" x2="22" y2="68" stroke="#3a3a3a" stroke-width="2" stroke-linecap="round"/>
    <path d="M22 68 L34 71 L22 75 Z" fill="url(#mn-f)" stroke="rgba(0,0,0,0.3)" stroke-width="0.4"/>
  </g>
</svg>`,
```

### Clean 3×3 grid + X + O — Tic-Tac-Toe (≈0.9KB)

```javascript
tictactoe: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="tt-x" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f472b6"/><stop offset="1" stop-color="#be185d"/></linearGradient>
    <linearGradient id="tt-o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#0284c7"/></linearGradient>
    <filter id="tt-s"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="rgba(0,0,0,0.4)"/></filter>
  </defs>
  <!-- grid lines (rounded, accent-tinted) -->
  <g stroke="rgba(255,255,255,0.55)" stroke-width="3.5" stroke-linecap="round" filter="url(#tt-s)">
    <line x1="40" y1="18" x2="40" y2="82"/><line x1="60" y1="18" x2="60" y2="82"/>
    <line x1="18" y1="40" x2="82" y2="40"/><line x1="18" y1="60" x2="82" y2="60"/>
  </g>
  <!-- X top-left, drawn with two strokes -->
  <g stroke="url(#tt-x)" stroke-width="5" stroke-linecap="round" filter="url(#tt-s)">
    <line x1="24" y1="24" x2="34" y2="34"/><line x1="34" y1="24" x2="24" y2="34"/>
  </g>
  <!-- O bottom-right, with gradient fill -->
  <circle cx="71" cy="71" r="8" fill="none" stroke="url(#tt-o)" stroke-width="5" filter="url(#tt-s)"/>
  <!-- subtle winning diagonal ghost -->
  <line x1="22" y1="22" x2="78" y2="78" stroke="rgba(255,255,255,0.10)" stroke-width="1.5" stroke-dasharray="2 3"/>
</svg>`,
```

### Spade prominent (default trump) — Tarneeb (≈1.7KB)

```javascript
tarneeb: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="tn-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f0eee6"/></linearGradient>
    <linearGradient id="tn-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#b45309"/></linearGradient>
    <filter id="tn-s"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="rgba(0,0,0,0.5)"/></filter>
  </defs>
  <!-- 4 fanned cards (partnership = 4 players) -->
  <g filter="url(#tn-s)">
    <rect x="12" y="34" width="28" height="42" rx="4" fill="url(#tn-c)" stroke="rgba(0,0,0,0.15)" stroke-width="0.4" transform="rotate(-22 26 55)"/>
    <rect x="28" y="28" width="28" height="42" rx="4" fill="url(#tn-c)" stroke="rgba(0,0,0,0.18)" stroke-width="0.4" transform="rotate(-8 42 49)"/>
    <rect x="44" y="28" width="28" height="42" rx="4" fill="url(#tn-c)" stroke="rgba(0,0,0,0.18)" stroke-width="0.4" transform="rotate(8 58 49)"/>
    <rect x="60" y="34" width="28" height="42" rx="4" fill="url(#tn-c)" stroke="rgba(0,0,0,0.15)" stroke-width="0.4" transform="rotate(22 74 55)"/>
  </g>
  <!-- center hero card: Ace of Spades (trump) -->
  <g filter="url(#tn-s)">
    <rect x="36" y="20" width="28" height="44" rx="5" fill="url(#tn-c)" stroke="rgba(0,0,0,0.22)" stroke-width="0.6"/>
    <text x="40" y="32" fill="#0c0c0c" font-family="Georgia,serif" font-weight="700" font-size="9">A</text>
    <!-- big spade -->
    <path d="M50 36c0-6 7-7.5 7-12.5 0-3-3.5-4-5.5-2.5-1-2.5-5.5-2.5-6.5 0-2-1.5-5.5 0-5.5 3 0 5 7 6.5 7 12.5z M48 50h4c-0.6 2-1.5 3-3 4 0.4-1.2 0.4-2.7 0-4z" fill="#0c0c0c"/>
  </g>
  <!-- crown above (bid winner) -->
  <g filter="url(#tn-s)">
    <path d="M36 14 L42 6 L46 11 L50 4 L54 11 L58 6 L64 14 L62 20 L38 20 Z" fill="url(#tn-g)" stroke="rgba(120,60,0,0.4)" stroke-width="0.5"/>
    <circle cx="50" cy="9" r="1.8" fill="#fff" opacity="0.7"/>
  </g>
</svg>`,
```

### Diamond fan — Trix (≈1.6KB)

```javascript
trix: `<svg class="game-svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="tx-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f0eee6"/></linearGradient>
    <linearGradient id="tx-d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dc2626"/><stop offset="1" stop-color="#7f1d1d"/></linearGradient>
    <filter id="tx-s"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="rgba(0,0,0,0.5)"/></filter>
  </defs>
  <!-- fan of 5 cards -->
  <g filter="url(#tx-s)">
    <rect x="10" y="38" width="26" height="40" rx="4" fill="url(#tx-c)" stroke="rgba(0,0,0,0.15)" stroke-width="0.4" transform="rotate(-28 23 58)"/>
    <rect x="22" y="32" width="26" height="40" rx="4" fill="url(#tx-c)" stroke="rgba(0,0,0,0.18)" stroke-width="0.4" transform="rotate(-14 35 52)"/>
    <rect x="37" y="28" width="26" height="40" rx="4" fill="url(#tx-c)" stroke="rgba(0,0,0,0.20)" stroke-width="0.4"/>
    <rect x="52" y="32" width="26" height="40" rx="4" fill="url(#tx-c)" stroke="rgba(0,0,0,0.18)" stroke-width="0.4" transform="rotate(14 65 52)"/>
    <rect x="64" y="38" width="26" height="40" rx="4" fill="url(#tx-c)" stroke="rgba(0,0,0,0.15)" stroke-width="0.4" transform="rotate(28 77 58)"/>
  </g>
  <!-- center card content: A of Diamonds -->
  <g filter="url(#tx-s)">
    <text x="41" y="40" fill="#c5152e" font-family="Georgia,serif" font-weight="700" font-size="9">A</text>
    <text x="41" y="50" fill="#c5152e" font-family="Georgia,serif" font-size="11">♦</text>
    <!-- big diamond center -->
    <path d="M50 38 L62 52 L50 66 L38 52 Z" fill="url(#tx-d)" stroke="rgba(0,0,0,0.25)" stroke-width="0.5"/>
    <path d="M50 42 L58 52 L50 62 L42 52 Z" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"/>
  </g>
</svg>`,
```

### File-size summary (approximate, minified inline)

| Game | Size | Notes |
|---|---|---|
| Solitaire | ~1.7KB | Heaviest — 3 cards + suit paths |
| Spider | ~1.8KB | 5 cards + spider web + spider |
| Mahjong | ~1.2KB | 2 tiles + 中 character |
| Memory | ~1.0KB | 2 cards + ? text |
| Snake | ~1.2KB | 10 pixel rects + apple |
| Minesweeper | ~1.3KB | Mine + 8 spikes + flag + grid |
| Tic-Tac-Toe | ~0.9KB | 4 grid lines + X + O |
| Tarneeb | ~1.7KB | 4 fanned + Ace of Spades + crown |
| Trix | ~1.6KB | 5 fanned + diamond center |

**All under 2KB. Total payload: ~12.4KB across 9 icons (current total: ~9KB, so +3.4KB).** Negligible.

---

## 5. Per-surface treatment table

| Surface | Selector | Before | After (recipe) | Motion binding |
|---|---|---|---|---|
| Hex icon (grid) | `.hex-icon`, `.hex-icon-content`, `.hex-platform`, `.hex-icon::before/::after` | Flat tint + outer-bloom blur ring | `--lg-tint-deep` + `--lg-sheen` + `--lg-spotlight` + `--lg-edge` + `--lg-ring-accent` + `--lg-ring-glow`. Specular sweep on hover (`::before` opacity). Backdrop-blur desktop-only. | `--motion-spring` |
| Hex icon (dock — `.nav-bar` items) | `.nav-item` | Flat hover tint | Add `--lg-edge-soft` + `--lg-sheen-soft` on `.active`. Spring transform on hover. | `--motion-spring` |
| Dock chrome | `.nav-bar` | Already has glass + accent ring | **Upgrade**: swap `background` to `var(--lg-tint-pill)`, add `background-image: var(--lg-sheen-soft)`, blur to `var(--lg-blur-card)`. Cast halo via `::after` using `--lg-cast`. | `--motion-cinematic` (slide up from below on initial mount) |
| Search bar | `.m-search-container`, `.m-search-input` | Teal tint + accent ring (already nice) | Add `background-image: var(--lg-sheen-soft)`. Add `box-shadow: ..., var(--lg-edge-soft)`. Focus ring uses `--lg-cast` underneath. | Snappy focus, cinematic hover lift |
| Widget cards | `.widget-card` | `bg-card` + blur(20px) + accent border | `var(--lg-tint-card)` + `var(--lg-sheen)` + `var(--lg-blur-card)` + box-shadow stack: `var(--lg-edge-soft), var(--lg-ring-accent)`. `::after` halo cast under card with `var(--lg-cast)`. | `--motion-cinematic` on hover (lift + scale) |
| Window chrome | `.window-chrome`, `.window-chrome__titlebar` | Heavy box-shadow + blur titlebar | Window: keep existing depth shadow, add `var(--lg-edge-soft)` inset. Titlebar: add `background-image: var(--lg-sheen-soft)` over existing dark fill. Keep traffic lights untouched (sacred). | Window open: cinematic. Drag: snappy. Resize: snappy. |
| Window scrim | `.window-chrome__scrim` | `rgba(0,0,0,0.4)` flat | Add `backdrop-filter: blur(4px)` for soft focus on what's behind. | Cinematic fade |
| Modal backdrop | `.ym-backdrop` | `rgba(0,0,0,0.5)` + blur(8px) | Bump blur to `blur(16px) saturate(1.3)`. Slight teal tint: `rgba(6,11,20,0.55)`. | Cinematic |
| Modal card | `.ym-card` | Glass surface + small accent inset | `var(--lg-tint-modal)` + `var(--lg-sheen)` + `var(--lg-blur-modal)` + `var(--lg-edge)` + `var(--lg-ring-accent)`. Drop shadow stays. | Cinematic enter (380ms scale 0.92→1) |
| Toast pill | `.toast-pill` | `bg-panel` + accent rings + blur(20px) | `var(--lg-tint-pill)` + `var(--lg-sheen-soft)` + `var(--lg-edge-soft)` + accent ring kept. Bottom border-left color stays for type semantic. | Snappy dismiss. Spring entry (already has, keep). |
| Onboarding modal | `.onboarding-modal` | `bg-panel` + accent rings | Same recipe as `.ym-card`. | Cinematic |
| Primary button (`.ob-primary-btn`, `.ym-btn--confirm`) | | Flat accent fill | **Polished button (Section 3)**: `linear-gradient(180deg, var(--accent-bright) 0%, var(--accent) 50%, [calc darker accent] 100%)`. Inset 0 1px 0 rgba(255,255,255,0.45) top, inset 0 -1px 0 rgba(0,0,0,0.20) bottom. Drop shadow grows on hover. Press: inset shadow + translateY(1px). | Snappy 150ms |
| Secondary button (`.ym-btn--cancel`, `.ys-btn`) | | Flat translucent | Add `--lg-edge-soft` + `--lg-sheen-soft`. Accent on hover via `--lg-ring-accent`. | Snappy |
| Settings toggle | `.ys-toggle`, `.ys-toggle-knob` | Flat track + flat knob | Track ON: gradient + `--lg-ring-accent`. Knob: white→`#f0f0f0` gradient + `inset 0 1px 0 rgba(255,255,255,0.6)` + drop-shadow. | Snappy 150ms (toggle is a utility) |
| Settings segmented | `.ys-seg-group`, `.ys-seg.is-active` | Flat active state | Active pill: polished button recipe (mini). Group: `--lg-edge-soft` inset. | Snappy 120ms |
| Greeting bar | `.greeting-bar` (current) | Plain text | Add subtle text-shadow tint by time of day: dawn=warm (`text-shadow: 0 0 24px rgba(255,180,120,0.15)`), day=accent, night=cool violet. **No structural change.** | Static (Playfair italic stays sacred) |
| Boot screen | `.boot-screen`, `.boot-text`, `.boot-logo` | Logo pulse + fade-in | Add subtle aurora wash behind text using `var(--aurora-bg)` (already exists). Logo pulse stays. **Add cinematic exit transition** (380ms fade + scale 1→1.02) when boot completes. | Cinematic exit |
| Folder overlay | `.folder-overlay`, `.folder-panel` | Backdrop blur + panel | Apply modal recipe to `.folder-panel`. | Cinematic |
| Context menu | `.context-menu`, `.ctx-menu` | Glass + accent rings | Add `--lg-sheen-soft` + `--lg-edge-soft`. | Snappy |
| Mobile context menu | `.mobile-context-menu` | Glass + accent rings | Same recipe as ctx menu. | Snappy |

### Greeting / boot specifics

- **Greeting tint** is the only place we add **time-of-day color drift**. Driven by a single CSS class on `<body>` (`.tod-dawn`, `.tod-day`, `.tod-dusk`, `.tod-night`) — already set by the existing greeting code based on hour. We only add the CSS rules:
  ```css
  body.tod-dawn .greeting-bar  { text-shadow: 0 0 28px rgba(255, 180, 120, 0.18); }
  body.tod-day  .greeting-bar  { text-shadow: 0 0 24px rgba(var(--accent-rgb), 0.15); }
  body.tod-dusk .greeting-bar  { text-shadow: 0 0 28px rgba(255, 140, 80, 0.20); }
  body.tod-night .greeting-bar { text-shadow: 0 0 32px rgba(120, 100, 220, 0.20); }
  ```

---

## 6. Motion vocabulary spec

Three canonical curves. Every transition in the codebase resolves to one of these or the existing `--ease-out`/`--ease-spring` (which we keep as legacy aliases).

| Curve | Token | Use cases |
|---|---|---|
| **Snappy** — 120ms ease | `--motion-snappy` | Toggle switches, segmented control, toast dismiss, ctx-menu items, traffic lights, X/close buttons, button press states, tab switches |
| **Cinematic** — 380ms cubic-bezier(0.22, 1.20, 0.36, 1.00) | `--motion-cinematic` | App window open/close, modal entry/exit, scrim fade, boot fade-out, search bar focus expansion, widget card hover lift, folder panel open |
| **Spring** — 550ms cubic-bezier(0.34, 1.56, 0.64, 1.00) | `--motion-spring` | Hex icons (grid + dock) hover, edit-mode jiggle release, page-dot expand-on-active, onboarding card landing, dock initial mount |

### Pairing rules

- **Press uses snappy, release uses curve-of-record.** A hex icon is `--motion-spring` on hover but `--motion-snappy` on `:active` so the press feels immediate.
- **Reduced motion** (CSS `@media (prefers-reduced-motion: reduce)` already in tokens.css line 319): all three curves get clamped to 80–200ms ease-out via the `*-reduced` tokens above.
- **`.reduced-effects` class** (set by `mobileShell._shouldReduceEffects()`): cinematic and spring downgrade to snappy. Add to glass.css:
  ```css
  body.reduced-effects {
    --motion-cinematic: var(--motion-cinematic-reduced);
    --motion-spring: var(--motion-spring-reduced);
  }
  ```

---

## 7. Mobile audit

| Effect | iOS Safari 15 | Android Chrome 90 | Mitigation |
|---|---|---|---|
| `backdrop-filter: blur()` | Supported (with `-webkit-` prefix) | Supported | Always include `-webkit-backdrop-filter` |
| `backdrop-filter: saturate()` combined | Supported | Supported | Single-layer per surface only |
| `clip-path: polygon()` | Supported | Supported | Already in use |
| Specular sweep (`::before` opacity transition) | Supported | Supported | No JS, no listener, GPU-cheap |
| 18 simultaneous backdrop-filters on hex icons | **Janky** (8–14ms per icon paint = 250ms total on iPhone SE) | **Janky** (Pixel 3a: 18ms × 18 ≈ 300ms) | **Gate behind `@media (hover: hover) and (pointer: fine)` + `body:not(.reduced-effects)`** — mobile/touch gets gradient-only, no blur |
| `filter: drop-shadow` on hex content | Supported but expensive | Supported | Use `box-shadow` where possible; reserve `drop-shadow` for SVG `<feDropShadow>` (cheaper) |
| Multiple gradients composited | Supported | Supported | Limit to 2 background-images per surface |
| `feDropShadow` in inline SVG game icons | Supported | Supported | Already used in PhosphorIcons.js |
| Cinematic 380ms transitions | Smooth | Smooth | Frame budget OK |
| Spring overshoot (`cubic-bezier(0.34, 1.56, 0.64, 1)`) | Smooth | Smooth | Already in use |

### Mobile-specific gates (added to glass.css)

```css
/* Desktop only — backdrop-filter on per-icon hex content */
@media (hover: hover) and (pointer: fine) {
  body:not(.reduced-effects) .hex-icon-content {
    -webkit-backdrop-filter: var(--lg-blur);
    backdrop-filter: var(--lg-blur);
  }
}

/* Touch devices — drop the per-icon backdrop, keep the gradient gloss.
   Visually 90% of the effect at 5% of the cost. */
@media (pointer: coarse) {
  .hex-icon-content { backdrop-filter: none; -webkit-backdrop-filter: none; }
  /* Specular sweep also drops on coarse pointers — no hover state to trigger. */
}

/* Reduced-effects mode — explicit fallback */
body.reduced-effects .hex-icon-content,
body.reduced-effects .widget-card,
body.reduced-effects .toast-pill {
  backdrop-filter: blur(8px); /* single light blur, no saturate */
  -webkit-backdrop-filter: blur(8px);
}

body.reduced-effects .hex-icon::before { display: none; } /* kill specular sweep */
```

### What stays mobile-safe by default (no gating needed)

Modal cards, dock chrome, toast pills, search bar, window chrome — these are 1–4 instances on screen at most. Backdrop-filter is fine.

---

## 8. Light theme delta

**The light-mode polish is materially different.** Highlights and shadows must invert. Recipe summary:

| Token | Dark mode | Light mode |
|---|---|---|
| `--lg-tint-deep` | `rgba(8, 20, 36, 0.55)` (dark glass) | `rgba(255, 255, 255, 0.62)` (white glass) |
| `--lg-sheen` | White-on-dark gradient (top-light) | **Dark-on-white** gradient (top-dark, simulating shadow under upper edge) |
| `--lg-edge` | White top inset + black bottom inset | White top inset (stronger) + faint black bottom inset |
| `--lg-cast` | Teal-rgba halo (visible on dark) | Light-blue halo (subtle but present) |
| `--lg-spotlight` | White ellipse top-left | White ellipse, lower alpha (already light bg) |

### Per-surface light-mode notes

- **Hex icons**: already have `body.theme-light .hex-icon-content` overrides in `shell.css` (lines 1181–1201). Keep the per-app gradients (calendar, weather, etc.) intact. Add the sheen + edge layer on top via the `--lg-*` tokens (which auto-resolve correctly because they're in `body.theme-light` block).
- **Widget cards**: light mode already has `body.theme-light .widget-card` (home.css:460). Switch background to `var(--lg-tint-card)` which auto-resolves to white.
- **Modal**: `.ym-card` light mode at modal.css:131 — the existing `rgba(255,255,255,0.95)` is fine, just add the sheen.
- **Buttons**: polished gradient stops need light variants:
  ```css
  body.theme-light .ob-primary-btn,
  body.theme-light .ym-btn--confirm {
    /* Light accent gradient: light blue → mid blue → dark blue */
    background: linear-gradient(180deg, #3a96ff 0%, var(--accent) 50%, #0056cc 100%);
  }
  ```
- **Specular sweep on hex icons**: sweep stays white but at lower alpha (already in `--lg-sweep` light override above). On light backgrounds the sweep reads as a soft luminance pulse rather than a glaring streak.

### Honest call-out

The dark-mode pass is straightforward — composite layers stack predictably on `#060b14`. **The light-mode pass needs a real eye-test session.** Specifically:
- Sheen on white widget cards can read as "smudge" if the highlight is too strong.
- Backdrop-filter on white surfaces blurs the wallpaper to off-white mush.
- Cast shadows in teal/blue look fine; in red/orange look like errors.

**Recommend Phase 6 = "Light-mode QA pass"** — a dedicated review where Yaman opens every surface in light mode and we tune the `body.theme-light` overrides per surface. Don't ship light mode polish in the same PR as dark — verify dark first, then iterate light.

---

## 9. Phasing — five PR-sized chunks + one QA gate

Each phase is independently shippable and revertable.

### Phase 1 — Tokens + glass.css scaffolding (≈250 lines CSS, no visual change yet)
**Files:** `tokens.css` (insert recipe + motion blocks, both modes), new `css/glass.css` (empty selectors with TODO comments), `index.html` (add `<link>` to glass.css).
**Visual impact:** zero. This is just plumbing.
**Reviewable:** token names + light-mode parity audit.
**Test:** existing 419 tests still pass (no functional change).

### Phase 2 — Hex icons + dock (the headline change)
**Files:** `css/glass.css` (add hex + dock rules), `css/shell.css` (delete old outer-bloom + flat content gradient).
**Visual impact:** the "wow" moment. Specular sweep, edge highlights, richer cast shadow, spring motion.
**Acceptance:** every `.hex-icon` shows specular sweep on hover (desktop), `--lg-edge` highlights present, spring lift on hover, `--motion-snappy` on press.
**Risk:** verifying that `style.backgroundColor` from SmartIcon's category color still composes with the sheen (it does, but verify visually on all 5 categories).

### Phase 3 — Game icon redraws (9 SVGs in GameIcons.js)
**Files:** `os/ui/components/GameIcons.js` (replace `GAME_ICONS` entries — leave `GAME_MINI_ICONS` and `GAME_METADATA_ICONS` alone for v1).
**Visual impact:** 9 launcher tiles look like real cards/tiles instead of cartoon hints.
**Acceptance:** all 9 SVGs render under 2KB, `_gameTones` overlay still readable, identical at 60px and 80px sizes.
**Risk:** the `_gameTones` overlay (SmartIcon line 209–215) sits on top of the SVG via `.game-tint`. On the new richer SVGs the tint may flatten the photoreal feel — **consider dropping the tint to `rgba(...,0.04)` from the current `0.08–0.10`** so the cards stay legible.
**Test:** snapshot test if the project has visual snapshots, otherwise Yaman eye-test in design-lab equivalent.

### Phase 4 — Widget cards + window chrome + scrim
**Files:** `css/home.css` (.widget-card), `css/window-chrome.css` (titlebar sheen + scrim blur).
**Visual impact:** widget cards feel layered, windows feel more isolated against the desktop.
**Acceptance:** widget hover lifts via `--motion-cinematic`, scrim blur 4px in place, titlebar sheen visible at top edge.

### Phase 5 — Buttons + modals + toast + settings rows
**Files:** `css/glass.css` (button polished recipe), `css/modal.css` (sheen + blur tier-up), `css/shell.css` (.toast-pill), `css/settings.css` (.ys-toggle, .ys-btn polished, .ys-seg).
**Visual impact:** every interactive control feels physical.
**Acceptance:** Polished primary buttons show top highlight + bottom shadow + grow-on-hover + press inward. Toggle knob has edge highlight. Toast slides up snappy, dismisses snappy.

### Phase 6 — Light-mode QA pass (gate, not a feature ship)
**Files:** any `body.theme-light` selectors that need tuning after eye-test.
**Acceptance:** Yaman opens every polished surface in light mode and signs off. No "this looks worse than v1" surfaces.
**Why separate:** see §8 honesty call-out. Light mode polish is high-risk for "looks dirty" failure modes that don't show up in design-lab.

---

## 10. Acceptance criteria (per phase)

### Phase 1
- [ ] All `--lg-*` tokens exist in both `:root` and `body.theme-light`.
- [ ] All 3 motion tokens exist with reduced-effects variants.
- [ ] `glass.css` is loaded last in `index.html`.
- [ ] No selector in `glass.css` has more than one `backdrop-filter` (rule check).
- [ ] 419 tests still pass.

### Phase 2
- [ ] `.hex-icon::before` has `background: var(--lg-sweep)` and animates opacity 0→1 on hover with `--motion-cinematic` duration.
- [ ] `.hex-icon-content` has `box-shadow: var(--lg-edge), var(--lg-ring-accent), var(--lg-ring-glow)`.
- [ ] Hex icons show backdrop-filter only on `(hover: hover) and (pointer: fine)`.
- [ ] Hover transform uses `--motion-spring`; active uses `--motion-snappy`.
- [ ] `.hex-platform` background = `var(--lg-cast)`, hover swaps to `var(--lg-cast-deep)`.
- [ ] Old `.hex-icon::before` outer-bloom block deleted from `shell.css`.
- [ ] Visual: 18-icon home grid hover average frame time ≤16ms on Pixel 6 (manual perf check).

### Phase 3
- [ ] All 9 `GAME_ICONS` entries replaced with the SVGs in §4.
- [ ] Each minified SVG ≤2048 bytes (script check: `[...Object.values(GAME_ICONS)].forEach(s => assert s.length < 2048)`).
- [ ] No new colors outside the per-SVG inline gradient stops (which are exempt per non-negotiable #9).
- [ ] `_gameTones` lowered to `0.04` alpha (or kept — Yaman call after seeing both).

### Phase 4
- [ ] `.widget-card` background uses `--lg-tint-card` + `--lg-sheen`.
- [ ] `.widget-card:hover` lifts with `--motion-cinematic`.
- [ ] `.window-chrome__titlebar` has `--lg-sheen-soft` background-image layer.
- [ ] `.window-chrome__scrim` has `backdrop-filter: blur(4px)`.

### Phase 5
- [ ] `.ob-primary-btn`, `.ym-btn--confirm` use polished gradient recipe.
- [ ] `.ym-card` uses `--lg-tint-modal` + `--lg-sheen` + `--lg-blur-modal`.
- [ ] `.toast-pill` dismiss timing = `--motion-snappy`.
- [ ] `.ys-toggle.on .ys-toggle-knob` has edge highlight + drop-shadow.

### Phase 6
- [ ] Yaman manual eye-test: dark + light, every surface from §5 table.
- [ ] No surface visually worse than v1.0.0 in either mode.
- [ ] Onboarding flow walked through end-to-end in both modes.

---

## 11. Risks

1. **Inline `style.backgroundColor` from SmartIcon's `getCategoryColor()`.** This sets a per-app tint on `.hex-icon-content`. The new design composes sheen + spotlight as `background-image` so they stack over the inline color. **Verify:** all 5 category colors (productivity, media, utilities, games, external) still read correctly with the white sheen on top. If sheen washes out a particular category, lower sheen alpha for that category — don't drop the inline tint.
2. **`_gameTones` overlay flattens the new photoreal cards.** Current values 0.08–0.10 alpha. Lower to 0.03–0.05 in Phase 3 or remove the `.game-tint` div entirely from SmartIcon (one-line change at SmartIcon.js:229).
3. **Backdrop-filter compounding.** If a hex icon (with backdrop-filter) sits inside the dock (also with backdrop-filter), and inside an open folder overlay (also with backdrop-filter), we have triple-nested blurs. **Fix:** the gating already excludes hex icons on touch/coarse pointers, and the folder overlay already turns into a fullscreen blur — when overlay is open, hex icons shouldn't apply their own blur. Add: `body.has-folder-open .hex-icon-content { backdrop-filter: none; }` and emit/listen for the folder-open event in the existing folder code (one-line CSS).
4. **Specular sweep transition steals paint.** On a 13-icon hover-storm (mouse swept across grid), 13 simultaneous opacity transitions could cause 1 frame drop. Acceptable. If it becomes noticeable, switch the sweep to `transition: opacity 200ms` (snappy) instead of cinematic — sweep cost halves.
5. **Light-mode regression risk** is high (§8). Mitigate by treating Phase 6 as a real gate, not a checkbox.
6. **Motion-token rename collision.** The codebase already uses `--ease-out`, `--ease-spring`, `--transition-fast/normal/slow/spring`. We're ADDING `--motion-snappy/cinematic/spring`, not replacing. **No deletion of legacy motion tokens in this PR.** Existing surfaces using `--ease-out` continue to work; new surfaces use the canonical `--motion-*`. Plan a separate cleanup PR after CWS launch to migrate all references.
7. **CHANGELOG / version bump skipped.** Per instruction, stay on v1.0.0. **But:** if this polish ships post-CWS-publish, it WILL need a version bump in the next release per CLAUDE.md non-negotiable #11. Document each phase in `CHANGELOG.md` under an "Unreleased" header so the bump is one-line when the time comes.
8. **Onboarding modal uses `.ob-primary-btn` with hardcoded `box-shadow: 0 0 20px rgba(var(--accent-rgb), 0.3)`** (shell.css:1005). When we change to polished gradient, the shadow stack changes. Verify the onboarding "Get started" button still looks intentional, not double-shadowed.

---

## 12. Rollback

Every phase is one revert per commit. Recommended commit structure:

| Phase | Commit | Revert command |
|---|---|---|
| 1 | "polish: add liquid-glass tokens + glass.css scaffold" | `git revert <sha-1>` |
| 2 | "polish: liquid glass hex icons + dock chrome" | `git revert <sha-2>` |
| 3 | "polish: redraw 9 game icons (photoreal cards/tiles)" | `git revert <sha-3>` |
| 4 | "polish: widget cards + window chrome + scrim blur" | `git revert <sha-4>` |
| 5 | "polish: buttons + modals + toast + settings rows" | `git revert <sha-5>` |
| 6 | "polish: light-mode tuning pass" | `git revert <sha-6>` |

**Why per-phase reverts work:** glass.css overrides existing CSS via load order. Reverting any phase removes selectors from glass.css; the underlying file (shell.css, home.css, etc.) for Phase 2+ might have minor deletions (~30–40 lines) that need to be restored. **Mitigation:** in Phase 2's commit, also keep the deleted `.hex-icon::before` block as a comment in shell.css (commented out) so revert is clean. Tag each revert-friendly point.

**Hard rollback (whole pass)**: `git revert <sha-1>..<sha-6>` returns to v1.0.0 visual state. No data migrations involved — pure CSS + SVG strings.

---

## Out-of-scope surfaces flagged for follow-up

Not in v1 polish PR but visible "cheap" against the new chrome — owner should consider for v1.1:

1. **Notes editor** (`os/apps/notes/`) — the textarea inside the polished window chrome reads as bare. Needs at minimum a `--lg-tint-card` background + Inter font + monospace fallback.
2. **Calculator button grid** — flat squares against polished glass shell will feel old. Whole grid needs polished button recipe.
3. **FilesApp file rows** — list rows are flat hover. Need `--lg-edge-soft` on hover.
4. **Pomodoro timer ring** — currently flat circle. Could use radial gradient + glow.
5. **Internal game boards** — Solitaire felt, Mahjong board, Memory grid — all flat. Out of scope for the launcher icon redraw but would benefit from the `--lg-*` recipe.

These are NOT blockers for the polish PR. They're the natural next pass after Yaman sees the new chrome land.

---

**Awaiting approval before any implementation.**

Files referenced in this design (all absolute paths):
- `D:\YancoTab\CLAUDE.md`
- `D:\YancoTab\PRODUCTION_PLAN.md`
- `D:\YancoTab\design-lab.html`
- `D:\YancoTab\css\tokens.css`
- `D:\YancoTab\css\shell.css`
- `D:\YancoTab\css\home.css`
- `D:\YancoTab\css\window-chrome.css`
- `D:\YancoTab\css\modal.css`
- `D:\YancoTab\css\settings.css`
- `D:\YancoTab\css\cards.css`
- `D:\YancoTab\os\ui\desktop\SmartIcon.js`
- `D:\YancoTab\os\ui\components\PhosphorIcons.js`
- `D:\YancoTab\os\ui\components\GameIcons.js`
- `D:\YancoTab\os\ui\components\WidgetBar.js`
- `D:\YancoTab\os\ui\components\widgets\ClockWidget.js`
- `D:\YancoTab\os\ui\components\WindowChrome.js`
- `D:\YancoTab\os\ui\components\YancoModal.js`
- `D:\YancoTab\os\ui\components\Toast.js`
- `D:\YancoTab\os\ui\mobileShell.js` (heuristic at line 737)

New file to be created in Phase 1:
- `D:\YancoTab\css\glass.css`