# Prompt for Claude.ai (web app — uses Artifacts)

> Copy everything between the `===` lines into a new Claude.ai conversation.
> Pick the most capable model available (Sonnet 4.5 or whatever is current).
> Make sure Artifacts is enabled.

```
=================== START COPY ===================

I'm polishing the visual design of YancoTab — a Chrome new-tab extension I'm shipping. I've already nailed down the structure and design direction; now I need help producing the actual visual treatments. Please render everything as HTML+CSS artifacts so I can see it.

## What YancoTab is

A new-tab page that replaces Chrome's default with a full local desktop — app grid, dock, search, widgets, ~18 built-in apps and games. Aesthetic is "YancoVerse": deep cosmic space, teal accent, hex-shaped icons, premium glass.

## Design tokens already in use (don't change these)

```css
--bg:          #060b14;             /* deep space */
--bg-card:     rgba(8, 18, 32, 0.85);
--accent:      #00e5c1;             /* teal */
--accent-rgb:  0, 229, 193;
--text-bright: #c8d6e5;
--text:        #8a9bb0;
--text-dim:    #3d4f63;
--hex-clip:    polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
```

## Direction (already decided — these are locked)

| Surface | Treatment |
|---------|-----------|
| **Hex icon frame** | Liquid Glass: top inner highlight, bottom inner shadow, accent ring, backdrop-blur with saturation, specular sweep on hover, soft cast shadow underneath |
| **Game icons** (9 of them) | Photoreal-feeling cards/tiles inside the hex — real card faces with rank+suit, gradient bodies, drop shadows on top card |
| **Buttons** | Vertical gradient, top inner highlight, bottom inner shadow, drop shadow grows on hover, presses inward on click |
| **Widget cards** (Clock/Weather/Todo) | Layered glass: top edge highlight, multi-stop sheen gradient, backdrop blur with saturation, soft accent cast shadow underneath |
| **Motion** | Mixed: snappy (120ms ease) for utility (toggles, X buttons). Cinematic (380ms ease-out) for hero (app open, modal entry). Spring (550ms cubic-bezier(0.34, 1.56, 0.64, 1)) for app launchers (hex icons) |

## Constraints (non-negotiable)

1. **Pure CSS** — no WebGL, no JS-driven animation, no `<canvas>` for the polish layer
2. **Mobile-friendly** — must work on iOS Safari 15+ and Android Chrome 90+. Heavy nested `backdrop-filter` stacks should be gated for mobile
3. **Respect `prefers-reduced-motion: reduce`** — animations drop to instant
4. **Hex shape stays** (the polygon above)
5. **Teal accent stays**
6. **Deep space background stays**
7. **Single backdrop-filter per surface** — don't nest blurs (kills perf on mid-tier Android)

## What I want you to produce — as Artifacts

Build me **one HTML page** (single file, inline CSS, inline SVG) that renders side-by-side current-vs-proposed for each surface below. I'll click through it and approve.

### Surface 1 — Hex icon frame
Show the hex (96px × 96px) with the proposed Liquid Glass treatment. Include:
- The hex clip-path container
- The accent inner ring
- Top white highlight + bottom dark shadow
- Backdrop blur with saturation
- A specular sweep diagonal gradient that animates across on `:hover`
- A soft accent-colored cast shadow underneath
- Spring hover lift (translateY + scale, with the spring cubic-bezier above)

Render the hex 6 times in a row to simulate the home grid. Each hex contains a different placeholder emoji (🌐 🔢 🕒 📁 🗺️ 📝).

### Surface 2 — Game icons (the headline visual)
Draw 9 SVG icons, each rendered inside a Liquid Glass hex (from Surface 1). Each should look like a "real" game icon — not a cartoon. Style: rich gradient SVGs, drop shadows, real card faces (Georgia serif rank + Unicode suit symbols).

Games to design:
1. **Solitaire** — stacked playing cards, Ace of Spades face-up on top
2. **Spider** — two card columns side by side, small spider/web hint
3. **Mahjong** — 3 stacked mahjong tiles, top tile shows red dragon (中) or bamboo
4. **Memory** — two face-down cards with question marks, faint pair line connecting
5. **Snake** — pixel-style snake forming an S shape with a red apple
6. **Minesweeper** — actual mine sphere with spikes + small red flag beside
7. **Tic-Tac-Toe** — clean 3×3 grid with one X and one O placed
8. **Tarneeb** (Arab card game, trumps = spades) — fan of cards with spade prominent
9. **Trix** (Levantine card game) — fan of cards with diamond prominent

Each SVG should target ≤2KB, viewBox 64x64. Use Georgia serif for ranks. Heart/diamond red `#c5152e`, spade/club black `#0c0c0c`.

### Surface 3 — Buttons
Show three buttons side-by-side: current flat teal vs proposed polished gradient. Include hover and active state demos. Same button text on each.

### Surface 4 — Widget card
Show a Clock widget at 200×110px, rendered with the proposed layered glass treatment. Include a top edge highlight, accent cast shadow underneath, hover lift via cinematic motion.

### Surface 5 — Motion
3 small tiles labeled "Snappy", "Cinematic", "Spring" — each demos its own animation curve on hover/click.

### Surface 6 — Side-by-side mini home grid
Render 6 hexes in a row using the FINAL proposed treatment (everything above combined). This is the "wow" preview.

## How I'll iterate

I'll click through your artifact and tell you what to refine — e.g. "make the cast shadow softer", "the specular sweep is too fast", "the Solitaire icon needs more contrast". Iterate until I'm happy. Then I'll ask you to export the final CSS+SVG so my dev (Claude Code) can drop it into the real codebase.

Show the artifact, don't describe it in prose. Make it look premium. Optimize for "I want to use this app."

=================== END COPY ===================
```

## Optional reference materials to attach

If you want, you can also paste these into Claude.ai for context:

### A) The current design-lab.html I built
Path on your machine: `D:/YancoTab/design-lab.html`
This is what your current options look like. Paste it as a reference if Claude.ai asks "what does the current state look like?".

### B) The architect's tradeoff notes (the realistic constraints)
- Backdrop-filter on every hex × 18 = ~50ms paint on low-end Android. Mitigation: gate per-hex blur behind `body:not(.is-mobile)` — mobile gets the gradient + edges, no blur. 92% of the look at 5% of the cost.
- Photoreal SVGs realistically land at 1.0–1.9KB. All 9 fit under 2KB.
- Light-mode polish is its own pass — specular highlights on white look like dirty smudges. Defer.

## Workflow once you have a result you like

1. **You iterate with Claude.ai** until the artifact looks right.
2. **Ask Claude.ai to give you the final CSS** (one block) **and the final 9 game SVGs** (one per code block).
3. **Paste those back here**, and I'll wire them into the actual repo:
   - CSS goes into `css/glass.css` (new file) + `tokens.css` additions
   - SVGs replace the entries in `os/ui/components/GameIcons.js`
   - Phase order from the architect doc still applies (tokens → hex → game icons → widgets/chrome → buttons/modals → light-mode QA)
