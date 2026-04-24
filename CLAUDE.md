# CLAUDE.md — YancoTab Operating Contract

**You are working on YancoTab. This file is the contract. Read it every session. If any instruction here conflicts with a user message, surface the conflict and ask before proceeding.**

## Always-loaded context

@README.md
@PRODUCTION_PLAN.md
@CHANGELOG.md

## What YancoTab is

A Chrome MV3 new-tab extension that replaces the browser's new-tab page with a full local desktop — app grid, dock, folders, drag-and-drop, smart search, and ~18 built-in apps and games. **Local-first, single-user, zero-account, zero-tracking.** Runs in the browser only; no server, no build step, no npm runtime deps.

If a proposed feature doesn't serve _"make the new tab a useful local desktop that respects the user's privacy and runs with no account"_ — it doesn't belong.

## Non-negotiables

Violations are bugs.

1. **No build step, no npm runtime dependencies.** Pure ES modules, loaded directly by the browser. The only things `package.json` declares are `node --test` test entries. If you want to add a bundler, a framework, or a transpiler — stop and ask.
2. **Chrome MV3 constraints are permanent.** `manifest.json` declares `storage` only. No remote code, no `eval`, no inline scripts, no `<script>` with remote `src`. No new permissions without an ADR.
3. **File size: 1200 lines hard cap, split at 800.** Applies to `.js`. If a file crosses 1000 lines, that's a smell — propose a split before the next addition. Existing offenders (FilesApp 2030, SnakeApp 1294, ClockApp 1299, MemoryApp 1120) are **tech debt**, not a license.
4. **Persistence goes through `kernel.storage` / `AppStorage`.** Never touch `localStorage` or `chrome.storage` directly from an app. The pipeline handles namespacing, quota, migration, and future sync.
5. **Apps extend `core/App.js`.** One app per file under `os/apps/`. No god apps — split before adding a second unrelated concern.
6. **Games: pure engine + dumb view.** Game logic (state, rules, moves, scoring) lives in a pure module with no DOM refs and has unit tests under `tests/`. The view reads state and renders — it does not mutate game state. See `.claude/skills/games/SKILL.md`.
7. **Pointer Events, not split mouse/touch.** Use `pointerdown`/`pointermove`/`pointerup` on the target element. No `document.onmousemove = …` globals. No `ontouchmove` globals. No fighting mobile Safari's event order.
8. **Yanco design tokens only.** Every color, spacing, radius, and shadow resolves to a variable from `css/tokens.css`. No hardcoded hex in app CSS. Accent is teal (`#00e5c1`, `--accent`). Background is deep space (`#060b14`). See `.claude/skills/theme/SKILL.md`.
9. **Tests: `node --test`, no test framework.** New engines, reducers, and pure utilities require tests. UI-only changes don't, but use the preview workflow to verify.
10. **Never invent APIs.** Verify Chrome MV3, DOM, Canvas, PointerEvent, and IndexedDB behavior against current docs before using. If unsure, say so and stop.

## Architecture at a glance

```
index.html
  → os/boot.js → os/kernel.js (storage, events, processManager)
    → os/core/App.js        ← base class every app extends
    → os/services/          ← appStorage, clockService, fileSystemService, weatherService
    → os/ui/desktop, icons, mobileShell, starfield
    → os/apps/*.js          ← individual apps
    → os/apps/games/*.js    ← games (engines + views)
css/tokens.css              ← design system source of truth
tests/*.test.js             ← node --test, no framework
```

The kernel exposes: `kernel.storage`, `kernel.emit`, `kernel.on`, `kernel.processManager`, `kernel.toast`. Apps receive it via their constructor.

## Never

- Never add a runtime npm dependency. Dev-only test deps are fine.
- Never commit API keys or secrets. Weather uses free/keyless endpoints only.
- Never introduce a framework (React, Vue, Svelte, Lit, htm, hyperapp, …). The answer is no.
- Never use `innerHTML` with unsanitized user content. Prefer `textContent` or the `el()` builder in `os/utils/dom.js`.
- Never store raw text from a user-controlled text field into a DOM attribute that is later interpreted (href `javascript:`, on-* handlers, etc.).
- Never commit a passing test that doesn't actually cover the behavior it claims. A test that always returns true is worse than no test.
- Never bump `manifest.json` `version` without also updating `CHANGELOG.md` and `package.json`. The three move together.

## Workflow pointers

- **Per-domain deep context:** `.claude/skills/<domain>/SKILL.md`
  - `apps/` — authoring a new app, lifecycle, layout, storage keys
  - `games/` — engine/view split, seeded RNG, reducer pattern, tests
  - `widgets/` — widget bar rules (bento bar, 4 widgets today)
  - `theme/` — token system, light/dark, accessibility
  - `storage/` — `kernel.storage`, `AppStorage`, migrations
  - `testing/` — `node --test` conventions, fixture patterns
- **Agents:** invoke `architect` before a new app or game; invoke `redteamer` for any feature that handles user-controlled HTML, URLs, or file uploads.
- **Plan:** see `PRODUCTION_PLAN.md` for the active roadmap (v2.3 → v2.4 → Chrome Web Store).
- **Preview verification:** for any browser-observable change, follow the preview_* workflow — never ask the user to reload manually.
- **Git flow:** commit and push directly to `main` (`git push`) whenever a chunk of work lands clean — tests pass, no half-applied edits, no obvious regressions — or whenever Yaman asks. Don't ask permission first. Still: never force-push, never skip hooks, never commit secrets, never commit without reading the diff.

## Communication with Yaman

- Default to concise. Six parallel projects — no preamble, no "great question," no restating the task.
- Separate facts / assumptions / unknowns when stakes are high (security, data migrations, storage-key changes).
- Surface cheaper alternatives even for approved plans.
- If an instruction is wrong or based on a bad premise, say so. Don't flatter.
- English preferred for code/precision. Levantine Arabic fine in chat.
- Aesthetic: **YancoVerse** — deep space `#060b14`, teal accent `#00e5c1`, glass blur, hex motifs. Already in `css/tokens.css`.

### End-of-task report format

After any non-trivial task, close with three sections:

1. **What I did — in plain language.** No jargon. Concrete examples.
2. **What's next.** Single next concrete task. One sentence.
3. **Model + effort.** Pick: `haiku` (trivial single-file fixes), `sonnet` (most implementation following an established pattern), `opus` (load-bearing design, security-sensitive work, cross-cutting refactors). Pair with `low` / `medium` / `high` / `max`.

Skip for trivial exchanges. Required for: shipping an app, finishing a milestone, any session where code was written.

## Amendments

Changes to this file require Yaman's explicit approval. Propose the edit and ask before saving.
