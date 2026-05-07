# YancoTab — Design Handoff

Chrome new-tab extension. Aesthetic: **YancoVerse** — deep cosmic space, teal accent (`#00e5c1`), hex-shaped icons, premium liquid glass.

## Locked design tokens

```css
--bg:          #060b14;
--bg-card:     rgba(8, 18, 32, 0.85);
--accent:      #00e5c1;
--accent-rgb:  0, 229, 193;
--text-bright: #c8d6e5;
--text:        #8a9bb0;
--text-dim:    #3d4f63;
--hex-clip:    polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);

/* Motion */
--snappy:    120ms ease;                              /* utility */
--cinematic: 380ms cubic-bezier(0.16, 0.84, 0.32, 1); /* hero / app open */
--spring:    550ms cubic-bezier(0.34, 1.56, 0.64, 1); /* app launchers */
```

## Files

### Top level
- **`YancoTab New Tab.html`** — full new-tab page mock (status bar, hero clock, search, widgets, 18 hex apps, folders, dock).
- **`YancoTab Polish Lab.html`** — surface-by-surface polish reference (hex frame, game icons, buttons, widgets, motion, mini grid).
- **`YancoTab Innovation Lab.html`** — Clock (Orrery) + Weather (Sky Atlas) full app mocks + roadmap for the other 16.

### `apps/` — full hi-fi mocks for every app
Productivity / utility:
- `Notes.html` — Constellation
- `Todo.html` — Mission Control
- `Pomodoro.html` — Solar Cycle
- `Calculator.html` — Tape
- `Browser.html` — Wormholes
- `Files.html` — The Vault
- `Settings.html` — Mission Console
- `Maps.html` — Atlas
- `Photos.html` — Lightbox
- `PDF.html` — Codex

Games:
- `Solitaire.html` — Cosmic Felt
- `Spider.html` — Webwork
- `Mahjong.html` — Stoneworks
- `Memory.html` — Mirror
- `Snake.html` — Comet
- `Table.html` — Tarneeb / Trix / Tic-Tac-Toe salon

`apps/_shared.css` — shared cosmic background, app-frame chrome, titlebar, page header.

## Surface treatments (all locked)

| Surface | Treatment |
|---|---|
| **Hex icon frame** | Liquid Glass — accent ring, top white highlight, bottom dark inner shadow, backdrop-blur with saturation, specular sweep on hover, soft accent cast shadow |
| **Game icons** | Photoreal cards inside hex — Georgia serif ranks, Unicode suits, red `#c5152e` / black `#0c0c0c` |
| **Buttons** | Vertical gradient, top inner highlight, bottom inner shadow, drop shadow grows on hover, presses inward on click |
| **Widget cards** | Layered glass — top edge highlight, multi-stop sheen gradient, single backdrop blur with saturation, accent cast shadow |

## Constraints

1. Pure CSS — no WebGL, no JS animation, no `<canvas>` for polish
2. Mobile gates heavy `backdrop-filter` stacks
3. `prefers-reduced-motion: reduce` → animations drop to instant
4. Single `backdrop-filter` per surface (no nested blurs)
5. Hex shape, teal accent, deep space bg are non-negotiable

## Notes for implementation

- Mocks use inline CSS for portability. Lift the shared system into proper CSS modules when porting.
- Game card faces use Georgia serif + Unicode suits — keep that.
- All motion variables are in `--snappy` / `--cinematic` / `--spring`. Map them to your app's transition tokens.
- The `--hex-clip` polygon is shared by every hex element (app icons, dock, folders, friend dots). Keep one source of truth.
- Icon glyphs in Apps grid use placeholder emoji + text. Replace with real SVG icons in production but keep the hex bezel + body + spec layers.
