---
name: theme
description: Deep context for css/tokens.css and the YancoVerse design system. Load when writing any CSS, adding colors, touching light/dark mode, or reviewing visual work. Covers the token system (no hardcoded hex), the teal accent (#00e5c1), glass/blur recipes, hex motifs, animation easings, and the light-theme override path.
---

# SKILL: Theme

**When to read:** any task that writes CSS or changes visual output.

## The tokens are the law

Every color, spacing, radius, shadow, and easing resolves to a variable from `css/tokens.css`. **No hardcoded hex in an app's CSS.** If you need a new token, add it to `tokens.css` with a short description — don't inline `#00e5c1` in `notes.css`.

## Core palette

- `--bg: #060b14` — deep space background
- `--bg-card: rgba(8, 18, 32, 0.85)` — glass card surface
- `--accent: #00e5c1` — teal primary
- `--accent-rgb: 0, 229, 193` — use for rgba() glows
- `--accent-bright: #33ffdd` — hover/active
- `--text: …` / `--text-muted: …` — from tokens.css

Light theme overrides live under `body.theme-light { … }` in tokens.css. Don't fork a new light-theme system; extend the existing one.

## Glass recipe

```css
.my-panel {
  background: var(--bg-card);
  border: 1px solid rgba(var(--accent-rgb), 0.18);
  box-shadow: var(--yv-edge-glow), var(--inner-glow);
  backdrop-filter: blur(14px) saturate(1.2);
}
```

Tokens: `--yv-glass`, `--yv-edge-glow`, `--yv-platform`, `--inner-glow`, `--glow-sm/md/lg`.

## Motifs

- **Hex clip:** `clip-path: var(--hex-clip)` — the YancoVerse signature. Use sparingly; it looks great on avatar-style icons and bad on large panels.
- **Starfield:** global, rendered by `os/ui/starfield.js`. Don't add per-app starfields.
- **Spring easing:** `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` for any bouncy interaction. Linear and ease-in-out are boring — use them only when spring would distract.

## Typography

- `--font-sans: 'Inter', system-ui, ...` — body
- `--font-mono: 'JetBrains Mono', ui-monospace, ...` — code, numbers, timers
- Weights: 400, 500, 600, 700. Avoid 300; it disappears against the dark background.

## Accessibility

- Contrast must pass WCAG AA on the dark theme. The teal-on-deep-space is safe; small teal text on teal-tinted glass is not — test.
- Focus rings: `box-shadow: 0 0 0 2px var(--accent)`. Never suppress focus.
- Reduced motion: respect `@media (prefers-reduced-motion: reduce)` — drop bounces, cut animation durations to <100ms.
- Hit targets: 44×44 CSS px minimum on mobile. `mobileShell` adjusts some; your new controls need to comply on their own.

## Anti-patterns

- Hardcoded `#00e5c1` in an app CSS file.
- Opaque backgrounds (kills the glass aesthetic). If you need opacity, use `var(--bg)` at 0.95 or add a blur behind it.
- Animation durations > 400ms without spring easing. Feels sluggish.
- Light-theme tokens in a separate file. One source: `tokens.css`.
- `!important`. Almost always a smell.

## Common tokens reference

Spacing: `--space-1` through `--space-8` (4px base). Radius: `--radius-sm/md/lg/full`. Shadows: `--shadow-sm/md/lg`. See `css/tokens.css` for the full list.
