---
name: storage
description: Deep context for os/services/appStorage.js and kernel.storage. Load when adding a persistent key, changing a key's shape, writing a migration, or reviewing quota-risky code. Covers the key registry, storageClass + syncPolicy fields, validators, versions, and the "no app touches localStorage directly" invariant.
---

# SKILL: Storage

**When to read:** any task that adds or changes a persistent value in YancoTab.

## The invariant

> No app, service, or utility writes YancoTab persistent state except through `kernel.storage`.

Local storage (`chrome.storage.local` / `localStorage` fallback) is the canonical runtime store. Remote sync (`chrome.storage.sync`) is background replication — **not a read path.** Reads always go to local; sync pushes local → remote on change.

## The key registry

Every persistent key is declared in the `REGISTRY` object in `os/services/appStorage.js`:

```js
yancotab_myfeature: {
  storageClass: 'preferences' | 'userdata' | 'cache',
  syncPolicy: 'always' | 'never' | 'on-demand',
  version: 1,
  default: <value>,
  validate: (v) => <boolean>,
  migrate: (oldValue, oldVersion) => newValue,  // optional
},
```

**Rules:**

- Keys are `yancotab_<snake_case>` prefixed. No exceptions.
- `storageClass`:
  - `preferences` — small, user-settable (theme, 24h format, metric units). Sync-friendly.
  - `userdata` — the user's content (notes, todos, files). May be large; sync selectively.
  - `cache` — recomputable (weather snapshot, icon cache). Never sync.
- `syncPolicy`: `always` for preferences; usually `never` for userdata until we have a conflict-resolution story.
- `validate` is not optional. A missing/malformed value from disk should fail closed → fall back to `default`.
- `version` starts at 1. Bump on shape change and provide `migrate()`.

## Reading and writing

```js
const theme = await kernel.storage.get('yancotab_theme_mode'); // returns default if unset
await kernel.storage.set('yancotab_theme_mode', 'light');
```

Unregistered keys throw in dev and log a warning in prod. Register first, then use.

## Migrations

When a key's shape changes:

1. Bump `version` in the registry.
2. Write `migrate: (old, oldVersion) => newShape`.
3. Test with a fixture of the old shape.
4. Never mutate the old data in place — return a new object.

Old keys that are being replaced (e.g. the original Solitaire's localStorage key → the new `yancotab_solitaire_state`): migrate on first read of the new key, then delete the old one.

## Quota

Chrome `storage.local` gives ~5 MB by default (more with `unlimitedStorage`, which we don't request). Rules:

- **Any path that can write unbounded data is a bug.** Cap lists, paginate history, prune caches.
- Big blobs (images, PDFs) go to IndexedDB via `fileSystemService.js`, not to `kernel.storage`.
- On quota error, the toast system reports; the call fails cleanly. Don't swallow.

## Anti-patterns

- `localStorage.setItem(…)` anywhere outside the storage service. It bypasses sync, validation, and migration.
- Storing a blob in `kernel.storage`. Put it in the file system service (IndexedDB).
- A key without a `validate` function. Corrupt data will crash the app on next read.
- Silent migrations (no version bump). The next change will conflict.
- Caching user data under a `cache` storageClass. Cache is for things that can be rebuilt.

## Testing

Storage changes warrant a test. Fixture an old-shape value, run the service, assert the new shape. See `tests/file-system-service.test.js` for the pattern.
