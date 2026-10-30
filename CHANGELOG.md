# Changelog

---

## [Unreleased]

### Added

- Apps Script tests in `gas-test/`, run with gas-dev-config's `gas-test` (`npm run test:gas:build`, `npm run test:gas`)
- The release `package.json` carries `gasLibrary` load-order metadata for gas-dev-bundle

### Changed

- Load order is read from `gasDevConfig.loadOrder` instead of being duplicated in the test harness
- Bumped gas-dev-config to ^1.4.0 and gas-dev-release to ^1.1.0

### Fixed

- The Vitest `LockService` mock now matches Apps Script: a bare `releaseLock()` is a no-op and `hasLock()` reports the execution's ownership; the lost-lock tests exercise a nested acquire-and-release
- Docs state that only a handle that acquired the lock releases it, correcting the 1.0.0 wording

---

## [1.1.0] - 2026-10-28

### Added

- Canonical peer type declarations in `peer/gas-lock.peer.types.d.ts`, for consuming gas-\* libraries to copy into `src/internal/` and type-check `GasLock` standalone without vendoring the source

---

## [1.0.0] - 2026-10-27

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

### Docs

- README describes the real `LockService` hazard — a nested release ends the outer critical section early — instead of a deadlock
- README documents the tracked `getLock` handle and the lost-lock error
- New Limitations section: cooperating callers only, synchronous callbacks only and lock ordering across executions
- `filePushOrder` example no longer lists `gas-lock.types.js` and notes the pushed-project path
