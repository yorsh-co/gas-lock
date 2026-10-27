# Changelog

---

## [Unreleased]

### Added

- `GasLock.withLock(scope, callback, options?)` — reentrancy-safe wrapper around `LockService.get{Script,Document,User}Lock()`
- `GasLock.isHeld(scope)` — check whether a scope is already held in the current execution
- `GasLock.getLock(scope)` — resolves the raw `Lock` without acquiring it, for callers needing `tryLock`'s non-blocking, fail-fast semantics instead of `withLock`'s blocking `waitLock` (e.g. a rate limiter). Returns `null` when `LockService` declines to provide a lock. Not reentrancy-tracked: a lock taken this way is invisible to the held-scope registry
- Singleton namespace tracking held scopes per execution; nested calls for an already-held scope reuse it instead of re-acquiring
- Clear, actionable error (instead of a raw null-reference) when `LockService` returns no lock for a requested scope

### Changed

- Releases are published with [`gas-dev-release`](https://github.com/yorsh-co/gas-dev-release) instead of `scripts/release.sh`, which adds preflight checks (clean tree, `v<version>` tag at `HEAD`, build present, release tag free locally and on origin), syncs with `origin/dist`, pushes the branch and tag atomically and stops shipping the empty `gas-lock.types.js`
- Tags use a `v` prefix: versions are tagged `vX.Y.Z` and releases `dist/vX.Y.Z`
