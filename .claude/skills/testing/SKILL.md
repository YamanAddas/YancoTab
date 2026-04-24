---
name: testing
description: Deep context for tests/*.test.js. Load when writing or reviewing tests. YancoTab uses node --test with zero test frameworks. Covers the file naming convention, how to structure describe/test blocks, fixture patterns, and what must vs. must-not have tests.
---

# SKILL: Testing

**When to read:** any task that adds or changes a test, and any task that ships a new pure engine, reducer, parser, or utility.

## The rules of the road

- **Framework: `node --test` + `node:assert/strict`.** No Vitest, no Jest, no Mocha. Zero install.
- **Location: `tests/<name>.test.js`.** Flat directory, one file per concern.
- **Run: `node --test tests/<name>.test.js`** or via the repo's `test` script in `package.json`.
- **ES modules only** — the repo is `"type": "module"`.
- **No DOM, no fetch, no globals.** Tests run in pure Node. Anything you can't test in Node → test via the preview workflow, not here.

## Canonical shape

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { foo } from '../os/.../foo.js';

describe('foo', () => {
  test('does the thing', () => {
    assert.equal(foo(1), 2);
  });

  test('rejects bad input', () => {
    assert.equal(foo(null), null);
  });
});
```

See `tests/game-shared.test.js`, `tests/tarneeb-rules.test.js`, `tests/solitaire-engine.test.js` for the established pattern.

## What requires a test

**Must have tests:**

- Game engines (state, rules, moves, deal, scoring). Target 95%+ branch coverage.
- Reducers and any function that takes state → returns state.
- Pure parsers and formatters (date, duration, currency).
- Storage migrations (fixture old shape, assert new shape).
- Security-adjacent code (URL sanitizer, HTML escaper).

**Must not have tests (too brittle, test via preview):**

- Pure DOM construction / render output. The preview workflow catches regressions here; snapshot tests rot.
- Animations, timing, pointer interactions.
- CSS.

## Fixture pattern

Small fixtures inline. Large fixtures in `tests/fixtures/<name>.json`, loaded via `readFileSync(new URL('./fixtures/foo.json', import.meta.url))`.

Never hit the network from a test. If you need to simulate a service response, fixture the response.

## Determinism

Tests must be deterministic. For any code using RNG, pass a seeded RNG (`seededMulberry32(seed)` from `os/apps/games/shared/rng.js`) and assert on specific outputs. Never assert on `Math.random()` output.

For time, pass a fixed `Date` or inject a `now()` function — don't call `Date.now()` in test-relevant paths.

## Anti-patterns

- A test that always passes (missing `assert`, caught-and-swallowed errors).
- A test whose name describes the implementation ("calls foo internally") instead of behavior.
- Sharing mutable state across tests.
- Testing private helpers. Test the public behavior; if you can't reach a helper through public API, delete it.
- Tests that sleep (`setTimeout` in a test body). Redesign so time is injected.

## Coverage

Not enforced automatically. The expectation: on a new engine, if you can't look at the diff and see a test per public function + edge cases (empty, single, max, invalid), you're not done.

## When you break a test

Don't comment it out. Don't `skip` it. Understand why it broke — usually a real regression. If the test was wrong, fix the test in the same commit as the behavior change, and say so in the commit message.
