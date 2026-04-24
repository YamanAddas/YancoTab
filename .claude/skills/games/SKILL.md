---
name: games
description: Deep context for os/apps/games/. Load when authoring, rewriting, or reviewing a game — the pure engine / dumb view split, seeded RNG for reproducible runs, reducer pattern via shared/store.js, required unit tests under tests/, and the "neon canvas" visual template established by the Snake/Minesweeper/Memory/TicTacToe rewrites. Also covers card games (cardEngine) and the Solitaire remake spec in PRODUCTION_PLAN.md.
---

# SKILL: Games

**When to read:** any task in `os/apps/games/`. Games in YancoTab follow a stricter architecture than regular apps because they accumulate state, need undo, and must be testable without a DOM.

## The engine/view split

Every new or rewritten game has:

```
os/apps/games/<game>/
├── engine/          ← pure state, no DOM
│   ├── state.js     ← data shapes, initial state, clone
│   ├── rules.js     ← legality predicates
│   ├── moves.js     ← action creators that take state → return new state
│   └── deal.js      ← seeded setup (if random)
├── view/            ← DOM/Canvas, reads state, renders
│   ├── Board.js
│   ├── input.js     ← pointer handlers → dispatch
│   └── animations.js
└── ui/              ← toolbar, panels, overlays
```

**Pure rule:** `engine/*.js` imports nothing DOM-related. `view/*.js` may import from `engine/`. `engine/` may NOT import from `view/`. This makes `node --test` coverage possible and undo/redo trivial.

## Hard rules

- **No DOM refs in state.** A `Card` in engine state is `{ suit, rank, faceUp, id }` — not `{ element, ... }`. The old pattern (`Card.element`) is the reason the original Solitaire is unrecoverable; don't bring it back.
- **Moves return new state.** `moveCard(state, ...)` → new state or `null` (illegal). Immutable; use `cloneState()` from `state.js`. This is what makes undo trivial.
- **Reducer pattern via `shared/store.js`.** `createStore(reducer, initial)` gives you `{ getState, dispatch, subscribe }`. Views subscribe and diff.
- **Seeded RNG via `shared/rng.js`.** Use `seededMulberry32(seed)` for anything reproducible (daily deals, winnable-only checks, replay). `dailySeed()` gives a stable seed per UTC date.
- **Pointer Events only.** No mouse/touch split. `pointerdown/move/up` with `setPointerCapture`.
- **ResizeObserver + poll-start.** Canvas games size via `ResizeObserver` on the container; if first observation fires with 0×0, poll `requestAnimationFrame` until non-zero. See SnakeApp for the canonical pattern.
- **Tests required.** Every engine ships with `tests/<game>-engine.test.js` covering state, rules, moves, win conditions, and edge cases. Target 95%+ branch coverage on `engine/`.
- **Persistence through `kernel.storage`.** Save `{ seed, moves, settings }` — not raw state. Replay from seed + moves on resume.

## Card games

Shared primitives in `os/apps/games/cardEngine/` (legacy DOM-coupled) and `os/apps/games/shared/` (pure). **New card games use `shared/`, not `cardEngine/`.** The old `cardEngine/Card.js` creates DOM in its constructor — don't build on that for the rewrite.

Tarneeb and Trix already have pure rules modules in `os/apps/games/tarneeb/` and `os/apps/games/trix/` with tests in `tests/tarneeb-rules.test.js` and `tests/trix-rules.test.js`. Model new card games on those.

## The neon canvas template

Established by Snake, Minesweeper, Memory, TicTacToe rewrites (commit a52af81). Visual language:

- Deep space background, subtle starfield (shared `os/ui/starfield.js`).
- Grid / board drawn on `<canvas>` with teal accent glow (`#00e5c1` @ `--accent-rgb`).
- Cell highlight via `inner-glow` + `--glow-sm`.
- Animations use `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`.
- Hex motif where board shape allows (clip-path or SVG).

Don't reinvent per-game — reuse the pattern.

## Solitaire remake

See `PRODUCTION_PLAN.md` §"Solitaire Remake — Cosmic Klondike" for the full spec. Phases S1–S6. S1 (engine) landed under `os/apps/games/solitaire/engine/` with 31 passing tests. Spider Solitaire is S6 and reuses the Klondike engine.

## Anti-patterns

- DOM refs in engine state.
- `Math.random()` in engine code (use seeded RNG so tests are stable).
- Mutating state in place inside a move (will break undo).
- Views that dispatch and then also mutate state locally for "responsiveness."
- A single 1500-line game file. Split.

## Known defects in current games

See PRODUCTION_PLAN.md defect tables. The original SolitaireApp.js has 15 structural defects including a `ReferenceError` on line 184 (`isPortrait` used before declaration) that makes it not render. That's why the rewrite exists; don't patch the old file.
