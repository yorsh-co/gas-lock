# Changelog

---

## [Unreleased]

### Added

- `GasLock.withLock(scope, callback, options?)` — reentrancy-safe wrapper around `LockService.get{Script,Document,User}Lock()`
- `GasLock.isHeld(scope)` — check whether a scope is already held in the current execution
- `GasLock.getLock(scope)` — resolves a tracked `Lock` handle without acquiring it, for callers needing `tryLock`'s non-blocking, fail-fast semantics instead of `withLock`'s blocking `waitLock` (e.g. a rate limiter). The handle shares the held-scope registry with `withLock`: acquiring a scope that is already held joins it without calling `LockService`, only a handle that really acquired the lock releases it, and an owned scope is visible to `isHeld` and nested `withLock` calls. Returns `null` when `LockService` declines to provide a lock
- Singleton namespace tracking held scopes per execution; nested calls for an already-held scope reuse it instead of re-acquiring
- `withLock` detects a lock released outside GasLock (e.g. a direct `releaseLock()` on a `LockService` handle) and throws instead of silently finishing an unprotected critical section; an error thrown by the callback takes precedence
- Clear, actionable error (instead of a raw null-reference) when `LockService` returns no lock for a requested scope
- Vitest test suite with an in-memory `LockService` mock

### Changed

- Releases are published with [`gas-dev-release`](https://github.com/yorsh-co/gas-dev-release) instead of `scripts/release.sh`, which adds preflight checks (clean tree, `v<version>` tag at `HEAD`, build present, release tag free locally and on origin), syncs with `origin/dist`, pushes the branch and tag atomically and stops shipping the empty `gas-lock.types.js`
- Tags use a `v` prefix: versions are tagged `vX.Y.Z` and releases `dist/vX.Y.Z`
- Lint, TypeScript and Prettier configuration and the test loader come from `gas-dev-config`
- Dependabot groups development dependencies into one weekly pull request
- `npm run typecheck` and ESLint also cover `test/` through `tsconfig.test.json`; `npm run check` runs the test suite

### Fixed

- Inherited `Object.prototype` keys (`toString`, `constructor`, `hasOwnProperty`, `__proto__`) are rejected as unknown scopes by `withLock` and `getLock`, instead of failing with a `waitLock is not a function` error or returning a non-lock value
- The error for a missing lock names the requested scope, and shows the `document` context hint only for `document` scope
